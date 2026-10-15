import type { ProgramDay, ProgramSlot, Session } from '../db/types';
import { requireExercise } from '../domain/catalog';
import { shortenDay } from '../domain/generator';
import { remapDayForGym } from '../domain/gymEdit';
import { loadSourceFor } from '../domain/gym';
import { snapLoad } from '../domain/loads';
import { blockPosition, sessionOn } from '../domain/schedule';
import type { BodyArea, MuscleId } from '../domain/types';
import { toISODate } from '../lib/format';
import { inSessionOffer, restAdvice } from './inSession';
import { T } from './knowledge';
import {
  DAY_MS,
  exposuresByExercise,
  fatigueSignals,
  liftingSessions,
  normalExposures,
  plannedSessionsPerWeek,
  returnState,
  sessionsInWeek,
  streakWeeks,
  weekStart,
  weeklySetsDone,
} from './measures';
import { adjustedPriority, decisions, dismissalsByRule, isSuppressed } from './memory';
import { fatigueHold, missedSessionRec, muscleBands, programRecommendations, repeatedPainAreas, returnRec, type ProgramCtx } from './program';
import { missShareBySession, planNextExposure, type ExercisePlan, type SlotTarget } from './progression';
import { makeRec } from './rec';
import type {
  CoachInput,
  Exposure,
  FatigueSignals,
  Moment,
  Recommendation,
  ReturnState,
  SessionPlan,
  SessionVariant,
  SlotPlan,
  WeeklyReview,
  Win,
} from './types';
import { comebackWins, fatLossWin, sessionRecords, streakWin, trendWins } from './wins';

/**
 * The Coach engine: one entry point per moment (today, in-session, post-session, weekly), all
 * pure. The app keeps the results in one store that every screen reads, so Today, the workout,
 * the summary and the Coach tab can't contradict each other.
 */

export interface Prepared {
  input: CoachInput;
  now: number;
  exposures: Map<string, Exposure[]>;
  fatigue: FatigueSignals;
  ret: ReturnState & { breakStartedAt?: number };
  painAreas: BodyArea[];
  missShare: Map<string, number>;
  hold: boolean;
}

export function prepare(input: CoachInput, now: number): Prepared {
  const sessions = input.sessions.filter((s) => s.status === 'completed' && s.startedAt <= now);
  const exposures = exposuresByExercise(sessions);
  const fatigue = fatigueSignals(sessions, exposures, now, input.settings.readinessCheck);
  return {
    input: { ...input, sessions },
    now,
    exposures,
    fatigue,
    ret: returnState(sessions, now),
    painAreas: repeatedPainAreas(sessions, now),
    missShare: missShareBySession(exposures),
    hold: fatigueHold(fatigue, input.program, now),
  };
}

function programCtx(p: Prepared): ProgramCtx {
  const { profile, program, gym, measurements, log } = p.input;
  return { profile, program, gym, sessions: p.input.sessions, exposures: p.exposures, measurements, log, fatigue: p.fatigue, now: p.now };
}

/** Keeps what shouldn't be hidden, demotes repeatedly dismissed advice, most important first. */
export function visible(recs: Recommendation[], p: Prepared): Recommendation[] {
  const dismissals = dismissalsByRule(p.input.log);
  const seen = new Set<string>();
  return recs
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return !isSuppressed(r, p.input.log, p.input.sessions, p.now);
    })
    .map((r) => ({ ...r, priority: adjustedPriority(r, dismissals) }))
    .sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------- per exercise

export function planExercise(p: Prepared, exerciseId: string, target: SlotTarget, readinessHold = false): ExercisePlan | null {
  const history = p.exposures.get(exerciseId) ?? [];
  const stresses = requireExercise(exerciseId).stresses;
  const noIncrease = stresses.some((a) => p.painAreas.includes(a))
    ? 'pain-area'
    : readinessHold
      ? 'readiness'
      : p.hold
        ? 'fatigue'
        : p.ret.noIncrease
          ? 'return'
          : undefined;
  return planNextExposure(
    exerciseId,
    target,
    history,
    { gym: p.input.gym, goal: p.input.profile.goal, experience: p.input.profile.experience, now: p.now },
    { noIncrease, sessionMissShare: p.missShare },
  );
}

export function exerciseRec(plan: ExercisePlan, where: { dayId?: string; slotId?: string } = {}): Recommendation {
  const actions: Recommendation['actions'] = plan.actionable ? (plan.swapTo ? ['apply', 'swap'] : ['apply', 'dismiss']) : [];
  return makeRec({
    rule: plan.rule,
    variant: plan.variant,
    type: plan.safety ? 'safety' : 'progress',
    priority: plan.safety ? 0 : plan.actionable ? 2 : 6,
    subject: { exerciseId: plan.exerciseId, ...where },
    subjectKey: plan.exerciseId,
    situation: [plan.lastSessionId, plan.load, plan.repsLow, plan.repsHigh, plan.beat],
    change: {
      kind: 'next-exposure',
      exerciseId: plan.exerciseId,
      from: plan.from,
      to: plan.load,
      repsLow: plan.repsLow,
      repsHigh: plan.repsHigh,
      beat: plan.beat,
      rir: plan.rir,
      swapTo: plan.swapTo,
    },
    facts: plan.facts,
    confidence: plan.confidence,
    basis: plan.basis,
    actions,
    safety: plan.safety,
  });
}

/** The slot for an exercise in the current program (by slot id first). */
export function findSlot(p: Prepared, slotId: string | undefined, exerciseId: string): { day: ProgramDay; slot: ProgramSlot } | null {
  const days = p.input.program.days;
  for (const day of days) {
    const slot = slotId ? day.slots.find((s) => s.id === slotId && s.exerciseId === exerciseId) : undefined;
    if (slot) return { day, slot };
  }
  for (const day of days) {
    const slot = day.slots.find((s) => s.exerciseId === exerciseId);
    if (slot) return { day, slot };
  }
  return null;
}

// ---------------------------------------------------------------- today

export interface PlanOptions {
  variant?: SessionVariant;
  /** "Short on time": fit into this many minutes (G2). */
  minutes?: number;
}

/** How the Coach would adjust a day's session, and the recommendations behind it. */
export function planSession(p: Prepared, day: ProgramDay, options: PlanOptions = {}): { plan: SessionPlan; recommendations: Recommendation[] } {
  const { gym, log } = p.input;
  const position = blockPosition(p.input.program, new Date(p.now));
  const lighterWeek = position.lighterWeek;
  const decided = decisions(log);
  // I3 · In a gym the plan wasn't built for, exercises it can't do become the best stand-in.
  const remapped = remapDayForGym(day, gym, p.input.profile.experience).day;
  let working = remapped;
  if (options.variant === 'short') working = shortenDay(remapped, gym, options.minutes ?? 30, { keyLiftsOnly: options.minutes === undefined }).day;
  else if (options.minutes) working = shortenDay(remapped, gym, options.minutes).day;

  const slots: Record<string, SlotPlan> = {};
  const recommendations: Recommendation[] = [];
  for (const slot of working.slots) {
    const plan = planExercise(p, slot.exerciseId, slot, options.variant === 'lighter');
    const slotPlan: SlotPlan = { slotId: slot.id, exerciseId: slot.exerciseId };
    const exercise = requireExercise(slot.exerciseId);
    const model = loadSourceFor(exercise, gym)?.model;
    if (plan) {
      if (plan.beat !== undefined) slotPlan.beat = plan.beat;
      if (!plan.actionable && plan.rule === 'D' && plan.load !== plan.from) slotPlan.auto = { load: plan.load, reason: 'coach' };
      if (plan.actionable) {
        const rec = exerciseRec(plan, { dayId: day.id, slotId: slot.id });
        const swapped = decided.get(`${rec.id}:swap`) === 'applied';
        slotPlan.offer = {
          recommendationId: rec.id,
          load: plan.load,
          repsLow: plan.repsLow,
          repsHigh: plan.repsHigh,
          beat: plan.beat,
          rir: plan.rir,
          swapTo: plan.swapTo,
          decided: swapped ? 'used' : decided.get(rec.id),
        };
        if (swapped) slotPlan.offer.load = null;
        recommendations.push(rec);
      }
    }

    const lastTop = (() => {
      const list = normalExposures(p.exposures.get(slot.exerciseId) ?? []);
      return list[list.length - 1]?.top ?? null;
    })();
    const safetyOffer = plan?.safety === true;
    if (lighterWeek) {
      // F4 · Same exercises, about 40% fewer sets, about 10% lighter, stopping 3+ short.
      const base = plan?.from ?? lastTop;
      slotPlan.auto = {
        sets: Math.max(T.lighterWeek.minSets, Math.round(slot.sets * T.lighterWeek.setFactor)),
        load: base !== null && model ? (snapLoad(model, base * T.lighterWeek.loadFactor, 'down') ?? base) : undefined,
        rir: Math.max(slot.rir ?? 2, T.lighterWeek.rir),
        reason: 'lighter-week',
      };
      if (!safetyOffer) delete slotPlan.offer;
      delete slotPlan.beat;
    } else if (p.ret.tier >= 2 || (p.ret.tier === 1 && p.ret.setsDrop > 0)) {
      // G3 · Coming back: a lighter first session, then a short ramp to the pre-break numbers.
      const pre = normalExposures(p.exposures.get(slot.exerciseId) ?? []).filter((e) => e.at <= (p.ret.breakStartedAt ?? 0));
      const preTop = pre[pre.length - 1]?.top ?? null;
      let load: number | null | undefined;
      if (preTop !== null && model) {
        const ramp = snapLoad(model, preTop * p.ret.loadFactor, 'down') ?? preTop;
        load = p.ret.sessionsSince === 0 ? ramp : Math.min(preTop, Math.max(ramp, plan?.load ?? ramp));
      }
      slotPlan.auto = {
        load,
        sets: Math.max(1, slot.sets - p.ret.setsDrop),
        rir: p.ret.rir !== undefined ? Math.max(slot.rir ?? 2, p.ret.rir) : undefined,
        calibrate: p.ret.recalibrate || undefined,
        reason: 'return',
      };
      if (!safetyOffer) delete slotPlan.offer;
    } else if (options.variant === 'lighter') {
      // C1 · Lighter day: one set fewer, no weight increases.
      slotPlan.auto = { sets: Math.max(1, slot.sets - 1), reason: 'readiness' };
    }
    slots[slot.id] = slotPlan;
  }

  const variant: SessionPlan['variant'] = options.variant;
  return {
    plan: { dayId: day.id, variant, lighterWeek, returnTier: p.ret.tier, slots, day: working === day ? undefined : working },
    recommendations: recommendations.filter((r) => Object.values(slots).some((s) => s.offer?.recommendationId === r.id)),
  };
}

export interface TodayOutput {
  day: ProgramDay | null;
  plan: SessionPlan | null;
  /** Cards for Today, most important first (already filtered for decisions and repetition). */
  recommendations: Recommendation[];
  fatigue: FatigueSignals;
  returnState: ReturnState;
  lighterWeek: boolean;
}

export function coachToday(input: CoachInput, now: number, dayOverride?: ProgramDay | null): TodayOutput {
  const p = prepare(input, now);
  const day = dayOverride === undefined ? sessionOn(input.program, new Date(now)) : dayOverride;
  const planned = day ? planSession(p, day) : null;
  const ctx = programCtx(p);
  const program = programRecommendations(ctx).filter((r) => r.rule === 'F2' || (r.rule === 'J1' && r.safety));
  const recs = [
    returnRec(p.ret, now),
    missedSessionRec(ctx),
    ...program,
    ...(planned?.recommendations ?? []),
  ].filter((r): r is Recommendation => r !== null);
  return {
    day,
    plan: planned?.plan ?? null,
    recommendations: visible(recs, p),
    fatigue: p.fatigue,
    returnState: p.ret,
    lighterWeek: blockPosition(input.program, new Date(now)).lighterWeek,
  };
}

// ---------------------------------------------------------------- in-session

export function coachInSession(input: CoachInput, session: Session, entryIndex: number, now: number) {
  const p = prepare(input, now);
  const entry = session.entries[entryIndex];
  if (!entry) return { offer: null, rest: null };
  const history = p.exposures.get(entry.exerciseId) ?? [];
  const offer = inSessionOffer(session, entryIndex, history, { gym: input.gym, experience: input.profile.experience, now });
  const decided = offer ? decisions(input.log).get(offer.id) : undefined;
  return { offer: offer && !decided ? offer : null, rest: restAdvice(session, entryIndex) };
}

// ---------------------------------------------------------------- after a session

export interface ReviewOutput {
  wins: Win[];
  /** What changes next time, per exercise trained (Apply), plus the number to beat on the main lift. */
  next: Recommendation[];
  insight: Recommendation | null;
}

const TYPE_OF_RULE: Record<string, Recommendation['type']> = { T: 'technique', B3: 'recovery', G4: 'consistency', K: 'progress' };

export function coachReview(input: CoachInput, sessionId: string, now: number): ReviewOutput {
  const p = prepare(input, now);
  const session = p.input.sessions.find((s) => s.id === sessionId);
  if (!session) return { wins: [], next: [], insight: null };
  const wins = [...sessionRecords(sessionId, p.exposures), ...comebackWins(sessionId, p.input.sessions, p.exposures)];
  const week = sessionsInWeek(liftingSessions(p.input.sessions), weekStart(session.startedAt));
  const planned = plannedSessionsPerWeek(input.program);
  if (planned > 0 && week.length === planned && week[week.length - 1]?.id === sessionId) {
    wins.push({ id: `all-done:${toISODate(weekStart(session.startedAt))}`, kind: 'all-done', facts: { sessions: planned, streak: streakWeeks(input.program, p.input.sessions, now, input.profile.goal === 'general') } });
  }

  const next: Recommendation[] = [];
  let mainBeat: Recommendation | null = null;
  for (const entry of session.entries) {
    if (!entry.sets.some((s) => s.kind === 'work' && s.reps > 0)) continue;
    const found = findSlot(p, entry.slotId, entry.exerciseId);
    const target: SlotTarget = found
      ? found.slot
      : { repsLow: entry.target?.repsLow ?? 8, repsHigh: entry.target?.repsHigh ?? 12, rir: entry.target?.rir, sets: entry.target?.sets ?? 3, role: entry.role };
    const plan = planExercise(p, entry.exerciseId, target);
    if (!plan) continue;
    const rec = exerciseRec(plan, { dayId: found?.day.id, slotId: found?.slot.id });
    if (plan.actionable || plan.rule === 'A1' || plan.safety) next.push(rec);
    else if (!mainBeat && (entry.role === 'main' || !found) && plan.beat !== undefined) mainBeat = rec;
  }
  if (mainBeat) next.push(mainBeat);

  return { wins, next: visible(next, p), insight: reviewInsight(p, session) };
}

/** One insight per review, rotating which kind leads (proposal L1 and section 5). */
function reviewInsight(p: Prepared, session: Session): Recommendation | null {
  const { log } = p.input;
  const candidates: Recommendation[] = [];

  // Technique: a cue for an exercise done for the first time, not repeated within 4 weeks.
  for (const entry of session.entries) {
    const list = p.exposures.get(entry.exerciseId) ?? [];
    if (list.length !== 1 || list[0]!.sessionId !== session.id) continue;
    const exercise = requireExercise(entry.exerciseId);
    const cueRec = (cue: string) =>
      makeRec({
        rule: 'T',
        variant: 'cue',
        type: 'technique',
        priority: 5,
        subject: { exerciseId: exercise.id },
        subjectKey: exercise.id,
        situation: [cue],
        change: { kind: 'info' },
        facts: { exercise: exercise.name, cue: cue.replace(/\.$/, '') },
        confidence: 'medium',
        basis: 1,
        actions: [],
      });
    const recent = new Set(
      log
        .filter((e) => e.kind === 'shown' && e.key === `T:${exercise.id}` && p.now - e.at < T.memory.cueRepeatDays * DAY_MS)
        .map((e) => e.fingerprint),
    );
    const fresh = exercise.form.cues.map(cueRec).find((r) => !recent.has(r.fingerprint));
    if (!fresh) continue;
    candidates.push(fresh);
    break;
  }

  // Recovery: rests on big lifts noticeably shorter than planned.
  const short: { name: string; taken: number; planned: number }[] = [];
  for (const entry of session.entries) {
    const planned = entry.target?.restSec;
    const exercise = requireExercise(entry.exerciseId);
    if (!planned || (exercise.restClass !== 'heavy' && exercise.restClass !== 'compound')) continue;
    const taken = entry.sets.map((s) => s.restTakenSec).filter((t): t is number => typeof t === 'number' && t > 0 && t < 900);
    if (taken.length < 2) continue;
    const average = taken.reduce((s, t) => s + t, 0) / taken.length;
    if (average < planned - 30) short.push({ name: exercise.name, taken: Math.round(average), planned });
  }
  if (short[0]) {
    candidates.push(
      makeRec({
        rule: 'B3',
        variant: 'session',
        type: 'recovery',
        priority: 5,
        subject: {},
        subjectKey: 'rest',
        situation: [session.id],
        change: { kind: 'info' },
        facts: { exercise: short[0].name, taken: short[0].taken, planned: short[0].planned },
        confidence: 'medium',
        basis: 1,
        actions: [],
      }),
    );
  }

  // Consistency: where the week stands.
  const plannedCount = plannedSessionsPerWeek(p.input.program);
  const done = sessionsInWeek(liftingSessions(p.input.sessions), weekStart(session.startedAt)).length;
  if (plannedCount > 0) {
    candidates.push(
      makeRec({
        rule: 'G4',
        variant: done >= plannedCount ? 'week-done' : 'week',
        type: 'consistency',
        priority: 6,
        subject: {},
        subjectKey: `week-${toISODate(weekStart(session.startedAt))}`,
        situation: [done, plannedCount],
        change: { kind: 'info' },
        facts: { done, planned: plannedCount, left: Math.max(0, plannedCount - done) },
        confidence: 'high',
        basis: done,
        actions: [],
      }),
    );
  }

  // Progress: a lift trending up over the last weeks.
  const trend = trendWins(p.exposures, p.now).find((w) => session.entries.some((e) => e.exerciseId === w.exerciseId));
  if (trend) {
    candidates.push(
      makeRec({
        rule: 'K',
        variant: 'trend',
        type: 'progress',
        priority: 5,
        subject: { exerciseId: trend.exerciseId },
        subjectKey: trend.exerciseId!,
        situation: [trend.facts.to],
        change: { kind: 'info' },
        facts: trend.facts,
        confidence: 'medium',
        basis: Number(trend.facts.weeks),
        actions: [],
      }),
    );
  }

  const pool = visible(candidates, p);
  if (!pool.length) return null;
  // Rotate: the kind shown least recently leads.
  const lastShown = (type: string) =>
    log.filter((e) => e.kind === 'shown' && TYPE_OF_RULE[e.ruleId] === type).reduce((m, e) => Math.max(m, e.at), 0);
  return [...pool].sort((a, b) => lastShown(a.type) - lastShown(b.type) || a.priority - b.priority)[0]!;
}

// ---------------------------------------------------------------- weekly

export interface WeeklyOutput {
  review: WeeklyReview;
  recommendations: Recommendation[];
  wins: Win[];
}

export function coachWeekly(input: CoachInput, now: number): WeeklyOutput {
  const p = prepare(input, now);
  const ctx = programCtx(p);
  const monday = weekStart(now);
  const week = sessionsInWeek(p.input.sessions, monday);
  const lifting = liftingSessions(week);
  const done = weeklySetsDone(p.input.sessions, monday);
  const bands = muscleBands(input.program, input.profile.experience);
  const muscles = [...bands].map(([muscle, { planned, band }]) => ({ muscle: muscle as MuscleId, planned, done: Math.round((done.get(muscle) ?? 0) * 10) / 10, band }));

  const keyIds = [...new Set(input.program.days.flatMap((d) => d.slots.filter((s) => s.role === 'main').map((s) => s.exerciseId)))];
  const fourWeeksAgo = now - 28 * DAY_MS;
  const keyLifts = keyIds
    .map((exerciseId) => {
      const list = normalExposures(p.exposures.get(exerciseId) ?? []).filter((e) => e.e1rm > 0);
      const last = list[list.length - 1];
      if (!last) return null;
      const then = [...list].reverse().find((e) => e.at <= fourWeeksAgo) ?? list[0]!;
      return { exerciseId, e1rm: Math.round(last.e1rm), change: then === last ? null : Math.round(last.e1rm - then.e1rm), exposures: list.length };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const records = lifting.flatMap((s) => sessionRecords(s.id, p.exposures));
  const wins = [
    ...records,
    ...trendWins(p.exposures, now).slice(0, 2),
    streakWin(input.program, p.input.sessions, input.profile, now),
    fatLossWin(input.profile, input.measurements, p.exposures, now),
  ].filter((w): w is Win => w !== null);

  const recs = [returnRec(p.ret, now), missedSessionRec(ctx), ...programRecommendations(ctx)].filter((r): r is Recommendation => r !== null);
  return {
    review: {
      weekStart: toISODate(monday),
      planned: plannedSessionsPerWeek(input.program),
      done: lifting.length,
      workSets: lifting.reduce((n, s) => n + s.entries.reduce((m, e) => m + e.sets.filter((x) => x.kind === 'work' && x.reps > 0).length, 0), 0),
      streakWeeks: streakWeeks(input.program, p.input.sessions, now, input.profile.goal === 'general'),
      muscles,
      keyLifts,
      fatigue: p.fatigue,
      records,
    },
    recommendations: visible(recs, p),
    wins,
  };
}

// ---------------------------------------------------------------- one entry point

export function evaluateCoach(
  input: CoachInput,
  options: { now: number; moment: Moment; sessionId?: string; entryIndex?: number },
): { recommendations: Recommendation[]; wins: Win[]; plan?: SessionPlan | null; review?: WeeklyReview } {
  const { now, moment } = options;
  if (moment === 'today') {
    const today = coachToday(input, now);
    return { recommendations: today.recommendations, wins: [], plan: today.plan };
  }
  if (moment === 'in-session') {
    const session = input.active;
    if (!session || options.entryIndex === undefined) return { recommendations: [], wins: [] };
    const { offer } = coachInSession(input, session, options.entryIndex, now);
    return { recommendations: offer ? [offer] : [], wins: [] };
  }
  if (moment === 'post-session') {
    const review = coachReview(input, options.sessionId ?? '', now);
    return { recommendations: [...review.next, ...(review.insight ? [review.insight] : [])], wins: review.wins };
  }
  const weekly = coachWeekly(input, now);
  return { recommendations: weekly.recommendations, wins: weekly.wins, review: weekly.review };
}

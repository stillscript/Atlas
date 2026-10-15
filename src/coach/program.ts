import type { CoachLogEntry, Experience, Goal, Gym, Measurement, Profile, Program, ProgramDay, ProgramSlot, Session } from '../db/types';
import { PROGRAMMING, patternById, requireExercise } from '../domain/catalog';
import { loadSourceFor } from '../domain/gym';
import { snapLoad } from '../domain/loads';
import { swapOptions } from '../domain/resolver';
import { addDays, blockPosition, sessionOn, weekdayIndex } from '../domain/schedule';
import { loadForReps } from '../domain/strength';
import type { BodyArea, MuscleId } from '../domain/types';
import { muscleName, volumeBand, weeklySets } from '../domain/volume';
import { toISODate } from '../lib/format';
import { T } from './knowledge';
import { confidenceFor, DAY_MS, normalExposures, weekStart, weightTrend } from './measures';
import { makeRec } from './rec';
import type { Exposure, FatigueSignals, Recommendation, ReturnState } from './types';

/**
 * Program-level rules: plateaus (D), weekly volume and balance (E), fatigue and lighter weeks (F),
 * missed sessions and breaks (G), fat-loss weight trend and protein (H3), repeated pain (J2).
 * Every program change is a recommendation with Apply; nothing here edits the program.
 */

export interface ProgramCtx {
  profile: Profile;
  program: Program;
  gym: Gym;
  sessions: Session[];
  exposures: Map<string, Exposure[]>;
  measurements: Measurement[];
  log: CoachLogEntry[];
  fatigue: FatigueSignals;
  now: number;
}

const mid = (low: number, high: number) => Math.round((low + high) / 2);

function slotsOf(program: Program): { day: ProgramDay; slot: ProgramSlot }[] {
  const scheduled = new Set(program.schedule.filter((d): d is string => d !== null));
  return program.days.filter((d) => scheduled.has(d.id)).flatMap((day) => day.slots.map((slot) => ({ day, slot })));
}

// ---------------------------------------------------------------- D · plateau

export function isPlateau(list: Exposure[], now: number): boolean {
  const normal = normalExposures(list).filter((e) => e.top !== null && !e.calibrating);
  const n = T.plateau.exposures;
  if (normal.length < n + 1 || confidenceFor(normal, now) === 'low') return false;
  const recent = normal.slice(-n);
  const before = normal.slice(0, -n);
  // At the top of the range, the lift is ready to move up (A2/A3), not stuck.
  const last = recent[recent.length - 1]!;
  if (last.sets.filter((s) => s.load === last.top).every((s) => s.reps >= last.repsHigh)) return false;
  const bestBefore = Math.max(...before.map((e) => e.e1rm));
  const bestRecent = Math.max(...recent.map((e) => e.e1rm));
  if (bestRecent > bestBefore * (1 + T.plateau.tolerance)) return false;
  // Any load increase, or more reps at the same load, counts as progress.
  for (let i = 1; i < recent.length; i++) {
    const a = recent[i - 1]!;
    const b = recent[i]!;
    if ((b.top ?? 0) > (a.top ?? 0)) return false;
    const reps = (e: Exposure) => e.sets.filter((s) => s.load === e.top).reduce((sum, s) => sum + s.reps, 0);
    if (b.top === a.top && reps(b) > reps(a)) return false;
  }
  return true;
}

function shownBefore(log: CoachLogEntry[], key: string): boolean {
  return log.some((e) => e.kind === 'shown' && e.key === key);
}

/** A change under this key was applied in the last `days` days. */
function appliedWithin(log: CoachLogEntry[], key: string, now: number, days: number): boolean {
  return log.some((e) => e.kind === 'decision' && e.decision === 'applied' && e.key === key && now - e.at < days * DAY_MS);
}

/** At most this many plateau changes at once: change a few things, see what works, then the next. */
const MAX_PLATEAU_CHANGES = 2;
const ROLE_ORDER = { main: 0, secondary: 1, accessory: 2 } as const;

function plateauRecs(ctx: ProgramCtx, bandStatus: Map<MuscleId, 'below' | 'above' | 'in'>): Recommendation[] {
  const { profile, gym, now } = ctx;
  const recs: Recommendation[] = [];
  const seen = new Set<string>();
  // Key lifts first, so the changes that matter most come first.
  const ordered = [...slotsOf(ctx.program)].sort((a, b) => ROLE_ORDER[a.slot.role ?? 'accessory'] - ROLE_ORDER[b.slot.role ?? 'accessory']);
  for (const { day, slot } of ordered) {
    if (recs.length >= MAX_PLATEAU_CHANGES) break;
    if (seen.has(slot.exerciseId)) continue;
    seen.add(slot.exerciseId);
    const list = ctx.exposures.get(slot.exerciseId) ?? [];
    if (!isPlateau(list, now)) continue;
    const exercise = requireExercise(slot.exerciseId);
    const normal = normalExposures(list);
    const last = normal[normal.length - 1]!;
    const best = Math.max(...normal.map((e) => e.e1rm));
    const stalledFor = T.plateau.exposures;
    const facts = {
      exercise: exercise.name,
      e1rm: Math.round(best),
      sessions: stalledFor,
      range: `${slot.repsLow}–${slot.repsHigh}`,
      lastLoad: last.top ?? 0,
    };
    const common = {
      rule: 'D' as const,
      type: 'programming' as const,
      priority: 3,
      subject: { exerciseId: slot.exerciseId, dayId: day.id, slotId: slot.id },
      confidence: confidenceFor(normal, now),
      basis: normal.length,
      situation: [last.sessionId, Math.round(best)],
    };

    // Beginners first get a technique cue for one exposure.
    const techniqueKey = `D:${slot.exerciseId}:technique`;
    if (profile.experience === 'beginner' && T.plateau.beginnerTechniqueFirst && !shownBefore(ctx.log, techniqueKey)) {
      recs.push(
        makeRec({
          ...common,
          variant: 'technique',
          subjectKey: `${slot.exerciseId}:technique`,
          type: 'technique',
          change: { kind: 'info' },
          actions: [],
          facts: { ...facts, cue: exercise.form.cues[0] ?? 'Lower slowly, with control.' },
        }),
      );
      continue;
    }
    if (ctx.fatigue.count >= 1 && ctx.fatigue.enoughData) {
      recs.push(makeRec({ ...common, variant: 'lighter', subjectKey: slot.exerciseId, change: { kind: 'lighter-week', action: 'now' }, actions: ['apply', 'dismiss'], facts }));
      continue;
    }
    if (normal.length >= T.plateau.sameRangeExposures) {
      const strength = profile.goal === 'strength';
      const [toLow, toHigh] = strength
        ? [Math.max(3, slot.repsLow - 2), Math.max(4, slot.repsHigh - 2)]
        : slot.repsHigh <= 10
          ? [12, 15]
          : [6, 10];
      const model = loadSourceFor(exercise, gym)?.model;
      const newLoad = model ? snapLoad(model, loadForReps(best, mid(toLow, toHigh), slot.rir ?? 2), 'down') : null;
      recs.push(
        makeRec({
          ...common,
          variant: 'range',
          subjectKey: slot.exerciseId,
          change: { kind: 'slot', dayId: day.id, slotId: slot.id, exerciseId: slot.exerciseId, reps: { fromLow: slot.repsLow, fromHigh: slot.repsHigh, toLow, toHigh } },
          actions: ['apply', 'dismiss'],
          facts: { ...facts, newRange: `${toLow}–${toHigh}`, newLoad: newLoad ?? '', weeks: 4 },
        }),
      );
      continue;
    }
    const swap = swapOptions(slot.exerciseId, gym, { experience: profile.experience, limit: 6 }).find((o) => o.samePattern);
    if (swap) {
      recs.push(
        makeRec({
          ...common,
          variant: 'swap',
          subjectKey: slot.exerciseId,
          change: { kind: 'slot', dayId: day.id, slotId: slot.id, exerciseId: slot.exerciseId, swapTo: swap.exercise.id },
          actions: ['apply', 'dismiss'],
          facts: { ...facts, swap: swap.exercise.name },
        }),
      );
      continue;
    }
    const muscle = exercise.primary[0];
    const status = muscle ? bandStatus.get(muscle) : undefined;
    if (status === 'below' || status === 'above') {
      const to = status === 'below' ? slot.sets + 1 : Math.max(1, slot.sets - 1);
      recs.push(
        makeRec({
          ...common,
          variant: status === 'below' ? 'sets-up' : 'sets-down',
          subjectKey: slot.exerciseId,
          change: { kind: 'slot', dayId: day.id, slotId: slot.id, exerciseId: slot.exerciseId, sets: { from: slot.sets, to } },
          actions: ['apply', 'dismiss'],
          facts: { ...facts, muscle: muscleName(muscle!).toLowerCase(), from: slot.sets, to },
        }),
      );
    }
  }
  return recs;
}

// ---------------------------------------------------------------- E · volume and balance

export function muscleBands(program: Program, experience: Experience): Map<MuscleId, { planned: number; band: [number, number] }> {
  const planned = weeklySets(program);
  const result = new Map<MuscleId, { planned: number; band: [number, number] }>();
  for (const muscle of [...PROGRAMMING.majorMuscles, ...PROGRAMMING.minorMuscles] as MuscleId[]) {
    const band = volumeBand(muscle, experience);
    if (band) result.set(muscle, { planned: Math.round((planned.get(muscle) ?? 0) * 10) / 10, band });
  }
  return result;
}

function volumeRecs(ctx: ProgramCtx, plateaued: Set<string>): Recommendation[] {
  const { program, profile, now } = ctx;
  if (now - program.createdAt < T.volume.minProgramDays * DAY_MS) return [];
  const recs: Recommendation[] = [];
  const bands = muscleBands(program, profile.experience);
  const slots = slotsOf(program);
  const weeksOfPlan = Math.max(2, Math.floor((now - program.createdAt) / (7 * DAY_MS)));
  const common = {
    rule: 'E1' as const,
    type: 'programming' as const,
    confidence: 'medium' as const,
    basis: weeksOfPlan,
    basisUnit: 'weeks' as const,
    actions: ['apply', 'dismiss'] as Recommendation['actions'],
  };

  for (const [muscle, { planned, band }] of bands) {
    // E4: one volume change per muscle per week, so weekly sets never ramp up too fast.
    if (appliedWithin(ctx.log, `E1:${muscle}`, now, 7)) continue;
    const targeting = slots.filter(({ slot }) => requireExercise(slot.exerciseId).primary.includes(muscle));
    if (planned < band[0]) {
      const pick = [...targeting]
        .filter(({ slot }) => slot.sets < PROGRAMMING.maxSetsPerSlot)
        .sort((a, b) => (a.slot.role === 'accessory' ? 0 : 1) - (b.slot.role === 'accessory' ? 0 : 1) || a.slot.sets - b.slot.sets)[0];
      if (!pick) continue;
      // E4: no more than ~20% more weekly sets at once (at least one).
      const add = Math.max(1, Math.min(band[0] - Math.floor(planned), Math.floor(planned * T.volume.rampLimit), 2));
      const to = Math.min(PROGRAMMING.maxSetsPerSlot, pick.slot.sets + add);
      recs.push(
        makeRec({
          ...common,
          variant: 'below',
          priority: 4,
          subjectKey: `${muscle}`,
          subject: { muscle, dayId: pick.day.id, slotId: pick.slot.id, exerciseId: pick.slot.exerciseId },
          change: { kind: 'slot', dayId: pick.day.id, slotId: pick.slot.id, exerciseId: pick.slot.exerciseId, sets: { from: pick.slot.sets, to } },
          facts: {
            muscle: muscleName(muscle).toLowerCase(),
            planned,
            low: band[0],
            high: band[1],
            exercise: requireExercise(pick.slot.exerciseId).name,
            day: pick.day.name,
            from: pick.slot.sets,
            to,
          },
        }),
      );
    } else if (planned > Math.min(band[1], T.volume.maxSets)) {
      const stalled = targeting.some(({ slot }) => plateaued.has(slot.exerciseId));
      if (planned <= T.volume.maxSets && !stalled && ctx.fatigue.count === 0) continue;
      const pick = [...targeting].filter(({ slot }) => slot.role === 'accessory' && slot.sets > 2).sort((a, b) => b.slot.sets - a.slot.sets)[0];
      if (!pick) continue;
      recs.push(
        makeRec({
          ...common,
          variant: 'above',
          priority: 4,
          subjectKey: `${muscle}`,
          subject: { muscle, dayId: pick.day.id, slotId: pick.slot.id, exerciseId: pick.slot.exerciseId },
          change: { kind: 'slot', dayId: pick.day.id, slotId: pick.slot.id, exerciseId: pick.slot.exerciseId, sets: { from: pick.slot.sets, to: pick.slot.sets - 1 } },
          facts: {
            muscle: muscleName(muscle).toLowerCase(),
            planned,
            low: band[0],
            high: band[1],
            exercise: requireExercise(pick.slot.exerciseId).name,
            day: pick.day.name,
            from: pick.slot.sets,
            to: pick.slot.sets - 1,
          },
        }),
      );
    }
  }

  // E3 · Push vs pull (low priority, association only).
  let push = 0;
  let pull = 0;
  for (const { slot } of slots) {
    const vector = patternById(requireExercise(slot.exerciseId).pattern)?.vector;
    if (vector === 'push') push += slot.sets;
    if (vector === 'pull') pull += slot.sets;
  }
  if (pull > 0 && push > pull * T.volume.pushPullRatio && !appliedWithin(ctx.log, 'E3:push-pull', now, 7)) {
    const pick = slots
      .filter(({ slot }) => patternById(requireExercise(slot.exerciseId).pattern)?.vector === 'pull' && slot.sets < PROGRAMMING.maxSetsPerSlot)
      .sort((a, b) => a.slot.sets - b.slot.sets)[0];
    if (pick) {
      recs.push(
        makeRec({
          rule: 'E3',
          variant: 'pull',
          type: 'programming',
          priority: 8,
          confidence: 'low',
          basis: weeksOfPlan,
          basisUnit: 'weeks',
          actions: ['apply', 'dismiss'],
          subjectKey: 'push-pull',
          subject: { dayId: pick.day.id, slotId: pick.slot.id, exerciseId: pick.slot.exerciseId },
          change: { kind: 'slot', dayId: pick.day.id, slotId: pick.slot.id, exerciseId: pick.slot.exerciseId, sets: { from: pick.slot.sets, to: pick.slot.sets + 1 } },
          facts: { push, pull, exercise: requireExercise(pick.slot.exerciseId).name, day: pick.day.name, from: pick.slot.sets, to: pick.slot.sets + 1 },
        }),
      );
    }
  }
  return recs;
}

// ---------------------------------------------------------------- F · fatigue and lighter weeks

function fatigueRecs(ctx: ProgramCtx): Recommendation[] {
  const { program, fatigue, now } = ctx;
  const recs: Recommendation[] = [];
  const position = blockPosition(program, new Date(now));
  const signalFacts = {
    signals: fatigue.count,
    creep: fatigue.effortCreep.map((id) => requireExercise(id).name).join(' and '),
    creepCount: fatigue.effortCreep.length,
    dipCount: fatigue.dip.length,
    readinessLow: fatigue.readinessLow ? 1 : 0,
    checkoutLow: fatigue.checkoutLow ? 1 : 0,
    painCount: fatigue.pain.length,
  };
  if (position.lighterWeek) {
    recs.push(
      makeRec({
        rule: 'F2',
        variant: 'scheduled',
        type: 'recovery',
        priority: 1,
        confidence: 'high',
        basis: position.lengthWeeks,
        basisUnit: 'weeks',
        subjectKey: `week-${toISODate(weekStart(now))}`,
        subject: {},
        change: program.block.postponedWeeks ? { kind: 'info' } : { kind: 'lighter-week', action: 'postpone', weeks: 1 },
        actions: program.block.postponedWeeks ? [] : ['apply'],
        facts: { weeks: position.lengthWeeks, setsCut: Math.round((1 - T.lighterWeek.setFactor) * 100), lighter: Math.round((1 - T.lighterWeek.loadFactor) * 100) },
      }),
    );
    return recs;
  }
  if (!fatigue.enoughData || fatigue.count === 0) return recs;
  const weeksSinceLighter = position.week - 1;
  if (fatigue.count >= T.fatigue.signalsForLighterWeek && weeksSinceLighter >= T.fatigue.minWeeksSinceLighter) {
    recs.push(
      makeRec({
        rule: 'F2',
        variant: 'early',
        type: 'recovery',
        priority: 1,
        confidence: 'medium',
        basis: 2,
        basisUnit: 'weeks',
        subjectKey: `early-${toISODate(weekStart(now))}`,
        subject: {},
        change: { kind: 'lighter-week', action: 'now' },
        actions: ['apply', 'dismiss'],
        facts: { ...signalFacts, weeksEarly: position.weeksToLighter, setsCut: Math.round((1 - T.lighterWeek.setFactor) * 100), lighter: Math.round((1 - T.lighterWeek.loadFactor) * 100) },
      }),
    );
  } else {
    recs.push(
      makeRec({
        rule: 'F2',
        variant: 'hold',
        type: 'recovery',
        priority: 2,
        confidence: 'medium',
        basis: 2,
        basisUnit: 'weeks',
        subjectKey: `hold-${toISODate(weekStart(now))}`,
        subject: {},
        change: { kind: 'info' },
        actions: [],
        facts: signalFacts,
      }),
    );
  }
  return recs;
}

/** One fatigue signal (or more, too soon after a lighter week): no weight increases this week. */
export function fatigueHold(fatigue: FatigueSignals, program: Program, now: number): boolean {
  if (!fatigue.enoughData || fatigue.count === 0) return false;
  const position = blockPosition(program, new Date(now));
  if (position.lighterWeek) return false;
  return fatigue.count < T.fatigue.signalsForLighterWeek || position.week - 1 < T.fatigue.minWeeksSinceLighter;
}

// ---------------------------------------------------------------- G · schedule and breaks

export function missedSessionRec(ctx: ProgramCtx): Recommendation | null {
  const { program, sessions, now } = ctx;
  const today = new Date(now);
  const todayIndex = weekdayIndex(today);
  const monday = weekStart(now);
  const doneThisWeek = sessions.filter((s) => s.status === 'completed' && s.startedAt >= monday.getTime());
  const doneDays = new Set(doneThisWeek.map((s) => s.dayId));
  const todayDay = sessionOn(program, today);
  for (let i = todayIndex - 1; i >= 0; i--) {
    const dayId = program.schedule[i];
    if (!dayId || doneDays.has(dayId) || dayId === todayDay?.id) continue;
    const date = addDays(monday, i);
    // Days before the plan existed weren't missed.
    if (date.getTime() + DAY_MS <= program.createdAt) continue;
    const day = program.days.find((d) => d.id === dayId);
    if (!day) continue;
    return makeRec({
      rule: 'G1',
      variant: todayDay ? 'busy-day' : 'rest-day',
      type: 'consistency',
      priority: 2,
      confidence: 'high',
      basis: 1,
      subjectKey: `${toISODate(date)}`,
      subject: { dayId },
      change: { kind: 'do-missed', dayId },
      actions: ['apply', 'dismiss'],
      facts: { day: day.name, weekday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]!, today: todayDay?.name ?? '' },
    });
  }
  return null;
}

export function returnRec(state: ReturnState, now: number): Recommendation | null {
  if (state.tier === 0) return null;
  return makeRec({
    rule: 'G3',
    variant: `tier${state.tier}-${state.sessionsSince === 0 ? 'first' : 'ramp'}`,
    type: 'consistency',
    priority: 1,
    confidence: 'high',
    basis: 1,
    subjectKey: `return`,
    situation: [state.tier, state.daysOff, state.sessionsSince, toISODate(new Date(now))],
    subject: {},
    change: { kind: 'info' },
    actions: [],
    facts: {
      days: state.daysOff,
      percent: Math.round(state.loadFactor * 100),
      setsDrop: state.setsDrop,
      rir: state.rir ?? '',
      session: state.sessionsSince + 1,
    },
  });
}

// ---------------------------------------------------------------- H3 · fat loss

function fatLossRecs(ctx: ProgramCtx): Recommendation[] {
  const { profile, measurements, now, log } = ctx;
  if (profile.goal !== 'fat-loss') return [];
  const recs: Recommendation[] = [];
  const trend = weightTrend(measurements, now);
  if (trend) {
    const recent = trend.weeklyChanges.slice(-T.weight.weeksFast);
    const fast = recent.length >= T.weight.weeksFast && recent.every((c) => c <= -T.weight.fastPerWeek);
    const flatWindow = trend.weeklyChanges.slice(-T.weight.flatWeeks);
    const flat = flatWindow.length >= T.weight.flatWeeks && flatWindow.every((c) => Math.abs(c) < T.weight.flatPerWeek);
    const pct = Math.abs(recent.reduce((s, c) => s + c, 0) / Math.max(1, recent.length)) * 100;
    if (fast) {
      recs.push(
        makeRec({
          rule: 'H3',
          variant: 'fast',
          type: 'recovery',
          priority: 3,
          confidence: 'medium',
          basis: trend.weeks,
          basisUnit: 'weeks',
          subjectKey: 'weight',
          situation: [Math.round(pct * 10), trend.weeks],
          subject: {},
          change: { kind: 'info' },
          actions: [],
          facts: { pct: pct.toFixed(1), weeks: recent.length },
        }),
      );
    } else if (flat) {
      recs.push(
        makeRec({
          rule: 'H3',
          variant: 'flat',
          type: 'recovery',
          priority: 7,
          confidence: 'medium',
          basis: trend.weeks,
          basisUnit: 'weeks',
          subjectKey: 'weight',
          situation: ['flat', trend.weeks],
          subject: {},
          change: { kind: 'info' },
          actions: [],
          facts: { weeks: flatWindow.length, weight: Math.round(trend.latest * 10) / 10 },
        }),
      );
    }
  }
  // H3P · A once-a-month protein pointer, only with a known body weight.
  const weight = trend?.latest ?? profile.bodyWeight;
  const lastTip = log.filter((e) => e.ruleId === 'H3P' && e.kind === 'shown').reduce((m, e) => Math.max(m, e.at), 0);
  if (weight && now - lastTip > T.weight.proteinTipDays * DAY_MS) {
    const kg = weight / 2.2046;
    const grams = Math.round((kg * T.weight.proteinGramsPerKg) / 5) * 5;
    recs.push(
      makeRec({
        rule: 'H3P',
        variant: 'tip',
        type: 'recovery',
        priority: 9,
        confidence: 'medium',
        basis: 1,
        subjectKey: 'protein',
        situation: [toISODate(new Date(now)).slice(0, 7)],
        subject: {},
        change: { kind: 'info' },
        actions: ['dismiss'],
        facts: { grams, weight: Math.round(weight) },
      }),
    );
  }
  return recs;
}

// ---------------------------------------------------------------- J2 · repeated pain

/** Body areas reported painful in 2+ sessions within 3 weeks. */
export function repeatedPainAreas(sessions: Session[], now: number): BodyArea[] {
  const since = now - T.pain.repeatDays * DAY_MS;
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (s.status !== 'completed' || s.startedAt < since || !s.checkout) continue;
    for (const area of new Set(s.checkout.pain.map((p) => p.area))) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts].filter(([area, n]) => n >= 2 && area !== 'other').map(([area]) => area as BodyArea);
}

function painRecs(ctx: ProgramCtx): Recommendation[] {
  return repeatedPainAreas(ctx.sessions, ctx.now).map((area) =>
    makeRec({
      rule: 'J1',
      variant: 'repeat',
      type: 'safety',
      priority: 0,
      confidence: 'high',
      basis: 2,
      safety: true,
      subjectKey: `area-${area}`,
      situation: [area, toISODate(weekStart(ctx.now))],
      subject: { area },
      change: { kind: 'info' },
      actions: [],
      facts: { area: area.replace('-', ' ') },
    }),
  );
}

// ---------------------------------------------------------------- all program-level recommendations

export function programRecommendations(ctx: ProgramCtx): Recommendation[] {
  const bands = muscleBands(ctx.program, ctx.profile.experience);
  const bandStatus = new Map<MuscleId, 'below' | 'above' | 'in'>(
    [...bands].map(([m, { planned, band }]) => [m, planned < band[0] ? 'below' : planned > band[1] ? 'above' : 'in']),
  );
  const plateauList = plateauRecs(ctx, bandStatus);
  const plateaued = new Set(plateauList.map((r) => r.subject.exerciseId).filter((id): id is string => Boolean(id)));
  return [...painRecs(ctx), ...fatigueRecs(ctx), ...plateauList, ...volumeRecs(ctx, plateaued), ...fatLossRecs(ctx)];
}

export type { Goal };

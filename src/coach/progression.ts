import type { Experience, Goal, Gym, SlotRole } from '../db/types';
import { exerciseById, requireExercise } from '../domain/catalog';
import { loadSourceFor } from '../domain/gym';
import { availableLoads, snapLoad, stepLoad } from '../domain/loads';
import { swapOptions } from '../domain/resolver';
import { estimateMax, loadForReps } from '../domain/strength';
import type { BodyArea } from '../domain/types';
import { T } from './knowledge';
import { confidenceFor, inferredRir, normalExposures, workingSets } from './measures';
import type { Confidence, Exposure, RuleId } from './types';

/**
 * What to do next time with one exercise (proposal rules A1–A6, with J1 pain overriding).
 * Reads only that exercise's history; session-wide context (fatigue holds, return ramps, lighter
 * weeks) comes in through `constraints`.
 */

export interface SlotTarget {
  repsLow: number;
  repsHigh: number;
  rir?: number;
  sets: number;
  role?: SlotRole;
}

export interface Constraints {
  /** No weight increases (one fatigue signal, short return, repeated pain in the area, readiness). */
  noIncrease?: 'fatigue' | 'return' | 'pain-area' | 'readiness';
  /** Share of lifts that missed reps in each session id (for A4's fatigue-day check). */
  sessionMissShare?: Map<string, number>;
}

export interface ExercisePlan {
  rule: RuleId;
  variant: string;
  exerciseId: string;
  /** Load used last time (null for bodyweight). */
  from: number | null;
  load: number | null;
  repsLow: number;
  repsHigh: number;
  /** One number to beat (reps per set). */
  beat?: number;
  rir?: number;
  swapTo?: string;
  /** Changes the weight or rep target: needs Apply (or Use in the workout). */
  actionable: boolean;
  confidence: Confidence;
  basis: number;
  /** Last exposure's session, so the recommendation id changes once the lift is trained again. */
  lastSessionId: string;
  facts: Record<string, string | number>;
  safety?: boolean;
}

interface Ctx {
  gym: Gym;
  goal: Goal;
  experience: Experience;
  now: number;
}

const mid = (low: number, high: number) => Math.round((low + high) / 2);

function setsText(sets: Exposure['sets']): string {
  return sets.map((s) => s.reps).join(', ');
}

function missed(exposure: Exposure): boolean {
  const working = workingSets(exposure);
  const first = working[0];
  return working.some((s) => s.reps < exposure.repsLow) || (first !== undefined && first.rir === 0 && first.reps <= exposure.repsLow);
}

/** Only the last set came up short, and total reps were within ~10% of the target. */
function smallMiss(exposure: Exposure): boolean {
  const working = workingSets(exposure);
  const total = working.reduce((s, x) => s + x.reps, 0);
  return working.slice(0, -1).every((s) => s.reps >= exposure.repsLow) && total >= working.length * exposure.repsLow * T.progression.smallMissTotal;
}

/** Share of lifts in each session that missed the bottom of their range. */
export function missShareBySession(exposures: Map<string, Exposure[]>): Map<string, number> {
  const counts = new Map<string, { lifts: number; missed: number }>();
  for (const list of exposures.values()) {
    for (const e of list) {
      if (e.top === null) continue;
      const c = counts.get(e.sessionId) ?? { lifts: 0, missed: 0 };
      c.lifts++;
      if (missed(e)) c.missed++;
      counts.set(e.sessionId, c);
    }
  }
  return new Map([...counts].map(([id, c]) => [id, c.lifts >= 3 ? c.missed / c.lifts : 0]));
}

export function planNextExposure(
  exerciseId: string,
  slot: SlotTarget,
  history: Exposure[],
  ctx: Ctx,
  constraints: Constraints = {},
): ExercisePlan | null {
  const exercise = exerciseById(exerciseId);
  if (!exercise) return null;
  const list = normalExposures(history);
  const last = list[list.length - 1];
  if (!last) return null;
  const source = loadSourceFor(exercise, ctx.gym);
  const model = source?.model;
  const confidence = confidenceFor(list, ctx.now);
  const p = T.progression;
  const targetRir = slot.rir ?? last.targetRir;
  const { repsLow, repsHigh } = slot;
  const working = workingSets(last);
  const top = last.top;
  const base = {
    exerciseId,
    from: top,
    repsLow,
    repsHigh,
    confidence,
    basis: list.length,
    lastSessionId: last.sessionId,
  };
  const lastFacts = {
    exercise: exercise.name,
    lastSets: setsText(working),
    lastLoad: top ?? 0,
    lastDate: last.date,
    range: repsLow === repsHigh ? `${repsLow}` : `${repsLow}–${repsHigh}`,
    repsLow,
    repsHigh,
    sessions: list.length,
  };

  // J1 · Pain on the last exposure overrides everything: lighter and shorter of failure, or a swap.
  if (last.pain) {
    const avoid = exercise.stresses as BodyArea[];
    const swap = swapOptions(exerciseId, ctx.gym, { experience: ctx.experience, avoid, limit: 6 }).find(
      (o) => !o.exercise.stresses.some((area) => avoid.includes(area)),
    );
    const lighter = top !== null && model ? (snapLoad(model, top * T.pain.loadFactor, 'down') ?? top) : top;
    return {
      ...base,
      rule: 'J1',
      variant: swap ? 'swap' : 'lighter',
      load: lighter,
      rir: Math.max(targetRir, T.pain.rir),
      swapTo: swap?.exercise.id,
      actionable: true,
      safety: true,
      facts: { ...lastFacts, to: lighter ?? 0, swap: swap?.exercise.name ?? '' },
    };
  }

  // Bodyweight (or no load model): progress reps.
  if (top === null || !model || availableLoads(model).length === 0) {
    const lowest = Math.min(...working.map((s) => s.reps));
    const beat = Math.min(repsHigh + p.stretchReps, lowest + 1);
    return { ...base, rule: 'A2', variant: 'bw-beat', load: null, beat, actionable: false, facts: { ...lastFacts, beat } };
  }

  const e1rm = last.e1rm || estimateMax(top, working[0]?.reps ?? repsLow, targetRir);
  const prev = list[list.length - 2];
  const hold = (variant: string, rule: RuleId, beat: number | undefined, extra: Record<string, string | number> = {}): ExercisePlan => ({
    ...base,
    rule,
    variant,
    load: top,
    beat,
    actionable: false,
    facts: { ...lastFacts, to: top, beat: beat ?? '', ...extra },
  });
  const lowestReps = Math.min(...working.map((s) => s.reps));
  const beatNext = Math.min(repsHigh, lowestReps + 1);

  // A4 (strength) · The lower rep target runs for two exposures, then the range builds back.
  const notched = last.repsHigh < repsHigh;
  if (ctx.goal === 'strength' && slot.role === 'main' && notched && !(prev && prev.repsHigh < repsHigh) && !missed(last)) {
    return {
      ...base,
      rule: 'A4',
      variant: 'strength-again',
      load: top,
      repsLow: last.repsLow,
      repsHigh: last.repsHigh,
      actionable: true,
      facts: { ...lastFacts, to: top, newRange: `${last.repsLow}–${last.repsHigh}` },
    };
  }

  // A new rep range (an applied plateau change, or a new plan): reset the weight from the estimated max.
  const strengthNotch = ctx.goal === 'strength' && slot.role === 'main' && notched && repsHigh - last.repsHigh === p.strengthNotch;
  if ((last.repsLow !== repsLow || last.repsHigh !== repsHigh) && !strengthNotch) {
    const to = snapLoad(model, loadForReps(e1rm, mid(repsLow, repsHigh), targetRir), 'down') ?? top;
    return {
      ...base,
      rule: 'D',
      variant: 'range-reset',
      load: to,
      actionable: false,
      facts: { ...lastFacts, to, oldRange: `${last.repsLow}–${last.repsHigh}` },
    };
  }

  // A4 · Missed reps.
  if (missed(last)) {
    const share = constraints.sessionMissShare?.get(last.sessionId) ?? 0;
    if (share >= p.fatigueDayShare) return hold('fatigue-day', 'A4', beatNext);
    const small = smallMiss(last);
    // Two misses in a row at this weight (at least one of them clear) lower it regardless of goal.
    const secondMiss = prev ? missed(prev) && prev.top !== null && prev.top >= top && !(small && smallMiss(prev)) : false;
    if (!secondMiss && small) return hold('small', 'A4', repsLow);
    if (!secondMiss && ctx.goal === 'strength' && slot.role === 'main') {
      const low = Math.max(p.minReps, repsLow - p.strengthNotch);
      const high = Math.max(low, repsHigh - p.strengthNotch);
      return {
        ...base,
        rule: 'A4',
        variant: 'strength',
        load: top,
        repsLow: low,
        repsHigh: high,
        actionable: true,
        facts: { ...lastFacts, to: top, newRange: `${low}–${high}`, pctMax: Math.round((top / e1rm) * 100) },
      };
    }
    if (!secondMiss && confidence === 'low') return hold('small', 'A4', repsLow);
    const predicted = snapLoad(model, loadForReps(e1rm, mid(repsLow, repsHigh), targetRir), 'down') ?? top;
    const oneDown = stepLoad(model, top, -1) ?? top;
    const floor = snapLoad(model, top * 0.85, 'up') ?? oneDown;
    const lower = Math.min(oneDown, Math.max(predicted, floor));
    if (lower >= top) return hold('small', 'A4', repsLow);
    return {
      ...base,
      rule: 'A4',
      variant: secondMiss ? 'second' : 'lower',
      load: lower,
      actionable: true,
      facts: { ...lastFacts, to: lower, firstRir: working[0]?.rir ?? '' },
    };
  }

  const allAtTop = working.every((s) => s.reps >= repsHigh);
  const rated = working.filter((s) => s.rir !== undefined);
  const rirOf = (s: Exposure['sets'][number]) => inferredRir(s, repsLow, repsHigh, targetRir);
  const blockIncrease = (plan: ExercisePlan): ExercisePlan =>
    constraints.noIncrease && plan.load !== null && plan.load > top ? hold(`held-${constraints.noIncrease}`, plan.rule, plan.beat ?? beatNext) : plan;

  if (allAtTop) {
    const harder = rated.length > 0 && rated.some((s) => (s.rir ?? 0) < targetRir);
    const prevAlsoTop = prev && prev.top === top && workingSets(prev).every((s) => s.reps >= repsHigh);
    if (harder && !prevAlsoTop) return hold('hold-hard', 'A2', repsHigh);

    const easy = rated.length === working.length && working.every((s) => rirOf(s) >= targetRir + p.easyMargin);
    const jumped = prev && !last.calibrating && prev.e1rm > 0 && last.e1rm >= prev.e1rm * (1 + p.e1rmJump);
    const oneStep = stepLoad(model, top, 1) ?? top;
    if (oneStep <= top) return hold('maxed', 'A5', Math.min(repsHigh + p.stretchReps, lowestReps + 1));

    // A5 · The next step is a big jump: stretch the reps first, then jump and reset.
    if ((oneStep - top) / top > p.bigJump) {
      const stretchTo = repsHigh + p.stretchReps;
      if (lowestReps < stretchTo) return blockIncrease(hold('stretch', 'A5', Math.min(stretchTo, lowestReps + 2), { next: oneStep, stretchTo }));
      return blockIncrease({ ...base, rule: 'A5', variant: 'jump', load: oneStep, actionable: true, facts: { ...lastFacts, to: oneStep, stretchTo } });
    }

    if (easy || jumped) {
      // A3 · Skip a step: aim mid-range at the target effort, capped for beginners and early reads.
      const cap = ctx.experience === 'beginner' || confidence === 'low' ? p.maxJumpBeginnerOrLow : p.maxJumpOther;
      const twoSteps = stepLoad(model, top, 2) ?? oneStep;
      const predicted = snapLoad(model, loadForReps(e1rm, mid(repsLow, repsHigh), targetRir), 'down') ?? oneStep;
      const capped = snapLoad(model, top * (1 + cap), 'down') ?? oneStep;
      const to = Math.max(oneStep, Math.min(Math.max(twoSteps, predicted), capped));
      if (to > oneStep) {
        return blockIncrease({
          ...base,
          rule: 'A3',
          variant: 'skip',
          load: to,
          actionable: true,
          facts: { ...lastFacts, to, steps: availableLoads(model).filter((l) => l > top && l <= to).length },
        });
      }
    }
    // A2 · Owned the top of the range: next load, bottom of the range.
    return blockIncrease({
      ...base,
      rule: 'A2',
      variant: last.calibrating && list.length === 1 ? 'found-up' : 'up',
      load: oneStep,
      actionable: true,
      facts: { ...lastFacts, to: oneStep, expectLow: repsLow, expectHigh: Math.max(repsLow, repsHigh - 1) },
    });
  }

  // A3 · Stopped early with plenty left: same weight, push to the top.
  if (rated.length === working.length && working.every((s) => (s.rir ?? 0) >= 4)) return hold('push', 'A3', repsHigh);

  // A1 · First exposure done: the weight is found.
  if (last.calibrating && list.length === 1) return hold('found', 'A1', beatNext, { found: top, foundReps: working[working.length - 1]?.reps ?? repsLow });

  // A2 · In the range: same weight, beat the reps.
  return hold('beat', 'A2', beatNext);
}

/** The key lifts for a plan: main lifts (and secondary lifts when there are few mains). */
export function isKeyRole(role: SlotRole | undefined): boolean {
  return role === 'main' || role === 'secondary';
}

export function exerciseName(id: string): string {
  return requireExercise(id).name;
}

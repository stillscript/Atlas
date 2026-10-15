import type { Experience, Gym, Session } from '../db/types';
import { requireExercise } from '../domain/catalog';
import { loadSourceFor } from '../domain/gym';
import { availableLoads, snapLoad, stepLoad } from '../domain/loads';
import { estimateMax, loadForReps, repsAtLoad } from '../domain/strength';
import { T } from './knowledge';
import { confidenceFor, inferredRir, normalExposures } from './measures';
import { makeRec } from './rec';
import type { Exposure, Recommendation } from './types';

/**
 * During a session (proposal B1–B4). Called after a set is logged (and again after it's rated).
 * At most one weight prompt per exercise per session; expected drop-off (about a rep per set at
 * the same weight) never triggers anything (B4).
 */

const mid = (low: number, high: number) => Math.round((low + high) / 2);

export function inSessionOffer(
  session: Session,
  entryIndex: number,
  history: Exposure[],
  ctx: { gym: Gym; experience: Experience; now: number },
): Recommendation | null {
  const entry = session.entries[entryIndex];
  const target = entry?.target;
  if (!entry || !target || target.calibrating) return null;
  if (session.coachPrompts?.includes(entry.id)) return null;
  const done = entry.sets.filter((s) => s.kind === 'work' && s.reps > 0);
  const set = done[done.length - 1];
  const remaining = target.sets - done.length;
  if (!set || set.load === null || remaining <= 0) return null;
  const exercise = requireExercise(entry.exerciseId);
  const model = loadSourceFor(exercise, ctx.gym)?.model;
  if (!model) return null;
  const list = normalExposures(history);
  const last = list[list.length - 1];
  if (!last) return null;
  const targetRir = target.rir ?? 2;
  const rir = inferredRir(set, target.repsLow, target.repsHigh, targetRir);
  const e1rm = estimateMax(set.load, set.reps, rir);
  const expected = last.e1rm;
  const confidence = confidenceFor(list, ctx.now);
  const base = {
    type: 'progress' as const,
    priority: 1,
    subject: { exerciseId: entry.exerciseId },
    confidence,
    basis: list.length,
    actions: ['use', 'keep'] as Recommendation['actions'],
  };

  // B1 · Much harder than expected: reset the remaining sets to a weight that lands in range.
  const muchHarder = expected > 0 && e1rm <= expected * (1 - T.inSession.harderDrop);
  if (muchHarder || (set.reps < target.repsLow && rir === 0)) {
    // The heaviest weight predicted to still land in the range at the target effort. On equipment
    // with big gaps (a Smith bar with 25s and 45s) that's the next one down, not a huge drop.
    const lower = availableLoads(model).filter((l) => l < set.load!).sort((a, b) => b - a);
    const distance = (l: number) => {
      const reps = repsAtLoad(e1rm, l, targetRir);
      return reps < target.repsLow ? target.repsLow - reps : reps > target.repsHigh ? reps - target.repsHigh : 0;
    };
    // Closest to the range wins; on a tie, the heavier one.
    const best = lower.reduce<number | null>((pick, l) => (pick === null || distance(l) < distance(pick) ? l : pick), null);
    const to = best ?? snapLoad(model, loadForReps(e1rm, mid(target.repsLow, target.repsHigh), targetRir), 'down');
    const reps = to ? Math.min(target.repsHigh, Math.max(target.repsLow, Math.floor(repsAtLoad(e1rm, to, targetRir)))) : target.repsLow;
    if (to !== null && to !== undefined && to < set.load) {
      return makeRec({
        ...base,
        rule: 'B1',
        variant: 'lower',
        subjectKey: `${entry.id}`,
        situation: [session.id, entry.id, set.id],
        change: { kind: 'next-sets', entryId: entry.id, load: to, reps, sets: remaining },
        facts: {
          exercise: exercise.name,
          load: set.load,
          reps: set.reps,
          rir,
          to,
          remaining,
          range: `${target.repsLow}–${target.repsHigh}`,
        },
      });
    }
  }

  // B2 · Much easier: top of the range with plenty left on set 1 or 2 (not on early reads).
  if (done.length <= 2 && set.rir !== undefined && set.reps >= target.repsHigh && set.rir >= targetRir + T.inSession.easyMargin && confidence !== 'low') {
    if (ctx.experience === 'beginner') {
      return makeRec({
        ...base,
        rule: 'B2',
        variant: 'reps',
        subjectKey: `${entry.id}`,
        situation: [session.id, entry.id, set.id],
        change: { kind: 'next-sets', entryId: entry.id, load: set.load, reps: set.reps + 2, sets: remaining },
        facts: { exercise: exercise.name, load: set.load, reps: set.reps, rir: set.rir, toReps: set.reps + 2 },
      });
    }
    const to = stepLoad(model, set.load, 1);
    if (to !== null && to > set.load) {
      return makeRec({
        ...base,
        rule: 'B2',
        variant: 'up',
        subjectKey: `${entry.id}`,
        situation: [session.id, entry.id, set.id],
        change: { kind: 'next-sets', entryId: entry.id, load: to, reps: mid(target.repsLow, target.repsHigh), sets: remaining },
        facts: { exercise: exercise.name, load: set.load, reps: set.reps, rir: set.rir, to },
      });
    }
  }
  return null;
}

/**
 * B3 · Rest adapts: reps fell by more than normal fatigue explains and the rest was cut short.
 * Returns the full rest to take before the next set, or null.
 */
export function restAdvice(session: Session, entryIndex: number): { seconds: number; dropped: number; restTaken: number } | null {
  const entry = session.entries[entryIndex];
  const planned = entry?.target?.restSec;
  if (!entry || !planned) return null;
  const done = entry.sets.filter((s) => s.kind === 'work' && s.reps > 0);
  const [prev, last] = done.slice(-2);
  if (!prev || !last || prev.load !== last.load || last.restTakenSec === undefined) return null;
  if (done.length >= (entry.target?.sets ?? 0)) return null;
  const drop = prev.reps - last.reps;
  const expected = T.inSession.expectedDropPerSet;
  if (drop >= expected + T.inSession.restDropExtra && last.restTakenSec < planned - 10) {
    return { seconds: planned, dropped: drop, restTaken: last.restTakenSec };
  }
  return null;
}

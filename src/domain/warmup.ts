import type { ExerciseEntry, LoadModel } from '../db/types';
import { snapLoad } from './loads';
import type { ExerciseDef } from './types';

/**
 * Warm-up sets before a main lift: a short ramp to the first working weight (about 50%, 70% and
 * 85%, fewer reps as it gets heavier) so the working sets start warm without tiring you. They are a
 * checklist, never logged as sets, so they don't count toward volume, records or the Coach.
 */

export const WARMUP_STEPS: { fraction: number; reps: number }[] = [
  { fraction: 0.5, reps: 8 },
  { fraction: 0.7, reps: 5 },
  { fraction: 0.85, reps: 3 },
];

export interface WarmupSet {
  load: number;
  reps: number;
}

const RAMPED: LoadModel['kind'][] = ['stack', 'plates', 'dumbbells', 'fixed'];

/**
 * The warm-up for this exercise toward `workLoad`, or [] when it doesn't get one: only main
 * compound lifts with a real weight, not when the first weight is still a light guess (rule A1
 * already starts light), and never a step at or above the working weight or repeating the one before.
 */
export function warmupPlan(
  entry: Pick<ExerciseEntry, 'role' | 'target'>,
  exercise: Pick<ExerciseDef, 'kind' | 'loadMode'>,
  model: LoadModel | null,
  workLoad: number | null,
): WarmupSet[] {
  if (entry.role !== 'main' || exercise.kind !== 'compound' || exercise.loadMode === 'bodyweight' || exercise.loadMode === 'none') return [];
  if (!model || !RAMPED.includes(model.kind) || workLoad === null || workLoad <= 0) return [];
  if (entry.target?.reason === 'calibrate') return [];
  const sets: WarmupSet[] = [];
  for (const step of WARMUP_STEPS) {
    const load = snapLoad(model, workLoad * step.fraction, 'down');
    if (load === null || load >= workLoad || load <= 0) continue;
    const before = sets[sets.length - 1];
    if (before && load <= before.load) continue;
    sets.push({ load, reps: step.reps });
  }
  return sets;
}

import type { Experience, Gym, Profile, ProgramSlot } from '../db/types';
import { exerciseById } from './catalog';
import { loadSourceFor } from './gym';
import { snapLoad } from './loads';
import { startingLoad } from './resolver';
import { estimateMax, loadForReps } from './strength';

/**
 * The first-session weight for a slot, before any workout history exists (approved rule A1).
 * - known: the user entered a working set at setup. Treated as a set with about 1 rep left, then
 *   converted to the middle of this slot's rep range at its reps-left target, rounded down.
 * - calibrate: no known set, so a light catalog guess; the first sets find the real weight.
 */
export type StartSuggestion =
  | { kind: 'known'; load: number }
  | { kind: 'calibrate'; load: number | null }
  | { kind: 'none' };

const ASSUMED_REPS_LEFT = 1;

export function startSuggestion(slot: ProgramSlot, gym: Gym, profile: Pick<Profile, 'startingLoads'>, experience: Experience): StartSuggestion {
  const exercise = exerciseById(slot.exerciseId);
  if (!exercise || !exercise.loadFrom) return { kind: 'none' };
  const source = loadSourceFor(exercise, gym);
  if (!source) return { kind: 'none' };

  const known = profile.startingLoads?.[exercise.id];
  if (known && known.load > 0 && known.reps > 0) {
    const max = estimateMax(known.load, known.reps, ASSUMED_REPS_LEFT);
    const targetReps = Math.round((slot.repsLow + slot.repsHigh) / 2);
    const load = snapLoad(source.model, loadForReps(max, targetReps, slot.rir ?? 2), 'down');
    if (load !== null) return { kind: 'known', load };
  }
  return { kind: 'calibrate', load: startingLoad(exercise.id, gym, experience) };
}

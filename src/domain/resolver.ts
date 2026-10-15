import type { Experience, Gym } from '../db/types';
import { exerciseById, exercisesInPattern, patternById, requireExercise } from './catalog';
import { canDoExercise, gymTags, loadSourceFor } from './gym';
import { snapLoad } from './loads';
import { loadForReps } from './strength';
import type { BodyArea, ExerciseDef } from './types';

/**
 * Picks real exercises for movement slots in a specific gym, and finds swaps when a station is
 * taken or something hurts. Programs are written as patterns ("incline press"); this is what
 * turns them into "Smith machine incline press" at the Office and "Barbell incline press" elsewhere.
 */

const LEVEL_ORDER: Record<Experience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export interface ResolveOptions {
  /** Exercise ids in order of preference; the first one this gym can do wins. */
  prefer?: string[];
  /** Ids already used (e.g. earlier in the same day) to skip. */
  exclude?: Iterable<string>;
  experience?: Experience;
  /** 0 = best choice, 1 = second best… Used to vary the same pattern across days. */
  variant?: number;
  /** Body areas to avoid (pain flags). */
  avoid?: BodyArea[];
}

function tooAdvanced(exercise: ExerciseDef, experience?: Experience): boolean {
  if (!experience || !exercise.level) return false;
  return LEVEL_ORDER[exercise.level] > LEVEL_ORDER[experience];
}

/** Candidates for one pattern in this gym, best first. */
export function candidatesForPattern(pattern: string, gym: Gym, options: ResolveOptions = {}): ExerciseDef[] {
  const tags = gymTags(gym);
  const excluded = new Set(options.exclude ?? []);
  const avoid = new Set(options.avoid ?? []);
  const usable = (e: ExerciseDef | undefined): e is ExerciseDef =>
    !!e && e.pattern === pattern && canDoExercise(e, tags) && !excluded.has(e.id);

  const preferred = (options.prefer ?? []).map((id) => exerciseById(id)).filter(usable);
  const rest = exercisesInPattern(pattern).filter((e) => usable(e) && !preferred.some((p) => p.id === e.id));
  const ordered = [...preferred, ...rest];

  // Exercises above the user's level or loading a painful area move to the back, not out:
  // if they're the only option, they're still better than nothing.
  const score = (e: ExerciseDef) =>
    (tooAdvanced(e, options.experience) ? 1 : 0) + (e.stresses.some((area) => avoid.has(area)) ? 2 : 0);
  return ordered
    .map((e, index) => ({ e, index }))
    .sort((a, b) => score(a.e) - score(b.e) || a.index - b.index)
    .map(({ e }) => e);
}

/**
 * The exercise to use for a pattern in this gym, or null if neither the pattern nor its fallbacks
 * can be done there.
 */
export function resolvePattern(pattern: string, gym: Gym, options: ResolveOptions = {}): ExerciseDef | null {
  const visited = new Set<string>();
  const queue = [pattern];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const candidates = candidatesForPattern(current, gym, current === pattern ? options : { ...options, prefer: [] });
    if (candidates.length) {
      const variant = Math.min(options.variant ?? 0, candidates.length - 1);
      return candidates[variant]!;
    }
    queue.push(...(patternById(current)?.fallbacks ?? []));
  }
  return null;
}

export interface SwapOption {
  exercise: ExerciseDef;
  samePattern: boolean;
}

/**
 * Alternatives for "Station taken?": same movement first, then related movements, never using the
 * equipment that's taken. Each option keeps its own history.
 */
export function swapOptions(
  exerciseId: string,
  gym: Gym,
  options: { experience?: Experience; avoid?: BodyArea[]; limit?: number } = {},
): SwapOption[] {
  const current = requireExercise(exerciseId);
  const busy = loadSourceFor(current, gym)?.item;
  // Tags still available with the busy station out of action.
  const freeTags = new Set(gym.equipment.filter((item) => item !== busy).flatMap((item) => item.provides));
  const usesBusy = (e: ExerciseDef) => busy !== undefined && e.requires.some((tag) => !freeTags.has(tag));

  const results: SwapOption[] = [];
  const seen = new Set([current.id]);
  const patterns = [current.pattern, ...(patternById(current.pattern)?.fallbacks ?? [])];
  for (const pattern of patterns) {
    for (const exercise of candidatesForPattern(pattern, gym, { experience: options.experience, avoid: options.avoid })) {
      if (seen.has(exercise.id) || usesBusy(exercise)) continue;
      seen.add(exercise.id);
      results.push({ exercise, samePattern: pattern === current.pattern });
    }
  }
  return results.slice(0, options.limit ?? 6);
}

/**
 * A conservative first-session load for `toId`, from the estimated max on `fromId`.
 * Only within the same movement pattern, where the catalog has strength ratios for both; the
 * result is cut by 10% and rounded down to a load the target equipment can make. The first set
 * then corrects it. Returns null when there's no sensible conversion (calibrate instead).
 */
export function convertStartLoad(
  fromId: string,
  fromMax: number,
  toId: string,
  gym: Gym,
  target: { reps: number; repsLeft: number },
): number | null {
  const from = exerciseById(fromId);
  const to = exerciseById(toId);
  if (!from || !to || from.pattern !== to.pattern || !from.ratio || !to.ratio || fromMax <= 0) return null;
  const source = loadSourceFor(to, gym);
  if (!source) return null;
  const toMax = fromMax * (to.ratio / from.ratio);
  const load = loadForReps(toMax, target.reps, target.repsLeft) * 0.9;
  return snapLoad(source.model, load, 'down');
}

/** A conservative starting load for someone new to this exercise, before calibration. */
export function startingLoad(exerciseId: string, gym: Gym, experience: Experience): number | null {
  const exercise = exerciseById(exerciseId);
  const source = exercise ? loadSourceFor(exercise, gym) : undefined;
  if (!exercise?.start || !source) return null;
  const guess = exercise.start[experience];
  if (guess <= 0) return null;
  return snapLoad(source.model, guess, 'down');
}

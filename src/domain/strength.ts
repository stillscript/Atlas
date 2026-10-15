/**
 * Strength estimates (Epley, adjusted for reps left in the tank).
 *
 * A set of 8 reps with 2 left is treated like a 10-rep max. Estimates are most accurate when
 * reps + reps-left is 10 or fewer (Reynolds et al. 2006), so callers should weight
 * higher-rep sets less.
 */

/** Estimated one-rep max from a set. */
export function estimateMax(load: number, reps: number, repsLeft = 0): number {
  if (load <= 0 || reps <= 0) return 0;
  return load * (1 + (reps + Math.max(0, repsLeft)) / 30);
}

/** The load that should allow `reps` reps with `repsLeft` left, given an estimated max. */
export function loadForReps(max: number, reps: number, repsLeft = 0): number {
  if (max <= 0) return 0;
  return max / (1 + (reps + Math.max(0, repsLeft)) / 30);
}

/** How many reps a load should allow (before leaving `repsLeft` in the tank). */
export function repsAtLoad(max: number, load: number, repsLeft = 0): number {
  if (max <= 0 || load <= 0) return 0;
  return Math.max(0, 30 * (max / load - 1) - Math.max(0, repsLeft));
}

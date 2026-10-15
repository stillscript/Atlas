import type { ProgramSlot } from '../db/types';
import type { ExerciseDef } from '../domain/types';

/** Plain-language labels for prescriptions, so the UI never shows jargon like "RIR 2". */

export function repRange(low: number, high: number): string {
  return low === high ? `${low}` : `${low}–${high}`;
}

/** "4 × 6–8", "3 × 10–12 each side", "3 × 30–45 s" */
export function setsAndReps(slot: Pick<ProgramSlot, 'sets' | 'repsLow' | 'repsHigh'>, exercise: ExerciseDef): string {
  const unit = exercise.metric === 'time' ? ' s' : exercise.unilateral ? ' each side' : '';
  return `${slot.sets} × ${repRange(slot.repsLow, slot.repsHigh)}${unit}`;
}

/** How hard to push, in words. */
export function effortLabel(repsLeft: number | undefined): string {
  if (repsLeft === undefined) return '';
  if (repsLeft <= 0) return 'Push to your last good rep';
  if (repsLeft === 1) return 'Stop 1 rep short';
  return `Stop ${repsLeft} reps short`;
}

/**
 * The reps-left target when every rep-counted exercise in a day shares it, so the UI can say it
 * once ("stop 2 reps short on every set") instead of on every row.
 */
export function uniformEffort(slots: Pick<ProgramSlot, 'rir'>[]): number | undefined {
  const values = new Set(slots.map((s) => s.rir));
  return values.size === 1 ? [...values][0] : undefined;
}

/** "Rest 2:30", "Rest 75 s" */
export function restLabel(seconds: number | undefined): string {
  if (!seconds) return '';
  if (seconds < 90) return `Rest ${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `Rest ${m}:${String(s).padStart(2, '0')}`;
}

export function formatLoad(load: number, units = 'lb'): string {
  return `${Number.isInteger(load) ? load : load.toFixed(1)} ${units}`;
}

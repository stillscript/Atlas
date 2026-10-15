import { deleteMeasurement, saveMeasurement } from '../db/coach';
import type { Measurement } from '../db/types';
import type { BodyMetric } from '../domain/progress';
import { newId } from '../lib/ids';
import { measurements } from './coach';
import { getDb } from './state';

/**
 * Body measurements. They live in the same `measurements` signal the Coach reads, so a new weigh-in
 * immediately feeds the fat-loss rules (H3) and the weekly review.
 */

export interface MeasurementInput {
  date: string;
  values: Partial<Record<BodyMetric, number>>;
  photoTaken?: boolean;
  note?: string;
}

/** Saves a new entry, or updates `existing` (same id), then refreshes the list. */
export async function saveMeasurementEntry(input: MeasurementInput, existing?: Measurement): Promise<Measurement> {
  const [y, m, d] = input.date.split('-').map(Number);
  // Morning by default: a weigh-in is usually before the day's training.
  const at = existing && existing.date === input.date ? existing.at : new Date(y!, m! - 1, d!, 8).getTime();
  const record: Measurement = {
    id: existing?.id ?? newId('m'),
    date: input.date,
    at,
    ...input.values,
    photoTaken: input.photoTaken || undefined,
    note: input.note?.trim() || undefined,
  };
  await saveMeasurement(getDb(), record);
  measurements.value = [...measurements.value.filter((x) => x.id !== record.id), record].sort((a, b) => a.at - b.at);
  return record;
}

export async function removeMeasurement(id: string): Promise<void> {
  await deleteMeasurement(getDb(), id);
  measurements.value = measurements.value.filter((m) => m.id !== id);
}

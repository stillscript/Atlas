import type { ProgramDay } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { estimateDayMinutes } from '../../domain/generator';
import { plural } from '../../lib/format';
import { effortLabel, uniformEffort } from '../../lib/training-format';

/** "7 exercises · about 51 min · stop 2 reps short on every set" */
export function dayMeta(day: ProgramDay): string {
  const effort = uniformEffort(day.slots.filter((s) => requireExercise(s.exerciseId).metric === 'reps'));
  const parts = [plural(day.slots.length, 'exercise'), `about ${estimateDayMinutes(day)} min`];
  if (effort !== undefined) parts.push(`${effortLabel(effort).toLowerCase()} on every set`);
  return parts.join(' · ');
}

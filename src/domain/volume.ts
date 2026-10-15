import type { Experience, Program, ProgramSlot } from '../db/types';
import { PROGRAMMING, exerciseById } from './catalog';
import type { MuscleId } from './types';

/**
 * Weekly sets per muscle, counted fractionally: a set counts 1 for the muscles an exercise mainly
 * works and 0.5 for muscles that assist (Pelland et al. 2025). Rest days count nothing.
 */
export function slotMuscleSets(slot: ProgramSlot): Map<MuscleId, number> {
  const exercise = exerciseById(slot.exerciseId);
  const sets = new Map<MuscleId, number>();
  if (!exercise || exercise.kind === 'cardio') return sets;
  for (const muscle of exercise.primary) sets.set(muscle, (sets.get(muscle) ?? 0) + slot.sets);
  for (const muscle of exercise.secondary) sets.set(muscle, (sets.get(muscle) ?? 0) + slot.sets * 0.5);
  return sets;
}

function scheduledDays(program: Program) {
  return program.schedule
    .filter((dayId): dayId is string => dayId !== null)
    .map((dayId) => program.days.find((d) => d.id === dayId))
    .filter((day) => day !== undefined);
}

export function weeklySets(program: Program): Map<MuscleId, number> {
  const totals = new Map<MuscleId, number>();
  for (const day of scheduledDays(program)) {
    for (const slot of day.slots) {
      for (const [muscle, sets] of slotMuscleSets(slot)) totals.set(muscle, (totals.get(muscle) ?? 0) + sets);
    }
  }
  return totals;
}

/** On how many training days each muscle gets direct work (primary muscle of some exercise). */
export function weeklyFrequency(program: Program): Map<MuscleId, number> {
  const frequency = new Map<MuscleId, number>();
  for (const day of scheduledDays(program)) {
    const hit = new Set<MuscleId>();
    for (const slot of day.slots) for (const muscle of exerciseById(slot.exerciseId)?.primary ?? []) hit.add(muscle);
    for (const muscle of hit) frequency.set(muscle, (frequency.get(muscle) ?? 0) + 1);
  }
  return frequency;
}

const MUSCLE_NAMES: Record<MuscleId, string> = {
  chest: 'Chest',
  back: 'Back',
  'front-delts': 'Front delts',
  'side-delts': 'Side delts',
  'rear-delts': 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Inner thighs',
  calves: 'Calves',
  abs: 'Abs',
  'lower-back': 'Lower back',
};

export function muscleName(muscle: MuscleId): string {
  return MUSCLE_NAMES[muscle];
}

/** The weekly-sets target band for a muscle at this experience level, or null if it isn't tracked. */
export function volumeBand(muscle: MuscleId, experience: Experience): [number, number] | null {
  const bands = PROGRAMMING.volumeBands[experience];
  if (PROGRAMMING.majorMuscles.includes(muscle)) return bands.major;
  if (PROGRAMMING.minorMuscles.includes(muscle)) return bands.minor;
  return null;
}

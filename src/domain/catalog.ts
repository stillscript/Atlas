import equipmentJson from '../data/equipment.json';
import exercisesJson from '../data/exercises.json';
import patternsJson from '../data/patterns.json';
import officeJson from '../data/gyms/office.json';
import pillarJson from '../data/templates/pillar.json';
import blueprintsJson from '../data/templates/blueprints.json';
import programmingJson from '../data/programming.json';
import type {
  BlueprintDef,
  EquipmentDef,
  ExerciseDef,
  GymPresetDef,
  MuscleId,
  PatternDef,
  TemplateDef,
} from './types';
import type { Experience, Goal, ProgramExtra } from '../db/types';

/**
 * Typed access to the shipped catalogs. The JSON files are the source of truth; tests in
 * tests/domain/catalog.test.ts check them for broken references so a bad edit fails loudly.
 */

export const EQUIPMENT = equipmentJson as unknown as EquipmentDef[];
export const EXERCISES = exercisesJson as unknown as ExerciseDef[];
export const PATTERNS = patternsJson as unknown as PatternDef[];
export const GYM_PRESETS = [officeJson] as unknown as GymPresetDef[];
export const TEMPLATES = [pillarJson] as unknown as TemplateDef[];
export const BLUEPRINTS = blueprintsJson as unknown as BlueprintDef[];

type RoleReps = Record<'main' | 'secondary' | 'accessory' | 'small', [number, number]>;

export interface ProgrammingParams {
  reps: Record<Goal, RoleReps>;
  beginnerReps: Record<Goal, RoleReps>;
  sets: Record<Experience, { main: number; secondary: number; accessory: number }>;
  strengthMainSets: number;
  rir: Record<Goal, { compound: number; isolation: number }>;
  beginnerRirBonus: number;
  rest: Record<'heavy' | 'compound' | 'isolation' | 'small' | 'none', number>;
  strengthMainRest: number;
  volumeBands: Record<Experience, { major: [number, number]; minor: [number, number] }>;
  majorMuscles: MuscleId[];
  minorMuscles: MuscleId[];
  timing: {
    warmupMin: number;
    mainLiftWarmupMin: number;
    transitionSec: number;
    workSec: { compound: number; isolation: number; conditioning: number };
    timedSetSec: number;
    /** Walking between the two exercises of a superset. */
    supersetSwitchSec: number;
  };
  defaultTrainingDays: Record<string, number[]>;
  blockWeeks: Record<Experience, number>;
  maxSetsPerSlot: number;
}

export const PROGRAMMING = programmingJson as unknown as ProgrammingParams;

const exerciseIndex = new Map(EXERCISES.map((e) => [e.id, e]));
const equipmentIndex = new Map(EQUIPMENT.map((e) => [e.id, e]));
const patternIndex = new Map(PATTERNS.map((p) => [p.id, p]));

export function exerciseById(id: string): ExerciseDef | undefined {
  return exerciseIndex.get(id);
}

export function requireExercise(id: string): ExerciseDef {
  const exercise = exerciseIndex.get(id);
  if (!exercise) throw new Error(`Unknown exercise "${id}"`);
  return exercise;
}

/**
 * A day's finishers worth doing in Atlas: abs and short circuits. Cardio finishers saved in older
 * plans are left out (cardio is tracked elsewhere), without changing the saved plan.
 */
export function liftingExtras(extras: ProgramExtra[] | undefined): ProgramExtra[] | undefined {
  const kept = (extras ?? []).filter((x) => exerciseIndex.get(x.exerciseId)?.kind !== 'cardio').map((x) => ({ ...x }));
  return kept.length ? kept : undefined;
}

export function equipmentDefById(id: string): EquipmentDef | undefined {
  return equipmentIndex.get(id);
}

export function patternById(id: string): PatternDef | undefined {
  return patternIndex.get(id);
}

export function exercisesInPattern(pattern: string): ExerciseDef[] {
  return EXERCISES.filter((e) => e.pattern === pattern).sort((a, b) => b.rank - a.rank);
}

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function gymPresetById(id: string): GymPresetDef | undefined {
  return GYM_PRESETS.find((g) => g.id === id);
}

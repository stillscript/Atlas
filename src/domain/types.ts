import type { CardioMetric, EquipmentCategory, Experience, Goal, SlotRole } from '../db/types';

/**
 * Types for the shipped catalogs in src/data/*.json. The catalogs are data, not code: adding a
 * machine, an exercise or a template should never need a logic change.
 */

// ---------------------------------------------------------------- muscles and movement patterns

export type MuscleId =
  | 'chest'
  | 'back'
  | 'front-delts'
  | 'side-delts'
  | 'rear-delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'calves'
  | 'abs'
  | 'lower-back';

/** Body areas an exercise loads; used to steer away from a flagged pain area. */
export type BodyArea = 'shoulder' | 'elbow' | 'wrist' | 'neck' | 'lower-back' | 'hip' | 'knee' | 'ankle';

export type Vector = 'push' | 'pull' | 'legs' | 'core' | 'conditioning' | 'cardio';

export interface PatternDef {
  id: string;
  name: string;
  vector: Vector;
  /** Patterns to try, in order, when nothing in this one is available. */
  fallbacks: string[];
}

// ---------------------------------------------------------------- equipment

/** Compact load description used in the catalog; expanded into a LoadModel for a real gym. */
export type LoadSpec =
  | { kind: 'stack'; min: number; max: number; step: number; addOns?: number[] }
  | { kind: 'stack'; weights: number[]; addOns?: number[] }
  | { kind: 'plates'; barWeight: number; plates: { weight: number; pairs: number }[] }
  | { kind: 'dumbbells'; weights: number[] }
  | { kind: 'fixed'; weights: number[] }
  | { kind: 'bodyweight'; addedWeights?: number[] }
  | { kind: 'levels'; levels: string[] }
  | { kind: 'none' };

export interface EquipmentDef {
  id: string;
  name: string;
  /** Plain name for the UI ("Leg press" rather than the model name). */
  shortName: string;
  category: EquipmentCategory;
  provides: string[];
  load: LoadSpec;
  verifyLoad?: boolean;
  loadNote?: string;
  settingsFields?: string[];
  cardioMetrics?: CardioMetric[];
  /** Shown in the "what's in your gym" checklist for gyms without a preset. */
  checklist?: boolean;
  /** Where the numbers came from, for anyone checking later. */
  source?: string;
}

export interface GymPresetDef {
  id: string;
  name: string;
  units: 'lb' | 'kg';
  equipment: { catalogId: string; name?: string; load?: LoadSpec; verifyLoad?: boolean }[];
}

// ---------------------------------------------------------------- exercises

/**
 * How the logged number relates to the equipment:
 * - total: the whole load (pin number, Smith bar + plates, one dumbbell held in both hands).
 * - per-hand: one dumbbell's weight when holding two (or doing one arm at a time).
 * - per-side: one stack's pin on a dual-cable machine when both handles are used.
 * - bodyweight: reps only (or added weight when the gym allows it).
 * - none: time or cardio metrics instead of a load.
 */
export type LoadMode = 'total' | 'per-hand' | 'per-side' | 'bodyweight' | 'none';

export type ExerciseKind = 'compound' | 'isolation' | 'conditioning' | 'cardio';
export type RestClass = 'heavy' | 'compound' | 'isolation' | 'small' | 'none';

export interface FormNotes {
  setup: string;
  cues: string[];
  watch: string[];
}

export interface ExerciseDef {
  id: string;
  name: string;
  aka?: string[];
  pattern: string;
  primary: MuscleId[];
  secondary: MuscleId[];
  /** Capability tags that must all be present in the gym. */
  requires: string[];
  /** Which required tag's equipment sets the load (omitted for bodyweight and timed work). */
  loadFrom?: string;
  loadMode: LoadMode;
  metric: 'reps' | 'time' | 'cardio';
  kind: ExerciseKind;
  restClass: RestClass;
  /** Reps are counted per side. */
  unilateral?: boolean;
  /** Default preference within its pattern; higher wins when a template doesn't say. */
  rank: number;
  /** Suggested minimum experience (e.g. hanging leg raises, pull-ups). */
  level?: Experience;
  /**
   * Rough strength relative to the pattern's reference lift, in this exercise's own load units.
   * Used only for a first-time starting estimate after a swap; the first set corrects it.
   */
  ratio?: number;
  /** Conservative first-session load guesses by experience, before calibration. */
  start?: Record<Experience, number>;
  stresses: BodyArea[];
  /** Machine settings worth remembering for this exercise (merged with the machine's own). */
  settings?: string[];
  form: FormNotes;
}

// ---------------------------------------------------------------- templates and programming

export interface TemplateSlotDef {
  id: string;
  pattern: string;
  /** Exercise ids in order of preference; the first one this gym can do wins. */
  prefer?: string[];
  role: SlotRole;
  sets: number;
  reps: [number, number];
  rir?: number;
  purpose?: string;
}

export interface TemplateExtraDef {
  id: string;
  prefer: string[];
  label: string;
  detail?: string;
}

export interface TemplateDayDef {
  id: string;
  name: string;
  subtitle?: string;
  slots: TemplateSlotDef[];
  extras?: TemplateExtraDef[];
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  goals: Goal[];
  daysPerWeek: number;
  blockWeeks: number;
  /** Mon..Sun → day id or null. */
  schedule: (string | null)[];
  days: TemplateDayDef[];
}

/** One day shape for the generator: patterns in priority order, with roles. */
export interface BlueprintDayDef {
  id: string;
  name: string;
  subtitle: string;
  slots: { pattern: string; role: SlotRole; purpose?: string }[];
}

export interface BlueprintDef {
  daysPerWeek: number;
  name: string;
  days: BlueprintDayDef[];
}

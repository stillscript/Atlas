/**
 * Record types stored in IndexedDB.
 *
 * Rules (see CLAUDE.md, "Data safety"):
 * - Only add fields. Never rename or remove one in place; add the new field, migrate, and keep
 *   reading the old one until a migration has copied it.
 * - Every new required field needs a numbered migration that fills it for existing records.
 * - Optional fields can be added without a migration if every reader handles `undefined`.
 */

/** Local calendar date, YYYY-MM-DD. */
export type ISODate = string;
/** Milliseconds since the epoch. */
export type Timestamp = number;

export type Goal = 'muscle' | 'fat-loss' | 'strength' | 'general';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Units = 'lb' | 'kg';
export type ThemePreference = 'system' | 'light' | 'dark';
/** Asked at setup; only sets the plan's default leg exercises. */
export type Sex = 'male' | 'female' | 'unspecified';
/** Leg exercises: free weights (squats, deadlifts, lunges) or machines (leg press, curls, extensions). */
export type LegStyle = 'free-weights' | 'machines';

// ---------------------------------------------------------------- kv store

export interface Profile {
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  /** Preferred training weekdays, 0 = Monday … 6 = Sunday. */
  trainingDays: number[];
  sessionMinutes: number;
  sex?: Sex;
  bodyWeight?: number;
  /** Working sets the user knew at setup (exerciseId → weight × reps). Skipped lifts calibrate. */
  startingLoads?: Record<string, { load: number; reps: number }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Settings {
  units: Units;
  theme: ThemePreference;
  sound: boolean;
  haptics: boolean;
  /** Keep the screen awake during workouts so the rest chime can play. */
  keepAwake: boolean;
  /** Ask the 3-tap readiness check before workouts. Easy to switch off and back on. */
  readinessCheck: boolean;
  /** Ask for a wearable readiness score (Oura, Whoop, Garmin). Off by default. */
  wearableScore: boolean;
  activeGymId?: string;
  activeProgramId?: string;
}

export interface PersistStatus {
  supported: boolean;
  granted: boolean;
  checkedAt: Timestamp;
}

export interface AppMeta {
  installId: string;
  createdAt: Timestamp;
  /** Last app version that ran on this device. Drives "Updated to vX" and What's new. */
  lastSeenVersion?: string;
  persist?: PersistStatus;
  lastBackupAt?: Timestamp;
  backupReminderSnoozedUntil?: Timestamp;
  installGuideDismissedAt?: Timestamp;
  onboardingCompletedAt?: Timestamp;
  /** The workout in progress, if any. Updates never apply while this is set. */
  activeSessionId?: string;
}

export interface KvValues {
  profile: Profile;
  settings: Settings;
  app: AppMeta;
}
export type KvKey = keyof KvValues;
export interface KvRecord<K extends KvKey = KvKey> {
  key: K;
  value: KvValues[K];
}

// ---------------------------------------------------------------- gyms and equipment

/**
 * How a piece of equipment can be loaded. Only loads this model can produce are ever suggested.
 * - stack: selectorized pin weights, plus optional add-on weights that can be stacked on any pin.
 * - plates: a bar (Smith or barbell) plus pairs of plates, loaded evenly on both sides.
 * - dumbbells / fixed: a rack of fixed weights (dumbbells per hand; kettlebells, balls, sandbags).
 * - bodyweight: reps only, optionally with added weight (vest, belt).
 * - levels: named resistance (loop bands), stored as the level's index.
 */
export type LoadModel =
  | { kind: 'stack'; weights: number[]; addOns: number[] }
  | { kind: 'plates'; barWeight: number; plates: { weight: number; pairs: number }[] }
  | { kind: 'dumbbells'; weights: number[] }
  | { kind: 'fixed'; weights: number[] }
  | { kind: 'bodyweight'; addedWeights?: number[] }
  | { kind: 'levels'; levels: string[] }
  | { kind: 'none' };

export type EquipmentCategory = 'machine' | 'cable' | 'free-weight' | 'bodyweight' | 'cardio' | 'support' | 'other';

export interface EquipmentItem {
  id: string;
  /** Catalog entry this came from, if any. */
  catalogId?: string;
  name: string;
  category: EquipmentCategory;
  /** Capability tags exercises look for, e.g. "smith", "cable-dual", "leg-press-machine". */
  provides: string[];
  load: LoadModel;
  /** The weight steps haven't been confirmed on the real machine yet; ask once, on first use. */
  verifyLoad?: boolean;
  /** Something worth knowing about the numbers, e.g. a 2:1 cable ratio. */
  loadNote?: string;
  /** What to remember per exercise on this machine (seat height, pad position…). */
  settingsFields?: string[];
  /** Cardio metrics this machine reports. */
  cardioMetrics?: CardioMetric[];
  notes?: string;
}

export interface Gym {
  id: string;
  name: string;
  presetId?: string;
  units: Units;
  equipment: EquipmentItem[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------- programs

export type SlotRole = 'main' | 'secondary' | 'accessory';

export interface ProgramSlot {
  id: string;
  /** Movement pattern, used to find swaps (e.g. "incline-press"). */
  pattern?: string;
  exerciseId: string;
  role?: SlotRole;
  sets: number;
  repsLow: number;
  repsHigh: number;
  /** Target reps left in the tank. */
  rir?: number;
  restSec?: number;
  /** Lower = more important; kept first when time is short. */
  priority?: number;
  /** Why this exercise is in the plan, in one line ("Side delts: shoulder width"). */
  purpose?: string;
  /** Slots sharing a superset id are done back to back. */
  superset?: string;
  notes?: string;
  /** Set while machine legs replaced this slot's exercise: what it was, restored when switching back. */
  freeWeight?: Pick<ProgramSlot, 'exerciseId' | 'pattern' | 'repsLow' | 'repsHigh' | 'rir' | 'restSec' | 'purpose'>;
}

export interface ProgramExtra {
  id: string;
  exerciseId: string;
  label: string;
  detail?: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  subtitle?: string;
  slots: ProgramSlot[];
  /** Optional finishers (abs, short circuits). Older plans may hold cardio ones, which are skipped. */
  extras?: ProgramExtra[];
}

export interface Program {
  id: string;
  name: string;
  templateId?: string;
  /** Gym the exercises were picked for. */
  gymId?: string;
  goal: Goal;
  /** Missing on plans made before this setting existed: those are free weights. */
  legStyle?: LegStyle;
  days: ProgramDay[];
  /** Mon..Sun → ProgramDay id, or null for rest. */
  schedule: (string | null)[];
  /**
   * Training blocks: `lengthWeeks` normal weeks, then a lighter week. The Coach moves `startDate`
   * to take the lighter week early, and records a one-time push-back in `postponedWeeks`.
   */
  block: { startDate: ISODate; lengthWeeks: number; postponedWeeks?: number };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------- exercises (user-defined)

export interface CustomExercise {
  id: string;
  name: string;
  pattern?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipmentCatalogIds: string[];
  createdAt: Timestamp;
}

// ---------------------------------------------------------------- sessions

/** Reps left in the tank after a set. 4 means "4 or more". */
export type RepsInReserve = 0 | 1 | 2 | 3 | 4;

export interface SetLog {
  id: string;
  kind: 'work' | 'warmup';
  /** Total load for the set in the gym's units; null for bodyweight-only. */
  load: number | null;
  reps: number;
  rir?: RepsInReserve;
  /** Seconds actually rested before this set. */
  restTakenSec?: number;
  pain?: boolean;
  at: Timestamp;
}

/** Why a weight was suggested, so the UI (and the Coach) can explain it. */
export type SuggestionReason = 'history' | 'known' | 'calibrate' | 'swap' | 'bodyweight' | 'none' | 'coach' | 'lighter-week' | 'return';

export interface ExerciseEntry {
  id: string;
  slotId?: string;
  exerciseId: string;
  equipmentId?: string;
  role?: SlotRole;
  /** Entries sharing a superset id are done back to back, one round at a time. */
  superset?: string;
  /** Set when "Station taken?" swapped this entry from another exercise. */
  swappedFromExerciseId?: string;
  target?: {
    sets: number;
    repsLow: number;
    repsHigh: number;
    rir?: number;
    /** Suggested first-set load (null for bodyweight or when unknown). */
    load?: number | null;
    /** Suggested reps for the first set (seconds for timed exercises). */
    firstReps?: number;
    restSec?: number;
    reason?: SuggestionReason;
    /** First exposures (Coach rule A1): each set's rating sets the next set's weight. */
    calibrating?: boolean;
    /** The Coach recommendation this target came from, if any. */
    coachId?: string;
  };
  sets: SetLog[];
  skipped?: boolean;
  notes?: string;
  /** A Coach suggestion not yet decided: shown on the exercise with Use / Keep. */
  coachOffer?: { recommendationId: string; load: number | null; repsLow: number; repsHigh: number; swapTo?: string };
  /** Accepted in-session adjustment (B1/B2): the next set's weight and reps. Cleared once used. */
  nextSet?: { load: number | null; reps: number };
}

export type CardioMetric = 'duration' | 'distance' | 'calories' | 'watts' | 'level' | 'floors' | 'pace' | 'intervals';

export interface CardioEntry {
  id: string;
  exerciseId: string;
  equipmentId?: string;
  /** The program extra (finisher) this logs, if any. */
  extraId?: string;
  durationSec?: number;
  distanceM?: number;
  calories?: number;
  avgWatts?: number;
  level?: number;
  floors?: number;
  intervals?: { workSec: number; restSec: number; rounds: number };
  at: Timestamp;
}

/** Before a workout. For all three, 1 is the worst answer and 3 the best (soreness 3 = not sore). */
export interface ReadinessCheck {
  sleep: 1 | 2 | 3;
  energy: 1 | 2 | 3;
  soreness: 1 | 2 | 3;
  wearable?: number;
  at: Timestamp;
}

export interface PainReport {
  area: string;
  side?: 'left' | 'right' | 'both';
  exerciseId?: string;
}

export interface CheckOut {
  feel: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3;
  pain: PainReport[];
  note?: string;
  at: Timestamp;
}

export interface Session {
  id: string;
  date: ISODate;
  status: 'active' | 'completed' | 'abandoned';
  gymId?: string;
  programId?: string;
  dayId?: string;
  /** Snapshot of the session's name, so history reads right even if the plan changes. */
  dayName?: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  entries: ExerciseEntry[];
  cardio: CardioEntry[];
  /** Finishers from the plan (cardio or a short circuit), and which ones are done. */
  extras?: ProgramExtra[];
  extrasDone?: string[];
  /** A running interval timer for cardio, stored as a start time so it survives the phone locking. */
  intervalTimer?: { extraId?: string; exerciseId: string; startedAt: Timestamp; workSec: number; restSec: number; rounds: number };
  readiness?: ReadinessCheck;
  checkout?: CheckOut;
  /** Where the user is, so a reopened app resumes exactly here. */
  cursor?: { entryIndex: number; setIndex: number };
  /** A running rest timer, stored as an end time so it survives the phone locking. */
  rest?: { startedAt: Timestamp; endsAt: Timestamp; durationSec: number };
  /** Coach recommendation ids applied to this session. */
  coachApplied?: string[];
  /** In-session Coach prompts already shown (one per exercise, rule B1/B2). */
  coachPrompts?: string[];
  /** A different version of the day: lighter (readiness), short (time or readiness), lighter week, return ramp. */
  variant?: 'lighter' | 'short' | 'cardio' | 'lighter-week' | 'return';
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------- body, machine settings, coach log

export interface Measurement {
  id: string;
  date: ISODate;
  weight?: number;
  waist?: number;
  shoulders?: number;
  chest?: number;
  arm?: number;
  thigh?: number;
  photoTaken?: boolean;
  note?: string;
  at: Timestamp;
}

export interface MachineSetting {
  /** `${gymId}:${equipmentId}:${exerciseId}` */
  id: string;
  gymId: string;
  equipmentId: string;
  exerciseId: string;
  fields: { label: string; value: string }[];
  note?: string;
  updatedAt: Timestamp;
}

export interface CoachLogEntry {
  id: string;
  at: Timestamp;
  kind: 'shown' | 'decision';
  recommendationId: string;
  ruleId: string;
  /** Insight key used for repetition control, e.g. "progress.load-up:leg-press". */
  key: string;
  /** Hash of the facts behind the message; a changed fingerprint means the situation moved. */
  fingerprint: string;
  decision?: 'applied' | 'dismissed' | 'used' | 'kept';
  /** Which phrasing variant was shown, so it isn't reused soon. */
  variant?: string;
}

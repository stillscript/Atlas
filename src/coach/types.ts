import type {
  CoachLogEntry,
  Gym,
  Measurement,
  Profile,
  Program,
  ProgramDay,
  ReadinessCheck,
  Session,
  Settings,
  SlotRole,
} from '../db/types';
import type { MuscleId } from '../domain/types';

/**
 * The Coach's contract. The engine is pure: `CoachInput` in, `Recommendation`s out, no database,
 * no clock (`now` is passed in). Wording is a separate step (`render.ts`), so another renderer (a
 * future AI layer, for one) can word the same structured recommendations without touching the rules.
 */

export type Moment = 'today' | 'in-session' | 'post-session' | 'weekly';

export type Confidence = 'low' | 'medium' | 'high';

/** Rule ids from docs/coach-proposal.md. */
export type RuleId =
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'A5'
  | 'B1'
  | 'B2'
  | 'B3'
  | 'C1'
  | 'C2'
  | 'D'
  | 'E1'
  | 'E3'
  | 'F2'
  | 'G1'
  | 'G2'
  | 'G3'
  | 'G4'
  | 'H3'
  | 'H3P'
  | 'J1'
  | 'K'
  | 'T';

/** Insight families, for rotation in reviews. */
export type InsightType = 'progress' | 'programming' | 'recovery' | 'technique' | 'consistency' | 'safety';

export interface CoachInput {
  profile: Profile;
  program: Program;
  gym: Gym;
  /** Finished workouts, any order. */
  sessions: Session[];
  /** The workout in progress, if any. */
  active?: Session | null;
  measurements: Measurement[];
  log: CoachLogEntry[];
  settings: Pick<Settings, 'readinessCheck' | 'wearableScore'>;
}

/** What a recommendation would change. The engine never applies it; the app does, on Apply/Use. */
export type Change =
  /** Next time this exercise comes up: weight, rep target (and sets/effort for special days). */
  | {
      kind: 'next-exposure';
      exerciseId: string;
      from: number | null;
      to: number | null;
      repsLow: number;
      repsHigh: number;
      /** Rep target to beat (A6: one number for beginners). */
      beat?: number;
      sets?: number;
      rir?: number;
      swapTo?: string;
    }
  /** The rest of today's sets on the current exercise (in-session offers). */
  | { kind: 'next-sets'; entryId: string; load: number | null; reps: number; sets: number }
  /** A program edit: a slot's rep range, sets, or exercise. */
  | {
      kind: 'slot';
      dayId: string;
      slotId: string;
      exerciseId: string;
      sets?: { from: number; to: number };
      reps?: { fromLow: number; fromHigh: number; toLow: number; toHigh: number };
      swapTo?: string;
    }
  /** Take the lighter week now, or push the scheduled one back. */
  | { kind: 'lighter-week'; action: 'now' | 'postpone'; weeks?: number }
  /** A different version of today's session. */
  | { kind: 'session-variant'; variant: SessionVariant; minutes?: number }
  /** Do a missed session today. */
  | { kind: 'do-missed'; dayId: string }
  /** Nothing to apply: information, a win, or a safety note. */
  | { kind: 'info' };

export type SessionVariant = 'lighter' | 'short' | 'cardio';

export type Decision = 'applied' | 'dismissed' | 'used' | 'kept';

export interface Recommendation {
  /** Stable: rule + subject + fingerprint. The same situation always gets the same id. */
  id: string;
  rule: RuleId;
  /** Variant of the rule's message ("up", "hold", "lower"…). Picks the phrase set. */
  variant: string;
  /** Repetition key: rule + subject (no fingerprint). */
  key: string;
  /** The facts behind it, hashed: a changed fingerprint means the situation moved. */
  fingerprint: string;
  type: InsightType;
  /** Lower is more important. */
  priority: number;
  subject: { exerciseId?: string; dayId?: string; slotId?: string; muscle?: MuscleId; area?: string };
  change: Change;
  /** The numbers the message is built from. */
  facts: Record<string, string | number>;
  confidence: Confidence;
  /** How many exposures or sessions this read is based on (weeks, for whole-plan advice). */
  basis: number;
  basisUnit?: 'sessions' | 'weeks';
  /** Which buttons the card shows ("swap" uses `change.swapTo`). */
  actions: ('apply' | 'dismiss' | 'use' | 'keep' | 'swap')[];
  safety?: boolean;
}

export type WinKind = 'pr-max' | 'pr-reps' | 'pr-load' | 'streak' | 'trend' | 'fat-loss' | 'comeback' | 'all-done';

export interface Win {
  id: string;
  kind: WinKind;
  exerciseId?: string;
  facts: Record<string, string | number>;
}

/** Per-exercise numbers for one finished workout. */
export interface Exposure {
  sessionId: string;
  at: number;
  date: string;
  exerciseId: string;
  slotId?: string;
  role?: SlotRole;
  repsLow: number;
  repsHigh: number;
  targetRir: number;
  /** Working sets (load > 0 or bodyweight), in order. */
  sets: { load: number | null; reps: number; rir?: number; pain?: boolean; restTakenSec?: number }[];
  /** Heaviest load used. */
  top: number | null;
  /** Best estimated max (with reps left; ratings inferred where missing). */
  e1rm: number;
  /** Best estimated max from reps actually done (for records). */
  e1rmDone: number;
  rated: number;
  calibrating: boolean;
  variant?: Session['variant'];
  pain: boolean;
}

export interface FatigueSignals {
  effortCreep: string[];
  dip: string[];
  readinessLow: boolean;
  checkoutLow: boolean;
  pain: string[];
  count: number;
  /** Enough data for whole-program calls (2+ weeks across 3+ lifts). */
  enoughData: boolean;
}

export interface ReturnState {
  tier: 0 | 1 | 2 | 3 | 4;
  daysOff: number;
  /** Sessions done since coming back. */
  sessionsSince: number;
  loadFactor: number;
  setsDrop: number;
  rir?: number;
  noIncrease: boolean;
  recalibrate: boolean;
}

/** Everything about today's session the Coach would adjust, for the workout to use. */
export interface SessionPlan {
  dayId: string;
  variant?: SessionVariant;
  lighterWeek: boolean;
  returnTier: number;
  /** Per slot: what the Coach suggests, and whether it's already decided. */
  slots: Record<string, SlotPlan>;
  /** A shortened day (G2/C2), when chosen. */
  day?: ProgramDay;
}

export interface SlotPlan {
  slotId: string;
  exerciseId: string;
  /** Reps to beat on the first set (double progression). */
  beat?: number;
  /**
   * Applied automatically: the session is built with these. Lighter weeks and return ramps are
   * part of the plan; "coach" is the follow-through of an already-applied change (a new rep range).
   */
  auto?: {
    load?: number | null;
    sets?: number;
    rir?: number;
    repsLow?: number;
    repsHigh?: number;
    calibrate?: boolean;
    reason: 'lighter-week' | 'return' | 'readiness' | 'coach';
  };
  /** A Coach suggestion for this exercise, applied if decided, offered in the workout if not. */
  offer?: { recommendationId: string; load: number | null; repsLow: number; repsHigh: number; beat?: number; swapTo?: string; rir?: number; decided?: Decision };
}

export interface WeeklyReview {
  weekStart: string;
  planned: number;
  done: number;
  cardioMinutes: number;
  streakWeeks: number;
  muscles: { muscle: MuscleId; planned: number; done: number; band: [number, number] }[];
  keyLifts: { exerciseId: string; e1rm: number; change: number | null; exposures: number }[];
  fatigue: FatigueSignals;
  records: Win[];
}

export interface ReadinessOffer {
  recommendation: Recommendation;
  variant: SessionVariant;
}

export type { MuscleId, ReadinessCheck };

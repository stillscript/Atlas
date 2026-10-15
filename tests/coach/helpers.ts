import type { CoachInput } from '../../src/coach/types';
import type {
  CheckOut,
  CoachLogEntry,
  Measurement,
  Profile,
  Program,
  ProgramSlot,
  ReadinessCheck,
  RepsInReserve,
  Session,
  SlotRole,
} from '../../src/db/types';
import { createGymFromPreset } from '../../src/domain/gym';
import { toISODate } from '../../src/lib/format';

/**
 * Synthetic training histories for Coach tests. Everything is relative to T0 (Wednesday
 * 14 Oct 2026, 17:00 local), so "3 days ago" reads naturally in tests.
 */

export const DAY = 86_400_000;
export const T0 = new Date(2026, 9, 14, 17).getTime();
export const daysAgo = (n: number) => T0 - n * DAY;

export const office = createGymFromPreset('office', daysAgo(120));

export function slot(id: string, exerciseId: string, role: SlotRole, sets: number, repsLow: number, repsHigh: number, rir = 2, restSec = 120): ProgramSlot {
  return { id, exerciseId, role, sets, repsLow, repsHigh, rir, restSec };
}

/** Two days: A (press, legs, pull, laterals) and B (shoulders, rows, legs). Mon A, Wed B, Fri A. */
export function makeProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: 'prog',
    name: 'Test plan',
    goal: 'muscle',
    days: [
      {
        id: 'a',
        name: 'Day A',
        slots: [
          slot('a-press', 'smith-incline-press', 'main', 3, 8, 10, 2, 150),
          slot('a-legs', 'leg-press', 'secondary', 3, 10, 12, 2, 120),
          slot('a-pull', 'lat-pulldown', 'secondary', 3, 10, 12, 2, 120),
          slot('a-lat', 'db-lateral-raise', 'accessory', 3, 12, 15, 1, 60),
        ],
      },
      {
        id: 'b',
        name: 'Day B',
        slots: [
          slot('b-ohp', 'machine-shoulder-press', 'main', 3, 8, 10, 2, 150),
          slot('b-row', 'seated-row-machine', 'secondary', 3, 10, 12, 2, 120),
          slot('b-curl', 'machine-leg-curl', 'accessory', 3, 12, 15, 1, 75),
        ],
      },
    ],
    schedule: ['a', null, 'b', null, 'a', null, null],
    block: { startDate: '2026-09-07', lengthWeeks: 6 },
    createdAt: daysAgo(60),
    updatedAt: daysAgo(60),
    ...overrides,
  };
}

export const profile = (overrides: Partial<Profile> = {}): Profile => ({
  goal: 'muscle',
  experience: 'intermediate',
  daysPerWeek: 3,
  trainingDays: [0, 2, 4],
  sessionMinutes: 60,
  createdAt: daysAgo(90),
  updatedAt: daysAgo(90),
  ...overrides,
});

export interface EntrySpec {
  ex: string;
  slot?: string;
  role?: SlotRole;
  range?: [number, number];
  rir?: number;
  /** [load, reps, reps left?] per set. */
  sets: [number | null, number, RepsInReserve?][];
  rest?: number;
  calibrating?: boolean;
  /** Set indices flagged with pain. */
  pain?: number[];
  restTaken?: number[];
}

let counter = 0;

export function workout(
  ago: number,
  entries: EntrySpec[],
  extra: { readiness?: Omit<ReadinessCheck, 'at'>; checkout?: Omit<CheckOut, 'at'>; variant?: Session['variant']; dayId?: string } = {},
): Session {
  const at = daysAgo(ago) - 2 * 3_600_000;
  counter++;
  return {
    id: `s${counter}-${ago}`,
    date: toISODate(new Date(at)),
    status: 'completed',
    dayId: extra.dayId,
    startedAt: at,
    endedAt: at + 3_600_000,
    variant: extra.variant,
    readiness: extra.readiness ? { ...extra.readiness, at } : undefined,
    checkout: extra.checkout ? { ...extra.checkout, at: at + 3_600_000 } : undefined,
    entries: entries.map((e, i) => ({
      id: `e${counter}-${i}`,
      slotId: e.slot,
      exerciseId: e.ex,
      role: e.role,
      target: {
        sets: e.sets.length,
        repsLow: e.range?.[0] ?? 8,
        repsHigh: e.range?.[1] ?? 12,
        rir: e.rir ?? 2,
        restSec: e.rest,
        calibrating: e.calibrating,
      },
      sets: e.sets.map(([load, reps, rir], k) => ({
        id: `x${counter}-${i}-${k}`,
        kind: 'work' as const,
        load,
        reps,
        rir,
        pain: e.pain?.includes(k) || undefined,
        restTakenSec: e.restTaken?.[k],
        at: at + (i * 10 + k) * 120_000,
      })),
    })),
    cardio: [],
    updatedAt: at + 3_600_000,
  };
}

/** Same exercise, same sets, on several past days (oldest first in the result). */
export function repeat(agos: number[], spec: EntrySpec): Session[] {
  return agos.map((ago) => workout(ago, [spec]));
}

export function input(sessions: Session[], overrides: Partial<CoachInput> = {}): CoachInput {
  return {
    profile: profile(),
    program: makeProgram(),
    gym: office,
    sessions,
    measurements: [],
    log: [],
    settings: { readinessCheck: true, wearableScore: false },
    ...overrides,
  };
}

export function weights(entries: [number, number][]): Measurement[] {
  return entries.map(([ago, weight], i) => ({ id: `m${i}`, date: toISODate(new Date(daysAgo(ago))), weight, at: daysAgo(ago) }));
}

export function shown(recommendationId: string, ruleId: string, key: string, fingerprint: string, at: number, variant?: string): CoachLogEntry {
  return { id: `log-${recommendationId}-${at}`, at, kind: 'shown', recommendationId, ruleId, key, fingerprint, variant };
}

export function decided(recommendationId: string, ruleId: string, decision: CoachLogEntry['decision'], at = T0 - DAY): CoachLogEntry {
  return { id: `dec-${recommendationId}-${at}`, at, kind: 'decision', recommendationId, ruleId, key: '', fingerprint: '', decision };
}

// Common lifts: incline on the Smith (35 bar, 25s and 45s), leg press (10 lb steps), pulldown (10s + 5).
export const press = (sets: EntrySpec['sets'], extra: Partial<EntrySpec> = {}): EntrySpec => ({ ex: 'smith-incline-press', slot: 'a-press', role: 'main', range: [8, 10], sets, ...extra });
export const legs = (sets: EntrySpec['sets'], extra: Partial<EntrySpec> = {}): EntrySpec => ({ ex: 'leg-press', slot: 'a-legs', role: 'secondary', range: [10, 12], sets, ...extra });
export const pull = (sets: EntrySpec['sets'], extra: Partial<EntrySpec> = {}): EntrySpec => ({ ex: 'lat-pulldown', slot: 'a-pull', role: 'secondary', range: [10, 12], sets, ...extra });
export const lateral = (sets: EntrySpec['sets'], extra: Partial<EntrySpec> = {}): EntrySpec => ({ ex: 'db-lateral-raise', slot: 'a-lat', role: 'accessory', range: [12, 15], rir: 1, sets, ...extra });

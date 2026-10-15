import type { Measurement, Program, Session } from '../db/types';
import { exerciseById } from '../domain/catalog';
import { addDays, mondayOf } from '../domain/schedule';
import { estimateMax } from '../domain/strength';
import type { MuscleId } from '../domain/types';
import { toISODate } from '../lib/format';
import { T } from './knowledge';
import type { Confidence, Exposure, FatigueSignals, ReturnState } from './types';

/**
 * The Coach's core measures (proposal section 2): exposures per lift with estimated max,
 * confidence, return-from-break state, fatigue signals, weekly sets, streaks and weight trend.
 * Pure functions over finished sessions.
 */

export const DAY_MS = 86_400_000;

/** Lifting sessions (at least one logged work set), oldest first. */
export function liftingSessions(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.status === 'completed' && s.entries.some((e) => e.sets.some((x) => x.kind === 'work' && x.reps > 0)))
    .sort((a, b) => a.startedAt - b.startedAt);
}

/** Reps left for a set, inferred when it wasn't rated: target hit ≈ target, short of the range = 0. */
export function inferredRir(set: { reps: number; rir?: number }, repsLow: number, repsHigh: number, targetRir: number): number {
  if (set.rir !== undefined) return set.rir;
  if (set.reps < repsLow) return 0;
  if (set.reps >= repsHigh) return targetRir;
  return targetRir;
}

/** Every finished exposure of every exercise, oldest first. */
export function exposuresByExercise(sessions: Session[]): Map<string, Exposure[]> {
  const map = new Map<string, Exposure[]>();
  for (const session of liftingSessions(sessions)) {
    for (const entry of session.entries) {
      const sets = entry.sets.filter((s) => s.kind === 'work' && s.reps > 0);
      if (!sets.length) continue;
      const repsLow = entry.target?.repsLow ?? Math.min(...sets.map((s) => s.reps));
      const repsHigh = entry.target?.repsHigh ?? Math.max(...sets.map((s) => s.reps));
      // Calibration aimed a rep softer; judge against the plan's own effort target.
      const targetRir = Math.max(0, (entry.target?.rir ?? 2) - (entry.target?.calibrating ? 1 : 0));
      let e1rm = 0;
      let e1rmDone = 0;
      for (const set of sets) {
        if (set.load === null || set.load <= 0) continue;
        e1rm = Math.max(e1rm, estimateMax(set.load, set.reps, inferredRir(set, repsLow, repsHigh, targetRir)));
        e1rmDone = Math.max(e1rmDone, estimateMax(set.load, set.reps));
      }
      const loads = sets.map((s) => s.load).filter((l): l is number => l !== null);
      const exposure: Exposure = {
        sessionId: session.id,
        at: session.startedAt,
        date: session.date,
        exerciseId: entry.exerciseId,
        slotId: entry.slotId,
        role: entry.role,
        repsLow,
        repsHigh,
        targetRir,
        sets: sets.map((s) => ({ load: s.load, reps: s.reps, rir: s.rir, pain: s.pain, restTakenSec: s.restTakenSec })),
        top: loads.length ? Math.max(...loads) : null,
        e1rm,
        e1rmDone,
        rated: sets.filter((s) => s.rir !== undefined).length,
        calibrating: Boolean(entry.target?.calibrating),
        variant: session.variant,
        pain: sets.some((s) => s.pain) || Boolean(session.checkout?.pain.some((p) => p.exerciseId === entry.exerciseId)),
      };
      const list = map.get(entry.exerciseId) ?? [];
      list.push(exposure);
      map.set(entry.exerciseId, list);
    }
  }
  return map;
}

/** Exposures that reflect normal training (not lighter days, lighter weeks or return ramps). */
export function normalExposures(list: Exposure[]): Exposure[] {
  return list.filter((e) => !e.variant || e.variant === 'short');
}

/** The working sets: the ones at the top load (all sets for bodyweight work). */
export function workingSets(exposure: Exposure): Exposure['sets'] {
  if (exposure.top === null) return exposure.sets;
  return exposure.sets.filter((s) => s.load === exposure.top);
}

export function confidenceFor(list: Exposure[], now: number): Confidence {
  const c = T.confidence;
  const recent = list.slice(-6);
  const sets = recent.flatMap((e) => e.sets);
  const ratedShare = sets.length ? sets.filter((s) => s.rir !== undefined).length / sets.length : 0;
  const last = list[list.length - 1];
  const stale = !last || (now - last.at) / DAY_MS > c.staleDays;
  if (list.length < c.mediumExposures || ratedShare < c.lowRatedShare || stale) return 'low';
  const missedRecently = list.slice(-3).some((e) => e.sets.some((s) => s.reps < e.repsLow));
  if (list.length >= c.highExposures && ratedShare >= c.highRatedShare && !missedRecently) return 'high';
  return 'medium';
}

// ---------------------------------------------------------------- breaks

/**
 * Where we are relative to the last break (G3). `breakEndedBefore` is the start time of the last
 * session before the break, so callers can find each lift's pre-break numbers.
 */
export function returnState(sessions: Session[], now: number): ReturnState & { breakStartedAt?: number } {
  const times = liftingSessions(sessions).map((s) => s.startedAt);
  const none: ReturnState = { tier: 0, daysOff: 0, sessionsSince: 0, loadFactor: 1, setsDrop: 0, noIncrease: false, recalibrate: false };
  if (!times.length) return none;
  const tiers = T.return;
  const tierFor = (days: number) => {
    let index = -1;
    tiers.forEach((t, i) => {
      if (days >= t.fromDays) index = i;
    });
    return index;
  };
  const make = (days: number, since: number, breakStartedAt: number) => {
    const index = tierFor(days);
    const def = tiers[index];
    if (!def || since >= def.loads.length) return { ...none, daysOff: Math.floor(days) };
    return {
      tier: (index + 1) as ReturnState['tier'],
      daysOff: Math.floor(days),
      sessionsSince: since,
      loadFactor: def.loads[since]!,
      setsDrop: since === 0 ? def.setsDrop : 0,
      rir: def.rir,
      noIncrease: Boolean(def.noIncrease),
      recalibrate: Boolean(def.recalibrate) && since === 0,
      breakStartedAt,
    };
  };
  const last = times[times.length - 1]!;
  const gapNow = (now - last) / DAY_MS;
  if (gapNow >= tiers[0]!.fromDays) return make(gapNow, 0, last);
  for (let i = times.length - 1; i >= 1; i--) {
    const gap = (times[i]! - times[i - 1]!) / DAY_MS;
    if (gap >= tiers[1]!.fromDays) return make(gap, times.length - i, times[i - 1]!);
    // Only look back as far as a ramp could still be running.
    if (times.length - i >= 4) break;
  }
  return none;
}

// ---------------------------------------------------------------- fatigue

const isPoorReadiness = (r: NonNullable<Session['readiness']>) => [r.sleep, r.energy, r.soreness].filter((v) => v === 1).length >= 2;

export function fatigueSignals(
  sessions: Session[],
  exposures: Map<string, Exposure[]>,
  now: number,
  readinessOn: boolean,
): FatigueSignals {
  const f = T.fatigue;
  const since = now - f.windowDays * DAY_MS;
  const lifting = liftingSessions(sessions);
  const effortCreep: string[] = [];
  const dip: string[] = [];
  let dipCandidates = 0;
  const pain: string[] = [];

  for (const [exerciseId, all] of exposures) {
    const list = normalExposures(all);
    const last = list[list.length - 1];
    if (!last || last.at < since) continue;
    const prev = list[list.length - 2];
    if (prev && last.top !== null && prev.top !== null && last.rated && prev.rated) {
      const avgRir = (e: Exposure) => {
        const rated = e.sets.filter((s) => s.rir !== undefined);
        return rated.reduce((sum, s) => sum + (s.rir ?? 0), 0) / rated.length;
      };
      const topReps = (e: Exposure) => Math.max(...workingSets(e).map((s) => s.reps));
      if (last.top <= prev.top && topReps(last) <= topReps(prev) && avgRir(last) <= avgRir(prev) - 1) effortCreep.push(exerciseId);
    }
    if (list.length >= 4 && last.e1rm > 0) {
      dipCandidates++;
      const previous = list.slice(-4, -1);
      const average = previous.reduce((sum, e) => sum + e.e1rm, 0) / previous.length;
      if (last.e1rm <= average * (1 - f.dipPercent)) dip.push(exerciseId);
    }
  }
  for (const [exerciseId, list] of exposures) if (list.some((e) => e.at >= since && e.pain)) pain.push(exerciseId);

  const readinessChecks = lifting.filter((s) => s.readiness).slice(-f.readinessWindow);
  const readinessLow = readinessOn && readinessChecks.filter((s) => isPoorReadiness(s.readiness!)).length >= f.readinessLowCount;
  const checkouts = lifting.filter((s) => s.checkout).slice(-f.checkoutWindow);
  const checkoutLow = checkouts.filter((s) => s.checkout!.feel === 1 || s.checkout!.energy === 1).length >= f.checkoutLowCount;

  const signals = {
    effortCreep: effortCreep.length >= f.effortCreepLifts,
    dip: dipCandidates >= f.dipMinLifts && dip.length / dipCandidates >= f.dipShare,
    readinessLow,
    checkoutLow,
    pain: pain.length >= f.painLifts,
  };
  const first = lifting[0];
  const enoughData = Boolean(first) && (now - first!.startedAt) / DAY_MS >= f.minDataDays && exposures.size >= f.minLifts;
  return {
    effortCreep: signals.effortCreep ? effortCreep : [],
    dip: signals.dip ? dip : [],
    readinessLow,
    checkoutLow,
    pain: signals.pain ? pain : [],
    count: Object.values(signals).filter(Boolean).length,
    enoughData,
  };
}

export function isPoorReadinessCheck(readiness: NonNullable<Session['readiness']>): boolean {
  return isPoorReadiness(readiness);
}

// ---------------------------------------------------------------- weeks

export function weekStart(at: number | Date): Date {
  return mondayOf(new Date(at));
}

/** Fractional sets per muscle actually done in a week (primary 1, assisting 0.5). */
export function weeklySetsDone(sessions: Session[], monday: Date): Map<MuscleId, number> {
  const from = monday.getTime();
  const to = addDays(monday, 7).getTime();
  const totals = new Map<MuscleId, number>();
  for (const session of liftingSessions(sessions)) {
    if (session.startedAt < from || session.startedAt >= to) continue;
    for (const entry of session.entries) {
      const exercise = exerciseById(entry.exerciseId);
      if (!exercise || exercise.kind === 'cardio') continue;
      const done = entry.sets.filter((s) => s.kind === 'work' && s.reps > 0).length;
      for (const m of exercise.primary) totals.set(m, (totals.get(m) ?? 0) + done);
      for (const m of exercise.secondary) totals.set(m, (totals.get(m) ?? 0) + done * 0.5);
    }
  }
  return totals;
}

export function plannedSessionsPerWeek(program: Program): number {
  return program.schedule.filter((d) => d !== null).length;
}

/** Workouts (lifting or cardio) done in a week. */
export function sessionsInWeek(sessions: Session[], monday: Date): Session[] {
  const from = monday.getTime();
  const to = addDays(monday, 7).getTime();
  return sessions.filter((s) => s.status === 'completed' && s.startedAt >= from && s.startedAt < to);
}

/**
 * Weeks in a row with every planned session done (G4; ≥2 sessions counts for general fitness).
 * The current week counts once it's complete; an unfinished current week doesn't break the streak.
 */
export function streakWeeks(program: Program, sessions: Session[], now: number, generalFitness: boolean): number {
  const needed = generalFitness ? Math.min(2, plannedSessionsPerWeek(program)) : plannedSessionsPerWeek(program);
  if (needed === 0) return 0;
  const lifting = liftingSessions(sessions);
  const first = lifting[0];
  if (!first) return 0;
  let monday = weekStart(now);
  let streak = 0;
  if (sessionsInWeek(lifting, monday).length >= needed) streak++;
  monday = addDays(monday, -7);
  while (monday.getTime() >= weekStart(first.startedAt).getTime()) {
    if (sessionsInWeek(lifting, monday).length >= needed) streak++;
    else break;
    monday = addDays(monday, -7);
  }
  return streak;
}

// ---------------------------------------------------------------- body weight

export interface WeightTrend {
  /** Weekly change as a fraction of body weight (negative = losing), per recent week, oldest first. */
  weeklyChanges: number[];
  latest: number;
  /** Change over the measured span. */
  totalChange: number;
  weeks: number;
}

/** Weekly averages of logged body weight, smoothed by averaging within each week. */
export function weightTrend(measurements: Measurement[], now: number): WeightTrend | null {
  const entries = measurements.filter((m) => typeof m.weight === 'number' && m.weight! > 0 && m.at <= now).sort((a, b) => a.at - b.at);
  if (entries.length < T.weight.minEntries) return null;
  const byWeek = new Map<string, number[]>();
  for (const m of entries) {
    const key = toISODate(weekStart(m.at));
    byWeek.set(key, [...(byWeek.get(key) ?? []), m.weight!]);
  }
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => values.reduce((s, v) => s + v, 0) / values.length);
  if (weeks.length < 2) return null;
  const weeklyChanges = weeks.slice(1).map((w, i) => (w - weeks[i]!) / weeks[i]!);
  return { weeklyChanges, latest: entries[entries.length - 1]!.weight!, totalChange: weeks[weeks.length - 1]! - weeks[0]!, weeks: weeks.length - 1 };
}

// ---------------------------------------------------------------- helpers

/** A short, stable hash of the facts behind a recommendation (FNV-1a, base 36). */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function daysBetween(a: number, b: number): number {
  return Math.floor(Math.abs(b - a) / DAY_MS);
}

import { exposuresByExercise, liftingSessions, weekStart } from '../coach/measures';
import type { Exposure, Win } from '../coach/types';
import { sessionRecords } from '../coach/wins';
import type { Measurement, Program, Session } from '../db/types';
import { toISODate } from '../lib/format';
import { requireExercise } from './catalog';
import { addDays, weekdayIndex } from './schedule';

/**
 * Progress (stage 5): the training calendar, per-exercise trends and records, and body
 * measurements. Built on the Coach's own measures (coach/measures, coach/wins), so the numbers
 * on Progress and in the Coach always agree. Pure functions.
 */

const DAY = 86_400_000;

// ---------------------------------------------------------------- weeks

export interface DayCell {
  date: string;
  planned: boolean;
  done: boolean;
  today: boolean;
  future: boolean;
}

export interface WeekSummary {
  start: string;
  planned: number;
  done: number;
  cardio: number;
  complete: boolean;
  days: DayCell[];
}

/**
 * The last `count` weeks (oldest first), day by day: planned, done, today. Days before the plan
 * existed count as unplanned, so nobody "missed" sessions they never had.
 */
export function weekHistory(program: Program, sessions: Session[], now: number, count = 8): WeekSummary[] {
  const done = sessions.filter((s) => s.status === 'completed');
  const byDate = new Map<string, Session[]>();
  for (const s of done) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const planStart = new Date(program.createdAt);
  planStart.setHours(0, 0, 0, 0);
  const today = toISODate(new Date(now));
  const thisMonday = weekStart(now);
  const weeks: WeekSummary[] = [];
  for (let w = count - 1; w >= 0; w--) {
    const monday = addDays(thisMonday, -7 * w);
    const days: DayCell[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      const iso = toISODate(date);
      const daySessions = byDate.get(iso) ?? [];
      return {
        date: iso,
        planned: date >= planStart && program.schedule[weekdayIndex(date)] !== null,
        done: daySessions.length > 0,
        today: iso === today,
        future: iso > today,
      };
    });
    const weekSessions = days.flatMap((d) => byDate.get(d.date) ?? []);
    const lifting = liftingSessions(weekSessions).length;
    const planned = days.filter((d) => d.planned).length;
    weeks.push({
      start: toISODate(monday),
      planned,
      done: lifting,
      cardio: weekSessions.filter((s) => s.cardio.length > 0).length,
      complete: planned > 0 && lifting >= planned,
      days,
    });
  }
  return weeks;
}

// ---------------------------------------------------------------- exercises

export interface ExerciseSummary {
  exerciseId: string;
  name: string;
  exposures: number;
  lastAt: number;
  bodyweight: boolean;
  /** Best estimated max (reps actually done), or best reps in a set for bodyweight work. */
  best: number;
  latest: number;
  /** Change in the headline number over about 4 weeks (null without enough history). */
  change: number | null;
  /** Recent values for a sparkline, oldest first. */
  spark: number[];
  lastSet: { load: number | null; reps: number };
}

const headline = (e: Exposure, bodyweight: boolean) => (bodyweight ? Math.max(...e.sets.map((s) => s.reps)) : e.e1rmDone);

/** Every exercise with history, most recently trained first. */
export function exerciseSummaries(sessions: Session[], now: number): ExerciseSummary[] {
  const map = exposuresByExercise(sessions);
  const result: ExerciseSummary[] = [];
  for (const [exerciseId, list] of map) {
    const all = list;
    const last = list[list.length - 1]!;
    const bodyweight = all.every((e) => e.top === null);
    const values = list.map((e) => headline(e, bodyweight));
    const then = [...list].reverse().find((e) => e.at <= now - 28 * DAY);
    const best = last.sets.reduce((b, s) => ((s.load ?? 0) * (1 + s.reps / 30) >= (b.load ?? 0) * (1 + b.reps / 30) ? s : b), last.sets[0]!);
    result.push({
      exerciseId,
      name: requireExercise(exerciseId).name,
      exposures: all.length,
      lastAt: last.at,
      bodyweight,
      best: Math.round(Math.max(...values)),
      latest: Math.round(headline(last, bodyweight)),
      change: then ? Math.round(headline(last, bodyweight) - headline(then, bodyweight)) : null,
      spark: values.slice(-8).map((v) => Math.round(v)),
      lastSet: { load: best.load, reps: best.reps },
    });
  }
  return result.sort((a, b) => b.lastAt - a.lastAt);
}

export type ExerciseMetric = 'e1rm' | 'top' | 'volume' | 'reps';

export interface Point {
  at: number;
  date: string;
  value: number;
  /** Lighter week, return ramp or lighter day: drawn hollow. */
  light?: boolean;
}

/** One value per session for a chart, oldest first. */
export function exerciseSeries(list: Exposure[], metric: ExerciseMetric): Point[] {
  return list.map((e) => {
    const light = Boolean(e.variant && e.variant !== 'short');
    let value: number;
    switch (metric) {
      case 'e1rm':
        value = e.e1rmDone;
        break;
      case 'top':
        value = e.top ?? 0;
        break;
      case 'volume':
        value = e.sets.reduce((sum, s) => sum + (s.load ?? 0) * s.reps, 0);
        break;
      case 'reps':
        value = Math.max(...e.sets.map((s) => s.reps));
        break;
    }
    return { at: e.at, date: e.date, value: Math.round(value), light };
  });
}

export interface ExerciseRecords {
  bestMax?: { value: number; load: number; reps: number; date: string };
  heaviest?: { load: number; reps: number; date: string };
  mostReps?: { reps: number; load: number | null; date: string };
  /** Most reps ever done at each weight, heaviest first. */
  repRecords: { load: number; reps: number; date: string }[];
}

export function exerciseRecords(list: Exposure[]): ExerciseRecords {
  const records: ExerciseRecords = { repRecords: [] };
  const atLoad = new Map<number, { reps: number; date: string }>();
  for (const e of list) {
    for (const s of e.sets) {
      if (!records.mostReps || s.reps > records.mostReps.reps) records.mostReps = { reps: s.reps, load: s.load, date: e.date };
      if (s.load === null || s.load <= 0) continue;
      const max = s.load * (1 + s.reps / 30);
      if (!records.bestMax || max > records.bestMax.value) records.bestMax = { value: Math.round(max), load: s.load, reps: s.reps, date: e.date };
      if (!records.heaviest || s.load > records.heaviest.load || (s.load === records.heaviest.load && s.reps > records.heaviest.reps)) {
        records.heaviest = { load: s.load, reps: s.reps, date: e.date };
      }
      const current = atLoad.get(s.load);
      if (!current || s.reps > current.reps) atLoad.set(s.load, { reps: s.reps, date: e.date });
    }
  }
  records.repRecords = [...atLoad.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 6)
    .map(([load, r]) => ({ load, reps: r.reps, date: r.date }));
  return records;
}

export interface RecordEvent extends Win {
  at: number;
  date: string;
}

/** Every record set, newest first (each session compared with all the ones before it). */
export function recordHistory(sessions: Session[], limit = 30): RecordEvent[] {
  const lifting = liftingSessions(sessions);
  const exposures = exposuresByExercise(lifting);
  const events: RecordEvent[] = [];
  for (const session of lifting) {
    for (const win of sessionRecords(session.id, exposures)) events.push({ ...win, at: session.startedAt, date: session.date });
  }
  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---------------------------------------------------------------- body

export type BodyMetric = 'weight' | 'waist' | 'chest' | 'shoulders' | 'arm' | 'thigh';

export const BODY_METRICS: { key: BodyMetric; label: string; kind: 'weight' | 'length' }[] = [
  { key: 'weight', label: 'Weight', kind: 'weight' },
  { key: 'waist', label: 'Waist', kind: 'length' },
  { key: 'chest', label: 'Chest', kind: 'length' },
  { key: 'shoulders', label: 'Shoulders', kind: 'length' },
  { key: 'arm', label: 'Arm', kind: 'length' },
  { key: 'thigh', label: 'Thigh', kind: 'length' },
];

export function bodySeries(measurements: Measurement[], metric: BodyMetric): Point[] {
  return measurements
    .filter((m) => typeof m[metric] === 'number' && m[metric]! > 0)
    .sort((a, b) => a.at - b.at)
    .map((m) => ({ at: m.at, date: m.date, value: m[metric]! }));
}

/** Trailing average over `days` (smooths day-to-day water swings in body weight). */
export function movingAverage(points: Point[], days = 7): Point[] {
  return points.map((p) => {
    const window = points.filter((q) => q.at <= p.at && q.at > p.at - days * DAY);
    const value = window.reduce((sum, q) => sum + q.value, 0) / window.length;
    return { ...p, value: Math.round(value * 10) / 10 };
  });
}

export interface BodySummary {
  latest: Point;
  /** Change over about 30 days (smoothed for weight), when there's an entry that old. */
  change30: number | null;
  first: Point;
}

export function bodySummary(points: Point[], metric: BodyMetric, now: number): BodySummary | null {
  if (!points.length) return null;
  const series = metric === 'weight' ? movingAverage(points) : points;
  const latest = series[series.length - 1]!;
  const then = [...series].reverse().find((p) => p.at <= now - 28 * DAY);
  return {
    latest: points[points.length - 1]!,
    change30: then ? Math.round((latest.value - then.value) * 10) / 10 : null,
    first: points[0]!,
  };
}

/** The most recent value of each metric, for the "last time" placeholders when logging. */
export function latestValues(measurements: Measurement[]): Partial<Record<BodyMetric, number>> {
  const out: Partial<Record<BodyMetric, number>> = {};
  for (const m of [...measurements].sort((a, b) => a.at - b.at)) {
    for (const { key } of BODY_METRICS) if (typeof m[key] === 'number' && m[key]! > 0) out[key] = m[key];
  }
  return out;
}

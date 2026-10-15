import type { Program, ProgramDay } from '../db/types';

/**
 * Calendar questions about a program: what's on today, what's next, and where we are in the
 * training block. Weeks start on Monday (index 0).
 */

const DAY_MS = 86_400_000;

export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function mondayOf(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - weekdayIndex(d));
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function programDay(program: Program, dayId: string | null | undefined): ProgramDay | null {
  if (!dayId) return null;
  return program.days.find((d) => d.id === dayId) ?? null;
}

/** The planned session for a date, or null on a rest day. */
export function sessionOn(program: Program, date: Date): ProgramDay | null {
  return programDay(program, program.schedule[weekdayIndex(date)]);
}

/** The next planned session strictly after `from` (looks up to two weeks ahead). */
export function nextSession(program: Program, from: Date): { day: ProgramDay; date: Date; daysAway: number } | null {
  const start = startOfDay(from);
  for (let offset = 1; offset <= 14; offset++) {
    const date = addDays(start, offset);
    const day = sessionOn(program, date);
    if (day) return { day, date, daysAway: offset };
  }
  return null;
}

export interface BlockPosition {
  /** 1-based week within the current block, including the lighter week at the end. */
  week: number;
  lengthWeeks: number;
  lighterWeek: boolean;
  /** Weeks until the lighter week starts (0 when it's this week). */
  weeksToLighter: number;
}

/**
 * Blocks run `lengthWeeks` normal weeks followed by one lighter week (approved rule F3), then
 * repeat. The Coach can move the lighter week earlier; this is the default calendar.
 */
export function blockPosition(program: Program, date: Date): BlockPosition {
  const lengthWeeks = program.block.lengthWeeks;
  const cycle = lengthWeeks + 1;
  const weeksSinceStart = Math.floor((mondayOf(date).getTime() - mondayOf(parseISODate(program.block.startDate)).getTime()) / (7 * DAY_MS));
  const index = ((Math.max(0, weeksSinceStart) % cycle) + cycle) % cycle;
  const week = index + 1;
  return { week, lengthWeeks, lighterWeek: week === cycle, weeksToLighter: Math.max(0, cycle - week) };
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

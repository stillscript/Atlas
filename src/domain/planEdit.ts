import type { Experience, Goal, Program, ProgramDay, ProgramSlot } from '../db/types';
import { newId } from '../lib/ids';
import { toISODate } from '../lib/format';
import { requireExercise } from './catalog';
import { prescribeExercise } from './generator';
import { mondayOf } from './schedule';

/**
 * Editing a plan by hand (stage 6). Pure: each function returns a new program, so the app can save
 * it, show it, and offer Undo with the previous one. Slot ids stay stable through edits, so the
 * Coach's history and decisions keep pointing at the right exercise.
 */

const touch = (program: Program, days: ProgramDay[], now: number): Program => ({ ...program, days, updatedAt: now });

function mapDay(program: Program, dayId: string, change: (day: ProgramDay) => ProgramDay, now: number): Program {
  return touch(program, program.days.map((d) => (d.id === dayId ? normalizeSupersets(change(d)) : d)), now);
}

/** Supersets only make sense for neighbours: a pair split up by a move or removal is dissolved. */
export function normalizeSupersets(day: ProgramDay): ProgramDay {
  const slots = day.slots.map((s) => ({ ...s }));
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i]!.superset;
    if (!id) continue;
    const prev = slots[i - 1]?.superset === id;
    const next = slots[i + 1]?.superset === id;
    const members = slots.filter((s) => s.superset === id).length;
    if ((!prev && !next) || members > 2) delete slots[i]!.superset;
  }
  return { ...day, slots };
}

export const SET_RANGE = { min: 1, max: 6 };

export function updateSlot(program: Program, dayId: string, slotId: string, patch: Partial<Pick<ProgramSlot, 'sets' | 'repsLow' | 'repsHigh' | 'rir' | 'restSec'>>, now: number): Program {
  return mapDay(
    program,
    dayId,
    (day) => ({
      ...day,
      slots: day.slots.map((s) => {
        if (s.id !== slotId) return s;
        const next = { ...s, ...patch };
        next.sets = Math.min(SET_RANGE.max, Math.max(SET_RANGE.min, Math.round(next.sets)));
        next.repsLow = Math.max(1, Math.round(next.repsLow));
        next.repsHigh = Math.max(next.repsLow, Math.round(next.repsHigh));
        if (next.rir !== undefined) next.rir = Math.min(4, Math.max(0, Math.round(next.rir)));
        return next;
      }),
    }),
    now,
  );
}

/** Moves an exercise up or down in its day. A superset pair moves together. */
export function moveSlot(program: Program, dayId: string, slotId: string, delta: -1 | 1, now: number): Program {
  return mapDay(
    program,
    dayId,
    (day) => {
      // Treat each superset pair as one block.
      const blocks: ProgramSlot[][] = [];
      for (const slot of day.slots) {
        const last = blocks[blocks.length - 1];
        if (slot.superset && last?.[0]?.superset === slot.superset) last.push(slot);
        else blocks.push([slot]);
      }
      const index = blocks.findIndex((b) => b.some((s) => s.id === slotId));
      const target = index + delta;
      if (index < 0 || target < 0 || target >= blocks.length) return day;
      [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
      return { ...day, slots: blocks.flat() };
    },
    now,
  );
}

export function removeSlot(program: Program, dayId: string, slotId: string, now: number): Program {
  return mapDay(program, dayId, (day) => ({ ...day, slots: day.slots.filter((s) => s.id !== slotId) }), now);
}

/** Adds an exercise at the end of a day, prescribed like the generator would for this goal and level. */
export function addSlot(program: Program, dayId: string, exerciseId: string, profile: { goal: Goal; experience: Experience }, now: number): { program: Program; slotId: string } {
  const exercise = requireExercise(exerciseId);
  const role = exercise.kind === 'compound' ? 'secondary' : 'accessory';
  const prescription = prescribeExercise(exerciseId, role, profile.goal, profile.experience);
  const slotId = newId('slot');
  const slot: ProgramSlot = { id: slotId, pattern: exercise.pattern, exerciseId, role, ...prescription, priority: 50 };
  return { program: mapDay(program, dayId, (day) => ({ ...day, slots: [...day.slots, slot] }), now), slotId };
}

/** Changes the exercise in a slot; sets, reps and effort stay (rep ranges follow if it's a timed exercise). */
export function replaceExercise(program: Program, dayId: string, slotId: string, exerciseId: string, now: number): Program {
  const exercise = requireExercise(exerciseId);
  return mapDay(
    program,
    dayId,
    (day) => ({
      ...day,
      slots: day.slots.map((s) => {
        if (s.id !== slotId) return s;
        const wasTimed = requireExercise(s.exerciseId).metric === 'time';
        const isTimed = exercise.metric === 'time';
        const reps = wasTimed === isTimed ? {} : isTimed ? { repsLow: 30, repsHigh: 45 } : { repsLow: 8, repsHigh: 12 };
        // A hand-picked exercise stays, even if machine legs are switched off later.
        return { ...s, exerciseId, pattern: exercise.pattern, ...reps, freeWeight: undefined };
      }),
    }),
    now,
  );
}

/** Pairs an exercise with the next one as a superset, or splits an existing pair. */
export function toggleSuperset(program: Program, dayId: string, slotId: string, now: number): Program {
  return mapDay(
    program,
    dayId,
    (day) => {
      const index = day.slots.findIndex((s) => s.id === slotId);
      const slot = day.slots[index];
      if (!slot) return day;
      if (slot.superset) {
        const id = slot.superset;
        return { ...day, slots: day.slots.map((s) => (s.superset === id ? { ...s, superset: undefined } : s)) };
      }
      const next = day.slots[index + 1];
      if (!next || next.superset) return day;
      const id = `${day.id}-ss-${newId('x').slice(-6)}`;
      return { ...day, slots: day.slots.map((s, i) => (i === index || i === index + 1 ? { ...s, superset: id } : s)) };
    },
    now,
  );
}

export function renameDay(program: Program, dayId: string, name: string, now: number): Program {
  const clean = name.trim().slice(0, 40);
  if (!clean) return program;
  return touch(program, program.days.map((d) => (d.id === dayId ? { ...d, name: clean } : d)), now);
}

/** A new day: empty, or a copy of another (with fresh slot ids). Not scheduled until you place it. */
export function addDay(program: Program, options: { name: string; copyOf?: string }, now: number): { program: Program; dayId: string } {
  const source = options.copyOf ? program.days.find((d) => d.id === options.copyOf) : undefined;
  const dayId = newId('day');
  const pairIds = new Map<string, string>();
  const day: ProgramDay = {
    id: dayId,
    name: options.name.trim().slice(0, 40) || 'New day',
    subtitle: source?.subtitle,
    slots: (source?.slots ?? []).map((s) => {
      let superset: string | undefined;
      if (s.superset) {
        if (!pairIds.has(s.superset)) pairIds.set(s.superset, `${dayId}-ss${pairIds.size + 1}`);
        superset = pairIds.get(s.superset);
      }
      return { ...s, id: newId('slot'), superset };
    }),
    extras: source?.extras?.map((x) => ({ ...x, id: newId('extra') })),
  };
  return { program: touch(program, [...program.days, day], now), dayId };
}

/** Removes a day and frees its weekdays. The last remaining day can't be removed. */
export function removeDay(program: Program, dayId: string, now: number): Program {
  if (program.days.length <= 1) return program;
  return {
    ...touch(program, program.days.filter((d) => d.id !== dayId), now),
    schedule: program.schedule.map((id) => (id === dayId ? null : id)),
  };
}

/** Puts a day (or rest) on a weekday, 0 = Monday. */
export function setWeekday(program: Program, weekday: number, dayId: string | null, now: number): Program {
  if (weekday < 0 || weekday > 6 || (dayId && !program.days.some((d) => d.id === dayId))) return program;
  const schedule = [...program.schedule];
  schedule[weekday] = dayId;
  return { ...program, schedule, updatedAt: now };
}

export function renameProgram(program: Program, name: string, now: number): Program {
  const clean = name.trim().slice(0, 40);
  return clean ? { ...program, name: clean, updatedAt: now } : program;
}

export const BLOCK_RANGE = { min: 3, max: 10 };

/** Weeks of normal training before each lighter week. */
export function setBlockLength(program: Program, weeks: number, now: number): Program {
  const lengthWeeks = Math.min(BLOCK_RANGE.max, Math.max(BLOCK_RANGE.min, Math.round(weeks)));
  return { ...program, block: { ...program.block, lengthWeeks }, updatedAt: now };
}

/** Starts a fresh block this week (week 1). */
export function restartBlock(program: Program, now: number): Program {
  return { ...program, block: { startDate: toISODate(mondayOf(new Date(now))), lengthWeeks: program.block.lengthWeeks }, updatedAt: now };
}

/** Days with no weekday: they're kept, but won't come up until you schedule them. */
export function unscheduledDays(program: Program): ProgramDay[] {
  return program.days.filter((d) => !program.schedule.includes(d.id));
}

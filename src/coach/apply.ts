import type { Program } from '../db/types';
import { addDays, mondayOf } from '../domain/schedule';
import { toISODate } from '../lib/format';
import type { Change } from './types';

/**
 * What Apply does to the plan. Pure: returns a new program (or the same one when the change isn't
 * a plan edit). Session-level changes (next weights, lighter days, in-session offers) never touch
 * the plan; they're decisions the session builder reads.
 */
export function applyToProgram(program: Program, change: Change, now: number): Program {
  if (change.kind === 'slot') {
    return {
      ...program,
      days: program.days.map((day) =>
        day.id !== change.dayId
          ? day
          : {
              ...day,
              slots: day.slots.map((slot) => {
                if (slot.id !== change.slotId) return slot;
                const next = { ...slot };
                if (change.sets) next.sets = change.sets.to;
                if (change.reps) {
                  next.repsLow = change.reps.toLow;
                  next.repsHigh = change.reps.toHigh;
                }
                if (change.swapTo) next.exerciseId = change.swapTo;
                return next;
              }),
            },
      ),
      updatedAt: now,
    };
  }
  if (change.kind === 'lighter-week') {
    const { block } = program;
    if (change.action === 'now') {
      // Start the block so that this week is its lighter week.
      const start = addDays(mondayOf(new Date(now)), -7 * block.lengthWeeks);
      return { ...program, block: { ...block, startDate: toISODate(start), postponedWeeks: undefined }, updatedAt: now };
    }
    const [y, m, d] = block.startDate.split('-').map(Number);
    const start = addDays(new Date(y!, m! - 1, d!), 7 * (change.weeks ?? 1));
    return { ...program, block: { ...block, startDate: toISODate(start), postponedWeeks: change.weeks ?? 1 }, updatedAt: now };
  }
  return program;
}

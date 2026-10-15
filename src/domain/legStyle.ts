import type { Experience, Goal, Gym, LegStyle, Program, ProgramDay, ProgramSlot, Sex } from '../db/types';
import { exerciseById, patternById, requireExercise } from './catalog';
import { prescribeExercise } from './generator';
import { canDoExercise, gymTags, loadSourceFor } from './gym';
import { muscleName } from './volume';

/**
 * Leg exercises by preference. Free weights is how templates and the generator build plans
 * (squats, deadlifts, lunges). Machines swaps those for leg press variations, leg curls,
 * extensions and cable pull-throughs: same muscles, no barbell skill, nothing balanced on a back.
 *
 * Setup picks a default from the answer to "Man / Woman / Rather not say"; Plan settings switches it
 * any time. Switching to machines remembers each replaced slot (`slot.freeWeight`), so switching
 * back restores the plan exactly. Pure functions.
 */

export const LEG_STYLE_FOR: Record<Sex, LegStyle> = { male: 'machines', female: 'free-weights', unspecified: 'free-weights' };

export const LEG_STYLE_NAMES: Record<LegStyle, string> = { 'free-weights': 'Free weights', machines: 'Machines' };

/** Machine stand-ins for each free-weight leg pattern, best first. */
const MACHINE_SWAPS: Record<string, string[]> = {
  squat: ['hack-squat', 'leg-press', 'leg-press-high-feet'],
  deadlift: ['leg-press-high-feet', 'cable-pull-through', 'machine-leg-curl'],
  hinge: ['leg-press-high-feet', 'cable-pull-through', 'machine-leg-curl'],
  'single-leg': ['single-leg-press', 'machine-leg-extension', 'machine-leg-curl'],
  'hip-thrust': ['cable-pull-through', 'leg-press-high-feet'],
};

/** Glute work for the free-weight default when setup says Woman: a hip thrust in place of leg extensions. */
const GLUTE_SWAPS: Record<string, string[]> = {
  'leg-extension': ['barbell-hip-thrust', 'smith-hip-thrust', 'db-hip-thrust'],
};

/** At most this many leg exercises on one machine in a day (calves don't count). */
const MAX_PER_STATION = 2;

interface Context {
  gym: Gym;
  goal: Goal;
  experience: Experience;
}

function isLegSlot(slot: ProgramSlot): boolean {
  const pattern = slot.pattern ?? requireExercise(slot.exerciseId).pattern;
  return patternById(pattern)?.vector === 'legs' && pattern !== 'calves';
}

/** "Glutes and hamstrings", capitalized. */
function sentence(parts: string[]): string {
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function slotPattern(slot: ProgramSlot): string {
  return slot.pattern ?? requireExercise(slot.exerciseId).pattern;
}

/**
 * Replaces the slots whose pattern has stand-ins with the first one the gym can do that isn't in
 * the day already and doesn't put a third leg exercise on the same machine. Sets stay; reps, effort
 * and rest follow the new exercise.
 */
function swapDay(day: ProgramDay, swaps: Record<string, string[]>, ctx: Context, remember: boolean): ProgramDay {
  const tags = gymTags(ctx.gym);
  const slots = day.slots.map((s) => ({ ...s }));
  const station = (exerciseId: string) => {
    const exercise = exerciseById(exerciseId);
    return exercise ? loadSourceFor(exercise, ctx.gym)?.item.id : undefined;
  };
  slots.forEach((slot, index) => {
    const candidates = swaps[slotPattern(slot)];
    if (!candidates) return;
    const others = slots.filter((_, i) => i !== index);
    const pick = candidates.find((id) => {
      const exercise = exerciseById(id);
      if (!exercise || !canDoExercise(exercise, tags)) return false;
      if (others.some((s) => s.exerciseId === id)) return false;
      const machine = station(id);
      return machine === undefined || others.filter((s) => isLegSlot(s) && station(s.exerciseId) === machine).length < MAX_PER_STATION;
    });
    if (!pick || pick === slot.exerciseId) return;
    const exercise = requireExercise(pick);
    const prescription = prescribeExercise(pick, slot.role ?? 'accessory', ctx.goal, ctx.experience);
    const before = {
      exerciseId: slot.exerciseId,
      pattern: slot.pattern,
      repsLow: slot.repsLow,
      repsHigh: slot.repsHigh,
      rir: slot.rir,
      restSec: slot.restSec,
      purpose: slot.purpose,
    };
    slots[index] = {
      ...slot,
      exerciseId: pick,
      pattern: exercise.pattern,
      repsLow: prescription.repsLow,
      repsHigh: prescription.repsHigh,
      rir: prescription.rir,
      restSec: prescription.restSec,
      // The old line ("Glutes and quads, each side") may not fit the new exercise; name what it trains.
      purpose: `${sentence(exercise.primary.map(muscleName))}.`,
      ...(remember ? { freeWeight: slot.freeWeight ?? before } : {}),
    };
  });
  return { ...day, slots };
}

function restoreDay(day: ProgramDay): ProgramDay {
  return {
    ...day,
    slots: day.slots.map((slot) => {
      if (!slot.freeWeight) return slot;
      const { freeWeight, ...rest } = slot;
      return { ...rest, ...freeWeight };
    }),
  };
}

/** The plan with this leg style. Switching back to free weights restores every replaced slot. */
export function applyLegStyle(program: Program, style: LegStyle, ctx: Omit<Context, 'goal'>, now: number): Program {
  const full = { ...ctx, goal: program.goal };
  const restored = program.days.map(restoreDay);
  const days = style === 'machines' ? restored.map((day) => swapDay(day, MACHINE_SWAPS, full, true)) : restored;
  return { ...program, days, legStyle: style, updatedAt: now };
}

/** Hip thrusts in place of leg extensions, for the free-weight default when setup says Woman. */
export function addGluteFocus(program: Program, ctx: Omit<Context, 'goal'>): Program {
  const full = { ...ctx, goal: program.goal };
  return { ...program, days: program.days.map((day) => swapDay(day, GLUTE_SWAPS, full, false)) };
}

/** How many slots machine legs would change (or has changed), for the settings sheet. */
export function machineSwapCount(program: Program, ctx: Omit<Context, 'goal'>): number {
  if (program.legStyle === 'machines') return program.days.reduce((n, d) => n + d.slots.filter((s) => s.freeWeight).length, 0);
  const preview = applyLegStyle(program, 'machines', ctx, program.updatedAt);
  return preview.days.reduce((n, d) => n + d.slots.filter((s) => s.freeWeight).length, 0);
}

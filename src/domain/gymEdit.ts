import type { EquipmentItem, Experience, Gym, ProgramDay } from '../db/types';
import { EQUIPMENT, equipmentDefById, requireExercise } from './catalog';
import { canDoExercise, equipmentFromDef, gymTags } from './gym';
import { normalizeSupersets } from './planEdit';
import { resolvePattern } from './resolver';
import type { EquipmentDef } from './types';

/**
 * Editing gyms (stage 6), and using a plan in a gym it wasn't built for (Coach rule I3).
 * Pure: each function returns a new gym or day.
 */

export function renameGym(gym: Gym, name: string, now: number): Gym {
  const clean = name.trim().slice(0, 40);
  return clean ? { ...gym, name: clean, updatedAt: now } : gym;
}

export function replaceEquipment(gym: Gym, item: EquipmentItem, now: number): Gym {
  return { ...gym, equipment: gym.equipment.map((e) => (e.id === item.id ? item : e)), updatedAt: now };
}

export function removeEquipment(gym: Gym, itemId: string, now: number): Gym {
  return { ...gym, equipment: gym.equipment.filter((e) => e.id !== itemId), updatedAt: now };
}

/** Adds a catalog item (weights from the catalog's spec, to confirm on first use). Already there: no change. */
export function addEquipment(gym: Gym, catalogId: string, now: number): Gym {
  const def = equipmentDefById(catalogId);
  if (!def || gym.equipment.some((e) => e.catalogId === catalogId)) return gym;
  return { ...gym, equipment: [...gym.equipment, equipmentFromDef(def)], updatedAt: now };
}

/** Catalog equipment this gym doesn't have yet, for "Add equipment". */
export function missingEquipment(gym: Gym): EquipmentDef[] {
  const have = new Set(gym.equipment.map((e) => e.catalogId));
  return EQUIPMENT.filter((def) => !have.has(def.id));
}

/** "5, 7.5, 10, 12.5" → [5, 7.5, 10, 12.5]: positive, unique, sorted. */
export function parseWeights(text: string): number[] {
  const values = text
    .split(/[,\s;]+/)
    .map((part) => Number(part.replace(',', '.')))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.round(v * 100) / 100);
  return [...new Set(values)].sort((a, b) => a - b);
}

/** A run of weights: from, to, in steps (e.g. dumbbells 5 to 50 by 5). */
export function weightRange(from: number, to: number, step: number): number[] {
  if (step <= 0 || to < from) return [from];
  const out: number[] = [];
  for (let w = from; w <= to + 1e-9; w += step) out.push(Math.round(w * 100) / 100);
  return out;
}

// ---------------------------------------------------------------- I3 · a plan in another gym

export interface Remap {
  slotId: string;
  from: string;
  /** The stand-in exercise, or null when nothing in this gym trains the same thing. */
  to: string | null;
}

/**
 * The day as it runs in this gym: an exercise the gym can't do becomes the best variation of the
 * same movement it can (or a fallback movement); with no option at all, it sits out today. The
 * plan itself isn't changed, so switching back restores everything.
 */
export function remapDayForGym(day: ProgramDay, gym: Gym, experience?: Experience): { day: ProgramDay; changes: Remap[] } {
  const tags = gymTags(gym);
  const changes: Remap[] = [];
  const used = new Set(day.slots.map((s) => s.exerciseId).filter((id) => canDoExercise(requireExercise(id), tags)));
  const slots = day.slots.flatMap((slot) => {
    const exercise = requireExercise(slot.exerciseId);
    if (canDoExercise(exercise, tags)) return [slot];
    const pick = resolvePattern(slot.pattern ?? exercise.pattern, gym, { experience, exclude: used });
    changes.push({ slotId: slot.id, from: slot.exerciseId, to: pick?.id ?? null });
    if (!pick) return [];
    used.add(pick.id);
    const timedChange = (exercise.metric === 'time') !== (pick.metric === 'time');
    const reps = !timedChange ? {} : pick.metric === 'time' ? { repsLow: 30, repsHigh: 45 } : { repsLow: 8, repsHigh: 12 };
    return [{ ...slot, exerciseId: pick.id, ...reps }];
  });
  if (!changes.length) return { day, changes };
  return { day: normalizeSupersets({ ...day, slots }), changes };
}

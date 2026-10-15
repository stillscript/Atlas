import type { EquipmentItem, Gym, LoadModel } from '../db/types';
import { newId } from '../lib/ids';
import { equipmentDefById, gymPresetById } from './catalog';
import { expandLoadSpec } from './loads';
import type { EquipmentDef, ExerciseDef, LoadSpec } from './types';

/** A gym's equipment item built from a catalog entry, with optional per-gym overrides. */
export function equipmentFromDef(
  def: EquipmentDef,
  overrides: { name?: string; load?: LoadSpec; verifyLoad?: boolean } = {},
): EquipmentItem {
  const item: EquipmentItem = {
    id: `eq-${def.id}`,
    catalogId: def.id,
    name: overrides.name ?? def.name,
    category: def.category,
    provides: [...def.provides],
    load: expandLoadSpec(overrides.load ?? def.load),
  };
  const verifyLoad = overrides.verifyLoad ?? def.verifyLoad;
  if (verifyLoad) item.verifyLoad = true;
  if (def.loadNote) item.loadNote = def.loadNote;
  if (def.settingsFields?.length) item.settingsFields = [...def.settingsFields];
  if (def.cardioMetrics?.length) item.cardioMetrics = [...def.cardioMetrics];
  return item;
}

export function createGymFromPreset(presetId: string, now = Date.now()): Gym {
  const preset = gymPresetById(presetId);
  if (!preset) throw new Error(`Unknown gym preset "${presetId}"`);
  const equipment = preset.equipment.map((entry) => {
    const def = equipmentDefById(entry.catalogId);
    if (!def) throw new Error(`Gym preset "${presetId}" uses unknown equipment "${entry.catalogId}"`);
    return equipmentFromDef(def, entry);
  });
  return {
    id: newId('gym'),
    name: preset.name,
    presetId: preset.id,
    units: preset.units,
    equipment,
    createdAt: now,
    updatedAt: now,
  };
}

/** A gym built from the "what's in your gym" checklist. */
export function createGymFromCatalog(name: string, catalogIds: string[], now = Date.now()): Gym {
  const equipment = catalogIds.map((id) => {
    const def = equipmentDefById(id);
    if (!def) throw new Error(`Unknown equipment "${id}"`);
    return equipmentFromDef(def);
  });
  return { id: newId('gym'), name, units: 'lb', equipment, createdAt: now, updatedAt: now };
}

/** Capability tags available in the gym. Bodyweight work needs nothing, so it's always possible. */
export function gymTags(gym: Gym): Set<string> {
  return new Set(gym.equipment.flatMap((item) => item.provides ?? []));
}

/** The equipment item that provides `tag`, if any. */
export function equipmentForTag(gym: Gym, tag: string): EquipmentItem | undefined {
  return gym.equipment.find((item) => (item.provides ?? []).includes(tag));
}

export function canDoExercise(exercise: ExerciseDef, tags: Set<string>): boolean {
  return exercise.requires.every((tag) => tags.has(tag));
}

/** The equipment an exercise is loaded with in this gym, and its load model. */
export function loadSourceFor(exercise: ExerciseDef, gym: Gym): { item: EquipmentItem; model: LoadModel } | undefined {
  if (!exercise.loadFrom) return undefined;
  const item = equipmentForTag(gym, exercise.loadFrom);
  return item ? { item, model: item.load } : undefined;
}

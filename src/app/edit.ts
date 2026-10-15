import { signal } from '@preact/signals';
import { saveProgram } from '../db/coach';
import { deleteGym, loadGyms, saveGym } from '../db/sessions';
import type { AtlasDB } from '../db/schema';
import type { Gym, Program } from '../db/types';
import { showToast } from '../ui/feedback';
import { activeGym, activeProgram, getDb, updateSettings } from './state';

/**
 * Plan and gym edits (stage 6). Every edit is saved right away; removals offer Undo, which puts
 * back exactly what was there.
 */

/** Every gym on this phone (the active one included). */
export const gyms = signal<Gym[]>([]);

export async function loadGymList(db: AtlasDB): Promise<void> {
  gyms.value = await loadGyms(db);
}

async function storeProgram(program: Program): Promise<void> {
  await saveProgram(getDb(), program);
  activeProgram.value = program;
}

/**
 * Applies a plan edit. With `undo`, a toast offers to put the previous plan back.
 * Returns false when nothing changed.
 */
export async function editProgram(change: (program: Program, now: number) => Program, undo?: string): Promise<boolean> {
  const before = activeProgram.value;
  if (!before) return false;
  const next = change(before, Date.now());
  if (next === before) return false;
  try {
    await storeProgram(next);
  } catch {
    showToast('Couldn’t save that. Try again.', 'danger');
    return false;
  }
  if (undo) {
    showToast(undo, 'neutral', 6000, {
      label: 'Undo',
      onClick: () => void storeProgram({ ...before, updatedAt: Date.now() }).then(() => showToast('Restored')),
    });
  }
  return true;
}

async function storeGym(gym: Gym): Promise<void> {
  await saveGym(getDb(), gym);
  gyms.value = gyms.value.some((g) => g.id === gym.id) ? gyms.value.map((g) => (g.id === gym.id ? gym : g)) : [...gyms.value, gym];
  if (activeGym.value?.id === gym.id) activeGym.value = gym;
}

/** Applies an edit to a gym (the active one by default). */
export async function editGym(change: (gym: Gym, now: number) => Gym, options: { gymId?: string; undo?: string } = {}): Promise<boolean> {
  const before = options.gymId ? gyms.value.find((g) => g.id === options.gymId) : activeGym.value;
  if (!before) return false;
  const next = change(before, Date.now());
  if (next === before) return false;
  try {
    await storeGym(next);
  } catch {
    showToast('Couldn’t save that. Try again.', 'danger');
    return false;
  }
  if (options.undo) {
    showToast(options.undo, 'neutral', 6000, {
      label: 'Undo',
      onClick: () => void storeGym({ ...before, updatedAt: Date.now() }).then(() => showToast('Restored')),
    });
  }
  return true;
}

/** Makes another gym the active one. The plan stays; exercises the gym can't do get stand-ins (I3). */
export async function switchGym(gymId: string): Promise<void> {
  const gym = gyms.value.find((g) => g.id === gymId);
  if (!gym || activeGym.value?.id === gymId) return;
  await updateSettings({ activeGymId: gymId });
  activeGym.value = gym;
  showToast(`Training at ${gym.name}`, 'good');
}

export async function addGym(gym: Gym, makeActive: boolean): Promise<void> {
  await storeGym(gym);
  if (makeActive) await switchGym(gym.id);
}

export async function removeGym(gymId: string): Promise<void> {
  if (activeGym.value?.id === gymId) return;
  await deleteGym(getDb(), gymId);
  gyms.value = gyms.value.filter((g) => g.id !== gymId);
}

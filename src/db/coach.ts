import type { AtlasDB } from './schema';
import type { CoachLogEntry, Measurement, Program } from './types';

/** Reads and writes for the Coach: its log (shown insights and decisions), body measurements, plan edits. */

export async function loadCoachLog(db: AtlasDB): Promise<CoachLogEntry[]> {
  return (await db.getAll('coachLog')).sort((a, b) => a.at - b.at);
}

export async function appendCoachLog(db: AtlasDB, entries: CoachLogEntry[]): Promise<void> {
  if (!entries.length) return;
  const tx = db.transaction('coachLog', 'readwrite');
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
}

export async function loadMeasurements(db: AtlasDB): Promise<Measurement[]> {
  return (await db.getAll('measurements')).sort((a, b) => a.at - b.at);
}

export async function saveProgram(db: AtlasDB, program: Program): Promise<void> {
  await db.put('programs', program);
}

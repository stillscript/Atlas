import type { AtlasDB } from './schema';
import type { AppMeta, Gym, MachineSetting, Session } from './types';
import { newId } from '../lib/ids';

/**
 * Reads and writes for workouts. The active session is saved on every tap, and the app meta's
 * `activeSessionId` changes in the same transaction as the session itself, so a crash at any
 * moment leaves either the old state or the new one, never a half.
 */

function baseMeta(current: AppMeta | undefined, now: number): AppMeta {
  return current ?? { installId: newId('inst'), createdAt: now };
}

export async function beginSession(db: AtlasDB, session: Session): Promise<AppMeta> {
  const tx = db.transaction(['sessions', 'kv'], 'readwrite');
  const kv = tx.objectStore('kv');
  const app: AppMeta = { ...baseMeta((await kv.get('app'))?.value as AppMeta | undefined, session.startedAt), activeSessionId: session.id };
  await Promise.all([tx.objectStore('sessions').put(session), kv.put({ key: 'app', value: app }), tx.done]);
  return app;
}

export async function saveSession(db: AtlasDB, session: Session): Promise<void> {
  await db.put('sessions', session);
}

/** Saves the finished (or abandoned) session and clears the active workout. */
export async function closeSession(db: AtlasDB, session: Session): Promise<AppMeta> {
  const tx = db.transaction(['sessions', 'kv'], 'readwrite');
  const kv = tx.objectStore('kv');
  const current = baseMeta((await kv.get('app'))?.value as AppMeta | undefined, session.updatedAt);
  const app: AppMeta = { ...current };
  if (app.activeSessionId === session.id) delete app.activeSessionId;
  await Promise.all([tx.objectStore('sessions').put(session), kv.put({ key: 'app', value: app }), tx.done]);
  return app;
}

/** Throws a workout away entirely (only offered before or right after it starts). */
export async function discardSession(db: AtlasDB, sessionId: string): Promise<AppMeta> {
  const tx = db.transaction(['sessions', 'kv'], 'readwrite');
  const kv = tx.objectStore('kv');
  const app: AppMeta = { ...baseMeta((await kv.get('app'))?.value as AppMeta | undefined, Date.now()) };
  if (app.activeSessionId === sessionId) delete app.activeSessionId;
  await Promise.all([tx.objectStore('sessions').delete(sessionId), kv.put({ key: 'app', value: app }), tx.done]);
  return app;
}

/** The workout in progress, if the app meta points at one that is still active. */
export async function loadActiveSession(db: AtlasDB, app: AppMeta): Promise<Session | null> {
  if (!app.activeSessionId) return null;
  const session = await db.get('sessions', app.activeSessionId);
  return session?.status === 'active' ? session : null;
}

/** Every finished workout, oldest first. */
export async function loadCompletedSessions(db: AtlasDB): Promise<Session[]> {
  const sessions = await db.getAllFromIndex('sessions', 'byStatus', 'completed');
  return sessions.sort((a, b) => a.startedAt - b.startedAt);
}

export function machineSettingId(gymId: string, equipmentId: string, exerciseId: string): string {
  return `${gymId}:${equipmentId}:${exerciseId}`;
}

export async function loadMachineSettings(db: AtlasDB, gymId: string): Promise<MachineSetting[]> {
  return db.getAllFromIndex('machineSettings', 'byGym', gymId);
}

export async function saveMachineSetting(db: AtlasDB, setting: MachineSetting): Promise<void> {
  await db.put('machineSettings', setting);
}

export async function saveGym(db: AtlasDB, gym: Gym): Promise<void> {
  await db.put('gyms', gym);
}

export async function loadGyms(db: AtlasDB): Promise<Gym[]> {
  return (await db.getAll('gyms')).sort((a, b) => a.createdAt - b.createdAt);
}

/** Removes a gym and its machine settings in one step. Workouts done there keep their records. */
export async function deleteGym(db: AtlasDB, gymId: string): Promise<void> {
  const tx = db.transaction(['gyms', 'machineSettings'], 'readwrite');
  const settings = await tx.objectStore('machineSettings').index('byGym').getAllKeys(gymId);
  await Promise.all([tx.objectStore('gyms').delete(gymId), ...settings.map((key) => tx.objectStore('machineSettings').delete(key)), tx.done]);
}

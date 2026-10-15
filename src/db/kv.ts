import type { AtlasDB } from './schema';
import type { AppMeta, KvKey, KvValues, Settings } from './types';
import { newId } from '../lib/ids';

export const DEFAULT_SETTINGS: Settings = {
  units: 'lb',
  theme: 'system',
  sound: true,
  haptics: true,
  keepAwake: true,
  readinessCheck: true,
  wearableScore: false,
};

export async function getKv<K extends KvKey>(db: AtlasDB, key: K): Promise<KvValues[K] | undefined> {
  const record = await db.get('kv', key);
  return record?.value as KvValues[K] | undefined;
}

export async function setKv<K extends KvKey>(db: AtlasDB, key: K, value: KvValues[K]): Promise<void> {
  await db.put('kv', { key, value });
}

/** Read-modify-write in one transaction, so two quick updates can't overwrite each other. */
export async function updateKv<K extends KvKey>(
  db: AtlasDB,
  key: K,
  update: (current: KvValues[K] | undefined) => KvValues[K],
): Promise<KvValues[K]> {
  const tx = db.transaction('kv', 'readwrite');
  const record = await tx.store.get(key);
  const next = update(record?.value as KvValues[K] | undefined);
  await tx.store.put({ key, value: next });
  await tx.done;
  return next;
}

export async function loadSettings(db: AtlasDB): Promise<Settings> {
  const stored = await getKv(db, 'settings');
  // Defaults first, so settings added in later versions get a value without a migration.
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(db: AtlasDB, patch: Partial<Settings>): Promise<Settings> {
  return updateKv(db, 'settings', (current) => ({ ...DEFAULT_SETTINGS, ...current, ...patch }));
}

/** Creates the app meta record on first launch; returns the stored one afterwards. */
export function ensureAppMeta(db: AtlasDB): Promise<AppMeta> {
  return updateKv(db, 'app', (current) => current ?? { installId: newId('inst'), createdAt: Date.now() });
}

export function updateAppMeta(db: AtlasDB, patch: Partial<AppMeta>): Promise<AppMeta> {
  return updateKv(db, 'app', (current) => ({
    ...(current ?? { installId: newId('inst'), createdAt: Date.now() }),
    ...patch,
  }));
}

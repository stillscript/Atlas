import { deleteDB, type IDBPDatabase } from 'idb';
import type { AtlasDB } from './schema';
import { dumpDatabase, writeDump, type DatabaseDump } from './dump';
import { latestVersion, MIGRATIONS, type Migration } from './migrations';
import { takeSnapshot } from './snapshot';
import { openWithMigrations } from './upgrade';
import type { AppMeta, KvRecord, Session } from './types';

/**
 * Backup files: a JSON copy of every record, saved by the user (share sheet → Files on iOS).
 *
 * Importing never trusts the file blindly: it is validated, previewed, migrated up to the current
 * schema in a temporary database, and only then swapped in, after a snapshot of the current data.
 */

export const BACKUP_FORMAT = 'atlas-backup';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  stores: Record<string, unknown[]>;
}

export interface BackupPreview {
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  totalRecords: number;
  workouts: number;
  firstWorkout?: string;
  lastWorkout?: string;
  measurements: number;
  gyms: string[];
}

export type ParseResult = { ok: true; backup: BackupFile; preview: BackupPreview } | { ok: false; error: string };

export async function createBackup(db: AtlasDB, appVersion: string = __APP_VERSION__): Promise<BackupFile> {
  const dump = await dumpDatabase(db as unknown as IDBPDatabase<unknown>);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    schemaVersion: dump.schemaVersion,
    exportedAt: new Date().toISOString(),
    stores: dump.stores,
  };
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `atlas-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function previewBackup(backup: BackupFile): BackupPreview {
  const sessions = (backup.stores.sessions ?? []) as Session[];
  const completed = sessions.filter((s) => s && s.status === 'completed' && typeof s.date === 'string');
  const dates = completed.map((s) => s.date).sort();
  const gyms = ((backup.stores.gyms ?? []) as { name?: unknown }[])
    .map((g) => (typeof g?.name === 'string' ? g.name : ''))
    .filter(Boolean);
  return {
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
    schemaVersion: backup.schemaVersion,
    totalRecords: Object.values(backup.stores).reduce((sum, records) => sum + records.length, 0),
    workouts: completed.length,
    firstWorkout: dates[0],
    lastWorkout: dates[dates.length - 1],
    measurements: (backup.stores.measurements ?? []).length,
    gyms,
  };
}

export function parseBackup(text: string, currentSchemaVersion = latestVersion(MIGRATIONS)): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file couldn't be read. Choose a backup file saved from Atlas." };
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT) {
    return { ok: false, error: "This isn't an Atlas backup file." };
  }
  if (typeof data.formatVersion !== 'number' || data.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Atlas. Update the app, then try again.' };
  }
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion < 1) {
    return { ok: false, error: 'This backup is missing its version information.' };
  }
  if (data.schemaVersion > currentSchemaVersion) {
    return { ok: false, error: 'This backup was made by a newer version of Atlas. Update the app, then try again.' };
  }
  if (!isRecord(data.stores) || !Object.values(data.stores).every(Array.isArray)) {
    return { ok: false, error: 'This backup file is damaged and can’t be restored.' };
  }
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: data.formatVersion,
    appVersion: typeof data.appVersion === 'string' ? data.appVersion : 'unknown',
    schemaVersion: data.schemaVersion,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    stores: data.stores as Record<string, unknown[]>,
  };
  return { ok: true, backup, preview: previewBackup(backup) };
}

/**
 * Brings backup data up to the current schema by loading it into a throwaway database at its own
 * version and opening that with the full migration list. Uses the same migrations as the app, so
 * an old backup is upgraded exactly like old on-device data would be.
 */
export async function migrateDump(
  dump: DatabaseDump,
  migrations: readonly Migration[] = MIGRATIONS,
  tempName = `atlas-import-${Date.now().toString(36)}`,
): Promise<DatabaseDump> {
  const target = latestVersion(migrations);
  if (dump.schemaVersion === target) return dump;
  try {
    const older = await openWithMigrations(tempName, dump.schemaVersion, migrations);
    await writeDump(older, dump, { replace: true });
    older.close();
    const current = await openWithMigrations(tempName, target, migrations);
    const migrated = await dumpDatabase(current);
    current.close();
    return migrated;
  } finally {
    await deleteDB(tempName);
  }
}

export interface ImportOptions {
  migrations?: readonly Migration[];
  snapshotDbName?: string;
  appVersion?: string;
}

/**
 * Replaces all data in `db` with the backup's data. A snapshot of the current data is taken first
 * and its id returned, so an import can always be undone.
 */
export async function importBackup(db: AtlasDB, backup: BackupFile, options: ImportOptions = {}): Promise<string> {
  const migrations = options.migrations ?? MIGRATIONS;
  const appVersion = options.appVersion ?? __APP_VERSION__;
  const snapshotId = await takeSnapshot(
    db.name,
    db.version,
    { reason: 'pre-import', appVersion },
    options.snapshotDbName,
  );

  const migrated = await migrateDump({ schemaVersion: backup.schemaVersion, stores: backup.stores }, migrations);

  // The device-specific bits of app meta stay with this device, not the backup.
  const currentApp = (await db.get('kv', 'app'))?.value as AppMeta | undefined;
  const kv = ((migrated.stores.kv ?? []) as KvRecord[]).map((record) => {
    if (record.key !== 'app') return record;
    const imported = record.value as AppMeta;
    const merged: AppMeta = {
      ...imported,
      installId: currentApp?.installId ?? imported.installId,
      persist: currentApp?.persist,
      lastSeenVersion: currentApp?.lastSeenVersion ?? imported.lastSeenVersion,
      activeSessionId: undefined,
    };
    return { key: 'app' as const, value: merged };
  });
  if (currentApp && !kv.some((record) => record.key === 'app')) {
    kv.push({ key: 'app', value: { ...currentApp, activeSessionId: undefined } });
  }
  // Any workout that was in progress on the exporting device is closed out, not resumed here.
  const sessions = ((migrated.stores.sessions ?? []) as Session[]).map((session) =>
    session.status === 'active' ? { ...session, status: 'abandoned' as const } : session,
  );

  await writeDump(
    db as unknown as IDBPDatabase<unknown>,
    { schemaVersion: migrated.schemaVersion, stores: { ...migrated.stores, kv, sessions } },
    { replace: true },
  );
  return snapshotId;
}

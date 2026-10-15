import { DB_NAME, type AtlasDB } from './schema';
import { latestVersion, MIGRATIONS, validateMigrations, type Migration } from './migrations';
import { getStoredVersion } from './probe';
import { getSnapshot, restoreSnapshot, takeSnapshot } from './snapshot';
import { openWithMigrations } from './upgrade';

/** The data on this device was written by a newer version of Atlas than the one running. */
export class DowngradeError extends Error {
  constructor(
    readonly storedVersion: number,
    readonly supportedVersion: number,
  ) {
    super(`Data is at schema v${storedVersion}; this app supports up to v${supportedVersion}`);
    this.name = 'DowngradeError';
  }
}

/** A schema migration failed. The data was left (or put back) exactly as it was before. */
export class MigrationError extends Error {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly snapshotId?: string;
  /** True if the snapshot had to be written back; false if IndexedDB's rollback was enough. */
  readonly restored: boolean;
  constructor(init: { fromVersion: number; toVersion: number; snapshotId?: string; restored: boolean; cause: unknown }) {
    super(`Updating data from v${init.fromVersion} to v${init.toVersion} failed`, { cause: init.cause });
    this.name = 'MigrationError';
    this.fromVersion = init.fromVersion;
    this.toVersion = init.toVersion;
    this.snapshotId = init.snapshotId;
    this.restored = init.restored;
  }
}

export interface OpenOptions {
  name?: string;
  migrations?: readonly Migration[];
  appVersion?: string;
  snapshotDbName?: string;
  onBlocked?: () => void;
}

export interface OpenResult {
  db: AtlasDB;
  /** Present when this open ran migrations on existing data. */
  upgraded?: { fromVersion: number; toVersion: number; snapshotId: string };
}

/**
 * Opens the Atlas database, migrating it if needed.
 *
 * Before migrating existing data, a full snapshot is saved on the device. If a migration fails,
 * IndexedDB rolls the upgrade back; if the stored version still doesn't match afterwards, the
 * snapshot is written back. Either way a MigrationError is thrown so the app can show a clear
 * message instead of running against half-migrated data.
 */
export async function openAtlasDB(options: OpenOptions = {}): Promise<OpenResult> {
  const name = options.name ?? DB_NAME;
  const migrations = options.migrations ?? MIGRATIONS;
  const appVersion = options.appVersion ?? __APP_VERSION__;
  validateMigrations(migrations);
  const target = latestVersion(migrations);

  const stored = await getStoredVersion(name);
  if (stored > target) throw new DowngradeError(stored, target);

  let snapshotId: string | undefined;
  if (stored > 0 && stored < target) {
    snapshotId = await takeSnapshot(
      name,
      stored,
      { reason: 'pre-migration', appVersion, toVersion: target },
      options.snapshotDbName,
    );
  }

  try {
    const db = (await openWithMigrations(name, target, migrations, { onBlocked: options.onBlocked })) as unknown as AtlasDB;
    return { db, upgraded: snapshotId ? { fromVersion: stored, toVersion: target, snapshotId } : undefined };
  } catch (cause) {
    let restored = false;
    if (snapshotId) {
      const after = await getStoredVersion(name).catch(() => -1);
      if (after !== stored) {
        const snapshot = await getSnapshot(snapshotId, options.snapshotDbName);
        if (snapshot) {
          await restoreSnapshot(snapshot, name, migrations);
          restored = true;
        }
      }
    }
    throw new MigrationError({ fromVersion: stored, toVersion: target, snapshotId, restored, cause });
  }
}

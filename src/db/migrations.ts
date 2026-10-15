import type { IDBPDatabase, IDBPTransaction } from 'idb';

/**
 * Numbered, additive schema migrations.
 *
 * How to add one (see CLAUDE.md, "Adding a migration"):
 * 1. Append a new Migration with the next version number. Never edit or reorder a released one.
 * 2. Only add: new stores, new indexes, new fields filled from existing data. Never delete or reset
 *    user data, and never drop a store that holds it.
 * 3. Use only `ctx.tx` for data work and never await anything that isn't an IndexedDB request,
 *    or the upgrade transaction auto-commits early.
 * 4. Add a fixture for the *previous* version in tests/db/fixtures/ and extend tests/db/migrations.test.ts.
 *
 * Until v1.0.0 is first released, migration 1 may still be edited. After that, it is frozen.
 */

export interface MigrationContext {
  db: IDBPDatabase<unknown>;
  tx: IDBPTransaction<unknown, string[], 'versionchange'>;
  /** The version the database was at before this upgrade started (0 for a fresh install). */
  fromVersion: number;
}

export interface Migration {
  version: number;
  name: string;
  up(ctx: MigrationContext): void | Promise<void>;
}

const m001InitialSchema: Migration = {
  version: 1,
  name: 'initial-schema',
  up({ db }) {
    db.createObjectStore('kv', { keyPath: 'key' });
    db.createObjectStore('gyms', { keyPath: 'id' });
    db.createObjectStore('programs', { keyPath: 'id' });
    db.createObjectStore('exercises', { keyPath: 'id' });

    const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('byDate', 'date');
    sessions.createIndex('byStatus', 'status');

    const measurements = db.createObjectStore('measurements', { keyPath: 'id' });
    measurements.createIndex('byDate', 'date');

    const machineSettings = db.createObjectStore('machineSettings', { keyPath: 'id' });
    machineSettings.createIndex('byGym', 'gymId');

    const coachLog = db.createObjectStore('coachLog', { keyPath: 'id' });
    coachLog.createIndex('byAt', 'at');
    coachLog.createIndex('byKey', 'key');
  },
};

export const MIGRATIONS: readonly Migration[] = [m001InitialSchema];

/** Throws if versions aren't 1, 2, 3… in order. Runs on every open, so a bad edit fails loudly. */
export function validateMigrations(migrations: readonly Migration[]): void {
  if (migrations.length === 0) throw new Error('No migrations defined');
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration "${migration.name}" has version ${migration.version}; expected ${index + 1}`);
    }
  });
}

export function latestVersion(migrations: readonly Migration[] = MIGRATIONS): number {
  return migrations.length;
}

/** The schema version this build of the app expects. */
export const DB_VERSION = latestVersion(MIGRATIONS);

import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import { dumpDatabase, writeDump, type DatabaseDump } from './dump';
import type { Migration } from './migrations';
import { getStoredVersion } from './probe';
import { openWithMigrations } from './upgrade';

/**
 * Automatic on-device snapshots of all user data, taken before every schema migration and before
 * a backup import. They live in a separate database that migrations never touch.
 */

export const SNAPSHOT_DB_NAME = 'atlas-snapshots';
const KEEP_SNAPSHOTS = 5;

export type SnapshotReason = 'pre-migration' | 'pre-import' | 'manual';

export interface Snapshot {
  id: string;
  createdAt: number;
  reason: SnapshotReason;
  appVersion: string;
  /** Schema version of the data in this snapshot. */
  fromVersion: number;
  /** Schema version the app was about to move to. */
  toVersion?: number;
  dump: DatabaseDump;
}

export type SnapshotSummary = Omit<Snapshot, 'dump'> & { records: number };

function openSnapshotDb(name = SNAPSHOT_DB_NAME): Promise<IDBPDatabase<unknown>> {
  return openDB<unknown>(name, 1, {
    upgrade(db) {
      const store = db.createObjectStore('snapshots', { keyPath: 'id' });
      store.createIndex('byCreatedAt', 'createdAt');
    },
  });
}

let lastCreatedAt = 0;
/** Strictly increasing, so snapshots taken in the same millisecond still sort in order. */
function nextCreatedAt(): number {
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
  return lastCreatedAt;
}

function newId(createdAt: number): string {
  return `snap-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Copies every record of the database `sourceName` (at its stored version) into a new snapshot. */
export async function takeSnapshot(
  sourceName: string,
  sourceVersion: number,
  meta: { reason: SnapshotReason; appVersion: string; toVersion?: number },
  snapshotDbName = SNAPSHOT_DB_NAME,
): Promise<string> {
  // Never open a database that isn't there: openDB would quietly create an empty one.
  const stored = await getStoredVersion(sourceName);
  if (stored < 1 || stored !== sourceVersion) {
    throw new Error(`Can't snapshot "${sourceName}": expected v${sourceVersion}, found v${stored}`);
  }
  const source = await openDB<unknown>(sourceName, sourceVersion);
  let dump: DatabaseDump;
  try {
    dump = await dumpDatabase(source);
  } finally {
    source.close();
  }
  const createdAt = nextCreatedAt();
  const snapshot: Snapshot = {
    id: newId(createdAt),
    createdAt,
    reason: meta.reason,
    appVersion: meta.appVersion,
    fromVersion: sourceVersion,
    toVersion: meta.toVersion,
    dump,
  };
  const db = await openSnapshotDb(snapshotDbName);
  try {
    await db.put('snapshots', snapshot);
    await pruneSnapshots(db);
  } finally {
    db.close();
  }
  return snapshot.id;
}

async function pruneSnapshots(db: IDBPDatabase<unknown>): Promise<void> {
  const keys = (await db.getAllKeysFromIndex('snapshots', 'byCreatedAt')) as string[];
  const excess = keys.length - KEEP_SNAPSHOTS;
  for (let i = 0; i < excess; i++) {
    const key = keys[i];
    if (key !== undefined) await db.delete('snapshots', key);
  }
}

export async function getSnapshot(id: string, snapshotDbName = SNAPSHOT_DB_NAME): Promise<Snapshot | undefined> {
  const db = await openSnapshotDb(snapshotDbName);
  try {
    return (await db.get('snapshots', id)) as Snapshot | undefined;
  } finally {
    db.close();
  }
}

export async function listSnapshots(snapshotDbName = SNAPSHOT_DB_NAME): Promise<SnapshotSummary[]> {
  const db = await openSnapshotDb(snapshotDbName);
  try {
    const all = (await db.getAllFromIndex('snapshots', 'byCreatedAt')) as Snapshot[];
    return all
      .map(({ dump, ...rest }) => ({
        ...rest,
        records: Object.values(dump.stores).reduce((sum, records) => sum + records.length, 0),
      }))
      .reverse();
  } finally {
    db.close();
  }
}

/**
 * Rebuilds the database `targetName` exactly as it was in the snapshot: deletes it, recreates it at
 * the snapshot's schema version using the same migrations, then writes every record back.
 */
export async function restoreSnapshot(
  snapshot: Snapshot,
  targetName: string,
  migrations: readonly Migration[],
): Promise<void> {
  await deleteDB(targetName);
  const db = await openWithMigrations(targetName, snapshot.dump.schemaVersion, migrations);
  try {
    await writeDump(db, snapshot.dump, { replace: true });
  } finally {
    db.close();
  }
}

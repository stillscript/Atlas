import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDB, type IDBPDatabase } from 'idb';
import { dumpDatabase, writeDump, type DatabaseDump } from '../../src/db/dump';
import type { Migration } from '../../src/db/migrations';
import { openWithMigrations } from '../../src/db/upgrade';

export const FIXTURE_DIR = join(import.meta.dirname, 'fixtures');

export interface Fixture extends DatabaseDump {
  description: string;
}

/** Every tests/db/fixtures/vN.json, keyed by schema version. */
export function loadFixtures(): Map<number, Fixture> {
  const fixtures = new Map<number, Fixture>();
  for (const file of readdirSync(FIXTURE_DIR)) {
    const match = /^v(\d+)\.json$/.exec(file);
    if (!match) continue;
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')) as Fixture;
    fixtures.set(Number(match[1]), fixture);
  }
  return fixtures;
}

/** Creates `name` at the fixture's schema version (using the real migrations) and fills it. */
export async function seed(name: string, fixture: DatabaseDump, migrations: readonly Migration[]): Promise<void> {
  const db = await openWithMigrations(name, fixture.schemaVersion, migrations);
  await writeDump(db, fixture, { replace: true });
  db.close();
}

export async function readAll(name: string): Promise<DatabaseDump> {
  const db = await openDB<unknown>(name);
  try {
    return await dumpDatabase(db);
  } finally {
    db.close();
  }
}

function keyOf(record: unknown): string {
  const r = record as { id?: unknown; key?: unknown };
  return String(r.id ?? r.key ?? JSON.stringify(record));
}

/** Store contents sorted by key, so two dumps can be compared regardless of insertion order. */
export function normalize(stores: Record<string, unknown[]>): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [name, records] of Object.entries(stores)) {
    out[name] = [...records].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  }
  return out;
}

export async function openRaw(name: string): Promise<IDBPDatabase<unknown>> {
  return openDB<unknown>(name);
}

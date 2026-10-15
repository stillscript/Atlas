import { describe, expect, it } from 'vitest';
import { DB_VERSION, MIGRATIONS, validateMigrations, type Migration } from '../../src/db/migrations';
import { DowngradeError, MigrationError, openAtlasDB } from '../../src/db/open';
import { getStoredVersion } from '../../src/db/probe';
import { getSnapshot, listSnapshots, restoreSnapshot, takeSnapshot } from '../../src/db/snapshot';
import { loadFixtures, normalize, readAll, seed } from './helpers';

const fixtures = loadFixtures();
const latestFixture = () => fixtures.get(DB_VERSION)!;

/** A realistic future migration used to exercise the upgrade path: adds a store and backfills a field. */
const testV2: Migration = {
  version: DB_VERSION + 1,
  name: 'test-add-tags',
  async up({ db, tx }) {
    db.createObjectStore('tags', { keyPath: 'id' });
    const sessions = tx.objectStore('sessions');
    let cursor = await sessions.openCursor();
    while (cursor) {
      const value = cursor.value as Record<string, unknown>;
      await cursor.update({ ...value, tags: value.status === 'completed' ? ['done'] : [] });
      cursor = await cursor.continue();
    }
  },
};

const throwingV2: Migration = {
  version: DB_VERSION + 1,
  name: 'test-throws',
  up({ db }) {
    db.createObjectStore('half-made');
    throw new Error('boom');
  },
};

const throwingAsyncV2: Migration = {
  version: DB_VERSION + 1,
  name: 'test-throws-after-writing',
  async up({ tx }) {
    const sessions = tx.objectStore('sessions');
    const cursor = await sessions.openCursor();
    if (cursor) await cursor.update({ ...(cursor.value as object), corrupted: true });
    throw new Error('late boom');
  },
};

describe('migration list', () => {
  it('is numbered 1..n with no gaps', () => {
    expect(() => validateMigrations(MIGRATIONS)).not.toThrow();
    expect(() => validateMigrations([MIGRATIONS[0]!, { ...testV2, version: 3 }])).toThrow(/expected 2/);
  });

  it('has a fixture for every schema version, including the current one', () => {
    for (let version = 1; version <= DB_VERSION; version++) {
      expect(fixtures.has(version), `tests/db/fixtures/v${version}.json is missing`).toBe(true);
    }
  });
});

describe('probing the stored version', () => {
  it('reports 0 for a missing database without creating it', async () => {
    expect(await getStoredVersion('nothing-here')).toBe(0);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain('nothing-here');
  });
});

describe('fresh install', () => {
  it('creates every store at the current version, with no snapshot', async () => {
    const { db, upgraded } = await openAtlasDB({ name: 'fresh' });
    expect(db.version).toBe(DB_VERSION);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(
      ['coachLog', 'exercises', 'gyms', 'kv', 'machineSettings', 'measurements', 'programs', 'sessions'].sort(),
    );
    expect(upgraded).toBeUndefined();
    db.close();
    expect(await listSnapshots()).toHaveLength(0);
  });
});

describe('every previous schema version migrates to the current one', () => {
  for (const [version, fixture] of fixtures) {
    it(`v${version} fixture opens at v${DB_VERSION} with every record intact`, async () => {
      await seed(`from-v${version}`, fixture, MIGRATIONS);
      const { db } = await openAtlasDB({ name: `from-v${version}` });
      expect(db.version).toBe(DB_VERSION);
      db.close();
      const after = await readAll(`from-v${version}`);
      for (const [store, records] of Object.entries(fixture.stores)) {
        expect(after.stores[store], `store ${store}`).toHaveLength(records.length);
      }
      if (version === DB_VERSION) {
        expect(normalize(after.stores)).toEqual(normalize(fixture.stores));
      }
    });
  }
});

describe('upgrading existing data', () => {
  it('snapshots first, then runs the migration and keeps all data', async () => {
    await seed('upgrade', latestFixture(), MIGRATIONS);
    const { db, upgraded } = await openAtlasDB({ name: 'upgrade', migrations: [...MIGRATIONS, testV2] });
    expect(db.version).toBe(DB_VERSION + 1);
    expect(upgraded?.fromVersion).toBe(DB_VERSION);
    db.close();

    const after = await readAll('upgrade');
    const before = latestFixture().stores;
    expect(after.stores.tags).toEqual([]);
    for (const [store, records] of Object.entries(before)) {
      expect(after.stores[store]).toHaveLength(records.length);
    }
    const completed = (after.stores.sessions as { status: string; tags: string[] }[]).filter((s) => s.status === 'completed');
    expect(completed.every((s) => s.tags[0] === 'done')).toBe(true);

    const snapshot = await getSnapshot(upgraded!.snapshotId);
    expect(snapshot?.reason).toBe('pre-migration');
    expect(snapshot?.fromVersion).toBe(DB_VERSION);
    expect(normalize(snapshot!.dump.stores)).toEqual(normalize(before));
  });

  it('runs again harmlessly: a second open does not migrate or snapshot', async () => {
    await seed('twice', latestFixture(), MIGRATIONS);
    (await openAtlasDB({ name: 'twice', migrations: [...MIGRATIONS, testV2] })).db.close();
    const second = await openAtlasDB({ name: 'twice', migrations: [...MIGRATIONS, testV2] });
    expect(second.upgraded).toBeUndefined();
    second.db.close();
    expect(await listSnapshots()).toHaveLength(1);
  });
});

describe('failed migrations never lose data', () => {
  for (const [label, failing] of [
    ['synchronous', throwingV2],
    ['asynchronous, after writing', throwingAsyncV2],
  ] as const) {
    it(`${label}: throws MigrationError and leaves the data exactly as it was`, async () => {
      await seed('fail', latestFixture(), MIGRATIONS);
      const error = await openAtlasDB({ name: 'fail', migrations: [...MIGRATIONS, failing] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MigrationError);
      const migrationError = error as MigrationError;
      expect(migrationError.fromVersion).toBe(DB_VERSION);
      expect(migrationError.snapshotId).toBeTruthy();

      expect(await getStoredVersion('fail')).toBe(DB_VERSION);
      const after = await readAll('fail');
      expect(Object.keys(after.stores)).not.toContain('half-made');
      expect(normalize(after.stores)).toEqual(normalize(latestFixture().stores));

      // The app still opens normally with the released migrations afterwards.
      const { db } = await openAtlasDB({ name: 'fail' });
      db.close();
    });
  }
});

describe('snapshots', () => {
  it('restore rebuilds the database exactly as it was', async () => {
    await seed('restore', latestFixture(), MIGRATIONS);
    const id = await takeSnapshot('restore', DB_VERSION, { reason: 'manual', appVersion: 'test' });

    const { db } = await openAtlasDB({ name: 'restore' });
    await db.clear('sessions');
    await db.delete('kv', 'profile');
    db.close();

    const snapshot = await getSnapshot(id);
    await restoreSnapshot(snapshot!, 'restore', MIGRATIONS);
    const after = await readAll('restore');
    expect(normalize(after.stores)).toEqual(normalize(latestFixture().stores));
  });

  it('keeps only the five most recent', async () => {
    await seed('many', latestFixture(), MIGRATIONS);
    for (let i = 0; i < 7; i++) {
      await takeSnapshot('many', DB_VERSION, { reason: 'manual', appVersion: `0.0.${i}` });
    }
    const snapshots = await listSnapshots();
    expect(snapshots).toHaveLength(5);
    expect(snapshots[0]?.appVersion).toBe('0.0.6');
  });
});

describe('downgrades', () => {
  it('refuses to open data written by a newer schema', async () => {
    await seed('newer', { ...latestFixture(), schemaVersion: DB_VERSION + 1 }, [...MIGRATIONS, testV2]);
    await expect(openAtlasDB({ name: 'newer' })).rejects.toBeInstanceOf(DowngradeError);
  });
});

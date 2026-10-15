import { describe, expect, it } from 'vitest';
import { createBackup, importBackup, parseBackup } from '../../src/db/backup';
import { DB_VERSION, MIGRATIONS, type Migration } from '../../src/db/migrations';
import { openAtlasDB } from '../../src/db/open';
import { getSnapshot } from '../../src/db/snapshot';
import type { AppMeta, KvRecord, Session } from '../../src/db/types';
import { loadFixtures, normalize, readAll, seed } from './helpers';

const fixture = loadFixtures().get(DB_VERSION)!;

describe('backup files', () => {
  it('round-trips: export, parse, preview', async () => {
    await seed('src', fixture, MIGRATIONS);
    const { db } = await openAtlasDB({ name: 'src' });
    const backup = await createBackup(db, '1.2.3');
    db.close();

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview.appVersion).toBe('1.2.3');
    expect(parsed.preview.workouts).toBe(1);
    expect(parsed.preview.firstWorkout).toBe('2026-09-15');
    expect(parsed.preview.measurements).toBe(2);
    expect(parsed.preview.gyms).toEqual(['Office']);
  });

  it.each([
    ['not JSON', 'hello', /couldn't be read/],
    ['another app’s file', JSON.stringify({ format: 'other' }), /isn't an Atlas backup/],
    ['a newer schema', JSON.stringify({ format: 'atlas-backup', formatVersion: 1, schemaVersion: DB_VERSION + 1, stores: {} }), /newer version/],
    ['damaged stores', JSON.stringify({ format: 'atlas-backup', formatVersion: 1, schemaVersion: 1, stores: { kv: 'x' } }), /damaged/],
  ])('rejects %s with a plain-language message', (_label, text, message) => {
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(message);
  });

  it('import replaces data, keeps this device’s identity, and can be undone', async () => {
    await seed('src', fixture, MIGRATIONS);
    const source = await openAtlasDB({ name: 'src' });
    const backup = await createBackup(source.db, '1.0.0');
    source.db.close();

    const target = await openAtlasDB({ name: 'dst' });
    await target.db.put('kv', { key: 'app', value: { installId: 'inst-this-phone', createdAt: 1, lastSeenVersion: '1.0.0' } });
    await target.db.put('measurements', { id: 'only-here', date: '2026-01-01', weight: 170, at: 1 });
    const before = await readAll('dst');

    const snapshotId = await importBackup(target.db, backup);
    target.db.close();

    const after = await readAll('dst');
    expect(after.stores.measurements).toHaveLength(2);
    expect((after.stores.measurements as { id: string }[]).map((m) => m.id)).not.toContain('only-here');
    const app = (after.stores.kv as KvRecord[]).find((r) => r.key === 'app')?.value as AppMeta;
    expect(app.installId).toBe('inst-this-phone');
    expect(app.activeSessionId).toBeUndefined();
    const active = (after.stores.sessions as Session[]).find((s) => s.id === 'ses-active');
    expect(active?.status).toBe('abandoned');

    const snapshot = await getSnapshot(snapshotId);
    expect(snapshot?.reason).toBe('pre-import');
    expect(normalize(snapshot!.dump.stores)).toEqual(normalize(before.stores));
  });

  it('upgrades an older backup through the same migrations as on-device data', async () => {
    const v2: Migration = {
      version: DB_VERSION + 1,
      name: 'test-backfill',
      async up({ tx }) {
        const store = tx.objectStore('measurements');
        let cursor = await store.openCursor();
        while (cursor) {
          await cursor.update({ ...(cursor.value as object), source: 'manual' });
          cursor = await cursor.continue();
        }
      },
    };
    const migrations = [...MIGRATIONS, v2];
    await seed('old', fixture, MIGRATIONS);
    const old = await openAtlasDB({ name: 'old' });
    const backup = await createBackup(old.db, '1.0.0');
    old.db.close();

    const target = await openAtlasDB({ name: 'new', migrations });
    await importBackup(target.db, backup, { migrations });
    target.db.close();

    const after = await readAll('new');
    expect(after.schemaVersion).toBe(DB_VERSION + 1);
    expect((after.stores.measurements as { source: string }[]).every((m) => m.source === 'manual')).toBe(true);
  });
});

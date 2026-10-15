import { describe, expect, it } from 'vitest';
import { openAtlasDB } from '../../src/db/open';
import {
  beginSession,
  closeSession,
  discardSession,
  loadActiveSession,
  loadCompletedSessions,
  loadMachineSettings,
  machineSettingId,
  saveMachineSetting,
  saveSession,
} from '../../src/db/sessions';
import type { AppMeta, Session } from '../../src/db/types';

const T0 = Date.UTC(2026, 9, 14, 17);

function session(id: string, startedAt = T0): Session {
  return { id, date: '2026-10-14', status: 'active', startedAt, entries: [], cardio: [], cursor: { entryIndex: 0, setIndex: 0 }, updatedAt: startedAt };
}

async function appMeta(db: Awaited<ReturnType<typeof openAtlasDB>>['db']): Promise<AppMeta | undefined> {
  return (await db.get('kv', 'app'))?.value as AppMeta | undefined;
}

describe('workout storage', () => {
  it('starting a workout saves it and marks it active in one step', async () => {
    const { db } = await openAtlasDB({ name: 's1' });
    await db.put('kv', { key: 'app', value: { installId: 'inst-1', createdAt: T0 - 1000, lastSeenVersion: '1.0.0' } });
    const app = await beginSession(db, session('a'));
    expect(app).toMatchObject({ installId: 'inst-1', lastSeenVersion: '1.0.0', activeSessionId: 'a' });
    expect(await appMeta(db)).toEqual(app);
    expect(await loadActiveSession(db, app)).toMatchObject({ id: 'a', status: 'active' });
  });

  it('every change is saved, so a reopened app resumes it', async () => {
    const { db } = await openAtlasDB({ name: 's2' });
    const app = await beginSession(db, session('a'));
    await saveSession(db, { ...session('a'), cursor: { entryIndex: 2, setIndex: 1 }, rest: { startedAt: T0, endsAt: T0 + 90_000, durationSec: 90 } });
    db.close();
    const { db: reopened } = await openAtlasDB({ name: 's2' });
    const resumed = await loadActiveSession(reopened, app);
    expect(resumed?.cursor).toEqual({ entryIndex: 2, setIndex: 1 });
    expect(resumed?.rest?.endsAt).toBe(T0 + 90_000);
  });

  it('finishing clears the active workout and lists it with the others, oldest first', async () => {
    const { db } = await openAtlasDB({ name: 's3' });
    await closeSession(db, { ...session('old', T0 - 86_400_000), status: 'completed' });
    await beginSession(db, session('a'));
    const app = await closeSession(db, { ...session('a'), status: 'completed', endedAt: T0 + 3_000_000 });
    expect(app.activeSessionId).toBeUndefined();
    expect((await appMeta(db))?.activeSessionId).toBeUndefined();
    expect((await loadCompletedSessions(db)).map((s) => s.id)).toEqual(['old', 'a']);
    expect(await loadActiveSession(db, { ...app, activeSessionId: 'a' })).toBeNull();
  });

  it('discarding removes the workout entirely', async () => {
    const { db } = await openAtlasDB({ name: 's4' });
    await beginSession(db, session('a'));
    const app = await discardSession(db, 'a');
    expect(app.activeSessionId).toBeUndefined();
    expect(await db.get('sessions', 'a')).toBeUndefined();
  });

  it('a missing active workout resolves to nothing instead of failing', async () => {
    const { db } = await openAtlasDB({ name: 's5' });
    expect(await loadActiveSession(db, { installId: 'x', createdAt: T0, activeSessionId: 'gone' })).toBeNull();
  });

  it('machine settings are kept per gym, machine and exercise', async () => {
    const { db } = await openAtlasDB({ name: 's6' });
    const id = machineSettingId('gym-1', 'eq-leg-press', 'leg-press');
    await saveMachineSetting(db, { id, gymId: 'gym-1', equipmentId: 'eq-leg-press', exerciseId: 'leg-press', fields: [{ label: 'Seat back position', value: '4' }], updatedAt: T0 });
    await saveMachineSetting(db, { id: machineSettingId('gym-2', 'eq', 'leg-press'), gymId: 'gym-2', equipmentId: 'eq', exerciseId: 'leg-press', fields: [], updatedAt: T0 });
    const list = await loadMachineSettings(db, 'gym-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'gym-1:eq-leg-press:leg-press', fields: [{ label: 'Seat back position', value: '4' }] });
  });
});

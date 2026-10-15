import { describe, expect, it } from 'vitest';
import { deleteMeasurement, loadMeasurements, saveMeasurement } from '../../src/db/coach';
import { openAtlasDB } from '../../src/db/open';

describe('body measurements storage', () => {
  it('saves, updates and deletes entries, oldest first', async () => {
    const { db } = await openAtlasDB({ name: 'meas' });
    await saveMeasurement(db, { id: 'b', date: '2026-10-10', weight: 186, at: 2000 });
    await saveMeasurement(db, { id: 'a', date: '2026-10-01', weight: 188, waist: 34, at: 1000 });
    expect((await loadMeasurements(db)).map((m) => m.id)).toEqual(['a', 'b']);
    await saveMeasurement(db, { id: 'b', date: '2026-10-10', weight: 185.6, at: 2000 });
    expect((await loadMeasurements(db)).find((m) => m.id === 'b')?.weight).toBe(185.6);
    await deleteMeasurement(db, 'a');
    expect((await loadMeasurements(db)).map((m) => m.id)).toEqual(['b']);
  });
});

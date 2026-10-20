import { describe, expect, it } from 'vitest';
import type { LoadModel } from '../../src/db/types';
import { warmupPlan } from '../../src/domain/warmup';
import { toggleWarmup, workSets } from '../../src/domain/workout';
import type { Session } from '../../src/db/types';

const plates: LoadModel = {
  kind: 'plates',
  barWeight: 45,
  plates: [
    { weight: 45, pairs: 4 },
    { weight: 25, pairs: 2 },
    { weight: 10, pairs: 2 },
    { weight: 5, pairs: 2 },
    { weight: 2.5, pairs: 2 },
  ],
};
const stack: LoadModel = { kind: 'stack', weights: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], addOns: [] };
const compound = { kind: 'compound' as const, loadMode: 'total' as const };
const main = { role: 'main' as const, target: { sets: 3, repsLow: 6, repsHigh: 10, reason: 'history' as const } };

describe('warm-up sets', () => {
  it('ramps to the working weight at about 50, 70 and 85%, fewer reps as it gets heavier', () => {
    const plan = warmupPlan(main, compound, plates, 185);
    expect(plan).toEqual([
      { load: 90, reps: 8 },
      { load: 125, reps: 5 },
      { load: 155, reps: 3 },
    ]);
    for (const step of plan) expect(step.load).toBeLessThan(185);
  });

  it('snaps to loads the equipment can make and drops repeats', () => {
    const plan = warmupPlan(main, compound, stack, 40);
    expect(plan.map((s) => s.load)).toEqual([20, 30]);
    expect(warmupPlan(main, compound, plates, 55).map((s) => s.load)).toEqual([45]);
  });

  it('skips accessories, isolation work, bodyweight moves and first-time guesses', () => {
    expect(warmupPlan({ ...main, role: 'accessory' }, compound, plates, 185)).toEqual([]);
    expect(warmupPlan(main, { kind: 'isolation', loadMode: 'total' }, stack, 60)).toEqual([]);
    expect(warmupPlan(main, { kind: 'compound', loadMode: 'bodyweight' }, { kind: 'bodyweight', addedWeights: [10, 20] }, 20)).toEqual([]);
    expect(warmupPlan({ ...main, target: { ...main.target, reason: 'calibrate' } }, compound, plates, 95)).toEqual([]);
    expect(warmupPlan(main, compound, plates, null)).toEqual([]);
    expect(warmupPlan(main, compound, plates, 45)).toEqual([]);
  });

  it('ticks off as a checklist without logging a set', () => {
    const session = {
      id: 's',
      entries: [{ id: 'e', exerciseId: 'smith-squat', role: 'main', sets: [] }],
      updatedAt: 0,
    } as unknown as Session;
    const once = toggleWarmup(session, 0, 1, 5);
    expect(once.entries[0]!.warmupDone).toEqual([1]);
    expect(once.entries[0]!.sets).toEqual([]);
    expect(workSets(once.entries[0]!)).toHaveLength(0);
    expect(toggleWarmup(toggleWarmup(once, 0, 0, 6), 0, 1, 7).entries[0]!.warmupDone).toEqual([0]);
  });
});

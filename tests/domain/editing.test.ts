import { describe, expect, it } from 'vitest';
import type { Program } from '../../src/db/types';
import { createGymFromCatalog, createGymFromPreset } from '../../src/domain/gym';
import { addEquipment, missingEquipment, parseWeights, remapDayForGym, removeEquipment, renameGym, weightRange } from '../../src/domain/gymEdit';
import {
  addDay,
  addSlot,
  moveSlot,
  normalizeSupersets,
  removeDay,
  removeSlot,
  replaceExercise,
  restartBlock,
  setBlockLength,
  setWeekday,
  toggleSuperset,
  unscheduledDays,
  updateSlot,
} from '../../src/domain/planEdit';
import { blockPosition } from '../../src/domain/schedule';
import { createSession } from '../../src/domain/workout';
import { T0, makeProgram, office, profile, slot } from '../coach/helpers';

const ids = (p: Program, dayId = 'a') => p.days.find((d) => d.id === dayId)!.slots.map((s) => s.exerciseId);

describe('plan edits', () => {
  const program = makeProgram();

  it('changes sets, reps and effort within sensible limits, keeping slot ids', () => {
    const next = updateSlot(program, 'a', 'a-legs', { sets: 9, repsLow: 12, repsHigh: 10, rir: 7 }, T0);
    const s = next.days[0]!.slots.find((x) => x.id === 'a-legs')!;
    expect(s).toMatchObject({ sets: 6, repsLow: 12, repsHigh: 12, rir: 4 });
    expect(next.updatedAt).toBe(T0);
    expect(program.days[0]!.slots.find((x) => x.id === 'a-legs')!.sets).toBe(3);
  });

  it('reorders, removes and adds exercises', () => {
    const moved = moveSlot(program, 'a', 'a-legs', -1, T0);
    expect(ids(moved)).toEqual(['leg-press', 'smith-incline-press', 'lat-pulldown', 'db-lateral-raise']);
    expect(moveSlot(program, 'a', 'a-press', -1, T0).days[0]!.slots[0]!.id).toBe('a-press');
    const removed = removeSlot(program, 'a', 'a-lat', T0);
    expect(ids(removed)).not.toContain('db-lateral-raise');
    const { program: added, slotId } = addSlot(program, 'a', 'cable-curl', { goal: 'muscle', experience: 'intermediate' }, T0);
    expect(added.days[0]!.slots.find((s) => s.id === slotId)).toMatchObject({ exerciseId: 'cable-curl', role: 'accessory', sets: 3, pattern: 'biceps' });
  });

  it('replaces an exercise, keeping the prescription', () => {
    const next = replaceExercise(program, 'a', 'a-pull', 'pull-up', T0);
    expect(next.days[0]!.slots.find((s) => s.id === 'a-pull')).toMatchObject({ exerciseId: 'pull-up', sets: 3, repsLow: 10, repsHigh: 12 });
  });

  it('pairs and splits supersets; a pair broken by a move or removal dissolves', () => {
    const paired = toggleSuperset(program, 'a', 'a-pull', T0);
    const day = paired.days[0]!;
    expect(day.slots.find((s) => s.id === 'a-pull')!.superset).toBeDefined();
    expect(day.slots.find((s) => s.id === 'a-lat')!.superset).toBe(day.slots.find((s) => s.id === 'a-pull')!.superset);
    // The pair moves as one block.
    expect(ids(moveSlot(paired, 'a', 'a-lat', -1, T0))).toEqual(['smith-incline-press', 'lat-pulldown', 'db-lateral-raise', 'leg-press']);
    const split = removeSlot(paired, 'a', 'a-lat', T0);
    expect(split.days[0]!.slots.every((s) => !s.superset)).toBe(true);
    expect(toggleSuperset(paired, 'a', 'a-pull', T0).days[0]!.slots.every((s) => !s.superset)).toBe(true);
    // Nothing after the last exercise to pair with.
    expect(toggleSuperset(program, 'a', 'a-lat', T0).days[0]!.slots.every((s) => !s.superset)).toBe(true);
  });

  it('normalizes stray superset marks', () => {
    const day = { id: 'x', name: 'X', slots: [slot('1', 'leg-press', 'main', 3, 8, 10), slot('2', 'lat-pulldown', 'main', 3, 8, 10), slot('3', 'cable-curl', 'main', 3, 8, 10)] };
    day.slots[0]!.superset = 'ss';
    day.slots[2]!.superset = 'ss';
    expect(normalizeSupersets(day).slots.every((s) => !s.superset)).toBe(true);
  });

  it('days: add (empty or a copy), schedule, remove', () => {
    const { program: withCopy, dayId } = addDay(program, { name: 'Day A2', copyOf: 'a' }, T0);
    const copy = withCopy.days.find((d) => d.id === dayId)!;
    expect(copy.slots.map((s) => s.exerciseId)).toEqual(ids(program));
    expect(copy.slots.every((s, i) => s.id !== program.days[0]!.slots[i]!.id)).toBe(true);
    expect(unscheduledDays(withCopy).map((d) => d.id)).toEqual([dayId]);
    const scheduled = setWeekday(withCopy, 5, dayId, T0);
    expect(scheduled.schedule[5]).toBe(dayId);
    expect(setWeekday(scheduled, 5, 'nope', T0)).toBe(scheduled);
    const removed = removeDay(scheduled, 'a', T0);
    expect(removed.days.map((d) => d.id)).not.toContain('a');
    expect(removed.schedule).toEqual([null, null, 'b', null, null, dayId, null]);
    const single = { ...program, days: [program.days[0]!] };
    expect(removeDay(single, 'a', T0)).toBe(single);
  });

  it('block length and a fresh block', () => {
    expect(setBlockLength(program, 20, T0).block.lengthWeeks).toBe(10);
    const fresh = restartBlock(program, T0);
    expect(blockPosition(fresh, new Date(T0)).week).toBe(1);
  });
});

describe('gym edits', () => {
  it('rename, add and remove equipment', () => {
    const gym = createGymFromCatalog('Home', ['dumbbells-5-100'], T0);
    expect(renameGym(gym, '  Garage ', T0).name).toBe('Garage');
    expect(renameGym(gym, '   ', T0)).toBe(gym);
    const withBench = addEquipment(gym, 'flat-bench', T0);
    expect(withBench.equipment.map((e) => e.catalogId)).toEqual(['dumbbells-5-100', 'flat-bench']);
    expect(addEquipment(withBench, 'flat-bench', T0)).toBe(withBench);
    expect(missingEquipment(withBench).some((d) => d.id === 'flat-bench')).toBe(false);
    expect(removeEquipment(withBench, withBench.equipment[0]!.id, T0).equipment).toHaveLength(1);
  });

  it('parses weight lists and ranges', () => {
    expect(parseWeights('5, 7.5 10;10  12,5 x -3')).toEqual([5, 7.5, 10, 12, 5].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b));
    expect(weightRange(5, 25, 5)).toEqual([5, 10, 15, 20, 25]);
  });
});

describe('a plan in another gym (I3)', () => {
  const home = createGymFromCatalog('Home', ['dumbbells-5-100', 'flat-bench', 'pull-up-bar'], T0);
  const day = makeProgram().days[0]!;

  it('swaps in the best variation this gym can do, and keeps the plan unchanged', () => {
    const { day: remapped, changes } = remapDayForGym(day, home, 'intermediate');
    expect(changes.map((c) => c.from)).toEqual(['smith-incline-press', 'leg-press', 'lat-pulldown']);
    // A flat bench can't incline, so incline pressing falls back to its related movement.
    expect(changes.find((c) => c.from === 'smith-incline-press')?.to).toBe('db-bench-press');
    expect(changes.find((c) => c.from === 'lat-pulldown')?.to).toBe('pull-up');
    expect(remapped.slots.find((s) => s.id === 'a-press')).toMatchObject({ exerciseId: 'db-bench-press', sets: 3 });
    expect(day.slots[0]!.exerciseId).toBe('smith-incline-press');
  });

  it('with an adjustable bench, the same movement is kept', () => {
    const better = createGymFromCatalog('Home', ['dumbbells-5-100', 'adjustable-bench'], T0);
    expect(remapDayForGym(day, better, 'intermediate').changes.find((c) => c.from === 'smith-incline-press')?.to).toBe('db-incline-press');
  });

  it('changes nothing in the gym the plan was built for', () => {
    const { day: same, changes } = remapDayForGym(day, office, 'intermediate');
    expect(changes).toEqual([]);
    expect(same).toBe(day);
  });

  it('workouts in another gym use the stand-ins', () => {
    const session = createSession({ program: makeProgram(), day, gym: home, profile: profile(), history: new Map(), now: T0 });
    expect(session.entries.map((e) => e.exerciseId)).not.toContain('smith-incline-press');
    expect(session.entries.find((e) => e.slotId === 'a-press')?.exerciseId).toBe('db-bench-press');
  });

  it('the Office preset still builds', () => {
    expect(createGymFromPreset('office', T0).equipment.length).toBeGreaterThan(10);
  });
});

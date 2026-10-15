import { describe, expect, it } from 'vitest';
import type { ExerciseEntry, Profile, RepsInReserve, Session } from '../../src/db/types';
import { createGymFromPreset } from '../../src/domain/gym';
import { buildProgram, type OnboardingAnswers } from '../../src/domain/onboarding';
import {
  addEntry,
  addSet,
  buildHistory,
  createSession,
  deleteCardio,
  deleteSet,
  detectRecords,
  endRest,
  extendRest,
  finishSession,
  hasLoggedWork,
  jumpTo,
  liftingDone,
  logSet,
  nextEntryIndex,
  postponeEntry,
  prefill,
  rateSet,
  removeEntry,
  restAfter,
  skipEntry,
  suggestFirstSet,
  summarize,
  swapEntry,
  toggleExtraDone,
  type ExerciseHistory,
} from '../../src/domain/workout';

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 14, 17);

const office = createGymFromPreset('office', T0);
const answers: OnboardingAnswers = {
  goal: 'muscle',
  experience: 'intermediate',
  trainingDays: [0, 1, 2, 3, 4],
  sessionMinutes: 75,
  sex: 'unspecified',
  gym: { kind: 'preset', presetId: 'office' },
  plan: 'pillar',
  startingLoads: {},
};
const program = buildProgram(answers, office, T0).program;
const day = (id: string) => program.days.find((d) => d.id === id)!;
const profile: Profile = {
  goal: 'muscle',
  experience: 'intermediate',
  daysPerWeek: 5,
  trainingDays: [0, 1, 2, 3, 4],
  sessionMinutes: 75,
  createdAt: T0,
  updatedAt: T0,
};
const empty: ExerciseHistory = new Map();

function start(dayId: string, history: ExerciseHistory = empty, who: Profile = profile): Session {
  return createSession({ program, day: day(dayId), gym: office, profile: who, history, now: T0 });
}

/** A completed session with one exercise, `daysAgo` days before T0. */
function past(exerciseId: string, sets: [number | null, number, RepsInReserve?][], daysAgo: number): Session {
  const at = T0 - daysAgo * DAY;
  const entry: ExerciseEntry = {
    id: `e-${exerciseId}-${daysAgo}`,
    exerciseId,
    sets: sets.map(([load, reps, rir], i) => ({ id: `s-${daysAgo}-${i}`, kind: 'work', load, reps, rir, at: at + i * MIN })),
  };
  return { id: `past-${exerciseId}-${daysAgo}`, date: '2026-10-01', status: 'completed', startedAt: at, endedAt: at + 50 * MIN, entries: [entry], cardio: [], updatedAt: at };
}

/** Logs `count` sets on the current cursor entry, each at its prefilled weight and reps. */
function logPrefilled(session: Session, count: number, rir: RepsInReserve = 2, now = T0): Session {
  let s = session;
  for (let i = 0; i < count; i++) {
    const index = s.cursor!.entryIndex;
    const { load, reps } = prefill(s, index, office);
    s = logSet(s, index, { load, reps, rir }, now + i * 3 * MIN);
  }
  return s;
}

const indexOf = (session: Session, exerciseId: string) => session.entries.findIndex((e) => e.exerciseId === exerciseId);

// ---------------------------------------------------------------- starting a session

describe('creating a session', () => {
  it('copies the plan’s exercises, targets, finishers and name', () => {
    const session = start('lower-b');
    expect(session.status).toBe('active');
    expect(session.dayName).toBe(day('lower-b').name);
    expect(session.entries.map((e) => e.slotId)).toEqual(day('lower-b').slots.map((s) => s.id));
    expect(session.extras?.map((x) => x.id)).toEqual(day('lower-b').extras?.map((x) => x.id));
    expect(session.cursor).toEqual({ entryIndex: 0, setIndex: 0 });
    const legPress = session.entries[indexOf(session, 'leg-press')]!;
    expect(legPress.equipmentId).toBe(office.equipment.find((e) => e.catalogId === 'precor-resolute-leg-press')!.id);
    expect(legPress.target).toMatchObject({ sets: 3, repsLow: 10, repsHigh: 12 });
  });

  it('calibrates a first-time lift from a light guess, aiming a rep softer', () => {
    const legPress = start('lower-b').entries.find((e) => e.exerciseId === 'leg-press')!;
    const slot = day('lower-b').slots.find((s) => s.exerciseId === 'leg-press')!;
    expect(legPress.target).toMatchObject({ load: 160, firstReps: 11, reason: 'calibrate', calibrating: true });
    expect(legPress.target!.rir).toBe((slot.rir ?? 2) + 1);
  });

  it('uses a set entered at setup without calibrating', () => {
    const who = { ...profile, startingLoads: { 'leg-press': { load: 200, reps: 10 } } };
    const legPress = start('lower-b', empty, who).entries.find((e) => e.exerciseId === 'leg-press')!;
    expect(legPress.target?.reason).toBe('known');
    expect(legPress.target?.calibrating).toBeUndefined();
  });

  it('starts from last time’s working weight', () => {
    const history = buildHistory([past('leg-press', [[180, 12], [200, 10], [200, 9]], 7)]);
    const s = suggestFirstSet('leg-press', { repsLow: 10, repsHigh: 12 }, { gym: office, profile, history });
    expect(s).toEqual({ load: 200, reps: 10, reason: 'history', calibrating: true });
  });

  it('stops calibrating after two sessions', () => {
    const history = buildHistory([past('leg-press', [[180, 12]], 14), past('leg-press', [[200, 11]], 7)]);
    expect(suggestFirstSet('leg-press', { repsLow: 10, repsHigh: 12 }, { gym: office, profile, history }).calibrating).toBe(false);
  });

  it('keeps reps inside today’s range', () => {
    const history = buildHistory([past('leg-press', [[200, 15], [200, 15]], 7), past('leg-press', [[200, 15]], 3)]);
    expect(suggestFirstSet('leg-press', { repsLow: 8, repsHigh: 12 }, { gym: office, profile, history }).reps).toBe(12);
  });

  it('suggests no weight for bodyweight work', () => {
    const pull = start('pull').entries[0]!;
    expect(pull.exerciseId).toBe('pull-up');
    expect(pull.target).toMatchObject({ load: null, reason: 'bodyweight' });
  });
});

describe('history', () => {
  it('counts only completed sessions and work sets', () => {
    const done = past('leg-press', [[200, 10]], 7);
    const abandoned = { ...past('leg-press', [[300, 10]], 3), status: 'abandoned' as const };
    const warmup = past('leg-press', [[100, 10]], 5);
    warmup.entries[0]!.sets[0]!.kind = 'warmup';
    const history = buildHistory([abandoned, warmup, done]);
    expect(history.get('leg-press')?.map((e) => e.sessionId)).toEqual([done.id]);
  });
});

// ---------------------------------------------------------------- logging

describe('logging sets', () => {
  it('saves the set, starts the rest timer as an end time, and moves to the next set', () => {
    const session = start('lower-b');
    const index = indexOf(session, 'leg-press');
    const after = logSet(jumpTo(session, index, T0), index, { load: 160, reps: 11, rir: 3 }, T0 + MIN);
    const entry = after.entries[index]!;
    expect(entry.sets).toHaveLength(1);
    expect(entry.sets[0]).toMatchObject({ load: 160, reps: 11, rir: 3, kind: 'work' });
    expect(after.cursor).toEqual({ entryIndex: index, setIndex: 1 });
    const rest = restAfter(entry, entry.sets[0]!);
    expect(after.rest).toEqual({ startedAt: T0 + MIN, endsAt: T0 + MIN + rest * 1000, durationSec: rest });
  });

  it('records how long the rest really was', () => {
    let s = start('lower-b');
    s = logSet(s, 0, { load: 135, reps: 5 }, T0);
    s = logSet(s, 0, { load: 135, reps: 5 }, T0 + 200_000);
    expect(s.entries[0]!.sets[1]!.restTakenSec).toBe(200);
  });

  it('moves to the next exercise after the last set', () => {
    let s = start('lower-b');
    const sets = s.entries[0]!.target!.sets;
    s = logPrefilled(s, sets);
    expect(s.cursor).toEqual({ entryIndex: 1, setIndex: 0 });
  });

  it('rest timer: +30 s, skip, and 30 s more after an all-out set', () => {
    let s = logSet(start('lower-b'), 1, { load: 160, reps: 11 }, T0);
    const endsAt = s.rest!.endsAt;
    s = extendRest(s, 30, T0 + 10_000);
    expect(s.rest!.endsAt).toBe(endsAt + 30_000);
    s = rateSet(s, 1, s.entries[1]!.sets[0]!.id, 0, T0 + 11_000);
    expect(s.rest!.endsAt).toBe(endsAt + 60_000);
    // Changing the rating again doesn't stack another 30 s.
    s = rateSet(s, 1, s.entries[1]!.sets[0]!.id, 0, T0 + 12_000);
    expect(s.rest!.endsAt).toBe(endsAt + 60_000);
    expect(endRest(s, T0 + 20_000).rest).toBeUndefined();
  });

  it('+30 s after the timer ran out counts from now', () => {
    let s = logSet(start('lower-b'), 1, { load: 160, reps: 11 }, T0);
    const late = s.rest!.endsAt + 60_000;
    s = extendRest(s, 30, late);
    expect(s.rest!.endsAt).toBe(late + 30_000);
  });

  it('rests longer after heavy, low-rep sets, within limits', () => {
    const s = start('lower-b');
    const deadlift = s.entries[0]!;
    const base = deadlift.target!.restSec!;
    const set = (reps: number, rir?: RepsInReserve) => ({ id: 'x', kind: 'work' as const, load: 135, reps, rir, at: T0 });
    expect(restAfter(deadlift, set(5))).toBe(Math.min(300, base + 30));
    expect(restAfter(deadlift, set(5, 0))).toBe(Math.min(300, base + 60));
    expect(restAfter({ ...deadlift, target: { ...deadlift.target!, restSec: 290 } }, set(3, 0))).toBe(300);
  });

  it('edits: delete a set, add a set, skip an exercise', () => {
    let s = logPrefilled(start('lower-b'), 2);
    const firstId = s.entries[0]!.sets[0]!.id;
    s = deleteSet(s, 0, firstId, T0 + 10 * MIN);
    expect(s.entries[0]!.sets).toHaveLength(1);
    expect(s.cursor).toEqual({ entryIndex: 0, setIndex: 1 });

    s = logPrefilled(s, 2);
    expect(s.cursor?.entryIndex).toBe(1);
    s = addSet(s, 0, T0 + 20 * MIN);
    expect(s.entries[0]!.target!.sets).toBe(4);
    expect(s.cursor).toEqual({ entryIndex: 0, setIndex: 3 });

    s = skipEntry(s, 0, T0 + 21 * MIN);
    expect(s.entries[0]!.skipped).toBe(true);
    expect(s.cursor?.entryIndex).toBe(1);
  });

  it('comes back to an exercise that was jumped over', () => {
    let s = start('lower-b');
    s = jumpTo(s, 2, T0);
    s = logPrefilled(s, s.entries[2]!.target!.sets);
    // Exercise 3 is next, then the loop comes back around to 0 and 1.
    expect(s.cursor?.entryIndex).toBe(3);
    for (const i of [3, 4]) s = logPrefilled(jumpTo(s, i, T0), s.entries[i]!.target!.sets);
    expect(s.cursor?.entryIndex).toBe(0);
    expect(nextEntryIndex(s, 4)).toBe(0);
  });

  it('knows when the lifting is done', () => {
    let s = start('lower-b');
    for (let i = 0; i < s.entries.length; i++) s = i % 2 ? skipEntry(s, i, T0) : logPrefilled(jumpTo(s, i, T0), s.entries[i]!.target!.sets);
    expect(liftingDone(s)).toBe(true);
    expect(s.cursor?.entryIndex).toBe(s.entries.length);
  });
});

// ---------------------------------------------------------------- calibration (A1)

describe('calibration prefill', () => {
  function afterFirstSet(rir: RepsInReserve, reps = 11) {
    let s = start('lower-b');
    const index = indexOf(s, 'leg-press');
    s = logSet(jumpTo(s, index, T0), index, { load: 160, reps, rir }, T0);
    return prefill(s, index, office);
  }

  it('4+ left: about 20% heavier, back to the middle of the range', () => {
    expect(afterFirstSet(4)).toEqual({ load: 190, reps: 11 });
  });
  it('3 left: one step up', () => {
    expect(afterFirstSet(3).load).toBe(170);
  });
  it('1–2 left: hold, same reps', () => {
    expect(afterFirstSet(2, 12)).toEqual({ load: 160, reps: 12 });
    expect(afterFirstSet(1).load).toBe(160);
  });
  it('nothing left or short of the range: one step down', () => {
    expect(afterFirstSet(0).load).toBe(150);
    expect(afterFirstSet(2, 8).load).toBe(150);
  });
  it('unrated: hold', () => {
    let s = start('lower-b');
    const index = indexOf(s, 'leg-press');
    s = logSet(s, index, { load: 160, reps: 11 }, T0);
    expect(prefill(s, index, office).load).toBe(160);
  });
  it('once the weight is known, the next set repeats the last one', () => {
    const history = buildHistory([past('leg-press', [[180, 12]], 14), past('leg-press', [[200, 11]], 7)]);
    let s = start('lower-b', history);
    const index = indexOf(s, 'leg-press');
    expect(s.entries[index]!.target).toMatchObject({ load: 200, firstReps: 11, reason: 'history' });
    s = logSet(s, index, { load: 200, reps: 11, rir: 4 }, T0);
    expect(prefill(s, index, office)).toEqual({ load: 200, reps: 11 });
  });
  it('a big equipment jump: more reps first, then the jump at the bottom of the range (A5)', () => {
    let s = start('lower-a');
    expect(s.entries[0]!.exerciseId).toBe('smith-squat');
    // The Office Smith has only 25s and 45s: after 85 the next load is 125 (+47%).
    s = logSet(s, 0, { load: 85, reps: 7, rir: 4 }, T0);
    expect(prefill(s, 0, office)).toEqual({ load: 85, reps: 10 });
    s = logSet(s, 0, { load: 85, reps: 10, rir: 4 }, T0 + 3 * MIN);
    expect(prefill(s, 0, office)).toEqual({ load: 85, reps: 13 });
    s = logSet(s, 0, { load: 85, reps: 13, rir: 4 }, T0 + 6 * MIN);
    expect(prefill(s, 0, office)).toEqual({ load: 125, reps: 6 });
  });

  it('caps a 4+ jump at about 25%', () => {
    let s = start('lower-b');
    const index = indexOf(s, 'leg-press');
    s = logSet(s, index, { load: 40, reps: 11, rir: 4 }, T0);
    // 40 × 1.2 = 48 → 50 is the nearest load, and within 25%.
    expect(prefill(s, index, office).load).toBe(50);
  });
});

// ---------------------------------------------------------------- supersets

describe('supersets', () => {
  function paired(): Session {
    const s = start('upper-b');
    const entries = s.entries.map((e, i) => (i === 3 || i === 4 ? { ...e, superset: 'upper-b-ss1' } : e));
    return { ...s, entries };
  }

  it('goes straight to the partner, then rests after the round', () => {
    let s = jumpTo(paired(), 3, T0);
    s = logSet(s, 3, { load: 50, reps: 12, rir: 2 }, T0);
    expect(s.cursor).toEqual({ entryIndex: 4, setIndex: 0 });
    expect(s.rest).toBeUndefined();
    s = logSet(s, 4, { load: 15, reps: 15, rir: 2 }, T0 + MIN);
    expect(s.cursor).toEqual({ entryIndex: 3, setIndex: 1 });
    expect(s.rest?.startedAt).toBe(T0 + MIN);
  });

  it('finishes the partner’s extra sets before moving on', () => {
    let s = paired();
    s = { ...s, entries: s.entries.map((e, i) => (i === 4 ? { ...e, target: { ...e.target!, sets: 4 } } : e)) };
    s = jumpTo(s, 3, T0);
    for (let round = 0; round < 3; round++) {
      s = logSet(s, 3, { load: 50, reps: 12 }, T0 + round * 3 * MIN);
      s = logSet(s, 4, { load: 15, reps: 15 }, T0 + round * 3 * MIN + MIN);
    }
    expect(s.cursor?.entryIndex).toBe(4);
    s = logSet(s, 4, { load: 15, reps: 15 }, T0 + 20 * MIN);
    expect(s.cursor?.entryIndex).toBe(5);
  });

  it('jumping into the second exercise of a pair still alternates', () => {
    let s = jumpTo(paired(), 4, T0);
    s = logSet(s, 4, { load: 15, reps: 15 }, T0);
    expect(s.cursor?.entryIndex).toBe(3);
    expect(s.rest).toBeUndefined();
  });
});

// ---------------------------------------------------------------- swaps

describe('Station taken? swaps', () => {
  it('replaces an exercise that hasn’t started, keeping the slot', () => {
    const s = start('upper-a');
    const index = indexOf(s, 'db-bench-press');
    const swapped = swapEntry(s, index, 'machine-chest-press', { gym: office, profile, history: empty }, T0);
    expect(swapped.entries).toHaveLength(s.entries.length);
    const entry = swapped.entries[index]!;
    expect(entry).toMatchObject({ exerciseId: 'machine-chest-press', slotId: s.entries[index]!.slotId, swappedFromExerciseId: 'db-bench-press' });
    expect(entry.target).toMatchObject({ sets: 3, reason: 'calibrate', calibrating: true });
    expect(swapped.cursor).toEqual({ entryIndex: index, setIndex: 0 });
  });

  it('mid-exercise: keeps the done sets, moves the rest to the new exercise with a converted weight', () => {
    let s = start('upper-a');
    const index = indexOf(s, 'db-bench-press');
    s = logSet(jumpTo(s, index, T0), index, { load: 35, reps: 10, rir: 2 }, T0);
    const swapped = swapEntry(s, index, 'machine-chest-press', { gym: office, profile, history: empty }, T0 + MIN);
    expect(swapped.entries).toHaveLength(s.entries.length + 1);
    expect(swapped.entries[index]).toMatchObject({ exerciseId: 'db-bench-press' });
    expect(swapped.entries[index]!.target!.sets).toBe(1);
    const fresh = swapped.entries[index + 1]!;
    expect(fresh).toMatchObject({ exerciseId: 'machine-chest-press', slotId: s.entries[index]!.slotId });
    // 35 × 10 with 2 left per hand ≈ 49 max → × 0.9 / 0.4 ≈ 110 on the machine → 9 reps with 3 left, × 0.9 → 70.
    expect(fresh.target).toMatchObject({ sets: 2, load: 70, reason: 'swap', calibrating: true, restSec: s.entries[index]!.target!.restSec });
    expect(swapped.cursor).toEqual({ entryIndex: index + 1, setIndex: 0 });
  });

  it('a swap with its own history uses it', () => {
    const history = buildHistory([past('machine-chest-press', [[100, 10]], 7), past('machine-chest-press', [[110, 9]], 3)]);
    const s = start('upper-a', history);
    const index = indexOf(s, 'db-bench-press');
    const entry = swapEntry(s, index, 'machine-chest-press', { gym: office, profile, history }, T0).entries[index]!;
    expect(entry.target).toMatchObject({ load: 110, reason: 'history' });
    expect(entry.target!.calibrating).toBeUndefined();
  });

  it('“do this one later” moves it to the end and carries on', () => {
    const s = start('lower-b');
    const ids = s.entries.map((e) => e.exerciseId);
    const later = postponeEntry(s, 0, T0);
    expect(later.entries.map((e) => e.exerciseId)).toEqual([...ids.slice(1), ids[0]]);
    expect(later.cursor).toEqual({ entryIndex: 0, setIndex: 0 });
    expect(later.entries[0]!.exerciseId).toBe(ids[1]);
  });

  it('“later” keeps a superset together, and does nothing when it’s the last one left', () => {
    const base = start('upper-b');
    const paired = { ...base, entries: base.entries.map((e, i) => (i === 3 || i === 4 ? { ...e, superset: 'ss1' } : e)) };
    const later = postponeEntry(paired, 4, T0);
    expect(later.entries.slice(-2).map((e) => e.superset)).toEqual(['ss1', 'ss1']);
    expect(later.cursor?.entryIndex).toBe(3);
    let alone = start('lower-b');
    for (let i = 1; i < alone.entries.length; i++) alone = skipEntry(alone, i, T0);
    expect(postponeEntry(alone, 0, T0)).toBe(alone);
  });

  it('a different movement gets that movement’s rep range', () => {
    const s = start('upper-a');
    const index = indexOf(s, 'db-bench-press');
    const entry = swapEntry(s, index, 'push-up', { gym: office, profile, history: empty }, T0).entries[index]!;
    expect(entry.target).toMatchObject({ load: null, reason: 'bodyweight' });
  });

  it('adding an exercise puts it at the end with sensible defaults', () => {
    const s = addEntry(start('upper-a'), 'db-curl', { gym: office, profile, history: empty }, T0);
    const last = s.entries[s.entries.length - 1]!;
    expect(last).toMatchObject({ exerciseId: 'db-curl', role: 'accessory' });
    expect(last.target).toMatchObject({ sets: 3, repsLow: 10, repsHigh: 15 });
    expect(s.cursor?.entryIndex).toBe(s.entries.length - 1);
  });
});

// ---------------------------------------------------------------- finishers and fixing a workout

describe('finishers', () => {
  it('Pillar has no cardio finishers, and old plans’ cardio finishers are skipped', () => {
    expect(program.days.flatMap((d) => d.extras ?? []).every((x) => !['treadmill-incline-walk', 'bike', 'stair-climber'].includes(x.exerciseId))).toBe(true);
    // A plan saved by an older version still holds a cardio finisher next to an abs one.
    const old = { ...day('upper-a'), extras: [{ id: 'bike', exerciseId: 'bike', label: '12 minutes bike intervals' }, ...(day('upper-a').extras ?? [])] };
    const s = createSession({ program, day: old, gym: office, profile, history: empty, now: T0 });
    expect(s.extras?.map((x) => x.id)).toEqual(['upper-a-finisher']);
  });

  it('non-cardio finishers toggle', () => {
    let s = toggleExtraDone(start('upper-a'), 'finisher', T0);
    expect(s.extrasDone).toEqual(['finisher']);
    s = toggleExtraDone(s, 'finisher', T0);
    expect(s.extrasDone).toEqual([]);
  });

  it('cardio logged by an older version can be removed', () => {
    let s: Session = { ...start('upper-a'), cardio: [{ id: 'car-1', exerciseId: 'bike', extraId: 'old', durationSec: 600, at: T0 }], extrasDone: ['old'] };
    expect(hasLoggedWork(s)).toBe(true);
    s = deleteCardio(s, 'car-1', T0 + MIN);
    expect(s.cardio).toEqual([]);
    expect(s.extrasDone).toEqual([]);
    expect(hasLoggedWork(s)).toBe(false);
  });
});

describe('fixing a workout', () => {
  it('removing an exercise takes its sets with it and keeps the cursor valid', () => {
    let s = logPrefilled(start('lower-b'), 2);
    const count = s.entries.length;
    s = jumpTo(s, count - 1, T0);
    s = removeEntry(s, count - 1, T0 + MIN);
    expect(s.entries).toHaveLength(count - 1);
    expect(s.cursor!.entryIndex).toBeLessThan(count - 1);
    s = removeEntry(s, 0, T0 + 2 * MIN);
    expect(s.entries.every((e) => e.sets.length === 0)).toBe(true);
    expect(hasLoggedWork(s)).toBe(false);
  });

  it('a finished workout stays without a cursor', () => {
    const done = finishSession(logPrefilled(start('lower-b'), 2), undefined, T0 + 50 * MIN);
    const fixed = removeEntry(done, 1, T0 + 60 * MIN);
    expect(fixed.cursor).toBeUndefined();
    expect(fixed.status).toBe('completed');
  });
});

// ---------------------------------------------------------------- finishing

describe('finishing and records', () => {
  it('finishing clears the live state and keeps the check-out', () => {
    let s = logPrefilled(start('lower-b'), 3);
    s = logSet(s, 1, { load: 160, reps: 11 }, T0 + 30 * MIN);
    const done = finishSession(s, { feel: 4, energy: 2, pain: [], at: T0 + 55 * MIN }, T0 + 55 * MIN);
    expect(done).toMatchObject({ status: 'completed', endedAt: T0 + 55 * MIN, checkout: { feel: 4 } });
    expect(done.cursor).toBeUndefined();
    expect(done.rest).toBeUndefined();
    expect(summarize(done)).toEqual({ minutes: 55, workSets: 4, exercisesDone: 2, exercisesPlanned: s.entries.length, cardioMinutes: 0 });
  });

  it('a first session is never a record', () => {
    const s = logSet(start('lower-b'), 1, { load: 160, reps: 11 }, T0);
    expect(detectRecords(s, buildHistory([]))).toEqual([]);
  });

  it('finds a better estimated max, using the reps actually done', () => {
    const history = buildHistory([past('leg-press', [[200, 10, 0]], 7)]);
    const s = logSet(start('lower-b', history), 1, { load: 200, reps: 11, rir: 1 }, T0);
    const records = detectRecords(s, history);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ exerciseId: 'leg-press', kind: 'estimated-max' });
  });

  it('counts a heavier weight even when the estimated max is lower', () => {
    const history = buildHistory([past('leg-press', [[200, 12]], 7)]);
    const s = logSet(start('lower-b', history), 1, { load: 210, reps: 6 }, T0);
    expect(detectRecords(s, history)).toMatchObject([{ kind: 'heaviest', value: 210, previous: 200 }]);
  });

  it('matching last time isn’t a record, and reps left can’t inflate one', () => {
    const history = buildHistory([past('leg-press', [[200, 10]], 7)]);
    const s = logSet(start('lower-b', history), 1, { load: 200, reps: 10, rir: 4 }, T0);
    expect(detectRecords(s, history)).toEqual([]);
  });
});

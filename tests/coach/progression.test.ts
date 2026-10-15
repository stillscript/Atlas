import { describe, expect, it } from 'vitest';
import { exerciseRec, planExercise, prepare } from '../../src/coach/engine';
import { exposuresByExercise, inferredRir } from '../../src/coach/measures';
import { planNextExposure } from '../../src/coach/progression';
import type { Session } from '../../src/db/types';
import { T0, daysAgo, input, legs, makeProgram, office, press, profile, pull, lateral, repeat, slot, workout } from './helpers';

const legSlot = slot('a-legs', 'leg-press', 'secondary', 3, 10, 12);
const pressSlot = slot('a-press', 'smith-incline-press', 'main', 3, 8, 10);
const latSlot = slot('a-lat', 'db-lateral-raise', 'accessory', 3, 12, 15, 1, 60);

function plan(sessions: Session[], exerciseId: string, target = legSlot, overrides: Parameters<typeof input>[1] = {}) {
  const p = prepare(input(sessions, overrides), T0);
  return planExercise(p, exerciseId, target);
}

describe('measures', () => {
  it('infers a missing rating: target hit ≈ target, short of the range = 0', () => {
    expect(inferredRir({ reps: 12 }, 10, 12, 2)).toBe(2);
    expect(inferredRir({ reps: 8 }, 10, 12, 2)).toBe(0);
    expect(inferredRir({ reps: 8, rir: 3 }, 10, 12, 2)).toBe(3);
  });

  it('turns sessions into exposures with an estimated max', () => {
    const map = exposuresByExercise([workout(7, [legs([[200, 12, 2], [200, 11, 1]])])]);
    const e = map.get('leg-press')![0]!;
    expect(e.top).toBe(200);
    expect(Math.round(e.e1rm)).toBe(Math.round(200 * (1 + 14 / 30)));
    expect(Math.round(e.e1rmDone)).toBe(Math.round(200 * (1 + 12 / 30)));
    expect(e.rated).toBe(2);
  });
});

describe('A2 · double progression', () => {
  it('owned the top of the range → next load, bottom of the range', () => {
    const result = plan(repeat([14, 7], legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]])), 'leg-press');
    expect(result).toMatchObject({ rule: 'A2', variant: 'up', from: 200, load: 210, actionable: true });
  });

  it('in the range → same weight, beat the lowest set by one', () => {
    const result = plan(repeat([14, 7], legs([[200, 12, 2], [200, 11, 2], [200, 10, 2]])), 'leg-press');
    expect(result).toMatchObject({ rule: 'A2', variant: 'beat', load: 200, beat: 11, actionable: false });
  });

  it('hit the top but harder than planned → hold once, then move up', () => {
    const once = plan([workout(7, [legs([[190, 12, 2], [190, 12, 2], [190, 12, 2]])]), workout(3, [legs([[200, 12, 0], [200, 12, 0], [200, 12, 1]])])], 'leg-press');
    expect(once).toMatchObject({ rule: 'A2', variant: 'hold-hard', load: 200 });
    const twice = plan(repeat([10, 3], legs([[200, 12, 0], [200, 12, 0], [200, 12, 1]])), 'leg-press');
    expect(twice).toMatchObject({ rule: 'A2', variant: 'up', load: 210 });
  });

  it('bodyweight work progresses reps', () => {
    const result = plan(repeat([7], { ex: 'pull-up', range: [6, 10], sets: [[null, 8, 2], [null, 7, 1]] }), 'pull-up', slot('x', 'pull-up', 'main', 3, 6, 10));
    expect(result).toMatchObject({ variant: 'bw-beat', load: null, beat: 8 });
  });
});

describe('A3 · too easy', () => {
  it('top of the range with 4+ left on every set → skips a step', () => {
    const result = plan(repeat([14, 7], legs([[200, 12, 4], [200, 12, 4], [200, 12, 4]])), 'leg-press');
    expect(result).toMatchObject({ rule: 'A3', variant: 'skip', load: 220 });
  });

  it('caps the jump at 10% for beginners', () => {
    const easy = (load: number) => legs([[load, 12, 4], [load, 12, 4], [load, 12, 4]]);
    const beginner = { profile: profile({ experience: 'beginner' as const }) };
    const result = planExercise(prepare(input(repeat([21, 14, 7], easy(200)), beginner), T0), 'leg-press', legSlot)!;
    expect(result).toMatchObject({ rule: 'A3', load: 220 });
    // At 100 lb, 10% is a single step: that's a normal move up, not a skip.
    const light = planExercise(prepare(input(repeat([21, 14, 7], easy(100)), beginner), T0), 'leg-press', legSlot)!;
    expect(light).toMatchObject({ rule: 'A2', load: 110 });
  });

  it('stopped mid-range with 4+ left → same weight, push to the top', () => {
    const result = plan(repeat([7], legs([[200, 10, 4], [200, 10, 4], [200, 10, 4]])), 'leg-press');
    expect(result).toMatchObject({ rule: 'A3', variant: 'push', load: 200, beat: 12 });
  });
});

describe('A4 · missed reps', () => {
  const missed = legs([[200, 8, 0], [200, 7, 0], [200, 7, 0]]);

  it('small miss (only the last set short) → keep the load and target', () => {
    const result = plan(repeat([14, 7], legs([[200, 10, 1], [200, 10, 1], [200, 9, 0]])), 'leg-press');
    expect(result).toMatchObject({ rule: 'A4', variant: 'small', load: 200 });
  });

  it('clear miss, muscle goal → lighter to land in range, same target', () => {
    const result = plan([...repeat([21, 14, 10], legs([[190, 12, 2], [190, 12, 2], [190, 11, 1]])), workout(3, [missed])], 'leg-press')!;
    expect(result).toMatchObject({ rule: 'A4', variant: 'lower', repsLow: 10, repsHigh: 12 });
    expect(result.load!).toBeLessThan(200);
    expect(result.load!).toBeGreaterThanOrEqual(170);
  });

  it('early reads prefer hold over cut', () => {
    const result = plan([workout(3, [missed])], 'leg-press');
    expect(result).toMatchObject({ rule: 'A4', variant: 'small', load: 200 });
  });

  it('strength goal, key lift → keep the load, drop the rep target a notch for two sessions', () => {
    const target = slot('a-press', 'smith-incline-press', 'main', 3, 6, 8);
    const sessions = [...repeat([21, 14], press([[125, 8, 2], [125, 7, 2], [125, 7, 1]], { range: [6, 8] })), workout(7, [press([[135, 5, 0], [135, 4, 0], [135, 4, 0]], { range: [6, 8] })])];
    const p = prepare(input(sessions, { profile: profile({ goal: 'strength' }) }), T0);
    const first = planExercise(p, 'smith-incline-press', target)!;
    expect(first).toMatchObject({ rule: 'A4', variant: 'strength', load: 135, repsLow: 4, repsHigh: 6 });
    // The next session runs at 4–6 and lands in it: once more at 4–6, then back to 6–8.
    const again = [...sessions, workout(3, [press([[135, 6, 2], [135, 5, 1], [135, 5, 1]], { range: [4, 6] })])];
    const second = planExercise(prepare(input(again, { profile: profile({ goal: 'strength' }) }), T0), 'smith-incline-press', target)!;
    expect(second).toMatchObject({ rule: 'A4', variant: 'strength-again', repsLow: 4, repsHigh: 6 });
  });

  it('second miss in a row → lower regardless of goal', () => {
    const result = plan([...repeat([21, 14], legs([[200, 12, 2], [200, 12, 2], [200, 11, 1]])), workout(7, [missed]), workout(3, [missed])], 'leg-press');
    expect(result).toMatchObject({ rule: 'A4', variant: 'second' });
  });

  it('a whole bad day (≥40% of lifts missed) is fatigue, not the weights', () => {
    const bad = workout(3, [missed, press([[135, 6, 0], [135, 5, 0], [135, 5, 0]]), pull([[100, 12, 2], [100, 12, 2], [100, 11, 2]])]);
    const result = plan([...repeat([21, 14, 10], legs([[200, 12, 2], [200, 12, 2], [200, 11, 1]])), bad], 'leg-press');
    expect(result).toMatchObject({ rule: 'A4', variant: 'fatigue-day', load: 200 });
  });
});

describe('A5 · big equipment jumps', () => {
  it('the Smith goes 135 → 175: stretch reps to the top + 4 first', () => {
    const result = plan(repeat([14, 7], press([[135, 10, 2], [135, 10, 2], [135, 10, 2]])), 'smith-incline-press', pressSlot);
    expect(result).toMatchObject({ rule: 'A5', variant: 'stretch', load: 135, beat: 12 });
    expect(result?.facts.next).toBe(175);
  });

  it('then jumps once the stretched reps are there', () => {
    const result = plan(repeat([14, 7], press([[135, 14, 2], [135, 14, 2], [135, 14, 2]])), 'smith-incline-press', pressSlot);
    expect(result).toMatchObject({ rule: 'A5', variant: 'jump', load: 175 });
  });

  it('dumbbell laterals: 25 → 30 is +20%, so reps first', () => {
    const result = plan(repeat([7], lateral([[25, 15, 1], [25, 15, 1], [25, 15, 1]])), 'db-lateral-raise', latSlot);
    expect(result).toMatchObject({ rule: 'A5', variant: 'stretch', load: 25 });
  });
});

describe('A1 · calibration finished', () => {
  it('first exposure in range → "found it" with the weight to beat', () => {
    const result = plan([workout(3, [legs([[160, 11, 4], [190, 11, 2], [190, 11, 2]], { calibrating: true, rir: 3 })])], 'leg-press');
    expect(result).toMatchObject({ rule: 'A1', variant: 'found', load: 190 });
    expect(result?.facts.found).toBe(190);
  });
});

describe('holds and safety', () => {
  it('one fatigue signal holds weights: an "up" becomes a hold', () => {
    const sessions = repeat([14, 7], legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]]));
    const p = { ...prepare(input(sessions), T0), hold: true };
    expect(planExercise(p, 'leg-press', legSlot)).toMatchObject({ variant: 'held-fatigue', load: 200 });
  });

  it('J1: pain on the last exposure → lighter and a swap that loads the area differently', () => {
    const sessions = [workout(10, [press([[135, 9, 2], [135, 9, 2], [135, 8, 2]])]), workout(3, [press([[135, 9, 2], [135, 8, 1]], { pain: [1] })])];
    const result = plan(sessions, 'smith-incline-press', pressSlot)!;
    expect(result).toMatchObject({ rule: 'J1', safety: true, actionable: true });
    expect(result.load).toBeLessThan(135);
    expect(result.rir).toBeGreaterThanOrEqual(3);
    const rec = exerciseRec(result);
    expect(rec.actions).toContain(result.swapTo ? 'swap' : 'dismiss');
  });

  it('J2: the same area hurt in two sessions → no increases on lifts that load it', () => {
    const sore = { feel: 3 as const, energy: 2 as const, pain: [{ area: 'shoulder' }] };
    const sessions = [
      workout(12, [legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]])], { checkout: sore }),
      workout(5, [press([[135, 14, 2], [135, 14, 2], [135, 14, 2]])], { checkout: sore }),
    ];
    const p = prepare(input(sessions), T0);
    expect(p.painAreas).toEqual(['shoulder']);
    expect(planExercise(p, 'smith-incline-press', pressSlot)).toMatchObject({ variant: 'held-pain-area', load: 135 });
  });

  it('a new rep range resets the weight from the estimated max', () => {
    const sessions = repeat([14, 7], legs([[200, 11, 2], [200, 11, 2], [200, 10, 2]]));
    const result = plan(sessions, 'leg-press', slot('a-legs', 'leg-press', 'secondary', 3, 15, 20));
    expect(result).toMatchObject({ rule: 'D', variant: 'range-reset' });
    expect(result!.load!).toBeLessThan(200);
  });

  it('progresses from normal sessions, not lighter-week ones', () => {
    const sessions = [...repeat([21, 14], legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]])), workout(3, [legs([[180, 12, 4], [180, 12, 4]])], { variant: 'lighter-week' })];
    expect(plan(sessions, 'leg-press')).toMatchObject({ from: 200, load: 210 });
  });

  it('nothing to say about a lift never trained', () => {
    expect(planNextExposure('leg-press', legSlot, [], { gym: office, goal: 'muscle', experience: 'intermediate', now: T0 })).toBeNull();
  });

  it('the recommendation id is stable for the same situation and changes after the next session', () => {
    const sessions = repeat([14, 7], legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]]));
    const a = exerciseRec(plan(sessions, 'leg-press')!);
    const b = exerciseRec(plan(sessions, 'leg-press')!);
    expect(a.id).toBe(b.id);
    const later = exerciseRec(plan([...sessions, workout(1, [legs([[210, 10, 2], [210, 10, 2], [210, 10, 2]])])], 'leg-press')!);
    expect(later.id).not.toBe(a.id);
    expect(daysAgo(0)).toBe(T0);
    expect(makeProgram().days).toHaveLength(2);
  });
});

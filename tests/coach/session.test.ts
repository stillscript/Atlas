import { describe, expect, it } from 'vitest';
import { coachInSession, coachToday, planSession, prepare } from '../../src/coach/engine';
import { returnState } from '../../src/coach/measures';
import { readinessOffer, wearableLow } from '../../src/coach/readiness';
import { restAdvice } from '../../src/coach/inSession';
import type { Session } from '../../src/db/types';
import { buildHistory, createSession, logSet, prefill, useCoachOffer, useNextSets } from '../../src/domain/workout';
import { DAY, T0, daysAgo, decided, input, legs, makeProgram, office, press, profile, pull, repeat, workout } from './helpers';

const dayA = makeProgram().days[0]!;
const steadyA = (ago: number) =>
  workout(ago, [press([[135, 9, 2], [135, 9, 2], [135, 8, 2]]), legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]]), pull([[100, 11, 2], [100, 11, 2], [100, 10, 2]])], { dayId: 'a' });

describe('lighter week (F3/F4)', () => {
  it('fewer sets, about 10% lighter, stopping 3+ short, no progression offers', () => {
    // Block started 2026-08-31: weeks 1–6 normal, week 7 (Oct 12–18) is the lighter week.
    const program = makeProgram({ block: { startDate: '2026-08-31', lengthWeeks: 6 } });
    const p = prepare(input([steadyA(9), steadyA(5)], { program }), T0);
    const { plan, recommendations } = planSession(p, dayA);
    expect(plan.lighterWeek).toBe(true);
    const legsPlan = plan.slots['a-legs']!;
    expect(legsPlan.auto).toMatchObject({ sets: 2, load: 180, rir: 3, reason: 'lighter-week' });
    expect(legsPlan.offer).toBeUndefined();
    expect(recommendations).toHaveLength(0);
  });
});

describe('coming back after a break (G3)', () => {
  const history = [steadyA(60), steadyA(57), steadyA(53)];

  it('8–13 days: as planned, no increases', () => {
    const state = returnState([steadyA(20), steadyA(10)], T0);
    expect(state).toMatchObject({ tier: 1, noIncrease: true, setsDrop: 0, loadFactor: 1 });
  });

  it('14–27 days: ~90%, one set fewer, 3 short; then ~95%; then normal', () => {
    const first = prepare(input([steadyA(40), steadyA(37), steadyA(20)]), T0);
    expect(first.ret).toMatchObject({ tier: 2, sessionsSince: 0, loadFactor: 0.9, setsDrop: 1, rir: 3 });
    const legsPlan = planSession(first, dayA).plan.slots['a-legs']!;
    expect(legsPlan.auto).toMatchObject({ load: 180, sets: 2, rir: 3, reason: 'return' });

    const back = [steadyA(40), steadyA(37), steadyA(20), workout(1, [legs([[180, 12, 3], [180, 12, 3]])], { variant: 'return' })];
    expect(returnState(back, T0)).toMatchObject({ tier: 2, sessionsSince: 1, loadFactor: 0.95 });
    const done = [...back, workout(0.5, [legs([[190, 12, 2], [190, 12, 2]])], { variant: 'return' })];
    expect(returnState(done, T0).tier).toBe(0);
  });

  it('28–55 days: ~80%, ramping 5% a session', () => {
    expect(returnState(history, daysAgo(53 - 30))).toMatchObject({ tier: 3, loadFactor: 0.8 });
  });

  it('56+ days: recalibrate from about 70% of the old numbers', () => {
    const p = prepare(input([steadyA(70), steadyA(66), steadyA(62)]), T0);
    expect(p.ret).toMatchObject({ tier: 4, recalibrate: true, loadFactor: 0.7 });
    expect(planSession(p, dayA).plan.slots['a-legs']!.auto).toMatchObject({ load: 140, calibrate: true });
  });

  it('Today says welcome back', () => {
    const today = coachToday(input([steadyA(40), steadyA(37), steadyA(30)]), T0, dayA);
    expect(today.recommendations[0]).toMatchObject({ rule: 'G3', variant: 'tier3-first' });
  });
});

describe('readiness (C1/C2)', () => {
  const check = (sleep: 1 | 2 | 3, energy: 1 | 2 | 3, soreness: 1 | 2 | 3, wearable?: number) => ({ sleep, energy, soreness, wearable, at: T0 });

  it('two poor answers → lighter day; all three → short version; otherwise nothing', () => {
    expect(readinessOffer(check(1, 1, 3), [], 'Day A')).toMatchObject({ variant: 'lighter', recommendation: { rule: 'C1' } });
    expect(readinessOffer(check(1, 1, 1), [], 'Day A')).toMatchObject({ variant: 'short', recommendation: { rule: 'C2' } });
    expect(readinessOffer(check(1, 2, 3), [], 'Day A')).toBeNull();
  });

  it('a wearable score only counts against your own baseline, after 10 entries', () => {
    const past = Array.from({ length: 12 }, (_, i) => workout(30 - i, [], { readiness: { sleep: 3, energy: 3, soreness: 3, wearable: 70 + i } }));
    expect(wearableLow(55, past.slice(0, 5))).toBe(false);
    expect(wearableLow(55, past)).toBe(true);
    expect(wearableLow(80, past)).toBe(false);
    expect(readinessOffer(check(2, 2, 3, 55), past, 'Day A')).toMatchObject({ variant: 'lighter', recommendation: { rule: 'C1', variant: 'wearable' } });
  });

  it('a lighter day: one set fewer, no weight increases', () => {
    const p = prepare(input(repeat([14, 7], legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]]))), T0);
    const { plan } = planSession(p, dayA, { variant: 'lighter' });
    expect(plan.slots['a-legs']).toMatchObject({ auto: { sets: 2, reason: 'readiness' } });
    expect(plan.slots['a-legs']!.offer).toBeUndefined();
  });

  it('a short version keeps the key lifts and fits the time', () => {
    const p = prepare(input([steadyA(7)]), T0);
    const { plan } = planSession(p, dayA, { variant: 'short' });
    expect(plan.day?.slots.map((s) => s.role)).not.toContain('accessory');
  });
});

describe('today’s plan into the workout', () => {
  const history = repeat([14, 7], legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]]));

  it('an undecided suggestion rides along as an offer; Use applies it', () => {
    const p = prepare(input(history), T0);
    const { plan } = planSession(p, dayA);
    const session = createSession({ program: makeProgram(), day: dayA, gym: office, profile: profile(), history: buildHistory(history), now: T0, plan });
    const index = session.entries.findIndex((e) => e.exerciseId === 'leg-press');
    expect(session.entries[index]!.coachOffer).toMatchObject({ load: 210, repsLow: 10, repsHigh: 12 });
    expect(session.entries[index]!.target?.load).toBe(200);
    const used = useCoachOffer(session, index, T0);
    expect(used.entries[index]!.target).toMatchObject({ load: 210, reason: 'coach' });
    expect(prefill(used, index, office).load).toBe(210);
  });

  it('an applied suggestion is built in; a dismissed one is left out', () => {
    const p0 = prepare(input(history), T0);
    const rec = planSession(p0, dayA).plan.slots['a-legs']!.offer!;
    for (const [decision, load, offer] of [
      ['applied', 210, false],
      ['dismissed', 200, false],
    ] as const) {
      const p = prepare(input(history, { log: [decided(rec.recommendationId, 'A2', decision)] }), T0);
      const { plan } = planSession(p, dayA);
      const session = createSession({ program: makeProgram(), day: dayA, gym: office, profile: profile(), history: buildHistory(history), now: T0, plan });
      const entry = session.entries.find((e) => e.exerciseId === 'leg-press')!;
      expect(entry.target?.load).toBe(load);
      expect(Boolean(entry.coachOffer)).toBe(offer);
    }
  });

  it('a lighter week builds the session lighter and marks it', () => {
    const program = makeProgram({ block: { startDate: '2026-08-31', lengthWeeks: 6 } });
    const p = prepare(input(history, { program }), T0);
    const session = createSession({ program, day: dayA, gym: office, profile: profile(), history: buildHistory(history), now: T0, plan: planSession(p, dayA).plan });
    expect(session.variant).toBe('lighter-week');
    expect(session.entries.find((e) => e.exerciseId === 'leg-press')!.target).toMatchObject({ sets: 2, load: 180, reason: 'lighter-week' });
  });
});

describe('in-session offers (B1–B3)', () => {
  const history = repeat([21, 14, 7], legs([[200, 12, 2], [200, 12, 2], [200, 11, 2]]));

  function active(sets: [number, number, (0 | 1 | 2 | 3 | 4)?][]): Session {
    const p = prepare(input(history), T0);
    let s = createSession({ program: makeProgram(), day: dayA, gym: office, profile: profile(), history: buildHistory(history), now: T0, plan: planSession(p, dayA).plan });
    const i = s.entries.findIndex((e) => e.exerciseId === 'leg-press');
    sets.forEach(([load, reps, rir], k) => (s = logSet(s, i, { load, reps, rir }, T0 + k * 180_000)));
    return s;
  }

  it('B1: much harder than expected → offer a lighter weight for the remaining sets', () => {
    const s = active([[200, 7, 0]]);
    const i = s.entries.findIndex((e) => e.exerciseId === 'leg-press');
    const { offer } = coachInSession(input(history), s, i, T0);
    expect(offer).toMatchObject({ rule: 'B1', change: { kind: 'next-sets', sets: 2 } });
    const change = offer!.change as { load: number; reps: number };
    expect(change.load).toBeLessThan(200);
    // Use → the next set is pre-filled with it, and the exercise isn't prompted again.
    const used = useNextSets(s, i, { load: change.load, reps: change.reps }, offer!.id, T0);
    expect(prefill(used, i, office).load).toBe(change.load);
    expect(coachInSession(input(history), used, i, T0).offer).toBeNull();
  });

  it('B1 on big plate gaps: the next weight down that still lands in range, not a huge drop', () => {
    const smith = repeat([21, 14, 7], press([[125, 10, 2], [125, 10, 2], [125, 10, 2]]));
    const p = prepare(input(smith), T0);
    let s = createSession({ program: makeProgram(), day: dayA, gym: office, profile: profile(), history: buildHistory(smith), now: T0, plan: planSession(p, dayA).plan });
    const i = s.entries.findIndex((e) => e.exerciseId === 'smith-incline-press');
    s = logSet(s, i, { load: 135, reps: 5, rir: 0 }, T0);
    const { offer } = coachInSession(input(smith), s, i, T0);
    // 135 × 5 to failure ≈ 158 max: 125 still gets about 6 reps; 85 would be far too light.
    expect(offer?.change).toMatchObject({ kind: 'next-sets', load: 125 });
  });

  it('B2: top of the range with plenty left on set 1 → one step up (beginners: +2 reps)', () => {
    const s = active([[200, 12, 4]]);
    const i = s.entries.findIndex((e) => e.exerciseId === 'leg-press');
    expect(coachInSession(input(history), s, i, T0).offer).toMatchObject({ rule: 'B2', variant: 'up', change: { load: 210 } });
    const beginner = input(history, { profile: profile({ experience: 'beginner' }) });
    expect(coachInSession(beginner, s, i, T0).offer).toMatchObject({ rule: 'B2', variant: 'reps', change: { load: 200, reps: 14 } });
  });

  it('B4: normal fatigue (a rep per set) never prompts', () => {
    const s = active([[200, 12, 2], [200, 11, 1]]);
    const i = s.entries.findIndex((e) => e.exerciseId === 'leg-press');
    expect(coachInSession(input(history), s, i, T0).offer).toBeNull();
  });

  it('B3: reps fell more than fatigue explains after a short rest → take the full rest', () => {
    let s = active([[200, 12, 2]]);
    const i = s.entries.findIndex((e) => e.exerciseId === 'leg-press');
    s = logSet(s, i, { load: 200, reps: 8, rir: 1 }, T0 + 60_000);
    expect(restAdvice(s, i)).toMatchObject({ seconds: 120, dropped: 4 });
    expect(DAY).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { applyToProgram } from '../../src/coach/apply';
import { coachReview, coachToday, coachWeekly, prepare } from '../../src/coach/engine';
import { blockPosition } from '../../src/domain/schedule';
import { exposuresByExercise, fatigueSignals, streakWeeks } from '../../src/coach/measures';
import { isPlateau, programRecommendations } from '../../src/coach/program';
import { comebackWins, sessionRecords, trendWins } from '../../src/coach/wins';
import type { Session } from '../../src/db/types';
import { T0, daysAgo, decided, input, legs, makeProgram, press, profile, pull, repeat, shown, slot, weights, workout } from './helpers';

function programRecs(sessions: Session[], overrides: Parameters<typeof input>[1] = {}) {
  const p = prepare(input(sessions, overrides), T0);
  return programRecommendations({
    profile: p.input.profile,
    program: p.input.program,
    gym: p.input.gym,
    sessions: p.input.sessions,
    exposures: p.exposures,
    measurements: p.input.measurements,
    log: p.input.log,
    fatigue: p.fatigue,
    now: T0,
  });
}

// Leg press stuck at 200 × 12, 11, 11 for weeks (estimated max not moving).
const stuck = (agos: number[]) => repeat(agos, legs([[200, 12, 2], [200, 11, 2], [200, 11, 2]]));

describe('D · plateaus', () => {
  it('detects 3 exposures with no new best and no rep or load gain', () => {
    const map = exposuresByExercise(stuck([28, 21, 14, 7]));
    expect(isPlateau(map.get('leg-press')!, T0)).toBe(true);
    const growing = exposuresByExercise([...stuck([28, 21]), workout(14, [legs([[200, 12, 2], [200, 12, 2], [200, 11, 2]])]), workout(7, [legs([[210, 12, 2], [210, 11, 2], [210, 11, 2]])])]);
    expect(isPlateau(growing.get('leg-press')!, T0)).toBe(false);
  });

  it('a lift sitting at the top of its range is ready to move up, not stuck', () => {
    const easy = exposuresByExercise(repeat([28, 21, 14, 7], legs([[200, 12, 4], [200, 12, 4], [200, 12, 4]])));
    expect(isPlateau(easy.get('leg-press')!, T0)).toBe(false);
  });

  it('changes at most two stalled lifts at once, key lifts first', () => {
    const stall = (agos: number[]) =>
      agos.map((ago) =>
        workout(ago, [
          press([[135, 9, 2], [135, 9, 2], [135, 8, 2]]),
          pull([[100, 11, 2], [100, 11, 2], [100, 10, 2]]),
          legs([[200, 11, 2], [200, 11, 2], [200, 10, 2]]),
          { ex: 'db-lateral-raise', slot: 'a-lat', role: 'accessory', range: [12, 15], rir: 1, sets: [[15, 13, 1], [15, 13, 1], [15, 12, 1]] },
        ]),
      );
    const plateaus = programRecs(stall([28, 21, 14, 7])).filter((r) => r.rule === 'D');
    expect(plateaus).toHaveLength(2);
    expect(plateaus.map((r) => r.subject.exerciseId)).toEqual(['smith-incline-press', 'leg-press']);
  });

  it('beginners first get a technique cue', () => {
    const recs = programRecs(stuck([28, 21, 14, 7]), { profile: profile({ experience: 'beginner' }) });
    expect(recs.find((r) => r.rule === 'D')).toMatchObject({ variant: 'technique', type: 'technique' });
  });

  it('fewer than 6 exposures in the range → a planned swap to a close variation', () => {
    const stuckPull = repeat([28, 21, 14, 7], pull([[100, 12, 2], [100, 11, 2], [100, 11, 2]]));
    const rec = programRecs(stuckPull).find((r) => r.rule === 'D')!;
    expect(rec).toMatchObject({ variant: 'swap', change: { kind: 'slot', slotId: 'a-pull' } });
    expect((rec.change as { swapTo?: string }).swapTo).toBeTruthy();
  });

  it('no close variation in this gym → a set more or less, by the muscle’s weekly band', () => {
    // The Office has only one leg press, and quads sit below their band in this plan.
    expect(programRecs(stuck([28, 21, 14, 7])).find((r) => r.rule === 'D')).toMatchObject({ variant: 'sets-up' });
  });

  it('6+ exposures in the same range → change the rep range for a block', () => {
    const rec = programRecs(stuck([49, 42, 35, 28, 21, 14, 7])).find((r) => r.rule === 'D')!;
    expect(rec).toMatchObject({ variant: 'range', change: { kind: 'slot', reps: { fromLow: 10, fromHigh: 12, toLow: 6, toHigh: 10 } } });
  });

  it('with fatigue signals, a lighter week comes first', () => {
    const rough = { feel: 1 as const, energy: 1 as const, pain: [] };
    const sessions = [
      ...stuck([28, 21, 14]),
      workout(7, [legs([[200, 12, 2], [200, 11, 2], [200, 11, 2]])], { checkout: rough }),
      workout(5, [pull([[100, 12, 2]]), press([[135, 9, 2]])], { checkout: rough }),
    ];
    expect(programRecs(sessions).find((r) => r.rule === 'D')).toMatchObject({ variant: 'lighter', change: { kind: 'lighter-week', action: 'now' } });
  });
});

describe('E · weekly volume and balance', () => {
  it('a muscle below its band on a plan older than 2 weeks → add a set (within the 20% ramp)', () => {
    const rec = programRecs([]).find((r) => r.rule === 'E1' && r.subject.muscle === 'chest');
    expect(rec).toMatchObject({ variant: 'below', change: { kind: 'slot', slotId: 'a-press', sets: { from: 3, to: 4 } } });
  });

  it('one volume change per muscle per week (ramp limit)', () => {
    const first = programRecs([]).find((r) => r.rule === 'E1' && r.subject.muscle === 'chest')!;
    const log = [{ ...decided(first.id, 'E1', 'applied', T0 - 86_400_000), key: first.key }];
    expect(programRecs([], { log }).find((r) => r.rule === 'E1' && r.subject.muscle === 'chest')).toBeUndefined();
    const weekLater = [{ ...log[0]!, at: T0 - 8 * 86_400_000 }];
    expect(programRecs([], { log: weekLater }).find((r) => r.rule === 'E1' && r.subject.muscle === 'chest')).toBeDefined();
  });

  it('a brand-new plan gets no volume advice yet', () => {
    expect(programRecs([], { program: makeProgram({ createdAt: T0 - 3 * 86_400_000 }) }).filter((r) => r.rule === 'E1')).toEqual([]);
  });

  it('pushing well beyond pulling → one more pulling set, low priority', () => {
    const program = makeProgram({
      days: [
        {
          id: 'a',
          name: 'Day A',
          slots: [
            slot('p1', 'smith-incline-press', 'main', 4, 8, 10),
            slot('p2', 'machine-chest-press', 'secondary', 4, 8, 12),
            slot('p3', 'machine-shoulder-press', 'secondary', 4, 8, 12),
            slot('r1', 'seated-row-machine', 'secondary', 3, 10, 12),
          ],
        },
      ],
      schedule: ['a', null, null, null, 'a', null, null],
    });
    const rec = programRecs([], { program }).find((r) => r.rule === 'E3');
    expect(rec).toMatchObject({ priority: 8, confidence: 'low', change: { slotId: 'r1', sets: { from: 3, to: 4 } } });
  });
});

describe('F · fatigue and lighter weeks', () => {
  const rough = { feel: 1 as const, energy: 2 as const, pain: [] };

  it('effort creep: 3 lifts feeling harder at the same weights', () => {
    const before = workout(10, [press([[135, 9, 3], [135, 9, 3]]), legs([[200, 12, 3], [200, 12, 3]]), pull([[100, 11, 3], [100, 11, 3]])]);
    const after = workout(3, [press([[135, 9, 1], [135, 9, 1]]), legs([[200, 12, 1], [200, 12, 1]]), pull([[100, 11, 1], [100, 11, 1]])]);
    const signals = fatigueSignals([workout(30, [legs([[180, 12, 2]])]), before, after], exposuresByExercise([before, after]), T0, true);
    expect(signals.effortCreep).toHaveLength(3);
    expect(signals.count).toBe(1);
  });

  it('check-outs: rough or low energy on 2 of the last 3', () => {
    const sessions = [workout(25, [legs([[200, 12, 2]])]), workout(6, [legs([[200, 12, 2]])], { checkout: rough }), workout(3, [legs([[200, 12, 2]])], { checkout: rough })];
    expect(fatigueSignals(sessions, exposuresByExercise(sessions), T0, true).checkoutLow).toBe(true);
  });

  it('readiness only counts when the check-in is on', () => {
    const low = { sleep: 1 as const, energy: 1 as const, soreness: 2 as const };
    const sessions = [9, 7, 5, 3].map((ago) => workout(ago, [legs([[200, 12, 2]])], { readiness: low }));
    expect(fatigueSignals(sessions, exposuresByExercise(sessions), T0, true).readinessLow).toBe(true);
    expect(fatigueSignals(sessions, exposuresByExercise(sessions), T0, false).readinessLow).toBe(false);
  });

  it('two signals and 3+ weeks into the block → take the lighter week now', () => {
    const sore = { feel: 1 as const, energy: 1 as const, pain: [{ area: 'knee', exerciseId: 'leg-press' }, { area: 'shoulder', exerciseId: 'smith-incline-press' }] };
    const sessions = [
      workout(30, [legs([[180, 12, 2]]), pull([[90, 12, 2]])]),
      workout(6, [legs([[200, 12, 2]]), press([[135, 9, 2]])], { checkout: sore }),
      workout(3, [legs([[200, 12, 2]])], { checkout: sore }),
    ];
    const recs = programRecs(sessions);
    expect(recs.find((r) => r.rule === 'F2')).toMatchObject({ variant: 'early', change: { kind: 'lighter-week', action: 'now' } });
  });

  it('whole-program calls wait for 2+ weeks of data across 3+ lifts', () => {
    const sore = { feel: 1 as const, energy: 1 as const, pain: [{ area: 'knee', exerciseId: 'leg-press' }] };
    const sessions = [workout(30, [legs([[180, 12, 2]])]), workout(6, [legs([[200, 12, 2]])], { checkout: sore }), workout(3, [legs([[200, 12, 2]])], { checkout: sore })];
    expect(programRecs(sessions).find((r) => r.rule === 'F2')).toBeUndefined();
  });

  it('one signal → hold weights this week', () => {
    const sessions = [
      workout(30, [legs([[180, 12, 2]]), pull([[90, 12, 2]]), press([[125, 9, 2]])]),
      workout(6, [legs([[200, 12, 2]])], { checkout: rough }),
      workout(3, [legs([[200, 12, 2]])], { checkout: rough }),
    ];
    expect(programRecs(sessions).find((r) => r.rule === 'F2')).toMatchObject({ variant: 'hold' });
    expect(prepare(input(sessions), T0).hold).toBe(true);
  });

  it('the scheduled lighter week can be pushed back once', () => {
    const program = makeProgram({ block: { startDate: '2026-08-31', lengthWeeks: 6 } });
    expect(programRecs([], { program }).find((r) => r.rule === 'F2')).toMatchObject({ variant: 'scheduled', change: { kind: 'lighter-week', action: 'postpone' } });
    const pushed = makeProgram({ block: { startDate: '2026-08-31', lengthWeeks: 6, postponedWeeks: 1 } });
    expect(programRecs([], { program: pushed }).find((r) => r.rule === 'F2')).toMatchObject({ actions: [] });
  });
});

describe('G · schedule', () => {
  it('a missed session this week is offered for today', () => {
    // Monday's Day A wasn't done; today (Wednesday) is Day B.
    const today = coachToday(input([workout(9, [legs([[200, 12, 2]])], { dayId: 'a' })]), T0);
    expect(today.recommendations.find((r) => r.rule === 'G1')).toMatchObject({ variant: 'busy-day', change: { kind: 'do-missed', dayId: 'a' } });
    const done = coachToday(input([workout(2, [legs([[200, 12, 2]])], { dayId: 'a' })]), T0);
    expect(done.recommendations.find((r) => r.rule === 'G1')).toBeUndefined();
  });

  it('streaks count weeks with every planned session', () => {
    const program = makeProgram();
    // Three full weeks (Mon/Wed/Fri) before this one, plus Monday of this week.
    const sessions = [23, 21, 19, 16, 14, 12, 9, 7, 5, 2].map((ago) => workout(ago, [legs([[200, 12, 2]])]));
    expect(streakWeeks(program, sessions, T0, false)).toBe(3);
    expect(streakWeeks(program, sessions.filter((_, i) => i !== 4), T0, false)).toBe(1);
  });
});

describe('H3 · fat loss', () => {
  const fatLoss = { profile: profile({ goal: 'fat-loss' as const }) };

  it('losing faster than 1% a week for 2+ weeks → a gentle flag', () => {
    const measurements = weights([[21, 200], [20, 200], [14, 197], [13, 197], [7, 194.5], [6, 194]]);
    expect(programRecs([], { ...fatLoss, measurements }).find((r) => r.rule === 'H3')).toMatchObject({ variant: 'fast' });
  });

  it('steady weight for 3 weeks → information only', () => {
    const measurements = weights([[28, 180], [21, 180.2], [14, 180.1], [7, 180]]);
    expect(programRecs([], { ...fatLoss, measurements }).find((r) => r.rule === 'H3')).toMatchObject({ variant: 'flat', actions: [] });
  });

  it('protein tip: once a month, only with a known body weight', () => {
    expect(programRecs([], { ...fatLoss }).find((r) => r.rule === 'H3P')).toBeUndefined();
    const measurements = weights([[3, 180]]);
    const tip = programRecs([], { ...fatLoss, profile: profile({ goal: 'fat-loss', bodyWeight: 180 }), measurements })!.find((r) => r.rule === 'H3P')!;
    expect(tip.facts.grams).toBe(130);
    const later = programRecs([], { ...fatLoss, profile: profile({ goal: 'fat-loss', bodyWeight: 180 }), log: [shown(tip.id, 'H3P', tip.key, tip.fingerprint, daysAgo(10))] });
    expect(later.find((r) => r.rule === 'H3P')).toBeUndefined();
  });
});

describe('K · wins', () => {
  it('records: estimated max, heaviest weight, reps at a weight; never on a first session', () => {
    const base = workout(14, [legs([[200, 12, 2], [200, 11, 2]])]);
    const max = workout(7, [legs([[210, 12, 2], [210, 11, 2]])]);
    expect(sessionRecords(base.id, exposuresByExercise([base]))).toEqual([]);
    expect(sessionRecords(max.id, exposuresByExercise([base, max]))[0]).toMatchObject({ kind: 'pr-max', facts: { load: 210, reps: 12 } });
    const heavy = workout(3, [legs([[220, 6, 1]])]);
    expect(sessionRecords(heavy.id, exposuresByExercise([base, max, heavy]))[0]).toMatchObject({ kind: 'pr-load', facts: { load: 220, previous: 210 } });
    const reps = workout(1, [legs([[200, 13, 0]])]);
    expect(sessionRecords(reps.id, exposuresByExercise([base, max, reps]))[0]).toMatchObject({ kind: 'pr-reps', facts: { reps: 13, previous: 12 } });
  });

  it('trend: estimated max up 3%+ over recent weeks', () => {
    const sessions = [28, 21, 14, 7].map((ago, i) => workout(ago, [legs([[180 + i * 10, 12, 2], [180 + i * 10, 12, 2]])]));
    expect(trendWins(exposuresByExercise(sessions), T0)[0]).toMatchObject({ kind: 'trend', exerciseId: 'leg-press', facts: { weeks: 3 } });
  });

  it('comeback: back to pre-break numbers', () => {
    const sessions = [workout(60, [legs([[200, 12, 2]])]), workout(20, [legs([[180, 12, 3]])], { variant: 'return' }), workout(14, [legs([[200, 12, 2]])])];
    expect(comebackWins(sessions[2]!.id, sessions, exposuresByExercise(sessions))).toHaveLength(1);
  });

  it('weekly: streak and fat-loss wins (strength held while weight drops)', () => {
    const sessions = [23, 21, 19, 16, 14, 12, 9, 7, 5].map((ago) => workout(ago, [press([[135, 9, 2], [135, 9, 2]]), legs([[200, 12, 2], [200, 12, 2]])]));
    const measurements = weights([[28, 190], [21, 188.5], [14, 187], [7, 185.6], [2, 184.5]]);
    const weekly = coachWeekly(input(sessions, { profile: profile({ goal: 'fat-loss' }), measurements }), T0);
    expect(weekly.wins.map((w) => w.kind)).toEqual(expect.arrayContaining(['streak', 'fat-loss']));
    expect(weekly.review).toMatchObject({ planned: 3, done: 0, streakWeeks: 3 });
    expect(weekly.review.muscles.find((m) => m.muscle === 'quads')).toBeDefined();
  });
});

describe('Apply', () => {
  it('edits a slot’s sets, rep range or exercise, and nothing else', () => {
    const program = makeProgram();
    const next = applyToProgram(program, { kind: 'slot', dayId: 'a', slotId: 'a-legs', exerciseId: 'leg-press', sets: { from: 3, to: 4 }, reps: { fromLow: 10, fromHigh: 12, toLow: 12, toHigh: 15 } }, T0);
    expect(next.days[0]!.slots.find((s) => s.id === 'a-legs')).toMatchObject({ sets: 4, repsLow: 12, repsHigh: 15 });
    expect(next.days[1]).toBe(program.days[1]);
    const swapped = applyToProgram(program, { kind: 'slot', dayId: 'a', slotId: 'a-pull', exerciseId: 'lat-pulldown', swapTo: 'pull-up' }, T0);
    expect(swapped.days[0]!.slots.find((s) => s.id === 'a-pull')!.exerciseId).toBe('pull-up');
  });

  it('takes the lighter week now, or pushes it back once', () => {
    const program = makeProgram();
    const now = applyToProgram(program, { kind: 'lighter-week', action: 'now' }, T0);
    expect(blockPosition(now, new Date(T0)).lighterWeek).toBe(true);
    const lighter = makeProgram({ block: { startDate: '2026-08-31', lengthWeeks: 6 } });
    const pushed = applyToProgram(lighter, { kind: 'lighter-week', action: 'postpone', weeks: 1 }, T0);
    expect(blockPosition(pushed, new Date(T0)).lighterWeek).toBe(false);
    expect(pushed.block.postponedWeeks).toBe(1);
  });

  it('session-level changes never touch the plan', () => {
    const program = makeProgram();
    expect(applyToProgram(program, { kind: 'next-exposure', exerciseId: 'leg-press', from: 200, to: 210, repsLow: 10, repsHigh: 12 }, T0)).toBe(program);
  });
});

describe('L · reviews', () => {
  it('after a session: records, next-time changes with Apply, and one insight', () => {
    const history = repeat([21, 14], legs([[200, 12, 2], [200, 12, 2], [200, 11, 2]]));
    const last = workout(0.1, [legs([[210, 12, 2], [210, 12, 2], [210, 12, 2]], { rest: 120, restTaken: [0, 60, 65] }), press([[135, 9, 2], [135, 8, 2]], { rest: 150 })], { dayId: 'a' });
    const review = coachReview(input([...history, last]), last.id, T0);
    expect(review.wins.map((w) => w.kind)).toContain('pr-max');
    expect(review.next.find((r) => r.subject.exerciseId === 'leg-press')).toMatchObject({ rule: 'A2', variant: 'up', change: { to: 220 }, actions: ['apply', 'dismiss'] });
    expect(review.insight).not.toBeNull();
  });

  it('insights rotate: the kind shown least recently leads', () => {
    const history = repeat([21, 14], legs([[200, 12, 2], [200, 12, 2], [200, 11, 2]]));
    const last = workout(0.1, [legs([[200, 12, 2], [200, 12, 2], [200, 12, 2]], { rest: 120, restTaken: [0, 60, 65] })], { dayId: 'a' });
    const first = coachReview(input([...history, last]), last.id, T0).insight!;
    const log = [shown(first.id, first.rule, first.key, first.fingerprint, T0 - 1000)];
    const second = coachReview(input([...history, last], { log }), last.id, T0).insight;
    expect(second?.type).not.toBe(first.type);
  });
});

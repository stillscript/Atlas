import { describe, expect, it } from 'vitest';
import { coachInSession, coachReview, coachToday, exerciseRec, planExercise, planSession, prepare } from '../../src/coach/engine';
import { exposuresByExercise, returnState } from '../../src/coach/measures';
import { programRecommendations, returnRec } from '../../src/coach/program';
import { readinessOffer } from '../../src/coach/readiness';
import { dayName, fill, messageKey, PHRASES, renderRecommendation, renderRestAdvice, renderWin } from '../../src/coach/render';
import type { CoachInput, Recommendation, Win } from '../../src/coach/types';
import type { Session } from '../../src/db/types';
import { buildHistory, createSession, logSet } from '../../src/domain/workout';
import { comebackWins, fatLossWin, sessionRecords, streakWin, trendWins } from '../../src/coach/wins';
import { T0, daysAgo, input, legs, makeProgram, office, press, profile, pull, lateral, repeat, slot, weights, workout } from './helpers';

/**
 * Renders every phrasing of every message the engine can produce, from real scenarios. Guards
 * against unfilled placeholders, empty titles and messages without the user's numbers.
 */

type Collected = { rec: Recommendation; experience: string };

function programRecs(i: CoachInput): Recommendation[] {
  const p = prepare(i, T0);
  return programRecommendations({ ...p.input, sessions: p.input.sessions, exposures: p.exposures, fatigue: p.fatigue, now: T0 });
}

function exerciseRecFor(sessions: Session[], exerciseId: string, target = slot('a-legs', 'leg-press', 'secondary', 3, 10, 12), overrides: Partial<CoachInput> = {}, hold?: boolean) {
  const p = prepare(input(sessions, overrides), T0);
  const plan = planExercise(hold ? { ...p, hold } : p, exerciseId, target)!;
  return exerciseRec(plan);
}

function collect(): { recs: Collected[]; wins: Win[] } {
  const recs: Collected[] = [];
  const add = (rec: Recommendation | null | undefined, experience = 'intermediate') => rec && recs.push({ rec, experience });
  const top = (load: number, rir: 0 | 1 | 2 | 3 | 4 = 2) => legs([[load, 12, rir], [load, 12, rir], [load, 12, rir]]);
  const pressSlot = slot('a-press', 'smith-incline-press', 'main', 3, 8, 10);
  const beginner = { profile: profile({ experience: 'beginner' as const }) };

  // A1–A5 and holds.
  add(exerciseRecFor([workout(3, [legs([[160, 11, 4], [190, 11, 2], [190, 11, 2]], { calibrating: true, rir: 3 })])], 'leg-press'));
  add(exerciseRecFor([workout(3, [top(190, 2)])].map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, target: { ...e.target!, calibrating: true } })) })), 'leg-press'));
  add(exerciseRecFor(repeat([14, 7], legs([[200, 12, 2], [200, 11, 2], [200, 10, 2]])), 'leg-press'));
  add(exerciseRecFor(repeat([14, 7], legs([[200, 12, 2], [200, 11, 2], [200, 10, 2]])), 'leg-press', undefined, beginner), 'beginner');
  add(exerciseRecFor(repeat([7], { ex: 'pull-up', range: [6, 10], sets: [[null, 8, 2], [null, 7, 1]] }), 'pull-up', slot('x', 'pull-up', 'main', 3, 6, 10)));
  add(exerciseRecFor(repeat([14, 7], top(200)), 'leg-press'));
  add(exerciseRecFor(repeat([14, 7], top(200)), 'leg-press', undefined, beginner), 'beginner');
  add(exerciseRecFor([workout(7, [top(190)]), workout(3, [top(200, 0)])], 'leg-press'));
  add(exerciseRecFor(repeat([14, 7], top(200, 4)), 'leg-press'));
  add(exerciseRecFor(repeat([7], legs([[200, 10, 4], [200, 10, 4], [200, 10, 4]])), 'leg-press'));
  add(exerciseRecFor(repeat([14, 7], legs([[200, 10, 1], [200, 10, 1], [200, 9, 0]])).slice(-1), 'leg-press'));
  const missed = legs([[200, 8, 0], [200, 7, 0], [200, 7, 0]]);
  add(exerciseRecFor([...repeat([21, 14, 10], legs([[190, 12, 2], [190, 12, 2], [190, 11, 1]])), workout(3, [missed])], 'leg-press'));
  add(exerciseRecFor([...repeat([21, 14], top(200)), workout(7, [missed]), workout(3, [missed])], 'leg-press'));
  const strength = { profile: profile({ goal: 'strength' as const }) };
  const strengthHistory = [...repeat([21, 14], { ...press([[125, 8, 2], [125, 7, 2]]), range: [6, 8] as [number, number] }), workout(7, [{ ...press([[135, 5, 0], [135, 4, 0], [135, 4, 0]]), range: [6, 8] as [number, number] }])];
  const strengthSlot = slot('a-press', 'smith-incline-press', 'main', 3, 6, 8);
  add(exerciseRecFor(strengthHistory, 'smith-incline-press', strengthSlot, strength));
  add(exerciseRecFor([...strengthHistory, workout(3, [{ ...press([[135, 6, 2], [135, 5, 1]]), range: [4, 6] as [number, number] }])], 'smith-incline-press', strengthSlot, strength));
  add(exerciseRecFor([...repeat([21, 14, 10], top(200)), workout(3, [missed, press([[135, 6, 0], [135, 5, 0]]), pull([[100, 12, 2], [100, 12, 2], [100, 11, 2]])])], 'leg-press'));
  add(exerciseRecFor(repeat([14, 7], press([[135, 10, 2], [135, 10, 2], [135, 10, 2]])), 'smith-incline-press', pressSlot));
  add(exerciseRecFor(repeat([14, 7], press([[135, 14, 2], [135, 14, 2], [135, 14, 2]])), 'smith-incline-press', pressSlot));
  add(exerciseRecFor(repeat([14, 7], top(410)), 'leg-press'));
  add(exerciseRecFor(repeat([14, 7], top(200)), 'leg-press', undefined, {}, true));
  add(exerciseRecFor([workout(20, [top(190)]), workout(10, [top(200)])], 'leg-press'));
  const sore = { feel: 3 as const, energy: 2 as const, pain: [{ area: 'shoulder' }] };
  add(exerciseRecFor([workout(12, [top(200)], { checkout: sore }), workout(5, [press([[135, 14, 2], [135, 14, 2], [135, 14, 2]])], { checkout: sore })], 'smith-incline-press', pressSlot));
  {
    const p = prepare(input(repeat([14, 7], top(200))), T0);
    add(exerciseRec(planExercise(p, 'leg-press', slot('a-legs', 'leg-press', 'secondary', 3, 10, 12), true)!));
  }
  add(exerciseRecFor(repeat([14, 7], legs([[200, 11, 2], [200, 11, 2], [200, 10, 2]])), 'leg-press', slot('a-legs', 'leg-press', 'secondary', 3, 15, 20)));
  add(exerciseRecFor([workout(10, [press([[135, 9, 2], [135, 9, 2]])]), workout(3, [press([[135, 9, 2], [135, 8, 1]], { pain: [1] })])], 'smith-incline-press', pressSlot));
  add(exerciseRecFor([workout(3, [legs([[200, 12, 2], [200, 11, 1]], { pain: [1] })])], 'leg-press'));
  add(exerciseRecFor([workout(3, [lateral([[15, 15, 1], [15, 14, 1]], { pain: [1] })])], 'db-lateral-raise', slot('a-lat', 'db-lateral-raise', 'accessory', 3, 12, 15, 1)));

  // Program level: plateaus, volume, fatigue, pain, weight.
  const stuckLegs = (agos: number[]) => repeat(agos, legs([[200, 12, 2], [200, 11, 2], [200, 11, 2]]));
  const stuckPull = (agos: number[]) => repeat(agos, pull([[100, 12, 2], [100, 11, 2], [100, 11, 2]]));
  for (const r of programRecs(input(stuckLegs([28, 21, 14, 7]), beginner))) add(r, 'beginner');
  for (const r of programRecs(input(stuckPull([28, 21, 14, 7])))) add(r);
  for (const r of programRecs(input(stuckLegs([28, 21, 14, 7])))) add(r);
  for (const r of programRecs(input(stuckLegs([49, 42, 35, 28, 21, 14, 7])))) add(r);
  // A stalled leg press with plenty of quad work already → one set less.
  const quadHeavy = makeProgram({
    days: [{ id: 'q', name: 'Legs', slots: [slot('a-legs', 'leg-press', 'secondary', 5, 10, 12), slot('q2', 'machine-leg-extension', 'accessory', 5, 12, 15), slot('q3', 'smith-squat', 'main', 5, 6, 8)] }],
    schedule: ['q', null, 'q', null, 'q', null, null],
  });
  for (const r of programRecs(input(stuckLegs([28, 21, 14, 7]), { program: quadHeavy }))) add(r);
  // Pain on a lift with a pain-free alternative → swap.
  add(exerciseRecFor([workout(3, [{ ex: 'machine-leg-curl', slot: 'b-curl', range: [12, 15], rir: 1, sets: [[80, 12, 1], [80, 11, 1]], pain: [1] }])], 'machine-leg-curl', slot('b-curl', 'machine-leg-curl', 'accessory', 3, 12, 15, 1)));
  const rough = { feel: 1 as const, energy: 1 as const, pain: [] };
  for (const r of programRecs(input([...stuckLegs([28, 21, 14]), workout(7, [legs([[200, 12, 2], [200, 11, 2], [200, 11, 2]])], { checkout: rough }), workout(5, [pull([[100, 12, 2]]), press([[135, 9, 2]])], { checkout: rough })]))) add(r);
  const heavyPlan = makeProgram({
    days: [{ id: 'a', name: 'Day A', slots: [slot('p1', 'smith-incline-press', 'main', 5, 8, 10), slot('p2', 'machine-chest-press', 'secondary', 5, 8, 12), slot('p3', 'cable-fly', 'accessory', 5, 12, 15), slot('p4', 'db-bench-press', 'accessory', 5, 8, 12), slot('r1', 'seated-row-machine', 'secondary', 3, 10, 12)] }],
    schedule: ['a', null, 'a', null, 'a', null, null],
  });
  for (const r of programRecs(input([...repeat([30, 23], press([[135, 9, 2]])), workout(6, [press([[135, 9, 2]]), pull([[100, 12, 2]]), legs([[200, 12, 2]])], { checkout: rough }), workout(3, [press([[135, 9, 2]])], { checkout: rough })], { program: heavyPlan }))) add(r);
  const sore2 = { feel: 1 as const, energy: 1 as const, pain: [{ area: 'knee', exerciseId: 'leg-press' }, { area: 'shoulder', exerciseId: 'smith-incline-press' }] };
  for (const r of programRecs(input([workout(30, [legs([[180, 12, 2]]), pull([[90, 12, 2]])]), workout(6, [legs([[200, 12, 2]]), press([[135, 9, 2]])], { checkout: sore2 }), workout(3, [legs([[200, 12, 2]])], { checkout: sore2 })]))) add(r);
  for (const r of programRecs(input([workout(30, [legs([[180, 12, 2]]), pull([[90, 12, 2]]), press([[125, 9, 2]])]), workout(6, [legs([[200, 12, 2]])], { checkout: rough }), workout(3, [legs([[200, 12, 2]])], { checkout: rough })]))) add(r);
  for (const r of programRecs(input([], { program: makeProgram({ block: { startDate: '2026-08-31', lengthWeeks: 6 } }) }))) add(r);
  for (const r of programRecs(input([], { program: makeProgram({ block: { startDate: '2026-08-31', lengthWeeks: 6, postponedWeeks: 1 } }) }))) add(r);
  for (const r of programRecs(input([workout(12, [top(200)], { checkout: sore }), workout(5, [top(200)], { checkout: sore })]))) add(r);
  const fatLoss = (measurements: ReturnType<typeof weights>) => input([], { profile: profile({ goal: 'fat-loss', bodyWeight: 180 }), measurements });
  for (const r of programRecs(fatLoss(weights([[21, 200], [20, 200], [14, 197], [13, 197], [7, 194.5], [6, 194]])))) add(r);
  for (const r of programRecs(fatLoss(weights([[28, 180], [21, 180.2], [14, 180.1], [7, 180]])))) add(r);

  // Schedule and breaks.
  for (const r of coachToday(input([workout(9, [legs([[200, 12, 2]])], { dayId: 'a' })]), T0).recommendations) add(r);
  for (const r of coachToday(input([workout(9, [legs([[200, 12, 2]])], { dayId: 'a' })]), daysAgo(-1)).recommendations) add(r);
  const steady = (ago: number, variant?: Session['variant']) => workout(ago, [legs([[200, 12, 2]])], { variant });
  for (const sessions of [
    [steady(20), steady(10)],
    [steady(40), steady(20)],
    [steady(40), steady(20), steady(1, 'return')],
    [steady(60), steady(30)],
    [steady(60), steady(30), steady(1, 'return')],
    [steady(90), steady(60)],
    [steady(90), steady(60), steady(1, 'return')],
  ]) {
    add(returnRec(returnState(sessions, T0), T0));
  }

  // Readiness.
  const check = (s: 1 | 2 | 3, e: 1 | 2 | 3, so: 1 | 2 | 3, w?: number) => ({ sleep: s, energy: e, soreness: so, wearable: w, at: T0 });
  add(readinessOffer(check(1, 1, 3), [], 'Day A')?.recommendation);
  add(readinessOffer(check(1, 1, 1), [], 'Day A')?.recommendation);
  const past = Array.from({ length: 12 }, (_, i) => workout(30 - i, [], { readiness: { sleep: 3, energy: 3, soreness: 3, wearable: 70 + i } }));
  add(readinessOffer(check(2, 2, 3, 55), past, 'Day A')?.recommendation);

  // In-session.
  const history = repeat([21, 14, 7], legs([[200, 12, 2], [200, 12, 2], [200, 11, 2]]));
  const dayA = makeProgram().days[0]!;
  for (const [set, experience] of [
    [[200, 7, 0], 'intermediate'],
    [[200, 12, 4], 'intermediate'],
    [[200, 12, 4], 'beginner'],
  ] as const) {
    const i = input(history, { profile: profile({ experience }) });
    let s = createSession({ program: makeProgram(), day: dayA, gym: office, profile: profile({ experience }), history: buildHistory(history), now: T0, plan: planSession(prepare(i, T0), dayA).plan });
    const index = s.entries.findIndex((e) => e.exerciseId === 'leg-press');
    s = logSet(s, index, { load: set[0], reps: set[1], rir: set[2] }, T0);
    add(coachInSession(i, s, index, T0).offer, experience);
  }

  // Reviews: technique cue, rest, week, trend.
  const reviewSessions = [...[28, 21, 14].map((ago, k) => workout(ago, [legs([[180 + k * 10, 12, 2], [180 + k * 10, 12, 2]])], { dayId: 'a' }))];
  const last = workout(0.1, [legs([[210, 12, 2], [210, 12, 2], [210, 12, 2]], { rest: 120, restTaken: [0, 60, 65] }), { ex: 'cable-fly', range: [12, 15], sets: [[50, 15, 2], [50, 14, 1]] }], { dayId: 'a' });
  const all = [...reviewSessions, last];
  const seenTypes = new Set<string>();
  let log: CoachInput['log'] = [];
  for (let k = 0; k < 4; k++) {
    const insight = coachReview(input(all, { log }), last.id, T0).insight;
    if (!insight || seenTypes.has(insight.type)) break;
    seenTypes.add(insight.type);
    add(insight);
    log = [...log, { id: `l${k}`, at: T0 - (4 - k) * 1000, kind: 'shown', recommendationId: insight.id, ruleId: insight.rule, key: insight.key, fingerprint: insight.fingerprint }];
  }
  const fullWeek = [2, 1, 0.5].map((ago, k) => workout(ago, [legs([[200, 12, 2]])], { dayId: ['a', 'b', 'a'][k] }));
  add(coachReview(input(fullWeek), fullWeek[2]!.id, T0).insight);

  // Wins.
  const wins: Win[] = [];
  const base = workout(14, [legs([[200, 12, 2], [200, 11, 2]])]);
  const max = workout(7, [legs([[210, 12, 2]])]);
  const heavy = workout(3, [legs([[220, 6, 1]])]);
  const reps = workout(1, [legs([[200, 13, 0]])]);
  wins.push(...sessionRecords(max.id, exposuresByExercise([base, max])), ...sessionRecords(heavy.id, exposuresByExercise([base, max, heavy])), ...sessionRecords(reps.id, exposuresByExercise([base, max, reps])));
  wins.push(...trendWins(exposuresByExercise([28, 21, 14, 7].map((ago, k) => workout(ago, [legs([[180 + k * 10, 12, 2]])]))), T0));
  const comeback = [workout(60, [legs([[200, 12, 2]])]), workout(14, [legs([[200, 12, 2]])])];
  wins.push(...comebackWins(comeback[1]!.id, comeback, exposuresByExercise(comeback)));
  const streakSessions = [23, 21, 19, 16, 14, 12, 9, 7, 5].map((ago) => workout(ago, [press([[135, 9, 2]]), legs([[200, 12, 2]])]));
  wins.push(streakWin(makeProgram(), streakSessions, profile(), T0)!);
  wins.push(fatLossWin(profile({ goal: 'fat-loss' }), weights([[28, 190], [21, 188.5], [14, 187], [7, 185.6], [2, 184.5]]), exposuresByExercise(streakSessions.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, role: 'main' as const })) }))), T0)!);
  wins.push(...coachReview(input(fullWeek), fullWeek[2]!.id, T0).wins);
  return { recs, wins: wins.filter(Boolean) };
}

const { recs, wins } = collect();

/** Messages that are words by nature (safety lines, readiness, a cue, the missed-day prompt). */
const WORDS_ONLY = /^(J1\.(lighter|swap|repeat)|C1\.|C2\.|G1\.|T\.cue|F2\.scheduled|H3\.fast)/;

describe('every Coach message renders cleanly', () => {
  it('the scenarios reach every message in phrases.json', () => {
    const reached = new Set(recs.map(({ rec, experience }) => messageKey(rec, experience)));
    const missing = Object.keys(PHRASES.messages).filter((key) => !reached.has(key));
    expect(missing).toEqual([]);
  });

  it('every phrasing fills every placeholder, and carries the user’s numbers', () => {
    for (const { rec, experience } of recs) {
      const key = messageKey(rec, experience);
      const parts = PHRASES.messages[key]!;
      const actions = parts.action?.length ? parts.action : [''];
      for (let t = 0; t < parts.title.length; t++) {
        for (let b = 0; b < parts.body.length; b++) {
          for (let a = 0; a < actions.length; a++) {
            const variant = `${key}#${t}.${b}.${a}`;
            const log = [{ id: 'x', at: T0 - 86_400_000, kind: 'shown' as const, recommendationId: rec.id, ruleId: rec.rule, key: rec.key, fingerprint: rec.fingerprint, variant }];
            const out = renderRecommendation(rec, { units: 'lb', now: T0, experience, log });
            const text = `${out.title} ${out.body}`;
            expect(out.title.length, `${variant} title`).toBeGreaterThan(3);
            expect(text, variant).not.toMatch(/[{}]|undefined|NaN|\s[,.]|\(\)/);
            if (!WORDS_ONLY.test(key)) expect(text, `${variant} has a number`).toMatch(/\d/);
            expect(text, `${variant} stays calm`).not.toMatch(/!/);
          }
        }
      }
    }
  });

  it('every message has a Why? with a principle', () => {
    for (const { rec } of recs) {
      const out = renderRecommendation(rec, { units: 'lb', now: T0 });
      expect(out.why.principle.length).toBeGreaterThan(20);
      if (!rec.safety) expect(out.meta).toMatch(/^(Early read|Fairly sure|Confident) · \d+ (sessions?|weeks? of data)$/);
      expect(out.title.charAt(0), out.title).toBe(out.title.charAt(0).toUpperCase());
    }
  });

  it('safety lines always point to professional help, never say "push through"', () => {
    const safety = recs.filter(({ rec }) => rec.safety);
    expect(safety.length).toBeGreaterThan(0);
    for (const { rec } of safety) {
      const out = renderRecommendation(rec, { units: 'lb', now: T0 });
      expect(out.body).toMatch(/doctor or physio/);
    }
    for (const parts of Object.values(PHRASES.messages)) {
      for (const text of [...parts.title, ...parts.body, ...(parts.action ?? [])]) expect(text.toLowerCase()).not.toContain('push through');
    }
  });

  it('every win renders, with numbers', () => {
    const kinds = new Set(wins.map((w) => w.kind));
    expect([...kinds].sort()).toEqual(Object.keys(PHRASES.wins).sort());
    for (const win of wins) {
      const out = renderWin(win, { units: 'lb', now: T0 });
      expect(`${out.title} ${out.body}`, win.kind).not.toMatch(/[{}]|undefined|NaN/);
      expect(out.title, win.kind).toMatch(/\d/);
    }
  });
});

describe('render helpers', () => {
  it('fills plurals and clock times', () => {
    expect(fill('{n|set|sets} left, rest {s:clock}', { n: 1, s: 150 })).toBe('1 set left, rest 2:30');
    expect(fill('{n|set|sets}', { n: 3 })).toBe('3 sets');
  });

  it('names recent days and dates', () => {
    expect(dayName('2026-10-14', T0)).toBe('today');
    expect(dayName('2026-10-13', T0)).toBe('yesterday');
    expect(dayName('2026-10-12', T0)).toBe('Monday');
    expect(dayName('2026-09-30', T0)).toBe('Sep 30');
  });

  it('rest advice reads plainly', () => {
    expect(renderRestAdvice({ seconds: 150, dropped: 4, restTaken: 70 })).toBe('Reps dropped by 4 after a 1:10 rest. Take the full 2:30 before the next set.');
  });
});

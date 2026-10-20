import { describe, expect, it } from 'vitest';
import { exposuresByExercise } from '../../src/coach/measures';
import {
  bodySeries,
  bodySummary,
  exerciseRecords,
  exerciseSeries,
  exerciseSummaries,
  latestValues,
  movingAverage,
  recordHistory,
  weekHistory,
  weekMuscles,
} from '../../src/domain/progress';
import { T0, legs, makeProgram, press, repeat, weights, workout } from '../coach/helpers';

describe('training calendar', () => {
  it('lays out weeks day by day: planned, done, today, future', () => {
    // Plan from 60 days ago, Mon/Wed/Fri. T0 is Wednesday 14 Oct.
    const sessions = [workout(9, [legs([[200, 12, 2]])]), workout(7, [legs([[200, 12, 2]])]), workout(5, [legs([[200, 12, 2]])]), workout(2, [legs([[200, 12, 2]])])];
    const weeks = weekHistory(makeProgram(), sessions, T0, 3);
    expect(weeks).toHaveLength(3);
    const last = weeks[2]!;
    expect(last.start).toBe('2026-10-12');
    expect(last.days.map((d) => d.planned)).toEqual([true, false, true, false, true, false, false]);
    expect(last.days[2]).toMatchObject({ today: true, future: false });
    expect(last.days[4]!.future).toBe(true);
    expect(last.done).toBe(1);
    const previous = weeks[1]!;
    expect(previous).toMatchObject({ planned: 3, done: 3, complete: true });
  });

  it('days before the plan existed are not "planned"', () => {
    const weeks = weekHistory(makeProgram({ createdAt: T0 - 86_400_000 }), [], T0, 2);
    expect(weeks[0]!.planned).toBe(0);
    expect(weeks[1]!.days.filter((d) => d.planned).map((d) => d.date)).toEqual(['2026-10-14', '2026-10-16']);
  });
});

describe('exercise progress', () => {
  const history = [
    workout(35, [legs([[180, 12, 2], [180, 11, 2]])]),
    workout(21, [legs([[190, 12, 2], [190, 12, 2]])]),
    workout(14, [legs([[200, 12, 2], [200, 10, 1]])], { variant: 'lighter-week' }),
    workout(7, [legs([[210, 11, 2], [210, 10, 1]])]),
    workout(3, [press([[135, 9, 2]])]),
  ];

  it('summarises each lift, most recent first, with a 4-week change', () => {
    const [first, second] = exerciseSummaries(history, T0);
    expect(first!.exerciseId).toBe('smith-incline-press');
    expect(second).toMatchObject({ exerciseId: 'leg-press', exposures: 4, bodyweight: false, lastSet: { load: 210, reps: 11 } });
    expect(second!.latest).toBe(Math.round(210 * (1 + 11 / 30)));
    expect(second!.change).toBe(Math.round(210 * (1 + 11 / 30)) - Math.round(180 * (1 + 12 / 30)));
    expect(second!.spark).toHaveLength(4);
  });

  it('charts estimated max, top weight, volume or reps per session, marking lighter sessions', () => {
    const list = exposuresByExercise(history).get('leg-press')!;
    expect(exerciseSeries(list, 'top').map((p) => p.value)).toEqual([180, 190, 200, 210]);
    expect(exerciseSeries(list, 'volume')[0]!.value).toBe(180 * 23);
    expect(exerciseSeries(list, 'e1rm')[2]!.light).toBe(true);
  });

  it('records: best estimated max, heaviest, and most reps at each weight', () => {
    const list = exposuresByExercise([...history, workout(1, [legs([[190, 14, 0]])])]).get('leg-press')!;
    const records = exerciseRecords(list);
    expect(records.heaviest).toMatchObject({ load: 210, reps: 11 });
    expect(records.bestMax?.load).toBe(210);
    expect(records.repRecords.find((r) => r.load === 190)).toMatchObject({ reps: 14 });
    expect(records.repRecords[0]!.load).toBe(210);
  });

  it('bodyweight lifts track reps', () => {
    const bw = [workout(14, [{ ex: 'pull-up', range: [6, 10], sets: [[null, 7, 2], [null, 6, 1]] }]), workout(7, [{ ex: 'pull-up', range: [6, 10], sets: [[null, 9, 1]] }])];
    expect(exerciseSummaries(bw, T0)[0]).toMatchObject({ bodyweight: true, best: 9, latest: 9 });
  });

  it('record history lists every record, newest first, never a first session', () => {
    const events = recordHistory(history);
    expect(events.map((e) => e.kind)).toEqual(['pr-max', 'pr-max', 'pr-max']);
    expect(events[0]!.date >= events[1]!.date).toBe(true);
    expect(events.every((e) => e.exerciseId === 'leg-press')).toBe(true);
  });

  it('a lift that only repeats itself has no records', () => {
    expect(recordHistory(repeat([14, 7], legs([[200, 12, 2]])))).toEqual([]);
  });
});

describe('body measurements', () => {
  const m = weights([[30, 190], [29, 189], [23, 188.6], [16, 188], [9, 187.2], [2, 186.4], [1, 186.8]]);

  it('series and a 7-day average that smooths daily swings', () => {
    const points = bodySeries(m, 'weight');
    expect(points.map((p) => p.value)).toEqual([190, 189, 188.6, 188, 187.2, 186.4, 186.8]);
    const avg = movingAverage(points);
    expect(avg[1]!.value).toBe(189.5);
    expect(avg[6]!.value).toBe(186.6);
  });

  it('summary: latest entry and the change over about a month', () => {
    const summary = bodySummary(bodySeries(m, 'weight'), 'weight', T0)!;
    expect(summary.latest.value).toBe(186.8);
    expect(summary.change30).toBeLessThan(0);
    expect(bodySummary([], 'waist', T0)).toBeNull();
  });

  it('latest value per metric, for logging placeholders', () => {
    const mixed = [...m, { id: 'w', date: '2026-10-10', waist: 34.5, at: T0 - 4 * 86_400_000 }];
    expect(latestValues(mixed)).toEqual({ weight: 186.8, waist: 34.5 });
  });
});

describe('weekly muscle map', () => {
  it('shades each muscle by its sets toward the low end of the target, and lists who is behind', () => {
    const week = weekMuscles([
      { muscle: 'chest', planned: 12, done: 12, band: [10, 20] },
      { muscle: 'back', planned: 12, done: 5, band: [10, 20] },
      { muscle: 'calves', planned: 6, done: 0, band: [6, 12] },
      { muscle: 'forearms', planned: 0, done: 2, band: [0, 6] },
    ]);
    expect(week.level).toEqual({ chest: 1, back: 0.5, forearms: 1 });
    expect(week.onTarget).toEqual(['chest', 'forearms']);
    expect(week.below).toEqual(['calves', 'back']);
  });
});

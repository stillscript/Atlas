import { describe, expect, it } from 'vitest';
import type { Experience, Goal, Gym } from '../../src/db/types';
import { PROGRAMMING, requireExercise } from '../../src/domain/catalog';
import { estimateDayMinutes, generateProgram, programFromTemplate } from '../../src/domain/generator';
import { canDoExercise, createGymFromCatalog, createGymFromPreset, gymTags } from '../../src/domain/gym';
import { weeklyFrequency, weeklySets } from '../../src/domain/volume';

const office = createGymFromPreset('office');
const barbellGym = createGymFromCatalog('Commercial gym', [
  'barbell-and-plates', 'squat-rack', 'adjustable-bench', 'dumbbells-5-100', 'dual-cable-machine', 'dip-station',
  'pull-up-bar', 'lat-pulldown-machine', 'seated-row-machine', 'leg-press-machine', 'leg-curl-machine',
  'leg-extension-machine', 'calf-raise-machine', 'treadmill', 'exercise-bike',
]);
const homeGym = createGymFromCatalog('Home', ['dumbbells-5-65', 'adjustable-bench', 'pull-up-bar', 'loop-bands']);

const GOALS: Goal[] = ['muscle', 'fat-loss', 'strength', 'general'];
const LEVELS: Experience[] = ['beginner', 'intermediate', 'advanced'];
const GYMS: [string, Gym][] = [['Office', office], ['barbell gym', barbellGym], ['home', homeGym]];

describe('generated programs are always valid', () => {
  for (const [gymName, gym] of GYMS) {
    for (const goal of GOALS) {
      for (const experience of LEVELS) {
        for (const daysPerWeek of [2, 3, 4, 5, 6]) {
          for (const sessionMinutes of [30, 45, 60, 75]) {
            it(`${gymName} · ${goal} · ${experience} · ${daysPerWeek}×/week · ${sessionMinutes} min`, () => {
              const { program } = generateProgram({ goal, experience, daysPerWeek, sessionMinutes }, gym, 0);
              const tags = gymTags(gym);

              expect(program.schedule).toHaveLength(7);
              const scheduled = program.schedule.filter(Boolean);
              expect(scheduled).toHaveLength(daysPerWeek);
              expect(new Set(scheduled).size).toBe(daysPerWeek);

              for (const day of program.days) {
                expect(day.slots.length, `${day.id} has exercises`).toBeGreaterThanOrEqual(3);
                expect(estimateDayMinutes(day), `${day.id} fits ${sessionMinutes} min`).toBeLessThanOrEqual(sessionMinutes);
                const ids = day.slots.map((s) => s.exerciseId);
                expect(new Set(ids).size, `${day.id} has no repeats`).toBe(ids.length);
                for (const slot of day.slots) {
                  const exercise = requireExercise(slot.exerciseId);
                  expect(canDoExercise(exercise, tags), `${exercise.id} possible here`).toBe(true);
                  expect(slot.sets).toBeGreaterThanOrEqual(2);
                  expect(slot.sets).toBeLessThanOrEqual(PROGRAMMING.maxSetsPerSlot);
                  expect(slot.repsLow).toBeLessThanOrEqual(slot.repsHigh);
                  expect(slot.rir).toBeGreaterThanOrEqual(0);
                  expect(slot.rir).toBeLessThanOrEqual(3);
                }
                for (const extra of day.extras ?? []) expect(canDoExercise(requireExercise(extra.exerciseId), tags)).toBe(true);
              }
            });
          }
        }
      }
    }
  }
});

describe('generated programs follow the approved rules', () => {
  it('trains chest, back and quads at least twice a week from 2 days and 45 minutes up', () => {
    for (const daysPerWeek of [2, 3, 4, 5, 6]) {
      const { program } = generateProgram({ goal: 'muscle', experience: 'intermediate', daysPerWeek, sessionMinutes: 45 }, office, 0);
      const frequency = weeklyFrequency(program);
      for (const muscle of ['chest', 'back', 'quads'] as const) {
        expect(frequency.get(muscle) ?? 0, `${muscle} at ${daysPerWeek} days`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('with enough time, big muscles reach the weekly-set target for the level', () => {
    for (const experience of LEVELS) {
      const { program } = generateProgram({ goal: 'muscle', experience, daysPerWeek: 4, sessionMinutes: 75 }, office, 0);
      const sets = weeklySets(program);
      const [min] = PROGRAMMING.volumeBands[experience].major;
      for (const muscle of ['chest', 'back', 'quads'] as const) {
        expect(sets.get(muscle) ?? 0, `${experience} ${muscle}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('never pushes a muscle far past the top of its band', () => {
    for (const experience of LEVELS) {
      for (const daysPerWeek of [3, 4, 5, 6]) {
        const { program } = generateProgram({ goal: 'muscle', experience, daysPerWeek, sessionMinutes: 75 }, barbellGym, 0);
        const sets = weeklySets(program);
        for (const muscle of PROGRAMMING.majorMuscles) {
          const max = PROGRAMMING.volumeBands[experience].major[1];
          expect(sets.get(muscle) ?? 0, `${experience} ${daysPerWeek}d ${muscle}`).toBeLessThanOrEqual(max + 6);
        }
      }
    }
  });

  it('strength puts heavy, low-rep, long-rest work first', () => {
    const { program } = generateProgram({ goal: 'strength', experience: 'intermediate', daysPerWeek: 4, sessionMinutes: 75 }, barbellGym, 0);
    const main = program.days[1]!.slots[0]!;
    expect(main.exerciseId).toBe('barbell-back-squat');
    expect([main.repsLow, main.repsHigh]).toEqual([4, 6]);
    expect(main.sets).toBe(4);
    expect(main.restSec).toBe(180);
  });

  it('beginners get higher reps, an extra rep in the tank and fewer sets', () => {
    const { program } = generateProgram({ goal: 'muscle', experience: 'beginner', daysPerWeek: 3, sessionMinutes: 60 }, office, 0);
    const main = program.days[0]!.slots[0]!;
    expect([main.repsLow, main.repsHigh]).toEqual([8, 12]);
    expect(main.rir).toBe(3);
    expect(main.sets).toBe(3);
  });

  it('varies the same movement across the week when a good alternative exists', () => {
    const { program } = generateProgram({ goal: 'muscle', experience: 'intermediate', daysPerWeek: 4, sessionMinutes: 75 }, office, 0);
    const rows = program.days.flatMap((d) => d.slots.filter((s) => s.pattern === 'horizontal-pull').map((s) => s.exerciseId));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('never adds cardio, even for fat loss (cardio is tracked outside Atlas)', () => {
    const { program } = generateProgram({ goal: 'fat-loss', experience: 'intermediate', daysPerWeek: 3, sessionMinutes: 75 }, office, 0);
    expect(program.days.flatMap((d) => d.extras ?? [])).toEqual([]);
  });

  it('uses the training days you picked', () => {
    const { program } = generateProgram(
      { goal: 'general', experience: 'beginner', daysPerWeek: 3, sessionMinutes: 45, trainingDays: [1, 3, 5] },
      office,
      0,
    );
    expect(program.schedule.map((d) => d !== null)).toEqual([false, true, false, true, false, true, false]);
  });
});

describe('Pillar at the Office', () => {
  it('keeps your sets, reps and schedule, and fits a normal session', () => {
    const { program, report } = programFromTemplate('pillar', office, { experience: 'intermediate', goal: 'fat-loss' });
    expect(program.goal).toBe('fat-loss');
    expect(program.schedule).toEqual(['upper-a', 'lower-a', 'pull', 'lower-b', 'upper-b', null, null]);
    const incline = program.days[0]!.slots[0]!;
    expect([incline.sets, incline.repsLow, incline.repsHigh]).toEqual([4, 6, 8]);
    expect(incline.purpose).toMatch(/Upper chest/);
    for (const minutes of Object.values(report.minutesByDay)) {
      expect(minutes).toBeGreaterThanOrEqual(40);
      expect(minutes).toBeLessThanOrEqual(75);
    }
    // Side delts were Pillar's priority: three doses a week.
    expect(report.weeklySets['side-delts']).toBeGreaterThanOrEqual(11);
  });
});

import { describe, expect, it } from 'vitest';
import type { Program } from '../../src/db/types';
import { createGymFromCatalog, createGymFromPreset, loadSourceFor } from '../../src/domain/gym';
import { applyLegStyle, machineSwapCount } from '../../src/domain/legStyle';
import { buildProgram, type OnboardingAnswers } from '../../src/domain/onboarding';
import { replaceExercise } from '../../src/domain/planEdit';
import { requireExercise } from '../../src/domain/catalog';

const office = createGymFromPreset('office', 0);
const answers = (overrides: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  goal: 'muscle',
  experience: 'intermediate',
  trainingDays: [0, 1, 2, 3, 4],
  sessionMinutes: 75,
  sex: 'male',
  gym: { kind: 'preset', presetId: 'office' },
  plan: 'pillar',
  startingLoads: {},
  ...overrides,
});
const ctx = { gym: office, experience: 'intermediate' as const };
const FREE_WEIGHT_LEGS = ['squat', 'hinge', 'deadlift', 'single-leg', 'hip-thrust'];
const legIds = (program: Program, dayId: string) => program.days.find((d) => d.id === dayId)!.slots.map((s) => s.exerciseId);
const usesFreeWeightLegs = (program: Program) =>
  program.days.some((d) => d.slots.some((s) => FREE_WEIGHT_LEGS.includes(requireExercise(s.exerciseId).pattern) && requireExercise(s.exerciseId).requires.some((t) => ['smith', 'barbell', 'dumbbells'].includes(t))));

describe('leg style from setup', () => {
  it('Man: Pillar at the Office does legs on machines', () => {
    const program = buildProgram(answers(), office, 0).program;
    expect(program.legStyle).toBe('machines');
    expect(legIds(program, 'lower-a')).toEqual(['leg-press', 'leg-press-high-feet', 'machine-leg-extension', 'machine-leg-curl', 'smith-calf-raise', 'cable-crunch']);
    expect(legIds(program, 'lower-b')).toEqual(['leg-press-high-feet', 'leg-press', 'machine-leg-curl', 'machine-leg-extension', 'leg-press-calf-press']);
    expect(usesFreeWeightLegs(program)).toBe(false);
    // Upper days are untouched.
    expect(legIds(program, 'upper-a')).toEqual(legIds(buildProgram(answers({ sex: 'unspecified' }), office, 0).program, 'upper-a'));
  });

  it('Man: generated plans of every length avoid squats, deadlifts and lunges at the Office', () => {
    for (const days of [[0, 3], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5]]) {
      const program = buildProgram(answers({ plan: 'auto', trainingDays: days }), office, 0).program;
      expect(usesFreeWeightLegs(program), `${days.length} days`).toBe(false);
    }
  });

  it('never stacks more than two leg exercises on one machine in a day (calves aside)', () => {
    for (const plan of ['pillar', 'auto'] as const) {
      const program = buildProgram(answers({ plan }), office, 0).program;
      for (const day of program.days) {
        const stations = day.slots
          .filter((s) => ['leg-press', 'leg-curl', 'leg-extension', 'squat', 'hinge', 'deadlift', 'single-leg', 'hip-thrust'].includes(requireExercise(s.exerciseId).pattern))
          .map((s) => loadSourceFor(requireExercise(s.exerciseId), office)?.item.id);
        for (const station of new Set(stations)) expect(stations.filter((x) => x === station).length, `${day.id} ${station}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('replaced exercises get reps, effort and a purpose that fit them', () => {
    const program = buildProgram(answers(), office, 0).program;
    const slot = program.days.find((d) => d.id === 'lower-b')!.slots.find((s) => s.id === 'lower-b-deadlift')!;
    expect(slot.exerciseId).toBe('leg-press-high-feet');
    expect(slot.repsLow).toBeGreaterThanOrEqual(6); // not the deadlift's 5 × 5
    expect(slot.purpose).toBe('Glutes and hamstrings.');
    expect(slot.freeWeight).toMatchObject({ exerciseId: 'smith-deadlift', repsLow: 5, repsHigh: 5 });
  });

  it('Woman: free weights, with a hip thrust in place of leg extensions', () => {
    const program = buildProgram(answers({ sex: 'female' }), office, 0).program;
    expect(program.legStyle).toBe('free-weights');
    expect(legIds(program, 'lower-a')).toContain('smith-squat');
    expect(legIds(program, 'lower-b')).toContain('smith-deadlift');
    expect(legIds(program, 'lower-b')).toContain('smith-hip-thrust');
    expect(legIds(program, 'lower-b')).not.toContain('machine-leg-extension');
    const generated = buildProgram(answers({ sex: 'female', plan: 'auto', trainingDays: [0, 2, 4] }), office, 0).program;
    expect(generated.days.some((d) => d.slots.some((s) => s.pattern === 'hip-thrust'))).toBe(true);
  });

  it('Rather not say: the plan as templates and the generator build it', () => {
    const program = buildProgram(answers({ sex: 'unspecified' }), office, 0).program;
    expect(program.legStyle).toBe('free-weights');
    expect(legIds(program, 'lower-a')).toEqual(['smith-squat', 'smith-rdl', 'db-walking-lunge', 'machine-leg-curl', 'smith-calf-raise', 'cable-crunch']);
    expect(program.days.every((d) => d.slots.every((s) => !s.freeWeight))).toBe(true);
  });
});

describe('switching in Plan settings', () => {
  const free = buildProgram(answers({ sex: 'unspecified' }), office, 0).program;

  it('machines and back restores the plan exactly', () => {
    const machines = applyLegStyle(free, 'machines', ctx, 10);
    expect(usesFreeWeightLegs(machines)).toBe(false);
    const back = applyLegStyle(machines, 'free-weights', ctx, 20);
    expect(back.days).toEqual(free.days);
    expect(back.legStyle).toBe('free-weights');
  });

  it('applying machines twice changes nothing more', () => {
    const once = applyLegStyle(free, 'machines', ctx, 10);
    expect(applyLegStyle(once, 'machines', ctx, 20).days).toEqual(once.days);
  });

  it('a hand-picked exercise survives switching back', () => {
    const machines = applyLegStyle(free, 'machines', ctx, 10);
    const picked = replaceExercise(machines, 'lower-a', 'lower-a-squat', 'goblet-squat', 15);
    const back = applyLegStyle(picked, 'free-weights', ctx, 20);
    expect(legIds(back, 'lower-a')[0]).toBe('goblet-squat');
    expect(legIds(back, 'lower-a')[1]).toBe('smith-rdl');
  });

  it('counts the changes, and finds none in a gym without leg machines', () => {
    expect(machineSwapCount(free, ctx)).toBe(5);
    const home = createGymFromCatalog('Home', ['dumbbells-5-65', 'flat-bench']);
    expect(machineSwapCount(free, { gym: home, experience: 'intermediate' })).toBe(0);
  });

  it('uses a hack squat where the gym has one', () => {
    const gym = createGymFromCatalog('Big gym', ['hack-squat-machine', 'leg-press-machine', 'leg-curl-machine', 'leg-extension-machine', 'dumbbells-5-100', 'flat-bench', 'cable-station']);
    const program = buildProgram(answers(), gym, 0).program;
    expect(legIds(program, 'lower-a')[0]).toBe('hack-squat');
  });
});

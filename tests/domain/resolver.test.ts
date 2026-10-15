import { describe, expect, it } from 'vitest';
import { programFromTemplate } from '../../src/domain/generator';
import { createGymFromCatalog, createGymFromPreset } from '../../src/domain/gym';
import { convertStartLoad, resolvePattern, startingLoad, swapOptions } from '../../src/domain/resolver';

const office = createGymFromPreset('office');
const barbellGym = createGymFromCatalog('Commercial gym', [
  'barbell-and-plates',
  'squat-rack',
  'adjustable-bench',
  'dumbbells-5-100',
  'cable-station',
  'dip-station',
  'pull-up-bar',
  'leg-press-machine',
  'leg-curl-machine',
  'leg-extension-machine',
  'treadmill',
  'exercise-bike',
]);

function pillarAt(gym = office, experience: 'beginner' | 'intermediate' = 'intermediate') {
  const { program } = programFromTemplate('pillar', gym, { experience });
  const bySlot: Record<string, string> = {};
  for (const day of program.days) {
    for (const slot of day.slots) bySlot[slot.id] = slot.exerciseId;
    for (const extra of day.extras ?? []) bySlot[extra.id] = extra.exerciseId;
  }
  return bySlot;
}

describe('Pillar at the Office', () => {
  it('maps every slot to equipment the Office really has', () => {
    expect(pillarAt()).toEqual({
      'upper-a-incline': 'smith-incline-press',
      'upper-a-flat-press': 'db-bench-press',
      'upper-a-row': 'cable-row',
      'upper-a-lateral': 'db-lateral-raise',
      'upper-a-triceps': 'cable-pushdown',
      'upper-a-finisher': 'hanging-leg-raise',
      'lower-a-squat': 'smith-squat',
      'lower-a-rdl': 'smith-rdl',
      'lower-a-lunge': 'db-walking-lunge',
      'lower-a-leg-curl': 'machine-leg-curl',
      'lower-a-calves': 'smith-calf-raise',
      'lower-a-abs': 'cable-crunch',
      'pull-vertical-pull': 'pull-up',
      'pull-cs-row': 'chest-supported-db-row',
      'pull-face-pull': 'cable-face-pull',
      'pull-curl': 'cable-curl',
      'pull-hammer': 'db-hammer-curl',
      'pull-lateral': 'db-lateral-raise',
      'pull-abs': 'trx-body-saw',
      'lower-b-deadlift': 'smith-deadlift',
      'lower-b-leg-press': 'leg-press',
      'lower-b-bss': 'db-bulgarian-split-squat',
      'lower-b-leg-ext': 'machine-leg-extension',
      'lower-b-calves': 'leg-press-calf-press',
      'upper-b-ohp': 'machine-shoulder-press',
      'upper-b-dips': 'close-grip-smith-press',
      'upper-b-wide-row': 'chest-supported-wide-row',
      'upper-b-fly': 'cable-fly',
      'upper-b-lateral': 'db-lateral-raise',
      'upper-b-incline-curl': 'db-incline-curl',
      'upper-b-finisher': 'hanging-knee-raise',
    });
  });

  it('steers a beginner to the pulldown and an easier ab exercise', () => {
    const slots = pillarAt(office, 'beginner');
    expect(slots['pull-vertical-pull']).toBe('lat-pulldown');
    expect(slots['pull-abs']).toBe('plank');
  });

  it('uses the barbell versions in a gym that has a barbell and rack', () => {
    const slots = pillarAt(barbellGym);
    expect(slots['upper-a-incline']).toBe('barbell-incline-press');
    expect(slots['lower-a-squat']).toBe('barbell-back-squat');
    expect(slots['lower-b-deadlift']).toBe('barbell-deadlift');
    expect(slots['upper-b-ohp']).toBe('barbell-overhead-press');
    expect(slots['upper-b-dips']).toBe('dip');
    expect(slots['pull-curl']).toBe('barbell-curl');
  });
});

describe('resolving patterns', () => {
  it('falls back to a related movement when a pattern is impossible', () => {
    const tiny = createGymFromCatalog('Home', ['dumbbells-5-65', 'flat-bench']);
    expect(resolvePattern('leg-extension', tiny)?.pattern).toBe('single-leg');
    expect(resolvePattern('vertical-pull', tiny)?.id).toBe('single-arm-db-row');
    expect(resolvePattern('leg-curl', tiny)?.id).toBe('db-rdl');
  });

  it('moves exercises that load a painful area to the back of the line', () => {
    expect(resolvePattern('horizontal-press', office)?.id).toBe('db-bench-press');
    expect(resolvePattern('squat', office, { avoid: ['knee'] })?.id).toBe('smith-squat');
    expect(resolvePattern('hinge', office, { avoid: ['lower-back'] })?.id).toBe('cable-pull-through');
  });
});

describe('station taken', () => {
  it('offers swaps that do not need the busy machine', () => {
    const options = swapOptions('smith-incline-press', office).map((o) => o.exercise.id);
    expect(options[0]).toBe('db-incline-press');
    expect(options).not.toContain('smith-bench-press');
    expect(options).toContain('machine-chest-press');
  });

  it('when the leg press is taken, offers other quad work', () => {
    const options = swapOptions('leg-press', office).map((o) => o.exercise.id);
    expect(options).toContain('smith-squat');
    expect(options).not.toContain('leg-press-calf-press');
  });

  it('when the cable trainer is busy, never offers another cable exercise', () => {
    const options = swapOptions('cable-row', office).map((o) => o.exercise.id);
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((id) => id.startsWith('cable-'))).toBe(false);
  });
});

describe('starting loads', () => {
  it('converts conservatively between variations and lands on a real dumbbell', () => {
    // Smith incline estimated max 180 → dumbbells ≈ 72 per hand max → 8 reps, 2 left ≈ 54 → ×0.9 → 45.
    expect(convertStartLoad('smith-incline-press', 180, 'db-incline-press', office, { reps: 8, repsLeft: 2 })).toBe(45);
  });

  it('refuses to guess across different movements', () => {
    expect(convertStartLoad('smith-incline-press', 180, 'leg-press', office, { reps: 10, repsLeft: 2 })).toBeNull();
  });

  it('starts new lifters light, on a load the machine can make', () => {
    expect(startingLoad('leg-press', office, 'beginner')).toBe(80);
    expect(startingLoad('smith-squat', office, 'beginner')).toBe(35);
    expect(startingLoad('db-lateral-raise', office, 'intermediate')).toBe(10);
    expect(startingLoad('pull-up', office, 'intermediate')).toBeNull();
  });
});

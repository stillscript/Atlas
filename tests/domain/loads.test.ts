import { describe, expect, it } from 'vitest';
import { equipmentDefById } from '../../src/domain/catalog';
import { availableLoads, describeLoad, expandLoadSpec, nextStepFraction, snapLoad, stepLoad } from '../../src/domain/loads';
import { estimateMax, loadForReps, repsAtLoad } from '../../src/domain/strength';

const model = (id: string) => expandLoadSpec(equipmentDefById(id)!.load);

describe('Smith machine (35 lb bar, 45s and 25s)', () => {
  const smith = model('smith-machine');

  it('only offers loads you can actually make with pairs of 45s and 25s', () => {
    expect(availableLoads(smith).slice(0, 10)).toEqual([35, 85, 125, 135, 175, 185, 215, 225, 235, 265]);
  });

  it('explains the plates per side, using the fewest plates', () => {
    expect(describeLoad(smith, 135).detail).toBe('35 lb bar + 25 + 25 per side');
    expect(describeLoad(smith, 125).detail).toBe('35 lb bar + 45 per side');
    expect(describeLoad(smith, 175)).toEqual({ detail: '35 lb bar + 45 + 25 per side', platesPerSide: [45, 25] });
    expect(describeLoad(smith, 35).detail).toBe('Empty bar (35 lb)');
  });

  it('snaps an in-between target down, up or to the nearest real load', () => {
    expect(snapLoad(smith, 100, 'down')).toBe(85);
    expect(snapLoad(smith, 100, 'up')).toBe(125);
    expect(snapLoad(smith, 130, 'nearest')).toBe(125);
  });

  it('knows the first jumps are big, which favours adding reps first', () => {
    expect(nextStepFraction(smith, 35)).toBeCloseTo(1.43, 2);
    expect(nextStepFraction(smith, 225)).toBeCloseTo(0.04, 2);
  });
});

describe('selectorized stacks with add-on weights', () => {
  it('adds the 5 lb add-on to every pin on the Precor chest press', () => {
    const chest = model('precor-resolute-converging-chest-press');
    const loads = availableLoads(chest);
    expect(loads[0]).toBe(10);
    expect(loads).toContain(195);
    expect(loads[loads.length - 1]).toBe(245);
    expect(describeLoad(chest, 195).detail).toBe('Pin at 190 + 5 lb add-on');
    expect(describeLoad(chest, 190).detail).toBe('Pin at 190');
  });

  it('uses the 10 lb add-on on the leg press', () => {
    const legPress = model('precor-resolute-leg-press');
    expect(describeLoad(legPress, 190).detail).toBe('Pin at 180 + 10 lb add-on');
    expect(stepLoad(legPress, 180, 1)).toBe(190);
    expect(stepLoad(legPress, 190, 1)).toBe(200);
  });

  it('expands a 10–240 range into 24 pins', () => {
    const lat = model('precor-resolute-diverging-lat-pulldown');
    expect(lat.kind === 'stack' && lat.weights.length).toBe(24);
  });
});

describe('dumbbells 5–65 (2.5 lb steps to 22.5, then 5s)', () => {
  const dumbbells = model('dumbbells-5-65');

  it('never suggests a dumbbell that is not in the rack', () => {
    expect(snapLoad(dumbbells, 27.5, 'down')).toBe(25);
    expect(stepLoad(dumbbells, 22.5, 1)).toBe(25);
    expect(stepLoad(dumbbells, 25, 1)).toBe(30);
    expect(stepLoad(dumbbells, 65, 1)).toBe(65);
  });

  it('reports the jump size so small muscles can progress by reps instead', () => {
    expect(nextStepFraction(dumbbells, 20)).toBeCloseTo(0.125, 3);
    expect(nextStepFraction(dumbbells, 25)).toBeCloseTo(0.2, 3);
  });

  it('describes per-hand and single-dumbbell loads', () => {
    expect(describeLoad(dumbbells, 25, 'per-hand').detail).toBe('A pair of 25s');
    expect(describeLoad(dumbbells, 35, 'total').detail).toBe('One 35 lb dumbbell');
  });
});

describe('other load models', () => {
  it('bands are levels', () => {
    const bands = model('loop-bands');
    expect(availableLoads(bands)).toEqual([0, 1, 2, 3]);
    expect(describeLoad(bands, 2).detail).toBe('Heavy');
  });

  it('bodyweight and cardio', () => {
    expect(availableLoads(model('pull-up-bar'))).toEqual([0]);
    expect(describeLoad(model('pull-up-bar'), 0).detail).toBe('Bodyweight');
    expect(availableLoads(model('concept2-skierg'))).toEqual([]);
    expect(snapLoad(model('concept2-skierg'), 50)).toBeNull();
  });
});

describe('strength estimates', () => {
  it('treats reps left in the tank as reps you could have done', () => {
    expect(estimateMax(100, 8, 2)).toBeCloseTo(133.33, 2);
    expect(estimateMax(100, 10, 0)).toBeCloseTo(estimateMax(100, 8, 2), 6);
  });

  it('inverts cleanly', () => {
    const max = estimateMax(185, 6, 2);
    expect(loadForReps(max, 6, 2)).toBeCloseTo(185, 6);
    expect(repsAtLoad(max, 185, 2)).toBeCloseTo(6, 6);
  });

  it('is zero for empty sets', () => {
    expect(estimateMax(0, 10)).toBe(0);
    expect(estimateMax(100, 0)).toBe(0);
  });
});

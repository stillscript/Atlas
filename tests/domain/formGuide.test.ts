import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../src/domain/catalog';
import { cueSpot, cueSpots, spreadPoints } from '../../src/domain/formGuide';

describe('cue spots', () => {
  it('points each cue at the first body part it names', () => {
    expect(cueSpot('Push your hips straight back; the bar slides down your thighs.')).toBe('hip');
    expect(cueSpot('Sit down between your knees, knees tracking over your toes.')).toBe('knee');
    expect(cueSpot('Drive the floor away through your whole foot.')).toBe('ankle');
    expect(cueSpot('Big breath into your belly and brace.')).toBe('core');
    expect(cueSpot('Pull your shoulder blades back and down.')).toBe('shoulder');
    expect(cueSpot('Tuck your chin and keep your ribs down.')).toBe('head');
    expect(cueSpot('Elbows at about 45° from your sides.')).toBe('elbow');
    expect(cueSpot('Lower slowly, about three seconds.')).toBeNull();
  });

  it('limits the markers to three per exercise', () => {
    expect(cueSpots(['Knees out.', 'Hips back.', 'Chest up.', 'Feet flat.']).filter(Boolean)).toHaveLength(3);
  });

  it('gives most exercises at least one marker', () => {
    const marked = EXERCISES.filter((e) => e.kind !== 'cardio' && cueSpots(e.form.cues).some(Boolean));
    expect(marked.length / EXERCISES.filter((e) => e.kind !== 'cardio').length).toBeGreaterThan(0.85);
  });
});

describe('marker spreading', () => {
  it('pushes overlapping markers apart and leaves spaced ones alone', () => {
    const gap = 5;
    const out = spreadPoints([[0, 0], [1, 0], [0.5, 0.5]], gap);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) expect(Math.hypot(out[i]![0] - out[j]![0], out[i]![1] - out[j]![1])).toBeGreaterThan(gap - 0.3);
    expect(spreadPoints([[0, 0], [10, 0]], gap)).toEqual([[0, 0], [10, 0]]);
    const same = spreadPoints([[2, 2], [2, 2]], gap);
    expect(same[1]![0] - same[0]![0]).toBeCloseTo(gap);
  });
});

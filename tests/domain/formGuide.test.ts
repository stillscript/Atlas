import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../src/domain/catalog';
import { cueSpot, cueSpots } from '../../src/domain/formGuide';

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

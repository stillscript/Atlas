import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../src/domain/catalog';
import { BODY, joints, shapes, viewBox } from '../../src/domain/figure';
import { hasPictogram, pictogramFor } from '../../src/domain/pictograms';
import data from '../../src/data/pictograms.json';

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('figure', () => {
  it('standing upright, the head is on top and the feet at the bottom', () => {
    const j = joints({ torso: 180, arm: [0, 0], leg: [0, 0] });
    expect(j.shoulder).toEqual([0, -BODY.torso]);
    expect(j.ankle[1]).toBeCloseTo(BODY.thigh + BODY.shin);
    expect(j.head[1]).toBeLessThan(j.shoulder[1]);
    expect(j.toe[0]).toBeGreaterThan(j.ankle[0]); // facing right
  });

  it('keeps bone lengths in every pose', () => {
    const j = joints({ torso: 123, arm: [47, 211], leg: [301, 17] });
    expect(dist(j.hip, j.shoulder)).toBeCloseTo(BODY.torso, 1);
    expect(dist(j.shoulder, j.elbow)).toBeCloseTo(BODY.upperArm, 1);
    expect(dist(j.elbow, j.hand)).toBeCloseTo(BODY.forearm, 1);
    expect(dist(j.hip, j.knee)).toBeCloseTo(BODY.thigh, 1);
    expect(dist(j.knee, j.ankle)).toBeCloseTo(BODY.shin, 1);
  });

  it('frames every shape in a square box', () => {
    const [x, y, w, h] = viewBox(shapes({ torso: 270, arm: [180, 180], leg: [90, 0] }, [{ plate: 'hand' }]));
    expect(w).toBe(h);
    expect(x).toBeLessThan(-9);
    expect(y).toBeLessThan(-10.8 - 3.4);
  });
});

describe('exercise pictograms', () => {
  it.each(EXERCISES.map((e) => [e.id] as const))('%s has a complete pictogram', (id) => {
    expect(hasPictogram(id)).toBe(true);
    const art = pictogramFor(id)!;
    expect(art, 'resolves').not.toBeNull();
    for (const s of shapes(art.pose, art.props)) for (const p of s.points ?? [s.center!]) expect(p.every(Number.isFinite)).toBe(true);
  });

  it('has no entries for exercises that do not exist', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const id of Object.keys(data)) if (!id.startsWith('_')) expect(ids.has(id), id).toBe(true);
  });
});

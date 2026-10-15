import { describe, expect, it } from 'vitest';
import {
  BLUEPRINTS,
  EQUIPMENT,
  EXERCISES,
  GYM_PRESETS,
  PATTERNS,
  PROGRAMMING,
  TEMPLATES,
  exerciseById,
  patternById,
} from '../../src/domain/catalog';
import { availableLoads, expandLoadSpec } from '../../src/domain/loads';
import type { MuscleId } from '../../src/domain/types';

const MUSCLES: MuscleId[] = [
  'chest', 'back', 'front-delts', 'side-delts', 'rear-delts', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'abs', 'lower-back',
];
const PROVIDED = new Set(EQUIPMENT.flatMap((e) => e.provides));

function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

describe('equipment catalog', () => {
  it('has unique ids', () => expect(duplicates(EQUIPMENT.map((e) => e.id))).toEqual([]));

  it('every load spec expands to usable loads', () => {
    for (const item of EQUIPMENT) {
      const model = expandLoadSpec(item.load);
      if (model.kind !== 'none') expect(availableLoads(model).length, item.id).toBeGreaterThan(0);
    }
  });

  it('cardio machines say what they measure', () => {
    for (const item of EQUIPMENT.filter((e) => e.category === 'cardio')) {
      expect(item.cardioMetrics?.length, item.id).toBeGreaterThan(0);
    }
  });

  it('the Office preset only uses known equipment', () => {
    for (const preset of GYM_PRESETS) {
      for (const entry of preset.equipment) expect(EQUIPMENT.some((e) => e.id === entry.catalogId), entry.catalogId).toBe(true);
    }
  });
});

describe('exercise catalog', () => {
  it('has unique ids and names', () => {
    expect(duplicates(EXERCISES.map((e) => e.id))).toEqual([]);
    expect(duplicates(EXERCISES.map((e) => e.name.toLowerCase()))).toEqual([]);
  });

  it.each(EXERCISES.map((e) => [e.id, e] as const))('%s is complete and consistent', (_id, exercise) => {
    expect(patternById(exercise.pattern), 'pattern').toBeDefined();
    for (const muscle of [...exercise.primary, ...exercise.secondary]) expect(MUSCLES).toContain(muscle);
    if (exercise.kind !== 'cardio') expect(exercise.primary.length, 'primary muscles').toBeGreaterThan(0);
    for (const tag of exercise.requires) expect(PROVIDED.has(tag), `equipment provides "${tag}"`).toBe(true);
    if (exercise.loadFrom) {
      expect(exercise.requires, 'loadFrom is one of the requirements').toContain(exercise.loadFrom);
      expect(['total', 'per-hand', 'per-side']).toContain(exercise.loadMode);
      expect(exercise.start, 'starting guesses').toBeDefined();
    } else {
      expect(['bodyweight', 'none']).toContain(exercise.loadMode);
    }
    if (exercise.loadMode === 'per-side') expect(exercise.requires).toContain('cable-dual');

    const { setup, cues, watch } = exercise.form;
    expect(setup.length, 'setup').toBeGreaterThan(20);
    expect(cues.length, 'cues').toBeGreaterThanOrEqual(2);
    expect(watch.length, 'watch for').toBeGreaterThanOrEqual(1);
    for (const line of [setup, ...cues, ...watch]) {
      expect(line.trim(), 'no stray spaces').toBe(line);
      expect(line, 'ends like a sentence').toMatch(/[.:]$/);
    }
  });

  it('every pattern has at least one exercise that needs no special equipment or a common one', () => {
    for (const pattern of PATTERNS) expect(EXERCISES.some((e) => e.pattern === pattern.id), pattern.id).toBe(true);
  });

  it('pattern fallbacks point at real patterns', () => {
    for (const pattern of PATTERNS) for (const id of pattern.fallbacks) expect(patternById(id), `${pattern.id} → ${id}`).toBeDefined();
  });
});

describe('templates and blueprints', () => {
  it('Pillar slots reference real patterns and exercises from the same pattern', () => {
    for (const template of TEMPLATES) {
      const dayIds = template.days.map((d) => d.id);
      expect(template.schedule).toHaveLength(7);
      for (const id of template.schedule) if (id) expect(dayIds).toContain(id);
      expect(template.schedule.filter(Boolean)).toHaveLength(template.daysPerWeek);
      for (const day of template.days) {
        expect(duplicates(day.slots.map((s) => s.id))).toEqual([]);
        for (const slot of day.slots) {
          expect(patternById(slot.pattern), slot.id).toBeDefined();
          expect(slot.reps[0]).toBeLessThanOrEqual(slot.reps[1]);
          for (const id of slot.prefer ?? []) expect(exerciseById(id)?.pattern, `${day.id}/${slot.id}: ${id}`).toBe(slot.pattern);
        }
        for (const extra of day.extras ?? []) for (const id of extra.prefer) expect(exerciseById(id), id).toBeDefined();
      }
    }
  });

  it('there is a blueprint for every 2–6 day week, with that many days', () => {
    expect(BLUEPRINTS.map((b) => b.daysPerWeek).sort()).toEqual([2, 3, 4, 5, 6]);
    for (const blueprint of BLUEPRINTS) {
      expect(blueprint.days).toHaveLength(blueprint.daysPerWeek);
      for (const day of blueprint.days) for (const slot of day.slots) expect(patternById(slot.pattern), slot.pattern).toBeDefined();
    }
  });

  it('programming bands are ordered', () => {
    for (const bands of Object.values(PROGRAMMING.volumeBands)) {
      expect(bands.major[0]).toBeLessThanOrEqual(bands.major[1]);
      expect(bands.minor[0]).toBeLessThanOrEqual(bands.minor[1]);
    }
  });
});

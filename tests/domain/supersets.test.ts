import { describe, expect, it } from 'vitest';
import type { Experience, Goal, ProgramDay } from '../../src/db/types';
import { requireExercise } from '../../src/domain/catalog';
import { estimateDayMinutes, generateProgram, pairAccessories } from '../../src/domain/generator';
import { createGymFromPreset, loadSourceFor } from '../../src/domain/gym';

const office = createGymFromPreset('office');

function slot(id: string, exerciseId: string, role: 'main' | 'secondary' | 'accessory', sets = 3) {
  return { id, exerciseId, role, sets, repsLow: 10, repsHigh: 15, rir: 1 };
}

const station = (exerciseId: string) => loadSourceFor(requireExercise(exerciseId), office)?.item.id;

describe('supersets for short sessions', () => {
  it('pairs accessories that share neither muscles nor a station, and keeps pairs adjacent', () => {
    const day: ProgramDay = {
      id: 'd',
      name: 'Day',
      slots: [
        slot('a', 'smith-squat', 'main'),
        slot('b', 'db-lateral-raise', 'accessory'),
        slot('c', 'db-curl', 'accessory'),
        slot('d', 'cable-pushdown', 'accessory'),
      ],
    };
    const before = estimateDayMinutes(day);
    expect(pairAccessories(day, office)).toBe(1);
    const ids = day.slots.map((s) => s.id);
    const paired = day.slots.filter((s) => s.superset);
    expect(paired).toHaveLength(2);
    expect(Math.abs(ids.indexOf(paired[0]!.id) - ids.indexOf(paired[1]!.id))).toBe(1);
    // Curls and laterals both need the dumbbell rack, so the pushdown (cable) pairs with one of them.
    expect(paired.map((s) => s.id)).toContain('d');
    expect(estimateDayMinutes(day)).toBeLessThan(before);
    expect(day.slots.find((s) => s.id === 'a')?.superset).toBeUndefined();
  });

  it('never pairs two exercises on the same physical machine', () => {
    const day: ProgramDay = {
      id: 'd',
      name: 'Day',
      slots: [slot('a', 'cable-fly', 'accessory'), slot('b', 'cable-overhead-extension', 'accessory')],
    };
    expect(pairAccessories(day, office)).toBe(0);
  });

  it('never pairs a heavy lift', () => {
    const day: ProgramDay = {
      id: 'd',
      name: 'Day',
      slots: [slot('a', 'smith-rdl', 'accessory'), slot('b', 'db-lateral-raise', 'accessory')],
    };
    expect(pairAccessories(day, office)).toBe(0);
  });

  it('every generated superset uses different muscles and different stations', () => {
    const goals: Goal[] = ['muscle', 'fat-loss', 'strength', 'general'];
    const levels: Experience[] = ['beginner', 'intermediate', 'advanced'];
    let pairsSeen = 0;
    for (const goal of goals) {
      for (const experience of levels) {
        for (const daysPerWeek of [2, 3, 4, 5, 6]) {
          for (const sessionMinutes of [30, 45, 60]) {
            const { program } = generateProgram({ goal, experience, daysPerWeek, sessionMinutes }, office, 0);
            for (const day of program.days) {
              const paired = day.slots.filter((s) => s.superset);
              for (const s of paired) {
                const partner = paired.find((p) => p.superset === s.superset && p !== s)!;
                expect(partner, `${day.id} ${s.id} has a partner`).toBeDefined();
                const [x, y] = [requireExercise(s.exerciseId), requireExercise(partner.exerciseId)];
                expect(x.primary.some((m) => y.primary.includes(m)), `${x.id} + ${y.id} share a muscle`).toBe(false);
                const sx = station(x.id);
                if (sx) expect(sx, `${x.id} + ${y.id} share a station`).not.toBe(station(y.id));
                pairsSeen++;
              }
            }
          }
        }
      }
    }
    expect(pairsSeen).toBeGreaterThan(0);
  });
});

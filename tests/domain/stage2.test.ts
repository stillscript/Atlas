import { describe, expect, it } from 'vitest';
import type { Program } from '../../src/db/types';
import { createGymFromPreset } from '../../src/domain/gym';
import { buildGym, buildProfile, buildProgram, keyLifts, type OnboardingAnswers } from '../../src/domain/onboarding';
import { backupReminderDue, snoozeUntil } from '../../src/domain/reminders';
import { blockPosition, nextSession, sessionOn, weekdayIndex } from '../../src/domain/schedule';
import { startSuggestion } from '../../src/domain/start';

const DAY = 86_400_000;
const office = createGymFromPreset('office');

const answers = (overrides: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  goal: 'muscle',
  experience: 'intermediate',
  trainingDays: [0, 2, 4],
  sessionMinutes: 60,
  gym: { kind: 'preset', presetId: 'office' },
  plan: 'auto',
  startingLoads: {},
  ...overrides,
});

describe('schedule', () => {
  const program = buildProgram(answers(), office).program;

  it('uses Monday as the first day of the week', () => {
    expect(weekdayIndex(new Date(2026, 9, 12))).toBe(0); // Monday 12 Oct 2026
    expect(weekdayIndex(new Date(2026, 9, 18))).toBe(6); // Sunday
  });

  it('finds today’s session and the next one', () => {
    const monday = new Date(2026, 9, 12, 9);
    expect(sessionOn(program, monday)?.id).toBe(program.schedule[0]);
    expect(sessionOn(program, new Date(2026, 9, 13))).toBeNull();
    const next = nextSession(program, monday);
    expect(next?.daysAway).toBe(2);
    expect(next?.day.id).toBe(program.schedule[2]);
  });

  it('counts block weeks, then a lighter week, then starts again', () => {
    const p: Program = { ...program, block: { startDate: '2026-10-12', lengthWeeks: 6 } };
    expect(blockPosition(p, new Date(2026, 9, 14))).toEqual({ week: 1, lengthWeeks: 6, lighterWeek: false, weeksToLighter: 6 });
    expect(blockPosition(p, new Date(2026, 10, 23)).week).toBe(7);
    expect(blockPosition(p, new Date(2026, 10, 23)).lighterWeek).toBe(true);
    expect(blockPosition(p, new Date(2026, 10, 30)).week).toBe(1);
  });
});

describe('onboarding answers', () => {
  it('builds a plan on the chosen days', () => {
    const built = buildProgram(answers({ trainingDays: [1, 3, 5] }), office);
    expect(built.program.schedule.map((d) => d !== null)).toEqual([false, true, false, true, false, true, false]);
  });

  it('moves Pillar onto the five days picked, in order', () => {
    const built = buildProgram(answers({ plan: 'pillar', trainingDays: [0, 1, 3, 4, 5] }), office);
    expect(built.program.schedule).toEqual(['upper-a', 'lower-a', null, 'pull', 'lower-b', 'upper-b', null]);
  });

  it('keeps Pillar on Mon–Fri when a different number of days was picked', () => {
    const built = buildProgram(answers({ plan: 'pillar', trainingDays: [0, 2, 4] }), office);
    expect(built.program.schedule).toEqual(['upper-a', 'lower-a', 'pull', 'lower-b', 'upper-b', null, null]);
  });

  it('builds a custom gym from the checklist', () => {
    const gym = buildGym({ gym: { kind: 'custom', name: '  ', equipment: ['dumbbells-5-100', 'flat-bench'] } });
    expect(gym.name).toBe('My gym');
    expect(gym.equipment.map((e) => e.catalogId)).toEqual(['dumbbells-5-100', 'flat-bench']);
  });

  it('the profile reflects the plan’s real schedule and drops empty weights', () => {
    const built = buildProgram(answers({ plan: 'pillar' }), office);
    const profile = buildProfile(
      answers({ plan: 'pillar', startingLoads: { 'smith-squat': { load: 135, reps: 8 }, 'leg-press': { load: 0, reps: 8 } } }),
      built.program,
    );
    expect(profile.daysPerWeek).toBe(5);
    expect(profile.trainingDays).toEqual([0, 1, 2, 3, 4]);
    expect(profile.startingLoads).toEqual({ 'smith-squat': { load: 135, reps: 8 } });
  });

  it('asks about each day’s main lift first', () => {
    const lifts = keyLifts(buildProgram(answers({ plan: 'pillar' }), office).program);
    expect(lifts.slice(0, 4)).toEqual(['smith-incline-press', 'smith-squat', 'smith-deadlift', 'machine-shoulder-press']);
    expect(lifts).not.toContain('pull-up');
    expect(lifts.length).toBeLessThanOrEqual(6);
  });
});

describe('first-session weights', () => {
  const program = buildProgram(answers({ plan: 'pillar' }), office).program;
  const squat = program.days.find((d) => d.id === 'lower-a')!.slots[0]!;

  it('converts a known set into a real Smith load for the slot’s reps', () => {
    // 135 × 8 with ~1 left is the same effort as 135 × 7 with 2 left: the slot's target.
    expect(startSuggestion(squat, office, { startingLoads: { 'smith-squat': { load: 135, reps: 8 } } }, 'intermediate')).toEqual({
      kind: 'known',
      load: 135,
    });
    // 150 × 8 → 7 reps at 2 left ≈ 150, which the Smith can't make (135, then 175): round down.
    expect(startSuggestion(squat, office, { startingLoads: { 'smith-squat': { load: 150, reps: 8 } } }, 'intermediate')).toEqual({
      kind: 'known',
      load: 135,
    });
  });

  it('falls back to a light calibration guess', () => {
    expect(startSuggestion(squat, office, {}, 'intermediate')).toEqual({ kind: 'calibrate', load: 85 });
    expect(startSuggestion(squat, office, {}, 'beginner')).toEqual({ kind: 'calibrate', load: 35 });
  });

  it('has nothing to suggest for bodyweight work', () => {
    const pull = program.days.find((d) => d.id === 'pull')!.slots[0]!;
    expect(startSuggestion(pull, office, {}, 'intermediate')).toEqual({ kind: 'none' });
  });
});

describe('backup reminder', () => {
  const now = Date.UTC(2026, 9, 14);
  const app = { createdAt: now - 40 * DAY };

  it('waits until there is a workout worth keeping', () => {
    expect(backupReminderDue(app, 0, now)).toBe(false);
    expect(backupReminderDue(app, 1, now)).toBe(true);
  });

  it('counts from the last backup and respects a snooze', () => {
    expect(backupReminderDue({ ...app, lastBackupAt: now - 10 * DAY }, 5, now)).toBe(false);
    expect(backupReminderDue({ ...app, lastBackupAt: now - 31 * DAY }, 5, now)).toBe(true);
    expect(backupReminderDue({ ...app, backupReminderSnoozedUntil: snoozeUntil(now) }, 5, now)).toBe(false);
    expect(backupReminderDue({ ...app, backupReminderSnoozedUntil: snoozeUntil(now) }, 5, now + 8 * DAY)).toBe(true);
  });
});

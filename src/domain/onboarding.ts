import type { Experience, Goal, Gym, Profile, Program, Sex } from '../db/types';
import { exerciseById } from './catalog';
import { generateProgram, programFromTemplate, type BuiltProgram } from './generator';
import { createGymFromCatalog, createGymFromPreset } from './gym';
import { addGluteFocus, applyLegStyle, LEG_STYLE_FOR } from './legStyle';

/** Everything the first-run questions collect. Pure data; turned into records by the functions below. */
export interface OnboardingAnswers {
  goal: Goal;
  experience: Experience;
  /** Training weekdays, 0 = Monday. Its length is the days per week. */
  trainingDays: number[];
  sessionMinutes: number;
  /** Sets the default leg exercises (machines for men, free weights with hip thrusts for women). */
  sex: Sex;
  gym: { kind: 'preset'; presetId: string } | { kind: 'custom'; name: string; equipment: string[] };
  plan: 'auto' | 'pillar';
  startingLoads: Record<string, { load: number; reps: number }>;
}

export function buildGym(answers: Pick<OnboardingAnswers, 'gym'>, now = Date.now()): Gym {
  return answers.gym.kind === 'preset'
    ? createGymFromPreset(answers.gym.presetId, now)
    : createGymFromCatalog(answers.gym.name.trim() || 'My gym', answers.gym.equipment, now);
}

/**
 * The plan for these answers, with the leg style that fits the answer to "Man / Woman / Rather not
 * say" (Plan settings can switch it later).
 */
export function buildProgram(answers: OnboardingAnswers, gym: Gym, now = Date.now()): BuiltProgram {
  const built = buildBaseProgram(answers, gym, now);
  const ctx = { gym, experience: answers.experience };
  const style = LEG_STYLE_FOR[answers.sex];
  let program = answers.sex === 'female' ? addGluteFocus(built.program, ctx) : built.program;
  program = applyLegStyle(program, style, ctx, now);
  return { ...built, program };
}

/**
 * Pillar keeps its own five days; if the user picked exactly five training days, Pillar's sessions
 * move onto those days in order.
 */
function buildBaseProgram(answers: OnboardingAnswers, gym: Gym, now: number): BuiltProgram {
  const days = [...answers.trainingDays].sort((a, b) => a - b);
  if (answers.plan === 'pillar') {
    const built = programFromTemplate('pillar', gym, { experience: answers.experience, goal: answers.goal, now });
    const order = built.program.schedule.filter((id): id is string => id !== null);
    if (days.length === order.length) {
      const schedule: (string | null)[] = Array(7).fill(null);
      days.forEach((weekday, i) => (schedule[weekday] = order[i] ?? null));
      built.program.schedule = schedule;
    }
    return built;
  }
  return generateProgram(
    {
      goal: answers.goal,
      experience: answers.experience,
      daysPerWeek: days.length,
      sessionMinutes: answers.sessionMinutes,
      trainingDays: days,
    },
    gym,
    now,
  );
}

export function buildProfile(answers: OnboardingAnswers, program: Program, now = Date.now()): Profile {
  const trainingDays = program.schedule.flatMap((id, weekday) => (id ? [weekday] : []));
  const startingLoads = Object.fromEntries(
    Object.entries(answers.startingLoads).filter(([, v]) => v.load > 0 && v.reps > 0),
  );
  return {
    goal: answers.goal,
    experience: answers.experience,
    daysPerWeek: trainingDays.length,
    trainingDays,
    sessionMinutes: answers.sessionMinutes,
    sex: answers.sex,
    startingLoads: Object.keys(startingLoads).length ? startingLoads : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The lifts worth asking about at setup: each day's main lift (and the first secondary lift when a
 * plan has few main lifts), loaded lifts only, in schedule order, at most six.
 */
export function keyLifts(program: Program, limit = 6): string[] {
  const ids: string[] = [];
  const add = (id: string) => {
    const exercise = exerciseById(id);
    if (exercise?.loadFrom && !ids.includes(id)) ids.push(id);
  };
  const scheduled = program.schedule
    .filter((id): id is string => id !== null)
    .map((id) => program.days.find((d) => d.id === id))
    .filter((d) => d !== undefined);
  for (const day of scheduled) for (const slot of day.slots) if (slot.role === 'main') add(slot.exerciseId);
  for (const day of scheduled) {
    const secondary = day.slots.find((s) => s.role === 'secondary');
    if (secondary && ids.length < limit) add(secondary.exerciseId);
  }
  return ids.slice(0, limit);
}

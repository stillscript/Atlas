import type { Experience, Goal, Gym, ISODate, Program, ProgramDay, ProgramExtra, ProgramSlot, SlotRole } from '../db/types';
import { newId } from '../lib/ids';
import { toISODate } from '../lib/format';
import { BLUEPRINTS, PROGRAMMING, exerciseById, patternById, requireExercise, templateById } from './catalog';
import { canDoExercise, gymTags, loadSourceFor } from './gym';
import { candidatesForPattern, resolvePattern } from './resolver';
import type { ExerciseDef, MuscleId } from './types';
import { muscleName, volumeBand, weeklyFrequency, weeklySets } from './volume';

/**
 * Builds programs from the gym's real equipment.
 *
 * - `programFromTemplate`: a fixed plan (e.g. Pillar). Sets and reps come from the template;
 *   each movement slot becomes the best exercise this gym can do.
 * - `generateProgram`: a plan from onboarding answers. Picks a split for the days per week, fills
 *   it with exercises from this gym, prescribes sets/reps/effort/rest for the goal and experience,
 *   trims to fit the session length, then balances weekly sets per muscle.
 *
 * Pure functions: no database, no clock except the `now` passed in.
 */

export interface GenerateInput {
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  sessionMinutes: number;
  /** Preferred weekdays, 0 = Monday. */
  trainingDays?: number[];
}

export interface ProgramReport {
  minutesByDay: Record<string, number>;
  weeklySets: Partial<Record<MuscleId, number>>;
  frequency: Partial<Record<MuscleId, number>>;
  /** Plain-language notes about trade-offs (e.g. a muscle below its weekly target). */
  notes: string[];
}

export interface BuiltProgram {
  program: Program;
  report: ProgramReport;
}

const MIN_SLOTS_PER_DAY = 3;
const EXTRA_MINUTES = 10;

// ---------------------------------------------------------------- prescriptions

type RepKey = 'main' | 'secondary' | 'accessory' | 'small';

function repKey(role: SlotRole, exercise: ExerciseDef): RepKey {
  if (exercise.kind !== 'compound' && role !== 'accessory') return exercise.restClass === 'small' ? 'small' : 'accessory';
  if (role === 'accessory') return exercise.restClass === 'small' ? 'small' : 'accessory';
  return role;
}

export function targetRir(goal: Goal, experience: Experience, exercise: ExerciseDef): number {
  const isCompound = exercise.kind === 'compound';
  const base = PROGRAMMING.rir[goal][isCompound ? 'compound' : 'isolation'];
  const bonus = experience === 'beginner' && isCompound ? PROGRAMMING.beginnerRirBonus : 0;
  return Math.min(3, base + bonus);
}

export function restSeconds(goal: Goal, role: SlotRole, exercise: ExerciseDef): number {
  if (goal === 'strength' && role === 'main' && exercise.kind === 'compound') return PROGRAMMING.strengthMainRest;
  return PROGRAMMING.rest[exercise.restClass];
}

function prescribe(role: SlotRole, exercise: ExerciseDef, goal: Goal, experience: Experience) {
  const table = experience === 'beginner' ? PROGRAMMING.beginnerReps[goal] : PROGRAMMING.reps[goal];
  let [repsLow, repsHigh] = table[repKey(role, exercise)];
  if (exercise.metric === 'time') [repsLow, repsHigh] = [30, 45]; // seconds
  let sets = PROGRAMMING.sets[experience][role];
  if (goal === 'strength' && role === 'main' && experience !== 'beginner') sets = PROGRAMMING.strengthMainSets;
  return { sets, repsLow, repsHigh, rir: targetRir(goal, experience, exercise), restSec: restSeconds(goal, role, exercise) };
}

// ---------------------------------------------------------------- time estimates

function workSeconds(slot: ProgramSlot): number {
  const exercise = exerciseById(slot.exerciseId);
  if (!exercise) return 0;
  const { timing } = PROGRAMMING;
  const work =
    exercise.metric === 'time'
      ? timing.timedSetSec
      : exercise.kind === 'compound'
        ? timing.workSec.compound
        : exercise.kind === 'conditioning'
          ? timing.workSec.conditioning
          : timing.workSec.isolation;
  return work * (exercise.unilateral ? 2 : 1);
}

function restOf(slot: ProgramSlot): number {
  const exercise = exerciseById(slot.exerciseId);
  return slot.restSec ?? (exercise ? PROGRAMMING.rest[exercise.restClass] : 0);
}

export function estimateSlotSeconds(slot: ProgramSlot): number {
  const exercise = exerciseById(slot.exerciseId);
  if (!exercise) return 0;
  const { timing } = PROGRAMMING;
  const warmup = slot.role === 'main' && exercise.kind === 'compound' ? timing.mainLiftWarmupMin * 60 : 0;
  return slot.sets * workSeconds(slot) + Math.max(0, slot.sets - 1) * restOf(slot) + timing.transitionSec + warmup;
}

/** Two exercises done back to back: one rest per round instead of two. */
function estimateSupersetSeconds(a: ProgramSlot, b: ProgramSlot): number {
  const { timing } = PROGRAMMING;
  const rounds = Math.max(a.sets, b.sets);
  const work = a.sets * workSeconds(a) + b.sets * workSeconds(b) + rounds * timing.supersetSwitchSec;
  return work + Math.max(0, rounds - 1) * Math.max(restOf(a), restOf(b)) + timing.transitionSec * 1.5;
}

export function estimateDayMinutes(day: ProgramDay): number {
  let seconds = 0;
  for (let i = 0; i < day.slots.length; i++) {
    const slot = day.slots[i]!;
    const next = day.slots[i + 1];
    if (slot.superset && next?.superset === slot.superset) {
      seconds += estimateSupersetSeconds(slot, next);
      i++;
    } else {
      seconds += estimateSlotSeconds(slot);
    }
  }
  return Math.round(PROGRAMMING.timing.warmupMin + seconds / 60 + (day.extras?.length ?? 0) * EXTRA_MINUTES);
}

/**
 * Pairs accessory exercises into supersets (approved rule G2; Iversen et al. 2021): only
 * accessories, only exercises that train different muscles on different equipment, so neither
 * half tires the other or needs the same station. Pairs are made from the least important end.
 */
export function pairAccessories(day: ProgramDay, gym: Gym, options: { includeSecondary?: boolean } = {}): number {
  // The physical station an exercise needs (two cable exercises on one FTS can't be supersetted).
  const stationOf = (exercise: ExerciseDef) => loadSourceFor(exercise, gym)?.item.id;
  // Heavy lifts (Smith squats, deadlifts…) always get their full rest; everything else can pair
  // up when time is short, secondary lifts only when it's very short.
  const isCandidate = (slot: ProgramSlot) =>
    !slot.superset &&
    requireExercise(slot.exerciseId).restClass !== 'heavy' &&
    (slot.role === 'accessory' || (options.includeSecondary === true && slot.role === 'secondary'));
  let pairs = 0;
  for (let i = day.slots.length - 1; i >= 0; i--) {
    const a = day.slots[i]!;
    if (!isCandidate(a)) continue;
    const exA = requireExercise(a.exerciseId);
    for (let j = i - 1; j >= 0; j--) {
      const b = day.slots[j]!;
      if (!isCandidate(b)) continue;
      const exB = requireExercise(b.exerciseId);
      const sharesMuscle = exA.primary.some((m) => exB.primary.includes(m));
      const station = stationOf(exA);
      const sharesStation = station !== undefined && station === stationOf(exB);
      if (sharesMuscle || sharesStation) continue;
      const id = `${day.id}-ss-${b.id}`;
      pairs++;
      b.superset = id;
      a.superset = id;
      // Keep the pair next to each other, at the position of the more important one.
      day.slots.splice(i, 1);
      day.slots.splice(j + 1, 0, a);
      break;
    }
  }
  return pairs;
}

/** Fits a day into the time budget: supersets first, then fewer exercises, then fewer sets. */
function fitDay(day: ProgramDay, gym: Gym, budget: number): void {
  if (estimateDayMinutes(day) > budget) pairAccessories(day, gym);
  if (estimateDayMinutes(day) > budget && budget <= 45) pairAccessories(day, gym, { includeSecondary: true });
  while (estimateDayMinutes(day) > budget && day.slots.length > MIN_SLOTS_PER_DAY) {
    const removed = day.slots.pop()!;
    if (removed.superset) {
      for (const slot of day.slots) if (slot.superset === removed.superset) delete slot.superset;
    }
  }
  while (estimateDayMinutes(day) > budget) {
    const trimmable = [...day.slots].reverse().find((s) => s.sets > 2);
    if (!trimmable) break;
    trimmable.sets -= 1;
  }
  // Number supersets in the order they appear: day-ss1, day-ss2…
  const names = new Map<string, string>();
  for (const slot of day.slots) {
    if (!slot.superset) continue;
    if (!names.has(slot.superset)) names.set(slot.superset, `${day.id}-ss${names.size + 1}`);
    slot.superset = names.get(slot.superset);
  }
}

// ---------------------------------------------------------------- shared helpers

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function buildSchedule(dayIds: string[], trainingDays: number[] | undefined): (string | null)[] {
  const fallback = PROGRAMMING.defaultTrainingDays[String(dayIds.length)] ?? dayIds.map((_, i) => i);
  const valid =
    trainingDays &&
    trainingDays.length === dayIds.length &&
    new Set(trainingDays).size === trainingDays.length &&
    trainingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const days = [...(valid ? trainingDays : fallback)].sort((a, b) => a - b);
  const schedule: (string | null)[] = Array(7).fill(null);
  days.forEach((weekday, i) => {
    schedule[weekday] = dayIds[i] ?? null;
  });
  return schedule;
}

function report(program: Program, experience: Experience, extraNotes: string[] = []): ProgramReport {
  const sets = weeklySets(program);
  const frequency = weeklyFrequency(program);
  const notes = [...extraNotes];
  const under = (muscle: MuscleId) => {
    const band = volumeBand(muscle, experience);
    return band !== null && (sets.get(muscle) ?? 0) < band[0];
  };
  for (const muscle of PROGRAMMING.majorMuscles.filter(under)) {
    const [min, max] = volumeBand(muscle, experience)!;
    const value = Math.round((sets.get(muscle) ?? 0) * 10) / 10;
    notes.push(`${muscleName(muscle)}: ${value} sets a week (${min}–${max} builds muscle best).`);
  }
  const smallUnder = PROGRAMMING.minorMuscles.filter(under).map((m) => muscleName(m).toLowerCase());
  if (smallUnder.length) {
    const list = smallUnder.length > 1 ? `${smallUnder.slice(0, -1).join(', ')} and ${smallUnder.at(-1)}` : smallUnder[0];
    notes.push(`Smaller muscles (${list}) get mostly indirect work at this length.`);
  }
  return {
    minutesByDay: Object.fromEntries(program.days.map((d) => [d.id, estimateDayMinutes(d)])),
    weeklySets: Object.fromEntries([...sets].map(([m, v]) => [m, Math.round(v * 10) / 10])),
    frequency: Object.fromEntries(frequency),
    notes,
  };
}

function resolveExtras(prefer: string[], gym: Gym): string | null {
  const tags = gymTags(gym);
  for (const id of prefer) {
    const exercise = exerciseById(id);
    if (exercise && canDoExercise(exercise, tags)) return exercise.id;
  }
  const first = exerciseById(prefer[0] ?? '');
  return first ? (resolvePattern(first.pattern, gym)?.id ?? null) : null;
}

// ---------------------------------------------------------------- templates

export function programFromTemplate(
  templateId: string,
  gym: Gym,
  options: { experience: Experience; goal?: Goal; now?: number; startDate?: ISODate },
): BuiltProgram {
  const template = templateById(templateId);
  if (!template) throw new Error(`Unknown template "${templateId}"`);
  const goal = options.goal && template.goals.includes(options.goal) ? options.goal : template.goals[0]!;
  const now = options.now ?? Date.now();
  const notes: string[] = [];

  const days: ProgramDay[] = template.days.map((dayDef) => {
    const usedToday = new Set<string>();
    const slots: ProgramSlot[] = [];
    dayDef.slots.forEach((slotDef, index) => {
      const exercise = resolvePattern(slotDef.pattern, gym, {
        prefer: slotDef.prefer,
        exclude: usedToday,
        experience: options.experience,
      });
      if (!exercise) {
        notes.push(`${dayDef.name}: nothing in this gym covers ${patternById(slotDef.pattern)?.name ?? slotDef.pattern}, so it's left out.`);
        return;
      }
      usedToday.add(exercise.id);
      slots.push({
        id: `${dayDef.id}-${slotDef.id}`,
        pattern: slotDef.pattern,
        exerciseId: exercise.id,
        role: slotDef.role,
        sets: slotDef.sets,
        repsLow: exercise.metric === 'time' ? 30 : slotDef.reps[0],
        repsHigh: exercise.metric === 'time' ? 45 : slotDef.reps[1],
        rir: slotDef.rir ?? targetRir(goal, options.experience, exercise),
        restSec: restSeconds(goal, slotDef.role, exercise),
        priority: index + 1,
        purpose: slotDef.purpose,
      });
    });
    const extras: ProgramExtra[] = [];
    for (const extraDef of dayDef.extras ?? []) {
      const exerciseId = resolveExtras(extraDef.prefer, gym);
      if (exerciseId) extras.push({ id: `${dayDef.id}-${extraDef.id}`, exerciseId, label: extraDef.label, detail: extraDef.detail });
    }
    return { id: dayDef.id, name: dayDef.name, subtitle: dayDef.subtitle, slots, extras: extras.length ? extras : undefined };
  });

  const program: Program = {
    id: newId('prg'),
    name: template.name,
    templateId: template.id,
    gymId: gym.id,
    goal,
    days,
    schedule: [...template.schedule],
    block: { startDate: options.startDate ?? toISODate(mondayOf(new Date(now))), lengthWeeks: template.blockWeeks },
    createdAt: now,
    updatedAt: now,
  };
  return { program, report: report(program, options.experience, notes) };
}

// ---------------------------------------------------------------- generated programs

const GOAL_NAMES: Record<Goal, string> = {
  muscle: 'Build muscle',
  'fat-loss': 'Lose fat, keep muscle',
  strength: 'Get stronger',
  general: 'General fitness',
};

/** Picks a variation for a pattern's repeat appearance in the week, if it's nearly as good. */
function pickExercise(pattern: string, gym: Gym, experience: Experience, usage: number, exclude: Set<string>): ExerciseDef | null {
  const best = resolvePattern(pattern, gym, { experience, exclude });
  if (!best || usage === 0 || best.pattern !== pattern) return best;
  const candidates = candidatesForPattern(pattern, gym, { experience, exclude }).filter((e) => e.rank >= best.rank - 25);
  return candidates[usage % candidates.length] ?? best;
}

export function generateProgram(input: GenerateInput, gym: Gym, now = Date.now()): BuiltProgram {
  const daysPerWeek = Math.min(6, Math.max(2, Math.round(input.daysPerWeek)));
  const blueprint = BLUEPRINTS.find((b) => b.daysPerWeek === daysPerWeek);
  if (!blueprint) throw new Error(`No blueprint for ${daysPerWeek} days`);
  const { goal, experience } = input;
  const budget = Math.max(20, input.sessionMinutes);
  const usage = new Map<string, number>();
  const notes: string[] = [];

  const days: ProgramDay[] = blueprint.days.map((dayDef) => {
    const usedToday = new Set<string>();
    const slots: ProgramSlot[] = [];
    dayDef.slots.forEach((slotDef, index) => {
      const exercise = pickExercise(slotDef.pattern, gym, experience, usage.get(slotDef.pattern) ?? 0, usedToday);
      if (!exercise) return;
      usage.set(slotDef.pattern, (usage.get(slotDef.pattern) ?? 0) + 1);
      usedToday.add(exercise.id);
      slots.push({
        id: `${dayDef.id}-${index + 1}`,
        pattern: exercise.pattern,
        exerciseId: exercise.id,
        role: slotDef.role,
        priority: index + 1,
        purpose: slotDef.purpose,
        ...prescribe(slotDef.role, exercise, goal, experience),
      });
    });
    const day: ProgramDay = { id: dayDef.id, name: dayDef.name, subtitle: dayDef.subtitle, slots };
    fitDay(day, gym, budget);
    return day;
  });

  const program: Program = {
    id: newId('prg'),
    name: blueprint.name,
    gymId: gym.id,
    goal,
    days,
    schedule: buildSchedule(
      days.map((d) => d.id),
      input.trainingDays,
    ),
    block: { startDate: toISODate(mondayOf(new Date(now))), lengthWeeks: PROGRAMMING.blockWeeks[experience] },
    createdAt: now,
    updatedAt: now,
  };

  balanceVolume(program, experience, budget);
  if (goal === 'fat-loss') addCardioFinishers(program, gym, budget);
  return { program, report: report(program, experience, notes) };
}

/**
 * Nudges accessory sets so each tracked muscle lands inside its weekly band where time allows:
 * adds sets to accessories for muscles under the band, removes them for muscles over it.
 * Main and secondary lifts are never changed here.
 */
function balanceVolume(program: Program, experience: Experience, budgetMinutes: number): void {
  const muscles = [...PROGRAMMING.majorMuscles, ...PROGRAMMING.minorMuscles];
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    const sets = weeklySets(program);
    for (const muscle of muscles) {
      const band = volumeBand(muscle, experience);
      if (!band) continue;
      const value = sets.get(muscle) ?? 0;
      const targeting = (role: SlotRole) =>
        program.days.flatMap((day) =>
          day.slots
            .filter((slot) => slot.role === role && requireExercise(slot.exerciseId).primary.includes(muscle))
            .map((slot) => ({ day, slot })),
        );
      const candidates = targeting('accessory');
      if (value < band[0]) {
        // Accessories first; a secondary lift only takes an extra set when no accessory has room.
        const byFewestSets = (list: ReturnType<typeof targeting>) =>
          list.filter(({ slot }) => slot.sets < PROGRAMMING.maxSetsPerSlot).sort((a, b) => a.slot.sets - b.slot.sets);
        const pick = [...byFewestSets(candidates), ...byFewestSets(targeting('secondary'))]
          .find(({ day, slot }) => {
            slot.sets += 1;
            const fits = estimateDayMinutes(day) <= budgetMinutes;
            slot.sets -= 1;
            return fits;
          });
        if (pick) {
          pick.slot.sets += 1;
          changed = true;
        }
      } else if (value > band[1]) {
        const pick = candidates.filter(({ slot }) => slot.sets > 2).sort((a, b) => b.slot.sets - a.slot.sets)[0];
        if (pick) {
          pick.slot.sets -= 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/** For fat loss, a 10-minute easy cardio finisher on days that have room for it. */
function addCardioFinishers(program: Program, gym: Gym, budgetMinutes: number): void {
  const cardio = resolvePattern('cardio', gym);
  if (!cardio) return;
  let added = 0;
  for (const day of program.days) {
    if (added >= 3) break;
    if (estimateDayMinutes(day) + EXTRA_MINUTES > budgetMinutes) continue;
    day.extras = [
      ...(day.extras ?? []),
      { id: `${day.id}-cardio`, exerciseId: cardio.id, label: '10 minutes easy cardio', detail: 'Conversational pace' },
    ];
    added++;
  }
}

export function goalName(goal: Goal): string {
  return GOAL_NAMES[goal];
}

import type {
  CardioEntry,
  CheckOut,
  ExerciseEntry,
  Gym,
  Profile,
  Program,
  ProgramDay,
  ProgramSlot,
  ReadinessCheck,
  RepsInReserve,
  Session,
  SetLog,
  SuggestionReason,
} from '../db/types';
import type { SessionPlan, SlotPlan } from '../coach/types';
import { toISODate } from '../lib/format';
import { newId } from '../lib/ids';
import { PROGRAMMING, requireExercise } from './catalog';
import { loadSourceFor } from './gym';
import { snapLoad, stepLoad } from './loads';
import { convertStartLoad } from './resolver';
import { startSuggestion } from './start';
import { estimateMax } from './strength';
import type { ExerciseDef } from './types';

/**
 * The workout engine: pure functions that take a session and return the next session. The UI
 * calls these, then saves the result, so every tap is persisted and a reopened app resumes exactly
 * where it was. No clock reads: `now` is always passed in.
 *
 * Progression between sessions (adding weight, deloads, plateaus) is the Coach's job (stage 4).
 * Here, a lift with history starts at last time's working weight, and a first-time lift is
 * calibrated set by set from effort ratings (approved rule A1).
 */

// ---------------------------------------------------------------- history

export interface Exposure {
  sessionId: string;
  at: number;
  date: string;
  slotId?: string;
  sets: SetLog[];
}

/** Every completed exposure of each exercise, oldest first. */
export type ExerciseHistory = Map<string, Exposure[]>;

export function workSets(entry: ExerciseEntry): SetLog[] {
  return entry.sets.filter((s) => s.kind === 'work' && s.reps > 0);
}

export function buildHistory(sessions: Session[]): ExerciseHistory {
  const history: ExerciseHistory = new Map();
  const completed = sessions.filter((s) => s.status === 'completed').sort((a, b) => a.startedAt - b.startedAt);
  for (const session of completed) {
    for (const entry of session.entries) {
      const sets = workSets(entry);
      if (!sets.length) continue;
      const list = history.get(entry.exerciseId) ?? [];
      list.push({ sessionId: session.id, at: session.startedAt, date: session.date, slotId: entry.slotId, sets });
      history.set(entry.exerciseId, list);
    }
  }
  return history;
}

export function lastExposure(history: ExerciseHistory, exerciseId: string, excludeSessionId?: string): Exposure | undefined {
  const list = (history.get(exerciseId) ?? []).filter((e) => e.sessionId !== excludeSessionId);
  return list[list.length - 1];
}

/** Best estimated max across sets. With `useRepsLeft`, ratings count as reps you could have done. */
export function bestMax(sets: SetLog[], useRepsLeft = false): number {
  return sets.reduce((best, s) => Math.max(best, estimateMax(s.load ?? 0, s.reps, useRepsLeft ? (s.rir ?? 0) : 0)), 0);
}

function topLoad(sets: SetLog[]): number {
  return sets.reduce((max, s) => Math.max(max, s.load ?? 0), 0);
}

// ---------------------------------------------------------------- suggestions

export interface Suggestion {
  load: number | null;
  reps: number;
  reason: SuggestionReason;
  /** Still finding the working weight: no history and no known set, a swap estimate, or one exposure so far. */
  calibrating: boolean;
}

interface Target {
  repsLow: number;
  repsHigh: number;
  rir?: number;
}

interface Context {
  gym: Gym;
  profile: Profile;
  history: ExerciseHistory;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The first set's weight and reps for an exercise, before the Coach adds its own adjustments. */
export function suggestFirstSet(exerciseId: string, target: Target, { gym, profile, history }: Context): Suggestion {
  const exercise = requireExercise(exerciseId);
  const middle = Math.round((target.repsLow + target.repsHigh) / 2);
  const exposures = history.get(exerciseId) ?? [];
  const last = exposures[exposures.length - 1];
  const source = loadSourceFor(exercise, gym);

  if (!exercise.loadFrom || !source) {
    const reps = last ? clamp(last.sets[0]!.reps, target.repsLow, target.repsHigh) : middle;
    return { load: null, reps, reason: 'bodyweight', calibrating: false };
  }
  const known = Boolean(profile.startingLoads?.[exerciseId]);
  if (last) {
    const top = topLoad(last.sets);
    const load = snapLoad(source.model, top, 'down') ?? top;
    const atTop = last.sets.find((s) => s.load === top);
    const reps = clamp(atTop?.reps ?? middle, target.repsLow, target.repsHigh);
    // A1: "after two exposures the working weight is set".
    return { load, reps, reason: 'history', calibrating: exposures.length < 2 && !known };
  }
  const slotLike: ProgramSlot = { id: '', exerciseId, sets: 1, repsLow: target.repsLow, repsHigh: target.repsHigh, rir: target.rir };
  const start = startSuggestion(slotLike, gym, profile, profile.experience);
  if (start.kind === 'known') return { load: start.load, reps: middle, reason: 'known', calibrating: false };
  if (start.kind === 'calibrate') return { load: start.load, reps: middle, reason: 'calibrate', calibrating: true };
  return { load: null, reps: middle, reason: 'none', calibrating: false };
}

/** Calibration aims a rep softer than normal (A1). */
function calibrationRir(rir: number | undefined, calibrating: boolean): number | undefined {
  if (!calibrating) return rir;
  return Math.min(4, (rir ?? 2) + 1);
}

/** A5: how far past the top of the range reps may stretch before taking a big equipment jump. */
const STRETCH_REPS = 5;

/**
 * Calibration (approved rule A1): during the first exposures, each rated set moves the next one.
 * 4+ left: about 20% heavier (at least one step); 3 left: one step up; 1–2 left: hold;
 * nothing left or short of the range: one step down. Unrated: hold.
 *
 * When the next step is far bigger than intended (an 85 lb Smith bar with only 25s and 45s jumps
 * to 125), rule A5 applies: more reps at the same weight first, then the jump at the bottom of
 * the range.
 */
export function calibratedNext(entry: ExerciseEntry, previous: SetLog, gym: Gym): { load: number | null; reps: number } {
  const hold = { load: previous.load, reps: previous.reps };
  const source = loadSourceFor(requireExercise(entry.exerciseId), gym);
  if (previous.load === null || !source || previous.rir === undefined || !entry.target) return hold;
  const { repsLow: low, repsHigh: high } = entry.target;
  const middle = Math.round((low + high) / 2);

  if (previous.rir === 0 || previous.reps < low) {
    return { load: stepLoad(source.model, previous.load, -1), reps: middle };
  }
  if (previous.rir <= 2) return hold;

  const oneStep = stepLoad(source.model, previous.load, 1) ?? previous.load;
  if (oneStep <= previous.load) return { load: previous.load, reps: Math.min(high + STRETCH_REPS, previous.reps + 2) };
  const wanted = previous.rir >= 4 ? Math.max(oneStep, snapLoad(source.model, previous.load * 1.2, 'nearest') ?? oneStep) : oneStep;
  const limit = previous.load * (previous.rir >= 4 ? 1.25 : 1.12);
  if (oneStep <= limit) return { load: Math.min(wanted, Math.max(oneStep, snapLoad(source.model, limit, 'down') ?? oneStep)), reps: middle };
  if (previous.reps < high + STRETCH_REPS) {
    return { load: previous.load, reps: Math.min(high + STRETCH_REPS, previous.reps + (previous.rir >= 4 ? 3 : 2)) };
  }
  return { load: oneStep, reps: low };
}

/** Pre-filled weight and reps for a set, so logging it is usually one tap. */
export function prefill(session: Session, entryIndex: number, gym: Gym): { load: number | null; reps: number } {
  const entry = session.entries[entryIndex];
  if (!entry) return { load: null, reps: 0 };
  const done = workSets(entry);
  const target = entry.target;
  const middle = target ? Math.round((target.repsLow + target.repsHigh) / 2) : 10;
  if (entry.nextSet) return entry.nextSet;
  const previous = done[done.length - 1];
  if (!previous) return { load: target?.load ?? null, reps: target?.firstReps ?? middle };
  if (target?.calibrating) return calibratedNext(entry, previous, gym);
  // Otherwise the next set repeats the last one; the Coach changes it only through a Use (B1/B2).
  return { load: previous.load, reps: previous.reps };
}

// ---------------------------------------------------------------- creating a session

/**
 * One exercise of a new session. The Coach's plan (if any) adjusts it: decided suggestions are
 * applied, undecided ones ride along as an offer shown on the exercise, and lighter weeks or
 * return ramps change sets, weight and effort automatically.
 */
function entryFromSlot(slot: ProgramSlot, ctx: Context, plan?: SlotPlan): ExerciseEntry {
  const exercise = requireExercise(slot.exerciseId);
  const suggestion = suggestFirstSet(slot.exerciseId, slot, ctx);
  const target: NonNullable<ExerciseEntry['target']> = {
    sets: slot.sets,
    repsLow: slot.repsLow,
    repsHigh: slot.repsHigh,
    rir: calibrationRir(slot.rir, suggestion.calibrating),
    load: suggestion.load,
    firstReps: suggestion.reps,
    restSec: slot.restSec,
    reason: suggestion.reason,
    calibrating: suggestion.calibrating || undefined,
  };
  let coachOffer: ExerciseEntry['coachOffer'];
  if (plan?.beat !== undefined && suggestion.reason === 'history') target.firstReps = plan.beat;
  const offer = plan?.offer;
  if (offer?.decided === 'applied') {
    Object.assign(target, {
      load: offer.load,
      repsLow: offer.repsLow,
      repsHigh: offer.repsHigh,
      rir: offer.rir ?? slot.rir,
      firstReps: offer.beat ?? Math.round((offer.repsLow + offer.repsHigh) / 2),
      reason: 'coach',
      coachId: offer.recommendationId,
      calibrating: undefined,
    });
  } else if (offer && !offer.decided) {
    coachOffer = { recommendationId: offer.recommendationId, load: offer.load, repsLow: offer.repsLow, repsHigh: offer.repsHigh, swapTo: offer.swapTo };
  }
  const auto = plan?.auto;
  if (auto) {
    if (auto.sets !== undefined) target.sets = auto.sets;
    if (auto.rir !== undefined) target.rir = auto.rir;
    if (auto.repsLow !== undefined) target.repsLow = auto.repsLow;
    if (auto.repsHigh !== undefined) target.repsHigh = auto.repsHigh;
    if (auto.load !== undefined) {
      target.load = auto.load;
      target.firstReps = Math.round((target.repsLow + target.repsHigh) / 2);
      target.reason = auto.reason === 'lighter-week' || auto.reason === 'return' ? auto.reason : 'coach';
    }
    if (auto.calibrate) target.calibrating = true;
  }
  return {
    id: newId('ent'),
    slotId: slot.id,
    exerciseId: slot.exerciseId,
    equipmentId: loadSourceFor(exercise, ctx.gym)?.item.id,
    role: slot.role,
    superset: slot.superset,
    target,
    sets: [],
    coachOffer,
  };
}

export function createSession(input: {
  program: Program;
  day: ProgramDay;
  gym: Gym;
  profile: Profile;
  history: ExerciseHistory;
  now: number;
  readiness?: ReadinessCheck;
  /** The Coach's plan for this session (coach/engine `planSession`). */
  plan?: SessionPlan | null;
}): Session {
  const { program, gym, profile, history, now, plan } = input;
  const day = plan?.day ?? input.day;
  const ctx = { gym, profile, history };
  const variant: Session['variant'] = plan?.variant ?? (plan?.lighterWeek ? 'lighter-week' : plan && plan.returnTier >= 2 ? 'return' : undefined);
  let session: Session = {
    id: newId('ses'),
    date: toISODate(new Date(now)),
    status: 'active',
    gymId: gym.id,
    programId: program.id,
    dayId: day.id,
    dayName: day.name,
    variant: variant === 'cardio' ? undefined : variant,
    startedAt: now,
    entries: day.slots.map((slot) => entryFromSlot(slot, ctx, plan?.slots[slot.id])),
    cardio: [],
    extras: day.extras?.length ? day.extras.map((x) => ({ ...x })) : undefined,
    extrasDone: [],
    readiness: input.readiness,
    cursor: { entryIndex: 0, setIndex: 0 },
    updatedAt: now,
  };
  // J1 · A swap chosen ahead of time ("Swap to …" on a pain card).
  session.entries.forEach((entry, index) => {
    const offer = plan?.slots[entry.slotId ?? '']?.offer;
    if (offer?.decided === 'used' && offer.swapTo) session = swapEntry(session, index, offer.swapTo, ctx, now);
  });
  return { ...session, cursor: { entryIndex: 0, setIndex: 0 } };
}

/** A session with no lifting, for cardio on a rest day. */
export function createCardioSession(input: { gym: Gym; now: number }): Session {
  return {
    id: newId('ses'),
    date: toISODate(new Date(input.now)),
    status: 'active',
    gymId: input.gym.id,
    dayName: 'Cardio',
    startedAt: input.now,
    entries: [],
    cardio: [],
    extrasDone: [],
    cursor: { entryIndex: 0, setIndex: 0 },
    updatedAt: input.now,
  };
}

// ---------------------------------------------------------------- progress and order

export function isEntryDone(entry: ExerciseEntry): boolean {
  return Boolean(entry.skipped) || workSets(entry).length >= (entry.target?.sets ?? 1);
}

export function liftingDone(session: Session): boolean {
  return session.entries.every(isEntryDone);
}

/** Indices of the entries in the same superset as `index` (just [index] when it isn't in one). */
export function supersetGroup(session: Session, index: number): number[] {
  const id = session.entries[index]?.superset;
  if (!id) return [index];
  return session.entries.flatMap((e, i) => (e.superset === id ? [i] : []));
}

/** Within a superset, the member to do next: the one with the fewest sets, in order. */
function nextInGroup(session: Session, group: number[]): number | null {
  const open = group.filter((i) => !isEntryDone(session.entries[i]!));
  if (!open.length) return null;
  return open.reduce((best, i) => (workSets(session.entries[i]!).length < workSets(session.entries[best]!).length ? i : best), open[0]!);
}

/** Where to go after working on `fromIndex`: same exercise, its superset partner, or the next open one. */
export function nextEntryIndex(session: Session, fromIndex: number): number | null {
  const group = supersetGroup(session, fromIndex);
  const inGroup = nextInGroup(session, group);
  if (inGroup !== null) return inGroup;
  const count = session.entries.length;
  for (let step = 1; step <= count; step++) {
    const index = (fromIndex + step) % count;
    if (!isEntryDone(session.entries[index]!)) {
      return nextInGroup(session, supersetGroup(session, index)) ?? index;
    }
  }
  return null;
}

function cursorAt(session: Session, entryIndex: number | null): Session['cursor'] {
  if (entryIndex === null) return { entryIndex: session.entries.length, setIndex: 0 };
  return { entryIndex, setIndex: workSets(session.entries[entryIndex]!).length };
}

// ---------------------------------------------------------------- rest

/** Rest after a set: the slot's rest (or the exercise's class), more after all-out or heavy low-rep sets. */
export function restAfter(entry: ExerciseEntry, set: SetLog): number {
  const exercise = requireExercise(entry.exerciseId);
  let seconds = entry.target?.restSec ?? PROGRAMMING.rest[exercise.restClass];
  if (set.rir === 0) seconds += 30;
  if (exercise.restClass === 'heavy' && set.reps <= 5) seconds += 30;
  return clamp(seconds, 30, 300);
}

// ---------------------------------------------------------------- actions

function withEntry(session: Session, index: number, entry: ExerciseEntry, now: number): Session {
  const entries = session.entries.slice();
  entries[index] = entry;
  return { ...session, entries, updatedAt: now };
}

function lastSetTime(session: Session): number | null {
  let latest: number | null = null;
  for (const entry of session.entries) for (const s of entry.sets) if (latest === null || s.at > latest) latest = s.at;
  return latest;
}

/**
 * Logs a set and moves on. Inside a superset round, it goes straight to the partner with no rest;
 * otherwise the rest timer starts (stored as an end time, so it survives the phone locking).
 */
export function logSet(
  session: Session,
  entryIndex: number,
  input: { load: number | null; reps: number; rir?: RepsInReserve },
  now: number,
): Session {
  const entry = session.entries[entryIndex];
  if (!entry) return session;
  const previousAt = lastSetTime(session);
  const set: SetLog = {
    id: newId('set'),
    kind: 'work',
    load: input.load,
    reps: input.reps,
    rir: input.rir,
    restTakenSec: previousAt !== null ? Math.round((now - previousAt) / 1000) : undefined,
    at: now,
  };
  let next = withEntry(session, entryIndex, { ...entry, sets: [...entry.sets, set], nextSet: undefined, coachOffer: undefined }, now);
  const nextIndex = nextEntryIndex(next, entryIndex);
  next = { ...next, cursor: cursorAt(next, nextIndex) };

  const group = supersetGroup(next, entryIndex);
  const partnerStillThisRound =
    nextIndex !== null && nextIndex !== entryIndex && group.includes(nextIndex) &&
    workSets(next.entries[nextIndex]!).length < workSets(next.entries[entryIndex]!).length;
  if (partnerStillThisRound) return { ...next, rest: undefined };

  const duration = restAfter(entry, set);
  return { ...next, rest: { startedAt: now, endsAt: now + duration * 1000, durationSec: duration } };
}

/** Records how many more reps were left. A set with nothing left earns 30 more seconds of rest. */
export function rateSet(session: Session, entryIndex: number, setId: string, rir: RepsInReserve, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry) return session;
  const index = entry.sets.findIndex((s) => s.id === setId);
  if (index < 0) return session;
  const before = entry.sets[index]!;
  const sets = entry.sets.slice();
  sets[index] = { ...before, rir };
  let next = withEntry(session, entryIndex, { ...entry, sets }, now);
  const isLatest = lastSetTime(session) === before.at;
  if (next.rest && isLatest && rir === 0 && before.rir !== 0) {
    next = { ...next, rest: { ...next.rest, endsAt: next.rest.endsAt + 30_000, durationSec: next.rest.durationSec + 30 } };
  }
  return next;
}

export function editSet(session: Session, entryIndex: number, setId: string, patch: Partial<Pick<SetLog, 'load' | 'reps' | 'rir'>>, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry) return session;
  return withEntry(session, entryIndex, { ...entry, sets: entry.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }, now);
}

export function deleteSet(session: Session, entryIndex: number, setId: string, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry) return session;
  const next = withEntry(session, entryIndex, { ...entry, sets: entry.sets.filter((s) => s.id !== setId) }, now);
  return { ...next, cursor: cursorAt(next, entryIndex) };
}

// ---------------------------------------------------------------- Coach offers in the workout

/** "Use" on a Coach suggestion shown on an exercise before its first set. */
export function useCoachOffer(session: Session, entryIndex: number, now: number): Session {
  const entry = session.entries[entryIndex];
  const offer = entry?.coachOffer;
  if (!entry?.target || !offer) return session;
  const target = {
    ...entry.target,
    load: offer.load,
    repsLow: offer.repsLow,
    repsHigh: offer.repsHigh,
    firstReps: Math.round((offer.repsLow + offer.repsHigh) / 2),
    reason: 'coach' as const,
    coachId: offer.recommendationId,
    calibrating: undefined,
  };
  const next = withEntry(session, entryIndex, { ...entry, target, coachOffer: undefined }, now);
  return { ...next, coachApplied: [...(session.coachApplied ?? []), offer.recommendationId] };
}

/** "Keep" on a Coach suggestion: the plan stays as it was. */
export function keepCoachOffer(session: Session, entryIndex: number, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry?.coachOffer) return session;
  return withEntry(session, entryIndex, { ...entry, coachOffer: undefined }, now);
}

/** "Use" on an in-session offer (B1/B2): the next set's weight and reps. */
export function useNextSets(session: Session, entryIndex: number, next: { load: number | null; reps: number }, recId: string, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry) return session;
  const updated = withEntry(session, entryIndex, { ...entry, nextSet: next }, now);
  return {
    ...updated,
    coachPrompts: [...new Set([...(session.coachPrompts ?? []), entry.id])],
    coachApplied: [...(session.coachApplied ?? []), recId],
  };
}

/** Marks an exercise as prompted (B1/B2 show at most once per exercise per session). */
export function markPrompted(session: Session, entryIndex: number, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry || session.coachPrompts?.includes(entry.id)) return session;
  return { ...session, coachPrompts: [...(session.coachPrompts ?? []), entry.id], updatedAt: now };
}

export function setEntryNote(session: Session, entryIndex: number, note: string, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry) return session;
  return withEntry(session, entryIndex, { ...entry, notes: note.trim() || undefined }, now);
}

/** Flags pain on the exercise's latest set, so the Coach can steer around it later. */
export function markPain(session: Session, entryIndex: number, now: number): Session {
  const entry = session.entries[entryIndex];
  const last = entry?.sets[entry.sets.length - 1];
  if (!entry || !last) return session;
  return withEntry(session, entryIndex, { ...entry, sets: entry.sets.map((s) => (s.id === last.id ? { ...s, pain: true } : s)) }, now);
}

export function extendRest(session: Session, seconds: number, now: number): Session {
  if (!session.rest) return session;
  const endsAt = Math.max(session.rest.endsAt, now) + seconds * 1000;
  return { ...session, rest: { ...session.rest, endsAt, durationSec: session.rest.durationSec + seconds }, updatedAt: now };
}

export function endRest(session: Session, now: number): Session {
  return session.rest ? { ...session, rest: undefined, updatedAt: now } : session;
}

export function jumpTo(session: Session, entryIndex: number, now: number): Session {
  if (!session.entries[entryIndex]) return session;
  return { ...session, cursor: cursorAt(session, entryIndex), updatedAt: now };
}

export function addSet(session: Session, entryIndex: number, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry?.target) return session;
  const next = withEntry(session, entryIndex, { ...entry, skipped: false, target: { ...entry.target, sets: workSets(entry).length + 1 } }, now);
  return { ...next, cursor: cursorAt(next, entryIndex) };
}

export function skipEntry(session: Session, entryIndex: number, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry) return session;
  const next = withEntry(session, entryIndex, { ...entry, skipped: true }, now);
  return { ...next, cursor: cursorAt(next, nextEntryIndex(next, entryIndex)) };
}

/**
 * "Do this one later": moves an exercise (with its superset partner) to the end of the session and
 * carries on with what comes next. For a busy station that will be free soon.
 */
export function postponeEntry(session: Session, entryIndex: number, now: number): Session {
  if (!session.entries[entryIndex]) return session;
  const group = supersetGroup(session, entryIndex);
  const others = session.entries.filter((_, i) => !group.includes(i));
  if (!others.some((e) => !isEntryDone(e))) return session;
  const entries = [...others, ...group.map((i) => session.entries[i]!)];
  const next = { ...session, entries, updatedAt: now };
  const at = Math.min(Math.min(...group), others.length - 1);
  const target = isEntryDone(entries[at]!) ? nextEntryIndex(next, at) : at;
  return { ...next, cursor: cursorAt(next, target) };
}

function defaultTarget(exercise: ExerciseDef): { repsLow: number; repsHigh: number } {
  if (exercise.metric === 'time') return { repsLow: 30, repsHigh: 45 };
  if (exercise.restClass === 'small') return { repsLow: 12, repsHigh: 15 };
  return exercise.kind === 'compound' ? { repsLow: 8, repsHigh: 12 } : { repsLow: 10, repsHigh: 15 };
}

/**
 * "Station taken?": switches an exercise for another one in this gym. The new exercise keeps its
 * own history. Its first weight comes from its own history if it has one, otherwise from today's
 * sets (or the last session) on the original, converted conservatively; otherwise a light guess.
 * Sets already done on the original stay with the original.
 */
export function swapEntry(session: Session, entryIndex: number, newExerciseId: string, ctx: Context, now: number): Session {
  const entry = session.entries[entryIndex];
  if (!entry?.target) return session;
  const fresh = requireExercise(newExerciseId);
  const done = workSets(entry);
  const remaining = Math.max(1, entry.target.sets - done.length);
  const range = fresh.pattern === requireExercise(entry.exerciseId).pattern ? entry.target : { ...entry.target, ...defaultTarget(fresh) };
  const baseRir = entry.target.calibrating && entry.target.rir !== undefined ? entry.target.rir - 1 : entry.target.rir;

  // I2: a first-time swap starts from a conservative conversion, then calibrates.
  let suggestion = suggestFirstSet(newExerciseId, range, ctx);
  if (suggestion.reason !== 'history' && fresh.loadFrom) {
    const fromMax = done.length ? bestMax(done, true) : bestMax(lastExposure(ctx.history, entry.exerciseId)?.sets ?? [], true);
    const middle = Math.round((range.repsLow + range.repsHigh) / 2);
    const converted = fromMax > 0 ? convertStartLoad(entry.exerciseId, fromMax, newExerciseId, ctx.gym, { reps: middle, repsLeft: range.rir ?? 2 }) : null;
    if (converted !== null) suggestion = { load: converted, reps: middle, reason: 'swap', calibrating: true };
  }

  const swapped: ExerciseEntry = {
    id: newId('ent'),
    slotId: entry.slotId,
    exerciseId: newExerciseId,
    equipmentId: loadSourceFor(fresh, ctx.gym)?.item.id,
    role: entry.role,
    superset: done.length ? undefined : entry.superset,
    swappedFromExerciseId: entry.swappedFromExerciseId ?? entry.exerciseId,
    target: {
      sets: remaining,
      repsLow: range.repsLow,
      repsHigh: range.repsHigh,
      rir: calibrationRir(baseRir, suggestion.calibrating),
      load: suggestion.load,
      firstReps: suggestion.reps,
      restSec: entry.target.restSec,
      reason: suggestion.reason,
      calibrating: suggestion.calibrating || undefined,
    },
    sets: [],
  };

  const entries = session.entries.slice();
  let index = entryIndex;
  if (done.length === 0) {
    entries[entryIndex] = swapped;
  } else {
    entries[entryIndex] = { ...entry, superset: undefined, target: { ...entry.target, sets: done.length } };
    entries.splice(entryIndex + 1, 0, swapped);
    index = entryIndex + 1;
  }
  const next = { ...session, entries, updatedAt: now };
  return { ...next, cursor: cursorAt(next, index) };
}

/** Adds an exercise at the end of today's session. */
export function addEntry(session: Session, exerciseId: string, ctx: Context, now: number): Session {
  const exercise = requireExercise(exerciseId);
  const range = { ...defaultTarget(exercise), rir: 2 };
  const suggestion = suggestFirstSet(exerciseId, range, ctx);
  const entry: ExerciseEntry = {
    id: newId('ent'),
    exerciseId,
    equipmentId: loadSourceFor(exercise, ctx.gym)?.item.id,
    role: 'accessory',
    target: {
      sets: 3,
      ...range,
      rir: calibrationRir(range.rir, suggestion.calibrating),
      load: suggestion.load,
      firstReps: suggestion.reps,
      reason: suggestion.reason,
      calibrating: suggestion.calibrating || undefined,
    },
    sets: [],
  };
  const next = { ...session, entries: [...session.entries, entry], updatedAt: now };
  return { ...next, cursor: cursorAt(next, next.entries.length - 1) };
}

// ---------------------------------------------------------------- cardio

export function logCardio(session: Session, input: Omit<CardioEntry, 'id' | 'at'>, now: number): Session {
  const entry: CardioEntry = { ...input, id: newId('car'), at: now };
  const extrasDone = input.extraId && !session.extrasDone?.includes(input.extraId) ? [...(session.extrasDone ?? []), input.extraId] : session.extrasDone;
  return { ...session, cardio: [...session.cardio, entry], extrasDone, intervalTimer: undefined, updatedAt: now };
}

export function deleteCardio(session: Session, cardioId: string, now: number): Session {
  const removed = session.cardio.find((c) => c.id === cardioId);
  const cardio = session.cardio.filter((c) => c.id !== cardioId);
  const stillLogged = removed?.extraId && cardio.some((c) => c.extraId === removed.extraId);
  const extrasDone = removed?.extraId && !stillLogged ? session.extrasDone?.filter((id) => id !== removed.extraId) : session.extrasDone;
  return { ...session, cardio, extrasDone, updatedAt: now };
}

export type IntervalTimer = NonNullable<Session['intervalTimer']>;

export function startIntervals(session: Session, timer: Omit<IntervalTimer, 'startedAt'>, now: number): Session {
  return { ...session, intervalTimer: { ...timer, startedAt: now }, updatedAt: now };
}

export function stopIntervals(session: Session, now: number): Session {
  return { ...session, intervalTimer: undefined, updatedAt: now };
}

export interface IntervalState {
  phase: 'work' | 'rest' | 'done';
  /** 1-based. */
  round: number;
  remainingSec: number;
  elapsedSec: number;
}

/** Where an interval timer is at `now`, worked out from its start time (correct after a lock). */
export function intervalState(timer: IntervalTimer, now: number): IntervalState {
  const elapsed = Math.max(0, (now - timer.startedAt) / 1000);
  const cycle = timer.workSec + timer.restSec;
  // The last round has no rest after it.
  const total = timer.rounds * cycle - timer.restSec;
  if (elapsed >= total) return { phase: 'done', round: timer.rounds, remainingSec: 0, elapsedSec: Math.round(total) };
  const round = Math.floor(elapsed / cycle) + 1;
  const into = elapsed - (round - 1) * cycle;
  if (into < timer.workSec) return { phase: 'work', round, remainingSec: Math.ceil(timer.workSec - into), elapsedSec: Math.floor(elapsed) };
  return { phase: 'rest', round, remainingSec: Math.ceil(cycle - into), elapsedSec: Math.floor(elapsed) };
}

export function toggleExtraDone(session: Session, extraId: string, now: number): Session {
  const done = new Set(session.extrasDone ?? []);
  if (done.has(extraId)) done.delete(extraId);
  else done.add(extraId);
  return { ...session, extrasDone: [...done], updatedAt: now };
}

export function finishSession(session: Session, checkout: CheckOut | undefined, now: number): Session {
  return {
    ...session,
    status: 'completed',
    endedAt: now,
    checkout,
    cursor: undefined,
    rest: undefined,
    intervalTimer: undefined,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------- records and summary

export interface PersonalRecord {
  exerciseId: string;
  kind: 'estimated-max' | 'heaviest';
  value: number;
  previous: number;
  set: SetLog;
}

/**
 * Real wins only: compared with every earlier session of the same exercise. A first-ever session
 * isn't a record. Estimated max uses the reps actually done (not reps left), so it can't be inflated.
 */
export function detectRecords(session: Session, history: ExerciseHistory): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const entry of session.entries) {
    const exercise = requireExercise(entry.exerciseId);
    const sets = workSets(entry).filter((s) => (s.load ?? 0) > 0);
    if (!exercise.loadFrom || !sets.length) continue;
    const prior = (history.get(entry.exerciseId) ?? []).filter((e) => e.sessionId !== session.id);
    if (!prior.length) continue;
    const priorSets = prior.flatMap((e) => e.sets);
    const bestBefore = bestMax(priorSets);
    const bestSet = sets.reduce((best, s) => (estimateMax(s.load ?? 0, s.reps) > estimateMax(best.load ?? 0, best.reps) ? s : best), sets[0]!);
    const bestNow = estimateMax(bestSet.load ?? 0, bestSet.reps);
    if (bestNow > bestBefore + 0.5) {
      records.push({ exerciseId: entry.exerciseId, kind: 'estimated-max', value: Math.round(bestNow), previous: Math.round(bestBefore), set: bestSet });
      continue;
    }
    const heaviestBefore = topLoad(priorSets);
    const heaviestNow = topLoad(sets);
    if (heaviestNow > heaviestBefore) {
      const set = sets.find((s) => s.load === heaviestNow)!;
      records.push({ exerciseId: entry.exerciseId, kind: 'heaviest', value: heaviestNow, previous: heaviestBefore, set });
    }
  }
  return records;
}

export interface SessionSummary {
  minutes: number;
  workSets: number;
  exercisesDone: number;
  exercisesPlanned: number;
  cardioMinutes: number;
}

export function summarize(session: Session, now = session.endedAt ?? session.startedAt): SessionSummary {
  return {
    minutes: Math.max(1, Math.round((now - session.startedAt) / 60_000)),
    workSets: session.entries.reduce((sum, e) => sum + workSets(e).length, 0),
    exercisesDone: session.entries.filter((e) => workSets(e).length > 0).length,
    exercisesPlanned: session.entries.length,
    cardioMinutes: Math.round(session.cardio.reduce((sum, c) => sum + (c.durationSec ?? 0), 0) / 60),
  };
}

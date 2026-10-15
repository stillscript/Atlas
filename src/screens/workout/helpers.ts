import { useEffect, useState } from 'preact/hooks';
import type { ExerciseEntry, Gym, LoadModel, RepsInReserve, Session, SetLog } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { loadSourceFor } from '../../domain/gym';
import { availableLoads, describeLoad } from '../../domain/loads';
import type { ExerciseDef } from '../../domain/types';
import { lastExposure, workSets, type ExerciseHistory } from '../../domain/workout';
import { repRange } from '../../lib/training-format';

/** A clock for countdowns. Ticks while visible and catches up the moment the app comes back. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}

/** "1:32", "0:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "24:05", "1:02:10" */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export interface LoadContext {
  exercise: ExerciseDef;
  model: LoadModel | null;
  equipmentName?: string;
  /** Every load the equipment can make (empty when the exercise has no load). */
  options: number[];
  units: string;
}

export function loadContext(entry: Pick<ExerciseEntry, 'exerciseId'>, gym: Gym): LoadContext {
  const exercise = requireExercise(entry.exerciseId);
  const source = loadSourceFor(exercise, gym);
  const model = source?.model ?? null;
  const options = model && model.kind !== 'none' ? availableLoads(model) : [];
  return { exercise, model, equipmentName: source?.item.name, options, units: gym.units };
}

/** How a logged load reads: "135", "BW", "+10", "Medium" (band level). */
export function loadText(load: number | null, ctx: LoadContext): string {
  if (load === null) return 'BW';
  if (ctx.model?.kind === 'levels') return ctx.model.levels[load] ?? String(load);
  if (ctx.model?.kind === 'bodyweight') return load === 0 ? 'BW' : `+${load}`;
  return Number.isInteger(load) ? String(load) : load.toFixed(1);
}

/** The unit after a load: "lb", "lb each", or nothing for bodyweight and bands. */
export function loadUnit(load: number | null, ctx: LoadContext): string {
  if (load === null || ctx.model?.kind === 'levels' || (ctx.model?.kind === 'bodyweight' && load === 0)) return '';
  return ctx.exercise.loadMode === 'per-hand' ? `${ctx.units} each` : ctx.exercise.loadMode === 'per-side' ? `${ctx.units} a side` : ctx.units;
}

/** What to put on the machine, when it isn't obvious from the number ("45 + 25 a side"). */
export function loadDetail(load: number | null, ctx: LoadContext): string {
  if (load === null || !ctx.model || ctx.model.kind === 'levels' || ctx.model.kind === 'bodyweight') return '';
  const detail = describeLoad(ctx.model, load, ctx.exercise.loadMode, ctx.units).detail;
  return /^Pin at [\d.]+$/.test(detail) ? '' : detail;
}

/** "135 × 8", or with the unit "135 lb × 8"; "12 reps" or "40 s" without a load. */
export function setText(set: Pick<SetLog, 'load' | 'reps'>, ctx: LoadContext, withUnit = false): string {
  const reps = ctx.exercise.metric === 'time' ? `${set.reps} s` : String(set.reps);
  if (set.load === null && !ctx.model) return ctx.exercise.metric === 'time' ? reps : `${reps} reps`;
  const unit = withUnit ? loadUnit(set.load, ctx) : '';
  return `${loadText(set.load, ctx)}${unit ? ` ${unit}` : ''} × ${reps}`;
}

export const EFFORT_CHOICES: { value: RepsInReserve; label: string; words: string }[] = [
  { value: 0, label: '0', words: 'None' },
  { value: 1, label: '1', words: 'One' },
  { value: 2, label: '2', words: 'Two' },
  { value: 3, label: '3', words: 'Three' },
  { value: 4, label: '4+', words: 'Plenty' },
];

export function effortTag(rir: RepsInReserve | undefined): string {
  if (rir === undefined) return '';
  if (rir === 0) return 'all out';
  if (rir === 4) return '4+ left';
  return `${rir} left`;
}

/** The target in plain words: "6–8 reps · stop 2 short". */
export function targetLine(entry: ExerciseEntry, exercise: ExerciseDef): string {
  const t = entry.target;
  if (!t) return '';
  const unit = exercise.metric === 'time' ? 's' : exercise.unilateral ? 'reps each side' : 'reps';
  const effort = t.rir === undefined ? '' : t.rir <= 0 ? ' · to your last good rep' : ` · stop ${t.rir} short`;
  return `${repRange(t.repsLow, t.repsHigh)} ${unit}${effort}`;
}

/** Why this weight, in one line. */
export function reasonLine(entry: ExerciseEntry, history: ExerciseHistory, session: Session, ctx: LoadContext): string {
  const t = entry.target;
  const last = lastExposure(history, entry.exerciseId, session.id);
  const lastText = last ? `Last time: ${last.sets.map((s) => setText(s, ctx)).join(', ')}` : '';
  switch (t?.reason) {
    case 'history':
      return t.calibrating ? `${lastText}. Still dialing in, so rate each set.` : lastText;
    case 'known':
      return 'Starting from the set you entered at setup.';
    case 'calibrate':
      return 'Finding your weight: start light, then rate each set and Atlas sets the next one.';
    case 'swap': {
      const from = entry.swappedFromExerciseId ? requireExercise(entry.swappedFromExerciseId).name : 'the original exercise';
      return `A careful estimate from ${from}. Rate set 1 and Atlas adjusts.`;
    }
    case 'coach':
      return lastText ? `${lastText}. Today's weight is the Coach's.` : "Today's weight is the Coach's.";
    case 'lighter-week':
      return 'Lighter week: fewer sets, about 10% lighter, stopping 3 or more reps short.';
    case 'return':
      return t.calibrating ? 'Back after a long break: start light and rate each set.' : 'Easing back in after your break, a little lighter than before.';
    default:
      return lastText;
  }
}

/** Sets done out of planned, across the session. */
export function sessionProgress(session: Session): { done: number; planned: number } {
  return session.entries.reduce(
    (acc, e) => ({
      done: acc.done + Math.min(workSets(e).length, e.target?.sets ?? 0),
      planned: acc.planned + (e.skipped ? workSets(e).length : (e.target?.sets ?? 0)),
    }),
    { done: 0, planned: 0 },
  );
}

/** Repetition options for the reps dial: 1–40 reps, or 5–300 seconds for timed work. */
export function repOptions(exercise: ExerciseDef): number[] {
  if (exercise.metric === 'time') return Array.from({ length: 60 }, (_, i) => (i + 1) * 5);
  return Array.from({ length: 40 }, (_, i) => i + 1);
}

/** Letter labels for superset members: A1, A2… */
export function supersetLabels(session: Session): Map<string, string> {
  const labels = new Map<string, string>();
  const groups: string[] = [];
  for (const entry of session.entries) {
    if (!entry.superset) continue;
    if (!groups.includes(entry.superset)) groups.push(entry.superset);
    const letter = String.fromCharCode(65 + groups.indexOf(entry.superset));
    const n = session.entries.filter((e) => e.superset === entry.superset).indexOf(entry) + 1;
    labels.set(entry.id, `${letter}${n}`);
  }
  return labels;
}

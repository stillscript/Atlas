import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { changeSession } from '../../app/workout';
import type { CardioEntry, CardioMetric, EquipmentItem, Gym, Session } from '../../db/types';
import { EXERCISES, requireExercise } from '../../domain/catalog';
import { canDoExercise, gymTags } from '../../domain/gym';
import type { ExerciseDef } from '../../domain/types';
import {
  deleteCardio,
  intervalState,
  logCardio,
  startIntervals,
  stopIntervals,
  summarize,
  toggleExtraDone,
  type IntervalTimer,
} from '../../domain/workout';
import { beep, primeAudio } from '../../lib/chime';
import { haptic } from '../../lib/haptics';
import { Button, Segmented } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { Dial } from './Dial';
import { formatClock, useNow } from './helpers';
import type { OpenSheet } from './WorkoutSheets';

const METERS_PER_MILE = 1609.344;

function cardioEquipment(exercise: ExerciseDef, gym: Gym): EquipmentItem | undefined {
  return gym.equipment.find((item) => exercise.requires.every((tag) => item.provides.includes(tag)));
}

function isCardio(exerciseId: string): boolean {
  return requireExercise(exerciseId).kind === 'cardio';
}

/** Rowers and SkiErgs talk in meters; everything else in miles (or km for kg gyms). */
function distanceUnit(exercise: ExerciseDef, gym: Gym): { label: string; toMeters: number } {
  if (exercise.id === 'rower' || exercise.id === 'skierg') return { label: 'm', toMeters: 1 };
  return gym.units === 'kg' ? { label: 'km', toMeters: 1000 } : { label: 'mi', toMeters: METERS_PER_MILE };
}

export function cardioSummary(entry: CardioEntry, gym: Gym): string {
  const exercise = requireExercise(entry.exerciseId);
  const unit = distanceUnit(exercise, gym);
  const parts: string[] = [];
  if (entry.intervals) parts.push(`${entry.intervals.rounds} × ${entry.intervals.workSec}s on / ${entry.intervals.restSec}s off`);
  else if (entry.durationSec) parts.push(`${Math.round(entry.durationSec / 60)} min`);
  if (entry.distanceM) {
    const value = entry.distanceM / unit.toMeters;
    parts.push(`${unit.label === 'm' ? Math.round(value) : value.toFixed(2)} ${unit.label}`);
  }
  if (entry.calories) parts.push(`${entry.calories} cal`);
  if (entry.avgWatts) parts.push(`${entry.avgWatts} W`);
  if (entry.floors) parts.push(`${entry.floors} floors`);
  if (entry.level) parts.push(`level ${entry.level}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- after the lifting

export function FinishView({ session, gym, onOpen }: { session: Session; gym: Gym; onOpen: (sheet: OpenSheet) => void }) {
  const summary = summarize(session, Date.now());
  const cardioOnly = session.entries.length === 0;
  const extras = session.extras ?? [];
  const loose = session.cardio.filter((c) => !c.extraId || !extras.some((x) => x.id === c.extraId));

  return (
    <>
      <main class="wo-main wo-finish">
        {session.intervalTimer && <IntervalCard timer={session.intervalTimer} />}

        <div class="finish-hero">
          <span class="finish-icon">
            <Icon name={cardioOnly ? 'pulse' : 'check'} size={26} />
          </span>
          <h1 class="wo-name">{cardioOnly ? 'Cardio' : 'Lifting done'}</h1>
          {!cardioOnly && (
            <p class="wo-target num">
              {summary.workSets} sets · {summary.minutes} min
            </p>
          )}
        </div>

        {extras.length > 0 && (
          <section class="finish-section">
            <p class="ex-section-title">Finishers</p>
            {extras.map((extra) => {
              const done = session.extrasDone?.includes(extra.id) ?? false;
              const cardio = isCardio(extra.exerciseId);
              const logged = session.cardio.filter((c) => c.extraId === extra.id);
              return (
                <div key={extra.id} class={done ? 'extra-card is-done' : 'extra-card'}>
                  <div class="extra-text">
                    <p class="extra-title">{extra.label}</p>
                    <p class="extra-detail">{logged.length ? logged.map((c) => cardioSummary(c, gym)).join(' · ') : extra.detail}</p>
                  </div>
                  {cardio ? (
                    <Button
                      size="sm"
                      variant={done ? 'ghost' : 'secondary'}
                      icon={done ? 'check' : undefined}
                      onClick={() => onOpen({ kind: 'cardio', extraId: extra.id, exerciseId: extra.exerciseId })}
                    >
                      {done ? 'Logged' : 'Log'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={done ? 'ghost' : 'secondary'}
                      icon={done ? 'check' : undefined}
                      onClick={() => void changeSession((s, now) => toggleExtraDone(s, extra.id, now))}
                    >
                      {done ? 'Done' : 'Mark done'}
                    </Button>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {loose.length > 0 && (
          <section class="finish-section">
            <p class="ex-section-title">Cardio</p>
            {loose.map((c) => (
              <div key={c.id} class="extra-card is-done">
                <div class="extra-text">
                  <p class="extra-title">{requireExercise(c.exerciseId).name}</p>
                  <p class="extra-detail">{cardioSummary(c, gym)}</p>
                </div>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Remove ${requireExercise(c.exerciseId).name}`}
                  onClick={() => void changeSession((s, now) => deleteCardio(s, c.id, now))}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </section>
        )}

        <Button block icon="pulse" onClick={() => onOpen({ kind: 'cardio' })}>
          {cardioOnly && !session.cardio.length ? 'Log cardio' : 'Add cardio'}
        </Button>
        {!cardioOnly && (
          <Button block variant="ghost" icon="plus" onClick={() => onOpen({ kind: 'add' })}>
            Add an exercise
          </Button>
        )}
      </main>
      <div class="wo-dock wo-dock-finish">
        <Button variant="primary" size="lg" block icon="check" onClick={() => onOpen({ kind: 'checkout' })}>
          Finish workout
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- interval timer

export function IntervalCard({ timer }: { timer: IntervalTimer }) {
  const now = useNow(250);
  const state = intervalState(timer, now);
  const previous = useRef(state.phase + state.round);
  const exercise = requireExercise(timer.exerciseId);

  useEffect(() => {
    const key = state.phase + state.round;
    if (key === previous.current) return;
    previous.current = key;
    beep(state.phase === 'done' ? 'done' : state.phase === 'work' ? 'go' : 'rest');
    if (typeof navigator.vibrate === 'function') navigator.vibrate(state.phase === 'work' ? [120] : [60, 60, 60]);
  }, [state.phase, state.round]);

  const save = (rounds: number) => {
    const durationSec = state.phase === 'done' ? state.elapsedSec : Math.round((now - timer.startedAt) / 1000);
    void changeSession((s, at) =>
      logCardio(
        s,
        {
          exerciseId: timer.exerciseId,
          extraId: timer.extraId,
          durationSec,
          intervals: { workSec: timer.workSec, restSec: timer.restSec, rounds },
        },
        at,
      ),
    );
    haptic('success');
    showToast('Intervals logged', 'good');
  };
  const roundsDone = state.phase === 'done' ? timer.rounds : state.phase === 'rest' ? state.round : state.round - 1;

  return (
    <section class={`interval is-${state.phase}`} aria-live="polite">
      <p class="interval-top">
        {exercise.name} · round {state.round} of {timer.rounds}
      </p>
      <p class="interval-phase">{state.phase === 'done' ? 'Done' : state.phase === 'work' ? 'Go' : 'Rest'}</p>
      <p class="interval-time num">{state.phase === 'done' ? formatClock(state.elapsedSec) : formatClock(state.remainingSec)}</p>
      <div class="interval-actions">
        {state.phase === 'done' ? (
          <Button variant="primary" block onClick={() => save(timer.rounds)}>
            Save
          </Button>
        ) : (
          <>
            <Button block onClick={() => save(Math.max(1, roundsDone))}>
              Stop and save
            </Button>
            <Button variant="ghost" block onClick={() => void changeSession((s, at) => stopIntervals(s, at))}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- logging cardio

interface CardioSheetProps {
  open: boolean;
  onClose: () => void;
  session: Session;
  gym: Gym;
  extraId?: string;
  exerciseId?: string;
}

export function CardioSheet({ open, onClose, session, gym, extraId, exerciseId }: CardioSheetProps) {
  const options = useMemo(() => {
    const tags = gymTags(gym);
    return EXERCISES.filter((e) => e.kind === 'cardio' && canDoExercise(e, tags));
  }, [gym]);
  const [chosen, setChosen] = useState<string | null>(exerciseId ?? null);
  useEffect(() => {
    if (open) setChosen(exerciseId ?? null);
  }, [open, exerciseId]);
  const exercise = chosen ? requireExercise(chosen) : null;

  return (
    <Sheet open={open} onClose={onClose} title={exercise ? exercise.name : 'Log cardio'}>
      {exercise ? (
        <CardioForm key={`${exercise.id}:${extraId ?? ''}`} exercise={exercise} gym={gym} session={session} extraId={extraId} onDone={onClose} />
      ) : (
        <div class="swap-list">
          {options.map((option) => (
            <button key={option.id} type="button" class="swap-option" onClick={() => setChosen(option.id)}>
              <span class="swap-text">
                <span class="swap-name">{option.name}</span>
                <span class="swap-meta">{cardioEquipment(option, gym)?.name}</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

const NUMERIC_FIELDS: { metric: CardioMetric; key: 'calories' | 'avgWatts' | 'level' | 'floors'; label: string; unit?: string }[] = [
  { metric: 'calories', key: 'calories', label: 'Calories' },
  { metric: 'watts', key: 'avgWatts', label: 'Average watts', unit: 'W' },
  { metric: 'level', key: 'level', label: 'Level' },
  { metric: 'floors', key: 'floors', label: 'Floors' },
];

function CardioForm({ exercise, gym, session, extraId, onDone }: { exercise: ExerciseDef; gym: Gym; session: Session; extraId?: string; onDone: () => void }) {
  const item = cardioEquipment(exercise, gym);
  const metrics = new Set<CardioMetric>(item?.cardioMetrics ?? ['duration', 'distance', 'calories']);
  const canIntervals = metrics.has('intervals');
  const [mode, setMode] = useState<'steady' | 'intervals'>('steady');
  const [minutes, setMinutes] = useState(20);
  const [work, setWork] = useState(30);
  const [rest, setRest] = useState(30);
  const [rounds, setRounds] = useState(8);
  const form = useRef<HTMLFormElement>(null);
  const unit = distanceUnit(exercise, gym);
  const extra = session.extras?.find((x) => x.id === extraId);

  const save = (event: Event) => {
    event.preventDefault();
    const data = new FormData(form.current!);
    const num = (name: string) => {
      const value = Number(String(data.get(name) ?? '').replace(',', '.'));
      return Number.isFinite(value) && value > 0 ? value : undefined;
    };
    const distance = num('distance');
    const entry: Omit<CardioEntry, 'id' | 'at'> = {
      exerciseId: exercise.id,
      equipmentId: item?.id,
      extraId,
      durationSec: minutes * 60,
      distanceM: distance !== undefined ? Math.round(distance * unit.toMeters) : undefined,
    };
    for (const field of NUMERIC_FIELDS) if (metrics.has(field.metric)) entry[field.key] = num(field.key);
    void changeSession((s, now) => logCardio(s, entry, now));
    haptic('success');
    showToast(`${exercise.name} logged`, 'good');
    onDone();
  };

  const start = () => {
    primeAudio();
    haptic('success');
    void changeSession((s, now) => startIntervals(s, { exerciseId: exercise.id, extraId, workSec: work, restSec: rest, rounds }, now));
    onDone();
  };

  return (
    <div class="cardio-form">
      {extra?.detail && <p class="sheet-copy">{extra.detail}</p>}
      {canIntervals && (
        <Segmented
          label="Type"
          options={[
            { value: 'steady', label: 'Steady' },
            { value: 'intervals', label: 'Intervals' },
          ]}
          value={mode}
          onChange={setMode}
        />
      )}
      {mode === 'intervals' ? (
        <>
          <div class="check-dials">
            <Dial label="Work" value={work} options={Array.from({ length: 24 }, (_, i) => (i + 1) * 5)} onChange={setWork} display={String(work)} unit="s" />
            <Dial label="Rest" value={rest} options={Array.from({ length: 25 }, (_, i) => i * 5)} onChange={setRest} display={String(rest)} unit="s" />
          </div>
          <Dial label="Rounds" value={rounds} options={Array.from({ length: 30 }, (_, i) => i + 1)} onChange={setRounds} display={String(rounds)} />
          <p class="check-preview num">Total {formatClock(rounds * (work + rest) - rest)}</p>
          <Button variant="primary" size="lg" block icon="play" onClick={start}>
            Start timer
          </Button>
        </>
      ) : (
        <form ref={form} class="field-form" onSubmit={save}>
          <Dial label="Minutes" value={minutes} options={Array.from({ length: 120 }, (_, i) => i + 1)} onChange={setMinutes} display={String(minutes)} unit="min" />
          <div class="field-grid">
            {metrics.has('distance') && (
              <label class="field">
                <span class="field-label">Distance ({unit.label})</span>
                <input class="field-input" name="distance" type="text" inputMode="decimal" autoComplete="off" />
              </label>
            )}
            {NUMERIC_FIELDS.filter((f) => metrics.has(f.metric)).map((field) => (
              <label key={field.key} class="field">
                <span class="field-label">{field.label}</span>
                <input class="field-input" name={field.key} type="text" inputMode="numeric" autoComplete="off" />
              </label>
            ))}
          </div>
          <p class="field-hint">Only minutes are needed. Add the machine’s numbers if you like.</p>
          <Button type="submit" variant="primary" size="lg" block>
            Save
          </Button>
        </form>
      )}
    </div>
  );
}

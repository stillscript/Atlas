import { useEffect, useRef, useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import { activeGym, settings } from '../../app/state';
import { activeSession, changeSession, exerciseHistory, machineSettings } from '../../app/workout';
import { machineSettingId } from '../../db/sessions';
import type { ExerciseEntry, Gym, RepsInReserve, Session, SetLog } from '../../db/types';
import { summarizeLoad } from '../../domain/loads';
import { endRest, extendRest, isEntryDone, jumpTo, logSet, prefill, rateSet, workSets } from '../../domain/workout';
import { primeAudio } from '../../lib/chime';
import { haptic } from '../../lib/haptics';
import { restLabel } from '../../lib/training-format';
import { Button, IconButton } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Dial } from './Dial';
import { FinishView, IntervalCard } from './Finishers';
import {
  EFFORT_CHOICES,
  effortTag,
  formatClock,
  formatElapsed,
  loadContext,
  loadDetail,
  loadText,
  loadUnit,
  reasonLine,
  repOptions,
  sessionProgress,
  setText,
  supersetLabels,
  targetLine,
  useNow,
  type LoadContext,
} from './helpers';
import { WorkoutSheets, type OpenSheet } from './WorkoutSheets';
import './workout.css';

export function WorkoutScreen() {
  const session = activeSession.value;
  const gym = activeGym.value;
  useEffect(() => {
    if (!session) navigate('today', { replace: true });
  }, [session]);
  if (!session || !gym) return null;
  return <Workout session={session} gym={gym} />;
}

function Workout({ session, gym }: { session: Session; gym: Gym }) {
  const now = useNow(1000);
  const [open, setOpen] = useState<OpenSheet | null>(null);
  const index = session.cursor?.entryIndex ?? 0;
  const entry = session.entries[index];
  const resting = session.rest !== undefined && session.rest.endsAt > now;
  const progress = sessionProgress(session);
  const root = useRef<HTMLDivElement>(null);

  // Content scrolls clear of the dock, whatever it's showing (logger, rest, finish).
  useEffect(() => {
    const host = root.current;
    const dock = host?.querySelector<HTMLElement>('.wo-dock');
    if (!host || !dock || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => host.style.setProperty('--dock-h', `${dock.offsetHeight}px`));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [Boolean(entry)]);

  return (
    <div class="wo" ref={root}>
      <header class="wo-top">
        <IconButton icon="chevron-down" label="Back to Today (the workout keeps going)" onClick={() => navigate('today')} />
        <button type="button" class="wo-title" onClick={() => setOpen({ kind: 'overview' })}>
          <span class="wo-title-name">{session.dayName ?? 'Workout'}</span>
          <span class="wo-title-meta num">
            {formatElapsed(now - session.startedAt)}
            {progress.planned > 0 && ` · ${progress.done}/${progress.planned} sets`}
          </span>
        </button>
        <IconButton icon="list" label="All exercises" onClick={() => setOpen({ kind: 'overview' })} />
      </header>

      <ProgressStrip session={session} index={index} />

      {/* Intervals started mid-workout stay on screen until they're saved or cancelled. */}
      {entry && session.intervalTimer && (
        <div class="wo-interval-slot">
          <IntervalCard timer={session.intervalTimer} />
        </div>
      )}

      {entry ? (
        <EntryView key={entry.id} session={session} index={index} entry={entry} gym={gym} onOpen={setOpen} />
      ) : (
        <FinishView session={session} gym={gym} onOpen={setOpen} />
      )}

      {entry && (
        <div class="wo-dock">
          {resting ? (
            <RestPanel session={session} gym={gym} now={now} />
          ) : isEntryDone(entry) ? (
            <EntryDonePanel session={session} index={index} entry={entry} />
          ) : (
            <SetLogger
              // A new set, a swap or a rating (which moves calibration) re-fills the dials.
              key={`${entry.id}:${entry.sets.length}:${entry.target?.load ?? ''}:${entry.sets[entry.sets.length - 1]?.rir ?? ''}`}
              session={session}
              index={index}
              entry={entry}
              gym={gym}
            />
          )}
          <div class="wo-actions">
            <button type="button" class="wo-action" onClick={() => setOpen({ kind: 'form' })}>
              <Icon name="book" size={20} />
              Form
            </button>
            <button type="button" class="wo-action" onClick={() => setOpen({ kind: 'swap' })}>
              <Icon name="swap" size={20} />
              Station taken?
            </button>
            <button type="button" class="wo-action" onClick={() => setOpen({ kind: 'more' })}>
              <Icon name="more" size={20} />
              More
            </button>
          </div>
        </div>
      )}

      <WorkoutSheets open={open} onClose={() => setOpen(null)} onOpen={setOpen} session={session} gym={gym} />
    </div>
  );
}

// ---------------------------------------------------------------- progress

function ProgressStrip({ session, index }: { session: Session; index: number }) {
  if (!session.entries.length) return null;
  return (
    <div class="wo-progress" aria-hidden="true">
      {session.entries.map((e, i) => {
        const planned = Math.max(1, e.target?.sets ?? 1);
        const fill = e.skipped ? 1 : Math.min(1, workSets(e).length / planned);
        return (
          <span key={e.id} class={`wo-seg${i === index ? ' is-current' : ''}${e.skipped ? ' is-skipped' : ''}`} style={{ flexGrow: planned }}>
            <span class="wo-seg-fill" style={{ transform: `scaleX(${fill})` }} />
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- one exercise

interface EntryViewProps {
  session: Session;
  index: number;
  entry: ExerciseEntry;
  gym: Gym;
  onOpen: (sheet: OpenSheet) => void;
}

function EntryView({ session, index, entry, gym, onOpen }: EntryViewProps) {
  const ctx = loadContext(entry, gym);
  const { exercise } = ctx;
  const labels = supersetLabels(session);
  const label = labels.get(entry.id);
  const partner = entry.superset ? session.entries.find((e) => e.superset === entry.superset && e.id !== entry.id) : undefined;
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const reason = reasonLine(entry, exerciseHistory.value, session, ctx);
  const rest = entry.target?.restSec;

  const go = (delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= session.entries.length) return;
    haptic('tap');
    void changeSession((s, now) => jumpTo(s, target, now));
  };

  return (
    <main
      class="wo-main"
      onPointerDown={(event) => {
        swipe.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || (event.target as HTMLElement).closest('button, input, textarea')) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(dx < 0 ? 1 : -1);
      }}
    >
      <div class="wo-nav">
        <button type="button" class="wo-nav-btn" aria-label="Previous exercise" disabled={index === 0} onClick={() => go(-1)}>
          <Icon name="chevron-left" size={20} />
        </button>
        <p class="wo-eyebrow">
          {label ? (
            <>
              <span class="wo-ss">{label}</span> Superset{partner ? ` with ${loadContext(partner, gym).exercise.name}` : ''}
            </>
          ) : (
            `Exercise ${index + 1} of ${session.entries.length}`
          )}
        </p>
        <button
          type="button"
          class="wo-nav-btn"
          aria-label="Next exercise"
          disabled={index >= session.entries.length - 1}
          onClick={() => go(1)}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      <h1 class="wo-name">{exercise.name}</h1>
      <p class="wo-target num">
        {targetLine(entry, exercise)}
        {rest ? ` · ${restLabel(rest).toLowerCase()}` : ''}
      </p>

      <MachineCard entry={entry} gym={gym} ctx={ctx} onEdit={() => onOpen({ kind: 'machine' })} onVerify={() => onOpen({ kind: 'verify' })} />

      {reason && <p class="wo-reason">{reason}</p>}
      {entry.notes && (
        <p class="wo-note">
          <Icon name="pencil" size={14} /> {entry.notes}
        </p>
      )}

      <SetList entry={entry} ctx={ctx} onEdit={(set) => onOpen({ kind: 'edit', entryIndex: index, setId: set.id })} />
    </main>
  );
}

function MachineCard({
  entry,
  gym,
  ctx,
  onEdit,
  onVerify,
}: {
  entry: ExerciseEntry;
  gym: Gym;
  ctx: LoadContext;
  onEdit: () => void;
  onVerify: () => void;
}) {
  const item = gym.equipment.find((e) => e.id === entry.equipmentId);
  if (!item) return null;
  const fields = [...new Set([...(item.settingsFields ?? []), ...(ctx.exercise.settings ?? [])])];
  const saved = machineSettings.value.get(machineSettingId(gym.id, item.id, entry.exerciseId));
  const filled = saved?.fields.filter((f) => f.value.trim()) ?? [];
  const needsCheck = item.verifyLoad && (item.load.kind === 'stack' || item.load.kind === 'plates');

  return (
    <>
      {needsCheck && (
        <button type="button" class="wo-verify" onClick={onVerify}>
          <Icon name="alert" size={18} />
          <span>
            <strong>Check the weights on this machine.</strong> Atlas thinks: {summarizeLoad(item.load, gym.units)}.
          </span>
          <Icon name="chevron-right" size={16} />
        </button>
      )}
      {fields.length > 0 && (
        <button type="button" class="wo-machine" onClick={onEdit}>
          <span class="wo-machine-name">{item.name}</span>
          {filled.length ? (
            <span class="wo-machine-values">
              {filled.map((f) => (
                <span key={f.label} class="wo-chip">
                  {f.label} <strong>{f.value}</strong>
                </span>
              ))}
            </span>
          ) : (
            <span class="wo-machine-empty">Save your {fields.map((f) => f.toLowerCase()).join(', ')}</span>
          )}
          {saved?.note && <span class="wo-machine-note">{saved.note}</span>}
          <Icon name="pencil" size={16} class="wo-machine-edit" />
        </button>
      )}
    </>
  );
}

function SetList({ entry, ctx, onEdit }: { entry: ExerciseEntry; ctx: LoadContext; onEdit: (set: SetLog) => void }) {
  const done = workSets(entry);
  const planned = entry.skipped ? done.length : Math.max(entry.target?.sets ?? 0, done.length);
  const t = entry.target;
  const pending = t ? `${t.repsLow === t.repsHigh ? t.repsLow : `${t.repsLow}–${t.repsHigh}`}${ctx.exercise.metric === 'time' ? ' s' : ''}` : '';
  return (
    <ol class="wo-sets">
      {Array.from({ length: planned }, (_, i) => {
        const set = done[i];
        if (set) {
          return (
            <li key={set.id}>
              <button type="button" class="wo-set is-done" onClick={() => onEdit(set)}>
                <span class="wo-set-n">{i + 1}</span>
                <span class="wo-set-main num">
                  {set.load === null && !ctx.model ? (
                    setText(set, ctx)
                  ) : (
                    <>
                      {loadText(set.load, ctx)}
                      {loadUnit(set.load, ctx) && <span class="wo-set-unit"> {loadUnit(set.load, ctx)}</span>} × {set.reps}
                      {ctx.exercise.metric === 'time' && ' s'}
                    </>
                  )}
                </span>
                <span class={set.rir === undefined ? 'wo-set-tag is-empty' : 'wo-set-tag'}>{effortTag(set.rir) || 'Rate'}</span>
                {set.pain && <Icon name="alert" size={16} class="wo-set-pain" />}
                <Icon name="check" size={18} class="wo-set-check" />
              </button>
            </li>
          );
        }
        return (
          <li key={`p${i}`} class={i === done.length ? 'wo-set is-next' : 'wo-set'}>
            <span class="wo-set-n">{i + 1}</span>
            <span class="wo-set-main num">× {pending}</span>
          </li>
        );
      })}
      {entry.skipped && <li class="wo-set is-skipped">Skipped</li>}
    </ol>
  );
}

// ---------------------------------------------------------------- logging

/** The weight and reps for the next set, pre-filled, and one big Done. */
function SetLogger({ session, index, entry, gym }: { session: Session; index: number; entry: ExerciseEntry; gym: Gym }) {
  const ctx = loadContext(entry, gym);
  const initial = prefill(session, index, gym);
  const hasLoad = ctx.options.length > 0;
  const [load, setLoad] = useState<number>(initial.load ?? (ctx.model?.kind === 'bodyweight' ? 0 : (ctx.options[0] ?? 0)));
  const [reps, setReps] = useState(initial.reps);
  const setNumber = workSets(entry).length + 1;
  const total = Math.max(entry.target?.sets ?? setNumber, setNumber);
  const unrated = latestUnratedSet(session);

  const done = () => {
    primeAudio();
    haptic('success');
    const stored = !hasLoad || (ctx.model?.kind === 'bodyweight' && load === 0) ? null : load;
    void changeSession((s, now) => logSet(s, index, { load: stored, reps }, now));
  };

  return (
    <div class="logger">
      {unrated && <RateStrip session={session} target={unrated} gym={gym} compact />}
      <div class={hasLoad ? 'logger-dials' : 'logger-dials is-single'}>
        {hasLoad && (
          <Dial
            label="Weight"
            value={load}
            options={ctx.options}
            onChange={setLoad}
            display={loadText(load, ctx)}
            unit={loadUnit(load, ctx)}
            caption={loadDetail(load, ctx)}
          />
        )}
        <Dial
          label={ctx.exercise.metric === 'time' ? 'Seconds' : ctx.exercise.unilateral ? 'Reps each side' : 'Reps'}
          value={reps}
          options={repOptions(ctx.exercise)}
          onChange={setReps}
          display={String(reps)}
          caption={entry.target ? `Aim ${targetLine(entry, ctx.exercise)}` : ''}
        />
      </div>
      <Button variant="primary" size="lg" block icon="check" onClick={done}>
        Done · set {setNumber} of {total}
      </Button>
    </div>
  );
}

function EntryDonePanel({ session, index, entry }: { session: Session; index: number; entry: ExerciseEntry }) {
  const next = session.entries.findIndex((e, i) => i !== index && !isEntryDone(e));
  return (
    <div class="logger logger-done">
      <p class="logger-done-text">
        <Icon name="check" size={18} /> {entry.skipped ? 'Skipped' : 'All sets done'}
      </p>
      <div class="logger-done-actions">
        <Button
          variant="primary"
          size="lg"
          block
          icon="arrow-right"
          onClick={() => void changeSession((s, now) => jumpTo(s, next === -1 ? s.entries.length : next, now))}
        >
          {next === -1 ? 'Finish up' : 'Next exercise'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rest and effort

interface RatedTarget {
  entryIndex: number;
  set: SetLog;
}

function latestSet(session: Session): RatedTarget | null {
  let best: RatedTarget | null = null;
  for (let entryIndex = 0; entryIndex < session.entries.length; entryIndex++) {
    for (const set of session.entries[entryIndex]!.sets) {
      if (best === null || set.at > best.set.at) best = { entryIndex, set };
    }
  }
  return best;
}

/** The last set, while it's still waiting for a rating (and recent enough to remember). */
function latestUnratedSet(session: Session): RatedTarget | null {
  const latest = latestSet(session);
  if (!latest || latest.set.rir !== undefined || Date.now() - latest.set.at > 10 * 60_000) return null;
  return latest;
}

function RateStrip({ session, target, gym, compact = false }: { session: Session; target: RatedTarget; gym: Gym; compact?: boolean }) {
  const ctx = loadContext(session.entries[target.entryIndex]!, gym);
  const rate = (rir: RepsInReserve) => {
    haptic('tap');
    void changeSession((s, now) => rateSet(s, target.entryIndex, target.set.id, rir, now));
  };
  return (
    <div class={compact ? 'rate is-compact' : 'rate'}>
      <p class="rate-q">
        {compact ? (
          <>
            Rate <span class="num">{setText(target.set, ctx)}</span>: reps left?
          </>
        ) : (
          'How many more reps could you have done?'
        )}
      </p>
      <div class="rate-chips" role="radiogroup" aria-label="Reps left in the tank">
        {EFFORT_CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={target.set.rir === choice.value}
            aria-label={`${choice.words} left`}
            class={target.set.rir === choice.value ? 'rate-chip is-selected' : 'rate-chip'}
            onClick={() => rate(choice.value)}
          >
            <span class="rate-chip-n num">{choice.label}</span>
            {!compact && <span class="rate-chip-w">{choice.words}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function RestPanel({ session, gym, now }: { session: Session; gym: Gym; now: number }) {
  const rest = session.rest!;
  const remaining = Math.max(0, (rest.endsAt - now) / 1000);
  const fraction = Math.min(1, Math.max(0, 1 - remaining / rest.durationSec));
  const latest = latestSet(session);
  const nextIndex = session.cursor?.entryIndex ?? session.entries.length;
  const nextEntry = session.entries[nextIndex];
  let nextText = 'Finishers and check-out';
  if (nextEntry) {
    const ctx = loadContext(nextEntry, gym);
    const p = prefill(session, nextIndex, gym);
    const sameExercise = latest && latest.entryIndex === nextIndex;
    const setPart = `set ${workSets(nextEntry).length + 1}`;
    nextText = `${sameExercise ? setPart : `${ctx.exercise.name}, ${setPart}`} · ${setText(p, ctx, true)}`;
  }

  return (
    <div class="rest" role="timer" aria-live="off">
      <div class="rest-top">
        <div class="rest-clock">
          <span class="rest-label">Rest</span>
          <span class="rest-time num">{formatClock(remaining)}</span>
        </div>
        <div class="rest-buttons">
          <Button size="sm" onClick={() => void changeSession((s, at) => extendRest(s, 30, at))}>
            +30 s
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void changeSession((s, at) => endRest(s, at))}>
            Skip
          </Button>
        </div>
      </div>
      <div class="rest-bar">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      {latest && <RateStrip session={session} target={latest} gym={gym} />}
      <p class="rest-next">
        <span>Next</span> {nextText}
      </p>
      {!settings.value.keepAwake && <p class="rest-hint">Keep Atlas open to hear the chime.</p>}
    </div>
  );
}

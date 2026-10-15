import { useMemo, useRef, useState } from 'preact/hooks';
import { profile } from '../../app/state';
import { changeSession, discardWorkout, exerciseHistory, machineSettings, saveSettingsFor } from '../../app/workout';
import { machineSettingId } from '../../db/sessions';
import type { ExerciseEntry, Gym, RepsInReserve, Session } from '../../db/types';
import { EXERCISES, patternById } from '../../domain/catalog';
import { canDoExercise, gymTags } from '../../domain/gym';
import { swapOptions } from '../../domain/resolver';
import type { ExerciseDef } from '../../domain/types';
import { muscleName } from '../../domain/volume';
import {
  addEntry,
  addSet,
  deleteSet,
  editSet,
  isEntryDone,
  jumpTo,
  lastExposure,
  markPain,
  postponeEntry,
  setEntryNote,
  skipEntry,
  swapEntry,
  workSets,
} from '../../domain/workout';
import { plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { ListGroup, ListRow } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { FormNotes } from '../plan/ExerciseSheet';
import { CheckoutSheet } from './Checkout';
import { Dial } from './Dial';
import { EquipmentCheckSheet } from './EquipmentCheck';
import { CardioSheet } from './Finishers';
import { EFFORT_CHOICES, loadContext, loadDetail, loadText, loadUnit, repOptions, setText, supersetLabels } from './helpers';

export type OpenSheet =
  | { kind: 'overview' }
  | { kind: 'form' }
  | { kind: 'swap'; pain?: boolean }
  | { kind: 'machine' }
  | { kind: 'verify' }
  | { kind: 'more' }
  | { kind: 'edit'; entryIndex: number; setId: string }
  | { kind: 'add' }
  | { kind: 'note' }
  | { kind: 'checkout' }
  | { kind: 'discard' }
  | { kind: 'cardio'; extraId?: string; exerciseId?: string };

interface SheetsProps {
  open: OpenSheet | null;
  onClose: () => void;
  onOpen: (sheet: OpenSheet) => void;
  session: Session;
  gym: Gym;
}

/** Keeps the last value while a sheet animates closed, so its content doesn't vanish mid-slide. */
function useLast<T>(value: T | null): T | null {
  const last = useRef(value);
  if (value !== null) last.current = value;
  return last.current;
}

export function WorkoutSheets({ open, onClose, onOpen, session, gym }: SheetsProps) {
  const index = session.cursor?.entryIndex ?? 0;
  const current = session.entries[index];
  const entry = useLast(current ?? null);
  const kind = open?.kind;
  const edit = useLast(open?.kind === 'edit' ? open : null);
  const cardio = useLast(open?.kind === 'cardio' ? open : null);
  const swapPain = open?.kind === 'swap' && open.pain === true;

  return (
    <>
      <OverviewSheet open={kind === 'overview'} onClose={onClose} onOpen={onOpen} session={session} gym={gym} />
      {entry && (
        <>
          <Sheet open={kind === 'form'} onClose={onClose} title={loadContext(entry, gym).exercise.name}>
            <FormContent entry={entry} gym={gym} />
          </Sheet>
          <SwapSheet open={kind === 'swap'} pain={swapPain} onClose={onClose} session={session} index={index} entry={entry} gym={gym} />
          <MachineSheet open={kind === 'machine'} onClose={onClose} entry={entry} gym={gym} />
          <EquipmentCheckSheet
            open={kind === 'verify'}
            onClose={onClose}
            item={gym.equipment.find((e) => e.id === entry.equipmentId) ?? null}
            units={gym.units}
          />
          <NoteSheet open={kind === 'note'} onClose={onClose} index={index} entry={entry} />
        </>
      )}
      <MoreSheet open={kind === 'more'} onClose={onClose} onOpen={onOpen} index={index} entry={current} gym={gym} />
      {edit && <EditSetSheet open={kind === 'edit'} onClose={onClose} session={session} target={edit} gym={gym} />}
      <AddExerciseSheet open={kind === 'add'} onClose={onClose} session={session} gym={gym} />
      <CheckoutSheet open={kind === 'checkout'} onClose={onClose} session={session} />
      <CardioSheet
        open={kind === 'cardio'}
        onClose={onClose}
        session={session}
        gym={gym}
        extraId={cardio?.extraId}
        exerciseId={cardio?.exerciseId}
      />
      <Sheet
        open={kind === 'discard'}
        onClose={onClose}
        title="Discard this workout?"
        footer={
          <>
            <Button variant="danger" size="lg" block onClick={() => void discardWorkout()}>
              Discard workout
            </Button>
            <Button variant="ghost" block onClick={onClose}>
              Keep it
            </Button>
          </>
        }
      >
        <p class="sheet-copy">
          {session.entries.some((e) => e.sets.length) || session.cardio.length
            ? 'Everything you logged today will be deleted. To keep it, finish the workout instead.'
            : 'Nothing has been logged yet, so nothing is lost.'}
        </p>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- overview

function OverviewSheet({ open, onClose, onOpen, session, gym }: { open: boolean; onClose: () => void; onOpen: (s: OpenSheet) => void; session: Session; gym: Gym }) {
  const labels = supersetLabels(session);
  const current = session.cursor?.entryIndex ?? 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={session.dayName ?? 'Workout'}
      footer={
        <Button variant="primary" size="lg" block onClick={() => onOpen({ kind: 'checkout' })}>
          Finish workout
        </Button>
      }
    >
      <ol class="ov-list">
        {session.entries.map((entry, i) => {
          const ctx = loadContext(entry, gym);
          const done = workSets(entry);
          const state = entry.skipped ? 'skipped' : isEntryDone(entry) ? 'done' : done.length ? 'started' : 'todo';
          return (
            <li key={entry.id}>
              <button
                type="button"
                class={`ov-row is-${state}${i === current ? ' is-current' : ''}`}
                onClick={() => {
                  haptic('tap');
                  void changeSession((s, now) => jumpTo(s, i, now));
                  onClose();
                }}
              >
                <span class="ov-mark" aria-hidden="true">
                  {state === 'done' ? <Icon name="check" size={16} /> : labels.get(entry.id) ?? i + 1}
                </span>
                <span class="ov-text">
                  <span class="ov-name">{ctx.exercise.name}</span>
                  <span class="ov-meta num">
                    {entry.skipped
                      ? 'Skipped'
                      : done.length
                        ? done.map((s) => setText(s, ctx)).join(', ')
                        : plural(entry.target?.sets ?? 0, 'set')}
                  </span>
                </span>
                <span class="ov-count num">
                  {done.length}/{entry.target?.sets ?? done.length}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {(session.extras?.length ?? 0) > 0 && (
        <>
          <p class="ex-section-title">Finishers</p>
          <ul class="ov-extras">
            {session.extras!.map((x) => (
              <li key={x.id} class={session.extrasDone?.includes(x.id) ? 'is-done' : ''}>
                <Icon name={session.extrasDone?.includes(x.id) ? 'check' : 'pulse'} size={16} /> {x.label}
              </li>
            ))}
          </ul>
        </>
      )}
      <div class="ov-actions">
        <Button icon="plus" block onClick={() => onOpen({ kind: 'add' })}>
          Add an exercise
        </Button>
        <Button icon="pulse" block onClick={() => onOpen({ kind: 'cardio' })}>
          Log cardio
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- form

function FormContent({ entry, gym }: { entry: ExerciseEntry; gym: Gym }) {
  const ctx = loadContext(entry, gym);
  const item = gym.equipment.find((e) => e.id === entry.equipmentId);
  const muscles = [...ctx.exercise.primary.map(muscleName), ...ctx.exercise.secondary.map((m) => `${muscleName(m)} (assists)`)];
  return (
    <div class="ex-detail">
      <FormNotes exercise={ctx.exercise} />
      {muscles.length > 0 && (
        <section>
          <p class="ex-section-title">Works</p>
          <p class="ex-muted">{muscles.join(', ')}</p>
        </section>
      )}
      {item?.loadNote && (
        <section>
          <p class="ex-section-title">About the numbers</p>
          <p class="ex-muted">{item.loadNote}</p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- swaps

function SwapSheet({
  open,
  pain,
  onClose,
  session,
  index,
  entry,
  gym,
}: {
  open: boolean;
  pain: boolean;
  onClose: () => void;
  session: Session;
  index: number;
  entry: ExerciseEntry;
  gym: Gym;
}) {
  const me = profile.value;
  const ctx = loadContext(entry, gym);
  const options = useMemo(
    () => swapOptions(entry.exerciseId, gym, { experience: me?.experience, avoid: pain ? ctx.exercise.stresses : undefined, limit: 6 }),
    [entry.exerciseId, gym, me?.experience, pain],
  );
  const canPostpone = session.entries.some((e, i) => i !== index && !isEntryDone(e) && (!entry.superset || e.superset !== entry.superset));
  const history = exerciseHistory.value;

  const choose = (exercise: ExerciseDef) => {
    if (!me) return;
    haptic('success');
    void changeSession((s, now) => swapEntry(s, index, exercise.id, { gym, profile: me, history }, now));
    showToast(`Switched to ${exercise.name}`);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={pain ? 'Something hurts' : 'Station taken?'}>
      <p class="sheet-copy">
        {pain
          ? 'Noted on this set. Pick something that feels fine. Sharp or worsening pain means stop for today.'
          : `Pick something else for ${ctx.exercise.name}. Each exercise keeps its own history.`}
      </p>
      <div class="swap-list">
        {options.map(({ exercise, samePattern }) => {
          const optionCtx = loadContext({ exerciseId: exercise.id }, gym);
          const last = lastExposure(history, exercise.id);
          return (
            <button key={exercise.id} type="button" class="swap-option" onClick={() => choose(exercise)}>
              <span class="swap-text">
                <span class="swap-name">{exercise.name}</span>
                <span class="swap-meta">
                  {[samePattern ? 'Same movement' : patternById(exercise.pattern)?.name, optionCtx.equipmentName, last ? `Last: ${setText(last.sets[0]!, optionCtx)}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          );
        })}
        {options.length === 0 && <p class="sheet-copy">Nothing else in this gym trains the same thing. Try “Do this one later”.</p>}
      </div>
      {canPostpone && !pain && (
        <Button
          block
          icon="clock"
          onClick={() => {
            void changeSession((s, now) => postponeEntry(s, index, now));
            showToast(`${ctx.exercise.name} moved to the end`);
            onClose();
          }}
        >
          Do this one later
        </Button>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- machine settings

function MachineSheet({ open, onClose, entry, gym }: { open: boolean; onClose: () => void; entry: ExerciseEntry; gym: Gym }) {
  const item = gym.equipment.find((e) => e.id === entry.equipmentId);
  const ctx = loadContext(entry, gym);
  const fields = item ? [...new Set([...(item.settingsFields ?? []), ...(ctx.exercise.settings ?? [])])] : [];
  const saved = item ? machineSettings.value.get(machineSettingId(gym.id, item.id, entry.exerciseId)) : undefined;
  const form = useRef<HTMLFormElement>(null);

  const save = async (event: Event) => {
    event.preventDefault();
    if (!item || !form.current) return;
    const data = new FormData(form.current);
    const values = fields.map((label) => ({ label, value: String(data.get(label) ?? '').trim() }));
    await saveSettingsFor(gym.id, item.id, entry.exerciseId, values, String(data.get('__note') ?? '').trim());
    haptic('success');
    showToast('Settings saved', 'good');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Machine settings"
      footer={
        <Button variant="primary" size="lg" block onClick={() => form.current?.requestSubmit()}>
          Save
        </Button>
      }
    >
      {item && (
        <form ref={form} class="field-form" key={`${item.id}:${entry.exerciseId}:${saved?.updatedAt ?? 0}`} onSubmit={(e) => void save(e)}>
          <p class="sheet-copy">
            {item.name} for {ctx.exercise.name}. Atlas shows these every time you’re here.
          </p>
          {fields.map((label) => (
            <label key={label} class="field">
              <span class="field-label">{label}</span>
              <input
                class="field-input"
                name={label}
                type="text"
                autoComplete="off"
                enterKeyHint="next"
                defaultValue={saved?.fields.find((f) => f.label === label)?.value ?? ''}
                placeholder="e.g. 4"
              />
            </label>
          ))}
          <label class="field">
            <span class="field-label">Note</span>
            <input class="field-input" name="__note" type="text" autoComplete="off" defaultValue={saved?.note ?? ''} placeholder="Anything else worth remembering" />
          </label>
        </form>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- more

function MoreSheet({
  open,
  onClose,
  onOpen,
  index,
  entry,
  gym,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (s: OpenSheet) => void;
  index: number;
  entry: ExerciseEntry | undefined;
  gym: Gym;
}) {
  const item = entry ? gym.equipment.find((e) => e.id === entry.equipmentId) : undefined;
  const checkable = item && (item.load.kind === 'stack' || item.load.kind === 'plates');
  const name = entry ? loadContext(entry, gym).exercise.name : '';
  const act = (change: Parameters<typeof changeSession>[0], message?: string) => {
    void changeSession(change);
    if (message) showToast(message);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="More">
      {entry && (
        <ListGroup title={name}>
          <ListRow icon="plus" tone="accent" label="Add a set" onClick={() => act((s, now) => addSet(s, index, now))} />
          {!isEntryDone(entry) && (
            <ListRow icon="arrow-right" label="Skip this exercise" onClick={() => act((s, now) => skipEntry(s, index, now), `${name} skipped`)} />
          )}
          <ListRow icon="pencil" label="Note" detail={entry.notes} onClick={() => onOpen({ kind: 'note' })} />
          {checkable && <ListRow icon="settings" label="Check this machine’s weights" onClick={() => onOpen({ kind: 'verify' })} />}
          <ListRow
            icon="alert"
            tone="warn"
            label="Something hurts"
            detail="Note it and find a swap"
            onClick={() => {
              if (entry.sets.length) void changeSession((s, now) => markPain(s, index, now));
              onOpen({ kind: 'swap', pain: true });
            }}
          />
        </ListGroup>
      )}
      <ListGroup>
        <ListRow icon="plus" label="Add an exercise" onClick={() => onOpen({ kind: 'add' })} />
        <ListRow icon="pulse" label="Log cardio" onClick={() => onOpen({ kind: 'cardio' })} />
      </ListGroup>
      <ListGroup>
        <ListRow icon="check" tone="good" label="Finish workout" onClick={() => onOpen({ kind: 'checkout' })} />
        <ListRow icon="trash" label="Discard workout" destructive onClick={() => onOpen({ kind: 'discard' })} />
      </ListGroup>
    </Sheet>
  );
}

function NoteSheet({ open, onClose, index, entry }: { open: boolean; onClose: () => void; index: number; entry: ExerciseEntry }) {
  const area = useRef<HTMLTextAreaElement>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Note"
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            const text = area.current?.value ?? '';
            void changeSession((s, now) => setEntryNote(s, index, text, now));
            onClose();
          }}
        >
          Save note
        </Button>
      }
    >
      <textarea
        ref={area}
        key={`${entry.id}:${entry.notes ?? ''}`}
        class="field-input field-area"
        rows={3}
        defaultValue={entry.notes ?? ''}
        placeholder="Grip, tempo, how it felt…"
        aria-label="Note for this exercise"
      />
    </Sheet>
  );
}

// ---------------------------------------------------------------- edit a set

function EditSetSheet({
  open,
  onClose,
  session,
  target,
  gym,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  target: { entryIndex: number; setId: string };
  gym: Gym;
}) {
  const entry = session.entries[target.entryIndex];
  const set = entry?.sets.find((s) => s.id === target.setId);
  return (
    <Sheet open={open} onClose={onClose} title="Edit set">
      {entry && set && <EditSetForm key={set.id} entry={entry} entryIndex={target.entryIndex} setId={set.id} gym={gym} onDone={onClose} />}
    </Sheet>
  );
}

function EditSetForm({ entry, entryIndex, setId, gym, onDone }: { entry: ExerciseEntry; entryIndex: number; setId: string; gym: Gym; onDone: () => void }) {
  const set = entry.sets.find((s) => s.id === setId)!;
  const ctx = loadContext(entry, gym);
  const hasLoad = ctx.options.length > 0;
  const [load, setLoad] = useState(set.load ?? 0);
  const [reps, setReps] = useState(set.reps);
  const [rir, setRir] = useState<RepsInReserve | undefined>(set.rir);
  const save = () => {
    const stored = !hasLoad || (ctx.model?.kind === 'bodyweight' && load === 0) ? null : load;
    void changeSession((s, now) => editSet(s, entryIndex, setId, { load: stored, reps, rir }, now));
    onDone();
  };
  return (
    <div class="edit-set">
      <p class="sheet-copy">{ctx.exercise.name}</p>
      <div class={hasLoad ? 'logger-dials' : 'logger-dials is-single'}>
        {hasLoad && (
          <Dial label="Weight" value={load} options={ctx.options} onChange={setLoad} display={loadText(load, ctx)} unit={loadUnit(load, ctx)} caption={loadDetail(load, ctx)} />
        )}
        <Dial label={ctx.exercise.metric === 'time' ? 'Seconds' : 'Reps'} value={reps} options={repOptions(ctx.exercise)} onChange={setReps} display={String(reps)} />
      </div>
      <p class="rate-q">Reps left in the tank</p>
      <div class="rate-chips" role="radiogroup" aria-label="Reps left in the tank">
        {EFFORT_CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={rir === choice.value}
            class={rir === choice.value ? 'rate-chip is-selected' : 'rate-chip'}
            onClick={() => setRir(choice.value)}
          >
            <span class="rate-chip-n num">{choice.label}</span>
            <span class="rate-chip-w">{choice.words}</span>
          </button>
        ))}
      </div>
      <div class="edit-actions">
        <Button variant="primary" size="lg" block onClick={save}>
          Save
        </Button>
        <Button
          variant="ghost"
          block
          icon="trash"
          onClick={() => {
            void changeSession((s, now) => deleteSet(s, entryIndex, setId, now));
            showToast('Set deleted');
            onDone();
          }}
        >
          Delete set
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- add an exercise

function AddExerciseSheet({ open, onClose, session, gym }: { open: boolean; onClose: () => void; session: Session; gym: Gym }) {
  const [query, setQuery] = useState('');
  const me = profile.value;
  const available = useMemo(() => {
    const tags = gymTags(gym);
    return EXERCISES.filter((e) => e.kind !== 'cardio' && canDoExercise(e, tags)).sort((a, b) => a.name.localeCompare(b.name));
  }, [gym]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = available.filter((e) => {
    const haystack = `${e.name} ${(e.aka ?? []).join(' ')} ${patternById(e.pattern)?.name ?? ''} ${e.primary.join(' ')}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  const inSession = new Set(session.entries.map((e) => e.exerciseId));
  return (
    <Sheet open={open} onClose={onClose} title="Add an exercise">
      <input
        class="field-input search-input"
        type="search"
        placeholder="Search: curl, chest, leg press…"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        aria-label="Search exercises"
      />
      <div class="swap-list">
        {matches.slice(0, 40).map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            class="swap-option"
            onClick={() => {
              if (!me) return;
              void changeSession((s, now) => addEntry(s, exercise.id, { gym, profile: me, history: exerciseHistory.value }, now));
              showToast(`${exercise.name} added`);
              setQuery('');
              onClose();
            }}
          >
            <span class="swap-text">
              <span class="swap-name">{exercise.name}</span>
              <span class="swap-meta">
                {exercise.primary.map(muscleName).join(', ')}
                {inSession.has(exercise.id) ? ' · already today' : ''}
              </span>
            </span>
            <Icon name="plus" size={18} />
          </button>
        ))}
        {matches.length === 0 && <p class="sheet-copy">Nothing matches “{query}” in this gym.</p>}
      </div>
    </Sheet>
  );
}

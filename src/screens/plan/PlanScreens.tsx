import { useRef, useState } from 'preact/hooks';
import { editProgram, gyms } from '../../app/edit';
import { goBack, navigate } from '../../app/router';
import { activeGym, activeProgram, profile } from '../../app/state';
import type { Goal, ProgramDay, ProgramSlot } from '../../db/types';
import { requireExercise, templateById } from '../../domain/catalog';
import { estimateDayMinutes, goalName } from '../../domain/generator';
import { remapDayForGym } from '../../domain/gymEdit';
import {
  addDay,
  addSlot,
  BLOCK_RANGE,
  moveSlot,
  removeDay,
  renameDay,
  renameProgram,
  restartBlock,
  setBlockLength,
  setWeekday,
  unscheduledDays,
} from '../../domain/planEdit';
import { blockPosition, programDay, WEEKDAY_LONG } from '../../domain/schedule';
import { haptic } from '../../lib/haptics';
import { plural } from '../../lib/format';
import { setsAndReps } from '../../lib/training-format';
import { Button, IconButton } from '../../ui/controls';
import { EmptyState, Notice, showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { ListGroup, ListRow } from '../../ui/List';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Sheet } from '../../ui/Sheet';
import { Dial } from '../workout/Dial';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseSheet } from './ExerciseSheet';
import { dayMeta } from './meta';
import { SessionList } from './SessionList';
import { SlotEditor } from './SlotEditor';
import './plan.css';

const EXPERIENCE_NAMES = { beginner: 'New to lifting', intermediate: 'Some experience', advanced: 'Experienced' } as const;

const settingsButton = <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />;

export function PlanScreen() {
  const program = activeProgram.value;
  const gym = activeGym.value;
  const me = profile.value;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weekday, setWeekdayOpen] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  if (!program || !gym) {
    return (
      <main class="screen">
        <ScreenHeader title="Plan" actions={settingsButton} />
        <EmptyState icon="plan" title="No plan yet">
          Answer a few quick questions and Atlas builds a plan around the equipment in your gym.
        </EmptyState>
      </main>
    );
  }

  const block = blockPosition(program, new Date());
  const template = program.templateId ? templateById(program.templateId) : undefined;
  const trainingDays = program.schedule.filter(Boolean).length;
  const edited = program.updatedAt > program.createdAt + 60_000;
  const description = template && !edited
    ? template.description
    : `${plural(trainingDays, 'day')} a week, every exercise picked from the equipment at ${gym.name}.${edited ? ' Edited by you.' : ''}`;
  const unscheduled = unscheduledDays(program);

  return (
    <main class="screen">
      <ScreenHeader title="Plan" actions={settingsButton} />

      <section class="plan-card">
        <div class="plan-card-head">
          <h2 class="plan-name">{program.name || template?.name}</h2>
          <IconButton icon="pencil" label="Plan settings" onClick={() => setSettingsOpen(true)} />
        </div>
        <div class="plan-tags">
          <span class="tag is-accent">{goalName(program.goal as Goal)}</span>
          {me && <span class="tag">{EXPERIENCE_NAMES[me.experience]}</span>}
          <span class="tag">{plural(trainingDays, 'day')} a week</span>
        </div>
        <p class="plan-desc">{description}</p>
        <p class="plan-desc">
          {block.lighterWeek
            ? `This is the lighter week. A new ${block.lengthWeeks}-week block starts next week.`
            : `Week ${block.week} of ${block.lengthWeeks}, then a lighter week to recover before the next block.`}
        </p>
      </section>

      <ListGroup title="Your week" footer="Tap a day to change what’s on it.">
        {program.schedule.map((dayId, index) => {
          const day = programDay(program, dayId);
          return (
            <ListRow
              key={index}
              label={WEEKDAY_LONG[index]}
              detail={day ? `${day.name} · about ${estimateDayMinutes(day)} min` : undefined}
              value={day ? undefined : 'Rest'}
              chevron
              onClick={() => setWeekdayOpen(index)}
            />
          );
        })}
      </ListGroup>

      <ListGroup title="Sessions">
        {program.days.map((day) => (
          <ListRow
            key={day.id}
            label={day.name}
            detail={`${plural(day.slots.length, 'exercise')}${unscheduled.includes(day) ? ' · not on your week yet' : ''}`}
            chevron
            onClick={() => navigate({ name: 'plan-day', dayId: day.id })}
          />
        ))}
        <ListRow icon="plus" tone="accent" label="Add a session" onClick={() => setAddOpen(true)} />
      </ListGroup>

      <ListGroup title="Gym" footer="To change your goal or start over with a new plan, use Settings › Redo setup. Your history stays.">
        <ListRow
          icon="building"
          tone="accent"
          label={gym.name}
          detail={`${plural(gym.equipment.length, 'piece')} of equipment${gyms.value.length > 1 ? ` · ${plural(gyms.value.length, 'gym')} saved` : ''}`}
          chevron
          onClick={() => navigate('gym')}
        />
      </ListGroup>

      <PlanSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WeekdaySheet weekday={weekday} onClose={() => setWeekdayOpen(null)} />
      <AddDaySheet open={addOpen} onClose={() => setAddOpen(false)} />
    </main>
  );
}

function PlanSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const program = activeProgram.value!;
  const name = useRef<HTMLInputElement>(null);
  const [weeks, setWeeks] = useState(program.block.lengthWeeks);
  const save = async () => {
    const value = name.current?.value ?? '';
    const ok = await editProgram((p, now) => setBlockLength(renameProgram(p, value, now), weeks, now));
    if (ok) showToast('Saved', 'good');
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plan settings"
      footer={
        <Button variant="primary" size="lg" block onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div class="field-form" key={`${open}`}>
        <label class="field">
          <span class="field-label">Name</span>
          <input ref={name} class="field-input" type="text" maxLength={40} defaultValue={program.name} autoComplete="off" />
        </label>
        <Dial
          label="Lighter week every"
          value={weeks}
          options={Array.from({ length: BLOCK_RANGE.max - BLOCK_RANGE.min + 1 }, (_, i) => BLOCK_RANGE.min + i)}
          onChange={setWeeks}
          display={String(weeks)}
          unit="weeks"
        />
        <p class="field-hint">A planned lighter week clears fatigue. Most lifters do one every 5–6 weeks; newer lifters can go longer.</p>
        <button
          type="button"
          class="swap-option"
          onClick={() => {
            void editProgram((p, now) => restartBlock(p, now), 'This week is now week 1');
            onClose();
          }}
        >
          <span class="swap-text">
            <span class="swap-name">Start a new block this week</span>
            <span class="swap-meta">Week 1 starts now; the lighter week moves accordingly</span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}

function WeekdaySheet({ weekday, onClose }: { weekday: number | null; onClose: () => void }) {
  const program = activeProgram.value!;
  const last = useRef(weekday ?? 0);
  if (weekday !== null) last.current = weekday;
  const index = last.current;
  const current = program.schedule[index] ?? null;
  const pick = (dayId: string | null) => {
    haptic('tap');
    void editProgram((p, now) => setWeekday(p, index, dayId, now));
    onClose();
  };
  return (
    <Sheet open={weekday !== null} onClose={onClose} title={WEEKDAY_LONG[index]}>
      <div class="choice-rows" role="radiogroup" aria-label={`${WEEKDAY_LONG[index]} session`}>
        {[...program.days.map((d) => ({ id: d.id as string | null, name: d.name, meta: `${plural(d.slots.length, 'exercise')} · about ${estimateDayMinutes(d)} min` })), { id: null, name: 'Rest', meta: 'No session' }].map((option) => (
          <button
            key={option.id ?? 'rest'}
            type="button"
            role="radio"
            aria-checked={current === option.id}
            class={current === option.id ? 'swap-option is-selected' : 'swap-option'}
            onClick={() => pick(option.id)}
          >
            <span class="swap-text">
              <span class="swap-name">{option.name}</span>
              <span class="swap-meta">{option.meta}</span>
            </span>
            {current === option.id && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>
      <p class="field-hint">The same session can go on more than one day.</p>
    </Sheet>
  );
}

function AddDaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const program = activeProgram.value!;
  const name = useRef<HTMLInputElement>(null);
  const [copyOf, setCopyOf] = useState<string | null>(null);
  const create = async () => {
    let created = '';
    const ok = await editProgram((p, now) => {
      const result = addDay(p, { name: name.current?.value ?? '', copyOf: copyOf ?? undefined }, now);
      created = result.dayId;
      return result.program;
    });
    onClose();
    if (ok && created) navigate({ name: 'plan-day', dayId: created });
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a session"
      footer={
        <Button variant="primary" size="lg" block onClick={() => void create()}>
          Create
        </Button>
      }
    >
      <div class="field-form" key={`${open}`}>
        <label class="field">
          <span class="field-label">Name</span>
          <input ref={name} class="field-input" type="text" maxLength={40} placeholder={`Day ${program.days.length + 1}`} autoComplete="off" />
        </label>
        <p class="check-label">Start from</p>
        <div class="choice-rows">
          {[{ id: null as string | null, name: 'Empty', meta: 'Add exercises yourself' }, ...program.days.map((d) => ({ id: d.id as string | null, name: `A copy of ${d.name}`, meta: plural(d.slots.length, 'exercise') }))].map((o) => (
            <button key={o.id ?? 'empty'} type="button" class={copyOf === o.id ? 'swap-option is-selected' : 'swap-option'} onClick={() => setCopyOf(o.id)}>
              <span class="swap-text">
                <span class="swap-name">{o.name}</span>
                <span class="swap-meta">{o.meta}</span>
              </span>
              {copyOf === o.id && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
        <p class="field-hint">It isn’t on your week until you put it on a day.</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- one day

export function PlanDayScreen({ dayId }: { dayId: string }) {
  const program = activeProgram.value;
  const gym = activeGym.value;
  const me = profile.value;
  const [openSlot, setOpenSlot] = useState<ProgramSlot | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSlot, setEditSlot] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const day = program ? programDay(program, dayId) : null;
  if (!program || !gym || !day) {
    return (
      <main class="screen">
        <ScreenHeader title="Session" onBack={() => goBack('plan')} backLabel="Plan" />
        <EmptyState icon="plan" title="This session isn’t in your plan">
          It may have been removed or rebuilt.
        </EmptyState>
      </main>
    );
  }
  const weekdays = program.schedule.flatMap((id, weekday) => (id === day.id ? [WEEKDAY_LONG[weekday]] : []));
  const remap = remapDayForGym(day, gym, me?.experience);
  const slotForEditor = editSlot ? (day.slots.find((s) => s.id === editSlot) ?? null) : null;

  return (
    <main class="screen">
      <ScreenHeader
        title={day.name}
        onBack={() => goBack('plan')}
        backLabel="Plan"
        actions={
          <Button size="sm" variant={editing ? 'primary' : 'secondary'} icon={editing ? 'check' : 'pencil'} onClick={() => setEditing(!editing)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
        }
      />
      <p class="day-meta">{[day.subtitle, weekdays.length ? weekdays.join(' and ') : 'Not on your week yet'].filter(Boolean).join(' · ')}</p>
      <p class="day-meta day-meta-sub">{dayMeta(day)}</p>

      {remap.changes.length > 0 && !editing && (
        <div class="day-note">
          <Notice icon="building" tone="accent" title={`At ${gym.name}`}>
            {remap.changes
              .map((c) => (c.to ? `${requireExercise(c.from).name} runs as ${requireExercise(c.to).name}` : `${requireExercise(c.from).name} sits out (nothing similar here)`))
              .join('. ')}
            .
          </Notice>
        </div>
      )}

      {editing ? (
        <DayEditor day={day} onEditSlot={setEditSlot} />
      ) : (
        <section class="day-card">
          <SessionList day={day} gym={gym} profile={me} onOpen={setOpenSlot} showPurpose />
        </section>
      )}

      {editing && (
        <div class="day-edit-actions">
          <Button block icon="plus" onClick={() => setPickerOpen(true)}>
            Add an exercise
          </Button>
          <Button block variant="ghost" icon="trash" disabled={program.days.length <= 1} onClick={() => setRemoveOpen(true)}>
            Remove this session
          </Button>
        </div>
      )}

      <ExerciseSheet slot={openSlot} gym={gym} onClose={() => setOpenSlot(null)} />
      <SlotEditor open={editSlot !== null} onClose={() => setEditSlot(null)} day={day} slot={slotForEditor} gym={gym} />
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={`Add to ${day.name}`}
        gym={gym}
        current={day.slots.map((s) => s.exerciseId)}
        onPick={(exerciseId) => {
          if (!me) return;
          void editProgram((p, now) => addSlot(p, day.id, exerciseId, me, now).program).then((ok) => ok && showToast(`${requireExercise(exerciseId).name} added`, 'good'));
        }}
      />
      <Sheet
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={`Remove ${day.name}?`}
        footer={
          <>
            <Button
              variant="danger"
              size="lg"
              block
              onClick={() => {
                setRemoveOpen(false);
                const name = day.name;
                void editProgram((p, now) => removeDay(p, day.id, now), `${name} removed`).then(() => navigate('plan'));
              }}
            >
              Remove session
            </Button>
            <Button variant="ghost" block onClick={() => setRemoveOpen(false)}>
              Keep it
            </Button>
          </>
        }
      >
        <p class="sheet-copy">
          Its days become rest days. Your workout history and records stay; you can undo this right after.
        </p>
      </Sheet>
    </main>
  );
}

function DayEditor({ day, onEditSlot }: { day: ProgramDay; onEditSlot: (slotId: string) => void }) {
  const name = useRef<HTMLInputElement>(null);
  return (
    <section class="day-editor">
      <label class="field">
        <span class="field-label">Session name</span>
        <input
          ref={name}
          class="field-input"
          type="text"
          maxLength={40}
          defaultValue={day.name}
          key={day.id}
          onBlur={() => {
            const value = name.current?.value ?? '';
            if (value.trim() && value.trim() !== day.name) void editProgram((p, now) => renameDay(p, day.id, value, now));
          }}
        />
      </label>
      {day.slots.length === 0 && <p class="sheet-copy">No exercises yet. Add the first one below.</p>}
      <ol class="edit-list">
        {day.slots.map((slot, i) => {
          const exercise = requireExercise(slot.exerciseId);
          const pairedWithNext = slot.superset && day.slots[i + 1]?.superset === slot.superset;
          const pairedWithPrev = slot.superset && day.slots[i - 1]?.superset === slot.superset;
          return (
            <li key={slot.id} class={`edit-row${pairedWithNext ? ' is-pair-top' : ''}${pairedWithPrev ? ' is-pair-bottom' : ''}`}>
              <button type="button" class="edit-main" onClick={() => onEditSlot(slot.id)}>
                <span class="edit-name">{exercise.name}</span>
                <span class="edit-meta num">
                  {setsAndReps(slot, exercise)}
                  {slot.rir !== undefined && exercise.metric === 'reps' ? ` · ${slot.rir} left` : ''}
                  {slot.superset ? ' · superset' : ''}
                </span>
              </button>
              <span class="edit-moves">
                <IconButton icon="chevron-down" label={`Move ${exercise.name} up`} class="edit-move is-up" onClick={() => void editProgram((p, now) => moveSlot(p, day.id, slot.id, -1, now))} />
                <IconButton icon="chevron-down" label={`Move ${exercise.name} down`} class="edit-move is-down" onClick={() => void editProgram((p, now) => moveSlot(p, day.id, slot.id, 1, now))} />
              </span>
            </li>
          );
        })}
      </ol>
      <p class="field-hint">Tap an exercise to change it, its sets and reps, or pair it as a superset.</p>
    </section>
  );
}

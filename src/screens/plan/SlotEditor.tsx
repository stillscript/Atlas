import { useEffect, useState } from 'preact/hooks';
import { editProgram } from '../../app/edit';
import type { Gym, ProgramDay, ProgramSlot } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { removeSlot, replaceExercise, SET_RANGE, toggleSuperset, updateSlot } from '../../domain/planEdit';
import { candidatesForPattern } from '../../domain/resolver';
import { haptic } from '../../lib/haptics';
import { Button, Segmented, Toggle } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Sheet } from '../../ui/Sheet';
import { Dial } from '../workout/Dial';
import { ExercisePicker } from './ExercisePicker';

const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const EFFORT = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

/** Edit one exercise in a day: which exercise, sets, rep range, effort, rest, superset. */
export function SlotEditor({ open, onClose, day, slot, gym }: { open: boolean; onClose: () => void; day: ProgramDay; slot: ProgramSlot | null; gym: Gym }) {
  const [draft, setDraft] = useState<ProgramSlot | null>(slot);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (open && slot) setDraft({ ...slot });
  }, [open, slot?.id, slot?.exerciseId]);

  if (!draft || !slot) return <Sheet open={open} onClose={onClose} title="Exercise">{null}</Sheet>;
  const exercise = requireExercise(slot.exerciseId);
  const timed = exercise.metric === 'time';
  const index = day.slots.findIndex((s) => s.id === slot.id);
  const next = day.slots[index + 1];
  const partner = slot.superset ? day.slots.find((s) => s.superset === slot.superset && s.id !== slot.id) : next && !next.superset ? next : undefined;
  const repOptions = timed ? range(5, 300, 5) : range(1, 50);
  const changed =
    draft.sets !== slot.sets || draft.repsLow !== slot.repsLow || draft.repsHigh !== slot.repsHigh || draft.rir !== slot.rir || draft.restSec !== slot.restSec;

  const save = async () => {
    const ok = await editProgram((p, now) =>
      updateSlot(p, day.id, slot.id, { sets: draft.sets, repsLow: draft.repsLow, repsHigh: Math.max(draft.repsLow, draft.repsHigh), rir: draft.rir, restSec: draft.restSec }, now),
    );
    if (ok) {
      haptic('success');
      showToast('Saved', 'good');
    }
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={exercise.name}
        footer={
          <>
            <Button variant="primary" size="lg" block disabled={!changed} onClick={() => void save()}>
              Save
            </Button>
            <Button
              variant="ghost"
              block
              icon="trash"
              onClick={() => {
                void editProgram((p, now) => removeSlot(p, day.id, slot.id, now), `${exercise.name} removed`);
                onClose();
              }}
            >
              Remove from {day.name}
            </Button>
          </>
        }
      >
        <div class="slot-editor">
          <button type="button" class="swap-option" onClick={() => setPickerOpen(true)}>
            <span class="swap-text">
              <span class="swap-name">Change exercise</span>
              <span class="swap-meta">Same movement first, or anything this gym can do</span>
            </span>
          </button>

          <div class="check-dials">
            <Dial label="Sets" value={draft.sets} options={range(SET_RANGE.min, SET_RANGE.max)} onChange={(sets) => setDraft({ ...draft, sets })} display={String(draft.sets)} />
            <Dial
              label="Rest"
              value={draft.restSec ?? 90}
              options={range(30, 300, 15)}
              onChange={(restSec) => setDraft({ ...draft, restSec })}
              display={clock(draft.restSec ?? 90)}
            />
          </div>
          <div class="check-dials">
            <Dial
              label={timed ? 'Seconds from' : 'Reps from'}
              value={draft.repsLow}
              options={repOptions}
              onChange={(repsLow) => setDraft({ ...draft, repsLow, repsHigh: Math.max(repsLow, draft.repsHigh) })}
              display={String(draft.repsLow)}
            />
            <Dial
              label="To"
              value={draft.repsHigh}
              options={repOptions.filter((r) => r >= draft.repsLow)}
              onChange={(repsHigh) => setDraft({ ...draft, repsHigh })}
              display={String(draft.repsHigh)}
            />
          </div>

          <p class="check-label">Reps left at the end of each set</p>
          <Segmented label="Reps left" options={EFFORT} value={String(draft.rir ?? 2)} onChange={(v) => setDraft({ ...draft, rir: Number(v) })} />
          <p class="field-hint">
            {(draft.rir ?? 2) === 0
              ? 'To your last good rep. Best kept for isolation lifts.'
              : `Stop ${draft.rir ?? 2} ${(draft.rir ?? 2) === 1 ? 'rep' : 'reps'} short of failure.`}
          </p>

          {partner && (
            <div class="row-inline">
              <label class="row-inline-text" for="slot-superset">
                <span class="field-label">Superset with {requireExercise(partner.exerciseId).name}</span>
                <span class="field-hint">Back to back, then rest. Saves time on different stations.</span>
              </label>
              <Toggle
                id="slot-superset"
                checked={Boolean(slot.superset)}
                onChange={() => {
                  void editProgram((p, now) => toggleSuperset(p, day.id, slot.id, now));
                  onClose();
                }}
              />
            </div>
          )}
        </div>
      </Sheet>
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={`Instead of ${exercise.name}`}
        gym={gym}
        suggested={candidatesForPattern(slot.pattern ?? exercise.pattern, gym).map((e) => e.id).filter((id) => id !== slot.exerciseId)}
        current={day.slots.map((s) => s.exerciseId)}
        onPick={(exerciseId) => {
          void editProgram((p, now) => replaceExercise(p, day.id, slot.id, exerciseId, now), `Changed to ${requireExercise(exerciseId).name}`);
          onClose();
        }}
      />
    </>
  );
}

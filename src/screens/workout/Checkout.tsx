import { useEffect, useRef, useState } from 'preact/hooks';
import { finishWorkout } from '../../app/workout';
import type { CheckOut, PainReport, Session } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { liftingDone, workSets } from '../../domain/workout';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/controls';
import { PillToggle } from '../../ui/choices';
import { Sheet } from '../../ui/Sheet';
import { ThreeWay } from './ThreeWay';

const FEEL = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Solid' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
] as const;

const AREAS = [
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'neck', label: 'Neck' },
  { value: 'lower-back', label: 'Lower back' },
  { value: 'hip', label: 'Hip' },
  { value: 'knee', label: 'Knee' },
  { value: 'ankle', label: 'Ankle' },
  { value: 'other', label: 'Other' },
];

/** The 10-second check-out: how it felt, energy, any pain and where. */
export function CheckoutSheet({ open, onClose, session }: { open: boolean; onClose: () => void; session: Session }) {
  const [feel, setFeel] = useState<CheckOut['feel'] | null>(null);
  const [energy, setEnergy] = useState<CheckOut['energy'] | null>(null);
  const [pain, setPain] = useState<boolean | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [side, setSide] = useState<PainReport['side']>();
  const [exerciseId, setExerciseId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const note = useRef<HTMLTextAreaElement>(null);
  const flagged = session.entries.filter((e) => e.sets.some((s) => s.pain));

  // Pain flagged during the workout pre-selects "yes" and that exercise.
  useEffect(() => {
    if (!open) return;
    if (flagged.length && pain === null) {
      setPain(true);
      setExerciseId(flagged[0]!.exerciseId);
    }
  }, [open]);

  const trained = session.entries.filter((e) => workSets(e).length > 0);
  const unfinished = !liftingDone(session);
  const ready = feel !== null && energy !== null && pain !== null && (!pain || areas.length > 0);

  const finish = async (withCheckout: boolean) => {
    setSaving(true);
    const checkout: CheckOut | undefined =
      withCheckout && feel !== null && energy !== null
        ? {
            feel,
            energy,
            pain: pain ? areas.map((area) => ({ area, side, exerciseId })) : [],
            note: note.current?.value.trim() || undefined,
            at: Date.now(),
          }
        : undefined;
    try {
      await finishWorkout(checkout);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How did that go?"
      footer={
        <>
          <Button variant="primary" size="lg" block disabled={!ready || saving} onClick={() => void finish(true)}>
            Save and finish
          </Button>
          <Button variant="ghost" block disabled={saving} onClick={() => void finish(false)}>
            Finish without check-out
          </Button>
        </>
      }
    >
      {unfinished && <p class="sheet-copy checkout-warn">Some exercises aren’t done. Finishing now saves what you logged.</p>}
      <div class="checkout">
        <p class="checkout-q">Overall</p>
        <div class="feel-row" role="radiogroup" aria-label="How the workout felt">
          {FEEL.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={feel === option.value}
              class={feel === option.value ? 'feel is-selected' : 'feel'}
              onClick={() => {
                haptic('tap');
                setFeel(option.value);
              }}
            >
              <span class="feel-n num">{option.value}</span>
              <span class="feel-w">{option.label}</span>
            </button>
          ))}
        </div>

        <p class="checkout-q">Energy now</p>
        <ThreeWay
          label="Energy now"
          value={energy}
          options={[
            { value: 1, label: 'Low' },
            { value: 2, label: 'OK' },
            { value: 3, label: 'High' },
          ]}
          onChange={setEnergy}
        />

        <p class="checkout-q">Any pain?</p>
        <ThreeWay
          label="Any pain"
          value={pain === null ? null : pain ? 1 : 0}
          options={[
            { value: 0, label: 'No' },
            { value: 1, label: 'Yes' },
          ]}
          onChange={(v) => setPain(v === 1)}
        />

        {pain && (
          <div class="pain">
            <p class="checkout-sub">Where?</p>
            <div class="pill-row">
              {AREAS.map((area) => (
                <PillToggle
                  key={area.value}
                  label={area.label}
                  selected={areas.includes(area.value)}
                  onToggle={() => setAreas(areas.includes(area.value) ? areas.filter((a) => a !== area.value) : [...areas, area.value])}
                />
              ))}
            </div>
            <p class="checkout-sub">Side</p>
            <div class="pill-row">
              {(['left', 'right', 'both'] as const).map((s) => (
                <PillToggle key={s} label={s[0]!.toUpperCase() + s.slice(1)} selected={side === s} onToggle={() => setSide(side === s ? undefined : s)} />
              ))}
            </div>
            {trained.length > 0 && (
              <>
                <p class="checkout-sub">During</p>
                <div class="pill-row">
                  {trained.map((e) => (
                    <PillToggle
                      key={e.id}
                      label={requireExercise(e.exerciseId).name}
                      selected={exerciseId === e.exerciseId}
                      onToggle={() => setExerciseId(exerciseId === e.exerciseId ? undefined : e.exerciseId)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <label class="field">
          <span class="checkout-sub">Note (optional)</span>
          <textarea ref={note} class="field-input field-area" rows={2} placeholder="Anything worth remembering" />
        </label>
      </div>
    </Sheet>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { measurements } from '../../app/coach';
import { removeMeasurement, saveMeasurementEntry } from '../../app/progress';
import { settings } from '../../app/state';
import type { Measurement, Units } from '../../db/types';
import { BODY_METRICS, latestValues, type BodyMetric } from '../../domain/progress';
import { toISODate } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { Button, Toggle } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Sheet } from '../../ui/Sheet';
// Form fields (.field, .field-input…) are shared with the workout sheets.
import '../workout/workout.css';

export const weightUnit = (units: Units) => units;
export const lengthUnit = (units: Units) => (units === 'kg' ? 'cm' : 'in');

/**
 * Log (or edit) body measurements. Every field is optional; last time's values show as
 * placeholders. Photos stay in your camera roll: Atlas only notes that you took one.
 */
export function MeasurementSheet({ open, onClose, entry }: { open: boolean; onClose: () => void; entry?: Measurement | null }) {
  const form = useRef<HTMLFormElement>(null);
  const [photo, setPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const units = settings.value.units;
  const last = latestValues(measurements.value.filter((m) => m.id !== entry?.id));

  useEffect(() => {
    if (open) {
      setPhoto(Boolean(entry?.photoTaken));
      setSaving(false);
    }
  }, [open, entry?.id]);

  const save = async (event: Event) => {
    event.preventDefault();
    if (!form.current) return;
    const data = new FormData(form.current);
    const values: Partial<Record<BodyMetric, number>> = {};
    for (const { key } of BODY_METRICS) {
      const raw = String(data.get(key) ?? '').replace(',', '.').trim();
      const value = Number(raw);
      if (raw && Number.isFinite(value) && value > 0) values[key] = Math.round(value * 10) / 10;
    }
    const note = String(data.get('note') ?? '');
    if (!Object.keys(values).length && !photo && !note.trim()) {
      showToast('Add at least one number');
      return;
    }
    setSaving(true);
    try {
      await saveMeasurementEntry({ date: String(data.get('date') || toISODate()), values, photoTaken: photo, note }, entry ?? undefined);
      haptic('success');
      showToast(entry ? 'Updated' : 'Saved', 'good');
      onClose();
    } catch {
      showToast('Couldn’t save that. Try again.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry ? 'Edit measurements' : 'Log measurements'}
      footer={
        <>
          <Button variant="primary" size="lg" block disabled={saving} onClick={() => form.current?.requestSubmit()}>
            Save
          </Button>
          {entry && (
            <Button
              variant="ghost"
              block
              icon="trash"
              disabled={saving}
              onClick={() => {
                void removeMeasurement(entry.id).then(() => {
                  showToast('Entry deleted');
                  onClose();
                });
              }}
            >
              Delete entry
            </Button>
          )}
        </>
      }
    >
      <form ref={form} class="field-form" key={`${open}:${entry?.id ?? 'new'}`} onSubmit={(e) => void save(e)}>
        <label class="field">
          <span class="field-label">Date</span>
          <input class="field-input" name="date" type="date" defaultValue={entry?.date ?? toISODate()} max={toISODate()} required />
        </label>
        <div class="field-grid">
          {BODY_METRICS.map(({ key, label, kind }) => (
            <label key={key} class="field">
              <span class="field-label">
                {label} ({kind === 'weight' ? weightUnit(units) : lengthUnit(units)})
              </span>
              <input
                class="field-input num"
                name={key}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={entry?.[key] !== undefined ? String(entry[key]) : ''}
                placeholder={last[key] !== undefined ? String(last[key]) : ''}
              />
            </label>
          ))}
        </div>
        <div class="row-inline">
          <label class="row-inline-text" for="m-photo">
            <span class="field-label">Took a progress photo</span>
            <span class="field-hint">Photos stay in your camera roll. Atlas only marks the date.</span>
          </label>
          <Toggle id="m-photo" checked={photo} onChange={setPhoto} />
        </div>
        <label class="field">
          <span class="field-label">Note</span>
          <input class="field-input" name="note" type="text" autoComplete="off" defaultValue={entry?.note ?? ''} placeholder="Optional" />
        </label>
        <p class="field-hint">Same time of day, same conditions: first thing in the morning works best for weight.</p>
      </form>
    </Sheet>
  );
}

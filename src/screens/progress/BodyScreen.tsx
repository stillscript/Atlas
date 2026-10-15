import { useState } from 'preact/hooks';
import { measurements } from '../../app/coach';
import { goBack } from '../../app/router';
import { settings } from '../../app/state';
import type { Measurement } from '../../db/types';
import { BODY_METRICS, bodySeries, bodySummary, movingAverage, type BodyMetric } from '../../domain/progress';
import { formatMonthDay } from '../../lib/format';
import { LineChart } from '../../ui/Chart';
import { Button } from '../../ui/controls';
import { EmptyState } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { lengthUnit, MeasurementSheet, weightUnit } from './MeasurementSheet';
import './progress.css';

/** Body measurements over time: one chart per measure, and every entry (tap to edit). */
export function BodyScreen() {
  const list = measurements.value;
  const units = settings.value.units;
  const [metric, setMetric] = useState<BodyMetric>('weight');
  const [editing, setEditing] = useState<{ open: boolean; entry: Measurement | null }>({ open: false, entry: null });
  const withData = BODY_METRICS.filter(({ key }) => list.some((m) => typeof m[key] === 'number'));
  const active = withData.some((m) => m.key === metric) ? metric : (withData[0]?.key ?? 'weight');
  const info = BODY_METRICS.find((m) => m.key === active)!;
  const unit = info.kind === 'weight' ? weightUnit(units) : lengthUnit(units);
  const points = bodySeries(list, active);
  const summary = bodySummary(points, active, Date.now());
  const entries = [...list].sort((a, b) => b.at - a.at);

  return (
    <main class="screen no-tabbar progress-detail">
      <ScreenHeader
        title="Body"
        onBack={() => goBack('progress')}
        actions={
          <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing({ open: true, entry: null })}>
            Log
          </Button>
        }
      />

      {!list.length ? (
        <EmptyState
          icon="progress"
          title="Track more than the scale"
          action={
            <Button variant="primary" size="lg" block icon="plus" onClick={() => setEditing({ open: true, entry: null })}>
              Log measurements
            </Button>
          }
        >
          Weight, waist, chest, shoulders, arm and thigh. Weekly is plenty; the trend matters, not a single day.
        </EmptyState>
      ) : (
        <>
          {withData.length > 1 && (
            <div class="chip-row" role="radiogroup" aria-label="Measure">
              {withData.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={m.key === active}
                  class={m.key === active ? 'chip is-selected' : 'chip'}
                  onClick={() => setMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <div class="detail-card">
            <LineChart points={points} average={active === 'weight' && points.length > 2 ? movingAverage(points) : undefined} label={info.label} unit={unit} format={(v) => String(Math.round(v * 10) / 10)} />
            <p class="detail-hint num">
              {summary?.change30 !== null && summary?.change30 !== undefined
                ? `${summary.change30 > 0 ? '+' : ''}${summary.change30} ${unit} over the last 30 days${active === 'weight' ? ' (7-day average, shown as the solid line)' : ''}.`
                : active === 'weight'
                  ? 'The solid line is a 7-day average, which smooths out day-to-day water swings.'
                  : `${points.length} ${points.length === 1 ? 'entry' : 'entries'} so far.`}
            </p>
          </div>

          <section class="progress-section">
            <p class="ex-section-title">Entries</p>
            <div class="detail-card history-list">
              {entries.map((m) => (
                <button key={m.id} type="button" class="history-row history-button" onClick={() => setEditing({ open: true, entry: m })}>
                  <span class="history-date">
                    {formatMonthDay(m.date)}
                    {m.photoTaken && (
                      <span class="history-tag">
                        <Icon name="check" size={12} /> Photo
                      </span>
                    )}
                  </span>
                  <span class="history-sets num">
                    {BODY_METRICS.filter(({ key }) => typeof m[key] === 'number')
                      .map(({ key, label, kind }) => `${label} ${m[key]} ${kind === 'weight' ? weightUnit(units) : lengthUnit(units)}`)
                      .join(' · ') || 'No numbers'}
                    {m.note ? ` · ${m.note}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <MeasurementSheet open={editing.open} entry={editing.entry} onClose={() => setEditing({ ...editing, open: false })} />
    </main>
  );
}

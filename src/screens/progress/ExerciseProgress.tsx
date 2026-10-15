import { useMemo, useState } from 'preact/hooks';
import { goBack } from '../../app/router';
import { activeGym } from '../../app/state';
import { pastSessions } from '../../app/workout';
import { exposuresByExercise } from '../../coach/measures';
import type { RepsInReserve } from '../../db/types';
import { exerciseById } from '../../domain/catalog';
import { exerciseRecords, exerciseSeries, type ExerciseMetric } from '../../domain/progress';
import { formatMonthDay } from '../../lib/format';
import { LineChart } from '../../ui/Chart';
import { Button, Segmented } from '../../ui/controls';
import { EmptyState } from '../../ui/feedback';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Sheet } from '../../ui/Sheet';
import { FormNotes } from '../plan/ExerciseSheet';
import { effortTag } from '../workout/helpers';
import './progress.css';

const VARIANT_LABEL: Record<string, string> = { 'lighter-week': 'Lighter week', return: 'Easing back', lighter: 'Lighter day', short: 'Short version' };

/** One exercise over time: a chart, records, and every session's sets. */
export function ExerciseProgress({ exerciseId }: { exerciseId: string }) {
  const exercise = exerciseById(exerciseId);
  const units = activeGym.value?.units ?? 'lb';
  const list = useMemo(() => exposuresByExercise(pastSessions.value).get(exerciseId) ?? [], [pastSessions.value, exerciseId]);
  const bodyweight = list.length > 0 && list.every((e) => e.top === null);
  const [metric, setMetric] = useState<ExerciseMetric>(bodyweight ? 'reps' : 'e1rm');
  const [formOpen, setFormOpen] = useState(false);

  if (!exercise) return null;
  const header = <ScreenHeader title={exercise.name} eyebrow={list.length ? `${list.length} ${list.length === 1 ? 'session' : 'sessions'}` : undefined} onBack={() => goBack('progress')} />;
  if (!list.length) {
    return (
      <main class="screen no-tabbar">
        {header}
        <EmptyState icon="progress" title="No sessions yet">
          Your sets on {exercise.name} will chart here after your first workout with it.
        </EmptyState>
      </main>
    );
  }

  const options: { value: ExerciseMetric; label: string }[] = bodyweight
    ? [{ value: 'reps', label: 'Best set' }]
    : [
        { value: 'e1rm', label: 'Est. max' },
        { value: 'top', label: 'Top weight' },
        { value: 'volume', label: 'Volume' },
      ];
  const points = exerciseSeries(list, metric);
  const records = exerciseRecords(list);
  const byAt = new Map(list.map((e) => [e.at, e]));
  const unit = metric === 'reps' ? 'reps' : units;

  return (
    <main class="screen no-tabbar progress-detail">
      {header}

      {options.length > 1 && <Segmented label="Chart" options={options} value={metric} onChange={setMetric} />}
      <div class="detail-card">
        <LineChart
          points={points}
          label={`${exercise.name}, ${options.find((o) => o.value === metric)?.label ?? ''}`}
          unit={unit}
          detail={(p) => {
            const e = byAt.get(p.at);
            if (!e) return '';
            const best = e.sets.reduce((b, s) => ((s.load ?? 0) * (1 + s.reps / 30) >= (b.load ?? 0) * (1 + b.reps / 30) ? s : b), e.sets[0]!);
            return best.load !== null ? `${best.load} × ${best.reps}` : `${best.reps} reps`;
          }}
        />
        <p class="detail-hint">
          {metric === 'e1rm'
            ? 'Estimated one-rep max from your best set (Epley, reps actually done). Hollow points are lighter sessions.'
            : metric === 'volume'
              ? `Weight × reps across all sets${exercise.loadMode === 'per-hand' ? ' (per hand)' : ''}.`
              : metric === 'top'
                ? 'Heaviest weight used each session.'
                : 'Most reps in a single set each session.'}
        </p>
      </div>

      <section class="progress-section">
        <p class="ex-section-title">Records</p>
        <div class="detail-card records-grid">
          {records.bestMax && (
            <div>
              <p class="stat-label">Best estimated max</p>
              <p class="stat-value num">
                {records.bestMax.value} {units}
              </p>
              <p class="record-sub num">
                {records.bestMax.load} × {records.bestMax.reps} · {formatMonthDay(records.bestMax.date)}
              </p>
            </div>
          )}
          {records.heaviest && (
            <div>
              <p class="stat-label">Heaviest</p>
              <p class="stat-value num">
                {records.heaviest.load} {units}
              </p>
              <p class="record-sub num">
                × {records.heaviest.reps} · {formatMonthDay(records.heaviest.date)}
              </p>
            </div>
          )}
          {records.mostReps && (
            <div>
              <p class="stat-label">Most reps</p>
              <p class="stat-value num">{records.mostReps.reps}</p>
              <p class="record-sub num">
                {records.mostReps.load !== null ? `at ${records.mostReps.load} ${units} · ` : ''}
                {formatMonthDay(records.mostReps.date)}
              </p>
            </div>
          )}
        </div>
        {records.repRecords.length > 1 && (
          <div class="detail-card rep-records">
            <p class="stat-label">Best reps at each weight</p>
            {records.repRecords.map((r) => (
              <div key={r.load} class="rep-record num">
                <span>
                  {r.load} {units}
                </span>
                <span class="rep-record-bar" style={{ width: `${(r.reps / Math.max(...records.repRecords.map((x) => x.reps))) * 100}%` }} />
                <span>{r.reps}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section class="progress-section">
        <p class="ex-section-title">History</p>
        <div class="detail-card history-list">
          {[...list].reverse().map((e) => (
            <div key={e.sessionId} class="history-row">
              <p class="history-date">
                {formatMonthDay(e.date)}
                {e.variant && VARIANT_LABEL[e.variant] && <span class="history-tag">{VARIANT_LABEL[e.variant]}</span>}
                {e.calibrating && <span class="history-tag">Finding weight</span>}
              </p>
              <p class="history-sets num">
                {e.sets.map((s) => `${s.load !== null ? `${s.load} × ` : ''}${s.reps}${s.rir !== undefined ? ` (${effortTag(s.rir as RepsInReserve)})` : ''}`).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div class="progress-section">
        <Button block icon="book" onClick={() => setFormOpen(true)}>
          Form notes
        </Button>
      </div>
      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title={exercise.name}>
        <div class="ex-detail">
          <FormNotes exercise={exercise} />
        </div>
      </Sheet>
    </main>
  );
}

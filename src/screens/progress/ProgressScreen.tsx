import { useMemo, useState } from 'preact/hooks';
import { measurements, renderContext } from '../../app/coach';
import { navigate } from '../../app/router';
import { activeProgram, profile, settings } from '../../app/state';
import { pastSessions } from '../../app/workout';
import { streakWeeks } from '../../coach/measures';
import { renderWin } from '../../coach/render';
import { bodySeries, bodySummary, exerciseSummaries, recordHistory, weekHistory, type WeekSummary } from '../../domain/progress';
import { WEEKDAY_LETTER } from '../../domain/schedule';
import { summarize } from '../../domain/workout';
import { formatMonthDay, plural } from '../../lib/format';
import { Sparkline } from '../../ui/Chart';
import { Button, IconButton } from '../../ui/controls';
import { EmptyState } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { MeasurementSheet, weightUnit } from './MeasurementSheet';
import './progress.css';
import { ExerciseIcon } from '../../ui/ExerciseIcon';

const RECORDS_SHOWN = 4;
const LIFTS_SHOWN = 8;
const WORKOUTS_SHOWN = 4;

export function ProgressScreen() {
  const sessions = pastSessions.value;
  const program = activeProgram.value;
  const me = profile.value;
  const now = Date.now();
  const [logOpen, setLogOpen] = useState(false);
  const [allRecords, setAllRecords] = useState(false);
  const [allLifts, setAllLifts] = useState(false);
  const [allWorkouts, setAllWorkouts] = useState(false);
  const workouts = useMemo(() => [...sessions].reverse(), [sessions]);

  const weeks = useMemo(() => (program ? weekHistory(program, sessions, now, 8) : []), [program, sessions]);
  const records = useMemo(() => recordHistory(sessions), [sessions]);
  const lifts = useMemo(() => exerciseSummaries(sessions, now), [sessions]);
  const streak = program && me ? streakWeeks(program, sessions, now, me.goal === 'general') : 0;
  const settingsButton = <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />;

  return (
    <main class="screen progress">
      <ScreenHeader title="Progress" actions={settingsButton} />

      {sessions.length === 0 ? (
        <EmptyState icon="progress" title="Your progress will show up here">
          Strength charts and personal records appear after your first workout. You can log body measurements any time.
        </EmptyState>
      ) : (
        <>
          <StreakCard streak={streak} week={weeks[weeks.length - 1]} />
          <Calendar weeks={weeks} />

          <section class="progress-section">
            <p class="ex-section-title">Workouts</p>
            <div class="record-list">
              {(allWorkouts ? workouts : workouts.slice(0, WORKOUTS_SHOWN)).map((session) => {
                const stats = summarize(session);
                return (
                  <button key={session.id} type="button" class="record-row" onClick={() => navigate({ name: 'summary', sessionId: session.id })}>
                    <span class="record-row-text">
                      <span class="record-row-title">{session.dayName ?? 'Workout'}</span>
                      <span class="record-row-date num">
                        {formatMonthDay(session.date)} · {plural(stats.workSets, 'set')} · {stats.minutes} min
                      </span>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </button>
                );
              })}
              {!allWorkouts && workouts.length > WORKOUTS_SHOWN && (
                <button type="button" class="progress-more" onClick={() => setAllWorkouts(true)}>
                  Show all {workouts.length}
                </button>
              )}
            </div>
          </section>

          {records.length > 0 && (
            <section class="progress-section">
              <p class="ex-section-title">Records</p>
              <div class="record-list">
                {(allRecords ? records : records.slice(0, RECORDS_SHOWN)).map((record) => {
                  const text = renderWin(record, renderContext.value);
                  return (
                    <button
                      key={record.id}
                      type="button"
                      class="record-row"
                      onClick={() => record.exerciseId && navigate({ name: 'progress-exercise', exerciseId: record.exerciseId })}
                    >
                      <span class="record-row-icon">
                        <Icon name="trophy" size={18} />
                      </span>
                      <span class="record-row-text">
                        <span class="record-row-title num">{text.title}</span>
                        <span class="record-row-date">{formatMonthDay(record.date)}</span>
                      </span>
                      <Icon name="chevron-right" size={16} />
                    </button>
                  );
                })}
                {!allRecords && records.length > RECORDS_SHOWN && (
                  <button type="button" class="progress-more" onClick={() => setAllRecords(true)}>
                    Show all {records.length}
                  </button>
                )}
              </div>
            </section>
          )}

          {lifts.length > 0 && (
            <section class="progress-section">
              <p class="ex-section-title">Lifts</p>
              <div class="lift-list">
                {(allLifts ? lifts : lifts.slice(0, LIFTS_SHOWN)).map((lift) => (
                  <button key={lift.exerciseId} type="button" class="lift-item" onClick={() => navigate({ name: 'progress-exercise', exerciseId: lift.exerciseId })}>
                    <ExerciseIcon exerciseId={lift.exerciseId} size="sm" />
                    <span class="lift-item-text">
                      <span class="lift-item-name">{lift.name}</span>
                      <span class="lift-item-meta num">
                        {lift.bodyweight ? `Best ${lift.best} reps` : `Est. max ${lift.latest} ${renderContext.value.units}`}
                        {lift.change !== null && lift.change !== 0 && (
                          <span class={lift.change > 0 ? 'delta is-up' : 'delta is-down'}>
                            {lift.change > 0 ? ' +' : ' '}
                            {lift.change} in 4 wk
                          </span>
                        )}
                      </span>
                    </span>
                    <Sparkline values={lift.spark} label={`${lift.name} trend`} />
                    <Icon name="chevron-right" size={16} />
                  </button>
                ))}
                {!allLifts && lifts.length > LIFTS_SHOWN && (
                  <button type="button" class="progress-more" onClick={() => setAllLifts(true)}>
                    Show all {lifts.length}
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      )}

      <BodyCard onLog={() => setLogOpen(true)} />
      <MeasurementSheet open={logOpen} onClose={() => setLogOpen(false)} />
    </main>
  );
}

function StreakCard({ streak, week }: { streak: number; week?: WeekSummary }) {
  const lit = streak >= 2;
  return (
    <div class={lit ? 'streak-card is-lit' : 'streak-card'}>
      <span class="streak-icon">
        <Icon name="flame" size={22} />
      </span>
      <div class="streak-text">
        <p class="streak-title num">{streak === 0 ? 'No streak yet' : streak === 1 ? '1 full week' : `${streak}-week streak`}</p>
        <p class="streak-body num">
          {week ? `This week: ${week.done} of ${week.planned} sessions` : ''}
          {streak === 0 && week && week.done < week.planned ? '. Every planned session this week starts a streak.' : ''}
        </p>
      </div>
    </div>
  );
}

function Calendar({ weeks: all }: { weeks: WeekSummary[] }) {
  // Weeks before the plan and before any training stay off the calendar (at least 4 rows shown).
  const firstActive = all.findIndex((w) => w.planned > 0 || w.days.some((d) => d.done));
  const weeks = all.slice(Math.max(0, Math.min(firstActive === -1 ? all.length : firstActive, all.length - 4)));
  return (
    <section class="progress-section" aria-label={`Last ${weeks.length} weeks`}>
      <p class="ex-section-title">Last {weeks.length} weeks</p>
      <div class="calendar">
        <div class="cal-row cal-head" aria-hidden="true">
          {WEEKDAY_LETTER.map((l, i) => (
            <span key={i} class="cal-letter">
              {l}
            </span>
          ))}
          <span class="cal-total" />
        </div>
        {weeks.map((week) => (
          <div key={week.start} class="cal-row" role="group" aria-label={`Week of ${formatMonthDay(week.start)}: ${week.done} of ${week.planned} sessions`}>
            {week.days.map((day) => {
              const missed = day.planned && !day.done && !day.future && !day.today;
              const classes = ['cal-day', day.done ? 'is-done' : '', missed ? 'is-missed' : '', day.planned && (day.future || day.today) && !day.done ? 'is-upcoming' : '', day.today ? 'is-today' : '']
                .filter(Boolean)
                .join(' ');
              return <span key={day.date} class={classes} title={day.date} />;
            })}
            <span class={week.complete ? 'cal-total is-complete num' : 'cal-total num'}>
              {week.complete ? <Icon name="check" size={14} /> : week.planned ? `${week.done}/${week.planned}` : week.done || ''}
            </span>
          </div>
        ))}
        <p class="cal-legend">
          <span>
            <span class="cal-day is-done" /> Done
          </span>
          <span>
            <span class="cal-day is-missed" /> Missed
          </span>
          <span>
            <span class="cal-day is-upcoming" /> Planned
          </span>
        </p>
      </div>
    </section>
  );
}

function BodyCard({ onLog }: { onLog: () => void }) {
  const list = measurements.value;
  const unit = weightUnit(settings.value.units);
  const points = bodySeries(list, 'weight');
  const summary = bodySummary(points, 'weight', Date.now());
  return (
    <section class="progress-section">
      <p class="ex-section-title">Body</p>
      <div class="body-card">
        {summary ? (
          <button type="button" class="body-card-main" onClick={() => navigate({ name: 'progress-body' })}>
            <span class="body-card-text">
              <span class="body-card-value num">
                {summary.latest.value} <span class="body-card-unit">{unit}</span>
              </span>
              <span class="body-card-meta num">
                {summary.change30 !== null ? `${summary.change30 > 0 ? '+' : ''}${summary.change30} in 30 days` : formatMonthDay(summary.latest.date)}
              </span>
            </span>
            <Sparkline values={points.slice(-12).map((p) => p.value)} label="Body weight trend" />
            <Icon name="chevron-right" size={16} />
          </button>
        ) : (
          <button type="button" class="body-card-main" onClick={() => navigate({ name: 'progress-body' })}>
            <span class="body-card-text">
              <span class="body-card-value">Body measurements</span>
              <span class="body-card-meta">Weight, waist, chest, shoulders, arm, thigh</span>
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        )}
        <Button size="sm" icon="plus" onClick={onLog}>
          Log
        </Button>
      </div>
    </section>
  );
}

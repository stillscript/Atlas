import { navigate } from '../../app/router';
import { activeGym } from '../../app/state';
import { exerciseHistory, pastSessions } from '../../app/workout';
import { requireExercise } from '../../domain/catalog';
import { detectRecords, summarize, workSets } from '../../domain/workout';
import { formatLongDate } from '../../lib/format';
import { Button } from '../../ui/controls';
import { EmptyState } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { cardioSummary } from './Finishers';
import { effortTag, loadContext, setText } from './helpers';
import './workout.css';

const FEEL_WORDS = ['', 'Rough', 'Hard', 'Solid', 'Good', 'Great'];

export function SummaryScreen({ sessionId }: { sessionId: string }) {
  const session = pastSessions.value.find((s) => s.id === sessionId);
  const gym = activeGym.value;
  if (!session || !gym) {
    return (
      <main class="screen no-tabbar">
        <ScreenHeader title="Workout" onBack={() => navigate('today', { replace: true })} />
        <EmptyState icon="history" title="Workout not found">
          It may have been removed by restoring a backup.
        </EmptyState>
      </main>
    );
  }

  const stats = summarize(session);
  const records = detectRecords(session, exerciseHistory.value);
  const trained = session.entries.filter((e) => workSets(e).length > 0);

  return (
    <main class="screen no-tabbar summary">
      <ScreenHeader eyebrow={formatLongDate(new Date(session.startedAt))} title={session.dayName ?? 'Workout'} />
      <p class="summary-done">
        <Icon name="check" size={18} /> Workout saved
      </p>

      <div class="summary-stats">
        <div class="stat">
          <p class="stat-label">Time</p>
          <p class="stat-value num">{stats.minutes} min</p>
        </div>
        <div class="stat">
          <p class="stat-label">Sets</p>
          <p class="stat-value num">{stats.workSets}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Exercises</p>
          <p class="stat-value num">
            {stats.exercisesDone}
            {stats.exercisesPlanned > stats.exercisesDone && <span class="stat-of">/{stats.exercisesPlanned}</span>}
          </p>
        </div>
        {stats.cardioMinutes > 0 && (
          <div class="stat">
            <p class="stat-label">Cardio</p>
            <p class="stat-value num">{stats.cardioMinutes} min</p>
          </div>
        )}
      </div>

      {records.length > 0 && (
        <section class="records" aria-label="New records">
          {records.map((record) => {
            const ctx = loadContext({ exerciseId: record.exerciseId }, gym);
            return (
              <div key={record.exerciseId} class="record">
                <span class="record-icon">
                  <Icon name="trophy" size={22} />
                </span>
                <div>
                  <p class="record-title">New best: {ctx.exercise.name}</p>
                  <p class="record-detail num">
                    {setText(record.set, ctx, true)}
                    {record.kind === 'heaviest'
                      ? ` · heaviest yet (was ${record.previous})`
                      : ` · estimated max ${record.value} (was ${record.previous})`}
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section class="summary-list">
        {trained.map((entry) => {
          const ctx = loadContext(entry, gym);
          return (
            <div key={entry.id} class="summary-row">
              <p class="summary-name">{requireExercise(entry.exerciseId).name}</p>
              <p class="summary-sets num">
                {workSets(entry)
                  .map((s) => `${setText(s, ctx)}${s.rir !== undefined ? ` (${effortTag(s.rir)})` : ''}`)
                  .join(' · ')}
              </p>
            </div>
          );
        })}
        {session.cardio.map((c) => (
          <div key={c.id} class="summary-row">
            <p class="summary-name">{requireExercise(c.exerciseId).name}</p>
            <p class="summary-sets num">{cardioSummary(c, gym)}</p>
          </div>
        ))}
      </section>

      {session.checkout && (
        <p class="summary-checkout">
          Felt {FEEL_WORDS[session.checkout.feel]?.toLowerCase()}, energy {['', 'low', 'OK', 'high'][session.checkout.energy]}
          {session.checkout.pain.length ? `, pain: ${session.checkout.pain.map((p) => p.area.replace('-', ' ')).join(', ')}` : ''}.
        </p>
      )}

      <div class="summary-actions">
        <Button variant="primary" size="lg" block onClick={() => navigate('today', { replace: true })}>
          Done
        </Button>
      </div>
    </main>
  );
}

import { useRef, useState } from 'preact/hooks';
import { reviewFor } from '../../app/coach';
import { gyms } from '../../app/edit';
import { goBack, navigate } from '../../app/router';
import { activeGym } from '../../app/state';
import { changePastSession, deletePastSession, pastSessions } from '../../app/workout';
import type { Session } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { deleteCardio, hasLoggedWork, removeEntry, summarize, workSets } from '../../domain/workout';
import { BackupReminder } from '../BackupReminder';
import { CoachCard, WinCard } from '../coach/CoachCard';
import { formatLongDate } from '../../lib/format';
import { Button, IconButton } from '../../ui/controls';
import { EmptyState, Notice, showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Sheet } from '../../ui/Sheet';
import { cardioSummary } from './Finishers';
import { effortTag, loadContext, setText } from './helpers';
import { EditSetSheet } from './WorkoutSheets';
import './workout.css';

const FEEL_WORDS = ['', 'Rough', 'Hard', 'Solid', 'Good', 'Great'];

/** "Workout saved" only right after finishing; later this page is history. */
const JUST_FINISHED_MS = 30 * 60_000;

/**
 * A finished workout: right after finishing (wins, Coach notes, backup reminder) and from history.
 * Edit fixes what was logged: a set's weight, reps or rating, a set or exercise that shouldn't be
 * there, or the whole workout (started by accident). Records, charts and the Coach follow.
 */
export function SummaryScreen({ sessionId }: { sessionId: string }) {
  const session = pastSessions.value.find((s) => s.id === sessionId);
  // The gym the workout was done in (its machines' weights), else the current one.
  const gym = gyms.value.find((g) => g.id === session?.gymId) ?? activeGym.value;
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<{ entryIndex: number; setId: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Keeps the set sheet's content while it slides closed.
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;

  if (!session || !gym) {
    return (
      <main class="screen no-tabbar">
        <ScreenHeader title="Workout" onBack={() => goBack('today')} />
        <EmptyState icon="history" title="Workout not found">
          It may have been deleted, or removed by restoring a backup.
        </EmptyState>
      </main>
    );
  }

  const stats = summarize(session);
  const justFinished = Date.now() - (session.endedAt ?? 0) < JUST_FINISHED_MS;
  const review = editing ? null : reviewFor(session.id);
  // "Next time" is about the next session: only meaningful right after this one.
  const showNext = justFinished && review && (review.next.length > 0 || review.insight);
  const trained = session.entries.filter((e) => workSets(e).length > 0);
  const apply = (change: (s: Session, now: number) => Session) => void changePastSession(session.id, change);

  const removeExercise = (entryIndex: number) => {
    const before = session;
    const name = requireExercise(session.entries[entryIndex]!.exerciseId).name;
    apply((s, now) => removeEntry(s, entryIndex, now));
    showToast(`${name} removed`, 'neutral', 6000, { label: 'Undo', onClick: () => void changePastSession(session.id, () => before) });
  };

  return (
    <main class="screen no-tabbar summary">
      <ScreenHeader
        eyebrow={formatLongDate(new Date(session.startedAt))}
        title={session.dayName ?? 'Workout'}
        onBack={justFinished ? undefined : () => goBack('progress')}
        backLabel="Back"
        actions={
          editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Done
            </Button>
          ) : (
            <IconButton icon="pencil" label="Edit workout" onClick={() => setEditing(true)} />
          )
        }
      />
      {justFinished && !editing && (
        <p class="summary-done">
          <Icon name="check" size={18} /> Workout saved
        </p>
      )}

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
      </div>

      {review && review.wins.length > 0 && (
        <section class="records" aria-label="Wins">
          {review.wins.map((win) => (
            <WinCard key={win.id} win={win} />
          ))}
        </section>
      )}

      {showNext && review && (
        <section class="summary-coach" aria-label="Coach">
          <p class="ex-section-title">Next time</p>
          <div class="coach-stack">
            {review.next.map((rec) => (
              <CoachCard key={rec.id} rec={rec} compact />
            ))}
            {review.insight && <CoachCard rec={review.insight} compact />}
          </div>
        </section>
      )}

      {editing ? (
        <>
          <p class="fix-hint">Tap a set to change it. Records, charts and the Coach update with your fix.</p>
          {!hasLoggedWork(session) && (
            <Notice icon="info" tone="warn" title="Nothing logged here anymore">
              Delete the workout to take it out of your history.
            </Notice>
          )}
          <section class="summary-list">
            {session.entries.map((entry, entryIndex) => {
              const sets = workSets(entry);
              if (!sets.length) return null;
              const ctx = loadContext(entry, gym);
              return (
                <div key={entry.id} class="summary-row fix-row">
                  <div class="fix-head">
                    <p class="summary-name">{ctx.exercise.name}</p>
                    <IconButton icon="trash" label={`Remove ${ctx.exercise.name}`} onClick={() => removeExercise(entryIndex)} />
                  </div>
                  <div class="fix-sets">
                    {sets.map((set) => (
                      <button key={set.id} type="button" class="fix-set num" onClick={() => setTarget({ entryIndex, setId: set.id })}>
                        {setText(set, ctx)}
                        {set.rir !== undefined && <span class="fix-set-rir">{effortTag(set.rir)}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {session.cardio.map((c) => (
              <div key={c.id} class="summary-row fix-row">
                <div class="fix-head">
                  <p class="summary-name">{requireExercise(c.exerciseId).name}</p>
                  <IconButton icon="trash" label={`Remove ${requireExercise(c.exerciseId).name}`} onClick={() => apply((s, now) => deleteCardio(s, c.id, now))} />
                </div>
                <p class="summary-sets num">{cardioSummary(c, gym)}</p>
              </div>
            ))}
          </section>
          <div class="summary-actions">
            <Button variant="ghost" block icon="trash" onClick={() => setConfirmDelete(true)}>
              Delete workout
            </Button>
          </div>
        </>
      ) : (
        <>
          {(trained.length > 0 || session.cardio.length > 0) && (
            <section class="summary-list">
              {trained.map((entry) => {
                const ctx = loadContext(entry, gym);
                return (
                  <div key={entry.id} class="summary-row">
                    <p class="summary-name">{ctx.exercise.name}</p>
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
          )}

          {session.checkout && (
            <p class="summary-checkout">
              Felt {FEEL_WORDS[session.checkout.feel]?.toLowerCase()}, energy {['', 'low', 'OK', 'high'][session.checkout.energy]}
              {session.checkout.pain.length ? `, pain: ${session.checkout.pain.map((p) => p.area.replace('-', ' ')).join(', ')}` : ''}.
            </p>
          )}

          {/* Right after a workout is a good moment to save a copy, when one is due. */}
          {justFinished && (
            <div class="summary-backup">
              <BackupReminder />
            </div>
          )}

          <div class="summary-actions">
            <Button variant="primary" size="lg" block onClick={() => (justFinished ? navigate('today', { replace: true }) : goBack('progress'))}>
              Done
            </Button>
          </div>
        </>
      )}

      {lastTarget.current && (
        <EditSetSheet open={target !== null} onClose={() => setTarget(null)} session={session} target={lastTarget.current} gym={gym} apply={apply} />
      )}
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this workout?"
        footer={
          <>
            <Button
              variant="danger"
              size="lg"
              block
              onClick={() => {
                setConfirmDelete(false);
                void deletePastSession(session.id);
                goBack('progress');
              }}
            >
              Delete workout
            </Button>
            <Button variant="ghost" block onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </>
        }
      >
        <p class="sheet-copy">Its sets come out of your history, records and charts. You can undo right after.</p>
      </Sheet>
    </main>
  );
}

import { changeSession } from '../../app/workout';
import type { CardioEntry, Gym, Session } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { deleteCardio, summarize, toggleExtraDone } from '../../domain/workout';
import { Button } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import type { OpenSheet } from './WorkoutSheets';

const METERS_PER_MILE = 1609.344;

/**
 * Cardio logged by Atlas before it focused on strength (cardio now lives in a wearable or Strava).
 * Kept readable in history; nothing new is logged.
 */
export function cardioSummary(entry: CardioEntry, gym: Gym): string {
  const metric = entry.exerciseId === 'rower' || entry.exerciseId === 'skierg';
  const unit = metric ? { label: 'm', toMeters: 1 } : gym.units === 'kg' ? { label: 'km', toMeters: 1000 } : { label: 'mi', toMeters: METERS_PER_MILE };
  const parts: string[] = [];
  if (entry.intervals) parts.push(`${entry.intervals.rounds} × ${entry.intervals.workSec}s on / ${entry.intervals.restSec}s off`);
  else if (entry.durationSec) parts.push(`${Math.round(entry.durationSec / 60)} min`);
  if (entry.distanceM) {
    const value = entry.distanceM / unit.toMeters;
    parts.push(`${unit.label === 'm' ? Math.round(value) : value.toFixed(2)} ${unit.label}`);
  }
  if (entry.calories) parts.push(`${entry.calories} cal`);
  if (entry.avgWatts) parts.push(`${entry.avgWatts} W`);
  if (entry.floors) parts.push(`${entry.floors} floors`);
  if (entry.level) parts.push(`level ${entry.level}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- after the lifting

export function FinishView({ session, gym, onOpen }: { session: Session; gym: Gym; onOpen: (sheet: OpenSheet) => void }) {
  const summary = summarize(session, Date.now());
  const extras = session.extras ?? [];
  // A workout started by an older version may have no lifting at all, or cardio on it.
  const empty = session.entries.length === 0;

  return (
    <>
      <main class="wo-main wo-finish">
        <div class="finish-hero">
          <span class="finish-icon">
            <Icon name="check" size={26} />
          </span>
          <h1 class="wo-name">{empty ? (session.cardio.length ? 'Cardio' : 'Nothing logged') : 'Lifting done'}</h1>
          {!empty && (
            <p class="wo-target num">
              {summary.workSets} sets · {summary.minutes} min
            </p>
          )}
        </div>

        {extras.length > 0 && (
          <section class="finish-section">
            <p class="ex-section-title">Finishers</p>
            {extras.map((extra) => {
              const done = session.extrasDone?.includes(extra.id) ?? false;
              return (
                <div key={extra.id} class={done ? 'extra-card is-done' : 'extra-card'}>
                  <div class="extra-text">
                    <p class="extra-title">{extra.label}</p>
                    {extra.detail && <p class="extra-detail">{extra.detail}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant={done ? 'ghost' : 'secondary'}
                    icon={done ? 'check' : undefined}
                    onClick={() => void changeSession((s, now) => toggleExtraDone(s, extra.id, now))}
                  >
                    {done ? 'Done' : 'Mark done'}
                  </Button>
                </div>
              );
            })}
          </section>
        )}

        {session.cardio.length > 0 && (
          <section class="finish-section">
            <p class="ex-section-title">Cardio</p>
            {session.cardio.map((c) => (
              <div key={c.id} class="extra-card is-done">
                <div class="extra-text">
                  <p class="extra-title">{requireExercise(c.exerciseId).name}</p>
                  <p class="extra-detail">{cardioSummary(c, gym)}</p>
                </div>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Remove ${requireExercise(c.exerciseId).name}`}
                  onClick={() => void changeSession((s, now) => deleteCardio(s, c.id, now))}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </section>
        )}

        {!empty && (
          <Button block variant="ghost" icon="plus" onClick={() => onOpen({ kind: 'add' })}>
            Add an exercise
          </Button>
        )}
        <Button block variant="ghost" icon="trash" onClick={() => onOpen({ kind: 'discard' })}>
          Discard workout
        </Button>
      </main>
      <div class="wo-dock wo-dock-finish">
        <Button variant="primary" size="lg" block icon="check" disabled={empty && session.cardio.length === 0} onClick={() => onOpen({ kind: 'checkout' })}>
          Finish workout
        </Button>
      </div>
    </>
  );
}

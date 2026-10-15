import { useMemo } from 'preact/hooks';
import { decide, inSessionFor, offerRecFor, renderContext } from '../../app/coach';
import { profile } from '../../app/state';
import { changeSession, exerciseHistory } from '../../app/workout';
import { renderRestAdvice } from '../../coach/render';
import type { ExerciseEntry, Gym, Session } from '../../db/types';
import { keepCoachOffer, markPrompted, swapEntry, useCoachOffer, useNextSets, workSets } from '../../domain/workout';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { CoachCard } from '../coach/CoachCard';
import '../coach/coach.css';

/**
 * The Coach inside a workout: a suggestion on an exercise before its first set (from Today's
 * plan, not yet decided), and offers after a set that came out much harder or easier (B1/B2).
 * Everything is a single Use / Keep; nothing changes on its own.
 */

/** Before the first set: "Leg press goes to 210 lb" with Use / Keep (or Swap, for a lift that hurt). */
export function EntryCoach({ session, index, entry, gym }: { session: Session; index: number; entry: ExerciseEntry; gym: Gym }) {
  const offer = entry.coachOffer;
  const started = workSets(entry).length > 0;
  const rec = useMemo(() => (offer && !started ? offerRecFor(session, index) : null), [offer?.recommendationId, started]);
  if (!offer || started) return null;
  const unit = renderContext.value.units;
  const keepLoad = entry.target?.load;

  const use = () => void changeSession((s, now) => useCoachOffer(s, index, now));
  const keep = () => void changeSession((s, now) => keepCoachOffer(s, index, now));
  const swap = () => {
    const me = profile.value;
    if (!offer.swapTo || !me) return;
    void changeSession((s, now) => swapEntry(keepCoachOffer(s, index, now), index, offer.swapTo!, { gym, profile: me, history: exerciseHistory.value }, now));
  };

  if (!rec) {
    // The plan moved on since the session started: offer the numbers plainly.
    return (
      <div class="wo-coach coach-card is-compact">
        <p class="coach-eyebrow">
          <Icon name="coach" size={14} />
          <span>Coach</span>
        </p>
        <p class="coach-title num">
          {offer.load !== null ? `${offer.load} ${unit}` : 'Bodyweight'} for {offer.repsLow}–{offer.repsHigh}
        </p>
        <div class="coach-actions">
          <Button size="sm" variant="primary" onClick={use}>
            Use
          </Button>
          <Button size="sm" onClick={keep}>
            Keep {keepLoad ?? ''}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div class="wo-coach">
      <CoachCard
        rec={rec}
        compact
        labels={{
          apply: offer.load !== null ? `Use ${offer.load} ${unit}` : 'Use',
          dismiss: keepLoad !== null && keepLoad !== undefined ? `Keep ${keepLoad}` : 'Keep',
        }}
        onAction={(action) => {
          if (action === 'apply') {
            use();
            void decide(rec, 'used');
          } else if (action === 'swap') {
            swap();
            void decide(rec, 'used', 'swap');
          } else {
            keep();
            void decide(rec, 'kept');
          }
        }}
      />
    </div>
  );
}

/** After a set: B1/B2 offers (Use / Keep) and B3 rest advice, for the exercise just logged. */
export function SetCoach({ session, entryIndex, showRest }: { session: Session; entryIndex: number; showRest?: boolean }) {
  const { offer, rest } = useMemo(() => inSessionFor(session, entryIndex), [session.updatedAt, entryIndex]);
  const entry = session.entries[entryIndex];
  if (!entry) return null;
  const unit = renderContext.value.units;
  return (
    <>
      {showRest && rest && <p class="rest-advice">{renderRestAdvice(rest)}</p>}
      {offer && offer.change.kind === 'next-sets' && (
        <CoachCard
          rec={offer}
          compact
          labels={{
            use: offer.change.load !== null && offer.change.load !== entry.sets[entry.sets.length - 1]?.load ? `Use ${offer.change.load} ${unit}` : `Go for ${offer.change.reps}`,
            keep: 'Keep',
          }}
          onAction={(action) => {
            haptic('tap');
            const change = offer.change as Extract<typeof offer.change, { kind: 'next-sets' }>;
            if (action === 'use') {
              void changeSession((s, now) => useNextSets(s, entryIndex, { load: change.load, reps: change.reps }, offer.id, now));
              void decide(offer, 'used');
            } else {
              void changeSession((s, now) => markPrompted(s, entryIndex, now));
              void decide(offer, 'kept');
            }
          }}
        />
      )}
    </>
  );
}

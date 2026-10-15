import { useEffect, useState } from 'preact/hooks';
import { coachTodayState, decideAll, markShown, renderContext } from '../../app/coach';
import { renderRecommendation } from '../../coach/render';
import type { Recommendation } from '../../coach/types';
import type { ProgramDay } from '../../db/types';
import { estimateDayMinutes, shortenDay } from '../../domain/generator';
import { activeGym } from '../../app/state';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { CoachCard } from './CoachCard';
import './coach.css';

const isSessionChange = (r: Recommendation) => r.change.kind === 'next-exposure' && r.actions.includes('apply') && !r.safety;

/**
 * The Coach on Today: notes about the day (coming back, lighter week, a missed session, safety)
 * as cards, and today's weight changes grouped in one card with Apply all.
 */
export function TodayCoach({ showSessionChanges, onStartDay }: { showSessionChanges: boolean; onStartDay: (dayId: string) => void }) {
  const today = coachTodayState.value;
  if (!today) return null;
  const changes = showSessionChanges ? today.recommendations.filter(isSessionChange) : [];
  const notes = today.recommendations.filter((r) => !isSessionChange(r));
  if (!changes.length && !notes.length) return null;
  return (
    <div class="coach-stack today-coach">
      {notes.slice(0, 3).map((rec) => (
        <CoachCard
          key={rec.id}
          rec={rec}
          compact
          onDecided={(decision) => {
            if (rec.change.kind === 'do-missed' && decision === 'applied') onStartDay(rec.change.dayId);
          }}
        />
      ))}
      {changes.length > 0 && <SessionChanges recs={changes} />}
    </div>
  );
}

function SessionChanges({ recs }: { recs: Recommendation[] }) {
  const ctx = renderContext.value;
  const [open, setOpen] = useState<Recommendation | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => markShown(recs), [recs.map((r) => r.id).join()]);
  const decideEvery = async (decision: 'applied' | 'dismissed') => {
    haptic('tap');
    setBusy(true);
    try {
      await decideAll(recs, decision);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article class="coach-card">
      <p class="coach-eyebrow">
        <Icon name="coach" size={14} />
        <span>Coach · today’s changes</span>
      </p>
      <ul class="change-list">
        {recs.map((rec) => {
          const message = renderRecommendation(rec, ctx);
          return (
            <li key={rec.id}>
              <button type="button" class="change-row" onClick={() => setOpen(rec)}>
                <span class="change-title num">{message.title}</span>
                <Icon name="chevron-right" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      <div class="coach-actions">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void decideEvery('applied')}>
          {recs.length > 1 ? 'Apply all' : 'Apply'}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void decideEvery('dismissed')}>
          Not now
        </Button>
      </div>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title="Coach">
        {open && <CoachCard rec={open} onDecided={() => setOpen(null)} />}
      </Sheet>
    </article>
  );
}

/** G2 · A shorter version of today: key lifts keep their sets, accessories pair up or drop. */
export function ShortOnTimeSheet({ day, open, onClose, onPick }: { day: ProgramDay; open: boolean; onClose: () => void; onPick: (minutes: number) => void }) {
  const gym = activeGym.value;
  const full = estimateDayMinutes(day);
  const options = [30, 45].filter((m) => m < full - 5);
  return (
    <Sheet open={open} onClose={onClose} title="Short on time?">
      <p class="sheet-copy">
        Today is about {full} minutes. A shorter version keeps the key lifts at full sets, pairs accessories into supersets
        and drops the lowest-priority ones.
      </p>
      <div class="swap-list">
        {gym &&
          options.map((minutes) => {
            const short = shortenDay(day, gym, minutes);
            return (
              <button key={minutes} type="button" class="swap-option" onClick={() => onPick(minutes)}>
                <span class="swap-text">
                  <span class="swap-name">About {short.minutes} minutes</span>
                  <span class="swap-meta">
                    {short.dropped.length
                      ? `Leaves out ${short.dropped.length} ${short.dropped.length === 1 ? 'exercise' : 'exercises'}`
                      : 'All exercises, as supersets'}
                  </span>
                </span>
                <Icon name="arrow-right" size={18} />
              </button>
            );
          })}
      </div>
    </Sheet>
  );
}

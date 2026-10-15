import { useEffect, useState } from 'preact/hooks';
import { decide, markShown, renderContext } from '../../app/coach';
import { requireExercise } from '../../domain/catalog';
import { renderRecommendation, renderWin } from '../../coach/render';
import type { Decision, Recommendation, Win } from '../../coach/types';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import './coach.css';

interface CoachCardProps {
  rec: Recommendation;
  /** After the decision is saved (for follow-ups like starting a missed session). */
  onDecided?: (decision: Decision, choice?: 'swap') => void;
  /** Overrides for button labels (e.g. "Use 180 lb" / "Keep 200" in the workout). */
  labels?: Partial<Record<'apply' | 'dismiss' | 'use' | 'keep' | 'swap', string>>;
  /** Decide without saving to the log (the caller handles it), e.g. in-session Use/Keep. */
  onAction?: (action: 'apply' | 'dismiss' | 'use' | 'keep' | 'swap') => void;
  compact?: boolean;
}

function applyLabel(rec: Recommendation): string {
  const unit = renderContext.value.units;
  switch (rec.change.kind) {
    case 'next-exposure':
      return rec.change.to !== null && rec.change.to !== rec.change.from ? `Use ${rec.change.to} ${unit}` : 'Apply';
    case 'lighter-week':
      return rec.change.action === 'now' ? 'Start lighter week' : 'Push back a week';
    case 'do-missed':
      return 'Do it today';
    default:
      return 'Apply';
  }
}

/** A short "done" note after Apply, so the card leaving the screen isn't a mystery. */
function confirmation(rec: Recommendation, action: string): string | null {
  if (action === 'swap') return 'Swap saved for next time';
  if (action !== 'apply') return null;
  switch (rec.change.kind) {
    case 'next-exposure':
      return 'Saved for next time';
    case 'slot':
      return 'Plan updated';
    case 'lighter-week':
      return rec.change.action === 'now' ? 'Lighter week starts now' : 'Lighter week moved to next week';
    default:
      return null;
  }
}

/** One Coach recommendation: the message, how sure, and its buttons. */
export function CoachCard({ rec, onDecided, labels, onAction, compact = false }: CoachCardProps) {
  const ctx = renderContext.value;
  const message = renderRecommendation(rec, ctx);
  const [whyOpen, setWhyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    markShown([rec]);
  }, [rec.id]);

  const act = async (action: 'apply' | 'dismiss' | 'use' | 'keep' | 'swap') => {
    haptic('tap');
    if (onAction) {
      onAction(action);
      return;
    }
    const decision: Decision = action === 'apply' ? 'applied' : action === 'swap' ? 'used' : action === 'use' ? 'used' : action === 'keep' ? 'kept' : 'dismissed';
    setBusy(true);
    try {
      await decide(rec, decision, action === 'swap' ? 'swap' : undefined);
      const done = confirmation(rec, action);
      if (done) showToast(done, 'good');
      onDecided?.(decision, action === 'swap' ? 'swap' : undefined);
    } catch {
      showToast('Couldn’t save that. Try again.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const swapTo = 'swapTo' in rec.change ? rec.change.swapTo : undefined;
  const label = (action: 'apply' | 'dismiss' | 'use' | 'keep' | 'swap') =>
    labels?.[action] ??
    (action === 'apply'
      ? applyLabel(rec)
      : action === 'swap'
        ? `Swap to ${swapTo ? requireExercise(swapTo).name : 'another'}`
        : action === 'dismiss'
          ? rec.change.kind === 'do-missed'
            ? 'Skip it'
            : 'Not now'
          : action === 'use'
            ? 'Use'
            : 'Keep');

  return (
    <article class={`coach-card${rec.safety ? ' is-safety' : ''}${compact ? ' is-compact' : ''}`}>
      <p class="coach-eyebrow">
        <Icon name={rec.safety ? 'alert' : 'coach'} size={14} />
        <span>{rec.safety ? 'Safety' : 'Coach'}</span>
        {message.meta && <span class="coach-meta">· {message.meta}</span>}
      </p>
      <h3 class="coach-title num">{message.title}</h3>
      {message.body && <p class="coach-body num">{message.body}</p>}
      <div class="coach-actions">
        {rec.actions.map((action, i) => (
          <Button
            key={action}
            size="sm"
            variant={i === 0 ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={() => void act(action)}
          >
            {label(action)}
          </Button>
        ))}
        <button type="button" class="coach-why" onClick={() => setWhyOpen(true)}>
          Why?
        </button>
      </div>
      <WhySheet open={whyOpen} onClose={() => setWhyOpen(false)} rec={rec} meta={message.meta} />
    </article>
  );
}

export function WhySheet({ open, onClose, rec, meta }: { open: boolean; onClose: () => void; rec: Recommendation; meta: string }) {
  const why = renderRecommendation(rec, renderContext.value).why;
  return (
    <Sheet open={open} onClose={onClose} title={why.name}>
      <div class="why">
        <p class="why-principle">{why.principle}</p>
        {meta && (
          <p class="why-meta">
            How sure: {meta}. {rec.confidence === 'low' ? 'Early reads change weights by one step at most.' : ''}
          </p>
        )}
        {why.sources.length > 0 && (
          <>
            <p class="ex-section-title">Sources</p>
            <ol class="why-sources">
              {why.sources.map((s) => (
                <li key={s.id}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.cite}
                    </a>
                  ) : (
                    s.cite
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** A win: specific, in ember. */
export function WinCard({ win }: { win: Win }) {
  const { title, body } = renderWin(win, renderContext.value);
  return (
    <div class="win-card">
      <span class="win-icon">
        <Icon name={win.kind === 'streak' || win.kind === 'all-done' ? 'flame' : 'trophy'} size={20} />
      </span>
      <div>
        <p class="win-title num">{title}</p>
        {body && <p class="win-body num">{body}</p>}
      </div>
    </div>
  );
}

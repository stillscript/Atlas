import { useState } from 'preact/hooks';
import { coachTodayState, coachWeeklyState, pendingStartDay, renderContext } from '../../app/coach';
import { navigate } from '../../app/router';
import { pastSessions } from '../../app/workout';
import { KNOWLEDGE } from '../../coach/knowledge';
import type { RuleId, WeeklyReview } from '../../coach/types';
import { requireExercise } from '../../domain/catalog';
import { muscleName } from '../../domain/volume';
import { IconButton } from '../../ui/controls';
import { EmptyState } from '../../ui/feedback';
import { ListGroup, ListRow } from '../../ui/List';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Sheet } from '../../ui/Sheet';
import { CoachCard, WinCard } from './CoachCard';
import './coach.css';

/** A short list first: the most important few, the rest one tap away. */
const SUGGESTIONS_SHOWN = 3;

/**
 * The Coach tab: today's advice, this week's review (sessions, sets per muscle against the target
 * band, key lifts, recovery), suggestions for next week, wins, and how the Coach decides.
 */
export function CoachScreen() {
  const today = coachTodayState.value;
  const weekly = coachWeeklyState.value;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const settingsButton = <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />;

  if (!pastSessions.value.length || !weekly) {
    return (
      <main class="screen">
        <ScreenHeader title="Coach" actions={settingsButton} />
        <EmptyState icon="coach" title="Your coach starts with your first workout">
          After each session it reviews every set, then suggests what to change next time and why. Nothing changes without
          your OK.
        </EmptyState>
        <HowItWorks open={rulesOpen} onOpen={() => setRulesOpen(true)} onClose={() => setRulesOpen(false)} />
      </main>
    );
  }

  const todayIds = new Set(today?.recommendations.map((r) => r.id));
  const suggestions = weekly.recommendations.filter((r) => !todayIds.has(r.id));

  return (
    <main class="screen">
      <ScreenHeader title="Coach" actions={settingsButton} />

      {today && today.recommendations.length > 0 && (
        <section class="coach-section">
          <p class="ex-section-title">Today</p>
          <div class="coach-stack">
            {today.recommendations.map((rec) => (
              <CoachCard
                key={rec.id}
                rec={rec}
                onDecided={(decision) => {
                  if (rec.change.kind === 'do-missed' && decision === 'applied') {
                    pendingStartDay.value = rec.change.dayId;
                    navigate('today');
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section class="coach-section">
        <p class="ex-section-title">This week</p>
        <WeekCard review={weekly.review} />
      </section>

      {suggestions.length > 0 && (
        <section class="coach-section">
          <p class="ex-section-title">Suggestions</p>
          <div class="coach-stack">
            {(showAll ? suggestions : suggestions.slice(0, SUGGESTIONS_SHOWN)).map((rec) => (
              <CoachCard key={rec.id} rec={rec} />
            ))}
            {!showAll && suggestions.length > SUGGESTIONS_SHOWN && (
              <button type="button" class="coach-more" onClick={() => setShowAll(true)}>
                Show {suggestions.length - SUGGESTIONS_SHOWN} more
              </button>
            )}
          </div>
        </section>
      )}

      {weekly.wins.length > 0 && (
        <section class="coach-section">
          <p class="ex-section-title">Wins</p>
          <div class="coach-stack">
            {weekly.wins.slice(0, 6).map((win) => (
              <WinCard key={win.id} win={win} />
            ))}
          </div>
        </section>
      )}

      <KeyLifts review={weekly.review} />
      <HowItWorks open={rulesOpen} onOpen={() => setRulesOpen(true)} onClose={() => setRulesOpen(false)} />
    </main>
  );
}

function WeekCard({ review }: { review: WeeklyReview }) {
  const tracked = review.muscles.filter((m) => m.planned > 0 || m.done > 0);
  const scale = Math.max(20, ...tracked.map((m) => Math.max(m.band[1], m.done, m.planned)));
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const fatigue = review.fatigue;
  return (
    <div class="week-card">
      <div class="week-stats">
        <div>
          <p class="week-stat-value num">
            {review.done}/{review.planned}
          </p>
          <p class="week-stat-label">Sessions</p>
        </div>
        <div>
          <p class="week-stat-value num">{review.streakWeeks}</p>
          <p class="week-stat-label">Week streak</p>
        </div>
        <div>
          <p class="week-stat-value num">{review.workSets}</p>
          <p class="week-stat-label">Sets</p>
        </div>
      </div>

      <div class="muscle-bars" role="list" aria-label="Weekly sets per muscle">
        {tracked.map((m) => (
          <div key={m.muscle} class="muscle-row" role="listitem" aria-label={`${muscleName(m.muscle)}: ${m.done} of ${m.planned} planned sets, target ${m.band[0]}–${m.band[1]}`}>
            <span class="muscle-name">{muscleName(m.muscle)}</span>
            <span class="muscle-track">
              <span class="muscle-band" style={{ left: pct(m.band[0]), width: `calc(${pct(m.band[1])} - ${pct(m.band[0])})` }} />
              <span class="muscle-done" style={{ width: pct(m.done) }} />
              <span class="muscle-planned" style={{ left: pct(m.planned) }} />
            </span>
            <span class="muscle-value num">
              {m.done}/{m.planned}
            </span>
          </div>
        ))}
      </div>
      <p class="muscle-legend">
        <span>
          <span class="legend-swatch" style={{ background: 'var(--accent)' }} />
          Done this week
        </span>
        <span>
          <span class="legend-swatch" style={{ background: 'var(--good-soft)' }} />
          Target range
        </span>
        <span>
          <span class="legend-swatch" style={{ background: 'var(--ink-3)', width: '2px' }} />
          Planned
        </span>
      </p>

      <p class="recovery-line" style={{ marginTop: 'var(--space-4)' }}>
        <span class={fatigue.count ? 'recovery-dot is-watch' : 'recovery-dot'} />
        {!fatigue.enoughData
          ? 'Recovery: the Coach needs about 2 weeks of sessions to read this.'
          : fatigue.count === 0
            ? 'Recovery looks good: no signs of fatigue in the last 14 days.'
            : `Recovery: ${fatigue.count} ${fatigue.count === 1 ? 'sign' : 'signs'} of fatigue in the last 14 days.`}
      </p>
    </div>
  );
}

function KeyLifts({ review }: { review: WeeklyReview }) {
  const units = renderContext.value.units;
  if (!review.keyLifts.length) return null;
  return (
    <section class="coach-section">
      <p class="ex-section-title">Key lifts · estimated max</p>
      <div class="week-card lift-rows">
        {review.keyLifts.map((lift) => (
          <div key={lift.exerciseId} class="lift-row">
            <span class="lift-name">{requireExercise(lift.exerciseId).name}</span>
            <span class="lift-value num">
              {lift.e1rm} {units}
              {lift.change !== null && lift.change !== 0 && (
                <span class={lift.change > 0 ? 'lift-change is-up' : 'lift-change is-down'}>
                  {' '}
                  {lift.change > 0 ? '+' : ''}
                  {lift.change} in 4 wk
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const RULE_ORDER: RuleId[] = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'C1', 'C2', 'D', 'E1', 'E3', 'F2', 'G1', 'G2', 'G3', 'G4', 'H3', 'H3P', 'J1', 'K'];

function HowItWorks({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  return (
    <>
      <ListGroup footer="Every suggestion is built from your own sets. Nothing in your plan changes without your OK.">
        <ListRow icon="book" tone="accent" label="How the Coach decides" detail="The rules and the research behind them" chevron onClick={onOpen} />
      </ListGroup>
      <Sheet open={open} onClose={onClose} title="How the Coach decides">
        <div class="rules-list">
          {RULE_ORDER.map((id) => {
            const rule = KNOWLEDGE.rules[id];
            const sources = rule.sources.map((s) => KNOWLEDGE.sources[String(s)]?.short).filter(Boolean);
            return (
              <div key={id} class="rule-item">
                <p>{rule.name}</p>
                <p>
                  {rule.principle}
                  {sources.length > 0 && <span class="ex-muted"> ({sources.join('; ')})</span>}
                </p>
              </div>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

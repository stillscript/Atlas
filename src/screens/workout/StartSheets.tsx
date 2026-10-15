import { useEffect, useRef, useState } from 'preact/hooks';
import { decide, planFor } from '../../app/coach';
import { settings, updateSettings } from '../../app/state';
import { pastSessions, startWorkout } from '../../app/workout';
import type { PlanOptions } from '../../coach/engine';
import { readinessOffer } from '../../coach/readiness';
import type { ReadinessOffer, SessionVariant } from '../../coach/types';
import { CoachCard } from '../coach/CoachCard';
import type { Program, ProgramDay, ReadinessCheck } from '../../db/types';
import { estimateDayMinutes } from '../../domain/generator';
import { primeAudio } from '../../lib/chime';
import { Button } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { ThreeWay } from './ThreeWay';

type Level = 1 | 2 | 3;

/**
 * Three taps before a workout: sleep, energy, soreness (plus a wearable score if turned on).
 * Optional by design: "Skip today" for once, "Don't ask before workouts" to switch it off, and
 * Settings › Workouts to switch it back on.
 */
export function ReadinessSheet({ day, options = {}, open, onClose }: { day: ProgramDay | null; options?: PlanOptions; open: boolean; onClose: () => void }) {
  const [sleep, setSleep] = useState<Level | null>(null);
  const [energy, setEnergy] = useState<Level | null>(null);
  const [soreness, setSoreness] = useState<Level | null>(null);
  const [starting, setStarting] = useState(false);
  const [offer, setOffer] = useState<{ check: ReadinessCheck; offer: ReadinessOffer } | null>(null);
  const score = useRef<HTMLInputElement>(null);
  const wearable = settings.value.wearableScore;

  useEffect(() => {
    if (open) {
      setSleep(null);
      setEnergy(null);
      setSoreness(null);
      setStarting(false);
      setOffer(null);
    }
  }, [open]);

  const go = async (readiness?: ReadinessCheck, variant?: SessionVariant) => {
    if (!day) return;
    primeAudio();
    setStarting(true);
    await startWorkout(day, readiness, planFor(day, variant ? { ...options, variant } : options));
  };

  const answered = sleep !== null && energy !== null && soreness !== null;
  const start = () => {
    if (!answered) return;
    const value = Number(score.current?.value);
    const check: ReadinessCheck = {
      sleep,
      energy,
      soreness,
      wearable: wearable && Number.isFinite(value) && value > 0 && value <= 100 ? Math.round(value) : undefined,
      at: Date.now(),
    };
    // C1/C2 · A rough check-in offers a lighter or shorter day; never forced.
    const found = day ? readinessOffer(check, pastSessions.value, day.name) : null;
    if (found) setOffer({ check, offer: found });
    else void go(check);
  };

  if (offer) {
    const rec = offer.offer.recommendation;
    const lighter = offer.offer.variant === 'lighter';
    return (
      <Sheet open={open} onClose={onClose} title="Quick check-in">
        <CoachCard
          rec={rec}
          labels={{ use: lighter ? 'Use lighter day' : '30-minute version', keep: 'Train as planned' }}
          onAction={(action) => {
            void decide(rec, action === 'use' ? 'used' : 'kept');
            void go(offer.check, action === 'use' ? offer.offer.variant : undefined);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Quick check-in"
      footer={
        <>
          <Button variant="primary" size="lg" block icon="arrow-right" disabled={!answered || starting} onClick={start}>
            Start workout
          </Button>
          <Button variant="ghost" block disabled={starting} onClick={() => void go()}>
            Skip today
          </Button>
        </>
      }
    >
      <div class="checkout">
        <p class="checkout-q">Sleep last night</p>
        <ThreeWay label="Sleep" value={sleep} onChange={setSleep} options={[{ value: 1, label: 'Poor' }, { value: 2, label: 'OK' }, { value: 3, label: 'Good' }]} />
        <p class="checkout-q">Energy</p>
        <ThreeWay label="Energy" value={energy} onChange={setEnergy} options={[{ value: 1, label: 'Low' }, { value: 2, label: 'OK' }, { value: 3, label: 'High' }]} />
        <p class="checkout-q">Soreness</p>
        <ThreeWay
          label="Soreness"
          value={soreness}
          onChange={setSoreness}
          options={[{ value: 1, label: 'A lot' }, { value: 2, label: 'Some' }, { value: 3, label: 'None' }]}
        />
        {wearable && (
          <label class="field">
            <span class="checkout-q">Wearable readiness (optional)</span>
            <input ref={score} class="field-input" type="text" inputMode="numeric" placeholder="0–100" autoComplete="off" />
          </label>
        )}
        <button
          type="button"
          class="link-button"
          disabled={starting}
          onClick={() => {
            void updateSettings({ readinessCheck: false, wearableScore: false });
            showToast('Check-in turned off. Turn it back on in Settings › Workouts.', 'neutral', 4500);
            void go();
          }}
        >
          <Icon name="close" size={16} /> Don’t ask before workouts
        </button>
      </div>
    </Sheet>
  );
}

/** Pick any session from the plan, for rest days or a change of plan. */
export function DayPickerSheet({
  program,
  open,
  onClose,
  onPick,
}: {
  program: Program;
  open: boolean;
  onClose: () => void;
  onPick: (day: ProgramDay) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Pick a session">
      <div class="swap-list">
        {program.days.map((day) => (
          <button key={day.id} type="button" class="swap-option" onClick={() => onPick(day)}>
            <span class="swap-text">
              <span class="swap-name">{day.name}</span>
              <span class="swap-meta">
                {day.subtitle ? `${day.subtitle} · ` : ''}about {estimateDayMinutes(day)} min
              </span>
            </span>
            <Icon name="chevron-right" size={18} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

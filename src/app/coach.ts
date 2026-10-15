import { computed, signal } from '@preact/signals';
import { applyToProgram } from '../coach/apply';
import {
  coachInSession,
  coachReview,
  coachToday,
  coachWeekly,
  exerciseRec,
  findSlot,
  planExercise,
  planSession,
  prepare,
  type PlanOptions,
} from '../coach/engine';
import { renderRecommendation, type RenderContext } from '../coach/render';
import type { CoachInput, Decision, Recommendation } from '../coach/types';
import { appendCoachLog, loadCoachLog, loadMeasurements, saveProgram } from '../db/coach';
import type { AtlasDB } from '../db/schema';
import type { CoachLogEntry, Measurement, ProgramDay, Session } from '../db/types';
import { newId } from '../lib/ids';
import { activeGym, activeProgram, getDb, profile, settings } from './state';
import { activeSession, pastSessions } from './workout';

/**
 * The Coach in the app: one store every screen reads. Inputs are the saved data (sessions, plan,
 * gym, measurements, the Coach's log); outputs are computed, so Today, the workout, the summary
 * and the Coach tab always agree. Only decisions and "shown" marks are written.
 */

export const coachLog = signal<CoachLogEntry[]>([]);
export const measurements = signal<Measurement[]>([]);

/** Minute clock, so "today" rolls over at midnight and timers stay honest. */
export const coachClock = signal(Date.now());

export async function loadCoachState(db: AtlasDB): Promise<void> {
  const [log, list] = await Promise.all([loadCoachLog(db), loadMeasurements(db)]);
  coachLog.value = log;
  measurements.value = list;
}

export function startCoachClock(): void {
  const tick = () => (coachClock.value = Date.now());
  window.setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

export const coachInput = computed<CoachInput | null>(() => {
  const me = profile.value;
  const program = activeProgram.value;
  const gym = activeGym.value;
  if (!me || !program || !gym) return null;
  return {
    profile: me,
    program,
    gym,
    sessions: pastSessions.value,
    active: activeSession.value,
    measurements: measurements.value,
    log: coachLog.value,
    settings: { readinessCheck: settings.value.readinessCheck, wearableScore: settings.value.wearableScore },
  };
});

export const coachTodayState = computed(() => {
  const input = coachInput.value;
  return input ? coachToday(input, coachClock.value) : null;
});

export const coachWeeklyState = computed(() => {
  const input = coachInput.value;
  return input ? coachWeekly(input, coachClock.value) : null;
});

export const renderContext = computed<RenderContext>(() => ({
  units: activeGym.value?.units ?? 'lb',
  now: coachClock.value,
  experience: profile.value?.experience,
  log: coachLog.value,
}));

export function reviewFor(sessionId: string) {
  const input = coachInput.value;
  return input ? coachReview(input, sessionId, Date.now()) : null;
}

/** The Coach's plan for a session about to start (today's day, or one picked by hand). */
export function planFor(day: ProgramDay, options: PlanOptions = {}) {
  const input = coachInput.value;
  if (!input) return null;
  return planSession(prepare(input, Date.now()), day, options).plan;
}

/** The full recommendation behind an exercise's pending offer in the workout (for its message). */
export function offerRecFor(session: Session, entryIndex: number): Recommendation | null {
  const input = coachInput.value;
  const entry = session.entries[entryIndex];
  if (!input || !entry?.coachOffer) return null;
  const p = prepare(input, Date.now());
  const found = findSlot(p, entry.slotId, entry.exerciseId);
  if (!found) return null;
  const plan = planExercise(p, entry.exerciseId, found.slot);
  if (!plan) return null;
  const rec = exerciseRec(plan, { dayId: found.day.id, slotId: found.slot.id });
  return rec.id === entry.coachOffer.recommendationId ? rec : null;
}

/** In-session offer (B1/B2) and rest advice (B3) for the exercise just logged. */
export function inSessionFor(session: Session, entryIndex: number) {
  const input = coachInput.value;
  if (!input) return { offer: null, rest: null };
  return coachInSession(input, session, entryIndex, Date.now());
}

/** Set by the Coach tab ("Do it today"); Today starts that session and clears it. */
export const pendingStartDay = signal<string | null>(null);

// ---------------------------------------------------------------- the log

async function append(entries: CoachLogEntry[]): Promise<void> {
  if (!entries.length) return;
  await appendCoachLog(getDb(), entries);
  coachLog.value = [...coachLog.value, ...entries];
}

/** Marks recommendations as shown (once each), with the phrasing used, for repetition control. */
export function markShown(recs: Recommendation[]): void {
  const logged = new Set(coachLog.value.filter((e) => e.kind === 'shown').map((e) => e.recommendationId));
  const now = Date.now();
  const ctx = renderContext.value;
  const entries = recs
    .filter((r) => !logged.has(r.id))
    .map<CoachLogEntry>((r) => ({
      id: newId('cl'),
      at: now,
      kind: 'shown',
      recommendationId: r.id,
      ruleId: r.rule,
      key: r.key,
      fingerprint: r.fingerprint,
      variant: renderRecommendation(r, ctx).variant,
    }));
  void append(entries).catch(() => undefined);
}

/**
 * Records a decision and does what Apply means for plan edits (sets, reps, swaps, lighter week).
 * Session-level decisions (next weights, lighter day) are read when the session is built.
 * `choice: 'swap'` on a pain card records the swap instead of the lighter weight.
 */
export async function decide(rec: Recommendation, decision: Decision, choice?: 'swap'): Promise<void> {
  const now = Date.now();
  const program = activeProgram.value;
  if (decision === 'applied' && program && (rec.change.kind === 'slot' || rec.change.kind === 'lighter-week')) {
    const next = applyToProgram(program, rec.change, now);
    if (next !== program) {
      await saveProgram(getDb(), next);
      activeProgram.value = next;
    }
  }
  const entry = (recommendationId: string, d: Decision): CoachLogEntry => ({
    id: newId('cl'),
    at: now,
    kind: 'decision',
    recommendationId,
    ruleId: rec.rule,
    key: rec.key,
    fingerprint: rec.fingerprint,
    decision: d,
  });
  // A swap is its own decision; the card itself is settled ("used").
  await append(choice === 'swap' ? [entry(`${rec.id}:swap`, 'applied'), entry(rec.id, 'used')] : [entry(rec.id, decision)]);
}

export async function decideAll(recs: Recommendation[], decision: Decision): Promise<void> {
  for (const rec of recs) await decide(rec, decision);
}

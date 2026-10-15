import { computed, effect, signal } from '@preact/signals';
import {
  beginSession,
  closeSession,
  deleteSession,
  discardSession,
  loadActiveSession,
  loadCompletedSessions,
  loadMachineSettings,
  machineSettingId,
  saveGym,
  saveMachineSetting,
  saveSession,
} from '../db/sessions';
import type { SessionPlan } from '../coach/types';
import type { AtlasDB } from '../db/schema';
import type { AppMeta, CheckOut, EquipmentItem, MachineSetting, ProgramDay, ReadinessCheck, Session } from '../db/types';
import { buildHistory, createSession, finishSession } from '../domain/workout';
import { cancelChime, primeAudio, scheduleChime } from '../lib/chime';
import { haptic } from '../lib/haptics';
import { setKeepAwake } from '../lib/wakeLock';
import { showToast } from '../ui/feedback';
import { gyms } from './edit';
import { navigate } from './router';
import { activeGym, activeProgram, appMeta, completedSessions, getDb, profile, settings } from './state';

/**
 * The workout in progress. Every change goes through `changeSession`, which saves to IndexedDB
 * first and then updates the screen, one change at a time in order. So whatever is on screen is
 * already saved: closing the app, locking the phone or an update mid-set loses nothing.
 */

export const activeSession = signal<Session | null>(null);
/** Every finished workout, oldest first. */
export const pastSessions = signal<Session[]>([]);
export const exerciseHistory = computed(() => buildHistory(pastSessions.value));
/** Machine settings for the active gym, by `gym:equipment:exercise` id. */
export const machineSettings = signal<Map<string, MachineSetting>>(new Map());

/** A workout older than this (since its last change) is offered on Today instead of reopening. */
const RESUME_WINDOW_MS = 3 * 60 * 60 * 1000;

export async function loadWorkoutState(db: AtlasDB, app: AppMeta, gymId: string | undefined): Promise<void> {
  const [active, past, settingsList] = await Promise.all([
    loadActiveSession(db, app),
    loadCompletedSessions(db),
    gymId ? loadMachineSettings(db, gymId) : Promise.resolve([]),
  ]);
  activeSession.value = active;
  pastSessions.value = past;
  machineSettings.value = new Map(settingsList.map((s) => [s.id, s]));
  settingsGymId = gymId;
}

let settingsGymId: string | undefined;

/** On launch, a recent workout reopens exactly where it was. */
export function shouldResumeOnLaunch(now = Date.now()): boolean {
  const session = activeSession.value;
  return session !== null && now - session.updatedAt < RESUME_WINDOW_MS;
}

// ---------------------------------------------------------------- changes, saved in order

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function changeSession(change: (session: Session, now: number) => Session): Promise<void> {
  return enqueue(async () => {
    const current = activeSession.value;
    if (!current) return;
    const next = change(current, Date.now());
    if (next === current) return;
    await saveSession(getDb(), next);
    activeSession.value = next;
  }).catch((error: unknown) => {
    console.error('[atlas] could not save the workout', error);
    showToast('Couldn’t save that. Try again.', 'danger');
  });
}

// ---------------------------------------------------------------- start, finish, discard

/** Starts a workout. `plan` is the Coach's plan for the day (app/coach `planFor`). */
export async function startWorkout(day: ProgramDay, readiness?: ReadinessCheck, plan?: SessionPlan | null): Promise<void> {
  primeAudio();
  const program = activeProgram.value;
  const gym = activeGym.value;
  const me = profile.value;
  if (!program || !gym || !me || activeSession.value) return;
  const now = Date.now();
  const session = createSession({ program, day, gym, profile: me, history: exerciseHistory.value, now, readiness, plan });
  await enqueue(async () => {
    appMeta.value = await beginSession(getDb(), session);
    activeSession.value = session;
  });
  navigate('workout');
}

export async function finishWorkout(checkout: CheckOut | undefined): Promise<void> {
  await enqueue(async () => {
    const current = activeSession.value;
    if (!current) return;
    const done = finishSession(current, checkout, Date.now());
    appMeta.value = await closeSession(getDb(), done);
    activeSession.value = null;
    pastSessions.value = [...pastSessions.value, done];
    completedSessions.value += 1;
    haptic('success');
    navigate({ name: 'summary', sessionId: done.id }, { replace: true });
  });
}

export async function discardWorkout(): Promise<void> {
  await enqueue(async () => {
    const current = activeSession.value;
    if (!current) return;
    appMeta.value = await discardSession(getDb(), current.id);
    activeSession.value = null;
    navigate('today', { replace: true });
  });
}

// ---------------------------------------------------------------- fixing finished workouts

/**
 * Saves a fix to a finished workout (a set's weight or reps, a removed exercise). Records, charts
 * and the Coach all read `pastSessions`, so they follow the fix right away.
 */
export function changePastSession(sessionId: string, change: (session: Session, now: number) => Session): Promise<void> {
  return enqueue(async () => {
    const current = pastSessions.value.find((s) => s.id === sessionId);
    if (!current) return;
    const changed = change(current, Date.now());
    if (changed === current) return;
    // A finished workout has no live position or rest timer.
    const next: Session = { ...changed, cursor: undefined, rest: undefined };
    await saveSession(getDb(), next);
    pastSessions.value = pastSessions.value.map((s) => (s.id === sessionId ? next : s));
  }).catch((error: unknown) => {
    console.error('[atlas] could not save the workout', error);
    showToast('Couldn’t save that. Try again.', 'danger');
  });
}

/** Deletes a finished workout, with Undo. */
export function deletePastSession(sessionId: string): Promise<void> {
  return enqueue(async () => {
    const removed = pastSessions.value.find((s) => s.id === sessionId);
    if (!removed) return;
    await deleteSession(getDb(), sessionId);
    pastSessions.value = pastSessions.value.filter((s) => s.id !== sessionId);
    completedSessions.value = Math.max(0, completedSessions.value - 1);
    showToast('Workout deleted', 'neutral', 6000, {
      label: 'Undo',
      onClick: () =>
        void enqueue(async () => {
          await saveSession(getDb(), removed);
          pastSessions.value = [...pastSessions.value, removed].sort((a, b) => a.startedAt - b.startedAt);
          completedSessions.value += 1;
          showToast('Restored');
        }),
    });
  }).catch((error: unknown) => {
    console.error('[atlas] could not delete the workout', error);
    showToast('Couldn’t delete that. Try again.', 'danger');
  });
}

// ---------------------------------------------------------------- machine settings and gym

export async function saveSettingsFor(
  gymId: string,
  equipmentId: string,
  exerciseId: string,
  fields: MachineSetting['fields'],
  note: string | undefined,
): Promise<void> {
  const id = machineSettingId(gymId, equipmentId, exerciseId);
  const record: MachineSetting = { id, gymId, equipmentId, exerciseId, fields, note: note || undefined, updatedAt: Date.now() };
  await saveMachineSetting(getDb(), record);
  const next = new Map(machineSettings.value);
  next.set(id, record);
  machineSettings.value = next;
}

/** Updates one piece of equipment in the active gym (e.g. after checking the real weight steps). */
export async function updateEquipment(item: EquipmentItem): Promise<void> {
  const gym = activeGym.value;
  if (!gym) return;
  const next = { ...gym, equipment: gym.equipment.map((e) => (e.id === item.id ? item : e)), updatedAt: Date.now() };
  await saveGym(getDb(), next);
  activeGym.value = next;
  gyms.value = gyms.value.map((g) => (g.id === next.id ? next : g));
}

// ---------------------------------------------------------------- side effects while training

let restAlarm = 0;

/**
 * Wake lock and the rest alarm follow the session: the screen stays on while a workout is open,
 * and a chime (plus a buzz on Android) is scheduled for the moment the rest ends. Timers are
 * worked out from timestamps, so they're right even after the phone sleeps.
 */
export function startWorkoutEffects(): void {
  effect(() => {
    setKeepAwake(Boolean(activeSession.value) && settings.value.keepAwake);
  });
  // A different gym (after Redo setup) has its own machine settings.
  effect(() => {
    const gymId = activeGym.value?.id;
    if (!gymId || gymId === settingsGymId) return;
    settingsGymId = gymId;
    void loadMachineSettings(getDb(), gymId).then((list) => {
      machineSettings.value = new Map(list.map((s) => [s.id, s]));
    });
  });
  const schedule = () => {
    window.clearTimeout(restAlarm);
    cancelChime();
    const rest = activeSession.value?.rest;
    if (!rest || document.visibilityState !== 'visible') return;
    const delay = rest.endsAt - Date.now();
    if (delay <= 0) return;
    if (settings.value.sound) scheduleChime(delay);
    restAlarm = window.setTimeout(() => {
      if (settings.value.haptics && typeof navigator.vibrate === 'function') navigator.vibrate([180, 90, 180]);
    }, delay);
  };
  effect(() => {
    // Re-runs whenever the rest timer or the sound setting changes.
    void activeSession.value?.rest?.endsAt;
    void settings.value.sound;
    schedule();
  });
  // The audio clock pauses while the phone is locked; reschedule from the real time on return.
  document.addEventListener('visibilitychange', schedule);
}

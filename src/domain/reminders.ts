import type { AppMeta } from '../db/types';

const DAY_MS = 86_400_000;
export const BACKUP_INTERVAL_DAYS = 30;
export const BACKUP_SNOOZE_DAYS = 7;

/**
 * A gentle backup reminder: once there's something worth keeping (at least one finished workout),
 * if the last backup (or first use) was 30+ days ago and the user hasn't snoozed it.
 */
export function backupReminderDue(
  app: Pick<AppMeta, 'createdAt' | 'lastBackupAt' | 'backupReminderSnoozedUntil'>,
  completedSessions: number,
  now = Date.now(),
): boolean {
  if (completedSessions < 1) return false;
  if (app.backupReminderSnoozedUntil && app.backupReminderSnoozedUntil > now) return false;
  const since = app.lastBackupAt ?? app.createdAt;
  return now - since >= BACKUP_INTERVAL_DAYS * DAY_MS;
}

export function snoozeUntil(now = Date.now()): number {
  return now + BACKUP_SNOOZE_DAYS * DAY_MS;
}

/** Never backed up: the first nudge comes after this many workouts. */
export const FIRST_BACKUP_WORKOUTS = 3;
/** Backed up before: also remind after this many new workouts, even within 30 days. */
export const BACKUP_WORKOUTS = 12;

export interface BackupStatus {
  due: boolean;
  /** Why it's due: no backup yet, time passed, or a lot of new training to lose. */
  reason: 'first' | 'days' | 'workouts' | null;
  /** Days since the last backup (null if never). */
  daysSince: number | null;
  /** Workouts finished since the last backup (all of them if never). */
  workoutsSince: number;
}

/**
 * When to remind about backups, by what's at risk: a first nudge after 3 workouts, then every 30
 * days or every 12 workouts, whichever comes first. "Later" snoozes it for a week.
 */
export function backupStatus(
  app: Pick<AppMeta, 'createdAt' | 'lastBackupAt' | 'backupReminderSnoozedUntil'>,
  workoutTimes: number[],
  now = Date.now(),
): BackupStatus {
  const since = app.lastBackupAt;
  const workoutsSince = workoutTimes.filter((t) => since === undefined || t > since).length;
  const daysSince = since === undefined ? null : Math.floor((now - since) / DAY_MS);
  const snoozed = Boolean(app.backupReminderSnoozedUntil && app.backupReminderSnoozedUntil > now);
  let reason: BackupStatus['reason'] = null;
  if (workoutsSince >= 1) {
    if (since === undefined) {
      if (workoutsSince >= FIRST_BACKUP_WORKOUTS || now - app.createdAt >= BACKUP_INTERVAL_DAYS * DAY_MS) reason = 'first';
    } else if (workoutsSince >= BACKUP_WORKOUTS) reason = 'workouts';
    else if (daysSince !== null && daysSince >= BACKUP_INTERVAL_DAYS) reason = 'days';
  }
  return { due: reason !== null && !snoozed, reason, daysSince, workoutsSince };
}

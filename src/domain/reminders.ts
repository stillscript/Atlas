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

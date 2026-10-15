import { useState } from 'preact/hooks';
import { exportBackup } from '../app/backupActions';
import { appMeta, getDb, patchAppMeta } from '../app/state';
import { pastSessions } from '../app/workout';
import { backupStatus, snoozeUntil, type BackupStatus } from '../domain/reminders';
import { plural } from '../lib/format';
import { Button } from '../ui/controls';
import { Notice, showToast } from '../ui/feedback';

/** The backup state right now (what's at risk since the last backup file). */
export function currentBackupStatus(): BackupStatus | null {
  const app = appMeta.value;
  if (!app) return null;
  return backupStatus(app, pastSessions.value.map((s) => s.startedAt));
}

export function backupMessage(status: BackupStatus): { title: string; body: string } {
  switch (status.reason) {
    case 'first':
      return {
        title: 'Back up your training',
        body: `You’ve logged ${plural(status.workoutsSince, 'workout')}. A backup file keeps them safe if anything happens to this phone.`,
      };
    case 'workouts':
      return {
        title: 'Time for a backup',
        body: `${plural(status.workoutsSince, 'workout')} since your last backup. Save a fresh copy to Files or iCloud Drive.`,
      };
    default:
      return {
        title: 'Time for a backup',
        body: `It’s been ${status.daysSince} days since your last backup${status.workoutsSince ? `, with ${plural(status.workoutsSince, 'new workout')}` : ''}.`,
      };
  }
}

/** "Back up now / Later", shown only when a backup is due. */
export function BackupReminder() {
  const [busy, setBusy] = useState(false);
  const status = currentBackupStatus();
  if (!status?.due) return null;
  const { title, body } = backupMessage(status);
  const backUp = async () => {
    setBusy(true);
    try {
      if ((await exportBackup(getDb())) !== 'cancelled') {
        await patchAppMeta({ lastBackupAt: Date.now() });
        showToast('Backup saved', 'good');
      }
    } catch {
      showToast('Couldn’t create the backup. Try again.', 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Notice
      icon="share"
      tone="warn"
      title={title}
      action={
        <>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void backUp()}>
            Back up now
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void patchAppMeta({ backupReminderSnoozedUntil: snoozeUntil() })}>
            Later
          </Button>
        </>
      }
    >
      {body}
    </Notice>
  );
}

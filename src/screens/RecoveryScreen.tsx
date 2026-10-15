import { useState } from 'preact/hooks';
import { saveJsonFile } from '../app/backupActions';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../db/backup';
import { DowngradeError, MigrationError } from '../db/open';
import { getSnapshot } from '../db/snapshot';
import { Button } from '../ui/controls';
import { Logo } from '../ui/Logo';

interface RecoveryScreenProps {
  error: unknown;
}

/**
 * Shown instead of the app when the data can't be opened safely. The data is never touched here;
 * the user can retry or save a copy of their last snapshot as a normal backup file.
 */
export function RecoveryScreen({ error }: RecoveryScreenProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const migration = error instanceof MigrationError ? error : null;
  const downgrade = error instanceof DowngradeError;

  const title = downgrade ? 'Atlas needs to finish updating' : "Atlas couldn't finish updating your data";
  const body = downgrade
    ? 'Your data was saved by a newer version of Atlas than the one that just opened. Close Atlas completely, then open it again to load the newest version.'
    : 'Nothing was lost: your workouts and settings are exactly as they were before the update, and a safety copy is stored on this phone. Try again, or save a copy to Files to be extra safe.';

  async function saveCopy() {
    if (!migration?.snapshotId) return;
    setSaving(true);
    try {
      const snapshot = await getSnapshot(migration.snapshotId);
      if (snapshot) {
        const result = await saveJsonFile(`atlas-safety-copy-${new Date(snapshot.createdAt).toISOString().slice(0, 10)}.json`, {
          format: BACKUP_FORMAT,
          formatVersion: BACKUP_FORMAT_VERSION,
          appVersion: snapshot.appVersion,
          schemaVersion: snapshot.dump.schemaVersion,
          exportedAt: new Date(snapshot.createdAt).toISOString(),
          stores: snapshot.dump.stores,
        });
        setSaved(result !== 'cancelled');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="recovery">
      <Logo size={48} />
      <h1 class="recovery-title">{title}</h1>
      <p class="recovery-body">{body}</p>
      <div class="recovery-actions">
        <Button variant="primary" size="lg" block onClick={() => window.location.reload()}>
          Try again
        </Button>
        {migration?.snapshotId && (
          <Button variant="secondary" size="lg" block disabled={saving} onClick={() => void saveCopy()}>
            {saved ? 'Copy saved' : saving ? 'Preparing…' : 'Save a copy of my data'}
          </Button>
        )}
      </div>
      {migration && (
        <p class="recovery-detail">
          Data version {migration.fromVersion} → {migration.toVersion}
          {migration.restored ? ' · restored from snapshot' : ''}
        </p>
      )}
    </main>
  );
}

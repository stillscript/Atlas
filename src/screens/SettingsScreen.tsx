import { useEffect, useRef, useState } from 'preact/hooks';
import { exportBackup } from '../app/backupActions';
import { goBack } from '../app/router';
import {
  APP_VERSION,
  appMeta,
  getDb,
  patchAppMeta,
  profile,
  redoingSetup,
  settings,
  updateSettings,
  workoutActive,
} from '../app/state';
import { importBackup, parseBackup, type BackupFile, type BackupPreview } from '../db/backup';
import { listSnapshots } from '../db/snapshot';
import type { ThemePreference } from '../db/types';
import { goalName } from '../domain/generator';
import { WEEKDAY_SHORT } from '../domain/schedule';
import { currentBackupStatus } from './BackupReminder';
import { InstallGuide } from './InstallGuide';
import { formatRelativeDay, formatShortDate, plural } from '../lib/format';
import { isStandalone } from '../lib/platform';
import { currentNotes } from '../pwa/whatsNew';
import { WhatsNewSheet } from '../pwa/UpdateUI';
import { Button, Segmented } from '../ui/controls';
import { showToast } from '../ui/feedback';
import { ControlRow, ListGroup, ListRow, ToggleRow } from '../ui/List';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Sheet } from '../ui/Sheet';

const EXPERIENCE_NAMES = { beginner: 'New to lifting', intermediate: 'Some experience', advanced: 'Experienced' } as const;

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsScreen() {
  const current = settings.value;
  const app = appMeta.value;
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ backup: BackupFile; preview: BackupPreview } | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [redoOpen, setRedoOpen] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState<number | null>(null);
  const me = profile.value;

  useEffect(() => {
    listSnapshots()
      .then((list) => setSnapshotCount(list.length))
      .catch(() => setSnapshotCount(null));
  }, []);

  const persisted = app?.persist?.granted === true;
  const backup = currentBackupStatus();
  const standalone = isStandalone();

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportBackup(getDb());
      if (result !== 'cancelled') {
        await patchAppMeta({ lastBackupAt: Date.now() });
        showToast('Backup saved', 'good');
      }
    } catch {
      showToast("Couldn't create the backup. Try again.", 'danger');
    } finally {
      setExporting(false);
    }
  }

  async function onFileChosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      showToast(parsed.error, 'danger', 4500);
      return;
    }
    setPendingImport({ backup: parsed.backup, preview: parsed.preview });
  }

  async function onConfirmImport() {
    if (!pendingImport) return;
    setImporting(true);
    try {
      await importBackup(getDb(), pendingImport.backup);
      showToast('Backup restored', 'good');
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      setImporting(false);
      showToast("Couldn't restore that backup. Your data wasn't changed.", 'danger', 4500);
    }
  }

  const readinessFooter = current.readinessCheck
    ? 'Three quick taps before you start: sleep, energy, soreness. A rough night offers a lighter day, never forces one.'
    : 'Readiness is off. The Coach reads your sets instead, which works just as well. Turn it back on anytime.';

  return (
    <main class="screen">
      <ScreenHeader title="Settings" onBack={() => goBack()} />

      {me && (
        <ListGroup title="Your training">
          <ListRow icon="sparkle" tone="accent" label="Goal" value={goalName(me.goal)} />
          <ListRow icon="progress" label="Experience" value={EXPERIENCE_NAMES[me.experience]} />
          <ListRow
            icon="calendar"
            label="Schedule"
            value={`${me.trainingDays.map((d) => WEEKDAY_SHORT[d]).join(' ')}`}
          />
          <ListRow icon="clock" label="Session length" value={`${me.sessionMinutes} min`} />
          <ListRow icon="refresh" label="Redo setup" detail="New answers and a new plan. Your history stays." chevron onClick={() => setRedoOpen(true)} />
        </ListGroup>
      )}

      <ListGroup title="Workouts" footer={readinessFooter}>
        <ToggleRow
          id="set-readiness"
          icon="bell"
          tone="accent"
          label="Readiness check"
          detail="Before each workout"
          checked={current.readinessCheck}
          onChange={(value) => void updateSettings(value ? { readinessCheck: true } : { readinessCheck: false, wearableScore: false })}
        />
        {current.readinessCheck && (
          <ToggleRow
            id="set-wearable"
            label="Wearable score"
            detail="Add your Oura, Whoop or Garmin readiness"
            checked={current.wearableScore}
            onChange={(value) => void updateSettings({ wearableScore: value })}
          />
        )}
      </ListGroup>

      <ListGroup>
        <ToggleRow
          id="set-awake"
          icon="phone"
          label="Keep screen on"
          detail="During workouts, so the rest chime can play"
          checked={current.keepAwake}
          onChange={(value) => void updateSettings({ keepAwake: value })}
        />
        <ToggleRow
          id="set-sound"
          icon="clock"
          label="Rest timer sound"
          checked={current.sound}
          onChange={(value) => void updateSettings({ sound: value })}
        />
        <ToggleRow
          id="set-haptics"
          icon="sparkle"
          label="Haptics"
          detail="A light tap on key buttons"
          checked={current.haptics}
          onChange={(value) => void updateSettings({ haptics: value })}
        />
      </ListGroup>

      <ListGroup title="Appearance">
        <ControlRow label="Theme">
          <Segmented label="Theme" options={THEMES} value={current.theme} onChange={(value) => void updateSettings({ theme: value })} />
        </ControlRow>
      </ListGroup>

      <ListGroup
        title="Your data"
        footer="Everything stays on this phone. A backup is a file you keep in Files, iCloud Drive or anywhere you like."
      >
        <ListRow
          icon={persisted ? 'shield' : 'shield-alert'}
          tone={persisted ? 'good' : 'warn'}
          label={persisted ? 'Storage is protected' : 'Storage isn’t protected yet'}
          detail={
            persisted
              ? 'Your phone won’t clear Atlas data to free up space.'
              : standalone
                ? 'Your phone may clear data if it runs low on space. Keep a backup.'
                : 'Add Atlas to your Home Screen to protect your data.'
          }
        />
        <ListRow
          icon="share"
          tone={backup?.due ? 'warn' : 'accent'}
          label={exporting ? 'Preparing backup…' : 'Export backup'}
          detail={
            (app?.lastBackupAt ? `Last backup ${formatRelativeDay(app.lastBackupAt)}` : 'No backup yet') +
            (backup && backup.workoutsSince > 0 ? ` · ${plural(backup.workoutsSince, 'workout')} since` : '')
          }
          onClick={() => void onExport()}
        />
        <ListRow
          icon="import"
          tone="accent"
          label="Import backup"
          detail="Restore from a backup file"
          onClick={() => {
            if (workoutActive.value) showToast('Finish your workout first');
            else fileInput.current?.click();
          }}
        />
        <ListRow
          icon="history"
          label="Safety snapshots"
          detail="Saved automatically before updates and imports"
          value={snapshotCount === null ? '–' : String(snapshotCount)}
        />
      </ListGroup>

      <ListGroup title="About">
        {!standalone && <ListRow icon="home-add" tone="accent" label="Add to Home Screen" chevron onClick={() => setInstallOpen(true)} />}
        <ListRow icon="sparkle" tone="win" label="What’s new" chevron onClick={() => setNotesOpen(true)} />
        <ListRow label="Version" value={APP_VERSION} />
      </ListGroup>

      <Sheet open={installOpen} onClose={() => setInstallOpen(false)} title="Add Atlas to your Home Screen">
        <InstallGuide variant="sheet" />
      </Sheet>

      <Sheet
        open={redoOpen}
        onClose={() => setRedoOpen(false)}
        title="Redo setup?"
        footer={
          <>
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                setRedoOpen(false);
                if (workoutActive.value) showToast('Finish your workout first');
                else redoingSetup.value = true;
              }}
            >
              Answer again
            </Button>
            <Button variant="ghost" block onClick={() => setRedoOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <p class="sheet-copy">
          You’ll answer the setup questions again and get a new plan. Your workouts, records and measurements stay exactly
          as they are, and your current plan is kept in the background.
        </p>
      </Sheet>

      <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => void onFileChosen(event)} />

      <WhatsNewSheet content={currentNotes(APP_VERSION)} open={notesOpen} onClose={() => setNotesOpen(false)} />

      <Sheet
        open={pendingImport !== null}
        onClose={() => !importing && setPendingImport(null)}
        title="Restore this backup?"
        footer={
          <>
            <Button variant="danger" size="lg" block disabled={importing} onClick={() => void onConfirmImport()}>
              {importing ? 'Restoring…' : 'Replace data on this phone'}
            </Button>
            <Button variant="ghost" block disabled={importing} onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
          </>
        }
      >
        {pendingImport && <ImportPreview preview={pendingImport.preview} />}
      </Sheet>
    </main>
  );
}

function ImportPreview({ preview }: { preview: BackupPreview }) {
  const range =
    preview.firstWorkout && preview.lastWorkout
      ? `${formatShortDate(preview.firstWorkout)} – ${formatShortDate(preview.lastWorkout)}`
      : 'No workouts yet';
  return (
    <>
      <p class="sheet-copy">
        Saved {preview.exportedAt ? formatShortDate(preview.exportedAt) : 'on an unknown date'} from Atlas{' '}
        {preview.appVersion}.
      </p>
      <div class="preview-grid">
        <div class="stat">
          <p class="stat-label">Workouts</p>
          <p class="stat-value">{preview.workouts}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Measurements</p>
          <p class="stat-value">{preview.measurements}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Gyms</p>
          <p class="stat-value">{preview.gyms.length || '–'}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Records</p>
          <p class="stat-value">{preview.totalRecords}</p>
        </div>
      </div>
      <p class="sheet-copy">{range}</p>
      <p class="sheet-copy">
        This replaces everything on this phone with the backup
        {preview.gyms.length ? ` (${plural(preview.gyms.length, 'gym')}: ${preview.gyms.join(', ')})` : ''}. Your current
        data is saved as a safety snapshot first.
      </p>
    </>
  );
}

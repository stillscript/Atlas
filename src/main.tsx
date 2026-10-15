import { render } from 'preact';
import '@fontsource-variable/geist';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';
import { loadTrainingState } from './app/repo';
import { navigate } from './app/router';
import { loadWorkoutState, shouldResumeOnLaunch, startWorkoutEffects } from './app/workout';
import {
  APP_VERSION,
  activeGym,
  activeProgram,
  appMeta,
  applyTheme,
  completedSessions,
  installPrompt,
  patchAppMeta,
  profile,
  setDatabase,
  settings,
  type InstallPromptEvent,
} from './app/state';
import { ensureAppMeta, loadSettings } from './db/kv';
import { openAtlasDB } from './db/open';
import { requestPersistentStorage } from './db/persist';
import { setHapticsEnabled } from './lib/haptics';
import { applyWaitingUpdateOnColdStart, startServiceWorker } from './pwa/register';
import { detectVersionChange, pendingWhatsNew } from './pwa/whatsNew';
import { RecoveryScreen } from './screens/RecoveryScreen';
import { showToast } from './ui/feedback';

/**
 * Boot order matters:
 * 1. Open (and if needed migrate) the database. On failure, show the recovery screen and stop.
 * 2. If a new version finished downloading last time and no workout is in progress, switch to it
 *    now, before anything renders.
 * 3. Render, then do everything that can wait: service worker checks, storage persistence,
 *    "Updated to vX" and What's new.
 */
// Android/Chrome offer a one-tap install; keep the event so the Home Screen guide can use it.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt.value = event as InstallPromptEvent;
});

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  // The bundle loaded, so clear index.html's one-shot recovery flag.
  try {
    sessionStorage.removeItem('atlas:boot-retry');
  } catch {
    // Private mode.
  }

  let opened;
  try {
    opened = await openAtlasDB({
      onBlocked: () => showToast('Close other Atlas tabs to finish updating'),
    });
  } catch (error) {
    console.error('[atlas] could not open data', error);
    render(<RecoveryScreen error={error} />, root);
    return;
  }

  const { db } = opened;
  setDatabase(db);
  const [loadedSettings, meta] = await Promise.all([loadSettings(db), ensureAppMeta(db)]);
  const training = await loadTrainingState(db, loadedSettings);
  settings.value = loadedSettings;
  appMeta.value = meta;
  profile.value = training.profile;
  activeGym.value = training.gym;
  activeProgram.value = training.program;
  completedSessions.value = training.completedSessions;
  applyTheme(loadedSettings.theme);
  setHapticsEnabled(loadedSettings.haptics);
  await loadWorkoutState(db, meta, loadedSettings.activeGymId);

  if (await applyWaitingUpdateOnColdStart(Boolean(meta.activeSessionId))) return;

  // A workout that was open when the app closed (or updated) reopens exactly where it was.
  if (shouldResumeOnLaunch()) navigate('workout', { replace: true });
  startWorkoutEffects();
  render(<App />, root);

  void startServiceWorker();
  void afterLaunch();
}

async function afterLaunch(): Promise<void> {
  const meta = appMeta.value;
  const change = detectVersionChange(meta?.lastSeenVersion, APP_VERSION);
  if (change.kind === 'updated') {
    showToast(`Updated to v${APP_VERSION}`, 'good');
    if (change.releases.some((r) => r.highlights.length > 0)) {
      pendingWhatsNew.value = { title: `What's new in ${APP_VERSION}`, releases: change.releases };
    }
  }
  const persist = await requestPersistentStorage();
  await patchAppMeta({ lastSeenVersion: APP_VERSION, persist });
}

void boot();

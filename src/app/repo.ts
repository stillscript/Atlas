import { DEFAULT_SETTINGS } from '../db/kv';
import type { AtlasDB } from '../db/schema';
import type { AppMeta, Gym, Profile, Program, Settings } from '../db/types';

/** Reads and writes for training data, kept out of components so screens stay simple. */

export interface TrainingState {
  profile: Profile | null;
  gym: Gym | null;
  program: Program | null;
  completedSessions: number;
}

export async function loadTrainingState(db: AtlasDB, settings: Settings): Promise<TrainingState> {
  const [profileRecord, gym, program, completedSessions] = await Promise.all([
    db.get('kv', 'profile'),
    settings.activeGymId ? db.get('gyms', settings.activeGymId) : Promise.resolve(undefined),
    settings.activeProgramId ? db.get('programs', settings.activeProgramId) : Promise.resolve(undefined),
    db.countFromIndex('sessions', 'byStatus', 'completed'),
  ]);
  return {
    profile: (profileRecord?.value as Profile | undefined) ?? null,
    gym: gym ?? null,
    program: program ?? null,
    completedSessions,
  };
}

/**
 * Saves the result of setup in one transaction: profile, gym, plan, the active ids in settings and
 * the onboarding timestamp. Earlier gyms and plans are kept (with their history), just no longer active.
 */
export async function saveOnboarding(
  db: AtlasDB,
  result: { profile: Profile; gym: Gym; program: Program },
  now = Date.now(),
): Promise<{ settings: Settings; app: AppMeta }> {
  const tx = db.transaction(['kv', 'gyms', 'programs'], 'readwrite');
  const kv = tx.objectStore('kv');
  const [settingsRecord, appRecord] = await Promise.all([kv.get('settings'), kv.get('app')]);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(settingsRecord?.value as Settings | undefined),
    activeGymId: result.gym.id,
    activeProgramId: result.program.id,
  };
  const app: AppMeta = {
    ...((appRecord?.value as AppMeta | undefined) ?? { installId: `inst-${now.toString(36)}`, createdAt: now }),
    onboardingCompletedAt: now,
  };
  await Promise.all([
    tx.objectStore('gyms').put(result.gym),
    tx.objectStore('programs').put(result.program),
    kv.put({ key: 'profile', value: result.profile }),
    kv.put({ key: 'settings', value: settings }),
    kv.put({ key: 'app', value: app }),
    tx.done,
  ]);
  return { settings, app };
}

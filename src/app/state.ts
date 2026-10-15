import { computed, signal } from '@preact/signals';
import { DEFAULT_SETTINGS, saveSettings, updateAppMeta } from '../db/kv';
import type { AtlasDB } from '../db/schema';
import type { AppMeta, Gym, Profile, Program, Settings, ThemePreference } from '../db/types';
import { setHapticsEnabled } from '../lib/haptics';
import { isMobile, isStandalone } from '../lib/platform';

/**
 * App-wide state. Screens read these signals; every write goes through IndexedDB first and only
 * then updates the signal, so what's on screen is always what's saved.
 */

export const APP_VERSION = __APP_VERSION__;

let database: AtlasDB | null = null;

export function setDatabase(db: AtlasDB): void {
  database = db;
}

export function getDb(): AtlasDB {
  if (!database) throw new Error('Database not open yet');
  return database;
}

export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const appMeta = signal<AppMeta | null>(null);

/** A workout is in progress: updates and What's new wait until it ends. */
export const workoutActive = computed(() => Boolean(appMeta.value?.activeSessionId));

// ---------------------------------------------------------------- training data

export const profile = signal<Profile | null>(null);
export const activeGym = signal<Gym | null>(null);
export const activeProgram = signal<Program | null>(null);
export const completedSessions = signal(0);

/** "Redo setup" from Settings: shows onboarding again without touching history. */
export const redoingSetup = signal(false);

/** Phones in a browser tab see the Home Screen guide once, before setup. */
export const showInstallGuide = computed(
  () => isMobile() && !isStandalone() && !appMeta.value?.installGuideDismissedAt && !appMeta.value?.onboardingCompletedAt,
);

export const needsSetup = computed(() => redoingSetup.value || !appMeta.value?.onboardingCompletedAt || !activeProgram.value);

/** Android/Chrome's install prompt, kept so the guide can offer a one-tap install. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export const installPrompt = signal<InstallPromptEvent | null>(null);

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const next = await saveSettings(getDb(), patch);
  settings.value = next;
  if (patch.theme !== undefined) applyTheme(next.theme);
  if (patch.haptics !== undefined) setHapticsEnabled(next.haptics);
}

export async function patchAppMeta(patch: Partial<AppMeta>): Promise<void> {
  appMeta.value = await updateAppMeta(getDb(), patch);
}

const THEME_COLORS = { light: '#f5f4f0', dark: '#0b0d11' } as const;

/** Applies a theme choice: "system" follows the phone; light/dark override it. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.getAttribute('media') ?? '';
    const systemColor = media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light;
    meta.content = preference === 'system' ? systemColor : THEME_COLORS[preference];
  }
}

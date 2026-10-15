import { signal } from '@preact/signals';

/**
 * Service worker registration and the update flow.
 *
 * - Launch and every return to the foreground: check for a new version.
 * - A new version that finishes downloading while the app is open waits. The app shows a small
 *   "Update ready" banner (never during a workout); tapping Update applies it.
 * - A version that is still waiting at the next cold start is applied before the app renders,
 *   unless a workout is in progress.
 */

export const updateReady = signal(false);

let registration: ServiceWorkerRegistration | null = null;
let reloading = false;
let lastCheck = 0;
const RECENT_APPLY_KEY = 'atlas:update-applied-at';

const supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !import.meta.env.DEV;

/** Guards against a reload loop if a waiting worker refuses to activate. */
function appliedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RECENT_APPLY_KEY) ?? 0);
    return Date.now() - at < 15_000;
  } catch {
    return false;
  }
}

function listenForControllerChange(): void {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/**
 * Called before the first render. Uses only the local registration lookup (no network), so a slow
 * gym connection can never delay launch. Returns true if the page is reloading into a new version.
 */
export async function applyWaitingUpdateOnColdStart(workoutInProgress: boolean): Promise<boolean> {
  if (!supported()) return false;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (!existing?.waiting || !navigator.serviceWorker.controller) return false;
    if (workoutInProgress || appliedRecently()) {
      registration = existing;
      updateReady.value = true;
      return false;
    }
    listenForControllerChange();
    try {
      sessionStorage.setItem(RECENT_APPLY_KEY, String(Date.now()));
    } catch {
      // Private mode: the loop guard is best effort.
    }
    existing.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  } catch {
    return false;
  }
}

function watchForWaiting(reg: ServiceWorkerRegistration): void {
  if (reg.waiting && navigator.serviceWorker.controller) updateReady.value = true;
  reg.addEventListener('updatefound', () => {
    const incoming = reg.installing;
    incoming?.addEventListener('statechange', () => {
      // "installed" with an existing controller means a new version is waiting. Without a
      // controller it's the very first install, which needs no prompt.
      if (incoming.state === 'installed' && navigator.serviceWorker.controller) updateReady.value = true;
    });
  });
}

/** Registers the worker after the app has rendered, then keeps checking for updates. */
export async function startServiceWorker(): Promise<void> {
  if (!supported()) return;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
  } catch {
    return; // Offline first launch or unsupported context: the app still works, just not offline yet.
  }
  listenForControllerChange();
  watchForWaiting(registration);
  void checkForUpdate(true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
}

export async function checkForUpdate(force = false): Promise<void> {
  if (!registration) return;
  const now = Date.now();
  if (!force && now - lastCheck < 60_000) return;
  lastCheck = now;
  try {
    await registration.update();
  } catch {
    // Offline: try again next time the app comes to the foreground.
  }
  if (registration.waiting && navigator.serviceWorker.controller) updateReady.value = true;
}

/** Activates the waiting version; the controllerchange listener reloads into it. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  try {
    sessionStorage.setItem(RECENT_APPLY_KEY, String(Date.now()));
  } catch {
    // Best effort.
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

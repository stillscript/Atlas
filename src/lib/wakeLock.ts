/**
 * Keeps the screen on during a workout (Screen Wake Lock API; iOS 16.4+ in Home Screen apps,
 * 18.4+ in Safari). The browser drops the lock whenever the page is hidden, so it's requested
 * again each time the app comes back.
 */

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || sentinel || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Low battery mode or not allowed: the timer still works from timestamps.
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => void acquire());
}

export function setKeepAwake(on: boolean): void {
  wanted = on;
  if (on) void acquire();
  else if (sentinel) {
    void sentinel.release().catch(() => undefined);
    sentinel = null;
  }
}

import type { PersistStatus } from './types';

/**
 * Asks the browser to keep Atlas's storage even under storage pressure.
 * Safari grants this to Home Screen apps; in a browser tab it may be refused. The result is
 * recorded so Settings can show it and the Coach can nudge toward a backup when it's refused.
 */
export async function requestPersistentStorage(): Promise<PersistStatus> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage || typeof storage.persist !== 'function') {
    return { supported: false, granted: false, checkedAt: Date.now() };
  }
  try {
    let granted = await storage.persisted();
    if (!granted) granted = await storage.persist();
    return { supported: true, granted, checkedAt: Date.now() };
  } catch {
    return { supported: true, granted: false, checkedAt: Date.now() };
  }
}

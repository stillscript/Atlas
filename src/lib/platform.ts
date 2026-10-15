/** True when Atlas runs as an installed app (Home Screen) rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports as Mac; touch support tells them apart.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
}

/** Phones and tablets: where installing to the Home Screen matters. */
export function isMobile(): boolean {
  return isIOS() || isAndroid();
}

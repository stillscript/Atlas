/**
 * Haptic feedback for key taps.
 *
 * Android: the Vibration API. iPhone: web apps can't vibrate directly, but since iOS 18, toggling a
 * native switch control plays the system haptic. Clicking a hidden one from inside a user gesture
 * gives a real tick. Outside a user gesture (e.g. a timer) iOS stays silent, which is the
 * platform's rule, not a bug.
 */

let enabled = true;
let switchLabel: HTMLLabelElement | null = null;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

type HapticKind = 'tap' | 'success' | 'warning';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: [10, 50, 14],
  warning: [18, 70, 18],
};

export function haptic(kind: HapticKind = 'tap'): void {
  if (!enabled || typeof window === 'undefined') return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(PATTERNS[kind]);
    return;
  }
  try {
    if (!switchLabel) {
      switchLabel = document.createElement('label');
      switchLabel.setAttribute('aria-hidden', 'true');
      switchLabel.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      switchLabel.appendChild(input);
      document.body.appendChild(switchLabel);
    }
    switchLabel.click();
  } catch {
    // No haptics available; visual feedback covers it.
  }
}

import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';

/**
 * Renders fixed-position UI (bottom action bars, sheets) at the end of <body>, outside the
 * screen's enter animation: a transform on an ancestor would otherwise make "fixed" elements
 * move with the animating screen for its first frames.
 */
export function Portal({ children }: { children: ComponentChildren }) {
  return createPortal(<>{children}</>, document.body);
}

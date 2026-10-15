import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { IconButton } from './controls';
import './sheet.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ComponentChildren;
  footer?: ComponentChildren;
}

const CLOSE_MS = 320;

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab cycle through the sheet instead of reaching the page behind it. */
function keepFocusInside(node: HTMLElement, event: KeyboardEvent): void {
  const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (!node.contains(active) || (event.shiftKey && (active === first || active === node))) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Bottom sheet. Slides up over a scrim; closes with the X, a tap on the scrim, Escape, or a
 * downward swipe on its top edge.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; dy: number; startT: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      // Only the top sheet reacts when two are stacked.
      const sheets = document.querySelectorAll('.sheet');
      if (!node || sheets[sheets.length - 1] !== node) return;
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === 'Tab') keepFocusInside(node, event);
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('sheet-open');
      previous?.focus?.({ preventScroll: true });
    };
  }, [mounted]);

  if (!mounted) return null;

  const onPointerDown = (event: PointerEvent) => {
    drag.current = { startY: event.clientY, dy: 0, startT: performance.now() };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY);
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state || !panel.current) return;
    panel.current.style.transition = '';
    panel.current.style.transform = '';
    const velocity = state.dy / Math.max(1, performance.now() - state.startT);
    if (state.dy > 110 || (state.dy > 30 && velocity > 0.6)) onCloseRef.current();
  };

  return createPortal(
    <div class={visible ? 'sheet-layer is-visible' : 'sheet-layer'}>
      <div class="sheet-scrim" onClick={() => onCloseRef.current()} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div
          class="sheet-drag"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span class="sheet-grabber" aria-hidden="true" />
          {title && (
            <header class="sheet-header">
              <h2 class="sheet-title">{title}</h2>
              <IconButton icon="close" label="Close" class="sheet-close" onClick={() => onCloseRef.current()} />
            </header>
          )}
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

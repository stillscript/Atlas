import type { ComponentChildren } from 'preact';
import { signal } from '@preact/signals';
import { Icon, type IconName } from './Icon';
import './feedback.css';

// ---------------------------------------------------------------- toasts

export type ToastTone = 'neutral' | 'good' | 'win' | 'danger';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

const toasts = signal<ToastMessage[]>([]);
let nextToastId = 1;

/** A short message at the top of the screen that clears itself, optionally with one action (Undo). */
export function showToast(message: string, tone: ToastTone = 'neutral', durationMs = 3200, action?: ToastAction): void {
  const id = nextToastId++;
  toasts.value = [...toasts.value.slice(-2), { id, message, tone, action }];
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, durationMs);
}

export function ToastHost() {
  return (
    <div class="toast-host" role="status" aria-live="polite">
      {toasts.value.map((toast) => (
        <div key={toast.id} class={`toast toast-${toast.tone}${toast.action ? ' has-action' : ''}`}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              class="toast-action"
              onClick={() => {
                toasts.value = toasts.value.filter((t) => t.id !== toast.id);
                toast.action!.onClick();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- empty states

interface EmptyStateProps {
  icon: IconName;
  title: string;
  children: ComponentChildren;
  action?: ComponentChildren;
}

/** An invitation, not an apology: what this space is for and how to fill it. */
export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div class="empty">
      <span class="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2 class="empty-title">{title}</h2>
      <p class="empty-body">{children}</p>
      {action && <div class="empty-action">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- notices

interface NoticeProps {
  icon: IconName;
  tone?: 'accent' | 'good' | 'warn' | 'danger' | 'win';
  title: string;
  children?: ComponentChildren;
  action?: ComponentChildren;
}

/** An inline card for things worth knowing (backup reminder, storage status). */
export function Notice({ icon, tone = 'accent', title, children, action }: NoticeProps) {
  return (
    <div class={`notice notice-${tone}`}>
      <span class="notice-icon">
        <Icon name={icon} size={20} />
      </span>
      <div class="notice-text">
        <p class="notice-title">{title}</p>
        {children && <p class="notice-body">{children}</p>}
        {action && <div class="notice-action">{action}</div>}
      </div>
    </div>
  );
}

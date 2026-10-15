import type { ComponentChildren } from 'preact';
import { haptic } from '../lib/haptics';
import { Icon } from './Icon';

interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  actions?: ComponentChildren;
  onBack?: () => void;
  backLabel?: string;
}

/** iOS-style large title with an optional back button and trailing actions. */
export function ScreenHeader({ title, eyebrow, actions, onBack, backLabel = 'Back' }: ScreenHeaderProps) {
  return (
    <header class="screen-header">
      <div class="header-bar">
        {onBack ? (
          <button
            type="button"
            class="back-btn"
            onClick={() => {
              haptic('tap');
              onBack();
            }}
          >
            <Icon name="chevron-left" size={22} />
            <span>{backLabel}</span>
          </button>
        ) : (
          <span />
        )}
        <div class="header-actions">{actions}</div>
      </div>
      {eyebrow && <p class="eyebrow">{eyebrow}</p>}
      <h1 class="large-title">{title}</h1>
    </header>
  );
}

import type { ComponentChildren } from 'preact';
import { haptic } from '../lib/haptics';
import { Icon, type IconName } from './Icon';
import './choices.css';

interface ChoiceCardProps {
  title: string;
  description?: ComponentChildren;
  icon?: IconName;
  selected: boolean;
  onSelect: () => void;
  /** Extra content under the description (e.g. a week preview). */
  children?: ComponentChildren;
  badge?: string;
}

/** A large, single-choice card. Use inside a `role="radiogroup"` container. */
export function ChoiceCard({ title, description, icon, selected, onSelect, children, badge }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      class={selected ? 'choice is-selected' : 'choice'}
      onClick={() => {
        haptic('tap');
        onSelect();
      }}
    >
      {icon && (
        <span class="choice-icon">
          <Icon name={icon} size={22} />
        </span>
      )}
      <span class="choice-text">
        <span class="choice-title">
          {title}
          {badge && <span class="choice-badge">{badge}</span>}
        </span>
        {description && <span class="choice-desc">{description}</span>}
        {children}
      </span>
      <span class="choice-check" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
    </button>
  );
}

interface StepperProps {
  value: number;
  /** Allowed values, ascending. Steps move through these (e.g. a machine's real loads). */
  options: number[];
  onChange: (value: number) => void;
  label: string;
  format?: (value: number) => string;
  unit?: string;
  caption?: ComponentChildren;
  size?: 'md' | 'lg';
}

/** − value + with big targets. Steps through `options`, so it can only land on real values. */
export function Stepper({ value, options, onChange, label, format, unit, caption, size = 'md' }: StepperProps) {
  const index = options.findIndex((o) => o >= value - 1e-9);
  const current = index === -1 ? options.length - 1 : index;
  const step = (delta: number) => {
    const next = options[Math.min(options.length - 1, Math.max(0, current + delta))];
    if (next !== undefined && next !== value) {
      haptic('tap');
      onChange(next);
    }
  };
  return (
    <div class={`stepper stepper-${size}`} role="group" aria-label={label}>
      <button type="button" class="stepper-btn" aria-label={`Less ${label.toLowerCase()}`} onClick={() => step(-1)} disabled={current <= 0}>
        <Icon name="minus" size={22} />
      </button>
      <div class="stepper-value" aria-live="polite">
        <span class="stepper-number num">{format ? format(value) : value}</span>
        {unit && <span class="stepper-unit">{unit}</span>}
        {caption && <span class="stepper-caption">{caption}</span>}
      </div>
      <button
        type="button"
        class="stepper-btn"
        aria-label={`More ${label.toLowerCase()}`}
        onClick={() => step(1)}
        disabled={current >= options.length - 1}
      >
        <Icon name="plus" size={22} />
      </button>
    </div>
  );
}

interface PillToggleProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  ariaLabel?: string;
}

/** A multi-select pill (weekdays, equipment). */
export function PillToggle({ label, selected, onToggle, ariaLabel }: PillToggleProps) {
  return (
    <button
      type="button"
      class={selected ? 'pill is-selected' : 'pill'}
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={() => {
        haptic('tap');
        onToggle();
      }}
    >
      {label}
    </button>
  );
}

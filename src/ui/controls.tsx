import type { ComponentChildren } from 'preact';
import { haptic } from '../lib/haptics';
import { Icon, type IconName } from './Icon';
import './controls.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children?: ComponentChildren;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  type?: 'button' | 'submit';
  disabled?: boolean;
  class?: string;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  block = false,
  icon,
  type = 'button',
  disabled,
  class: className,
  ariaLabel,
  onClick,
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, block ? 'btn-block' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      class={classes}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(event) => {
        haptic('tap');
        onClick?.(event);
      }}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : 20} />}
      {children !== undefined && <span>{children}</span>}
    </button>
  );
}

interface IconButtonProps {
  icon: IconName;
  label: string;
  onClick?: () => void;
  class?: string;
}

/** A 44pt round button for header actions. */
export function IconButton({ icon, label, onClick, class: className }: IconButtonProps) {
  return (
    <button
      type="button"
      class={className ? `icon-btn ${className}` : 'icon-btn'}
      aria-label={label}
      onClick={() => {
        haptic('tap');
        onClick?.();
      }}
    >
      <Icon name={icon} />
    </button>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

/** A switch. On iPhone (iOS 18+) the native switch plays the system haptic on its own. */
export function Toggle({ checked, onChange, label, id }: ToggleProps) {
  const nativeSwitch = { switch: '' } as Record<string, string>;
  return (
    <input
      {...nativeSwitch}
      id={id}
      type="checkbox"
      role="switch"
      class="toggle"
      checked={checked}
      aria-label={label}
      onChange={(event) => {
        if (typeof navigator.vibrate === 'function') haptic('tap');
        onChange(event.currentTarget.checked);
      }}
    />
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div
      class="segmented"
      role="radiogroup"
      aria-label={label}
      style={{ '--count': String(options.length), '--index': String(index) }}
    >
      <span class="segmented-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          class={option.value === value ? 'segmented-option is-active' : 'segmented-option'}
          onClick={() => {
            if (option.value !== value) {
              haptic('tap');
              onChange(option.value);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

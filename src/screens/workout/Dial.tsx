import { useEffect, useRef, useState } from 'preact/hooks';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';

interface DialProps {
  label: string;
  value: number;
  /** Allowed values, ascending: − and + move through these, typed values snap to the nearest. */
  options: number[];
  onChange: (value: number) => void;
  display: string;
  unit?: string;
  caption?: string;
}

function nearest(options: number[], target: number): number {
  return options.reduce((best, option) => (Math.abs(option - target) < Math.abs(best - target) ? option : best), options[0] ?? target);
}

/**
 * A compact − value + control for the set logger. Tapping the number lets you type one instead
 * (handy for big jumps); it snaps to something the equipment can actually do.
 */
export function Dial({ label, value, options, onChange, display, unit, caption }: DialProps) {
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const index = Math.max(0, options.findIndex((o) => o >= value - 1e-9));
  const current = options[index] === undefined ? options.length - 1 : index;

  useEffect(() => {
    if (typing) input.current?.select();
  }, [typing]);

  const step = (delta: number) => {
    const next = options[Math.min(options.length - 1, Math.max(0, current + delta))];
    if (next !== undefined && next !== value) {
      haptic('tap');
      onChange(next);
    }
  };

  const commit = () => {
    const typed = Number((input.current?.value ?? '').replace(',', '.'));
    setTyping(false);
    if (Number.isFinite(typed) && typed >= 0 && input.current?.value.trim()) onChange(nearest(options, typed));
  };

  return (
    <div class="dial" role="group" aria-label={label}>
      <span class="dial-label">{label}</span>
      <div class="dial-row">
        <button type="button" class="dial-btn" aria-label={`Less ${label.toLowerCase()}`} disabled={current <= 0} onClick={() => step(-1)}>
          <Icon name="minus" size={22} />
        </button>
        {typing ? (
          <input
            ref={input}
            class="dial-input num"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={label}
            defaultValue={String(value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') input.current?.blur();
              if (event.key === 'Escape') setTyping(false);
            }}
          />
        ) : (
          <button type="button" class="dial-value" aria-label={`${label}: ${display} ${unit ?? ''}. Tap to type`} onClick={() => setTyping(true)}>
            <span class="dial-number num">{display}</span>
            {unit && <span class="dial-unit">{unit}</span>}
          </button>
        )}
        <button
          type="button"
          class="dial-btn"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={current >= options.length - 1}
          onClick={() => step(1)}
        >
          <Icon name="plus" size={22} />
        </button>
      </div>
      <span class="dial-caption">{caption || ' '}</span>
    </div>
  );
}

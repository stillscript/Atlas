import { haptic } from '../../lib/haptics';

interface ThreeWayProps<T extends number> {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A row of equal buttons with nothing chosen until the first tap (unlike a segmented control). */
export function ThreeWay<T extends number>({ label, value, options, onChange }: ThreeWayProps<T>) {
  return (
    <div class="threeway" role="radiogroup" aria-label={label} style={{ '--count': String(options.length) }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          class={value === option.value ? 'threeway-option is-selected' : 'threeway-option'}
          onClick={() => {
            haptic('tap');
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

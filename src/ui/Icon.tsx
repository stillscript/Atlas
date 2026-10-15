import type { JSX } from 'preact';

/**
 * Atlas icon set: 24px grid, 1.8 stroke, round caps. Drawn here so the app has no icon font
 * dependency and every glyph shares one weight.
 */
const PATHS = {
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15.25" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  coach: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M15.4 8.6 13.3 13.3 8.6 15.4l2.1-4.7z" />
    </>
  ),
  progress: <path d="M3.5 17.5 9 12l3.75 3.25L20.5 7.5M15.5 7.5h5v5" />,
  plan: (
    <>
      <path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11" />
      <circle cx="5" cy="6.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7.5h6M14.5 7.5H20M4 16.5h10M18.5 16.5H20" />
      <circle cx="12.25" cy="7.5" r="2.25" />
      <circle cx="16.25" cy="16.5" r="2.25" />
    </>
  ),
  'chevron-left': <path d="M15 5 8 12l7 7" />,
  'chevron-right': <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  share: <path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5V18a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18v-5.5" />,
  import: <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M5 15v3a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18v-3" />,
  shield: (
    <>
      <path d="M12 3.25 19 6v5.5c0 4.4-2.9 7.6-7 9.25-4.1-1.65-7-4.85-7-9.25V6z" />
      <path d="m8.75 12 2.25 2.25 4.25-4.5" />
    </>
  ),
  'shield-alert': (
    <>
      <path d="M12 3.25 19 6v5.5c0 4.4-2.9 7.6-7 9.25-4.1-1.65-7-4.85-7-9.25V6z" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sparkle: <path d="M12 3.5c.6 4.1 2.4 5.9 6.5 6.5-4.1.6-5.9 2.4-6.5 6.5-.6-4.1-2.4-5.9-6.5-6.5 4.1-.6 5.9-2.4 6.5-6.5zM18.5 15.5c.25 1.7 1 2.45 2.5 2.75-1.5.3-2.25 1.05-2.5 2.75-.25-1.7-1-2.45-2.5-2.75 1.5-.3 2.25-1.05 2.5-2.75z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.75" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  dumbbell: <path d="M6.5 7.5v9M3.75 9.75v4.5M17.5 7.5v9M20.25 9.75v4.5M6.5 12h11" />,
  'home-add': (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bell: <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5zM10 20.5h4" />,
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.75h2" />
    </>
  ),
  history: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4M12 8v4.25l2.75 1.75" />,
  flame: <path d="M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.3 3.6-7.8.4 1.6 1.3 2.7 2.4 3.3.3-2.9 1.6-5.3 3.4-6.8.3 3.3 3.6 5.4 3.6 9.8 0 4.4-2.9 7.7-6.5 7.7zM12 21c-1.6 0-2.8-1.2-2.8-2.8 0-1.8 1.6-2.6 2.8-4.2 1.2 1.6 2.8 2.4 2.8 4.2 0 1.6-1.2 2.8-2.8 2.8z" />,
  pulse: <path d="M3.5 12.5h3.75l2.25-5 3.5 10 2.5-6.5 1.25 1.5h3.75" />,
  barbell: <path d="M2.75 12h18.5M5.5 8.5v7M8.25 7v10M15.75 7v10M18.5 8.5v7" />,
  sprout: <path d="M12 20.5V11M12 11c0-3.6-2.5-6-6.5-6 0 3.6 2.6 6 6.5 6zm0 0c0-3 2.1-5.25 6.5-5.25 0 3.25-2.6 5.25-6.5 5.25zM8 20.5h8" />,
  mountain: <path d="m2.75 19.5 6.5-11 4 6.5 2.25-3.5 5.75 8zM9.25 8.5l1.5 2.5" />,
  building: (
    <>
      <path d="M4.5 20.5V5.75A1.75 1.75 0 0 1 6.25 4h7.5a1.75 1.75 0 0 1 1.75 1.75V20.5M15.5 9.5h2.25a1.75 1.75 0 0 1 1.75 1.75v9.25M3 20.5h18" />
      <path d="M8 8h4M8 11.5h4M8 15h4" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-.75.75M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l.75-.75" />,
  'arrow-right': <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  'toggle-on': (
    <>
      <rect x="2.75" y="7" width="18.5" height="10" rx="5" />
      <circle cx="16.25" cy="12" r="2.75" fill="currentColor" stroke="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  'chevron-down': <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  swap: <path d="M7.5 4.5 4 8l3.5 3.5M4 8h12.5M16.5 12.5 20 16l-3.5 3.5M20 16H7.5" />,
  book: <path d="M12 6.75C10 5.25 7.5 4.75 4 4.75v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2zM12 6.75v13" />,
  pencil: <path d="M4.5 19.5 5.5 15l10-10 3.5 3.5-10 10zM13.25 7.25l3.5 3.5" />,
  trophy: <path d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0zM7.5 6.5h-3c0 2.75 1.4 4.4 3.3 4.75M16.5 6.5h3c0 2.75-1.4 4.4-3.3 4.75M12 14v3.5M8.5 20h7M9.5 17.5h5" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  alert: <path d="M12 4 2.75 19.5h18.5zM12 10v4.25M12 17v.25" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />,
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V10M9.5 3.5h5M18 7l1.25-1.25" />
    </>
  ),
  list: <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.5M4 12h.5M4 17.5h.5" />,
} as const satisfies Record<string, JSX.Element>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
  /** Accessible label. Without one the icon is decorative and hidden from screen readers. */
  label?: string;
}

export function Icon({ name, size = 24, class: className, label }: IconProps) {
  return (
    <svg
      class={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

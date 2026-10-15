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

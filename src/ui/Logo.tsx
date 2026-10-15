/**
 * The Atlas mark: a figure bearing a sphere. It reads as a lifter holding the load, a summit with
 * the sun above it, and Atlas holding up the world. Geometry is shared with scripts/icons.mjs.
 */
export const MARK_PATH = 'M16 92 50 32 84 92H66.76L50 62.42 33.24 92Z';
export const MARK_ORB = { cx: 50, cy: 18, r: 10.5 } as const;

interface LogoProps {
  size?: number;
  class?: string;
  /** Announce as "Atlas"; leave false where the word Atlas is already visible. */
  labelled?: boolean;
}

export function Logo({ size = 40, class: className, labelled = false }: LogoProps) {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? 'Atlas' : undefined}
      aria-hidden={labelled ? undefined : 'true'}
      focusable="false"
    >
      <path d={MARK_PATH} fill="var(--mark)" />
      <circle cx={MARK_ORB.cx} cy={MARK_ORB.cy} r={MARK_ORB.r} fill="var(--mark-orb)" />
    </svg>
  );
}

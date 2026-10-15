import { signal } from '@preact/signals';
import changelogMarkdown from '../../CHANGELOG.md?raw';
import { compareVersions, parseChangelog, releasesBetween, unreleasedHighlights, type Release } from './changelog';

const RELEASES = parseChangelog(changelogMarkdown);

export interface WhatsNewContent {
  title: string;
  releases: Release[];
}

/** Set after an update; the app shows it once, when no workout is in progress. */
export const pendingWhatsNew = signal<WhatsNewContent | null>(null);

export type VersionChange = { kind: 'fresh' } | { kind: 'same' } | { kind: 'updated'; from: string; releases: Release[] };

export function detectVersionChange(lastSeen: string | undefined, current: string): VersionChange {
  if (!lastSeen) return { kind: 'fresh' };
  if (compareVersions(current, lastSeen) <= 0) return { kind: 'same' };
  return { kind: 'updated', from: lastSeen, releases: releasesBetween(RELEASES, lastSeen, current) };
}

/** Notes for the current version, for Settings › What's new. */
export function currentNotes(current: string): WhatsNewContent {
  const released = RELEASES.filter((r) => compareVersions(r.version, current) <= 0).slice(0, 3);
  if (released.some((r) => r.version === current)) return { title: "What's new", releases: released };
  const unreleased = unreleasedHighlights(changelogMarkdown);
  const inThisBuild: Release[] = unreleased.length ? [{ version: current, highlights: unreleased }] : [];
  return { title: "What's new", releases: [...inThisBuild, ...released] };
}

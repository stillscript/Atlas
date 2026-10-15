/**
 * Reads CHANGELOG.md. Each release's "### Highlights" list is what the in-app What's new sheet
 * shows, so the changelog is the single place release notes are written.
 */

export interface Release {
  version: string;
  date?: string;
  highlights: string[];
}

const RELEASE_HEADING = /^##\s+\[(\d+\.\d+\.\d+)\](?:\s+-\s+(\S+))?/;

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let current: Release | undefined;
  let inHighlights = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      const match = RELEASE_HEADING.exec(line);
      current = match ? { version: match[1]!, date: match[2], highlights: [] } : undefined;
      if (current) releases.push(current);
      inHighlights = false;
      continue;
    }
    if (line.startsWith('### ')) {
      inHighlights = /^###\s+highlights\s*$/i.test(line);
      continue;
    }
    if (current && inHighlights) {
      const item = /^\s*[-*]\s+(.*)$/.exec(line);
      if (item?.[1]) current.highlights.push(item[1].trim());
    }
  }
  return releases;
}

/** Highlights under "## [Unreleased]": shown as "In this build" before a version is released. */
export function unreleasedHighlights(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+\[unreleased\]/i.test(line.trim()));
  if (start < 0) return [];
  const highlights: string[] = [];
  let inHighlights = false;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) break;
    if (line.startsWith('### ')) {
      inHighlights = /^###\s+highlights\s*$/i.test(line);
      continue;
    }
    const item = inHighlights ? /^\s*[-*]\s+(.*)$/.exec(line) : null;
    if (item?.[1]) highlights.push(item[1].trim());
  }
  return highlights;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Releases newer than `afterVersion` and no newer than `upToVersion`, newest first. */
export function releasesBetween(releases: Release[], afterVersion: string, upToVersion: string): Release[] {
  return releases
    .filter((r) => compareVersions(r.version, afterVersion) > 0 && compareVersions(r.version, upToVersion) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

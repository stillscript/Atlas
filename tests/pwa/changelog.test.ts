import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareVersions, parseChangelog, releasesBetween } from '../../src/pwa/changelog';

const SAMPLE = `# Changelog

## [Unreleased]
### Highlights
- Not shown yet

## [1.2.0] - 2026-12-01
### Highlights
- Faster workout screen
- New cardio machines
### Fixes
- Internal fix that users never see

## [1.1.0] - 2026-11-01
### Highlights
* Body measurements chart

## [1.0.0] - 2026-10-20
### Highlights
- First release
`;

describe('changelog', () => {
  it('reads each release and only its Highlights', () => {
    const releases = parseChangelog(SAMPLE);
    expect(releases.map((r) => r.version)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
    expect(releases[0]).toEqual({ version: '1.2.0', date: '2026-12-01', highlights: ['Faster workout screen', 'New cardio machines'] });
    expect(releases[1]?.highlights).toEqual(['Body measurements chart']);
  });

  it('lists what changed since the last version this device ran', () => {
    const releases = parseChangelog(SAMPLE);
    expect(releasesBetween(releases, '1.0.0', '1.2.0').map((r) => r.version)).toEqual(['1.2.0', '1.1.0']);
    expect(releasesBetween(releases, '1.2.0', '1.2.0')).toEqual([]);
  });

  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });

  it('the real CHANGELOG.md parses and has highlights for the current version once released', () => {
    const md = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    const releases = parseChangelog(md);
    const current = releases.find((r) => r.version === pkg.version);
    if (current) expect(current.highlights.length).toBeGreaterThan(0);
  });
});

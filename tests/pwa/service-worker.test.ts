import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../src/sw/service-worker.js', import.meta.url), 'utf8');

describe('service worker template', () => {
  it('has the placeholders the build fills in', () => {
    expect(source).toContain('self.__ATLAS_PRECACHE__');
    expect(source).toContain('__ATLAS_BUILD_ID__');
    expect(source).toContain('__ATLAS_VERSION__');
  });

  it('ignores Vary on every cache lookup, so offline loads never miss the precache', () => {
    const matches = source.match(/\.match\([^)]*\)/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const call of matches) expect(call).toContain('ignoreVary: true');
  });

  it('only skips waiting when the page asks, so updates never interrupt a workout', () => {
    const calls = source.split('self.skipWaiting()').length - 1;
    expect(calls).toBe(1);
    expect(source).toMatch(/data\.type === 'SKIP_WAITING'\)\s*\{\s*self\.skipWaiting\(\)/);
  });

  it('only ever deletes its own caches', () => {
    expect(source).toMatch(/name\.startsWith\(CACHE_PREFIX\)/);
    expect(source).not.toMatch(/indexedDB/);
  });

  it('bypasses the HTTP cache when precaching', () => {
    expect(source).toContain("cache: 'reload'");
  });
});

import { describe, expect, it } from 'vitest';
import { adjustedPriority, chooseVariant, dismissalsByRule, isSuppressed } from '../../src/coach/memory';
import { makeRec } from '../../src/coach/rec';
import { renderRecommendation } from '../../src/coach/render';
import type { Recommendation } from '../../src/coach/types';
import { DAY, T0, decided, legs, shown, workout } from './helpers';

const info = (facts: Record<string, string | number> = { done: 2, planned: 3, left: 1 }): Recommendation =>
  makeRec({
    rule: 'G4',
    variant: 'week',
    type: 'consistency',
    priority: 6,
    subject: {},
    subjectKey: 'week-x',
    change: { kind: 'info' },
    facts,
    confidence: 'high',
    basis: 2,
    actions: [],
  });

const offer = (to = 210): Recommendation =>
  makeRec({
    rule: 'A2',
    variant: 'up',
    type: 'progress',
    priority: 2,
    subject: { exerciseId: 'leg-press' },
    subjectKey: 'leg-press',
    change: { kind: 'next-exposure', exerciseId: 'leg-press', from: 200, to, repsLow: 10, repsHigh: 12 },
    facts: { exercise: 'Leg press', lastLoad: 200, to, lastSets: '12, 12, 12', range: '10–12', repsLow: 10, repsHigh: 12, expectLow: 10, expectHigh: 11, lastDate: '2026-10-12' },
    confidence: 'medium',
    basis: 4,
    actions: ['apply', 'dismiss'],
  });

describe('decisions', () => {
  it('“Not now” hides a recommendation until its facts change', () => {
    const rec = offer();
    const log = [decided(rec.id, 'A2', 'dismissed')];
    expect(isSuppressed(rec, log, [], T0)).toBe(true);
    expect(isSuppressed(offer(220), log, [], T0)).toBe(false);
  });

  it('applied suggestions are done', () => {
    expect(isSuppressed(offer(), [decided(offer().id, 'A2', 'applied')], [], T0)).toBe(true);
  });

  it('three “Not now”s on the same kind of advice lower its priority', () => {
    const log = [1, 2, 3].map((i) => decided(`x${i}`, 'A2', 'dismissed', T0 - i * DAY));
    expect(adjustedPriority(offer(), dismissalsByRule(log))).toBe(offer().priority + 10);
    expect(adjustedPriority(offer(), dismissalsByRule(log.slice(0, 2)))).toBe(offer().priority);
  });
});

describe('insight memory', () => {
  const rec = info();
  const shownAt = (at: number) => [shown(rec.id, 'G4', rec.key, rec.fingerprint, at)];

  it('stays visible the day it was shown', () => {
    expect(isSuppressed(rec, shownAt(T0 - 3_600_000), [], T0)).toBe(false);
  });

  it('then rests for 7 days or 3 sessions', () => {
    expect(isSuppressed(rec, shownAt(T0 - 2 * DAY), [], T0)).toBe(true);
    expect(isSuppressed(rec, shownAt(T0 - 8 * DAY), [], T0)).toBe(false);
    const three = [1.5, 1, 0.5].map((ago) => workout(ago, [legs([[200, 12, 2]])]));
    expect(isSuppressed(rec, shownAt(T0 - 2 * DAY), three, T0)).toBe(false);
  });

  it('comes back right away when the facts moved', () => {
    expect(isSuppressed(info({ done: 3, planned: 3, left: 0 }), shownAt(T0 - 2 * DAY), [], T0)).toBe(false);
  });

  it('never hides a safety message', () => {
    const safety = { ...rec, safety: true };
    expect(isSuppressed(safety, shownAt(T0 - 2 * DAY), [], T0)).toBe(false);
  });
});

describe('phrasing rotation', () => {
  it('keeps the same phrasing for the same insight', () => {
    const rec = offer();
    const first = renderRecommendation(rec, { units: 'lb', now: T0, log: [] });
    const log = [shown(rec.id, 'A2', rec.key, rec.fingerprint, T0 - DAY, first.variant)];
    expect(renderRecommendation(rec, { units: 'lb', now: T0, log }).variant).toBe(first.variant);
  });

  it('avoids the parts used in the last few messages of the same kind', () => {
    const counts = [5, 5, 4];
    const recent = [0, 1, 2, 3].map((i) => shown(`r${i}`, 'A2', 'k', 'f', T0 - i * DAY, `A2.up#${i}.${i}.${i}`));
    const pick = chooseVariant('A2.up', 'new-rec', counts, recent);
    expect(pick[0]).toBe(4);
    expect(pick[1]).toBe(4);
    expect([0, 1, 2, 3]).toContain(pick[2]); // only 4 action variants: one has to repeat
  });

  it('different insights of the same kind read differently', () => {
    const titles = new Set([200, 210, 220, 230, 240, 250].map((to) => renderRecommendation(offer(to), { units: 'lb', now: T0 }).title.replace(/\d+/g, '#')));
    expect(titles.size).toBeGreaterThan(1);
  });
});

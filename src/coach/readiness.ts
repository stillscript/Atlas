import type { ReadinessCheck, Session } from '../db/types';
import { T } from './knowledge';
import { makeRec } from './rec';
import type { ReadinessOffer } from './types';

/**
 * Readiness (proposal C0–C2). Only ever called when the check-in is switched on, and only offers:
 * a lighter day when two answers are poor (or the wearable score is low for you), a short
 * key-lifts session when all three are. "Train as planned" is always the other button.
 */

/** Is this wearable score in the bottom 20% of the user's own history (after 10+ entries)? */
export function wearableLow(score: number | undefined, past: Session[]): boolean {
  if (score === undefined) return false;
  const scores = past.map((s) => s.readiness?.wearable).filter((v): v is number => typeof v === 'number');
  if (scores.length < T.readiness.wearableMinEntries) return false;
  const sorted = [...scores].sort((a, b) => a - b);
  const cutoff = sorted[Math.floor(sorted.length * T.readiness.wearableLowShare)]!;
  return score < cutoff;
}

export function readinessOffer(check: ReadinessCheck, past: Session[], dayName: string): ReadinessOffer | null {
  const poor = [check.sleep, check.energy, check.soreness].filter((v) => v === 1).length;
  const facts = {
    day: dayName,
    sleep: ['', 'poor', 'OK', 'good'][check.sleep]!,
    energy: ['', 'low', 'OK', 'high'][check.energy]!,
    soreness: ['', 'very sore', 'a bit sore', 'not sore'][check.soreness]!,
    wearable: check.wearable ?? '',
  };
  const common = {
    type: 'recovery' as const,
    priority: 0,
    subject: {},
    confidence: 'medium' as const,
    basis: 1,
    actions: ['use', 'keep'] as ('use' | 'keep')[],
  };
  if (poor === 3) {
    return {
      variant: 'short',
      recommendation: makeRec({
        ...common,
        rule: 'C2',
        variant: 'short',
        subjectKey: 'today',
        situation: [check.at],
        change: { kind: 'session-variant', variant: 'short', minutes: 30 },
        facts,
      }),
    };
  }
  if (poor >= 2 || wearableLow(check.wearable, past)) {
    return {
      variant: 'lighter',
      recommendation: makeRec({
        ...common,
        rule: 'C1',
        variant: poor >= 2 ? 'answers' : 'wearable',
        subjectKey: 'today',
        situation: [check.at],
        change: { kind: 'session-variant', variant: 'lighter' },
        facts,
      }),
    };
  }
  return null;
}

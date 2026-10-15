import type { CoachLogEntry, Session } from '../db/types';
import { T } from './knowledge';
import { DAY_MS } from './measures';
import type { Decision, Recommendation, RuleId } from './types';

/**
 * The Coach's memory (proposal sections 2 and 5): decisions stick to a recommendation id, the same
 * insight isn't repeated for 3 sessions or 7 days unless its facts moved, advice dismissed 3 times
 * drops in priority, and phrasings rotate so the last few aren't reused.
 */

export function decisions(log: CoachLogEntry[]): Map<string, Decision> {
  const map = new Map<string, Decision>();
  for (const entry of [...log].sort((a, b) => a.at - b.at)) {
    if (entry.kind === 'decision' && entry.decision) map.set(entry.recommendationId, entry.decision);
  }
  return map;
}

export function dismissalsByRule(log: CoachLogEntry[]): Map<RuleId, number> {
  const map = new Map<RuleId, number>();
  for (const e of log) if (e.kind === 'decision' && (e.decision === 'dismissed' || e.decision === 'kept')) map.set(e.ruleId as RuleId, (map.get(e.ruleId as RuleId) ?? 0) + 1);
  return map;
}

/** First time this exact insight was shown, if ever. */
function firstShown(log: CoachLogEntry[], id: string): number | null {
  let first: number | null = null;
  for (const e of log) if (e.kind === 'shown' && e.recommendationId === id && (first === null || e.at < first)) first = e.at;
  return first;
}

/**
 * Should this recommendation be hidden right now?
 * - Dismissed ("Not now") or kept: hidden until its facts change (which changes its id).
 * - Applied or used: done, nothing left to show.
 * - Information only: once shown, it stays visible for the rest of that day, then rests until
 *   3 sessions or 7 days have passed. A moved fingerprint is a new insight and shows right away.
 */
export function isSuppressed(rec: Recommendation, log: CoachLogEntry[], sessions: Session[], now: number): boolean {
  const decided = decisions(log).get(rec.id);
  if (decided) return true;
  if (rec.safety) return false;
  const informational = rec.actions.every((a) => a === 'dismiss');
  if (!informational) return false;
  const first = firstShown(log, rec.id);
  if (first === null) return false;
  const sameDay = new Date(first).toDateString() === new Date(now).toDateString();
  if (sameDay) return false;
  const m = T.memory;
  const sessionsSince = sessions.filter((s) => s.status === 'completed' && s.startedAt > first).length;
  return now - first < m.suppressDays * DAY_MS && sessionsSince < m.suppressSessions;
}

/** Shown before under the same key but with different facts: the message can say "still". */
export function isRepeat(rec: Recommendation, log: CoachLogEntry[]): boolean {
  return log.some((e) => e.kind === 'shown' && e.key === rec.key && e.fingerprint !== rec.fingerprint);
}

/** Advice dismissed 3+ times drops in priority for this person. */
export function adjustedPriority(rec: Recommendation, dismissals: Map<RuleId, number>): number {
  return rec.priority + ((dismissals.get(rec.rule) ?? 0) >= T.memory.dismissalsToDemote ? 10 : 0);
}

export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Picks a phrasing for each part of a message ("title.body.action" indices). An insight already
 * shown keeps its phrasing; a new one starts from a seeded index and skips parts used in the last
 * few messages of the same kind.
 */
export function chooseVariant(messageKey: string, recId: string, counts: number[], log: CoachLogEntry[]): number[] {
  const existing = log.find((e) => e.kind === 'shown' && e.recommendationId === recId && e.variant?.startsWith(`${messageKey}#`));
  if (existing?.variant) {
    const parts = existing.variant.split('#')[1]!.split('.').map(Number);
    if (parts.length === counts.length && parts.every((p, i) => p < counts[i]!)) return parts;
  }
  const recent = log
    .filter((e) => e.kind === 'shown' && e.variant && e.variant.startsWith(`${messageKey}#`))
    .sort((a, b) => b.at - a.at)
    .slice(0, T.memory.variantHistory)
    .map((e) => e.variant!.split('#')[1]!.split('.').map(Number));
  const seed = hashString(recId);
  return counts.map((count, part) => {
    if (count <= 1) return 0;
    const used = new Set(recent.map((r) => r[part]));
    for (let k = 0; k < count; k++) {
      const index = (seed + k * 7 + part * 3) % count;
      if (!used.has(index)) return index;
    }
    return seed % count;
  });
}

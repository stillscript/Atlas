import { fingerprint } from './measures';
import type { Recommendation } from './types';

/**
 * Builds a recommendation with a stable id: rule + variant + subject + a fingerprint of the facts
 * that produced it. The same situation always yields the same id, so a decision ("Not now",
 * "Apply") sticks until the situation changes.
 */
export function makeRec(
  input: Omit<Recommendation, 'id' | 'key' | 'fingerprint'> & { subjectKey: string; situation?: unknown },
): Recommendation {
  const { subjectKey, situation, ...rest } = input;
  const fp = fingerprint(situation ?? [rest.change, rest.facts]);
  return {
    ...rest,
    id: `${rest.rule}.${rest.variant}:${subjectKey}:${fp}`,
    key: `${rest.rule}:${subjectKey}`,
    fingerprint: fp,
  };
}

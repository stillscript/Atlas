import type { Measurement, Profile, Program, Session } from '../db/types';
import { requireExercise } from '../domain/catalog';
import { T } from './knowledge';
import { DAY_MS, liftingSessions, normalExposures, streakWeeks, weightTrend } from './measures';
import type { Exposure, Win } from './types';

/**
 * Wins (proposal K): specific, never generic. Records compare against every earlier session of the
 * same lift; a first session is never a record.
 */

/** Records set in one session: estimated max, more reps at a weight, heaviest weight. */
export function sessionRecords(sessionId: string, exposures: Map<string, Exposure[]>): Win[] {
  const wins: Win[] = [];
  for (const [exerciseId, list] of exposures) {
    const index = list.findIndex((e) => e.sessionId === sessionId);
    if (index <= 0) continue;
    const now = list[index]!;
    const before = list.slice(0, index);
    if (now.top === null) continue;
    const name = requireExercise(exerciseId).name;
    const bestBefore = Math.max(...before.map((e) => e.e1rmDone));
    const loaded = now.sets.filter((s) => s.load !== null && s.load > 0);
    const best = loaded.reduce((b, s) => ((s.load ?? 0) * (1 + s.reps / 30) > (b.load ?? 0) * (1 + b.reps / 30) ? s : b), loaded[0]!);
    if (now.e1rmDone > bestBefore + 0.5) {
      const first = before.find((e) => e.e1rmDone > 0);
      wins.push({
        id: `pr-max:${exerciseId}:${sessionId}`,
        kind: 'pr-max',
        exerciseId,
        facts: {
          exercise: name,
          load: best.load ?? 0,
          reps: best.reps,
          e1rm: Math.round(now.e1rmDone),
          previous: Math.round(bestBefore),
          gain: Math.round(now.e1rmDone - (first?.e1rmDone ?? bestBefore)),
          since: first?.date ?? '',
        },
      });
      continue;
    }
    const heaviestBefore = Math.max(...before.map((e) => e.top ?? 0));
    if (now.top > heaviestBefore) {
      const set = loaded.find((s) => s.load === now.top)!;
      wins.push({ id: `pr-load:${exerciseId}:${sessionId}`, kind: 'pr-load', exerciseId, facts: { exercise: name, load: now.top, reps: set.reps, previous: heaviestBefore } });
      continue;
    }
    // More reps at a weight than ever before at that weight (and it's been done before).
    for (const set of loaded) {
      const atLoad = before.flatMap((e) => e.sets).filter((s) => s.load === set.load);
      if (!atLoad.length) continue;
      const most = Math.max(...atLoad.map((s) => s.reps));
      if (set.reps > most) {
        wins.push({ id: `pr-reps:${exerciseId}:${sessionId}`, kind: 'pr-reps', exerciseId, facts: { exercise: name, load: set.load ?? 0, reps: set.reps, previous: most } });
        break;
      }
    }
  }
  return wins;
}

/** Estimated max up ≥3% over the last few weeks on a lift with 4+ exposures. */
export function trendWins(exposures: Map<string, Exposure[]>, now: number, weeks = 6): Win[] {
  const wins: Win[] = [];
  const since = now - weeks * 7 * DAY_MS;
  for (const [exerciseId, all] of exposures) {
    const list = normalExposures(all).filter((e) => e.at >= since && e.e1rm > 0 && !e.calibrating);
    if (list.length < T.wins.trendMinExposures) continue;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const gain = last.e1rm - first.e1rm;
    if (gain / first.e1rm < T.wins.trendMinGain) continue;
    wins.push({
      id: `trend:${exerciseId}:${last.sessionId}`,
      kind: 'trend',
      exerciseId,
      facts: {
        exercise: requireExercise(exerciseId).name,
        gain: Math.round(gain),
        weeks: Math.max(1, Math.round((last.at - first.at) / (7 * DAY_MS))),
        from: Math.round(first.e1rm),
        to: Math.round(last.e1rm),
      },
    });
  }
  return wins.sort((a, b) => Number(b.facts.gain) - Number(a.facts.gain));
}

export function streakWin(program: Program, sessions: Session[], profile: Profile, now: number): Win | null {
  const weeks = streakWeeks(program, sessions, now, profile.goal === 'general');
  if (weeks < T.wins.streakMinWeeks) return null;
  return { id: `streak:${weeks}`, kind: 'streak', facts: { weeks } };
}

/** Strength held or up while body weight trends down (fat-loss goal). */
export function fatLossWin(profile: Profile, measurements: Measurement[], exposures: Map<string, Exposure[]>, now: number): Win | null {
  if (profile.goal !== 'fat-loss') return null;
  const trend = weightTrend(measurements, now);
  if (!trend || trend.totalChange >= 0 || trend.weeks < 3) return null;
  const since = now - (trend.weeks + 1) * 7 * DAY_MS;
  const held: string[] = [];
  let checked = 0;
  for (const [exerciseId, all] of exposures) {
    const list = normalExposures(all).filter((e) => e.at >= since && e.e1rm > 0 && (e.role === 'main' || e.role === 'secondary'));
    if (list.length < 2) continue;
    checked++;
    if (list[list.length - 1]!.e1rm >= list[0]!.e1rm * 0.98) held.push(exerciseId);
  }
  if (checked < 2 || held.length < checked) return null;
  const lost = Math.abs(trend.totalChange);
  return {
    id: `fat-loss:${Math.round(lost * 10)}:${trend.weeks}`,
    kind: 'fat-loss',
    facts: {
      lost: Math.round(lost * 10) / 10,
      weeks: trend.weeks,
      pct: (Math.abs(trend.weeklyChanges.reduce((s, c) => s + c, 0) / trend.weeklyChanges.length) * 100).toFixed(1),
      lifts: held.slice(0, 2).map((id) => requireExercise(id).name).join(' and '),
    },
  };
}

/** Back to pre-break numbers on a lift after a break of 2+ weeks. */
export function comebackWins(sessionId: string, sessions: Session[], exposures: Map<string, Exposure[]>): Win[] {
  const lifting = liftingSessions(sessions);
  const index = lifting.findIndex((s) => s.id === sessionId);
  if (index <= 0) return [];
  // Find the most recent break before this session.
  let breakAt = -1;
  for (let i = index; i >= 1; i--) {
    if ((lifting[i]!.startedAt - lifting[i - 1]!.startedAt) / DAY_MS >= T.wins.comebackGapDays) {
      breakAt = lifting[i - 1]!.startedAt;
      break;
    }
  }
  if (breakAt < 0) return [];
  const wins: Win[] = [];
  for (const [exerciseId, list] of exposures) {
    const now = list.find((e) => e.sessionId === sessionId);
    if (!now || now.e1rmDone <= 0) continue;
    const pre = list.filter((e) => e.at <= breakAt);
    const preBest = Math.max(0, ...pre.map((e) => e.e1rmDone));
    const afterBefore = list.filter((e) => e.at > breakAt && e.at < now.at);
    const alreadyBack = afterBefore.some((e) => e.e1rmDone >= preBest);
    if (preBest > 0 && now.e1rmDone >= preBest && !alreadyBack) {
      wins.push({ id: `comeback:${exerciseId}:${sessionId}`, kind: 'comeback', exerciseId, facts: { exercise: requireExercise(exerciseId).name, e1rm: Math.round(now.e1rmDone) } });
    }
  }
  return wins;
}

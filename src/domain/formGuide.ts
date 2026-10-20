import { type Joints, type Point } from './figure';

/**
 * Where a form cue points on the figure, so the "How to do it" view can number it there. The cue
 * text decides: the first body part it names wins ("Push your hips back; the bar slides down your
 * thighs" → hips). Cues about timing or breathing ("Lower slowly") have no spot.
 */

export type CueSpot = 'head' | 'chest' | 'core' | 'lowerBack' | 'shoulder' | 'hip' | 'knee' | 'ankle' | 'toe' | 'elbow' | 'hand';

/** Words that name a spot. Checked by where they first appear in the cue, earliest first. */
const WORDS: [RegExp, CueSpot][] = [
  [/\b(head|chin|neck|eyes|gaze)\b/, 'head'],
  [/\b(shoulder blades?|shoulders?|lats?)\b/, 'shoulder'],
  [/\b(chest|sternum)\b/, 'chest'],
  [/\blower back\b/, 'lowerBack'],
  [/\b(brace|core|belly|ribs?|abs|torso|your back|back flat|spine)\b/, 'core'],
  [/\b(hips?|glutes?|pelvis)\b/, 'hip'],
  [/\b(knees?|thighs?)\b/, 'knee'],
  [/\b(toes)\b/, 'toe'],
  [/\b(heels?|foot|feet|floor|platform|shins?)\b/, 'ankle'],
  [/\b(elbows?|upper arms?|arms?)\b/, 'elbow'],
  [/\b(bar|handles?|dumbbells?|weight|rope|grip|wrists?|hands?|forearms?|kettlebell|ball)\b/, 'hand'],
];

export function cueSpot(cue: string): CueSpot | null {
  const text = cue.toLowerCase();
  let best: { index: number; spot: CueSpot } | null = null;
  for (const [pattern, spot] of WORDS) {
    const match = pattern.exec(text);
    if (match && (!best || match.index < best.index)) best = { index: match.index, spot };
  }
  return best?.spot ?? null;
}

const along = (from: Point, to: Point, t: number): Point => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];

/** The point on the figure for a spot, in the current frame. */
export function spotPoint(spot: CueSpot, j: Joints): Point {
  switch (spot) {
    case 'chest':
      return along(j.hip, j.shoulder, 0.78);
    case 'core':
      return along(j.hip, j.shoulder, 0.5);
    case 'lowerBack':
      return along(j.hip, j.shoulder, 0.25);
    default:
      return j[spot];
  }
}

/**
 * Moves marker points apart until no two are closer than `gap` (centre to centre), each pair sharing
 * the push, so markers on joints that meet mid-movement (shoulder, chest and bar at the bottom of a
 * press) stay readable. A few rounds are enough for three markers.
 */
export function spreadPoints(points: Point[], gap: number): Point[] {
  const out = points.map(([x, y]) => [x, y] as Point);
  for (let round = 0; round < 8; round++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        let dist = Math.hypot(dx, dy);
        if (dist >= gap - 1e-6) continue;
        // Same spot: separate sideways, later markers to the right.
        if (dist < 1e-6) [dx, dy, dist] = [1, 0, 1];
        const push = (gap - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        out[i] = [a[0] - ux * push, a[1] - uy * push];
        out[j] = [b[0] + ux * push, b[1] + uy * push];
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Each cue's spot, by cue index: at most `limit` markers, and one per spot (a second cue about the
 * knees keeps its number in the list but adds no marker on top of the first).
 */
export function cueSpots(cues: string[], limit = 3): (CueSpot | null)[] {
  const used = new Set<CueSpot>();
  return cues.map((cue) => {
    const spot = cueSpot(cue);
    if (!spot || used.has(spot) || used.size >= limit) return null;
    used.add(spot);
    return spot;
  });
}

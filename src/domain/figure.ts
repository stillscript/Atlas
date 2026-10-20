/**
 * The Atlas figure: one body, posed from joint angles, used for exercise pictograms (and, in the
 * form view, for the start and end positions of each movement).
 *
 * Side view, facing right (+x). The hip is the origin. Angles are absolute directions in degrees:
 * 0 = straight down, 90 = forward, 180 = up, 270 = back. Bone lengths are fixed, so every pose has
 * the same proportions; only angles and props change between exercises. Pure functions, no DOM.
 */

export type Point = [number, number];

/** Bone lengths and head size, in figure units (a standing figure is about 30 units tall). */
export const BODY = {
  torso: 9,
  neck: 1.3,
  head: 2.7,
  upperArm: 5.6,
  forearm: 5.2,
  thigh: 7.4,
  shin: 7.2,
  foot: 2.2,
} as const;

export interface Pose {
  /** Hip → shoulder. Upright is 180; leaning forward goes toward 90, leaning back toward 270. */
  torso: number;
  /** Upper arm and forearm of the near arm. */
  arm: [number, number];
  /** The far arm, when it differs from the near one (one-arm rows, carries…). */
  arm2?: [number, number];
  /** Thigh and shin of the near leg. */
  leg: [number, number];
  /** The far leg, when it differs (lunges, split squats, step-ups). */
  leg2?: [number, number];
  /** Foot direction (default 90: pointing forward). */
  foot?: number;
  foot2?: number;
  /** Where the hip sits, to place the figure against props (default [0, 0]). */
  at?: Point;
}

export interface Joints {
  hip: Point;
  shoulder: Point;
  neck: Point;
  head: Point;
  elbow: Point;
  hand: Point;
  elbow2: Point;
  hand2: Point;
  knee: Point;
  ankle: Point;
  toe: Point;
  knee2: Point;
  ankle2: Point;
  toe2: Point;
}

export type JointName = keyof Joints;

const RAD = Math.PI / 180;
const round = (n: number) => Math.round(n * 100) / 100;

export function step(from: Point, angle: number, length: number): Point {
  return [round(from[0] + Math.sin(angle * RAD) * length), round(from[1] + Math.cos(angle * RAD) * length)];
}

export function joints(pose: Pose): Joints {
  const hip = pose.at ?? [0, 0];
  const shoulder = step(hip, pose.torso, BODY.torso);
  const neck = step(shoulder, pose.torso, BODY.neck);
  const head = step(neck, pose.torso, BODY.head);
  const [ua, fa] = pose.arm;
  const [ua2, fa2] = pose.arm2 ?? pose.arm;
  const [th, sh] = pose.leg;
  const [th2, sh2] = pose.leg2 ?? pose.leg;
  const elbow = step(shoulder, ua, BODY.upperArm);
  const elbow2 = step(shoulder, ua2, BODY.upperArm);
  const knee = step(hip, th, BODY.thigh);
  const knee2 = step(hip, th2, BODY.thigh);
  const ankle = step(knee, sh, BODY.shin);
  const ankle2 = step(knee2, sh2, BODY.shin);
  return {
    hip,
    shoulder,
    neck,
    head,
    elbow,
    hand: step(elbow, fa, BODY.forearm),
    elbow2,
    hand2: step(elbow2, fa2, BODY.forearm),
    knee,
    ankle,
    toe: step(ankle, pose.foot ?? 90, BODY.foot),
    knee2,
    ankle2,
    toe2: step(ankle2, pose.foot2 ?? pose.foot ?? 90, BODY.foot),
  };
}

// ---------------------------------------------------------------- props

/** A point in figure space: a joint name, a joint plus an offset, or absolute coordinates. */
export type At = JointName | [JointName, number, number] | Point;

/**
 * Equipment and surroundings, drawn thinner and quieter than the body.
 * - line / path: benches, rails, frames, cables (path points are joined in order).
 * - plate: a barbell or Smith bar seen end-on. dumbbell: a dumbbell end-on. kettlebell, ball.
 * - pad: a rounded rectangle (seat, back rest, machine pad), `angle` in the same convention.
 * - pulley: a small wheel, for cable stations.
 */
export type Prop =
  | { line: [At, At] }
  | { path: At[] }
  | { plate: At; r?: number }
  | { dumbbell: At }
  | { kettlebell: At }
  | { ball: At; r?: number }
  | { pulley: At }
  | { pad: At; length: number; angle: number; width?: number }
  /** A bench back or bench top along the torso, on the back side. `shift` moves it toward the head. */
  | { backrest: { length?: number; shift?: number } }
  /** A seat under the hips, along the thigh. */
  | { seat: { length?: number } }
  /** A Smith machine guide rail: a vertical line through a point. */
  | { rail: At; up?: number; down?: number }
  /** A cable from a point (usually the hand) to a pulley. */
  | { cable: [At, At] }
  /** A short handle across a point (machine grips, cable handles). */
  | { handle: At; angle?: number };

export function point(at: At, j: Joints): Point {
  if (typeof at === 'string') return j[at];
  if (typeof at[0] === 'string') {
    const [name, dx, dy] = at as [JointName, number, number];
    return [round(j[name][0] + dx), round(j[name][1] + dy)];
  }
  return at as Point;
}

// ---------------------------------------------------------------- drawing

export interface Shape {
  kind: 'line' | 'circle' | 'rect';
  /** Body parts are drawn bold; the far limbs and props quieter. */
  layer: 'far' | 'prop' | 'body' | 'head';
  points?: Point[];
  center?: Point;
  r?: number;
  /** rect: centre, length along `angle`, width across it. */
  length?: number;
  width?: number;
  angle?: number;
}

/** Everything to draw for a pose and its props, back to front. */
export function shapes(pose: Pose, props: Prop[] = []): Shape[] {
  const j = joints(pose);
  const out: Shape[] = [];
  if (pose.arm2) out.push({ kind: 'line', layer: 'far', points: [j.shoulder, j.elbow2, j.hand2] });
  if (pose.leg2) out.push({ kind: 'line', layer: 'far', points: [j.hip, j.knee2, j.ankle2, j.toe2] });
  for (const prop of props) {
    if ('line' in prop) out.push({ kind: 'line', layer: 'prop', points: prop.line.map((p) => point(p, j)) });
    else if ('path' in prop) out.push({ kind: 'line', layer: 'prop', points: prop.path.map((p) => point(p, j)) });
    else if ('plate' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.plate, j), r: prop.r ?? 3.4 });
    else if ('dumbbell' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.dumbbell, j), r: 1.7 });
    else if ('kettlebell' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.kettlebell, j), r: 2.2 });
    else if ('ball' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.ball, j), r: prop.r ?? 2.6 });
    else if ('pulley' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.pulley, j), r: 1.2 });
    else if ('backrest' in prop) {
      const length = prop.backrest.length ?? 11;
      const mid = step(j.hip, pose.torso, BODY.torso / 2 + (prop.backrest.shift ?? 0));
      out.push({ kind: 'rect', layer: 'prop', center: step(mid, pose.torso + 90, 2.6), length, width: 2.2, angle: pose.torso });
    } else if ('seat' in prop) {
      const thigh = pose.leg[0];
      out.push({ kind: 'rect', layer: 'prop', center: step(step(j.hip, thigh, 1.6), thigh - 90, 2.6), length: prop.seat.length ?? 6, width: 2.2, angle: thigh });
    } else if ('rail' in prop) {
      const [x, y] = point(prop.rail, j);
      out.push({ kind: 'line', layer: 'prop', points: [[x, round(y - (prop.up ?? 9))], [x, round(y + (prop.down ?? 9))]] });
    } else if ('cable' in prop) {
      const [from, to] = prop.cable.map((p) => point(p, j)) as [Point, Point];
      out.push({ kind: 'line', layer: 'prop', points: [from, to] }, { kind: 'circle', layer: 'prop', center: to, r: 1.2 });
    } else if ('handle' in prop) {
      const at = point(prop.handle, j);
      const angle = prop.angle ?? 0;
      out.push({ kind: 'line', layer: 'prop', points: [step(at, angle, 1.8), step(at, angle + 180, 1.8)] });
    } else out.push({ kind: 'rect', layer: 'prop', center: point(prop.pad, j), length: prop.length, width: prop.width ?? 2.4, angle: prop.angle });
  }
  out.push({ kind: 'line', layer: 'body', points: [j.hip, j.knee, j.ankle, j.toe] });
  out.push({ kind: 'line', layer: 'body', points: [j.hip, j.shoulder] });
  out.push({ kind: 'line', layer: 'body', points: [j.shoulder, j.elbow, j.hand] });
  out.push({ kind: 'circle', layer: 'head', center: j.head, r: BODY.head });
  return out;
}

/** The square box that holds every shape (with room for stroke widths), at least `min` wide. */
export function viewBox(list: Shape[], min = 34, pad = 2.6): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = ([x, y]: Point, r = 0) => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const s of list) {
    if (s.points) s.points.forEach((p) => add(p));
    if (s.center) add(s.center, s.kind === 'rect' ? Math.max(s.length!, s.width!) / 2 : s.r!);
  }
  const size = Math.max(min, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [round(cx - size / 2), round(cy - size / 2), round(size), round(size)];
}

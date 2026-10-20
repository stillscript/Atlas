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
  /**
   * `front`: seen from the front, for side-to-side moves (lateral raises, flyes, pull-aparts). Arm
   * and leg angles are then in the body's plane: 90 = out to the figure's side. The far side
   * mirrors the near one unless `arm2` / `leg2` say otherwise.
   */
  view?: 'side' | 'front';
  /** Front view, seated: thighs point at the viewer, so they're drawn short. */
  thighScale?: number;
  /** A faint floor line under the figure, for lifts done standing or on the floor. */
  ground?: boolean;
  /** Draw the near arm behind the head (hanging from a bar), instead of in front of it. */
  armBehind?: boolean;
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

/** Front view: half the shoulder and hip widths. */
const FRONT = { shoulder: 2.2, hip: 1.3 } as const;

const mirror = ([x, y]: Point, about = 0): Point => [round(2 * about - x), y];

export function joints(pose: Pose): Joints {
  if (pose.view === 'front') return frontJoints(pose);
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

/**
 * Front view. `shoulder`, `elbow`, `hand`, `knee`, `ankle`, `toe` are the figure's right side (screen
 * right); the `2` joints its left, mirrored unless given. `hip` and `neck` are on the centre line.
 */
function frontJoints(pose: Pose): Joints {
  const [cx, cy] = pose.at ?? [0, 0];
  const hip: Point = [cx, cy];
  const neck: Point = [cx, round(cy - BODY.torso)];
  const shoulder: Point = [round(cx + FRONT.shoulder), round(cy - BODY.torso + 0.6)];
  const head = step(neck, 180, BODY.neck + BODY.head);
  // Each side is worked out as the right side, then mirrored for the left.
  const arm = (side: 1 | -1, [ua, fa]: [number, number]) => {
    const e = step(shoulder, ua, BODY.upperArm);
    const h = step(e, fa, BODY.forearm);
    return side === 1 ? [e, h] : [mirror(e, cx), mirror(h, cx)];
  };
  const leg = (side: 1 | -1, [th, sh]: [number, number]) => {
    const hp: Point = [round(cx + FRONT.hip), cy];
    const k = step(hp, th, BODY.thigh * (pose.thighScale ?? 1));
    const a = step(k, sh, BODY.shin);
    const t = step(a, 90, 1.2);
    return side === 1 ? [k, a, t] : [mirror(k, cx), mirror(a, cx), mirror(t, cx)];
  };
  const [elbow, hand] = arm(1, pose.arm);
  const [elbow2, hand2] = arm(-1, pose.arm2 ?? pose.arm);
  const [knee, ankle, toe] = leg(1, pose.leg);
  const [knee2, ankle2, toe2] = leg(-1, pose.leg2 ?? pose.leg);
  return { hip, shoulder, neck, head, elbow, hand, elbow2, hand2, knee, ankle, toe, knee2, ankle2, toe2 } as Joints;
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
  /** `front`: drawn over the body, with no gap (a band between the hands). */
  | { line: [At, At]; front?: boolean }
  | { path: At[]; front?: boolean }
  | { plate: At; r?: number }
  /** Drawn side-on (a handle with two heads) so it never reads as a barbell; `angle` turns the handle. */
  | { dumbbell: At; angle?: number }
  | { kettlebell: At }
  /** A solid disc: slam ball, medicine ball, sandbag. */
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
  /**
   * Drawing layers, back to front: floor, far limbs, equipment, body (legs and torso), the near
   * arm(s), head. The body and arms get a small gap where they cross something behind them.
   */
  layer: 'ground' | 'far' | 'prop' | 'body' | 'arm' | 'head';
  points?: Point[];
  center?: Point;
  r?: number;
  /** rect: centre, length along `angle`, width across it. */
  length?: number;
  width?: number;
  angle?: number;
  /** Stroke width override (default by layer). */
  weight?: number;
  /** Solid fill (balls). */
  filled?: boolean;
  /** A held load (bar, dumbbell, ball, band): drawn last, over the hands, never cut by a gap. */
  load?: boolean;
}

/** Stroke widths by layer, in figure units. */
export const STROKES = { ground: 1.1, far: 2.7, prop: 1.5, body: 2.7, arm: 2.7, head: 0 } as const;

function dumbbell(at: Point, angle: number): Shape[] {
  const a = step(at, angle, 1.9);
  const b = step(at, angle + 180, 1.9);
  return [
    { kind: 'line', layer: 'prop', points: [a, b], weight: 1.4 },
    { kind: 'line', layer: 'prop', points: [step(a, angle + 90, 1.4), step(a, angle - 90, 1.4)], weight: 2.2 },
    { kind: 'line', layer: 'prop', points: [step(b, angle + 90, 1.4), step(b, angle - 90, 1.4)], weight: 2.2 },
  ];
}

/** Everything to draw for a pose and its props, back to front. */
export function shapes(pose: Pose, props: Prop[] = []): Shape[] {
  const j = joints(pose);
  const front = pose.view === 'front';
  const out: Shape[] = [];
  if (!front && pose.arm2) out.push({ kind: 'line', layer: 'far', points: [j.shoulder, j.elbow2, j.hand2] });
  if (!front && pose.leg2) out.push({ kind: 'line', layer: 'far', points: [j.hip, j.knee2, j.ankle2, j.toe2] });
  for (const prop of props) {
    if ('line' in prop) out.push({ kind: 'line', layer: 'prop', points: prop.line.map((p) => point(p, j)), load: prop.front });
    else if ('path' in prop) out.push({ kind: 'line', layer: 'prop', points: prop.path.map((p) => point(p, j)), load: prop.front });
    else if ('plate' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.plate, j), r: prop.r ?? 3.4, load: true });
    else if ('dumbbell' in prop) out.push(...dumbbell(point(prop.dumbbell, j), prop.angle ?? 90).map((d) => ({ ...d, load: true })));
    else if ('kettlebell' in prop) {
      const c = point(prop.kettlebell, j);
      out.push({ kind: 'circle', layer: 'prop', center: c, r: 2.1, filled: true, load: true }, { kind: 'line', layer: 'prop', points: [step(c, 220, 1.6), [c[0] - 0.9, round(c[1] - 2.9)], [c[0] + 0.9, round(c[1] - 2.9)], step(c, 140, 1.6)], weight: 1.3, load: true });
    } else if ('ball' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.ball, j), r: prop.r ?? 2.6, filled: true, load: true });
    else if ('pulley' in prop) out.push({ kind: 'circle', layer: 'prop', center: point(prop.pulley, j), r: 1.2 });
    else if ('backrest' in prop) {
      const length = prop.backrest.length ?? 11;
      const mid = step(j.hip, pose.torso, BODY.torso / 2 + (prop.backrest.shift ?? 0));
      out.push({ kind: 'rect', layer: 'prop', center: step(mid, pose.torso + 90, 2.6), length, width: 2.2, angle: pose.torso });
    } else if ('seat' in prop) {
      const thigh = front ? 90 : pose.leg[0];
      out.push({ kind: 'rect', layer: 'prop', center: front ? [j.hip[0], round(j.hip[1] + 2.4)] : step(step(j.hip, thigh, 1.6), thigh - 90, 2.6), length: prop.seat.length ?? 6, width: 2.2, angle: thigh });
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
  if (front) {
    out.push({ kind: 'line', layer: 'body', points: [[round(j.hip[0] - FRONT.hip), j.hip[1]], j.knee2, j.ankle2, j.toe2] });
    out.push({ kind: 'line', layer: 'body', points: [[round(j.hip[0] + FRONT.hip), j.hip[1]], j.knee, j.ankle, j.toe] });
    out.push({ kind: 'line', layer: 'body', points: [[round(j.hip[0] - FRONT.hip), j.hip[1]], [round(j.hip[0] + FRONT.hip), j.hip[1]]] });
    out.push({ kind: 'line', layer: 'body', points: [j.hip, j.neck] });
    out.push({ kind: 'line', layer: 'body', points: [mirror(j.shoulder, j.hip[0]), j.shoulder] });
    out.push({ kind: 'line', layer: 'arm', points: [mirror(j.shoulder, j.hip[0]), j.elbow2, j.hand2] });
    out.push({ kind: 'line', layer: pose.armBehind ? 'body' : 'arm', points: [j.shoulder, j.elbow, j.hand] });
  } else {
    out.push({ kind: 'line', layer: 'body', points: [j.hip, j.knee, j.ankle, j.toe] });
    out.push({ kind: 'line', layer: 'body', points: [j.hip, j.shoulder] });
    out.push({ kind: 'line', layer: 'arm', points: [j.shoulder, j.elbow, j.hand] });
  }
  out.push({ kind: 'circle', layer: 'head', center: j.head, r: BODY.head });
  if (pose.ground) {
    const body = out.filter((s) => s.layer === 'body' || s.layer === 'far' || s.layer === 'arm').flatMap((s) => s.points!);
    const xs = body.map((p) => p[0]);
    const y = round(Math.max(...body.map((p) => p[1])) + STROKES.body / 2 + 0.7);
    out.unshift({ kind: 'line', layer: 'ground', points: [[round(Math.min(...xs) - 2), y], [round(Math.max(...xs) + 2), y]] });
  }
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

// ---------------------------------------------------------------- SVG

const OPACITY: Record<Shape['layer'], number> = { ground: 0.3, far: 0.38, prop: 0.6, body: 1, arm: 1, head: 1 };
let uid = 0;

function element(s: Shape, extra = ''): string {
  const width = s.weight ?? STROKES[s.layer];
  const opacity = OPACITY[s.layer] < 1 ? ` opacity="${OPACITY[s.layer]}"` : '';
  if (s.kind === 'line') return `<polyline points="${s.points!.map((p) => p.join(',')).join(' ')}" stroke-width="${width}"${opacity}${extra}/>`;
  if (s.kind === 'circle') {
    const solid = s.layer === 'head' || s.filled;
    return `<circle cx="${s.center![0]}" cy="${s.center![1]}" r="${s.r}"${solid ? ' fill="currentColor" stroke="none"' : ` stroke-width="${STROKES.prop}"`}${opacity}${extra}/>`;
  }
  const [cx, cy] = s.center!;
  // Figure angles have 0 = down; an SVG rect lies along +x (90), so turn it by (90 - angle).
  return `<rect x="${round(cx - s.length! / 2)}" y="${round(cy - s.width! / 2)}" width="${s.length}" height="${s.width}" rx="${Math.min(1.1, s.width! / 2)}" transform="rotate(${round(90 - s.angle!)} ${cx} ${cy})" stroke-width="${STROKES.prop}"${opacity}${extra}/>`;
}

/**
 * The pictogram as SVG markup, back to front: equipment and body (with a small gap where an arm
 * crosses them, and around the head), the head (gapped where an arm passes in front of it), the
 * arms, then the held load on top. The gaps keep overlapping parts readable at icon size.
 */
export function svgMarkup(list: Shape[], size: number, label?: string): string {
  const box = viewBox(list);
  const [x, y, w, h] = box;
  const id = `pg${++uid}`;
  const head = list.find((s) => s.layer === 'head')!;
  const arms = list.filter((s) => s.layer === 'arm');
  const loads = list.filter((s) => s.load);
  const gap = 1.2;
  const cover = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`;
  const headCut = `<circle cx="${head.center![0]}" cy="${head.center![1]}" r="${round(head.r! + gap)}" fill="black"/>`;
  const armCut = arms.map((a) => `<polyline points="${a.points!.map((p) => p.join(',')).join(' ')}" stroke="black" stroke-width="${STROKES.arm + gap * 2}" fill="none"/>`).join('');
  const mask = (suffix: string, body: string) => `<mask id="${id}${suffix}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">${cover}${body}</mask>`;
  const behind = list.filter((s) => s.layer !== 'arm' && s.layer !== 'head' && !s.load).map((s) => element(s)).join('');
  const a11y = label ? ` role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : ' aria-hidden="true" focusable="false"';
  return (
    `<svg class="pictogram" width="${size}" height="${size}" viewBox="${box.join(' ')}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"${a11y}>` +
    `<defs>${mask('b', headCut + armCut)}${mask('h', armCut)}</defs>` +
    `<g mask="url(#${id}b)">${behind}</g>` +
    `<g mask="url(#${id}h)">${element(head)}</g>` +
    arms.map((s) => element(s)).join('') +
    loads.map((s) => element(s)).join('') +
    `</svg>`
  );
}

import data from '../data/pictograms.json';
import { groundOf, interpolate, shapes, svgMarkup, unionBox, type JointName, type Pose, type Prop } from './figure';

/**
 * Each exercise's pictogram (data/pictograms.json): the figure in the exercise's key position with
 * its equipment, and (for the form view) the other end of the movement. Entries can build on
 * another (`base`), override pose fields, replace the props or add to them.
 */

interface Entry {
  base?: string;
  pose?: Partial<Pose>;
  props?: Prop[];
  extra?: Prop[];
  /** The other end of the movement: pose fields that change from `pose`. */
  motion?: Partial<Pose>;
  /** The joint that stays put while moving (default: the ankle for floor lifts, else the hip). */
  anchor?: JointName;
  /** A still hold (plank): no motion. */
  hold?: boolean;
}

export interface PictogramArt {
  pose: Pose;
  props: Prop[];
  /** The other end of the movement, when the exercise moves. */
  motion?: Pose;
  anchor: JointName;
}

const entries = data as unknown as Record<string, Entry>;

export function hasPictogram(exerciseId: string): boolean {
  return exerciseId in entries && !exerciseId.startsWith('_');
}

/** The entry's field, or the one it inherits through `base`. */
function inherited<K extends keyof Entry>(exerciseId: string, key: K, seen: string[] = []): Entry[K] | undefined {
  const entry = entries[exerciseId];
  if (!entry || seen.includes(exerciseId)) return undefined;
  return entry[key] ?? (entry.base ? inherited(entry.base, key, [...seen, exerciseId]) : undefined);
}

export function pictogramFor(exerciseId: string, seen: string[] = []): PictogramArt | null {
  const entry = entries[exerciseId];
  if (!entry || seen.includes(exerciseId)) return null;
  const base = entry.base ? pictogramFor(entry.base, [...seen, exerciseId]) : null;
  const pose = { ...base?.pose, ...entry.pose } as Pose;
  if (pose.torso === undefined || !pose.arm || !pose.leg) return null;
  const props = [...(entry.props ?? base?.props ?? []), ...(entry.extra ?? [])];
  const change = inherited(exerciseId, 'hold') ? undefined : inherited(exerciseId, 'motion');
  const anchor = inherited(exerciseId, 'anchor') ?? (pose.ground ? 'ankle' : 'hip');
  return { pose, props, motion: change ? { ...pose, ...change } : undefined, anchor };
}

/** The pictogram as SVG markup (the app and review pages draw it the same way). */
export function pictogramSvg(art: PictogramArt, size = 64, label?: string): string {
  return svgMarkup(shapes(art.pose, art.props), size, label);
}

/** Frames of the movement from the key position (t = 0) to the other end (t = 1). */
export function motionFrames(art: PictogramArt, steps: number[]): Pose[] {
  return steps.map((t) => (art.motion ? interpolate(art.pose, art.motion, t, art.anchor) : art.pose));
}

/** A frame that fits the whole movement, so the figure doesn't zoom while it moves. */
export function motionBox(art: PictogramArt): [number, number, number, number] {
  const ground = groundOf(art.pose, art.props);
  return unionBox(motionFrames(art, [0, 0.25, 0.5, 0.75, 1]).map((p) => shapes(p, art.props, ground)));
}

/** One frame of the movement as SVG, in the fixed frame. */
export function motionSvg(art: PictogramArt, t: number, size: number, frame = motionBox(art), label?: string): string {
  const [pose] = motionFrames(art, [t]);
  return svgMarkup(shapes(pose!, art.props, groundOf(art.pose, art.props)), size, label, frame);
}

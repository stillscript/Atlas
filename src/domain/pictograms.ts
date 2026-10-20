import data from '../data/pictograms.json';
import { shapes, svgMarkup, type Pose, type Prop } from './figure';

/**
 * Each exercise's pictogram (data/pictograms.json): the figure in the exercise's key position with
 * its equipment. Entries can build on another (`base`), override pose fields, replace the props or
 * add to them.
 */

interface Entry {
  base?: string;
  pose?: Partial<Pose>;
  props?: Prop[];
  extra?: Prop[];
}

export interface PictogramArt {
  pose: Pose;
  props: Prop[];
}

const entries = data as unknown as Record<string, Entry>;

export function hasPictogram(exerciseId: string): boolean {
  return exerciseId in entries && !exerciseId.startsWith('_');
}

export function pictogramFor(exerciseId: string, seen: string[] = []): PictogramArt | null {
  const entry = entries[exerciseId];
  if (!entry || seen.includes(exerciseId)) return null;
  const base = entry.base ? pictogramFor(entry.base, [...seen, exerciseId]) : null;
  const pose = { ...base?.pose, ...entry.pose } as Pose;
  if (pose.torso === undefined || !pose.arm || !pose.leg) return null;
  const props = [...(entry.props ?? base?.props ?? []), ...(entry.extra ?? [])];
  return { pose, props };
}

/** The pictogram as SVG markup (the app and review pages draw it the same way). */
export function pictogramSvg(art: PictogramArt, size = 64, label?: string): string {
  return svgMarkup(shapes(art.pose, art.props), size, label);
}

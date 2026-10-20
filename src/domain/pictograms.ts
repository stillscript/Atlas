import data from '../data/pictograms.json';
import { shapes, viewBox, type Pose, type Prop, type Shape } from './figure';

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

/** Same drawing as ui/Pictogram, as an SVG string (for review pages and tests). */
export function pictogramSvg(art: PictogramArt, size = 64): string {
  const list = shapes(art.pose, art.props);
  const stroke = { body: 2.7, far: 2.7, prop: 1.5, head: 0 } as const;
  const body = list
    .map((s: Shape) => {
      const cls = `pg-${s.layer}`;
      if (s.kind === 'line') return `<polyline class="${cls}" points="${s.points!.map((p) => p.join(',')).join(' ')}" stroke-width="${stroke[s.layer]}"/>`;
      if (s.kind === 'circle') return `<circle class="${cls}" cx="${s.center![0]}" cy="${s.center![1]}" r="${s.r}" stroke-width="${s.layer === 'head' ? 0 : stroke.prop}"/>`;
      const [cx, cy] = s.center!;
      return `<rect class="${cls}" x="${cx - s.length! / 2}" y="${cy - s.width! / 2}" width="${s.length}" height="${s.width}" rx="${Math.min(1.1, s.width! / 2)}" transform="rotate(${90 - s.angle!} ${cx} ${cy})" stroke-width="${stroke.prop}"/>`;
    })
    .join('');
  return `<svg width="${size}" height="${size}" viewBox="${viewBox(list).join(' ')}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

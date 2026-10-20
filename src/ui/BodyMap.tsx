import type { MuscleId } from '../domain/types';
import './bodymap.css';

/**
 * A minimal front and back body: rounded capsules in the same language as the exercise figure.
 * Main muscles fill solid, helping muscles tint; `level` (0–1 per muscle) shades by amount instead
 * (the weekly muscle map). Decorative unless given a label; the names are always written beside it.
 */

type Capsule = [number, number, number, number, number]; // x1, y1, x2, y2, width

const mirror = ([x1, y1, x2, y2, w]: Capsule): Capsule => [40 - x1, y1, 40 - x2, y2, w];
const both = (c: Capsule): Capsule[] => [c, mirror(c)];

/** The body itself (both views share it). */
const BODY: Capsule[] = [
  [20, 12, 20, 15.5, 3.4], // neck
  ...both([11.6, 19.5, 9.8, 30, 4.4]), // upper arms
  ...both([9.8, 30.5, 8.8, 40, 3.6]), // forearms
  ...both([16.8, 45, 16.4, 60, 6.4]), // thighs
  ...both([16.4, 61, 16.3, 76, 4.6]), // shins
];

const FRONT: Partial<Record<MuscleId, Capsule[]>> = {
  'front-delts': both([12.2, 18.6, 11.4, 21.4, 4.6]),
  'side-delts': both([10.4, 19.4, 9.8, 22.4, 2.6]),
  chest: [...both([15.6, 22.2, 18.4, 22.8, 5.4])],
  biceps: both([10.8, 23.4, 10.1, 29.2, 3.4]),
  forearms: both([9.7, 31.4, 8.9, 39, 3]),
  abs: [[20, 27.4, 20, 37.6, 6.2]],
  quads: both([16.8, 46.4, 16.4, 58.4, 5.6]),
  adductors: both([19, 46, 18.6, 53, 1.8]),
};

const BACK: Partial<Record<MuscleId, Capsule[]>> = {
  'rear-delts': both([12.2, 18.6, 11.4, 21.4, 4.6]),
  'side-delts': both([10.4, 19.4, 9.8, 22.4, 2.6]),
  back: [[16.2, 17.6, 23.8, 17.6, 3.4], ...both([16.6, 21.5, 17.6, 31.5, 5.2])],
  triceps: both([10.7, 23.4, 10, 29.6, 3.6]),
  forearms: both([9.7, 31.4, 8.9, 39, 3]),
  'lower-back': [[20, 33.6, 20, 37.8, 6]],
  glutes: both([17.3, 41.2, 17.3, 44.4, 5.8]),
  hamstrings: both([16.8, 47.4, 16.4, 58.6, 5.4]),
  calves: both([16.4, 62.4, 16.3, 70.4, 4.6]),
};

/** Every muscle the catalogs use has a place on the map (tests/domain/bodymap.test.ts checks). */
export const MAPPED_MUSCLES = new Set<MuscleId>([...Object.keys(FRONT), ...Object.keys(BACK)] as MuscleId[]);

function capsules(list: Capsule[], cls: string, opacity?: number) {
  return list.map(([x1, y1, x2, y2, w], i) => (
    <line key={`${cls}${i}`} class={cls} x1={x1} y1={y1} x2={x2} y2={y2} stroke-width={w} opacity={opacity} />
  ));
}

function View({ regions, primary, secondary, level, title }: { regions: Partial<Record<MuscleId, Capsule[]>>; primary: Set<MuscleId>; secondary: Set<MuscleId>; level?: Partial<Record<MuscleId, number>>; title: string }) {
  return (
    <figure class="bodymap-view">
      <svg viewBox="0 0 40 80" class="bodymap-svg" aria-hidden="true">
        <circle class="bm-body" cx="20" cy="7.6" r="4.4" />
        <rect class="bm-body" x="12.2" y="16.2" width="15.6" height="23.4" rx="4.6" />
        <rect class="bm-body" x="13.2" y="37.4" width="13.6" height="8.2" rx="3.4" />
        {capsules(BODY, 'bm-body')}
        {(Object.entries(regions) as [MuscleId, Capsule[]][]).map(([muscle, list]) => {
          if (level) {
            const amount = level[muscle] ?? 0;
            return amount > 0 ? capsules(list, 'bm-on', 0.25 + 0.75 * Math.min(1, amount)) : null;
          }
          if (primary.has(muscle)) return capsules(list, 'bm-on');
          if (secondary.has(muscle)) return capsules(list, 'bm-on', 0.38);
          return null;
        })}
      </svg>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

export function BodyMap({ primary = [], secondary = [], level }: { primary?: MuscleId[]; secondary?: MuscleId[]; level?: Partial<Record<MuscleId, number>> }) {
  const main = new Set(primary);
  const helps = new Set(secondary.filter((m) => !main.has(m)));
  return (
    <div class="bodymap">
      <View regions={FRONT} primary={main} secondary={helps} level={level} title="Front" />
      <View regions={BACK} primary={main} secondary={helps} level={level} title="Back" />
    </div>
  );
}

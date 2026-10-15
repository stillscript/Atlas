import type { LoadModel } from '../db/types';
import type { LoadMode, LoadSpec } from './types';

/**
 * Equipment-aware load math. Every weight Atlas suggests comes out of `availableLoads`, so a
 * suggestion is always something you can actually put on that machine: a pin plus the add-on,
 * an even plate combination on the Smith bar, or a dumbbell that's in the rack.
 */

const EPSILON = 1e-6;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map(round))].sort((a, b) => a - b);
}

/** Turns a catalog spec (e.g. "10 to 240 in steps of 10") into the explicit model stored per gym. */
export function expandLoadSpec(spec: LoadSpec): LoadModel {
  switch (spec.kind) {
    case 'stack': {
      const weights =
        'weights' in spec
          ? uniqueSorted(spec.weights)
          : Array.from({ length: Math.floor((spec.max - spec.min) / spec.step + EPSILON) + 1 }, (_, i) =>
              round(spec.min + i * spec.step),
            );
      return { kind: 'stack', weights, addOns: spec.addOns ? [...spec.addOns] : [] };
    }
    case 'plates':
      return { kind: 'plates', barWeight: spec.barWeight, plates: spec.plates.map((p) => ({ ...p })) };
    case 'dumbbells':
      return { kind: 'dumbbells', weights: uniqueSorted(spec.weights) };
    case 'fixed':
      return { kind: 'fixed', weights: uniqueSorted(spec.weights) };
    case 'bodyweight':
      return spec.addedWeights ? { kind: 'bodyweight', addedWeights: uniqueSorted(spec.addedWeights) } : { kind: 'bodyweight' };
    case 'levels':
      return { kind: 'levels', levels: [...spec.levels] };
    case 'none':
      return { kind: 'none' };
  }
}

/** Every sum you can make from a subset of the add-on weights (0 included). */
function addOnSums(addOns: number[]): number[] {
  let sums = [0];
  for (const addOn of addOns) sums = [...sums, ...sums.map((s) => s + addOn)];
  return uniqueSorted(sums);
}

/** Every per-side plate total you can load, with the plates that make it (fewest plates first). */
export function plateCombinations(plates: { weight: number; pairs: number }[]): Map<number, number[]> {
  const sorted = [...plates].sort((a, b) => b.weight - a.weight);
  const combos = new Map<number, number[]>([[0, []]]);
  for (const { weight, pairs } of sorted) {
    const snapshot = [...combos.entries()];
    for (const [sum, used] of snapshot) {
      for (let n = 1; n <= pairs; n++) {
        const total = round(sum + weight * n);
        const candidate = [...used, ...Array<number>(n).fill(weight)];
        const existing = combos.get(total);
        if (!existing || candidate.length < existing.length) combos.set(total, candidate);
      }
    }
  }
  return combos;
}

/** All loads this equipment can produce, ascending. Empty for equipment without a load. */
export function availableLoads(model: LoadModel): number[] {
  switch (model.kind) {
    case 'stack': {
      const sums = addOnSums(model.addOns);
      return uniqueSorted(model.weights.flatMap((w) => sums.map((s) => w + s)));
    }
    case 'plates':
      return uniqueSorted([...plateCombinations(model.plates).keys()].map((perSide) => model.barWeight + perSide * 2));
    case 'dumbbells':
    case 'fixed':
      return [...model.weights];
    case 'bodyweight':
      return [0, ...(model.addedWeights ?? [])];
    case 'levels':
      return model.levels.map((_, index) => index);
    case 'none':
      return [];
  }
}

export type SnapDirection = 'down' | 'up' | 'nearest';

/** The closest load the equipment can make: at or below, at or above, or nearest to `target`. */
export function snapLoad(model: LoadModel, target: number, direction: SnapDirection = 'nearest'): number | null {
  const loads = availableLoads(model);
  if (loads.length === 0) return null;
  if (direction === 'down') {
    const below = loads.filter((l) => l <= target + EPSILON);
    return below.length ? below[below.length - 1]! : loads[0]!;
  }
  if (direction === 'up') {
    const above = loads.find((l) => l >= target - EPSILON);
    return above ?? loads[loads.length - 1]!;
  }
  return loads.reduce((best, l) => (Math.abs(l - target) < Math.abs(best - target) - EPSILON ? l : best), loads[0]!);
}

/** Moves `steps` loads up (positive) or down (negative) from `from`, staying within the equipment. */
export function stepLoad(model: LoadModel, from: number, steps: number): number | null {
  const loads = availableLoads(model);
  if (loads.length === 0) return null;
  const current = snapLoad(model, from, 'nearest');
  const index = loads.findIndex((l) => Math.abs(l - (current ?? from)) < EPSILON);
  const next = Math.min(loads.length - 1, Math.max(0, index + steps));
  return loads[next]!;
}

/**
 * How big the next step up is, as a fraction of the current load (0.1 = 10%). Used to decide
 * between adding weight and adding reps when the machine's next step is a big jump.
 */
export function nextStepFraction(model: LoadModel, load: number): number | null {
  if (load <= 0) return null;
  const next = stepLoad(model, load, 1);
  if (next === null || next <= load + EPSILON) return null;
  return Math.round(((next - load) / load) * 1000) / 1000;
}

export interface LoadDescription {
  /** Short label for the big number's caption, e.g. "Pin 190 + 5 lb add-on". */
  detail: string;
  /** Plates per side for bar equipment, heaviest first. */
  platesPerSide?: number[];
}

function formatWeight(value: number, units: string): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${units}`;
}

/** Explains how to set up a load on this equipment, in plain words. */
export function describeLoad(model: LoadModel, load: number, mode: LoadMode = 'total', units = 'lb'): LoadDescription {
  switch (model.kind) {
    case 'stack': {
      if (model.weights.some((w) => Math.abs(w - load) < EPSILON)) return { detail: `Pin at ${round(load)}` };
      for (const extra of addOnSums(model.addOns).filter((s) => s > 0)) {
        const pin = model.weights.find((w) => Math.abs(w + extra - load) < EPSILON);
        if (pin !== undefined) return { detail: `Pin at ${pin} + ${formatWeight(extra, units)} add-on` };
      }
      return { detail: formatWeight(load, units) };
    }
    case 'plates': {
      const perSide = (load - model.barWeight) / 2;
      if (perSide < -EPSILON) return { detail: `Less than the ${formatWeight(model.barWeight, units)} bar` };
      if (Math.abs(perSide) < EPSILON) {
        return { detail: model.barWeight > 0 ? `Empty bar (${formatWeight(model.barWeight, units)})` : 'No plates' };
      }
      const plates = plateCombinations(model.plates).get(round(perSide));
      if (!plates) return { detail: formatWeight(load, units) };
      const bar = model.barWeight > 0 ? `${formatWeight(model.barWeight, units)} bar + ` : '';
      return { detail: `${bar}${plates.join(' + ')} per side`, platesPerSide: plates };
    }
    case 'dumbbells':
      return { detail: mode === 'per-hand' ? `A pair of ${round(load)}s` : `One ${formatWeight(load, units)} dumbbell` };
    case 'fixed':
      return { detail: formatWeight(load, units) };
    case 'bodyweight':
      return { detail: load > 0 ? `Bodyweight + ${formatWeight(load, units)}` : 'Bodyweight' };
    case 'levels':
      return { detail: model.levels[Math.round(load)] ?? 'Band' };
    case 'none':
      return { detail: '' };
  }
}

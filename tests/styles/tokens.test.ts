import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the palettes in src/styles/tokens.css: each dark set is written twice (system preference,
 * explicit choice) and the copies must match; every palette keeps text at WCAG AA.
 */

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Custom properties declared in the block whose selector is exactly `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const COLOR_KEYS = ['bg', 'surface', 'surface-2', 'ink', 'ink-2', 'ink-3', 'accent', 'on-accent', 'accent-text', 'accent-soft', 'win', 'win-soft', 'good', 'good-soft', 'warn', 'warn-soft', 'danger', 'danger-soft', 'on-status'];

const forestLight = block(':root');
const palettes = {
  'Forest light': forestLight,
  'Forest dark': block(':root[data-theme=\'dark\']'),
  'Classic light': block(':root[data-palette=\'classic\']'),
  'Classic dark': block(':root[data-palette=\'classic\'][data-theme=\'dark\']'),
};

type RGBA = [number, number, number, number];
function parse(value: string): RGBA {
  if (value.startsWith('#')) {
    const h = value.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as RGBA;
  }
  const [r, g, b, a = 1] = value.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!, a];
}
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])).concat(1) as RGBA;
const luminance = (c: RGBA) => {
  const [r, g, b] = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: RGBA, b: RGBA) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('tokens', () => {
  it('declares the same colors in every palette', () => {
    for (const [name, set] of Object.entries(palettes)) for (const key of COLOR_KEYS) expect(set[key], `${name} --${key}`).toBeDefined();
  });

  it('keeps each pair of dark blocks identical', () => {
    expect(block(':root:not([data-theme=\'light\'])')).toEqual(palettes['Forest dark']);
    expect(block(':root[data-palette=\'classic\']:not([data-theme=\'light\'])')).toEqual(palettes['Classic dark']);
  });

  it.each(Object.entries(palettes))('%s keeps text at WCAG AA', (_name, set) => {
    const solid = (key: string, base = 'surface') => over(parse(set[key]!), parse(set[base]!));
    for (const fg of ['ink', 'ink-2', 'ink-3', 'accent-text', 'good', 'warn', 'danger']) {
      for (const bg of ['bg', 'surface', 'surface-2']) expect(contrast(solid(fg), solid(bg, 'bg')), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(solid('on-accent'), solid('accent')), 'on-accent on accent').toBeGreaterThanOrEqual(4.5);
    for (const fill of ['good', 'danger']) expect(contrast(solid('on-status'), solid(fill)), `on-status on ${fill}`).toBeGreaterThanOrEqual(4.5);
    // Icons and fills: 3:1.
    expect(contrast(solid('on-status'), solid('win')), 'on-status on win').toBeGreaterThanOrEqual(3);
    for (const bg of ['bg', 'surface']) expect(contrast(solid('win'), solid(bg, 'bg')), `win on ${bg}`).toBeGreaterThanOrEqual(3);
  });
});

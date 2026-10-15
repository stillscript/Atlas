// Renders the Atlas app icons from the mark geometry in src/ui/Logo.tsx.
// Run after changing the mark or brand colors: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const MARK_PATH = 'M16 92 50 32 84 92H66.76L50 62.42 33.24 92Z';
const ORB = { cx: 50, cy: 18, r: 10.5 };

const BG = '#111318';
const MARK = '#f2f0ea';
const ORB_COLOR = '#6a83f7';

const out = new URL('../public/icons/', import.meta.url);

/** Full-bleed square icon; `scale` is the mark's share of the canvas. */
function iconSvg(size, scale) {
  const markSize = size * scale;
  const offset = (size - markSize) / 2;
  const k = markSize / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${k})">
    <path d="${MARK_PATH}" fill="${MARK}"/>
    <circle cx="${ORB.cx}" cy="${ORB.cy}" r="${ORB.r}" fill="${ORB_COLOR}"/>
  </g>
</svg>`;
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <style>.m{fill:#111318}.o{fill:#2e4bdb}@media (prefers-color-scheme:dark){.m{fill:#f2f0ea}.o{fill:#7c93ff}}</style>
  <path class="m" d="${MARK_PATH}"/>
  <circle class="o" cx="${ORB.cx}" cy="${ORB.cy}" r="${ORB.r}"/>
</svg>
`;

async function png(name, size, scale) {
  const buffer = await sharp(Buffer.from(iconSvg(size, scale))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(name, out), buffer);
  console.log(`  ${name} (${size}px)`);
}

await mkdir(out, { recursive: true });
console.log('Rendering icons:');
await png('icon-192.png', 192, 0.66);
await png('icon-512.png', 512, 0.66);
// Maskable icons get cropped to a circle on some Android launchers: keep the mark in the safe zone.
await png('icon-maskable-512.png', 512, 0.54);
// iOS rounds the corners itself and ignores transparency.
await png('apple-touch-icon.png', 180, 0.66);
await writeFile(new URL('favicon.svg', out), favicon);
console.log('  favicon.svg');

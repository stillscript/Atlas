import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { EQUIPMENT, EXERCISES, PATTERNS } from '../../src/domain/catalog';
import { pictogramFor, pictogramSvg } from '../../src/domain/pictograms';

/**
 * Writes a review page with every exercise pictogram, grouped by movement, to the path in
 * ATLAS_ART (skipped otherwise). The page follows the Artifact page contract (no html/body tags),
 * so it can be published for review as is:
 * `$env:ATLAS_ART="dist/art-review.html"; npx vitest run tests/domain/pictograms.review.test.ts`
 */
const out = process.env.ATLAS_ART;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function equipmentName(tag: string | undefined): string {
  if (!tag) return 'Bodyweight';
  const item = EQUIPMENT.find((e) => e.provides.includes(tag));
  return item?.shortName ?? tag;
}

describe.skipIf(!out)('pictogram review page', () => {
  it('writes it', () => {
    const strength = EXERCISES.filter((e) => e.kind !== 'cardio');
    const sections = PATTERNS.filter((p) => strength.some((e) => e.pattern === p.id))
      .map((pattern) => {
        const cards = strength
          .filter((e) => e.pattern === pattern.id)
          .map((e) => {
            const art = pictogramFor(e.id)!;
            const needs = e.loadFrom ?? e.requires[0];
            return `<figure class="card">
  <div class="stage">${pictogramSvg(art, 88)}</div>
  <figcaption><span class="tile">${pictogramSvg(art, 31)}</span><span class="names"><span class="name">${esc(e.name)}</span><span class="meta">${esc(equipmentName(needs))}</span></span></figcaption>
</figure>`;
          })
          .join('\n');
        return `<section><h2>${esc(pattern.name)}</h2><div class="grid">${cards}</div></section>`;
      })
      .join('\n');

    const page = `<title>Atlas exercise icons</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;750&display=swap">
<style>
/* Layout: the app's own Forest palette and type; a contact sheet of icons, grouped by movement. */
:root {
  --bg: #f1f0e9; --surface: #ffffff; --stage: #e5e8e0; --ink: #0f1c16; --ink-2: #4b5a52;
  --accent: #1f5c42; --accent-soft: #e1ece4; --line: rgba(15, 28, 22, 0.09);
  --font: 'Geist', -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0b1310; --surface: #121c17; --stage: #19251f; --ink: #e8eee9; --ink-2: #a5b4ab;
  --accent: #93dab0; --accent-soft: rgba(127, 207, 160, 0.14); --line: rgba(232, 238, 233, 0.08); color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #0b1310; --surface: #121c17; --stage: #19251f; --ink: #e8eee9; --ink-2: #a5b4ab;
  --accent: #93dab0; --accent-soft: rgba(127, 207, 160, 0.14); --line: rgba(232, 238, 233, 0.08); color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.45 var(--font);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 48px; }
main { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; }
header { display: flex; flex-direction: column; gap: 6px; max-width: 62ch; }
h1 { margin: 0; font-size: 34px; font-weight: 750; letter-spacing: -0.025em; text-wrap: balance; }
header p { margin: 0; color: var(--ink-2); }
section { display: flex; flex-direction: column; gap: 12px; }
h2 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.card { margin: 0; display: flex; flex-direction: column; background: var(--surface); border-radius: 18px; overflow: hidden; box-shadow: 0 0 0 1px var(--line); }
.stage { display: grid; place-items: center; padding: 14px; background: var(--stage); color: var(--ink); }
figcaption { display: flex; align-items: center; gap: 10px; padding: 10px 12px 12px; min-width: 0; }
.tile { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.names { display: flex; flex-direction: column; min-width: 0; }
.name { font-weight: 600; line-height: 1.25; }
.meta { color: var(--ink-2); font-size: 13px; }
svg { display: block; overflow: visible; }
.pg-far { opacity: 0.38; } .pg-prop { opacity: 0.6; } .pg-head { fill: currentColor; }
</style>
<main>
<header>
  <h1>Atlas exercise icons</h1>
  <p>${strength.length} icons, one per exercise, grouped by movement. Each card shows the icon large, and at the size it appears in your plan and workouts. Tell me any that read wrong or could be clearer.</p>
</header>
${sections}
</main>
`;
    writeFileSync(out!, page);
  });
});

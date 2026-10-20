import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { EXERCISES } from '../../src/domain/catalog';
import { pictogramFor, pictogramSvg } from '../../src/domain/pictograms';

/**
 * Writes a review page with every exercise pictogram (both palettes, light and dark) to the path in
 * ATLAS_ART. Skipped otherwise. `$env:ATLAS_ART="dist/art-review.html"; npx vitest run tests/domain/pictograms.review.test.ts`
 */
const out = process.env.ATLAS_ART;

describe.skipIf(!out)('pictogram review page', () => {
  it('writes it', () => {
    const cards = EXERCISES.filter((e) => e.kind !== 'cardio')
      .map((e) => {
        const art = pictogramFor(e.id);
        return `<figure><div class="tile">${art ? pictogramSvg(art, 44) : '?'}</div><div class="big">${art ? pictogramSvg(art, 120) : ''}</div><figcaption>${e.name}<br><small>${e.id}</small></figcaption></figure>`;
      })
      .join('');
    const css = `body{margin:0;font:13px/1.35 system-ui;background:#0b1310;color:#e8eee9;padding:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
figure{margin:0;padding:10px;border-radius:14px;background:#121c17;display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center}
.tile{width:52px;height:52px;border-radius:14px;background:rgba(127,207,160,.14);color:#7fcfa0;display:grid;place-items:center}
.big{grid-column:1/-1;color:#e8eee9;display:grid;place-items:center;background:#19251f;border-radius:10px}
figcaption{grid-column:1/-1}small{color:#879990}
.light body,.light{background:#f1f0e9;color:#0f1c16}.light figure{background:#fff}.light .tile{background:#e1ece4;color:#1f5c42}.light .big{background:#e5e8e0;color:#0f1c16}
.pg-far{opacity:.38}.pg-prop{opacity:.6}.pg-head{fill:currentColor}`;
    writeFileSync(out!, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Atlas pictograms</title><style>${css}</style><body><button onclick="document.documentElement.classList.toggle('light')">Light / dark</button><div class="grid">${cards}</div></body>`);
  });
});

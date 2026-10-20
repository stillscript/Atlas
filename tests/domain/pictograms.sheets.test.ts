import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { EXERCISES } from '../../src/domain/catalog';
import { pictogramFor, pictogramSvg } from '../../src/domain/pictograms';

/**
 * Writes labelled contact sheets (SVG, 4 × 3 icons each) to the folder in ATLAS_SHEETS, for review
 * as images. Skipped otherwise.
 */
const dir = process.env.ATLAS_SHEETS;
const only = process.env.ATLAS_ONLY?.split(',').filter(Boolean);

describe.skipIf(!dir)('pictogram contact sheets', () => {
  it('writes them', () => {
    mkdirSync(dir!, { recursive: true });
    const list = EXERCISES.filter((e) => e.kind !== 'cardio' && (!only || only.includes(e.id)));
    const per = 12;
    const cell = 220;
    for (let s = 0; s * per < list.length; s++) {
      const chunk = list.slice(s * per, s * per + per);
      const cells = chunk
        .map((e, i) => {
          const x = (i % 4) * cell;
          const y = Math.floor(i / 4) * (cell + 30);
          const svg = pictogramSvg(pictogramFor(e.id)!, 180).replace('<svg ', `<svg x="${x + 20}" y="${y + 10}" `);
          return `<rect x="${x + 6}" y="${y + 4}" width="${cell - 12}" height="${cell + 20}" rx="14" fill="#ffffff"/>${svg}<text x="${x + cell / 2}" y="${y + cell + 12}" text-anchor="middle" font-family="Arial" font-size="13" fill="#0f1c16">${process.env.ATLAS_BLIND ? `#${s * per + i + 1}` : e.name.replace(/&/g, '&amp;')}</text>`;
        })
        .join('');
      const rows = Math.ceil(chunk.length / 4);
      const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${4 * cell}" height="${rows * (cell + 30)}" style="color:#0f1c16"><rect width="100%" height="100%" fill="#e5e8e0"/><style>.pg-far{opacity:.38}.pg-prop{opacity:.6}.pg-head{fill:#0f1c16}polyline,circle,rect.pg-prop{stroke:#0f1c16}</style>${cells}</svg>`;
      writeFileSync(join(dir!, `sheet-${String(s + 1).padStart(2, '0')}.svg`), doc);
    }
  });
});

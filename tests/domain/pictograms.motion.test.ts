import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { EXERCISES } from '../../src/domain/catalog';
import { motionBox, motionSvg, pictogramFor } from '../../src/domain/pictograms';

/**
 * Writes contact sheets of each movement (start, middle, finish in one fixed frame) to the folder
 * in ATLAS_MOTION, for review as images. Skipped otherwise. ATLAS_ONLY=id,id limits the set.
 */
const dir = process.env.ATLAS_MOTION;
const only = process.env.ATLAS_ONLY?.split(',').filter(Boolean);

describe.skipIf(!dir)('movement contact sheets', () => {
  it('writes them', () => {
    mkdirSync(dir!, { recursive: true });
    const list = EXERCISES.filter((e) => e.kind !== 'cardio' && (!only || only.includes(e.id)));
    const per = 8;
    const w = 440;
    const h = 170;
    for (let s = 0; s * per < list.length; s++) {
      const chunk = list.slice(s * per, s * per + per);
      const cells = chunk
        .map((e, i) => {
          const x = (i % 2) * w;
          const y = Math.floor(i / 2) * h;
          const art = pictogramFor(e.id)!;
          const frame = motionBox(art);
          const frames = [0, 0.5, 1]
            .map((t, k) => motionSvg(art, t, 130, frame).replace('<svg ', `<svg x="${x + 12 + k * 140}" y="${y + 6}" `))
            .join('');
          return `<rect x="${x + 4}" y="${y + 2}" width="${w - 8}" height="${h - 4}" rx="12" fill="#ffffff"/>${frames}<text x="${x + 14}" y="${y + h - 10}" font-family="Arial" font-size="13" fill="#0f1c16">${e.name.replace(/&/g, '&amp;')}${art.motion ? '' : ' (hold)'}  ·  start · middle · finish</text>`;
        })
        .join('');
      const rows = Math.ceil(chunk.length / 2);
      writeFileSync(
        join(dir!, `motion-${String(s + 1).padStart(2, '0')}.svg`),
        `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * w}" height="${rows * h}" style="color:#0f1c16"><rect width="100%" height="100%" fill="#e5e8e0"/>${cells}</svg>`,
      );
    }
  });
});

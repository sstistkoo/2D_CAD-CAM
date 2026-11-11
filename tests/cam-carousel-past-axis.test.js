// Karusel po X „Od středu": za osou (X < 0) je zrcadlově týž materiál, ne
// vzduch. Uživatel 11. 11. 2026: vrstvy Z186/Z182 vjížděly od X-2.8 posuvem
// k ose (`G1 X-0.004`) pod vrškem dílu Z189 — nic neubraly a rádius špičky
// zajel do dílu u osy (červené zajetí v simulaci).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { dropPastAxisPasses } from '../js/calculators/cam/xzSwap.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');

describe('dropPastAxisPasses', () => {
  it('zahodí jen průchod celý za osou', () => {
    const passes = [
      { type: 'long', x: 186, zStart: -2.8, zEnd: -0.004 },
      { type: 'long', x: 190, zStart: -2.8, zEnd: 218.9 },
      { type: 'long', x: 182, zStart: -2.8, zEnd: -0.1, contourLeadOut: [{ z1: -0.1, z2: 3 }] },
      { type: 'face', xStart: 10, xEnd: 0, z: -1 },
    ];
    expect(dropPastAxisPasses(passes)).toEqual(passes.slice(1));
  });
  it('řetěz (noRetract) vcelku: celý za osou pryč, s článkem před osou zůstane celý', () => {
    const a = { type: 'long', x: 39, zStart: -5.7, zEnd: -9, noRetract: true };
    const b = { type: 'long', x: 37, zStart: -8.2, zEnd: -8.2, noRetract: true };
    const c = { type: 'long', x: 34, zStart: -10.7, zEnd: -10.7 };
    const d = { type: 'long', x: 30, zStart: 20, zEnd: 5 };
    expect(dropPastAxisPasses([a, b, c, d])).toEqual([d]);
    const e = { type: 'long', x: 30, zStart: -2, zEnd: -1, noRetract: true };
    expect(dropPastAxisPasses([e, d])).toEqual([e, d]);
  });
});

describe('Karusel Od středu — nic nesjíždí za osou pod vršek dílu', () => {
  it('žádný posuv u osy (X < 1) pod Z189', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'carousel-center-axis.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    let x = null, z = null;
    const bad = [];
    for (const l of r.gcode.split('\n')) {
      const mx = l.match(/X(-?\d+\.?\d*)/), mz = l.match(/Z(-?\d+\.?\d*)/);
      if (mx) x = +mx[1];
      if (mz) z = +mz[1];
      if (/^N\d+ G1/.test(l) && x !== null && z !== null && x < 1 && z < 189) bad.push(l);
    }
    expect(bad).toEqual([]);
  });
});

// Šikmý vjezd cik caku nezačíná vzduchem (audit CAM 27. 11. 2026, pravidlo 5):
// rychloposuv míří rovnou nad bod, kde první šikmý pohyb začne řezat
// (`slantHead`, ops/zigzagEmit.js). Dřív G0 nad začátek a 7–14 mm posuvem vzduchem.
// Řez za vzduchovou mezerou podélné vrstvy totéž (`rapidAhead`, ops/roughEmit.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const lines = (g) => g.split('\n').map(l => l.replace(/^N\d+\s*/, '').trim());

describe('cik cak — úvodní vzduch šikmého vjezdu rychloposuvem', () => {
  it('v-insert-size: vjezdy na X86 Z319,346, X70,156 a X81,22 začínají až u materiálu', async () => {
    const L = lines((await runCamProg(load('cam-cases/lathe-zigzag-v-insert-size.camprog'))).gcode);
    for (const [cut, z, x] of [
      ['G1 X86.000 Z319.346', 'G0 Z306.397', 'G0 X143.080'],   // dřív G0 Z304.835 / X148.884
      ['G1 X70.156 Z554.501', 'G0 Z548.048', 'G0 X78.510'],    // dřív G0 Z543.531 / X82.881
      ['G1 X81.220 Z195.950', 'G0 Z201.991', 'G0 X135.490'],   // dřív G0 Z203.445 / X147.733
    ]) {
      const i = L.findIndex(l => l.startsWith(cut));
      expect(i, cut).toBeGreaterThan(2);
      expect(L.slice(i - 3, i - 1)).toEqual([z, x]);
      expect(L[i - 1]).toMatch(/^G1 X\d+\.\d+ F/);   // posuv jen posledních ≤ 2 mm
    }
  }, 120000);

  it('karusel po-x: téměř svislá jízda po stěně (88,5°) — rychloposuv po přímce, sjezd jedním posuvem', async () => {
    const L = lines((await runCamProg(load('cam-cases/carousel-zigzag-po-x.camprog'))).gcode);
    const i = L.findIndex(l => l.startsWith('G1 Z108.201 X159.806'));
    expect(i).toBeGreaterThan(2);
    // dřív G0 X160.032 / G0 Z117.062 a 8,9 mm posuvem; svislý dojezd zvlášť by dal P6
    expect(L.slice(i - 2, i)).toEqual(['G0 X159.844', 'G0 Z109.685']);
  }, 120000);

  it('v-insert-size: řez za vzduchovou mezerou vrstvy (N280) začíná rychloposuvem až u zbytku', async () => {
    const L = lines((await runCamProg(load('cam-cases/lathe-zigzag-v-insert-size.camprog'))).gcode);
    const i = L.findIndex(l => l.startsWith('G1 Z-1.000'));
    expect(i).toBeGreaterThan(1);
    expect(L[i - 1]).toBe('G0 Z91.525');   // dřív G0 Z105.760 a 7,7 mm posuvem vzduchem
  }, 120000);
});

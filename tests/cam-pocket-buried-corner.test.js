// Dobrání kapsy („kapsa bez schodků") nesmí začít v rohu, nad kterým zůstal
// materiál. Díl uživatele (karusel po X, 11. 11. 2026, Úsek 2 z
// projekt_2026-11-11 (2)): kapsa S8–S5 leží pod mezní čárou zanoření od S11,
// rampy dojely jen na levou stěnu v Z66, a dobrání sjelo k rohu S8 svisle
// posuvem (`G0 Z104.990` → `G1 Z64.000`) skrz 40 mm materiálu: 3 kolize
// držáku. Materiál pod mezní čárou zůstává (pravidlo 6).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { chainFloorAt, pocketCornerBuried } from '../js/calculators/cam/ops/long/pocketCornerBuried.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');

describe('pocketCornerBuried', () => {
  const passes = [
    { type: 'long', x: 114, zStart: 484, zEnd: 293, ramp: { x0: 124, z0: 521 } },
    { type: 'long', x: 104, zStart: 447, zEnd: 296, ramp: { x0: 114, z0: 484 } },
  ];
  it('dno řetězu nad Z = nejhlubší vrstva nebo rampa', () => {
    expect(chainFloorAt(passes, 400)).toBe(104);
    expect(chainFloorAt(passes, 500)).toBeCloseTo(114 + 10 * (500 - 484) / 37, 6);
    expect(chainFloorAt(passes, 600)).toBe(null);
  });
  it('roh 40 mm pod dnem je zasypaný, roh na dně ne', () => {
    expect(pocketCornerBuried(passes, { x: 64, z: 446.9 }, 10)).toBe(true);
    expect(pocketCornerBuried(passes, { x: 100, z: 446.9 }, 10)).toBe(false);
    expect(pocketCornerBuried([], { x: 64, z: 446.9 }, 10)).toBe(false);
  });
});

describe('Karusel po X — dobrání kapsy pod mezní čárou', () => {
  it('bez svislého sjezdu do materiálu a bez kolize', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'carousel-pocket-buried-corner.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    expect(r.gcode).not.toMatch(/G1 Z64\.000 F/);
    expect(validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
  });
});

// Vrstva na schodu (rule7Layers.js), kterou celou zastíní dojezd další
// vrstvy, vypadne (audit 23. 11. 2026, lathe-zigzag-left-valley `N5420`).
// Plošina X35,356 (Z199,8–210) mezi vrstvami X36,545 a X34,545: vrstva na
// schodu přesáhla oknem nad údolí (tenká vrstva 1,16 mm, rampa Z193,9)
// a dojezd vrstvy X34,545 pak plošinu sjel podruhé.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { stripCodeOwnedParams } from '../js/calculators/cam/camDefaults.js';
import { floorShadowedByLayer } from '../js/calculators/cam/ops/long/rule7FloorJoin.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');

describe('rule7: vrstvu na schodu zastíní dojezd další vrstvy', () => {
  it('lathe-zigzag-left-valley: plošina X35,356 se jede jednou, nad údolím žádná tenká vrstva', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'lathe-zigzag-left-valley.camprog'), 'utf8'));
    prog.params = stripCodeOwnedParams(prog.params);
    const r = await runCamProg(prog);
    const near = r.calc.passes.filter((q) => q && q.type === 'long' && q.x > 33 && q.x < 38
      && Math.max(q.zStart, q.zEnd) > 190 && Math.min(q.zStart, q.zEnd) < 212);
    // Žádné tělo průchodu mezi vrstvami X36,545 a X34,545.
    expect(near.filter((q) => q.x > 34.6 && q.x < 36.5)).toEqual([]);
    // Dno plošiny (X35,356 ± 0,03) přes Z200–210 jede právě jeden prvek dráhy.
    const floorRuns = near.flatMap((q) => [{ x1: q.x, z1: q.zStart, x2: q.x, z2: q.zEnd }, ...(q.contourLeadOut || [])])
      .filter((s) => Math.abs(s.x1 - 35.356) < 0.03 && Math.abs(s.x2 - 35.356) < 0.03
        && Math.min(s.z1, s.z2) < 201 && Math.max(s.z1, s.z2) > 209);
    expect(floorRuns).toHaveLength(1);
  }, 180000);

  it('nájezd další vrstvy se nepočítá (přestavuje se), jen tělo a dojezd', () => {
    const floor = [{ x: 83.22, zStart: 528, zEnd: 442 }];
    const byLeadIn = [{ x: 78, zStart: 431, zEnd: 321,
      contourLeadIn: [{ x1: 83.2, z1: 540, x2: 83.2, z2: 433 }, { x1: 83.2, z1: 433, x2: 78, z2: 431 }] }];
    expect(floorShadowedByLayer(floor, byLeadIn)).toBe(false);
    const byLeadOut = [{ x: 78, zStart: 321, zEnd: 431,
      contourLeadOut: [{ x1: 78, z1: 431, x2: 83.2, z2: 433 }, { x1: 83.2, z1: 433, x2: 83.2, z2: 540 }] }];
    expect(floorShadowedByLayer(floor, byLeadOut)).toBe(true);
  });
});

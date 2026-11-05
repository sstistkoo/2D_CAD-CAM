// Karusel po X „Od středu" (zrcadlený svět), Cik cak, ap 8 — díl uživatele
// projekt_2026-11-05 (2)/(9): u šikmé stěny S12–S13 vjížděly vrstvy rampou
// 45° z čáry zanoření a mezi stěnou a rampami zůstal klín. Cik cak po dně
// (zigzagValley) jel ke stěně pod klínem a začínal svislým zanořením posuvem
// skrz něj (G0 Z170 → G1 Z145 na X89.284): 11 kolizí držáku v Ú1.
// Uživatel: „mám to cik cak, mělo by to jezdit až k čelům tam a nazpět" —
// vrstvy u čela vjíždějí od stěny (ops/zigzagWallStart.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, xzSectionSteps, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8'));

describe('Karusel Od středu — vrstvy až k šikmému čelu', () => {
  it('✂ Po úsecích bez kolize, cik cak v kapse jede až ke stěně, bez svislého zanoření', async () => {
    const prog = load('carousel-zigzag-center-wedge.camprog');
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    const { steps } = xzSectionSteps(r0.S, r0.calc);
    expect(steps).toHaveLength(3);
    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode, first = null;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      expect(validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
      if (!first) first = r;
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
    }
    // Ú1: cik cak po dně kapsy pod Z137 dojíždí vlevo ke stěně (X 90–120),
    // ne jen na čáru zanoření (dřív schody X136 → X192 nebo klín).
    let x = null, z = null, nearWall = 0;
    for (const l of first.gcode.split('\n')) {
      const mx = l.match(/X(-?\d+\.?\d*)/), mz = l.match(/Z(-?\d+\.?\d*)/);
      if (mx) x = +mx[1];
      if (mz) z = +mz[1];
      if (/^N\d+ G1/.test(l) && x > 90 && x < 120 && z < 136.9 && z > 66) nearWall += 1;
    }
    expect(nearWall).toBeGreaterThanOrEqual(4);
    // Vrstvy nad kapsou (Z161–Z145) dojedou ke stěně (X < 90).
    expect(first.gcode).toMatch(/G1 X8[3-9]\.\d+ F/);
    expect(first.gcode).not.toMatch(/G0 X89\.284/);
  }, 240000);
});

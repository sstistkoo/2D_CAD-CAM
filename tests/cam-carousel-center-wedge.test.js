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
  it('✂ Po úsecích bez kolize, cik cak v kapse jede až ke stěně, bez svislého zanoření, kapsa za hranicí údolí obrobená', async () => {
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
    // Bod 6: kapsa pod dnem údolí za hranicí Ú1/Ú2 (X 310–447, pod Z68) —
    // Ú1 pod dno údolí nejede, Ú2 ji bere až ke stěně hrbu (pravidlo 1).
    const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };
    for (const [px, pz] of [[330, 50], [360, 48], [400, 58], [430, 66], [320, 100]]) expect(inside(stock, px, pz), `X${px} Z${pz}`).toBe(false);
    // Kapsa pod šikmou stěnou za hranicí Ú2/Ú3 (X 673–706) — vezme ji Ú3
    // (ops/zigzagBeyondStart.js; dřív klín 30 mm).
    for (const [px, pz] of [[685, 60], [695, 50], [700, 66]]) expect(inside(stock, px, pz), `X${px} Z${pz}`).toBe(false);
  }, 240000);

  it('Ú3 s polotovarem z aplikace: kapsa za hranicí shora od stěny, bez svislého zanoření posuvem (N4400)', async () => {
    // Díl (9), uložený Úsek 3: za hranicí X705.9 stál materiál do Z130 a spodek
    // cik cak začínal na Z77.571 → G0 X672.609, G1 Z77.571 (60 mm svisle
    // posuvem), výjezd materiálem posuvem, 10 kolizí držáku.
    const prog = load('carousel-zigzag-center-u3-beyond.camprog');
    // Úseky Cik cak se generují bez dokončování (sectionFinishAtEnd.js).
    const r = await runCamProg({ ...prog, params: { ...prog.params, doFinishing: false } });
    expect(validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
    expect(r.gcode).not.toMatch(/Výjezd materiálem posuvem/);
    // Žádný svislý posuv (jen Z) delší než ap — dřív G1 Z137.1 → Z77.571.
    let z = null, maxDrop = 0;
    for (const l of r.gcode.split('\n')) {
      if (!/^N\d+ G[01]/.test(l)) continue;
      const mz = l.match(/Z(-?\d+\.?\d*)/);
      if (/^N\d+ G1/.test(l) && mz && !/X-?\d/.test(l) && z !== null) maxDrop = Math.max(maxDrop, z - +mz[1]);
      if (mz) z = +mz[1];
    }
    expect(maxDrop).toBeLessThanOrEqual(8.01);
    // Začíná kapsou za hranicí (u stěny, X < 705.9) shora.
    const first = r.gcode.split('\n').find((l) => /^N\d+ G0 X/.test(l));
    expect(+first.match(/X(-?\d+\.?\d*)/)[1]).toBeLessThan(705);
  }, 240000);
});

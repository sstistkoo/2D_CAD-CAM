// Karusel Od středu, Cik cak, ap 6, Rozsah X min 45,69 — díl uživatele
// projekt_2026-11-05 (11): „dráhy mi vyberou jako první za tím rozsahem"
// (Ú1 začínal kapsou X0–45,7 mimo rozsah — zigzagBeyondStart smí jen po
// předchozím úseku, `afterPrev`) a „vrstvy … vynechávají nedojetý polotovar
// N1520" (kapsa 14–13: vrstvy od Z116 vjížděly rampou uprostřed předchozí
// vrstvy a jely jen doprava — zigzagValley.js `nextMember`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, xzSectionSteps, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };

describe('Karusel Od středu s rozsahem X min', () => {
  it('Ú1 nejede mimo rozsah, kapsa 14–13 obrobená, bez kolize', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'carousel-zigzag-center-range.camprog'), 'utf8'));
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    const { steps } = xzSectionSteps(r0.S, r0.calc);
    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode, first = null;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      expect(validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
      if (!first) first = r.gcode;
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
    }
    // Žádný řez pod X 45 (rozsah X min 45,69 minus nos).
    let x = null;
    for (const l of first.split('\n')) {
      const m = l.match(/X(-?\d+\.?\d*)/);
      if (m) x = +m[1];
      if (/^N\d+ G1/.test(l) && x !== null) expect(x, l).toBeGreaterThan(40);
    }
    for (const [px, pz] of [[120, 100], [140, 80], [160, 75], [110, 110], [190, 90]]) expect(inside(stock, px, pz), `X${px} Z${pz}`).toBe(false);
  }, 300000);
});

// Soustruh, Cik cak ZLEVA, ap 8 — díl uživatele projekt_2026-11-05 (10)
// (díl (9) převedený na soustruh). Uživatel: „ať je výsledek stejný jako
// když to jedu z pravé strany":
//  – kapsa 15–14–13 dojede doleva až k čelu 15–14 (stěna strmější než úhel
//    zanoření; dřív klín, ops/zigzagWallStart.js `towardWall`),
//  – údolí 11–6 se v Ú2 nedělí uprostřed (kapsa za začátkem úseku navíc,
//    ops/zigzagBeyondStart.js — pokrytí spodkem cik cak),
//  – konec u 2–1/18 se dojede zprava doleva (ops/zigzagReverse.js),
//  – pod S4 jedou vrstvy Ú3 až ke stěně 3–4 najednou (dřív kapsa zvlášť).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { machinedFor, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { sectionRanges } from '../js/calculators/cam/ops/sections/sectionRanges.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = () => JSON.parse(readFileSync(join(DIR, 'lathe-zigzag-left-10.camprog'), 'utf8'));
const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.x > x) !== (b.x > x) && z < (b.z - a.z) * (x - a.x) / (b.x - a.x) + a.z) c = !c; } return c; };

describe('Cik cak zleva — k čelům jako zprava', () => {
  it('✂ Po úsecích bez kolize, kapsa 15–14 i konec u 1/18 dojeté', async () => {
    const prog = load();
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    const zs = r0.calc.stockWorldPoints.map((p) => p.zReal);
    const steps = sectionRanges(r0.calc.sectionPlan, { lo: Math.min(...zs), hi: Math.max(...zs) }, null);
    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode, last = null;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      expect(validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting'; last = r.gcode;
    }
    // Ú3 pod S4: vrstvy jedou od konce až ke stěně 3–4 najednou, ne na dvě
    // části s otočkou na hranici Z705.9 (zigzagReverse.js `zBeyond`).
    expect(last).not.toMatch(/G1 Z705\.922/);
    // Klín u čela 15–14 (X 70–150) a roh u 1/18 (Z 850–870, X 0–12).
    for (const [x, z] of [[150, 110], [120, 120], [90, 130], [75, 132], [8, 858], [4, 865], [52, 690], [60, 685], [50, 700]]) {
      expect(inside(stock, x, z), `X${x} Z${z}`).toBe(false);
    }
  }, 300000);

  it('Ú2 s polotovarem z aplikace: údolí jedním cik cakem, bez kapsy za hranicí', async () => {
    const prog = load();
    const r = await runCamProg({ ...prog, params: { ...prog.params, doFinishing: false }, stockPoints: prog.u2.stockPoints, zLimits: prog.u2.zLimits, xLimits: prog.u2.xLimits });
    expect(r.calc.passes.filter((p) => p.beyondStart)).toHaveLength(0);
    expect(validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
    // Žádná vrstva v údolí neotáčí na hranici Ú1/Ú2 (Z459.779).
    expect(r.gcode).not.toMatch(/G1 X1[0-2]\d\.\d+ Z45[19]\.779/);
  }, 120000);
});

// Cik cak „bez schodků": jízda po stěně (wallClean) má jet po hrubovacím
// offsetu plynule, ne po schodech. Uživatel 6. 11. 2026: „při zahlazování
// schodků místo po rovině mně to schodkuje N1830 G1 Z131.519 X597.752"
// (karusel) a „stejný problém i u soustruhu" (Ú3, kapsa S15–S18). Mez proti
// sjetí do neobrobeného V (zigzagFloor.js `coverMin`) brala výšku vrstvy,
// která místo pokrývá — každá vrstva sahá ke stěně, takže jízda u každé
// vrstvy uhnula vodorovně o 5 mm a pod ní zůstal klín.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, xzSectionSteps, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { sectionRanges } from '../js/calculators/cam/ops/sections/sectionRanges.js';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8'));
const kol = (r) => (r.calc._xz
  ? validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true })
  : validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true }));

async function sections(name) {
  const prog = load(name);
  const r0 = await runCamProg(prog);
  const xs = xzSectionSteps(r0.S, r0.calc);
  let steps;
  if (xs && xs.steps) steps = xs.steps;
  else { const zs = r0.calc.stockWorldPoints.map((p) => p.zReal); steps = sectionRanges(r0.calc.sectionPlan, { lo: Math.min(...zs), hi: Math.max(...zs) }, null); }
  const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
  let stock = prog.stockPoints, mode = prog.params.stockMode;
  const out = [];
  for (const st of steps) {
    const L = sectionStepLimits(r0.S, st, base);
    const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
    out.push(r);
    stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
  }
  return out;
}

const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };
const wallPasses = (r) => (r.calc._xz ? r.calc._xz.calc : r.calc).passes.filter((p) => p.wallClean && !p.beyondStart);
// Nejdelší úsek jízdy po stěně ve stálé výšce (schod), mimo poslední pohyb (dno).
const flatRun = (p) => {
  let m = 0;
  for (let k = 1; k < p.moves.length - 1; k++) {
    const a = p.moves[k - 1], b = p.moves[k];
    if (Math.abs(a.x - b.x) < 1e-3) m = Math.max(m, Math.abs(a.z - b.z));
  }
  return m;
};

describe('Cik cak — jízda po stěně bez schodů', () => {
  it('karusel, ap 10: šikmá stěna S10–S11 jedním tahem bez schodů, bez kolize', async () => {
    const [u1, u2] = await sections('carousel-zigzag-wall-steps.camprog');
    for (const r of [u1, u2]) expect(kol(r).filter((e) => e.area > 0.5)).toHaveLength(0);
    const w = wallPasses(u1);
    expect(w.length).toBeGreaterThan(0);
    for (const p of w) expect(flatRun(p)).toBeLessThan(1);
    // Dřív N1820 G1 X598.001 (5 mm vodorovně ve výšce vrstvy), N1860 …
    expect(u1.gcode).not.toMatch(/G1 X598\.001/);
  }, 300000);

  it('soustruh, ap 2: kapsa S15–S18 v Ú3 po oblouku bez schodů, bez kolize', async () => {
    const us = await sections('lathe-zigzag-wall-steps.camprog');
    for (const r of us) expect(kol(r).filter((e) => e.area > 0.5)).toHaveLength(0);
    const w = wallPasses(us[2]);
    expect(w.length).toBeGreaterThan(0);
    for (const p of w) expect(flatRun(p)).toBeLessThan(1);
  }, 300000);

  it('karusel zprava po úsecích: údolí X309–447 pod Z79 vybrané (Ú2, kapsa pod podélnou vrstvou)', async () => {
    // Vrstvy od hranice jely rovně ke stěně (bez rampy → bez cik caku) a kapsu
    // pod poslední z nich nic nebralo (klín 18 mm) — zigzagValley.js
    // `pocketsBelowZigzag` s `belowLong` ji vezme i pod podélnou vrstvou.
    const [, u2] = await sections('carousel-zigzag-wall-steps.camprog');
    const st = machinedFor(u2.S, u2.calcSim).points;
    for (const [x, z] of [[330, 50], [360, 48], [390, 50], [420, 58]]) expect(inside(st, x, z), `X${x} Z${z}`).toBe(false);
  }, 300000);

  it('soustruh celý program: kapsa S15–S18 až ke stěně (dřív klín 8 mm u Z90–110)', async () => {
    // zigzagValley.js `wedgeAbove`: „klín" nad pásmem u stěny byl vzduch
    // (kapsa odlitku) a obrácené vrstvy — cik cak skončil na čáře zanoření.
    const r = await runCamProg(load('lathe-zigzag-wall-steps.camprog'));
    expect(kol(r).filter((e) => e.area > 0.5)).toHaveLength(0);
    const st = machinedFor(r.S, r.calcSim).points;
    for (const [x, z] of [[11, 94], [13, 98], [12.5, 104], [14.5, 107]]) expect(inside(st, x, z), `X${x} Z${z}`).toBe(false);
  }, 300000);
});

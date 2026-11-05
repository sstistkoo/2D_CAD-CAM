// Cik cak — údolí pod čarou zanoření uvnitř úseku (ops/zigzagValley.js).
// Uživatel 4. 11. 2026 (karusel po X, díl `carousel-zigzag-valley`): údolí
// za hrbem, jehož čára zanoření skončí na kontuře, se nemá brát řetězem
// vrstev zanořených po čáře zanoření (u strmé stěny zůstal klín „nedojeto"),
// ale cik cak: vrstva od stěny ke stěně, na konci rampa 45° o ap níž.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, xzSectionSteps, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { mirrorPass } from '../js/calculators/cam/zMirror.js';
import { sectionRanges } from '../js/calculators/cam/ops/sections/sectionRanges.js';
import { openAtAxis } from '../js/calculators/cam/xzSwap.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8'));
const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.z - q.x * p.z; }
  return Math.abs(a / 2);
};

describe('Cik cak — údolí za hrbem bez hranice úseku', () => {
  it('karusel po X: obě údolí cik cak, až ke stěně hrbu, bez kolize, méně zbytku', async () => {
    const prog = load('carousel-zigzag-valley.camprog');
    const r = await runCamProg(prog);
    const w = r.calc._xz;
    const zig = w.calc.passes.filter((p) => p.floorZigzag);
    expect(zig.length).toBeGreaterThanOrEqual(2);
    // Údolí mezi hrby (stěna 10–11 strmější než 45°): vrstva X'121 jede
    // doprava až ke stěně (Z' ≈ 603), ne jen na čáru zanoření (Z' 587,9).
    const a = zig.find((p) => p.moves.some((m) => Math.abs(m.x - 121) < 1e-6 && m.z > 500));
    expect(Math.max(...a.moves.filter((m) => Math.abs(m.x - 121) < 1e-6).map((m) => m.z))).toBeGreaterThan(600);
    // Směr se střídá (cik cak), ne všechny vrstvy doleva.
    const dirs = a.moves.slice(1).map((m, i) => Math.sign(m.z - a.moves[i].z)).filter(Boolean);
    expect(dirs.some((d) => d > 0)).toBe(true);
    // Údolí u osy: žádná vrstva už nevjíždí po čáře zanoření od hrbu 4.
    expect(w.calc.passes.some((p) => p.contourLeadIn && Math.abs(p.contourLeadIn[0].z1 - 213.65) < 0.05 && p.contourLeadIn.length === 1)).toBe(false);
    // Bez kolize (v prohozeném světě, nůž svisle — cam/sim/xzSim.js).
    expect(validateToolpath(swapSimPath(r.calcSim.simPath), w.S.params, w.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
    // Zbytek nad konturou: dřív 4589 mm² (klíny u stěn), teď < 1500 mm².
    const contour = prog.contourPoints.slice(0, -1);
    expect(area(machinedFor(r.S, r.calcSim).points) - area(contour)).toBeLessThan(1500);
  }, 240000);

  it('✂ Po úsecích: hranice na S7 (údolí polotovaru), Ú2 napřed zářez V, pak nižší dno, pak údolí u osy', async () => {
    const prog = load('carousel-zigzag-valley.camprog');
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    const { steps } = xzSectionSteps(r0.S, r0.calc);
    expect(steps).toHaveLength(2);
    expect(steps[0].zLo).toBeCloseTo(556.3, 0);   // S7 X557 na offsetu polotovaru
    // Ú1 jede až na dno jako na soustruhu (uživatel 5. 11.: „z pravé strany
    // nedělit a jet až dolů"); jen vlevo od hrbu u S7 ne pod výšku dna údolí.
    expect(steps[0].xTo).toBeNull();
    expect(steps[0].valleyFloor).toBeCloseTo(127, 0);
    expect(steps[1].zHi).toBeCloseTo(556.3, 0);
    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode, r = null, r1 = null;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      expect(validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
      r1 = r1 || r;
    }
    // Ú1: pravá strana za hrbem až na dno (X' 1 u obvodu) DŘÍV, než vrstvy
    // přejedou přes hrb doleva; vlevo od hrbu nic pod dnem údolí.
    const p1 = r1.calc._xz.calc.passes;
    const right = p1.findIndex((p) => p.type === 'long' && p.x < 5 && p.zStart > 846);
    const left = p1.findIndex((p) => p.type === 'zigzag' && p.moves.some((m) => m.z < 620 && m.x < 160));
    expect(right).toBeGreaterThanOrEqual(0);
    expect(left).toBeGreaterThan(right);
    expect(p1.some((p) => p.type === 'long' && p.x < 127 && Math.max(p.zStart, p.zEnd) < 612)).toBe(false);
    // Pořadí kapes v Ú2 zprava doleva: dno V (X'≈48 u Z'≈555), nižší dno (X'≈44 u Z'≈394), údolí u osy (X'≈66 u Z'≈115).
    const zz = r.calc._xz.calc.passes.filter((p) => p.floorZigzag);
    const at = (x, z) => zz.findIndex((p) => p.moves.some((m) => Math.abs(m.x - x) < 1.5 && Math.abs(m.z - z) < 12));
    const v = at(48.2, 555), f6 = at(44.3, 394), f2 = at(66.2, 115);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(f6).toBeGreaterThan(v);
    expect(f2).toBeGreaterThan(f6);
    // Zbytek po obou úsecích (dřív 3866 mm²: zářez V a nižší dno nedojeté).
    const contour = prog.contourPoints.slice(0, -1);
    expect(area(stock) - area(contour)).toBeLessThan(1000);
  }, 240000);

  it('soustruh (týž díl, osy prohozené ručně): Ú1 až na dno (u S7 nad dnem údolí), Ú2 cik cak v údolí a kapsy zprava, bez kolize', async () => {
    const prog = load('lathe-zigzag-stock-valley.camprog');
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    const zs = r0.calc.stockWorldPoints.map((p) => p.zReal);
    const steps = sectionRanges(r0.calc.sectionPlan, { lo: Math.min(...zs), hi: Math.max(...zs) }, null);
    expect(steps.map((s) => s.xTo)).toEqual([null, null]);
    expect(Math.round(steps[0].valleyFloor)).toBe(127);
    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode, r = null;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      expect(validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
    }
    // Údolí mezi hrby jede cik cak (řetěz ramp nahrazen), pak V (Z≈555), nižší dno (Z≈394), údolí u osy (Z≈115).
    const zz = r.calc.passes.filter((p) => p.floorZigzag);
    const at = (x, z) => zz.findIndex((p) => p.moves.some((m) => Math.abs(m.x - x) < 1.5 && Math.abs(m.z - z) < 12));
    const v = at(48.2, 555), f6 = at(44.3, 394), f2 = at(66.2, 115);
    expect(v).toBeGreaterThan(0);
    expect(f6).toBeGreaterThan(v);
    expect(f2).toBeGreaterThan(f6);
    expect(r.calc.passes.some((p) => p.type === 'long' && p.ramp && p.x < 130 && p.zStart > 500)).toBe(false);
    // Zbytek (polotovar v zápisu bodů x = poloměr, z = osa).
    const contour = prog.contourPoints.slice(0, -1);
    expect(area(stock) - area(contour)).toBeLessThan(1000);
  }, 240000);

  it('karusel u osy: kontura otevřená na ose — bez vrstvy pod rohem, bez sjezdu po ose, body plátna beze změny', async () => {
    const prog = load('carousel-zigzag-valley.camprog');
    // Uzavřená kontura s hranou po ose se otevře: začne nahoře na ose, skončí na ose dole.
    const o = openAtAxis(prog.contourPoints);
    expect([o[0].x, o[0].z, o[0].type]).toEqual([0, 189, 'G0']);
    expect([o[o.length - 1].x, o[o.length - 1].z]).toEqual([0, 0]);
    expect(o).toHaveLength(prog.contourPoints.length - 1);
    const r = await runCamProg(prog);
    // Body na plátně = původní kontura (čísla, tažení bodu).
    expect(r.calc.worldPoints).toHaveLength(prog.contourPoints.length);
    // Žádná vrstva pod rohem X69 Z189 (prohozeně X' 189, Z' 69–74).
    expect(r.calc._xz.calc.passes.some((p) => p.type === 'long' && Math.abs(p.x - 189.05) < 0.1 && Math.min(p.zStart, p.zEnd) < 72)).toBe(false);
    // Program nesjíždí dolů za osou (X < 0) — po ose otáčení je díl.
    let x = null, z = null;
    for (const l of r.gcode.split('\n')) {
      const c = l.split(';')[0], mx = c.match(/X(-?[\d.]+)/), mz = c.match(/Z(-?[\d.]+)/);
      const nx = mx ? +mx[1] : x, nz = mz ? +mz[1] : z;
      if (/\bG1\b/.test(c) && nx !== null && z !== null) expect(nx < -0.5 && nz < z - 0.5).toBe(false);
      x = nx; z = nz;
    }
  }, 240000);

  it('zrcadlo (zleva) překlopí i směr odskoku cik caku', () => {
    const m = mirrorPass({ type: 'zigzag', moves: [{ g: 'G1', x: 1, z: 2 }], xSafe: 3, floorZigzag: true, endDir: -1 });
    expect(m.endDir).toBe(1);
    expect(m.moves[0].z).toBe(-2);
  });
});

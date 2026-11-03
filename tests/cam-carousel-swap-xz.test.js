// Karusel „⟲ Po X jako podélně" (cam/xzSwap.js, uživatel 3. 11. 2026):
// hrubování v prohozených osách X ↔ Z — díl karuselu je velký v X, nízký
// v Z, takže ↔ Čelně má jet po X vyladěným podélným algoritmem, nůž svisle
// ze smykadla. Fixture = díl uživatele `projekt_2026-11-03 (2)` bez uzávěru
// kontury po osách.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { swapGCodeText, swapsXZ, swapPointsIn, swapLimits, swapAxisWords } from '../js/calculators/cam/xzSwap.js';
import { createXzSimView } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases', 'carousel-face-swap-xz.camprog');
const load = () => JSON.parse(readFileSync(FIX, 'utf8'));

/** Řezné přímky G1 delší než 5 mm: kolik jich jede po X (vodorovně) a po Z. */
function cutDirections(gcode) {
  let cur = { x: 0, z: 0 }, h = 0, v = 0;
  for (const l of gcode.split('\n')) {
    const c = l.split(';')[0];
    const mx = c.match(/X(-?\d+\.?\d*)/), mz = c.match(/Z(-?\d+\.?\d*)/);
    const n = { x: mx ? +mx[1] : cur.x, z: mz ? +mz[1] : cur.z };
    if (/\bG0?1\b/.test(c) && Math.hypot(n.x - cur.x, n.z - cur.z) > 5) {
      if (Math.abs(n.z - cur.z) < 1e-3) h++; else if (Math.abs(n.x - cur.x) < 1e-3) v++;
    }
    cur = n;
  }
  return { h, v };
}

describe('prohození textu G-kódu', () => {
  it('X ↔ Z, G2 ↔ G3, v komentáři jen osa za předložkou, název nástroje beze změny; dvakrát = původní', () => {
    const t = 'N10 G2 X10.5 Z-3 CR=5.000 ; Výjezd v X\nN20 T="X12 nůž" D1\nN30 G03 X1 Z2 (pozn X9)';
    const s = swapGCodeText(t);
    expect(s).toBe('N10 G3 Z10.5 X-3 CR=5.000 ; Výjezd v Z\nN20 T="X12 nůž" D1\nN30 G02 Z1 X2 (pozn X9)');
    expect(swapGCodeText(s)).toBe(t);
  });

  it('průměrový zápis: skutečné X ×2, DIAMOF → DIAMON; reference kontury a hlavička hrubování', () => {
    expect(swapGCodeText('N1 G1 X5 Z20\nN2 DIAMOF ; Programování poloměru', { dia: true }))
      .toBe('N1 G1 Z5 X40.000\nN2 DIAMON ; Programování průměru');
    expect(swapGCodeText('; G1 X39 Z842')).toBe('; G1 Z39 X842');
    expect(swapGCodeText('; --- HRUBOVANI (PODELNE) ---')).toBe('; --- HRUBOVANI (CELNI, OSY X-Z PROHOZENE) ---');
    expect(swapGCodeText('; --- HRUBOVANI (PODELNE CIK CAK) ---')).toBe('; --- HRUBOVANI (CELNI CIK CAK, OSY X-Z PROHOZENE) ---');
  });

  it('řetěz bodů: prohozený a obrácený (typ úseku se posune s ním), průměr → poloměr', () => {
    const pts = [{ type: 'G0', x: 20, z: 0 }, { type: 'G1', x: 20, z: -10 }, { type: 'G2', x: 40, z: -20, r: 10 }];
    expect(swapPointsIn(pts, true).map(p => [p.type, p.x, p.z, p.r])).toEqual([
      ['G0', -20, 20, 0], ['G2', -10, 10, 10], ['G1', 0, 10, 0]]);
  });
});

describe('rozsahy 📐 a texty v prohozených osách', () => {
  it('rozsah X (poloměry) → rozsah Z\', rozsah Z (výška) → X\' min/max; čelisti a koník vypnuté', () => {
    const r = swapLimits(
      { rangeStart: 150, rangeEnd: 100, rangeActive: true, chuck: -5, chuckActive: true },
      { rangeXMin: null, rangeXMax: 500, active: true, minActive: false, maxActive: true });
    expect(r.zLimits).toMatchObject({ rangeActive: true, rangeStart: 500, rangeEnd: -1e4, chuckActive: false, tailActive: false });
    expect(r.xLimits).toMatchObject({ rangeXMin: 100, rangeXMax: 150, minActive: true, maxActive: true });
    const off = swapLimits({}, {});
    expect(off.zLimits.rangeActive).toBe(false);
    expect(off.xLimits.active).toBe(false);
  });

  it('osa v hlášce: jen za předložkou / „Rozsah"', () => {
    expect(swapAxisWords('Rozsah X max 150: od Z 12.00 stojí polotovar nad X max'))
      .toBe('Rozsah Z max 150: od X 12.00 stojí polotovar nad Z max');
    expect(swapAxisWords('X = PRŮMĚR, diametrální zápis')).toBe('X = PRŮMĚR, diametrální zápis');
  });

  it('díl uživatele s rozsahem X max 500: nic se neřeže za poloměrem 500', async () => {
    const p = load(); p.params.roughingStrategy = 'face'; p.params.carouselAlongX = true;
    p.xLimits = { rangeXMin: null, rangeXMax: 500, active: true, minActive: false, maxActive: true };
    const r = await runCamProg(p);
    const cut = r.calcSim.simPath.filter(q => q.type !== 'G0');
    expect(cut.length).toBeGreaterThan(50);
    expect(Math.max(...cut.map(q => q.x))).toBeLessThanOrEqual(500 + 1e-6);
    expect(r.errors.some(e => /rozsahy 📐 se zatím/.test(e.msg || ''))).toBe(false);
  }, 240000);
});

describe('karusel po X na dílu uživatele', () => {
  let on, off;
  beforeAll(async () => {
    const p1 = load(); p1.params.carouselAlongX = true; p1.params.roughingStrategy = 'face';
    on = await runCamProg(p1);
    const p2 = load(); p2.params.carouselAlongX = false; p2.params.roughingStrategy = 'face';
    off = await runCamProg(p2);
  }, 240000);

  it('zapnuto: program v prohozených osách, řezy jedou převážně po X', () => {
    expect(on.gcode).toMatch(/Karusel - hrubování po X v prohozených osách/);
    expect(on.gcode).toMatch(/HRUBOVANI \(CELNI, OSY X-Z PROHOZENE\)/);
    const d = cutDirections(on.gcode);
    expect(d.h).toBeGreaterThan(50);
    expect(d.h).toBeGreaterThan(10 * d.v);
    // Nic pod stůl (Z < 0) ani víc než 1 mm za střed.
    const xs = [...on.gcode.matchAll(/^N\d+ G0?[0-3]\b[^;]*?X(-?\d+\.?\d*)/gm)].map(m => +m[1]);
    const zs = [...on.gcode.matchAll(/^N\d+ G0?[0-3]\b[^;]*?Z(-?\d+\.?\d*)/gm)].map(m => +m[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1.001);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1e-3);
    // Dráha simulace je z reálného programu a body kontury v reálných osách.
    expect(on.calcSim.simPath.length).toBeGreaterThan(100);
    expect(Math.max(...on.calc.worldPoints.map(p => p.xReal))).toBeCloseTo(846, 3);
    expect(Math.max(...on.calc.worldPoints.map(p => p.zReal))).toBeCloseTo(189, 3);
    // Bezpečná poloha X150 Z5 leží v polotovaru → varování.
    expect(on.errors.some(e => /Bezpečná poloha/.test(e.msg || ''))).toBe(true);
  });

  it('simulace v prohozených osách (sim/xzSim.js): svislý držák, žádné falešné kolize', () => {
    const c = on.calcSim;
    const v = createXzSimView({ S: { params: on.params, simProgress: 1 }, toolMirrored: () => false });
    expect(v.active(c)).toBe(true);
    // Prohozená skutečná dráha = dráha parsovaná v prohozeném světě.
    const a = c._xz.calc.simPath;
    expect(a.length).toBe(c.simPath.length);
    for (let i = 0; i < a.length; i++) expect(Math.hypot(a[i].x - c.simPath[i].z, a[i].z - c.simPath[i].x)).toBeLessThan(1e-9);
    // Vodorovný držák soustruhu ve skutečném světě hlásí falešné kolize,
    // svislý v prohozeném žádné. Start v materiálu (Bp X150 Z5) zůstává.
    expect(validateToolpath(c.simPath, on.params, c.stockPathSegments, { planStock: true }).length).toBeGreaterThan(0);
    const r = v.validate(c);
    expect(r.issues).toEqual([]);
    expect(r.start).toMatchObject({ x: 150, z: 5 });
    // Úběr a zajetí do kontury se vrací ve skutečných osách: jediné zajetí
    // je závěrečný přejezd do Bp X150 skrz díl (svislý pruh kolem X150).
    expect(v.removal(c).model.loops.length).toBeGreaterThan(0);
    const cg = v.contourGouge(c) || [];
    for (const l of cg) for (const p of l) expect(Math.abs(p.x - 150)).toBeLessThan(6);
  });

  it('vypnuto: beze změny (žádné prohození)', () => {
    expect(off.gcode).not.toMatch(/prohozen/i);
  });

  it('přepínač platí jen na karuselu, výchozí zapnuto', () => {
    const p = load().params;
    // Výchozí zapnuto (klíč chybí); starý `carouselSwapXZ: false` se ignoruje.
    const q = { ...p }; delete q.carouselAlongX;
    expect(swapsXZ({ params: { ...q, carouselSwapXZ: false } })).toBe(true);
    expect(swapsXZ({ params: { ...p, carouselAlongX: false } })).toBe(false);
    expect(swapsXZ({ params: { ...q, machineStructure: 'lathe' } })).toBe(false);
    expect(swapsXZ({ params: { ...q, threadActive: true } })).toBe(false);
  });
});

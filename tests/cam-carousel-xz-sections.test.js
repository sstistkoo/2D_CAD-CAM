// Karusel po X (cam/sim/xzSections.js, 3. 11. 2026): „✂ Po úsecích", ➕ Operace
// a náhled úseků v prohozených osách. Plán úseků vzniká v prohozeném světě
// (úseky po skutečném X, dno = výška Z); do skutečného stavu se krok zapisuje
// jako rozsahy 📐, které swapLimits prohodí zpět.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { xzSectionSteps, sectionStepLimits, machinedFor, xzSectionView, noSections } from '../js/calculators/cam/sim/xzSections.js';
import { swapLimits } from '../js/calculators/cam/xzSwap.js';
import { machinedStockPoints } from '../js/calculators/cam/opParts.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8'));

describe('rozsahy kroku úseku', () => {
  const st = { id: 2, name: 'Úsek 2', zLo: 100, zHi: 300, xTo: 40 };
  const base = { z: { rangeActive: false, rangeStart: null, rangeEnd: null }, x: { rangeXMin: null, rangeXMax: null, active: false } };

  it('soustruh beze změny: pás = rozsah Z, dno = X min', () => {
    const L = sectionStepLimits({ params: { machineStructure: 'lathe' } }, st, base);
    expect(L.zLimits).toMatchObject({ rangeStart: 300, rangeEnd: 100, rangeActive: true });
    expect(L.xLimits).toMatchObject({ rangeXMin: 40, minActive: true, maxActive: false, active: true });
  });

  it('karusel po X: pás = rozsah X (poloměry), dno = Z od výšky; v prohozeném světě zpět pás Z\' a dno X\'', () => {
    const S = { params: { machineStructure: 'carousel' } };
    const L = sectionStepLimits(S, st, base);
    expect(L.xLimits).toMatchObject({ rangeXMin: 100, rangeXMax: 300, minActive: true, maxActive: true });
    expect(L.zLimits).toMatchObject({ rangeEnd: 40, rangeActive: true });
    const w = swapLimits(L.zLimits, L.xLimits);
    expect(w.zLimits).toMatchObject({ rangeStart: 300, rangeEnd: 100, rangeActive: true });
    expect(w.xLimits).toMatchObject({ rangeXMin: 40, minActive: true });
    // Strop Z uživatele zůstává, dno je vyšší z obou.
    const L2 = sectionStepLimits(S, st, { ...base, z: { rangeActive: true, rangeStart: 120, rangeEnd: 20 } });
    expect(L2.zLimits).toMatchObject({ rangeStart: 120, rangeEnd: 40 });
  });

  it('tlačítko ✂: na karuselu po X bez úseků jen ↕ Podélně', () => {
    const car = (s) => ({ params: { machineStructure: 'carousel', roughingStrategy: s } });
    expect(noSections(car('longitudinal'), 'longitudinal')).toBe(true);
    expect(noSections(car('face'), 'face')).toBe(false);
    expect(noSections(car('zigzag'), 'zigzag')).toBe(false);
    expect(noSections({ params: { machineStructure: 'lathe', roughingStrategy: 'face' } }, 'face')).toBe(true);
  });
});

describe('díl uživatele (Cik cak po X)', () => {
  let r, S;
  beforeAll(async () => {
    const p = load('carousel-zigzag-po-x.camprog'); p.opParts = [];
    r = await runCamProg(p);
    S = { params: r.params, zLimits: r.S.zLimits, xLimits: r.S.xLimits };
  }, 240000);

  it('úseky z prohozeného světa, náhled s prohozeným toScreen', () => {
    const st = xzSectionSteps(S, r.calcSim);
    expect(st.steps && st.steps.length).toBeGreaterThan(0);
    expect(r.calcSim.sectionPlan).toBeNull();   // skutečný calc plán nemá (soustruhový kód ho nečte)
    const v = xzSectionView(S, r.calcSim, (x, z) => ({ x, z }));
    expect(v.plan.sections.length).toBeGreaterThan(0);
    expect(v.toScreen(1, 2)).toEqual({ x: 2, z: 1 });
  });

  it('obrobený polotovar: skutečné body, od stolu (Z ≥ 0), v obrysu původního', () => {
    const m = machinedFor(S, r.calcSim);
    expect(m.points.length).toBeGreaterThan(3);
    const xs = m.points.map(p => p.x), zs = m.points.map(p => p.z);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-0.01);
    expect(Math.max(...zs)).toBeLessThanOrEqual(161.1);   // vrch odlitku
    expect(Math.max(...xs)).toBeLessThanOrEqual(428.5);   // obvod odlitku
  });

  it('podélný kus pod obrácenou vrstvou jede až po ní (zigzagReverse.js)', () => {
    // Do 4. 11. 2026 jel kus vrstvy X107 pod hrbem dřív než obrácené vrstvy
    // nad ním: G1 svisle do materiálu, tříska 8,9 mm při ap 2.
    const ps = r.calc._xz.calc.passes;
    const zr = (q) => (q.type === 'zigzag' ? q.moves.map(m => m.z) : [q.zStart, q.zEnd]);
    const bad = [];
    ps.forEach((p, i) => {
      if (p.type !== 'long') return;
      const [pl, ph] = [Math.min(...zr(p)), Math.max(...zr(p))];
      for (const q of ps.slice(i + 1)) {
        if (!q.reversedLayer) continue;
        const [l2, h2] = [Math.min(...zr(q)), Math.max(...zr(q))];
        if (q.moves[0].x > p.x + 1e-6 && pl < h2 && ph > l2) bad.push(`X${p.x.toFixed(2)} před X${q.moves[0].x.toFixed(2)}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it('bez prohození = machinedStockPoints jako dřív', () => {
    const L = { ...S, params: { ...S.params, carouselAlongX: false } };
    const calc = { stockPathSegments: r.calcSim.stockPathSegments, simPath: r.calcSim.simPath };
    const noId = (m) => ({ ...m, points: m.points.map(({ id, ...q }) => q) });   // eslint-disable-line no-unused-vars
    expect(noId(machinedFor(L, calc))).toEqual(noId(machinedStockPoints(L.params, calc.stockPathSegments, calc.simPath)));
  });
});

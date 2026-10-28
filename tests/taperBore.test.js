// Kužel v díře: kontrolní průměry (příklad z dílny – Ø211 H7, 1:300, sonda Supito)
import { describe, it, expect } from 'vitest';
import { computeTaperBore, taperC, isoTolerance, fmtDev } from '../js/calculators/taperBoreMath.js';

const base = {
  D: 211, L: 194, refDepth: 22.5, refSide: 'A', bigSide: 'A',
  C: taperC('ratio', 300),
  points: [{ depth: 13.1, side: 'AB' }, { depth: 11.4, side: 'AB' }],
};

describe('taperBoreMath', () => {
  it('ISO H7 pro Ø211 = +0.046/0', () => {
    expect(isoTolerance('H7', 211)).toEqual({ es: 0.046, ei: 0 });
    expect(fmtDev(0.046, 0)).toBe('+0.046/−0');
    expect(isoTolerance('xx', 211).error).toBeTruthy();
  });

  it('odpovídá hodnotám z programu (spodek 211.031 / 211.037, vrch 210.472 / 210.466)', () => {
    const r = computeTaperBore({ ...base, es: 0.046, ei: 0 });
    const get = (side, depth) => r.rows.find(x => x.side === side && x.depth === depth);
    expect(get('A', 13.1).nom).toBeCloseTo(211.031, 3);
    expect(get('A', 11.4).nom).toBeCloseTo(211.037, 3);
    expect(get('B', 13.1).nom).toBeCloseTo(210.472, 3);
    expect(get('B', 11.4).nom).toBeCloseTo(210.466, 3);
    expect(get('B', 13.1).max).toBeCloseTo(210.518, 3);
    expect(r.diffs.find(d => d.depth === 13.1).diff).toBeCloseTo(-0.559, 3);
    expect(r.diffs.find(d => d.depth === 11.4).diff).toBeCloseTo(-0.571, 3);
  });

  it('Ø(210.992) v hloubce 25 (pomocný rozměr z výkresu)', () => {
    const r = computeTaperBore({ ...base, points: [{ depth: 25, side: 'A' }] });
    expect(r.rows[0].nom).toBeCloseTo(210.992, 3);
  });

  it('prohození větší/menší strany a reference od druhé strany', () => {
    const r = computeTaperBore({ ...base, bigSide: 'B', refSide: 'B' });
    expect(r.rows.find(x => x.side === 'B' && x.depth === 13.1).nom).toBeCloseTo(211.031, 3);
    expect(r.endB).toBeGreaterThan(r.endA);
  });

  it('úhel ↔ poměr', () => {
    const half = Math.atan(1 / 600) * 180 / Math.PI;
    expect(taperC('half', half)).toBeCloseTo(1 / 300, 10);
    expect(taperC('full', 2 * half)).toBeCloseTo(1 / 300, 10);
  });

  it('chyby vstupu', () => {
    expect(computeTaperBore({ ...base, L: 0 }).error).toBeTruthy();
    expect(computeTaperBore({ ...base, refDepth: 300 }).error).toBeTruthy();
  });
});

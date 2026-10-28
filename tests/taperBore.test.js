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

import { solveTaper } from '../js/calculators/taperBoreMath.js';
describe('solveTaper – sjednocený kužel', () => {
  const n = null;
  it('D, d, L → C', () => {
    const r = solveTaper({ D: 40, d: 37, L: 60, C: n }, null, 'A');
    expect(r.C).toBeCloseTo(0.05, 10); expect(r.computed.has('C')).toBe(true);
  });
  it('D, L, C → d a d, L, C → D', () => {
    expect(solveTaper({ D: 40, d: n, L: 60, C: 0.05 }, null, 'A').d).toBeCloseTo(37, 10);
    expect(solveTaper({ D: n, d: 37, L: 60, C: 0.05 }, null, 'A').D).toBeCloseTo(40, 10);
    expect(solveTaper({ D: 40, d: 37, L: n, C: 0.05 }, null, 'A').L).toBeCloseTo(60, 10);
  });
  it('Ø211 v hl. 22.5 od spodu, 1:300, L 194 → hrany jako v programu', () => {
    const r = solveTaper({ D: n, d: n, L: 194, C: 1 / 300 }, { dia: 211, depth: 22.5, side: 'A' }, 'A');
    expect(r.D).toBeCloseTo(211.075, 3); expect(r.d).toBeCloseTo(210.428, 3);
  });
  it('Ø v hloubce + D + L → kuželovitost', () => {
    const r = solveTaper({ D: 211.075, d: n, L: 194, C: n }, { dia: 211, depth: 22.5, side: 'A' }, 'A');
    expect(1 / r.C).toBeCloseTo(300, 0);
  });
  it('chyby', () => {
    expect(solveTaper({ D: 37, d: 40, L: 60, C: n }, null, 'A').error).toBeTruthy();
    expect(solveTaper({ D: n, d: n, L: n, C: 0.05 }, { dia: 211, depth: 5, side: 'A' }, 'A').error).toBeTruthy();
  });
});

import { ratioToC } from '../js/calculators/taperBoreMath.js';
describe('ratioToC – libovolný poměr', () => {
  it('x, 1:x, a:b', () => {
    expect(ratioToC('300')).toBeCloseTo(1 / 300, 12);
    expect(ratioToC('1:300')).toBeCloseTo(1 / 300, 12);
    expect(ratioToC('7:24')).toBeCloseTo(7 / 24, 12);
    expect(ratioToC(' 1 : 20 ')).toBeCloseTo(0.05, 12);
    expect(ratioToC('3,5:100')).toBeCloseTo(0.035, 12);
  });
  it('chyby', () => {
    expect(ratioToC('')).toBeNaN();
    expect(ratioToC('7:0')).toBeNaN();
    expect(ratioToC('abc')).toBeNaN();
  });
});

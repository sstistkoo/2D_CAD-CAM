import { describe, it, expect } from 'vitest';
import { cornerFillet, cornerChamfer, pointAtAngle } from '../js/calculators/cornerMath.js';

const dist = (a, b) => Math.hypot(a.z - b.z, a.x - b.x);
/** Vzdálenost bodu od přímky A–B. */
function distLine(p, A, B) {
  const dz = B.z - A.z, dx = B.x - A.x;
  return Math.abs((p.z - A.z) * dx - (p.x - A.x) * dz) / Math.hypot(dz, dx);
}

describe('cornerFillet – zaoblení rohu', () => {
  it('pravý úhel (čelo → válec): t = R, střed v rohu posunutém o R', () => {
    // čelo nahoru (Z = 0), pak válec ke sklíčidlu (x = 20)
    const r = cornerFillet({ z: 0, x: 0 }, { z: 0, x: 20 }, { z: -30, x: 20 }, 2);
    expect(r.t).toBeCloseTo(2, 12);
    expect(r.T1).toEqual({ z: 0, x: 18 });
    expect(r.T2.z).toBeCloseTo(-2, 12);
    expect(r.O.z).toBeCloseTo(-2, 12);
    expect(r.O.x).toBeCloseTo(18, 12);
    expect(r.inner).toBeCloseTo(90, 12);
    expect(r.ccw).toBe(true);                       // nahoru, pak doleva = proti směru hodin
  });
  for (const [name, P1, C, P2] of [
    ['kužel 30° → válec', { z: 10, x: 5 }, { z: 0, x: 5 + 10 * Math.tan(Math.PI / 6) }, { z: -20, x: 5 + 10 * Math.tan(Math.PI / 6) }],
    ['válec → kužel (vnitřní úhel 150°)', { z: 20, x: 10 }, { z: 0, x: 10 }, { z: -10, x: 12 }],
    ['ostrý roh 60°', { z: 0, x: 0 }, { z: 10, x: 0 }, { z: 5, x: 5 * Math.sqrt(3) }],
  ]) {
    it(name + ': střed je ve vzdálenosti R od obou úseků, tečné body na nich', () => {
      const R = 1.5, r = cornerFillet(P1, C, P2, R);
      expect(distLine(r.O, P1, C)).toBeCloseTo(R, 9);
      expect(distLine(r.O, C, P2)).toBeCloseTo(R, 9);
      expect(dist(r.O, r.T1)).toBeCloseTo(R, 9);
      expect(dist(r.O, r.T2)).toBeCloseTo(R, 9);
      expect(distLine(r.T1, P1, C)).toBeCloseTo(0, 9);
      expect(distLine(r.T2, C, P2)).toBeCloseTo(0, 9);
      expect(dist(C, r.T1)).toBeCloseTo(r.t, 9);
    });
  }
  it('otočení doprava → po směru hodin', () => {
    expect(cornerFillet({ z: 0, x: 10 }, { z: 0, x: 0 }, { z: -5, x: 0 }, 1).ccw).toBe(false);
  });
  it('rádius se nevejde do krátkého úseku → fits = false', () => {
    const r = cornerFillet({ z: 0, x: 19 }, { z: 0, x: 20 }, { z: -30, x: 20 }, 2);
    expect(r.fits1).toBe(false);
    expect(r.fits2).toBe(true);
  });
  it('rovně nebo zpět → null', () => {
    expect(cornerFillet({ z: 0, x: 0 }, { z: 1, x: 0 }, { z: 2, x: 0 }, 1)).toBeNull();
    expect(cornerFillet({ z: 0, x: 0 }, { z: 1, x: 0 }, { z: 0, x: 0 }, 1)).toBeNull();
  });
});

describe('cornerChamfer – sražení rohu', () => {
  it('pravý úhel: c × 45°, délka c·√2', () => {
    const r = cornerChamfer({ z: 0, x: 0 }, { z: 0, x: 20 }, { z: -30, x: 20 }, 2);
    expect(r.A).toEqual({ z: 0, x: 18 });
    expect(r.B.z).toBeCloseTo(-2, 12);
    expect(r.width).toBeCloseTo(2 * Math.SQRT2, 12);
  });
});

describe('pointAtAngle', () => {
  it('0° = +Z, 90° = +X, 180° = −Z', () => {
    const C = { z: 1, x: 2 };
    expect(pointAtAngle(C, 0, 3)).toEqual({ z: 4, x: 2 });
    expect(pointAtAngle(C, 90, 3).x).toBeCloseTo(5, 12);
    expect(pointAtAngle(C, 180, 3).z).toBeCloseTo(-2, 12);
  });
});

import { describe, it, expect } from 'vitest';
import { lineCorrection, chamferPoints, arcCorrection } from '../js/calculators/noseRadiusMath.js';

// Střed rádiusu nože z teoretické špičky P (z, x = POLOMĚR): C = P − rε·q
const center = (P, r, internal) => ({ z: P.z + r, x: P.x - r * (internal ? 1 : -1) });
const rad = (p) => ({ z: p.z, x: p.d / 2 });

/** Vzdálenost bodu od přímky A–B (se znaménkem není potřeba). */
function distToLine(p, A, B) {
  const dz = B.z - A.z, dx = B.x - A.x, L = Math.hypot(dz, dx);
  return Math.abs((p.z - A.z) * dx - (p.x - A.x) * dz) / L;
}

describe('lineCorrection – sražení a kužel', () => {
  it('45° vnější: ΔZ = ΔX = −0,586·rε, chyba 0,414·rε (zůstane materiál)', () => {
    const c = lineCorrection(1, 45);
    expect(c.dz).toBeCloseTo(-(1 - Math.tan(Math.PI / 8)), 10);
    expect(c.dx).toBeCloseTo(-(1 - Math.tan(Math.PI / 8)), 10);
    expect(c.delta).toBeCloseTo(1 - Math.SQRT2, 10);
  });
  it('vzorce ΔZ = rε(1 − tan α/2), ΔX = rε(1 − tan(45° − α/2)) pro libovolné α', () => {
    for (const a of [10, 30, 60, 75]) {
      const c = lineCorrection(0.8, a), t = (d) => Math.tan(d * Math.PI / 180);
      expect(c.dz).toBeCloseTo(-0.8 * (1 - t(a / 2)), 10);
      expect(c.dx).toBeCloseTo(-0.8 * (1 - t(45 - a / 2)), 10);
    }
  });
  it('zpětný kužel: ΔZ = −rε(1 + tan α/2), podřízne', () => {
    const c = lineCorrection(0.4, 30, { reverse: true });
    expect(c.dz).toBeCloseTo(-0.4 * (1 + Math.tan(15 * Math.PI / 180)), 10);
    expect(c.delta).toBeGreaterThan(0);
  });
  it('vnitřní je zrcadlo vnějšího: ΔZ stejné, ΔX opačné', () => {
    const e = lineCorrection(1.2, 30), i = lineCorrection(1.2, 30, { internal: true });
    expect(i.dz).toBeCloseTo(e.dz, 12);
    expect(i.dx).toBeCloseTo(-e.dx, 12);
  });
  it('neplatné vstupy → null', () => {
    expect(lineCorrection(0.8, 0)).toBeNull();
    expect(lineCorrection(0.8, 90)).toBeNull();
    expect(lineCorrection(-1, 45)).toBeNull();
  });
});

describe('chamferPoints – nůž v programovaném bodě je tečný k obrysu', () => {
  for (const internal of [false, true]) {
    for (const a of [20, 45, 60]) {
      it((internal ? 'vnitřní' : 'vnější') + ' ' + a + '°', () => {
        const r = 0.8, cp = chamferPoints(r, a, 40, 2, 0, internal);
        const A = rad(cp.contour.a), B = rad(cp.contour.b);
        for (const P of [rad(cp.prog.a), rad(cp.prog.b)]) {
          expect(distToLine(center(P, r, internal), A, B)).toBeCloseTo(r, 9);
        }
      });
    }
  }
  it('sražení větší než poloměr → null', () => {
    expect(chamferPoints(0.8, 45, 10, 6)).toBeNull();
  });
});

describe('arcCorrection – rádius 90°', () => {
  for (const internal of [false, true]) {
    for (const concave of [false, true]) {
      it((internal ? 'vnitřní ' : 'vnější ') + (concave ? 'vydutý' : 'vypouklý') + ': nůž v P na dráze je tečný k obrysu', () => {
        const r = 0.8, R = 3, ac = arcCorrection(r, R, 50, -10, { internal, concave });
        expect(ac.Rp).toBeCloseTo(concave ? R - r : R + r, 12);
        const O = rad(ac.contour.center), Op = rad(ac.prog.center);
        const pts = [rad(ac.prog.face), rad(ac.prog.cyl)];
        // a bod uprostřed oblouku dráhy P
        const mid = { z: (pts[0].z + pts[1].z) / 2 - Op.z, x: (pts[0].x + pts[1].x) / 2 - Op.x };
        const k = ac.Rp / Math.hypot(mid.z, mid.x);
        pts.push({ z: Op.z + mid.z * k, x: Op.x + mid.x * k });
        for (const P of pts) {
          expect(Math.hypot(P.z - Op.z, P.x - Op.x)).toBeCloseTo(ac.Rp, 9);
          const C = center(P, r, internal);
          expect(Math.hypot(C.z - O.z, C.x - O.x)).toBeCloseTo(concave ? R - r : R + r, 9);
        }
      });
    }
  }
  it('vydutý rádius menší než rε → null', () => {
    expect(arcCorrection(1.2, 0.8, 30, 0, { concave: true })).toBeNull();
  });
});

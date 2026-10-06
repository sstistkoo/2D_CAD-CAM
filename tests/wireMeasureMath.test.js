import { describe, it, expect } from 'vitest';
import {
  THREAD_TYPES, bestWire, nearestWire, threadWireM, threadD2FromM,
  taperFromRollers, rollersForTaper, dovetailM, dovetailWidth,
} from '../js/calculators/wireMeasureMath.js';

describe('závit – tři drátky', () => {
  it('tabulkové tvary vzorce pro 60°, 55° a 30°', () => {
    expect(threadWireM(9.026, 1.5, 60, 0.866)).toBeCloseTo(9.026 + 3 * 0.866 - 0.866025 * 1.5, 5);
    expect(threadWireM(18, 4, 30, 2.05)).toBeCloseTo(18 + 4.8637 * 2.05 - 1.8660 * 4, 3);
    expect(threadWireM(20, 2.309, 55, 1.24)).toBeCloseTo(20 + 3.1657 * 1.24 - 0.9605 * 2.309, 3);
  });
  it('střední průměry: M10×1,5 → d2 = 9,026; Tr20×4 → 18', () => {
    const M = THREAD_TYPES.find(t => t.id === 'M'), Tr = THREAD_TYPES.find(t => t.id === 'Tr');
    expect(M.d2(10, 1.5)).toBeCloseTo(9.026, 3);
    expect(Tr.d2(20, 4)).toBe(18);
  });
  it('optimální drátek 60° = 0,57735·P, nejbližší ze sady', () => {
    expect(bestWire(1.5, 60)).toBeCloseTo(0.866025, 6);
    expect(nearestWire(0.866)).toBe(0.895);
  });
  it('obrácený výpočet d2 z M', () => {
    const M = threadWireM(9.026, 1.5, 60, 0.895);
    expect(threadD2FromM(M, 1.5, 60, 0.895)).toBeCloseTo(9.026, 10);
  });
});

describe('kužel přes válečky', () => {
  // Nezávislá kontrola: váleček leží na desce (střed ve výšce ρ) a je tečný k boku kužele
  function rollerTouchesFlank(M, y0, dBase, half, widening, dv) {
    const rho = dv / 2, rc = M / 2 - rho, zc = y0 + rho;
    const rAt = (z) => dBase / 2 + (widening ? 1 : -1) * z * Math.tan(half);
    return Math.abs(rc - rAt(zc)) * Math.cos(half);
  }
  for (const widening of [true, false]) {
    it((widening ? 'stojí na menším Ø' : 'stojí na větším Ø') + ': válečky na desce i na měrkách jsou tečné k boku', () => {
      const dBase = 30, alpha = 2 * Math.atan(1 / 10) * 180 / Math.PI, h = 25, dv = 10;   // kužel 1:5
      const { M1, M2 } = rollersForTaper(dBase, alpha, widening, h, dv);
      const half = alpha / 2 * Math.PI / 180;
      expect(rollerTouchesFlank(M1, 0, dBase, half, widening, dv)).toBeCloseTo(dv / 2, 9);
      expect(rollerTouchesFlank(M2, h, dBase, half, widening, dv)).toBeCloseTo(dv / 2, 9);
      const back = taperFromRollers(M1, M2, h, dv);
      expect(back.angle).toBeCloseTo(alpha, 9);
      expect(back.ratio).toBeCloseTo(5, 9);
      expect(back.dBase).toBeCloseTo(dBase, 9);
      expect(back.widening).toBe(widening);
    });
  }
  it('válec (M1 = M2) → úhel 0, Ø = M − 2·dv', () => {
    const r = taperFromRollers(50, 50, 20, 10);
    expect(r.angle).toBe(0);
    expect(r.dBase).toBeCloseTo(30, 12);
  });
});

describe('rybina přes válečky', () => {
  it('60°: M = B + 2,732·dv (vnější), X = A − 2,732·dv (vnitřní)', () => {
    expect(dovetailM(50, 60, 10)).toBeCloseTo(50 + 10 * (1 + Math.sqrt(3)), 10);
    expect(dovetailM(80, 60, 10, true)).toBeCloseTo(80 - 10 * (1 + Math.sqrt(3)), 10);
  });
  it('obrácený výpočet šířky', () => {
    for (const internal of [false, true]) {
      expect(dovetailWidth(dovetailM(64, 55, 8, internal), 55, 8, internal)).toBeCloseTo(64, 10);
    }
  });
});

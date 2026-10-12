import { describe, it, expect } from 'vitest';
import { sizeAtTemp, sizeAtRef, shrinkFit, gapChange, THERMAL_MATERIALS } from '../js/calculators/thermalMath.js';

describe('thermalMath', () => {
  it('ocel Ø1000 při +10 K: ΔL = 0,115 mm', () => {
    expect(sizeAtTemp(1000, 11.5, 30) - 1000).toBeCloseTo(0.115, 9);
  });
  it('sizeAtRef je inverzní k sizeAtTemp', () => {
    const warm = sizeAtTemp(250, 23, 55);
    expect(sizeAtRef(warm, 23, 55)).toBeCloseTo(250, 9);
  });
  it('při 20 °C se rozměr nemění', () => {
    expect(sizeAtTemp(123.456, 16.5, 20)).toBe(123.456);
  });
  it('shrinkFit: Ø100, přesah 0,08 + vůle 0,12, ocel → ΔT ≈ 174 K', () => {
    const r = shrinkFit({ d: 100, interference: 0.08, clearance: 0.12, alpha: 11.5 });
    expect(r.dT).toBeCloseTo(0.2 / (11.5e-6 * 100), 6);
    expect(r.heated).toBeCloseTo(20 + r.dT, 9);
    expect(r.cooled).toBeCloseTo(20 - r.dT, 9);
  });
  it('shrinkFit: neplatné vstupy → null', () => {
    expect(shrinkFit({ d: 0, interference: 0.1, alpha: 11 })).toBeNull();
    expect(shrinkFit({ d: 50, interference: -1, alpha: 11 })).toBeNull();
  });
  it('gapChange: hliníkové pouzdro na ocelové hřídeli, +50 K, Ø60 → vůle roste', () => {
    const g = gapChange({ d: 60, alphaHole: 23, alphaShaft: 11.5, T: 70 });
    expect(g).toBeCloseTo(60 * 11.5e-6 * 50, 9);
    expect(g).toBeGreaterThan(0);
  });
  it('tabulka materiálů: unikátní klíče, kladná α', () => {
    const keys = THERMAL_MATERIALS.map(m => m[0]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(THERMAL_MATERIALS.every(m => m[2] > 0)).toBe(true);
  });
});

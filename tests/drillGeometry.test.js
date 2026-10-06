import { describe, it, expect } from 'vitest';
import { DRILL_PRESETS, drillTipLength, drillDiameterAtDepth, drillLipLength } from '../js/calculators/drillGeometry.js';

describe('drillTipLength – délka špičky k průměru', () => {
  it('118° → L ≈ 0,3·D', () => {
    expect(drillTipLength(10, 118)).toBeCloseTo(3.0043, 4);
    expect(drillTipLength(20, 118) / 20).toBeCloseTo(0.30043, 5);
  });
  it('90° → L = D/2, 60° → L = D·√3/2, 120° → L = D/(2√3)', () => {
    expect(drillTipLength(10, 90)).toBeCloseTo(5, 10);
    expect(drillTipLength(10, 60)).toBeCloseTo(5 * Math.sqrt(3), 10);
    expect(drillTipLength(10, 120)).toBeCloseTo(5 / Math.sqrt(3), 10);
  });
  it('rovné čelo 180° → 0', () => {
    expect(drillTipLength(10, 180)).toBe(0);
  });
  it('neplatný vstup → NaN', () => {
    expect(drillTipLength(10, 0)).toBeNaN();
    expect(drillTipLength(10, 181)).toBeNaN();
    expect(drillTipLength(-1, 118)).toBeNaN();
    expect(drillTipLength(NaN, 118)).toBeNaN();
  });
});

describe('drillDiameterAtDepth – obrácený výpočet', () => {
  it('je inverzní k drillTipLength', () => {
    for (const a of [60, 90, 118, 135, 140]) {
      expect(drillDiameterAtDepth(drillTipLength(7.5, a), a)).toBeCloseTo(7.5, 10);
    }
  });
  it('180° nemá kužel → NaN', () => {
    expect(drillDiameterAtDepth(1, 180)).toBeNaN();
  });
});

describe('drillLipLength – délka hlavního břitu', () => {
  it('90° → D/(2·sin45°), 180° → D/2', () => {
    expect(drillLipLength(10, 90)).toBeCloseTo(5 * Math.SQRT2, 10);
    expect(drillLipLength(10, 180)).toBeCloseTo(5, 10);
  });
});

describe('DRILL_PRESETS', () => {
  it('všechny úhly v (0, 180] a ocel = 118°', () => {
    for (const p of DRILL_PRESETS) expect(p.angle > 0 && p.angle <= 180).toBe(true);
    expect(DRILL_PRESETS[0].angle).toBe(118);
  });
});

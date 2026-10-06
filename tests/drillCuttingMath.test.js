import { describe, it, expect } from 'vitest';
import { DRILL_CUT_MATERIALS, recommendedVc, recommendedFeed, drillCutting } from '../js/calculators/drillCuttingMath.js';

describe('drillCutting – řezné podmínky vrtání', () => {
  const r = drillCutting({ D: 10, vc: 25, f: 0.15, kc: 2000, sigma: 118, depth: 20, tipLen: 3.004, approach: 2 });
  it('n, vf', () => {
    expect(r.n).toBeCloseTo(25000 / (Math.PI * 10), 6);
    expect(r.vf).toBeCloseTo(0.15 * r.n, 9);
  });
  it('Pc = f·vc·D·kc/240000, Mc = f·D²·kc/8000 a Mc = Pc·30000/(π·n)', () => {
    expect(r.Pc).toBeCloseTo(0.3125, 10);
    expect(r.Mc).toBeCloseTo(3.75, 10);
    expect(r.Pc * 30000 / (Math.PI * r.n)).toBeCloseTo(r.Mc, 9);
  });
  it('Ff ≈ 0,5·kc·(D/2)·f·sin(σ/2)', () => {
    expect(r.Ff).toBeCloseTo(750 * Math.sin(59 * Math.PI / 180), 9);
  });
  it('dráha = nájezd + H + L (+ přejezd), čas = dráha / vf', () => {
    expect(r.path).toBeCloseTo(25.004, 9);
    expect(r.t).toBeCloseTo(25.004 / r.vf, 12);
    const thru = drillCutting({ D: 10, vc: 25, f: 0.15, kc: 2000, depth: 20, tipLen: 3, approach: 2, overrun: 1.5 });
    expect(thru.path).toBeCloseTo(26.5, 12);
  });
  it('bez hloubky není čas; neplatný vstup → null', () => {
    expect(drillCutting({ D: 10, vc: 25, f: 0.15, kc: 2000 }).t).toBeNull();
    expect(drillCutting({ D: 0, vc: 25, f: 0.15, kc: 2000 })).toBeNull();
    expect(drillCutting({ D: 10, vc: 25, f: -1, kc: 2000 })).toBeNull();
  });
});

describe('doporučené hodnoty', () => {
  const steel = DRILL_CUT_MATERIALS[0];
  it('HSS ocel: f ≈ tabulkové hodnoty (Ø3 ~0,08, Ø10 ~0,16, Ø40 ~0,37)', () => {
    expect(recommendedFeed(steel, 'hss', 3)).toBeCloseTo(0.077, 2);
    expect(recommendedFeed(steel, 'hss', 10)).toBeCloseTo(0.159, 2);
    expect(recommendedFeed(steel, 'hss', 40)).toBeCloseTo(0.366, 2);
  });
  it('SK má vyšší vc i f než HSS u všech materiálů', () => {
    for (const m of DRILL_CUT_MATERIALS) {
      expect(recommendedVc(m, 'sk')).toBeGreaterThan(recommendedVc(m, 'hss'));
      expect(recommendedFeed(m, 'sk', 10)).toBeGreaterThan(recommendedFeed(m, 'hss', 10));
    }
  });
});

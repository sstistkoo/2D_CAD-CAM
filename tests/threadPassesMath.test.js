import { describe, it, expect } from 'vitest';
import { autoPassCount, flankInfeedAngle, threadPasses } from '../js/calculators/threadPassesMath.js';
import { computeThreadPassCuts } from '../js/calculators/cam/threadHelpers.js';

const h = 0.6134 * 1.5;   // M10×1,5 vnější

describe('rozpis řezů závitu', () => {
  it('automatický počet = pravidlo CAM (M10×1,5 → 8), ne 38', () => {
    expect(autoPassCount(h)).toBe(computeThreadPassCuts(h, 0).length);
    expect(autoPassCount(h)).toBe(8);
    expect(autoPassCount(h, 'stainless')).toBe(10);
    expect(autoPassCount(h, 'aluminum')).toBe(6);
  });
  it('hloubky jsou stejné jako v CAM a součet přísuvů = h u všech metod', () => {
    const cam = computeThreadPassCuts(h, 8);
    for (const method of ['radial', 'flank', 'alt']) {
      const p = threadPasses(h, 8, { method });
      expect(p.map(r => r.depth)).toEqual(cam);
      expect(p.reduce((s, r) => s + r.cut, 0)).toBeCloseTo(h, 12);
    }
  });
  it('úhel bočního přísuvu α/2 − 0,5°', () => {
    expect(flankInfeedAngle(60)).toBe(29.5);
    expect(flankInfeedAngle(30)).toBe(14.5);
    expect(flankInfeedAngle(55)).toBe(27);
  });
  it('boční přísuv: posun Z ubývá o přísuv·tan β a poslední řez je na Z = 0', () => {
    const p = threadPasses(h, 8, { method: 'flank' }), tb = Math.tan(29.5 * Math.PI / 180);
    expect(p[7].z).toBe(0);
    for (let k = 1; k < p.length; k++) expect(p[k - 1].z - p[k].z).toBeCloseTo(p[k].cut * tb, 12);
  });
  it('střídavý: strany se střídají, velikost jako u bočního', () => {
    const f = threadPasses(h, 6, { method: 'flank' }), a = threadPasses(h, 6, { method: 'alt' });
    a.forEach((r, k) => {
      expect(Math.abs(r.z)).toBeCloseTo(f[k].z, 12);
      if (r.z !== 0) expect(Math.sign(r.z)).toBe(k % 2 === 0 ? -1 : 1);
    });
  });
  it('Ø pro program: vnější d − 2a (konec na d3), vnitřní D1 + 2a (konec na D)', () => {
    const ext = threadPasses(h, 8, { start: 10 });
    expect(ext[7].x).toBeCloseTo(10 - 2 * h, 12);
    const hInt = 0.5413 * 1.5, D1 = 10 - 1.0825 * 1.5;
    const int = threadPasses(hInt, 6, { start: D1, internal: true });
    expect(int[5].x).toBeCloseTo(10, 3);
    expect(threadPasses(h, 8)[0].x).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { rpmAt, limitDiameter, g96Time } from '../js/calculators/g96Math.js';

/** Numerická kontrola: součet dt = ds / (f·n(D)) po malých krocích. */
function numericTime({ vc, f, D1, D2, L = 0, nMax = Infinity }, steps = 200000) {
  const s = Math.hypot(L, (D1 - D2) / 2);
  let t = 0;
  for (let i = 0; i < steps; i++) {
    const D = D1 + (D2 - D1) * (i + 0.5) / steps;
    t += (s / steps) / (f * Math.min(1000 * vc / (Math.PI * D), nMax));
  }
  return t;
}

describe('g96Time – čas s konstantní vc', () => {
  it('čelení do osy bez omezení: t = π·D²/(4000·vc·f)', () => {
    const r = g96Time({ vc: 200, f: 0.2, D1: 100 });
    expect(r.t).toBeCloseTo(Math.PI * 100 * 100 / (4000 * 200 * 0.2), 10);
    expect(r.Dlim).toBe(0);
  });
  it('s omezením otáček sedí s numerickým součtem a mezní Ø = 1000·vc/(π·n max)', () => {
    const p = { vc: 200, f: 0.2, D1: 100, D2: 0, nMax: 2000 };
    const r = g96Time(p);
    expect(r.Dlim).toBeCloseTo(limitDiameter(200, 2000), 12);
    expect(r.Dlim).toBeCloseTo(31.831, 3);
    expect(r.t).toBeCloseTo(numericTime(p), 5);
    expect(r.tLimit).toBeGreaterThan(0);
  });
  it('kužel s osovou délkou L sedí s numerickým součtem', () => {
    const p = { vc: 150, f: 0.25, D1: 80, D2: 40, L: 60, nMax: 1000 };
    expect(g96Time(p).t).toBeCloseTo(numericTime(p), 5);
  });
  it('válec (D1 = D2): t = L / (f·n)', () => {
    const r = g96Time({ vc: 100, f: 0.1, D1: 50, D2: 50, L: 30 });
    expect(r.t).toBeCloseTo(30 / (0.1 * rpmAt(100, 50)), 10);
    expect(r.t).toBeCloseTo(r.t97, 12);
  });
  it('G96 je u čelení rychlejší než G97 se stálými otáčkami z velkého Ø', () => {
    const r = g96Time({ vc: 200, f: 0.2, D1: 100, D2: 20, nMax: 3000 });
    expect(r.t).toBeLessThan(r.t97);
    expect(r.nHi).toBeCloseTo(rpmAt(200, 100), 9);
  });
  it('skutečná vc na malém Ø klesne pod limitem otáček', () => {
    const r = g96Time({ vc: 200, f: 0.2, D1: 100, D2: 10, nMax: 2000 });
    expect(r.vcLo).toBeCloseTo(Math.PI * 10 * 2000 / 1000, 9);
  });
  it('neplatné vstupy → null', () => {
    expect(g96Time({ vc: 0, f: 0.2, D1: 100 })).toBeNull();
    expect(g96Time({ vc: 200, f: 0.2, D1: 50, D2: 50 })).toBeNull();      // nulová dráha
    expect(g96Time({ vc: 200, f: 0.2, D1: 100, nMax: -5 })).toBeNull();
  });
});

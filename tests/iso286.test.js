import { describe, it, expect } from 'vitest';
import { deviations, fit, itValue } from '../js/calculators/iso286.js';

const dev = (l, g, d) => { const r = deviations(l, g, d); return [r.upper, r.lower]; };

// Hodnoty z tabulek ISO 286-2 (µm)
describe('ISO 286 – hřídele', () => {
  it('Ø25: g6, f7, h6, js6, j6, k6, m6, n6, p6, r6, s6', () => {
    expect(dev('g', 6, 25)).toEqual([-7, -20]);
    expect(dev('f', 7, 25)).toEqual([-20, -41]);
    expect(dev('h', 6, 25)).toEqual([0, -13]);
    expect(dev('js', 6, 25)).toEqual([6.5, -6.5]);
    expect(dev('j', 6, 25)).toEqual([9, -4]);
    expect(dev('k', 6, 25)).toEqual([15, 2]);
    expect(dev('m', 6, 25)).toEqual([21, 8]);
    expect(dev('n', 6, 25)).toEqual([28, 15]);
    expect(dev('p', 6, 25)).toEqual([35, 22]);
    expect(dev('r', 6, 25)).toEqual([41, 28]);
    expect(dev('s', 6, 25)).toEqual([48, 35]);
  });
  it('podrozsahy: Ø60 r6, s6; Ø100 a11; Ø45 c11', () => {
    expect(dev('r', 6, 60)).toEqual([60, 41]);
    expect(dev('s', 6, 60)).toEqual([72, 53]);
    expect(dev('a', 11, 100)).toEqual([-380, -600]);
    expect(dev('c', 11, 45)).toEqual([-130, -290]);
  });
  it('k mimo IT4–IT7 má ei = 0 (Ø25 k8: +33/0)', () => {
    expect(dev('k', 8, 25)).toEqual([33, 0]);
  });
});

describe('ISO 286 – díry', () => {
  it('Ø25: H7, F7, G7, J7, K7, M7, N7, P7, R7, S7', () => {
    expect(dev('H', 7, 25)).toEqual([21, 0]);
    expect(dev('F', 7, 25)).toEqual([41, 20]);
    expect(dev('G', 7, 25)).toEqual([28, 7]);
    expect(dev('J', 7, 25)).toEqual([12, -9]);
    expect(dev('K', 7, 25)).toEqual([6, -15]);
    expect(dev('M', 7, 25)).toEqual([0, -21]);
    expect(dev('N', 7, 25)).toEqual([-7, -28]);
    expect(dev('P', 7, 25)).toEqual([-14, -35]);
    expect(dev('R', 7, 25)).toEqual([-20, -41]);
    expect(dev('S', 7, 25)).toEqual([-27, -48]);
  });
  it('Ø50: K6, N9, P8 (pravidla Δ jen do IT8 / IT7)', () => {
    expect(dev('K', 6, 50)).toEqual([3, -13]);
    expect(dev('N', 9, 50)).toEqual([0, -62]);
    expect(dev('P', 8, 50)).toEqual([-26, -65]);
  });
  it('do 3 mm bez Δ: K7 0/−10, M7 −2/−12, N7 −4/−14, P7 −6/−16', () => {
    expect(dev('K', 7, 2)).toEqual([0, -10]);
    expect(dev('M', 7, 2)).toEqual([-2, -12]);
    expect(dev('N', 7, 2)).toEqual([-4, -14]);
    expect(dev('P', 7, 2)).toEqual([-6, -16]);
  });
  it('výjimka M6 pro 250–315 mm: −9/−41 (ne −11/−43)', () => {
    expect(dev('M', 6, 260)).toEqual([-9, -41]);
    expect(dev('M', 6, 315)).toEqual([-9, -41]);
    expect(dev('M', 6, 320)).toEqual([-10, -46]);
  });
  it('js7–js11 s lichou IT: ±IT/2 + poznámka se starším zaokrouhlením', () => {
    const r = deviations('js', 7, 25);
    expect([r.upper, r.lower]).toEqual([10.5, -10.5]);
    expect(r.note).toMatch(/±10 µm/);
    expect(deviations('js', 6, 25).note).toBeUndefined();
  });
  it('a, b, A, B se do 1 mm nepoužívají', () => {
    expect(deviations('a', 11, 0.8).error).toBeTruthy();
    expect(deviations('B', 11, 1).error).toBeTruthy();
    expect(deviations('c', 11, 0.8).error).toBeUndefined();
  });
  it('nedefinované j/J stupně vrátí chybu', () => {
    expect(deviations('j', 9, 25).error).toBeTruthy();
    expect(deviations('J', 5, 25).error).toBeTruthy();
  });
});

describe('ISO 286 – uložení', () => {
  it('Ø25 H7/g6 vůle 7–41, H7/p6 přesah, H7/k6 přechodné', () => {
    const a = fit('H', 7, 'g', 6, 25);
    expect(a.type).toBe('vůle');
    expect([a.minClearance, a.maxClearance]).toEqual([7, 41]);
    const b = fit('H', 7, 'p', 6, 25);
    expect(b.type).toBe('přesah');
    expect([b.maxClearance, b.minClearance]).toEqual([-1, -35]);
    expect(fit('H', 7, 'k', 6, 25).type).toBe('přechodné');
  });
  it('rozsahy a hranice: 0,5 mm i přesně 30 mm (patří do 18–30)', () => {
    expect(itValue(0.5, 7)).toBe(10);
    expect(itValue(30, 7)).toBe(21);
    expect(itValue(30.01, 7)).toBe(25);
    expect(deviations('H', 7, 600).error).toBeTruthy();
  });
});

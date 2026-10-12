import { describe, it, expect } from 'vitest';
import { solveTriangle } from '../js/triangleSolver.js';

const near = (x, y, d = 1e-6) => expect(Math.abs(x - y)).toBeLessThan(d);
const one = (k) => { const r = solveTriangle(k); expect(r.ok).toBe(true); expect(r.solutions).toHaveLength(1); return r.solutions[0]; };

describe('solveTriangle', () => {
  it('SSS 3-4-5: pravý úhel, plocha 6, obvod 12', () => {
    const t = one({ a: 3, b: 4, c: 5 });
    near(t.gamma, 90); near(t.alpha, 36.8698976, 1e-6); near(t.beta, 53.1301024, 1e-6);
    near(t.area, 6); near(t.perimeter, 12); near(t.inR, 1); near(t.circumR, 2.5);
    near(t.hc, 2.4); near(t.ha, 4); near(t.hb, 3);
  });
  it('SAS: a=3, b=4, γ=90 → c=5', () => {
    const t = one({ a: 3, b: 4, gamma: 90 });
    near(t.c, 5); near(t.alpha + t.beta, 90);
  });
  it('SAS: úhel mezi stranami b a c (α), neznámá strana a', () => {
    const t = one({ b: 7, c: 9, alpha: 60 });
    near(t.a, Math.sqrt(49 + 81 - 2 * 63 * 0.5), 1e-9);
    near(t.alpha + t.beta + t.gamma, 180);
  });
  it('ASA: c=10, α=40, β=60 → γ=80, sinová věta', () => {
    const t = one({ c: 10, alpha: 40, beta: 60 });
    near(t.gamma, 80);
    near(t.a, 10 * Math.sin(40 * Math.PI / 180) / Math.sin(80 * Math.PI / 180), 1e-9);
    near(t.b, 10 * Math.sin(60 * Math.PI / 180) / Math.sin(80 * Math.PI / 180), 1e-9);
  });
  it('AAS: a=5, α=30, γ=45 → β=105', () => {
    const t = one({ a: 5, alpha: 30, gamma: 45 });
    near(t.beta, 105);
    near(t.c, 5 * Math.sin(Math.PI / 4) / Math.sin(Math.PI / 6), 1e-9);
  });
  it('SSA se dvěma řešeními: a=6, b=8, α=30 → β=41,81° nebo 138,19°', () => {
    const r = solveTriangle({ a: 6, b: 8, alpha: 30 });
    expect(r.ok).toBe(true); expect(r.solutions).toHaveLength(2);
    const [s1, s2] = r.solutions;
    near(s1.beta, 41.8103149, 1e-6); near(s2.beta, 180 - 41.8103149, 1e-6);
    for (const s of r.solutions) { near(s.alpha + s.beta + s.gamma, 180); near(s.a, 6); near(s.b, 8); }
    expect(s1.c).not.toBeCloseTo(s2.c, 3);
  });
  it('SSA s jedním řešením (strana proti úhlu je delší): a=10, b=6, α=40', () => {
    const r = solveTriangle({ a: 10, b: 6, alpha: 40 });
    expect(r.ok).toBe(true); expect(r.solutions).toHaveLength(1);
    near(r.solutions[0].beta, Math.asin(6 * Math.sin(40 * Math.PI / 180) / 10) * 180 / Math.PI, 1e-6);
  });
  it('SSA bez řešení a se dotykem (pravý úhel)', () => {
    expect(solveTriangle({ a: 2, b: 8, alpha: 30 }).ok).toBe(false);           // 8·sin30 = 4 > 2
    const t = solveTriangle({ a: 4, b: 8, alpha: 30 });                        // právě 4 → β = 90°
    expect(t.ok).toBe(true); expect(t.solutions).toHaveLength(1); near(t.solutions[0].beta, 90);
  });
  it('trojúhelníková nerovnost a součet úhlů', () => {
    expect(solveTriangle({ a: 1, b: 2, c: 5 }).ok).toBe(false);
    expect(solveTriangle({ a: 5, alpha: 100, beta: 90 }).ok).toBe(false);
    expect(solveTriangle({ alpha: 60, beta: 60, gamma: 60 }).ok).toBe(false);   // žádná strana
  });
  it('přeurčené zadání: shodné projde, rozporné ne', () => {
    expect(solveTriangle({ a: 3, b: 4, c: 5, gamma: 90 }).ok).toBe(true);
    expect(solveTriangle({ a: 3, b: 4, c: 5, gamma: 80 }).ok).toBe(false);
  });
  it('málo nebo neplatné hodnoty', () => {
    expect(solveTriangle({ a: 3, b: 4 }).ok).toBe(false);
    expect(solveTriangle({ a: -3, b: 4, c: 5 }).ok).toBe(false);
    expect(solveTriangle({ a: 3, b: 4, gamma: 180 }).ok).toBe(false);
  });
  it('pravoúhlý případ souhlasí s řešičem pravoúhlého (a=3, α z tabulky)', () => {
    const t = one({ a: 3, alpha: 36.8698976458, gamma: 90 });
    near(t.b, 4, 1e-6); near(t.c, 5, 1e-6);
  });
});

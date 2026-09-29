import { describe, it, expect } from 'vitest';
import { solveRightTriangle } from '../js/trigSolver.js';

const near = (x, y, d = 1e-6) => expect(Math.abs(x - y)).toBeLessThan(d);

describe('solveRightTriangle', () => {
  it('a + b → 3-4-5', () => {
    const r = solveRightTriangle({ a: 3, b: 4 });
    expect(r.ok).toBe(true);
    near(r.c, 5); near(r.alpha, 36.8698976, 1e-6); near(r.alpha + r.beta, 90);
  });
  it('a + c, b + c', () => {
    near(solveRightTriangle({ a: 3, c: 5 }).b, 4);
    near(solveRightTriangle({ b: 4, c: 5 }).a, 3);
  });
  it('strana + úhel (α i β, každá strana)', () => {
    for (const k of [{ a: 3 }, { b: 4 }, { c: 5 }]) {
      const r1 = solveRightTriangle({ ...k, alpha: 36.8698976458 });
      const r2 = solveRightTriangle({ ...k, beta: 53.1301023542 });
      for (const r of [r1, r2]) { near(r.a, 3, 1e-6); near(r.b, 4, 1e-6); near(r.c, 5, 1e-6); }
    }
  });
  it('konzistentní 3 hodnoty projdou, rozporné ne', () => {
    expect(solveRightTriangle({ a: 3, b: 4, c: 5 }).ok).toBe(true);
    expect(solveRightTriangle({ a: 3, b: 4, c: 6 }).ok).toBe(false);
    expect(solveRightTriangle({ a: 3, b: 4, alpha: 45 }).ok).toBe(false);
    expect(solveRightTriangle({ a: 3, alpha: 30, beta: 50 }).ok).toBe(false);
  });
  it('chybná zadání hlásí chybu', () => {
    expect(solveRightTriangle({ a: 3 }).ok).toBe(false);
    expect(solveRightTriangle({ alpha: 30, beta: 60 }).ok).toBe(false);
    expect(solveRightTriangle({ a: 5, c: 3 }).ok).toBe(false);
    expect(solveRightTriangle({ a: 5, c: 5 }).ok).toBe(false);
    expect(solveRightTriangle({ a: 3, alpha: 90 }).ok).toBe(false);
    expect(solveRightTriangle({ a: 0, b: 4 }).ok).toBe(false);
    expect(solveRightTriangle({ a: -3, b: 4 }).ok).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { arcFromTwo, arcLargeVariant, arcFrom3Points, arcFromEndsRadius } from '../js/calculators/arcMath.js';

describe('arcFromTwo – tětiva / výška / rádius', () => {
  it('c + h → R (půlkruh: c = 2R, h = R)', () => {
    const r = arcFromTwo({ c: 20, h: 10 });
    expect(r.R).toBeCloseTo(10, 10);
    expect(r.angle).toBeCloseTo(180, 8);
    expect(r.length).toBeCloseTo(Math.PI * 10, 8);
  });
  it('c + h → R známého oblouku (c=48, h=18 → R=25)', () => {
    expect(arcFromTwo({ c: 48, h: 18 }).R).toBeCloseTo(25, 10);
  });
  it('c + R → h a zpět dává totéž', () => {
    const a = arcFromTwo({ c: 48, R: 25 });
    expect(a.h).toBeCloseTo(25 - 7, 10);                           // menší oblouk: h = R − √(R² − c²/4)
    expect(arcFromTwo({ c: a.c, h: a.h }).R).toBeCloseTo(25, 10);
  });
  it('R + h → c', () => {
    expect(arcFromTwo({ R: 25, h: 18 }).c).toBeCloseTo(48, 10);
  });
  it('h > R = oblouk přes půlkruh (úhel nad 180°)', () => {
    const r = arcFromTwo({ c: 48, h: 32 });
    expect(r.R).toBeCloseTo(25, 10);
    expect(r.angle).toBeGreaterThan(180);
  });
  it('arcLargeVariant: h′ = 2R − h', () => {
    const small = arcFromTwo({ c: 48, R: 25 });
    const large = arcLargeVariant(small);
    expect(small.h + large.h).toBeCloseTo(50, 10);
    expect(small.angle + large.angle).toBeCloseTo(360, 8);
  });
  it('nemožné vstupy → null', () => {
    expect(arcFromTwo({ c: 60, R: 25 })).toBeNull();               // tětiva delší než průměr
    expect(arcFromTwo({ c: 10 })).toBeNull();
    expect(arcFromTwo({ c: -1, h: 2 })).toBeNull();
  });
});

describe('arcFrom3Points', () => {
  it('čtvrtkružnice R10 kolem počátku, proti hodinám', () => {
    const r = arcFrom3Points({ z: 10, x: 0 }, { z: Math.SQRT1_2 * 10, x: Math.SQRT1_2 * 10 }, { z: 0, x: 10 });
    expect(r.O.z).toBeCloseTo(0, 9); expect(r.O.x).toBeCloseTo(0, 9);
    expect(r.R).toBeCloseTo(10, 9);
    expect(r.ccw).toBe(true);
    expect(r.sweep).toBeCloseTo(90, 8);
    expect(r.length).toBeCloseTo(Math.PI * 5, 8);
  });
  it('po směru hodin a oblouk přes 180° (střední bod na druhé straně)', () => {
    const r = arcFrom3Points({ z: 10, x: 0 }, { z: -10, x: 0 }, { z: 0, x: 10 });
    expect(r.ccw).toBe(false);                                      // 0° → 180° → 90° = po směru hodin
    expect(r.sweep).toBeCloseTo(270, 8);
  });
  it('body na přímce → null', () => {
    expect(arcFrom3Points({ z: 0, x: 0 }, { z: 1, x: 1 }, { z: 2, x: 2 })).toBeNull();
  });
  it('střed je stejně daleko od všech tří bodů (libovolné body)', () => {
    const P = [{ z: 3, x: 1 }, { z: 7, x: 6 }, { z: 12, x: 2 }];
    const r = arcFrom3Points(...P);
    for (const p of P) expect(Math.hypot(p.z - r.O.z, p.x - r.O.x)).toBeCloseTo(r.R, 9);
  });
});

describe('arcFromEndsRadius', () => {
  const S = { z: 10, x: 0 }, E = { z: 0, x: 10 };
  it('krátký oblouk proti hodinám: střed v počátku, I = −10, K = −10', () => {
    const r = arcFromEndsRadius(S, E, 10, true, false);
    expect(r.O.z).toBeCloseTo(0, 9); expect(r.O.x).toBeCloseTo(0, 9);
    expect(r.K).toBeCloseTo(-10, 9); expect(r.I).toBeCloseTo(0, 9);
    expect(r.sweep).toBeCloseTo(90, 8);
  });
  it('po hodinách krátký oblouk: střed na druhé straně tětivy, 90°', () => {
    const r = arcFromEndsRadius(S, E, 10, false, false);
    expect(r.O.z).toBeCloseTo(10, 9); expect(r.O.x).toBeCloseTo(10, 9);
    expect(r.sweep).toBeCloseTo(90, 8);
  });
  it('velký oblouk: stejný střed jako krátký opačného smyslu, 270°', () => {
    const r = arcFromEndsRadius(S, E, 10, true, true);
    expect(r.O.z).toBeCloseTo(10, 9); expect(r.O.x).toBeCloseTo(10, 9);
    expect(r.sweep).toBeCloseTo(270, 8);
  });
  it('střed je vždy ve vzdálenosti R od startu i konce', () => {
    for (const ccw of [true, false]) for (const large of [true, false]) {
      const r = arcFromEndsRadius({ z: 3, x: 2 }, { z: 11, x: 9 }, 9, ccw, large);
      expect(Math.hypot(r.O.z - 3, r.O.x - 2)).toBeCloseTo(9, 9);
      expect(Math.hypot(r.O.z - 11, r.O.x - 9)).toBeCloseTo(9, 9);
      expect(r.sweep > 180).toBe(large);
    }
  });
  it('R menší než polovina tětivy → null', () => {
    expect(arcFromEndsRadius(S, E, 5, true, false)).toBeNull();
    expect(arcFromEndsRadius(S, S, 5, true, false)).toBeNull();
  });
});

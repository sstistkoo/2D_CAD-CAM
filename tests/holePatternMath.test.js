import { describe, it, expect } from 'vitest';
import { rowHoles, gridHoles } from '../js/calculators/holePatternMath.js';

describe('rowHoles', () => {
  it('rozteč + úhel: 4 díry po 25 od (10, 5) vodorovně', () => {
    const r = rowHoles({ count: 4, x0: 10, y0: 5, pitch: 25 });
    expect(r.holes.map(h => h.x)).toEqual([10, 35, 60, 85]);
    expect(r.holes.every(h => h.y === 5)).toBe(true);
    expect(r.length).toBe(75);
  });
  it('úhel 90° jde nahoru, 45° po diagonále', () => {
    const v = rowHoles({ count: 3, pitch: 10, angle: 90 });
    expect(v.holes[2].x).toBeCloseTo(0, 9); expect(v.holes[2].y).toBeCloseTo(20, 9);
    const d = rowHoles({ count: 2, pitch: 10, angle: 45 });
    expect(d.holes[1].x).toBeCloseTo(7.0710678, 6); expect(d.holes[1].y).toBeCloseTo(7.0710678, 6);
  });
  it('koncový bod: 5 děr rovnoměrně z (0,0) do (80,60) → rozteč 25, úhel 36,87°', () => {
    const r = rowHoles({ count: 5, x0: 0, y0: 0, x1: 80, y1: 60 });
    expect(r.pitch).toBeCloseTo(25, 9); expect(r.angle).toBeCloseTo(36.8698976, 6);
    expect(r.holes[4].x).toBeCloseTo(80, 9); expect(r.holes[4].y).toBeCloseTo(60, 9);
    expect(r.holes[2].x).toBeCloseTo(40, 9);
  });
  it('jedna díra; neplatné vstupy → null', () => {
    expect(rowHoles({ count: 1, pitch: 5 }).holes).toHaveLength(1);
    expect(rowHoles({ count: 0, pitch: 5 })).toBeNull();
    expect(rowHoles({ count: 3 })).toBeNull();
    expect(rowHoles({ count: 3, pitch: -1 })).toBeNull();
    expect(rowHoles({ count: 1, x1: 5, y1: 5 })).toBeNull();        // koncový bod potřebuje ≥ 2 díry
    expect(rowHoles({ count: 3, x0: 5, y0: 5, x1: 5, y1: 5 })).toBeNull();
  });
});

describe('gridHoles', () => {
  it('3 × 2, rozteč 20 × 30: po řádcích', () => {
    const g = gridHoles({ nx: 3, ny: 2, px: 20, py: 30, x0: 5, y0: 5 });
    expect(g.holes.map(h => [h.x, h.y])).toEqual([[5, 5], [25, 5], [45, 5], [5, 35], [25, 35], [45, 35]]);
    expect(g.width).toBe(40); expect(g.height).toBe(30);
    expect(g.holes.map(h => h.i)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('meandr: každý druhý řádek zprava, čísla sloupců se obrací', () => {
    const g = gridHoles({ nx: 3, ny: 3, px: 10, py: 10, meander: true });
    expect(g.holes.map(h => h.col)).toEqual([1, 2, 3, 3, 2, 1, 1, 2, 3]);
    expect(g.holes[3].x).toBe(20); expect(g.holes[3].y).toBe(10);
    // sousední díry v pořadí jsou vždy o jednu rozteč (žádný skok přes řádek)
    for (let i = 1; i < g.holes.length; i++) {
      const d = Math.hypot(g.holes[i].x - g.holes[i - 1].x, g.holes[i].y - g.holes[i - 1].y);
      expect(d).toBeCloseTo(10, 9);
    }
  });
  it('natočení o 90° kolem počátku: (20,0) → (0,20), (0,30) → (−30,0)', () => {
    const g = gridHoles({ nx: 2, ny: 2, px: 20, py: 30, angle: 90 });
    const [h1, h2, h3] = g.holes;
    expect(h1.x).toBeCloseTo(0, 9);
    expect(h2.x).toBeCloseTo(0, 9); expect(h2.y).toBeCloseTo(20, 9);
    expect(h3.x).toBeCloseTo(-30, 9); expect(h3.y).toBeCloseTo(0, 9);
  });
  it('sloupec (nx = 1) nepotřebuje px; neplatné vstupy → null', () => {
    expect(gridHoles({ nx: 1, ny: 3, py: 10 }).holes.map(h => h.y)).toEqual([0, 10, 20]);
    expect(gridHoles({ nx: 2, ny: 2, px: 0, py: 5 })).toBeNull();
    expect(gridHoles({ nx: 0, ny: 2, px: 5, py: 5 })).toBeNull();
    expect(gridHoles({ nx: 2.5, ny: 2, px: 5, py: 5 })).toBeNull();
  });
});

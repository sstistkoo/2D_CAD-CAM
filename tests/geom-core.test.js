// ╔══════════════════════════════════════════════════════════════╗
// ║  geomCore – adaptér nad Clipper2 (boolean, offset, sweep)     ║
// ╚══════════════════════════════════════════════════════════════╝
import { describe, it, expect } from 'vitest';
import {
  polyUnion, polyDifference, polyIntersect, polyOffset,
  polyArea, pointInLoop, polySimplify, toolSweep, StockModel,
} from '../js/geom/geomCore.js';

// Obdélník v CAM konvenci {x = radiálně, z = axiálně}
const rect = (z1, x1, z2, x2) => [
  { x: x1, z: z1 }, { x: x1, z: z2 }, { x: x2, z: z2 }, { x: x2, z: z1 },
];

describe('geomCore – booleovské operace', () => {
  it('union dvou překrývajících se obdélníků má správnou plochu', () => {
    const a = rect(0, 0, 10, 10);   // 100 mm²
    const b = rect(5, 5, 15, 15);   // 100 mm², překryv 25
    const u = polyUnion([a], [b]);
    expect(u.length).toBe(1);
    expect(Math.abs(polyArea(u))).toBeCloseTo(175, 6);
  });

  it('difference odečte projetou oblast od polotovaru', () => {
    const stock = rect(0, 0, 20, 10);      // 200 mm²
    const cutArea = rect(0, 5, 20, 12);    // horní pás 5..10 → −100
    const rest = polyDifference([stock], [cutArea]);
    expect(Math.abs(polyArea(rest))).toBeCloseTo(100, 6);
  });

  it('intersect detekuje kolizi (držák × polotovar)', () => {
    const stock = rect(0, 0, 20, 10);
    const holderOut = rect(25, 0, 30, 10);   // mimo — bez průniku
    const holderIn = rect(18, 8, 30, 12);    // roh v materiálu
    expect(polyIntersect([stock], [holderOut]).length).toBe(0);
    const hit = polyIntersect([stock], [holderIn]);
    expect(hit.length).toBe(1);
    expect(Math.abs(polyArea(hit))).toBeCloseTo(2 * 2, 6);
  });

  it('zachovává CAM konvenci {x,z} (x radiálně, z axiálně)', () => {
    const a = rect(0, 0, 10, 10);
    const u = polyUnion([a]);
    for (const p of u[0]) {
      expect(p).toHaveProperty('x');
      expect(p).toHaveProperty('z');
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});

describe('geomCore – offset a analýza', () => {
  it('kladný offset zvětší plochu, záporný zmenší', () => {
    const a = [rect(0, 0, 10, 10)];
    const grown = polyOffset(a, 1, 'miter');
    const shrunk = polyOffset(a, -1, 'miter');
    expect(Math.abs(polyArea(grown))).toBeCloseTo(144, 4);
    expect(Math.abs(polyArea(shrunk))).toBeCloseTo(64, 4);
  });

  it('round offset ~ rádius špičky (rohy zaoblené)', () => {
    const a = [rect(0, 0, 10, 10)];
    const grown = polyOffset(a, 0.8, 'round');
    // plocha = 100 + obvod·r + π·r² (kruhové rohy)
    const expected = 100 + 40 * 0.8 + Math.PI * 0.8 * 0.8;
    expect(Math.abs(polyArea(grown))).toBeCloseTo(expected, 1);
  });

  it('pointInLoop rozliší uvnitř/venku/na hraně', () => {
    const a = rect(0, 0, 10, 10);
    expect(pointInLoop({ x: 5, z: 5 }, a)).toBe('inside');
    expect(pointInLoop({ x: 15, z: 5 }, a)).toBe('outside');
    expect(pointInLoop({ x: 0, z: 5 }, a)).toBe('on');
  });

  it('polySimplify sníží počet bodů kolineární smyčky', () => {
    const dense = [];
    for (let z = 0; z <= 10; z += 0.5) dense.push({ x: 0, z });
    dense.push({ x: 10, z: 10 }, { x: 10, z: 0 });
    const simp = polySimplify([dense], 0.01);
    expect(simp[0].length).toBeLessThan(dense.length);
    expect(Math.abs(polyArea(simp))).toBeCloseTo(100, 4);
  });
});

describe('geomCore – stopa nástroje a StockModel', () => {
  it('toolSweep pokryje dráhu obrysem nástroje', () => {
    // nástroj 2×2 mm kolem špičky, dráha L: 10 mm v Z + 5 mm v X
    const tool = rect(-1, -1, 1, 1);
    const path = [{ x: 0, z: 0 }, { x: 0, z: 10 }, { x: 5, z: 10 }];
    const swept = toolSweep(tool, path);
    expect(swept.length).toBe(1);
    expect(Math.abs(polyArea(swept))).toBeCloseTo(34, 4);
  });

  it('StockModel.cut postupně odebírá materiál až do prázdna', () => {
    const stock = new StockModel([rect(0, 0, 20, 10)]);
    expect(stock.area()).toBeCloseTo(200, 6);
    stock.cut([rect(0, 5, 20, 12)]);
    expect(Math.abs(stock.area())).toBeCloseTo(100, 6);
    expect(stock.isEmpty()).toBe(false);
    stock.cut([rect(-1, -1, 21, 6)]);
    expect(stock.isEmpty()).toBe(true);
  });

  it('StockModel.collide vrací průnik a clone je nezávislý', () => {
    const stock = new StockModel([rect(0, 0, 20, 10)]);
    const copy = stock.clone();
    copy.cut([rect(0, 0, 20, 12)]);
    expect(copy.isEmpty()).toBe(true);
    expect(stock.isEmpty()).toBe(false);
    expect(stock.collide([rect(18, 8, 30, 12)]).length).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { angleOnArc, objectExtremes, supportsExtremes } from '../js/geometry/extremePoints.js';

const D = Math.PI / 180;

describe('krajní body objektů', () => {
  it('úhel na oblouku CCW i CW, přes nulu', () => {
    expect(angleOnArc(0, -30 * D, 30 * D, true)).toBe(true);
    expect(angleOnArc(Math.PI, -30 * D, 30 * D, true)).toBe(false);
    expect(angleOnArc(Math.PI, -30 * D, 30 * D, false)).toBe(true);
    expect(angleOnArc(0, -30 * D, 30 * D, false)).toBe(false);
  });

  it('R5 tečně na šikmou úsečku: krajní bod vpravo je kvadrant, ne konec oblouku', () => {
    // střed (100,20), od 10° dolů (CW) do -90°
    const arc = { type: 'arc', cx: 100, cy: 20, r: 5, startAngle: 10 * D, endAngle: -90 * D, ccw: false };
    const e = objectExtremes(arc);
    expect(e.maxX.x).toBeCloseTo(105, 9);
    expect(e.maxX.y).toBeCloseTo(20, 9);
    expect(e.minY.y).toBeCloseTo(15, 9);
    // nejvýš je počáteční bod (10°)
    expect(e.maxY.y).toBeCloseTo(20 + 5 * Math.sin(10 * D), 9);
  });

  it('kružnice: všechny 4 kvadranty', () => {
    const e = objectExtremes({ type: 'circle', cx: 0, cy: 0, r: 2 });
    expect([e.maxX.x, e.minX.x, e.maxY.y, e.minY.y]).toEqual([2, -2, 2, -2].map(v => expect.closeTo(v, 9)));
  });

  it('kontura s obloukem (bulge) i pole objektů', () => {
    // půlkruh nad úsečkou (0,0)-(10,0): bulge 1 = 180° CCW → oblouk pod osou
    const pl = { type: 'polyline', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], bulges: [1], closed: false };
    const e = objectExtremes(pl);
    expect(Math.min(e.minY.y, e.maxY.y)).toBeCloseTo(-5, 9);
    const both = objectExtremes([pl, { type: 'line', x1: 0, y1: 0, x2: 20, y2: 3 }]);
    expect(both.maxX.x).toBe(20);
    expect(both.maxY.y).toBe(3);
  });

  it('kóty se neměří', () => {
    expect(supportsExtremes({ type: 'line', isDimension: true })).toBe(false);
    expect(supportsExtremes({ type: 'text' })).toBe(false);
    expect(objectExtremes({ type: 'text' })).toBe(null);
  });
});

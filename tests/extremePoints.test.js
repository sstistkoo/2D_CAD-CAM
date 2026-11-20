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

describe('body přechodu R po zaoblení (jako kalkulačka Kužel)', () => {
  it('karusel: R5 přes kvadrant → ★ největší Ø, tečné body od Z+ (shora)', async () => {
    const { arcTransitionPoints } = await import('../js/geometry/extremePoints.js');
    // R5 z 10° dolů do -90° (po směru hodin) jako první fotka: tečně na šikmou úsečku a dno
    const arc = { cx: 100, cy: 20, r: 5, startAngle: -90 * D, endAngle: 10 * D, ccw: true };
    const t = arcTransitionPoints(arc, true);
    expect(t.start.y).toBeGreaterThan(t.end.y);         // shora dolů
    expect(t.extremes).toHaveLength(1);
    expect(t.extremes[0].kind).toBe('max');
    expect(t.extremes[0].x).toBeCloseTo(105, 9);
    expect(t.extremes[0].y).toBeCloseTo(20, 9);
  });
  it('soustruh: osa vodorovná, průměr = y; konvexní roh bez kvadrantu nemá ★', async () => {
    const { arcTransitionPoints } = await import('../js/geometry/extremePoints.js');
    const t1 = arcTransitionPoints({ cx: 0, cy: 50, r: 10, startAngle: 30 * D, endAngle: 150 * D }, false);
    expect(t1.extremes.map(e => e.kind)).toEqual(['max']);
    expect(t1.extremes[0].y).toBeCloseTo(60, 9);
    expect(t1.start.x).toBeGreaterThan(t1.end.x);       // zprava doleva
    const t2 = arcTransitionPoints({ cx: 0, cy: 50, r: 10, startAngle: 0, endAngle: 80 * D }, false);
    expect(t2.extremes).toHaveLength(0);
  });
});

// Kontrola kódu 18. 11. 2026 – auto-detekce prvků výkresu.
import { describe, it, expect, vi } from 'vitest';
// Detekce je čistá geometrie; plátno a kóty se jen importují.
vi.mock('../js/canvas.js', () => ({ drawCanvas: {}, vSign: () => 1, hSign: () => 1 }));
vi.mock('../js/render.js', () => ({ renderAll: () => {} }));
vi.mock('../js/dialogs/dimension.js', () => ({ addDimensionForObject: () => {} }));
const { extractSegments, detectFeatures } = await import('../js/dialogs/autoDetect.js');

const L = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2 });
const detect = (objs) => detectFeatures(extractSegments(objs));

describe('auto-detekce: zápich × schodek', () => {
  it('U-tvar je zápich, osazení (schodek) ne', () => {
    const groove = [L(0, 10, -10, 10), L(-10, 10, -10, 5), L(-10, 5, -15, 5), L(-15, 5, -15, 10), L(-15, 10, -30, 10)];
    const g = detect(groove).grooves;
    expect(g.length).toBe(1);
    expect(g[0].width).toBeCloseTo(5, 9);
    expect(g[0].depth).toBeCloseTo(5, 9);

    const step = [L(0, 10, -20, 10), L(-20, 10, -20, 20), L(-20, 20, -40, 20)];
    const s = detect(step);
    expect(s.grooves).toEqual([]);
    expect(s.corners.length).toBe(2);
  });

  it('horní hrany zápichu zůstanou v seznamu rohů', () => {
    const groove = [L(0, 10, -10, 10), L(-10, 10, -10, 5), L(-10, 5, -15, 5), L(-15, 5, -15, 10), L(-15, 10, -30, 10)];
    const pts = detect(groove).corners.map(c => `${c.point.x},${c.point.y}`).sort();
    expect(pts).toEqual(['-10,10', '-15,10']);
  });
});

describe('auto-detekce: oblouk z polyline drží směr', () => {
  it('záporný bulge = oblouk po směru hodin (ccw false)', () => {
    const pl = { type: 'polyline', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], bulges: [-0.4], closed: false };
    const { arcs } = extractSegments([pl]);
    expect(arcs[0].obj.ccw).toBe(false);
    const pl2 = { ...pl, bulges: [0.4] };
    expect(extractSegments([pl2]).arcs[0].obj.ccw).toBe(true);
  });
});

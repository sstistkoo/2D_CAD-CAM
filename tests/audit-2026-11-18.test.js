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

describe('vazby kontury: šíření nepohne pevným vrcholem', () => {
  it('uzavřený obdélník H/V/H/V: vyrovnání segmentu 0 nechá vrchol 0 na místě', async () => {
    vi.doMock('../js/ui.js', () => ({ setHint: () => {}, resetHint: () => {} }));
    const { propagateConstraints } = await import('../js/tools/helpers.js');
    // Vrchol 1 právě posunut (P1 = vrchol 0 pevný), zbytek drží původní tvar
    const v = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10.5, y: 5 }, { x: 1, y: 5 }];
    const pl = { type: 'polyline', vertices: v, bulges: [0, 0, 0, 0], closed: true,
      segConstraints: { 0: 'horizontal', 1: 'vertical', 2: 'horizontal', 3: 'vertical' } };
    propagateConstraints(pl, 0, 'p2');
    expect(v[0]).toEqual({ x: 0, y: 0 });
    expect(v[1]).toEqual({ x: 10, y: 0 });
    expect(v[2].x).toBeCloseTo(10, 9);   // segment 1 svisle
    expect(v[3].y).toBeCloseTo(v[2].y, 9); // segment 2 vodorovně
  });
});

describe('natočený obdélník: obálka a rohy', () => {
  it('getObjectBounds bere natočené rohy', async () => {
    vi.doMock('../js/canvas.js', () => ({ drawCanvas: {}, screenToWorld: () => [0, 0] }));
    const { getObjectBounds } = await import('../js/render/bounds.js');
    const b = getObjectBounds({ type: 'rect', x1: -10, y1: -5, x2: 10, y2: 5, rotation: Math.PI / 2 });
    expect(b.maxX).toBeCloseTo(5, 9);
    expect(b.maxY).toBeCloseTo(10, 9);
  });

  it('getRectCornersCCW vrací rohy proti směru hodin i pro prohozené x1/x2', async () => {
    const { getRectCornersCCW } = await import('../js/utils.js');
    for (const r of [{ x1: 0, y1: 0, x2: 20, y2: 10 }, { x1: 20, y1: 0, x2: 0, y2: 10, rotation: 0.3 }]) {
      const c = getRectCornersCCW({ type: 'rect', ...r });
      let a2 = 0;
      for (let i = 0; i < 4; i++) a2 += c[i].x * c[(i + 1) % 4].y - c[(i + 1) % 4].x * c[i].y;
      expect(a2).toBeGreaterThan(0);
    }
  });
});

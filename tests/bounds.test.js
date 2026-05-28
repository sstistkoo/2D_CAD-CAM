// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: getObjectBounds, boundsOverlap             ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DOM mocks ──
vi.hoisted(() => {
  const mockCanvas = {
    width: 800, height: 600,
    getContext: () => ({
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(),
      setLineDash: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 50 }),
      clearRect: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
      strokeRect: vi.fn(), closePath: vi.fn(), clip: vi.fn(), rect: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
    }),
    addEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };

  const mockEl = () => ({
    disabled: false, textContent: '', innerHTML: '', value: '',
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn(), contains: () => false },
    appendChild: vi.fn(), addEventListener: vi.fn(), setAttribute: vi.fn(),
    style: {}, children: [], querySelectorAll: () => [], querySelector: () => null,
  });

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'drawCanvas') return mockCanvas;
      if (id === 'canvasWrap') return { clientWidth: 800, clientHeight: 600 };
      return mockEl();
    },
    createElement: () => { const el = mockEl(); el.className = ''; return el; },
    body: { appendChild: vi.fn() },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  globalThis.window = {
    innerWidth: 1024, innerHeight: 768,
    addEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(),
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: vi.fn() },
    writable: true, configurable: true,
  });
});

// Mock geometry (imported by render.js)
vi.mock('../js/geometry.js', () => ({
  projectPointToLine: vi.fn(),
  findObjectAt: vi.fn(),
  selectObjectAt: vi.fn(),
  calculateAllIntersections: vi.fn(),
}));

import { getObjectBounds, boundsOverlap } from '../js/render.js';

// ════════════════════════════════════════
// ── getObjectBounds ──
// ════════════════════════════════════════
describe('getObjectBounds', () => {
  it('point → bounds s marginem ±1', () => {
    const b = getObjectBounds({ type: 'point', x: 10, y: 20 });
    expect(b).toEqual({ minX: 9, minY: 19, maxX: 11, maxY: 21 });
  });

  it('line → min/max ze dvou bodů', () => {
    const b = getObjectBounds({ type: 'line', x1: 5, y1: 10, x2: 15, y2: 3 });
    expect(b).toEqual({ minX: 5, minY: 3, maxX: 15, maxY: 10 });
  });

  it('line – obrácené souřadnice', () => {
    const b = getObjectBounds({ type: 'line', x1: 20, y1: 30, x2: 5, y2: 10 });
    expect(b).toEqual({ minX: 5, minY: 10, maxX: 20, maxY: 30 });
  });

  it('constr → stejný výpočet jako line', () => {
    const b = getObjectBounds({ type: 'constr', x1: 0, y1: 0, x2: 10, y2: 10 });
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('dimension line → zahrnuje dimSrc body', () => {
    const b = getObjectBounds({
      type: 'line', x1: 5, y1: 5, x2: 15, y2: 5,
      isDimension: true,
      dimSrcX1: 3, dimSrcY1: 0,
      dimSrcX2: 18, dimSrcY2: 0,
    });
    expect(b.minX).toBe(3);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(18);
    expect(b.maxY).toBe(5);
  });

  it('circle → AABB z centra a poloměru', () => {
    const b = getObjectBounds({ type: 'circle', cx: 10, cy: 20, r: 5 });
    expect(b).toEqual({ minX: 5, minY: 15, maxX: 15, maxY: 25 });
  });

  it('arc → AABB z centra a poloměru', () => {
    const b = getObjectBounds({ type: 'arc', cx: 0, cy: 0, r: 10 });
    expect(b).toEqual({ minX: -10, minY: -10, maxX: 10, maxY: 10 });
  });

  it('rect → min/max ze dvou rohů', () => {
    const b = getObjectBounds({ type: 'rect', x1: 2, y1: 3, x2: 8, y2: 7 });
    expect(b).toEqual({ minX: 2, minY: 3, maxX: 8, maxY: 7 });
  });

  it('rect – obrácené rohy', () => {
    const b = getObjectBounds({ type: 'rect', x1: 10, y1: 10, x2: 2, y2: 2 });
    expect(b).toEqual({ minX: 2, minY: 2, maxX: 10, maxY: 10 });
  });

  it('polyline → AABB z vertexů', () => {
    const b = getObjectBounds({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 3, y: 8 }],
    });
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 8 });
  });

  it('polyline bez vertexů → null', () => {
    expect(getObjectBounds({ type: 'polyline', vertices: [] })).toBeNull();
  });

  it('text → přibližné bounds', () => {
    const b = getObjectBounds({ type: 'text', x: 10, y: 20, text: 'ABC', fontSize: 14 });
    expect(b.minX).toBe(10);
    expect(b.maxY).toBe(20);
    expect(b.maxX).toBeGreaterThan(10); // šířka závisí na délce textu
    expect(b.minY).toBeLessThan(20);    // výška textu
  });

  it('neznámý typ → null', () => {
    expect(getObjectBounds({ type: 'unknown_thing' })).toBeNull();
  });
});

// ════════════════════════════════════════
// ── boundsOverlap ──
// ════════════════════════════════════════
describe('boundsOverlap', () => {
  it('překrývající se bbox → true', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
    expect(boundsOverlap(a, b)).toBe(true);
  });

  it('totožné bbox → true', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(boundsOverlap(a, a)).toBe(true);
  });

  it('bbox uvnitř druhého → true', () => {
    const outer = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const inner = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(boundsOverlap(outer, inner)).toBe(true);
    expect(boundsOverlap(inner, outer)).toBe(true);
  });

  it('dotýkající se hranou → true', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 10, minY: 0, maxX: 20, maxY: 10 };
    expect(boundsOverlap(a, b)).toBe(true);
  });

  it('dotýkající se rohem → true', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 10, minY: 10, maxX: 20, maxY: 20 };
    expect(boundsOverlap(a, b)).toBe(true);
  });

  it('oddělené horizontálně → false', () => {
    const a = { minX: 0, minY: 0, maxX: 5, maxY: 10 };
    const b = { minX: 6, minY: 0, maxX: 10, maxY: 10 };
    expect(boundsOverlap(a, b)).toBe(false);
  });

  it('oddělené vertikálně → false', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 5 };
    const b = { minX: 0, minY: 6, maxX: 10, maxY: 10 };
    expect(boundsOverlap(a, b)).toBe(false);
  });

  it('oddělené diagonálně → false', () => {
    const a = { minX: 0, minY: 0, maxX: 3, maxY: 3 };
    const b = { minX: 5, minY: 5, maxX: 8, maxY: 8 };
    expect(boundsOverlap(a, b)).toBe(false);
  });
});

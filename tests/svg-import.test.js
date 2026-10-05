// Import SVG (parseSVGPath v storage/fileIO.js) – směr oblouků příkazu A.
// Regrese z kontroly CAD 5. 10. 2026: sweep-flag 1 se bral jako „proti směru
// hodin", takže se čtvrtoblouk kreslil jako doplněk 270°.
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Minimální DOM: fileIO.js i jeho importy sahají na document/window už při načtení
// (stejný vzor jako tests/cnc-export-chain.test.js).
function makeEl() {
  return new Proxy(function () {}, {
    get(t, p) {
      if (p === 'value') return t.__value ?? '';
      if (p === 'style' || p === 'classList' || p === 'dataset') return makeEl();
      if (p === 'getContext') return () => makeEl();
      if (p === 'querySelector' || p === 'getElementById') return () => makeEl();
      if (p === 'querySelectorAll') return () => [];
      if (p === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 800, height: 600 });
      if (p === Symbol.toPrimitive) return () => '';
      return makeEl();
    },
    set(t, p, v) { if (p === 'value') t.__value = v; return true; },
    apply() { return makeEl(); },
  });
}

let parseSVGPath;
beforeAll(async () => {
  const doc = new Proxy({}, {
    get(t, p) {
      if (p === 'getElementById') return () => makeEl();
      if (p === 'querySelectorAll') return () => [];
      if (p === 'addEventListener') return () => {};
      return makeEl();
    },
  });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new Proxy({ addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), devicePixelRatio: 1 }, {
    get(t, p) { return p in t ? t[p] : makeEl(); },
  }));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() }, userAgent: 'node' });
  ({ parseSVGPath } = await import('../js/storage/fileIO.js'));
});

/** Bod v polovině oblouku podle konvence aplikace (ccw !== false = proti směru). */
function arcMid(a) {
  const T = 2 * Math.PI, ccw = a.ccw !== false;
  const sweep = ((((ccw ? a.endAngle - a.startAngle : a.startAngle - a.endAngle) % T) + T) % T);
  const m = a.startAngle + (ccw ? sweep : -sweep) / 2;
  return { x: a.cx + a.r * Math.cos(m), y: a.cy + a.r * Math.sin(m), sweepDeg: sweep * 180 / Math.PI };
}

describe('parseSVGPath – oblouk A', () => {
  it('sweep-flag 1 (po směru hodin na obrazovce) → čtvrtoblouk přes (7,07; −7,07)', () => {
    const [arc] = parseSVGPath('M 10 0 A 10 10 0 0 1 0 10');
    expect(arc.type).toBe('arc');
    const m = arcMid(arc);
    expect(m.sweepDeg).toBeCloseTo(90, 6);
    // SVG (7,07; 7,07) s osou Y dolů = výkres (7,07; −7,07)
    expect(m.x).toBeCloseTo(10 * Math.SQRT1_2, 6);
    expect(m.y).toBeCloseTo(-10 * Math.SQRT1_2, 6);
  });

  it('sweep-flag 0 → čtvrtoblouk na druhou stranu tětivy', () => {
    const [arc] = parseSVGPath('M 10 0 A 10 10 0 0 0 0 10');
    const m = arcMid(arc);
    expect(m.sweepDeg).toBeCloseTo(90, 6);
    expect(m.x).toBeCloseTo(10 - 10 * Math.SQRT1_2, 6);
    expect(m.y).toBeCloseTo(-10 + 10 * Math.SQRT1_2, 6);
  });

  it('úsečky a uzavření Z se překlopí do výkresu (Y nahoru)', () => {
    const lines = parseSVGPath('M 0 0 L 10 0 L 10 5 Z');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatchObject({ x1: 10, y1: -0, x2: 10, y2: -5 });
  });
});

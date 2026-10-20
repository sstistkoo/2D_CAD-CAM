// ╔══════════════════════════════════════════════════════════════╗
// ║  Díra do čela, Skrz i polotovarem, sbalení lišty na mobilu    ║
// ╚══════════════════════════════════════════════════════════════╝
// Nástroj Díra (tools/faceHoleClick.js → calculators/singleHole.js) dělá
// jednu díru do čela. Hloubka Skrz umí počítat jen hotovou konturu, nebo
// i polotovar (holeDepth.stock — vrtá se před soustružením). Na mobilu na
// výšku ▴ v řádku s Kr.pole sbalí řádky lišty nad Více (js/toolbarCollapse.js).
// (uživatel 20. 10. 2026)
import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('document', {
  getElementById: () => null,
  createElement: () => ({ classList: { add: vi.fn() }, style: {}, appendChild: vi.fn(), addEventListener: vi.fn(), setAttribute: vi.fn() }),
  body: { appendChild: vi.fn() },
  head: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: vi.fn(),
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

import { holePolar } from '../js/calculators/singleHole.js';
import { readDepth } from '../js/calculators/holeDepthFields.js';
import { holeDepthLabel, materialSpan, resolveHoleDepth } from '../js/faceView/faceDepth.js';
import { setToolbarCollapsed } from '../js/toolbarCollapse.js';

const L = (x1, y1, x2, y2, extra = {}) => ({ type: 'line', layer: 0, x1, y1, x2, y2, ...extra });
// Hřídel Ø40 (Z0–200) s přírubou Ø90 (Z200–280), polotovar Ø100 přes celou délku.
const part = [L(0, 0, 0, 20), L(0, 20, 200, 20), L(200, 20, 200, 45), L(200, 45, 280, 45), L(280, 45, 280, 0)];
const stock = [L(-2, 0, -2, 50, { isStock: true }), L(-2, 50, 282, 50, { isStock: true }), L(282, 50, 282, 0, { isStock: true })];

describe('Díra: poloha polárně (osa C)', () => {
  it('X20 Y20 → Ø56,569 · C45°, záporný úhel dopočte do 0–360°', () => {
    const p = holePolar(20, 20);
    expect(p.dia).toBeCloseTo(56.569, 3);
    expect(p.angle).toBeCloseTo(45, 9);
    expect(holePolar(0, -10).angle).toBeCloseTo(270, 9);
    expect(holePolar(0, 0)).toEqual({ dia: 0, angle: 0 });
  });
});

describe('Skrz: jen hotová kontura / i polotovar', () => {
  const fakeRoot = (mode, val, mat) => ({
    querySelector: sel => ({
      '[data-id="p_depthMode"]': { value: mode },
      '[data-id="p_depthVal"]': { value: val },
      '[data-id="p_depthMat"]': mat == null ? null : { value: mat },
    })[sel] ?? null,
  });

  it('okno: „I polotovar" dá stock: true, hotová kontura nic', () => {
    expect(readDepth(fakeRoot('through', '', 'stock'), 'p_')).toEqual({ spec: { mode: 'through', value: null, stock: true } });
    expect(readDepth(fakeRoot('through', '', 'part'), 'p_')).toEqual({ spec: { mode: 'through', value: null } });
    expect(readDepth(fakeRoot('depth', '12', 'stock'), 'p_')).toEqual({ spec: { mode: 'depth', value: 12 } });
  });
  it('popisek a název operace', () => {
    expect(holeDepthLabel({ mode: 'through', value: null })).toBe('skrz');
    expect(holeDepthLabel({ mode: 'through', value: null, stock: true })).toBe('skrz vč. polotovaru');
  });
  it('mimo přírubu je materiál jen v polotovaru', () => {
    // Díra na Ø100 (r 46–48) z čela Z282 zprava: kontura nic, polotovar celý.
    const objs = [...part, ...stock];
    expect(materialSpan(objs, 'soustruh', 282, 'right', 46, 48)).toBeNull();
    expect(materialSpan(objs, 'soustruh', 282, 'right', 46, 48, true)).toEqual({ start: 0, end: 284 });
  });
  it('přes přírubu: s polotovarem jde díra dál (polotovar před soustružením)', () => {
    const objs = [...part, ...stock];
    const p = { faceZ: 280, side: 'right', d: 7, lo: 36.5, hi: 43.5, objects: objs, machineType: 'soustruh' };
    expect(resolveHoleDepth({ mode: 'through', value: 0 }, p)).toEqual({ depth: 80, thick: 80 });
    expect(resolveHoleDepth({ mode: 'through', value: 0, stock: true }, p)).toEqual({ depth: 282, thick: 282 });
  });
});

describe('lišta na mobilu: ▴ sbalí řádky nad Více', () => {
  const el = () => {
    const cls = new Set();
    const attrs = {};
    return {
      classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: c => cls.has(c) },
      querySelector: () => arrow,
      setAttribute: (k, v) => { attrs[k] = v; },
      attrs,
    };
  };
  const arrow = { textContent: '▴' };
  it('přepne třídu more-only, šipku a popisek', () => {
    const tb = el(), btn = el();
    expect(setToolbarCollapsed(tb, btn, true)).toBe(true);
    expect(tb.classList.contains('more-only')).toBe(true);
    expect(arrow.textContent).toBe('▾');
    expect(btn.title).toMatch(/Rozbalit/);
    expect(btn.attrs['aria-expanded']).toBe('false');
    setToolbarCollapsed(tb, btn, false);
    expect(tb.classList.contains('more-only')).toBe(false);
    expect(arrow.textContent).toBe('▴');
  });
});

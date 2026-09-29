// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: asociativní kóty segmentů kontury           ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false, classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '', innerHTML: '', querySelectorAll: () => [],
    appendChild: vi.fn(), style: {},
  }),
  createElement: () => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(), addEventListener: vi.fn(),
    setAttribute: vi.fn(), style: {},
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));
vi.mock('../js/ui.js', () => ({ updateObjectList: vi.fn(), updateProperties: vi.fn() }));
vi.mock('../js/geometry.js', () => ({ calculateAllIntersections: vi.fn() }));
vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(), drawCanvas: { width: 800, height: 600 },
}));

import { state } from '../js/state.js';
import { addObject } from '../js/objects.js';
import { addDimensionForObject, updateAssociativeDimensions } from '../js/dialogs/dimension.js';

const lin = () => state.objects.filter(o => o.isDimension && o.dimType === 'linear');
const rad = () => state.objects.filter(o => o.isDimension && o.dimType === 'radius');

// Profil: (0,0)→(0,50)→(150,50)→oblouk→(200,0)
function profile() {
  return addObject({
    type: 'polyline', closed: false,
    vertices: [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 150, y: 50 }, { x: 200, y: 0 }],
    bulges: [0, 0, -0.4142135623730951, 0], // 90° oblouk na posledním segmentu
  });
}

beforeEach(() => {
  state.objects = [];
  state.undoStack = [];
  state.redoStack = [];
  state.nextId = 1;
  state.activeLayer = 0;
  state.layers = [{ id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false }];
});

describe('kóty kontury jsou asociativní', () => {
  it('kóty dostanou index segmentu', () => {
    const poly = profile();
    addDimensionForObject(poly);
    expect(lin().map(d => d.dimSegIndex)).toEqual([0, 1]);
    expect(rad()[0].dimSegIndex).toBe(2);
  });

  it('posun kontury posune i kóty', () => {
    const poly = profile();
    addDimensionForObject(poly);
    for (const v of poly.vertices) { v.x += 10; v.y += 5; }
    updateAssociativeDimensions();
    const top = lin()[1];
    expect(top.dimSrcX1).toBeCloseTo(10);
    expect(top.dimSrcY1).toBeCloseTo(55);
    expect(top.dimSrcX2).toBeCloseTo(160);
    expect(top.y1).toBeCloseTo(70);           // odsazení 15 nad úsečkou zůstává
    const r = rad()[0];
    expect(r.dimCenterX).toBeCloseTo(160); // střed oblouku (150,0) posunutý o (10,5)
    expect(r.dimCenterY).toBeCloseTo(5);
    expect(r.x1).toBeCloseTo(r.dimCenterX);
  });

  it('změna vrcholu přepočítá hodnotu kóty', () => {
    const poly = profile();
    addDimensionForObject(poly);
    poly.vertices[2].x = 120;
    updateAssociativeDimensions();
    expect(lin()[1].name).toBe('Kóta 120.00mm');
  });

  it('vložený vrchol – kóta zůstane u svého segmentu', () => {
    const poly = profile();
    addDimensionForObject(poly);
    // vloží vrchol do svislého segmentu 0 → horní úsečka je teď segment 2
    poly.vertices.splice(1, 0, { x: 0, y: 20 });
    poly.bulges.splice(1, 0, 0);
    updateAssociativeDimensions();
    const top = lin().find(d => Math.abs(d.dimSrcY1 - 50) < 1e-9 && Math.abs(d.dimSrcY2 - 50) < 1e-9);
    expect(top).toBeTruthy();
    expect(top.dimSegIndex).toBe(2);
    expect(top.name).toBe('Kóta 150.00mm');
  });

  it('starší kóta bez indexu se dohledá i po posunu', () => {
    const poly = profile();
    addDimensionForObject(poly);
    for (const d of state.objects) { delete d.dimSegIndex; delete d.dimSegCount; }
    for (const v of poly.vertices) v.x += 30;
    updateAssociativeDimensions();
    const top = lin().find(d => d.name === 'Kóta 150.00mm');
    expect(top.dimSegIndex).toBe(1);
    expect(top.dimSrcX1).toBeCloseTo(30);
    expect(rad()[0].dimSegIndex).toBe(2);
  });

  it('kóta R leží na oblouku (střed oblouku, ne tětivy)', () => {
    const poly = profile();
    addDimensionForObject(poly);
    const r = rad()[0];
    expect(Math.hypot(r.x2 - r.dimCenterX, r.y2 - r.dimCenterY)).toBeCloseTo(r.dimRadius);
  });
});

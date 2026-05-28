// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: dimension.js + textClick.js                 ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM
vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false,
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '',
    innerHTML: '',
    querySelectorAll: () => [],
    appendChild: vi.fn(),
    style: {},
  }),
  createElement: (tag) => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    style: {},
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
});

vi.stubGlobal('window', {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: vi.fn(),
});

vi.stubGlobal('navigator', { vibrate: vi.fn() });

vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

vi.mock('../js/ui.js', () => ({
  updateObjectList: vi.fn(),
  updateProperties: vi.fn(),
}));

vi.mock('../js/geometry.js', () => ({
  calculateAllIntersections: vi.fn(),
}));

vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(),
  drawCanvas: { width: 800, height: 600 },
}));

import { state } from '../js/state.js';
import { addObject, moveObject } from '../js/objects.js';
import { addDimensionForObject, updateAssociativeDimensions, addAngleDimensionForLines } from '../js/dialogs/dimension.js';

function resetState() {
  state.objects = [];
  state.undoStack = [];
  state.redoStack = [];
  state.nextId = 1;
  state.activeLayer = 0;
  state.selected = null;
  state.drawing = false;
  state.tool = 'select';
  state.layers = [
    { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    { id: 1, name: 'Konstrukce', color: '#6c7086', visible: true, locked: false },
  ];
}

// ════════════════════════════════════════
// ── addDimensionForObject ──
// ════════════════════════════════════════
describe('addDimensionForObject', () => {
  beforeEach(resetState);

  it('vytvoří kótu bodu s isCoordLabel', () => {
    addDimensionForObject({ type: 'point', x: 10, y: 20 });
    const dim = state.objects[0];
    expect(dim).toBeDefined();
    expect(dim.isDimension).toBe(true);
    expect(dim.isCoordLabel).toBe(true);
    expect(dim.x).toBe(10);
    expect(dim.y).toBe(20);
  });

  it('vytvoří lineární kótu pro úsečku', () => {
    const line = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    addDimensionForObject(line);
    const dim = state.objects.find(o => o.isDimension);
    expect(dim).toBeDefined();
    expect(dim.dimType).toBe('linear');
    expect(dim.sourceObjId).toBe(line.id);
    expect(dim.name).toContain('10.00');
  });

  it('vytvoří průměrovou kótu pro kružnici', () => {
    const circle = addObject({ type: 'circle', cx: 0, cy: 0, r: 25 });
    addDimensionForObject(circle);
    const dim = state.objects.find(o => o.isDimension);
    expect(dim).toBeDefined();
    expect(dim.dimType).toBe('diameter');
    expect(dim.sourceObjId).toBe(circle.id);
    expect(dim.dimRadius).toBe(25);
    expect(dim.name).toContain('⌀50.00');
  });

  it('vytvoří radiální + úhlovou kótu pro oblouk', () => {
    const arc = addObject({
      type: 'arc', cx: 0, cy: 0, r: 10,
      startAngle: 0, endAngle: Math.PI / 2,
    });
    addDimensionForObject(arc);
    const dims = state.objects.filter(o => o.isDimension);
    expect(dims.length).toBe(2);
    const rDim = dims.find(d => d.dimType === 'radius');
    const aDim = dims.find(d => d.dimType === 'angular');
    expect(rDim).toBeDefined();
    expect(rDim.dimRadius).toBe(10);
    expect(aDim).toBeDefined();
    expect(aDim.dimAngle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('vytvoří 2 lineární kóty pro obdélník', () => {
    const rect = addObject({ type: 'rect', x1: 0, y1: 0, x2: 30, y2: 20 });
    addDimensionForObject(rect);
    const dims = state.objects.filter(o => o.isDimension);
    expect(dims.length).toBe(2);
    expect(dims.every(d => d.dimType === 'linear')).toBe(true);
    expect(dims.every(d => d.sourceObjId === rect.id)).toBe(true);
  });

  it('vytvoří kóty pro konturu', () => {
    const poly = addObject({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }],
      bulges: [0, 0],
      closed: false,
    });
    addDimensionForObject(poly);
    const dims = state.objects.filter(o => o.isDimension);
    expect(dims.length).toBe(2);
  });
});

// ════════════════════════════════════════
// ── updateAssociativeDimensions ──
// ════════════════════════════════════════
describe('updateAssociativeDimensions', () => {
  beforeEach(resetState);

  it('aktualizuje lineární kótu po přesunu úsečky', () => {
    const line = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    addDimensionForObject(line);
    const dim = state.objects.find(o => o.isDimension && o.dimType === 'linear');
    const origX1 = dim.dimSrcX1;

    // Přesun úsečky
    line.x1 += 5;
    line.x2 += 5;
    updateAssociativeDimensions();

    expect(dim.dimSrcX1).toBe(origX1 + 5);
    expect(dim.name).toContain('10.00');
  });

  it('aktualizuje průměrovou kótu po změně poloměru', () => {
    const circle = addObject({ type: 'circle', cx: 0, cy: 0, r: 25 });
    addDimensionForObject(circle);
    const dim = state.objects.find(o => o.isDimension && o.dimType === 'diameter');

    circle.r = 30;
    updateAssociativeDimensions();

    expect(dim.dimRadius).toBe(30);
    expect(dim.name).toContain('⌀60.00');
  });

  it('aktualizuje radiální kótu po přesunu oblouku', () => {
    const arc = addObject({
      type: 'arc', cx: 0, cy: 0, r: 10,
      startAngle: 0, endAngle: Math.PI / 2,
    });
    addDimensionForObject(arc);
    const rDim = state.objects.find(o => o.isDimension && o.dimType === 'radius');

    arc.cx = 5;
    arc.cy = 5;
    updateAssociativeDimensions();

    expect(rDim.x1).toBe(5);
    expect(rDim.y1).toBe(5);
  });

  it('aktualizuje úhlovou kótu mezi úsečkami po přesunu', () => {
    const line1 = addObject({ type: 'line', x1: 0, y1: 0, x2: 20, y2: 0 });
    const line2 = addObject({ type: 'line', x1: 0, y1: 0, x2: 0, y2: 20 });
    addAngleDimensionForLines(line1, line2);
    const dim = state.objects.find(o => o.isDimension && o.dimType === 'angular');
    expect(dim).toBeDefined();
    expect(dim.dimAngle).toBeCloseTo(Math.PI / 2, 5);
    expect(dim.dimLine1Id).toBe(line1.id);
    expect(dim.dimLine2Id).toBe(line2.id);

    // Přesun úsečky 2 → změní úhel na 45°
    line2.x2 = 20;
    line2.y2 = 20;
    updateAssociativeDimensions();

    expect(dim.dimAngle).toBeCloseTo(Math.PI / 4, 5);
    expect(dim.name).toContain('∠45.0°');
  });
});

// ════════════════════════════════════════
// ── addAngleDimensionForLines ──
// ════════════════════════════════════════
describe('addAngleDimensionForLines', () => {
  beforeEach(resetState);

  it('vytvoří úhlovou kótu 90° mezi kolmými úsečkami', () => {
    const line1 = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    const line2 = addObject({ type: 'line', x1: 0, y1: 0, x2: 0, y2: 10 });
    addAngleDimensionForLines(line1, line2);
    const dim = state.objects.find(o => o.isDimension && o.dimType === 'angular');
    expect(dim).toBeDefined();
    expect(dim.dimAngle).toBeCloseTo(Math.PI / 2, 5);
    expect(dim.name).toContain('∠90.0°');
    expect(dim.dimCenterX).toBeCloseTo(0, 5);
    expect(dim.dimCenterY).toBeCloseTo(0, 5);
  });

  it('průsečík je správný pro mimoběžné úsečky', () => {
    const line1 = addObject({ type: 'line', x1: -10, y1: 0, x2: 10, y2: 0 });
    const line2 = addObject({ type: 'line', x1: 5, y1: -5, x2: 5, y2: 5 });
    addAngleDimensionForLines(line1, line2);
    const dim = state.objects.find(o => o.isDimension && o.dimType === 'angular');
    expect(dim.dimCenterX).toBeCloseTo(5, 5);
    expect(dim.dimCenterY).toBeCloseTo(0, 5);
  });

  it('nepovolí rovnoběžné úsečky', () => {
    const line1 = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    const line2 = addObject({ type: 'line', x1: 0, y1: 5, x2: 10, y2: 5 });
    addAngleDimensionForLines(line1, line2);
    const dim = state.objects.find(o => o.isDimension && o.dimType === 'angular');
    expect(dim).toBeUndefined();
  });
});

// ════════════════════════════════════════
// ── moveObject s text ──
// ════════════════════════════════════════
describe('moveObject – text', () => {
  beforeEach(resetState);

  it('posune textový objekt', () => {
    const txt = addObject({ type: 'text', x: 10, y: 20, text: 'Hello', fontSize: 14 });
    moveObject(txt, 5, -3);
    expect(txt.x).toBe(15);
    expect(txt.y).toBe(17);
  });
});

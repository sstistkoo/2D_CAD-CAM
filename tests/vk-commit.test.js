// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: VK kontura → objekty výkresu                 ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── DOM mock ──
// vkCommit.js sám DOM nepotřebuje, ale sahá na pushUndo()/showToast()
// ze state.js, které v prohlížeči pracují s tlačítky UNDO a toastem.
vi.hoisted(() => {
  const mockEl = () => ({
    disabled: false, textContent: '', className: '',
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    setAttribute: vi.fn(),
  });
  globalThis.document = {
    getElementById: () => mockEl(),
    createElement: () => mockEl(),
    body: { appendChild: vi.fn() },
    querySelector: () => null,
  };
});

const { state, STOCK_LAYER_ID } = await import('../js/state.js');
const { bridge } = await import('../js/bridge.js');
const { vkSegmentsToDrawObjects, commitVkToDrawing } = await import('../js/calculators/vkCommit.js');
const { buildVkPreviewData } = await import('../js/calculators/vkContour.js');

const original = {
  machineType: state.machineType,
  xDisplayMode: state.xDisplayMode,
  activeLayer: state.activeLayer,
  drawStockMode: state.drawStockMode,
  nextId: state.nextId,
};

beforeEach(() => {
  state.machineType = 'soustruh';
  state.xDisplayMode = 'diameter';
  state.activeLayer = 0;
  state.drawStockMode = false;
  state.objects = [];
  state.undoStack = [];
  state.redoStack = [];
  state.nextId = 1;
});

afterEach(() => {
  Object.assign(state, original);
  state.objects = [];
  state.undoStack = [];
  bridge.updateObjectList = null;
  bridge.calculateAllIntersections = null;
});

/** Zkratka: VK syntaxe → objekty (bez zápisu do state). */
const toObjects = (lines) => vkSegmentsToDrawObjects(buildVkPreviewData(lines).segments);

describe('vkSegmentsToDrawObjects', () => {
  it('mapuje úsečku na world souřadnice soustruhu (X = poloměr, Z vodorovně)', () => {
    const { objects } = toObjects(['G0 X20 Z0', 'G11 X40 Z-30']);

    expect(objects).toHaveLength(1);
    // X20 → poloměr 10 (wy), Z0 → wx; X40 → poloměr 20
    expect(objects[0]).toMatchObject({ type: 'line', x1: 0, y1: 10, x2: -30, y2: 20 });
  });

  it('prohodí osy pro karusel', () => {
    state.machineType = 'karusel';
    const { objects } = toObjects(['G0 X20 Z0', 'G11 X40 Z-30']);

    expect(objects[0]).toMatchObject({ type: 'line', x1: 10, y1: 0, x2: 20, y2: -30 });
  });

  it('respektuje zadání v poloměru (bez dělení dvěma)', () => {
    state.xDisplayMode = 'radius';
    const { objects } = toObjects(['G0 X20 Z0', 'G11 X40 Z-30']);

    expect(objects[0]).toMatchObject({ type: 'line', x1: 0, y1: 20, x2: -30, y2: 40 });
  });

  it('staví oblouk se skutečným R ve world prostoru a G2 značí jako ccw:false', () => {
    const { objects } = toObjects(['G0 X20 Z0', 'G2 X40 Z-10 R10']);

    expect(objects).toHaveLength(1);
    const arc = objects[0];
    expect(arc.type).toBe('arc');
    expect(arc.r).toBe(10);
    expect(arc.ccw).toBe(false);
    // Krajní body oblouku musí sedět na zadaných bodech (0,10) a (-10,20)
    expect(arc.cx + arc.r * Math.cos(arc.startAngle)).toBeCloseTo(0, 9);
    expect(arc.cy + arc.r * Math.sin(arc.startAngle)).toBeCloseTo(10, 9);
    expect(arc.cx + arc.r * Math.cos(arc.endAngle)).toBeCloseTo(-10, 9);
    expect(arc.cy + arc.r * Math.sin(arc.endAngle)).toBeCloseTo(20, 9);
  });

  it('G3 vyjde jako ccw:true (opačný střed)', () => {
    const cw = toObjects(['G0 X20 Z0', 'G2 X40 Z-10 R10']).objects[0];
    const ccw = toObjects(['G0 X20 Z0', 'G3 X40 Z-10 R10']).objects[0];

    expect(ccw.ccw).toBe(true);
    expect(ccw.cx).not.toBeCloseTo(cw.cx, 6);
  });

  it('nekomituje konstrukční paprsky ani nulové segmenty', () => {
    const { objects } = toObjects(['G111 X0 Z40 PA45', 'G0 X20 Z0', 'G0 X20 Z0 PA30']);

    expect(objects).toEqual([]);
  });

  it('vynechá oblouk s nedosažitelným R a spočítá ho', () => {
    // Tětiva je delší než 2R → oblouk nelze sestrojit.
    const { objects, skippedArcs } = toObjects(['G0 X20 Z0', 'G2 X200 Z-100 R1']);

    expect(objects).toEqual([]);
    expect(skippedArcs).toBe(1);
  });
});

describe('commitVkToDrawing', () => {
  it('vloží objekty do state.objects s ID, názvem a vrstvou, jedním UNDO', () => {
    bridge.updateObjectList = vi.fn();
    bridge.calculateAllIntersections = vi.fn();

    const count = commitVkToDrawing('G0 X20 Z0\nG11 X40 Z-30\nG11 X40 Z-50');

    expect(count).toBe(2);
    expect(state.objects).toHaveLength(2);
    expect(state.objects[0]).toMatchObject({ type: 'line', id: 1, name: 'Úsečka 1', layer: 0 });
    expect(state.objects[1]).toMatchObject({ type: 'line', id: 2, name: 'Úsečka 2', layer: 0 });
    expect(state.objects[0].isStock).toBeUndefined();
    expect(state.undoStack).toHaveLength(1);   // jeden krok zpět vrátí celou konturu
    expect(bridge.updateObjectList).toHaveBeenCalledTimes(1);
    expect(bridge.calculateAllIntersections).toHaveBeenCalledTimes(1);
  });

  it('v režimu polotovaru značí objekty isStock a dává je do vrstvy Polotovar', () => {
    state.drawStockMode = true;

    commitVkToDrawing('G0 X20 Z0\nG11 X40 Z-30');

    expect(state.objects[0]).toMatchObject({ isStock: true, layer: STOCK_LAYER_ID });
  });

  it('odmítne syntaxi s nedopočtenými rozměry (?) a nic nevloží', () => {
    const count = commitVkToDrawing('G0 X20 Z0\nG11 X? Z-30');

    expect(count).toBe(0);
    expect(state.objects).toEqual([]);
    expect(state.undoStack).toEqual([]);
  });

  it('na prázdné syntaxi ani na samotném VPOL nedělá pushUndo', () => {
    expect(commitVkToDrawing('')).toBe(0);
    expect(commitVkToDrawing('G111 X0 Z40')).toBe(0);
    expect(state.undoStack).toEqual([]);
  });
});

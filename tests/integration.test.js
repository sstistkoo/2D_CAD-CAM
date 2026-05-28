// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Integrační testy: workflow drawing → DXF → stav    ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Globals must be set via vi.hoisted for events.js top-level code
vi.hoisted(() => {
  const mockEl = () => ({
    disabled: false,
    classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    textContent: '', innerHTML: '', querySelectorAll: () => [],
    appendChild: () => {}, style: {},
    addEventListener: () => {},
    setAttribute: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelector: () => null, closest: () => null, remove: () => {},
    focus: () => {}, select: () => {},
  });
  globalThis.document = {
    getElementById: () => mockEl(),
    createElement: () => mockEl(),
    body: { appendChild: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  globalThis.window = {
    innerWidth: 1024, innerHeight: 768,
    addEventListener: () => {},
    requestAnimationFrame: (cb) => cb(),
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: () => {}, clipboard: { writeText: () => Promise.resolve() } },
    writable: true, configurable: true,
  });
});

// Mock render.js
vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));

// Mock ui.js
vi.mock('../js/ui.js', () => ({
  setTool: vi.fn(), resetHint: vi.fn(), setHint: vi.fn(),
  updateProperties: vi.fn(), updateObjectList: vi.fn(),
  updateSnapPtsBtn: vi.fn(), updateDimsBtn: vi.fn(),
  toggleCoordMode: vi.fn(), updateCoordModeBtn: vi.fn(),
  updateSnapGridBtn: vi.fn(), updateAngleSnapBtn: vi.fn(),
  showGridSizeDialog: vi.fn(), showAngleSnapDialog: vi.fn(),
  toggleHelp: vi.fn(), updateStatusProject: vi.fn(),
  updateLayerList: vi.fn(), updateMachineTypeBtn: vi.fn(),
  updateXDisplayBtn: vi.fn(),
}));

// Mock geometry.js
vi.mock('../js/geometry.js', () => ({
  findObjectAt: vi.fn(() => -1),
  selectObjectAt: vi.fn(),
  calculateAllIntersections: vi.fn(),
  mirrorObject: vi.fn(),
  linearArray: vi.fn(),
  rotateObject: vi.fn(),
  findSegmentAt: vi.fn(() => null),
}));

// Mock canvas.js
vi.mock('../js/canvas.js', () => ({
  drawCanvas: {
    width: 800, height: 600,
    addEventListener: vi.fn(), style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  },
  screenToWorld: vi.fn((sx, sy) => [sx, sy]),
  snapPt: vi.fn((x, y) => [x, y]),
  autoCenterView: vi.fn(),
  applyAngleSnap: vi.fn((x, y) => [x, y]),
}));

// Mock dialogs.js
vi.mock('../js/dialogs.js', () => ({
  showNumericalInputDialog: vi.fn(), showPolarDrawingDialog: vi.fn(),
  showCircleRadiusDialog: vi.fn(), showBulgeDialog: vi.fn(),
  showMirrorDialog: vi.fn(), showLinearArrayDialog: vi.fn(),
  showRotateDialog: vi.fn(),
}));

// Mock storage.js
vi.mock('../js/storage.js', () => ({
  saveProject: vi.fn(), showExportImageDialog: vi.fn(),
  showProjectsDialog: vi.fn(), showSaveAsDialog: vi.fn(),
}));

// Mock postDrawDialog.js
vi.mock('../js/dialogs/postDrawDialog.js', () => ({
  showPostDrawPointDialog: vi.fn(),
  showPostDrawLineDialog: vi.fn(),
  showPostDrawCircleDialog: vi.fn(),
  showPostDrawRectDialog: vi.fn(),
  showPostDrawPolylineDialog: vi.fn(),
  showPolylineSegmentDialog: vi.fn(),
}));

// Mock tools/index.js – handlry přesměrovávají na mockované funkce
vi.mock('../js/tools/index.js', () => ({
  handleTangentClick: vi.fn(), tangentFromSelection: vi.fn(() => false),
  handleOffsetClick: vi.fn(), offsetFromSelection: vi.fn(() => false),
  handleTrimClick: vi.fn(), trimFromSelection: vi.fn(() => false),
  handleExtendClick: vi.fn(), extendFromSelection: vi.fn(() => false),
  handleFilletClick: vi.fn(), filletFromSelection: vi.fn(() => false),
  handleChamferClick: vi.fn(), chamferFromSelection: vi.fn(() => false),
  handlePerpClick: vi.fn(), perpFromSelection: vi.fn(() => false),
  handleHorizontalClick: vi.fn(), horizontalFromSelection: vi.fn(() => false),
  handleParallelClick: vi.fn(), parallelFromSelection: vi.fn(() => false),
  handleBreakClick: vi.fn(),
  handleCenterMarkClick: vi.fn(), centerMarkFromSelection: vi.fn(() => false),
  handleScaleClick: vi.fn(), scaleFromSelection: vi.fn(() => false),
  handleFilletChamferClick: vi.fn(), filletChamferFromSelection: vi.fn(() => false),
  handleDimensionClick: vi.fn(), dimensionFromSelection: vi.fn(() => false), handleSnapPointClick: vi.fn(),
  handleMoveClick: vi.fn(), handleLineClick: vi.fn(),
  handleMeasureClick: vi.fn(), handleCircleClick: vi.fn(),
  handleArcClick: vi.fn(), handleRectClick: vi.fn(),
  handlePolylineClick: vi.fn(),
  measureSelection: vi.fn(() => false),
  handleProfileTraceClick: vi.fn(),
  finishProfileTrace: vi.fn(),
  cancelProfileTrace: vi.fn(),
  resetProfileTraceState: vi.fn(),
  handleChainDimensionClick: vi.fn(),
  finishChainDimension: vi.fn(),
  resetChainDimensionState: vi.fn(),
  setTraceBulge: vi.fn(),
  getTraceData: vi.fn(() => ({ points: [], segments: [], bulges: [] })),
  getTraceGcode: vi.fn(() => ''),
  drawTraceToCanvas: vi.fn(),
  importTraceFromGcode: vi.fn(),
  updateTracePanel: vi.fn(),
}));

import { state, pushUndo, undo, redo } from '../js/state.js';
import { addObject, moveObject } from '../js/objects.js';
import { handleCanvasClick } from '../js/events.js';
import { parseDXF } from '../js/dxf.js';
import { deepClone } from '../js/utils.js';

// ════════════════════════════════════════
// ── Drawing workflow: kreslení objektů ──
// ════════════════════════════════════════
describe('Integrace: kreslení → stav', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.nextId = 1;
    state.activeLayer = 0;
    state.selected = null;
    state.drawing = false;
    state.tool = 'select';
    state.tempPoints = [];
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
      { id: 1, name: 'Konstrukce', color: '#6c7086', visible: true, locked: false },
    ];
  });

  it('přidání několik objektů přes handleCanvasClick → undo → redo', () => {
    // Přidat 3 body postupně
    state.tool = 'point';
    handleCanvasClick(0, 0);
    handleCanvasClick(10, 0);
    handleCanvasClick(10, 10);
    expect(state.objects).toHaveLength(3);
    expect(state.nextId).toBe(4);

    // Undo posledního bodu
    undo();
    expect(state.objects).toHaveLength(2);

    // Redo
    redo();
    expect(state.objects).toHaveLength(3);
    expect(state.objects[2].x).toBe(10);
    expect(state.objects[2].y).toBe(10);
  });

  it('objecty z různých nástrojů mají unikátní ID', () => {
    state.tool = 'point';
    handleCanvasClick(0, 0);
    // Přidat kružnici přímo
    addObject({ type: 'circle', cx: 5, cy: 5, r: 3, name: 'Kružnice 2' });
    // Přidat úsečku přímo
    addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, name: 'Úsečka 3' });

    const ids = state.objects.map(o => o.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('move objektu → undo vrátí na původní pozici', () => {
    const obj = addObject({ type: 'point', x: 10, y: 20 });
    pushUndo(); // Uložit stav před přesunem
    moveObject(obj, 5, -3);
    expect(obj.x).toBe(15);
    expect(obj.y).toBe(17);
    undo();
    expect(state.objects[0].x).toBe(10);
    expect(state.objects[0].y).toBe(20);
  });
});

// ════════════════════════════════════════
// ── DXF → kreslení → stav ──
// ════════════════════════════════════════
describe('Integrace: DXF import → objekty ve stavu', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.nextId = 1;
    state.activeLayer = 0;
    state.selected = null;
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    ];
  });

  it('parsovaný DXF bod lze přidat do stavu', () => {
    const dxf = '0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\n5\n20\n10\n0\nENDSEC\n0\nEOF';
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);

    // Přidat entity do stavu (simulace importDXFFile)
    for (const entity of entities) {
      entity.id = state.nextId++;
      entity.name = `Bod ${entity.id}`;
      entity.layer = state.activeLayer;
      state.objects.push(entity);
    }
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]).toMatchObject({ type: 'point', x: 5, y: 10 });
  });

  it('parsovaný DXF s více entitami → správný počet objektů', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '5',
      '0', 'CIRCLE', '10', '5', '20', '5', '40', '3',
      '0', 'ARC', '10', '0', '20', '0', '40', '10', '50', '0', '51', '90',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(3);

    // Importovat do stavu
    pushUndo();
    for (const entity of entities) {
      entity.id = state.nextId++;
      entity.name = `${entity.type} ${entity.id}`;
      entity.layer = state.activeLayer;
      state.objects.push(entity);
    }
    expect(state.objects).toHaveLength(3);
    expect(state.objects.map(o => o.type)).toEqual(['line', 'circle', 'arc']);

    // Undo celého importu
    undo();
    expect(state.objects).toHaveLength(0);
  });
});

// ════════════════════════════════════════
// ── Kompletní workflow: kreslení → přesun → undo/redo ──
// ════════════════════════════════════════
describe('Integrace: kompletní workflow', () => {
  beforeEach(() => {
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
  });

  it('kreslit → vybrat → smazat → undo → redo smazání', () => {
    // 1. Kreslit objekty
    addObject({ type: 'point', x: 0, y: 0, name: 'Bod 1' });
    addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, name: 'Úsečka 2' });
    addObject({ type: 'circle', cx: 5, cy: 5, r: 3, name: 'Kružnice 3' });
    expect(state.objects).toHaveLength(3);

    // 2. Smazat prostřední objekt
    pushUndo();
    state.objects.splice(1, 1); // smaže úsečku
    expect(state.objects).toHaveLength(2);
    expect(state.objects[0].type).toBe('point');
    expect(state.objects[1].type).toBe('circle');

    // 3. Undo smazání
    undo();
    expect(state.objects).toHaveLength(3);
    expect(state.objects[1].type).toBe('line');

    // 4. Redo smazání
    redo();
    expect(state.objects).toHaveLength(2);
  });

  it('stav zůstane konzistentní po více operacích', () => {
    // Přidat 5 objektů
    for (let i = 0; i < 5; i++) {
      addObject({ type: 'point', x: i * 10, y: i * 10 });
    }
    expect(state.objects).toHaveLength(5);
    expect(state.undoStack).toHaveLength(5);

    // Undo 3x
    undo(); undo(); undo();
    expect(state.objects).toHaveLength(2);
    expect(state.redoStack).toHaveLength(3);

    // Přidat nový objekt (zruší redo stack)
    addObject({ type: 'circle', cx: 0, cy: 0, r: 5 });
    expect(state.objects).toHaveLength(3);
    expect(state.redoStack).toHaveLength(0);

    // Undo nového objektu
    undo();
    expect(state.objects).toHaveLength(2);
    expect(state.objects.every(o => o.type === 'point')).toBe(true);
  });

  it('deepClone zachovává nezávislost objektů', () => {
    addObject({ type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }],
      bulges: [0.5], closed: false, name: 'K1',
    });

    // Klonovat objekt
    const clone = deepClone(state.objects[0]);
    clone.vertices[0].x = 999;
    clone.bulges[0] = -1;

    // Originál nesmí být ovlivněn
    expect(state.objects[0].vertices[0].x).toBe(0);
    expect(state.objects[0].bulges[0]).toBe(0.5);
  });

  it('vícenásobné přesuny s undo', () => {
    const obj = addObject({ type: 'point', x: 0, y: 0 });

    pushUndo();
    moveObject(state.objects[0], 10, 0);
    expect(state.objects[0].x).toBe(10);

    pushUndo();
    moveObject(state.objects[0], 0, 10);
    expect(state.objects[0].y).toBe(10);

    undo(); // vrátit vertikální přesun
    expect(state.objects[0].x).toBe(10);
    expect(state.objects[0].y).toBe(0);

    undo(); // vrátit horizontální přesun
    expect(state.objects[0].x).toBe(0);
    expect(state.objects[0].y).toBe(0);
  });
});

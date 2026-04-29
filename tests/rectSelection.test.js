// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: getObjectBounds, boundsOverlap,            ║
// ║                  finishRectSelection, resetDrawingState     ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DOM mocks (before any imports) ──
const { mockEl } = vi.hoisted(() => {
  const mockEl = () => ({
    disabled: false, textContent: '', innerHTML: '', value: '',
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn(), contains: () => false },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    style: {},
    children: [],
    querySelectorAll: () => [],
    querySelector: () => null,
  });

  const mockCanvas = {
    width: 800, height: 600,
    getContext: () => ({}),
    addEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'drawCanvas') return mockCanvas;
      if (id === 'canvasWrap') return { clientWidth: 800, clientHeight: 600 };
      if (id === 'statusZoom') return { textContent: '' };
      return mockEl();
    },
    createElement: () => {
      const el = mockEl();
      el.className = '';
      return el;
    },
    body: { appendChild: vi.fn() },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  globalThis.window = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(),
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: vi.fn() },
    writable: true,
    configurable: true,
  });

  return { mockEl };
});

// ── Module mocks ──
vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
  getObjectBounds: vi.fn(),
  boundsOverlap: vi.fn(),
}));

vi.mock('../js/ui.js', () => ({
  setTool: vi.fn(),
  resetHint: vi.fn(),
  setHint: vi.fn(),
  updateProperties: vi.fn(),
  updateObjectList: vi.fn(),
  updateSnapPtsBtn: vi.fn(),
  updateDimsBtn: vi.fn(),
  toggleCoordMode: vi.fn(),
  updateCoordModeBtn: vi.fn(),
  updateSnapGridBtn: vi.fn(),
  updateAngleSnapBtn: vi.fn(),
  showGridSizeDialog: vi.fn(),
  showAngleSnapDialog: vi.fn(),
  toggleHelp: vi.fn(),
  updateNullPointUI: vi.fn(),
}));

vi.mock('../js/geometry.js', () => ({
  findObjectAt: vi.fn(),
  selectObjectAt: vi.fn(),
  calculateAllIntersections: vi.fn(),
  mirrorObject: vi.fn(),
  linearArray: vi.fn(),
  rotateObject: vi.fn(),
  findSegmentAt: vi.fn(),
  findConstraintAt: vi.fn(),
}));

vi.mock('../js/canvas.js', () => ({
  drawCanvas: { width: 800, height: 600, addEventListener: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  ctx: {},
  screenToWorld: vi.fn((sx, sy) => [sx, sy]),
  worldToScreen: vi.fn((wx, wy) => [wx, wy]),
  snapPt: vi.fn((x, y) => [x, y]),
  applyAngleSnap: vi.fn((x, y) => [x, y]),
  autoCenterView: vi.fn(),
}));

vi.mock('../js/dialogs.js', () => ({
  showNumericalInputDialog: vi.fn(),
  showPolarDrawingDialog: vi.fn(),
  showCircleRadiusDialog: vi.fn(),
  showBulgeDialog: vi.fn(),
  showMirrorDialog: vi.fn(),
  showLinearArrayDialog: vi.fn(),
  showRotateDialog: vi.fn(),
}));

vi.mock('../js/storage.js', () => ({
  saveProject: vi.fn(),
  showExportImageDialog: vi.fn(),
  showProjectsDialog: vi.fn(),
  showSaveAsDialog: vi.fn(),
}));

vi.mock('../js/dialogs/dimension.js', () => ({
  updateAssociativeDimensions: vi.fn(),
}));

vi.mock('../js/dialogs/postDrawDialog.js', () => ({
  showPostDrawPointDialog: vi.fn(),
  showPostDrawLineDialog: vi.fn(),
  showPostDrawCircleDialog: vi.fn(),
  showPostDrawRectDialog: vi.fn(),
  showPostDrawPolylineDialog: vi.fn(),
  showPolylineSegmentDialog: vi.fn(),
}));

vi.mock('../js/tools/index.js', () => ({
  handleTangentClick: vi.fn(),
  tangentFromSelection: vi.fn(() => false),
  handleOffsetClick: vi.fn(),
  offsetFromSelection: vi.fn(() => false),
  handleTrimClick: vi.fn(),
  trimFromSelection: vi.fn(() => false),
  handleExtendClick: vi.fn(),
  extendFromSelection: vi.fn(() => false),
  handleFilletClick: vi.fn(),
  filletFromSelection: vi.fn(() => false),
  handleChamferClick: vi.fn(),
  chamferFromSelection: vi.fn(() => false),
  handlePerpClick: vi.fn(),
  perpFromSelection: vi.fn(() => false),
  handleHorizontalClick: vi.fn(),
  horizontalFromSelection: vi.fn(() => false),
  handleParallelClick: vi.fn(),
  parallelFromSelection: vi.fn(() => false),
  handleBreakClick: vi.fn(),
  handleCenterMarkClick: vi.fn(),
  centerMarkFromSelection: vi.fn(() => false),
  handleScaleClick: vi.fn(),
  scaleFromSelection: vi.fn(() => false),
  handleFilletChamferClick: vi.fn(),
  filletChamferFromSelection: vi.fn(() => false),
  handleDimensionClick: vi.fn(),
  dimensionFromSelection: vi.fn(() => false),
  handleSnapPointClick: vi.fn(),
  handleMoveClick: vi.fn(),
  handleLineClick: vi.fn(),
  handleMeasureClick: vi.fn(),
  handleCircleClick: vi.fn(),
  handleArcClick: vi.fn(),
  handleRectClick: vi.fn(),
  handlePolylineClick: vi.fn(),
  measureSelection: vi.fn(() => false),
  handleTextClick: vi.fn(),
  handleAnchorClick: vi.fn(),
  removeAnchorsForObject: vi.fn(),
  removeAnchorAt: vi.fn(),
  hasAnchoredPoint: vi.fn(),
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

import { state, resetDrawingState } from '../js/state.js';
import { finishRectSelection } from '../js/events.js';
import { getObjectBounds, boundsOverlap } from '../js/render.js';
import { selectObjectAt } from '../js/geometry.js';
import { updateObjectList, updateProperties } from '../js/ui.js';

// ════════════════════════════════════════
// ── resetDrawingState – rect selection ──
// ════════════════════════════════════════
describe('resetDrawingState – rect selection cleanup', () => {
  beforeEach(() => {
    state.drawing = true;
    state.tempPoints = [{ x: 1, y: 2 }];
    state._rectSelecting = true;
    state._rectStart = { x: 10, y: 20 };
    state.multiSelected = new Set([0, 1, 2]);
    state.selectedPoint = [5, 10];
  });

  it('vyčistí _rectSelecting a _rectStart', () => {
    resetDrawingState();
    expect(state._rectSelecting).toBe(false);
    expect(state._rectStart).toBeNull();
  });

  it('vyčistí drawing a tempPoints', () => {
    resetDrawingState();
    expect(state.drawing).toBe(false);
    expect(state.tempPoints).toEqual([]);
  });

  it('vyčistí multiSelected a selectedPoint', () => {
    resetDrawingState();
    expect(state.multiSelected.size).toBe(0);
    expect(state.selectedPoint).toBeNull();
  });

  it('zavolá _toolCleanup pokud existuje a smaže ji', () => {
    const cleanup = vi.fn();
    state._toolCleanup = cleanup;
    resetDrawingState();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(state._toolCleanup).toBeNull();
  });

  it('zavolá _mirrorCleanup pokud existuje', () => {
    const mirrorCleanup = vi.fn();
    state._mirrorCleanup = mirrorCleanup;
    resetDrawingState();
    expect(mirrorCleanup).toHaveBeenCalledOnce();
    expect(state._mirrorCleanup).toBeNull();
    expect(state._mirrorObj).toBeNull();
  });
});

// ════════════════════════════════════════
// ── finishRectSelection ──
// ════════════════════════════════════════
describe('finishRectSelection', () => {
  beforeEach(() => {
    state.objects = [];
    state.selected = null;
    state.selectedPoint = null;
    state.multiSelected = new Set();
    state._rectSelecting = true;
    state._rectStart = { x: 0, y: 0 };
    state.mouse = { x: 0, y: 0, sx: 0, sy: 0, rawX: 0, rawY: 0 };
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    ];
    vi.clearAllMocks();
  });

  it('bez _rectStart jen vyčistí _rectSelecting', () => {
    state._rectStart = null;
    finishRectSelection();
    expect(state._rectSelecting).toBe(false);
    expect(updateObjectList).not.toHaveBeenCalled();
  });

  it('minimální pohyb → zachová se jako klik (selectObjectAt)', () => {
    state._rectStart = { x: 10, y: 20 };
    state.mouse.x = 10.1;
    state.mouse.y = 20.1;
    finishRectSelection();
    expect(selectObjectAt).toHaveBeenCalledWith(10, 20);
    expect(state._rectSelecting).toBe(false);
    expect(state._rectStart).toBeNull();
  });

  it('vybere objekty uvnitř obdélníku', () => {
    state.objects = [
      { type: 'point', x: 5, y: 5, layer: 0, id: 1 },
      { type: 'point', x: 50, y: 50, layer: 0, id: 2 },
      { type: 'point', x: 15, y: 15, layer: 0, id: 3 },
    ];
    state._rectStart = { x: 0, y: 0 };
    state.mouse.x = 20;
    state.mouse.y = 20;

    // Simulace: obj 0 a 2 jsou uvnitř, obj 1 ne
    getObjectBounds.mockImplementation((obj) => ({
      minX: obj.x - 1, minY: obj.y - 1,
      maxX: obj.x + 1, maxY: obj.y + 1,
    }));
    boundsOverlap.mockImplementation((ob, bbox) =>
      ob.minX >= bbox.minX && ob.maxX <= bbox.maxX &&
      ob.minY >= bbox.minY && ob.maxY <= bbox.maxY
    );

    finishRectSelection();

    expect(state.multiSelected.has(0)).toBe(true);
    expect(state.multiSelected.has(1)).toBe(false);
    expect(state.multiSelected.has(2)).toBe(true);
    expect(state._rectSelecting).toBe(false);
    expect(state._rectStart).toBeNull();
    expect(updateObjectList).toHaveBeenCalled();
    expect(updateProperties).toHaveBeenCalled();
  });

  it('jeden objekt → nastaví selected místo multiSelected', () => {
    state.objects = [
      { type: 'point', x: 5, y: 5, layer: 0, id: 1 },
    ];
    state._rectStart = { x: 0, y: 0 };
    state.mouse.x = 20;
    state.mouse.y = 20;

    getObjectBounds.mockReturnValue({ minX: 4, minY: 4, maxX: 6, maxY: 6 });
    boundsOverlap.mockReturnValue(true);

    finishRectSelection();

    expect(state.selected).toBe(0);
    expect(state.multiSelected.size).toBe(0);
  });

  it('přeskočí dimension a coordLabel objekty', () => {
    state.objects = [
      { type: 'line', x1: 1, y1: 1, x2: 5, y2: 5, layer: 0, id: 1, isDimension: true },
      { type: 'line', x1: 2, y1: 2, x2: 6, y2: 6, layer: 0, id: 2, isCoordLabel: true },
      { type: 'point', x: 3, y: 3, layer: 0, id: 3 },
    ];
    state._rectStart = { x: 0, y: 0 };
    state.mouse.x = 20;
    state.mouse.y = 20;

    getObjectBounds.mockReturnValue({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    boundsOverlap.mockReturnValue(true);

    finishRectSelection();

    // Jen index 2 (point), ne 0 (dimension) ani 1 (coordLabel)
    expect(state.selected).toBe(2);
    expect(state.multiSelected.size).toBe(0);
  });

  it('přeskočí objekty na neviditelné vrstvě', () => {
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
      { id: 1, name: 'Skrytá', color: '#ff0000', visible: false, locked: false },
    ];
    state.objects = [
      { type: 'point', x: 5, y: 5, layer: 0, id: 1 },
      { type: 'point', x: 6, y: 6, layer: 1, id: 2 },
    ];
    state._rectStart = { x: 0, y: 0 };
    state.mouse.x = 20;
    state.mouse.y = 20;

    getObjectBounds.mockReturnValue({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    boundsOverlap.mockReturnValue(true);

    finishRectSelection();

    expect(state.selected).toBe(0);
    expect(state.multiSelected.size).toBe(0);
  });

  it('přeskočí objekty na zamčené vrstvě', () => {
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
      { id: 1, name: 'Zamčená', color: '#ff0000', visible: true, locked: true },
    ];
    state.objects = [
      { type: 'point', x: 5, y: 5, layer: 0, id: 1 },
      { type: 'point', x: 6, y: 6, layer: 1, id: 2 },
    ];
    state._rectStart = { x: 0, y: 0 };
    state.mouse.x = 20;
    state.mouse.y = 20;

    getObjectBounds.mockReturnValue({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    boundsOverlap.mockReturnValue(true);

    finishRectSelection();

    expect(state.selected).toBe(0);
    expect(state.multiSelected.size).toBe(0);
  });

  it('žádný objekt uvnitř → nic nevybráno', () => {
    state.objects = [
      { type: 'point', x: 100, y: 100, layer: 0, id: 1 },
    ];
    state._rectStart = { x: 0, y: 0 };
    state.mouse.x = 20;
    state.mouse.y = 20;

    getObjectBounds.mockReturnValue({ minX: 99, minY: 99, maxX: 101, maxY: 101 });
    boundsOverlap.mockReturnValue(false);

    finishRectSelection();

    expect(state.selected).toBeNull();
    expect(state.multiSelected.size).toBe(0);
  });
});

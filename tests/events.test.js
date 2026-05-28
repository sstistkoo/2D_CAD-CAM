// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: events.js (handleCanvasClick)               ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Globals MUST be set via vi.hoisted so they exist before any module evaluation
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
vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

// Mock ui.js
const mockSetTool = vi.fn();
const mockResetHint = vi.fn();
const mockSetHint = vi.fn();
const mockUpdateProperties = vi.fn();
const mockUpdateObjectList = vi.fn();
vi.mock('../js/ui.js', () => ({
  setTool: (...args) => mockSetTool(...args),
  resetHint: (...args) => mockResetHint(...args),
  setHint: (...args) => mockSetHint(...args),
  updateProperties: (...args) => mockUpdateProperties(...args),
  updateObjectList: (...args) => mockUpdateObjectList(...args),
  updateSnapPtsBtn: vi.fn(),
  updateDimsBtn: vi.fn(),
  toggleCoordMode: vi.fn(),
  updateCoordModeBtn: vi.fn(),
  updateSnapGridBtn: vi.fn(),
  updateAngleSnapBtn: vi.fn(),
  showGridSizeDialog: vi.fn(),
  showAngleSnapDialog: vi.fn(),
  toggleHelp: vi.fn(),
  updateStatusProject: vi.fn(),
  updateLayerList: vi.fn(),
  updateMachineTypeBtn: vi.fn(),
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
    addEventListener: vi.fn(),
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  },
  screenToWorld: vi.fn((sx, sy) => [sx, sy]),
  snapPt: vi.fn((x, y) => [x, y]),
  autoCenterView: vi.fn(),
  applyAngleSnap: vi.fn((x, y) => [x, y]),
}));

// Mock dialogs.js
vi.mock('../js/dialogs.js', () => ({
  showNumericalInputDialog: vi.fn(),
  showPolarDrawingDialog: vi.fn(),
  showCircleRadiusDialog: vi.fn(),
  showBulgeDialog: vi.fn(),
  showMirrorDialog: vi.fn(),
  showLinearArrayDialog: vi.fn(),
  showRotateDialog: vi.fn(),
}));

// Mock storage.js
vi.mock('../js/storage.js', () => ({
  saveProject: vi.fn(),
  showExportImageDialog: vi.fn(),
  showProjectsDialog: vi.fn(),
  showSaveAsDialog: vi.fn(),
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

// Mock tools/index.js
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

import { state } from '../js/state.js';
import { handleCanvasClick } from '../js/events.js';
import { addObject } from '../js/objects.js';
import { selectObjectAt } from '../js/geometry.js';
import {
  handleTangentClick, handleOffsetClick, handleTrimClick,
  handleExtendClick, handleFilletClick, handlePerpClick,
  handleHorizontalClick, handleParallelClick, handleDimensionClick,
  handleSnapPointClick, handleMoveClick, handleLineClick,
  handleMeasureClick, handleCircleClick, handleArcClick,
  handleRectClick, handlePolylineClick,
} from '../js/tools/index.js';

// ════════════════════════════════════════
// ── handleCanvasClick ──
// ════════════════════════════════════════
describe('handleCanvasClick', () => {
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
    ];
    vi.clearAllMocks();
  });

  // ── Select ──
  it('volá selectObjectAt při nástroji "select"', () => {
    state.tool = 'select';
    handleCanvasClick(10, 20);
    expect(selectObjectAt).toHaveBeenCalledWith(10, 20);
  });

  // ── Point ──
  it('přidá bod při nástroji "point"', () => {
    state.tool = 'point';
    handleCanvasClick(5, 15);
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]).toMatchObject({ type: 'point', x: 5, y: 15 });
  });

  it('bod má správné id a název', () => {
    state.tool = 'point';
    state.nextId = 42;
    handleCanvasClick(0, 0);
    expect(state.objects[0].name).toBe('Bod 42');
  });

  // ── Line / constr ──
  it('volá handleLineClick při nástroji "line"', () => {
    state.tool = 'line';
    handleCanvasClick(1, 2);
    expect(handleLineClick).toHaveBeenCalledWith(1, 2);
  });

  it('volá handleLineClick při nástroji "constr"', () => {
    state.tool = 'constr';
    handleCanvasClick(3, 4);
    expect(handleLineClick).toHaveBeenCalledWith(3, 4);
  });

  // ── Circle ──
  it('volá handleCircleClick při nástroji "circle"', () => {
    state.tool = 'circle';
    handleCanvasClick(5, 6);
    expect(handleCircleClick).toHaveBeenCalledWith(5, 6);
  });

  // ── Arc ──
  it('volá handleArcClick při nástroji "arc"', () => {
    state.tool = 'arc';
    handleCanvasClick(7, 8);
    expect(handleArcClick).toHaveBeenCalledWith(7, 8);
  });

  // ── Rect ──
  it('volá handleRectClick při nástroji "rect"', () => {
    state.tool = 'rect';
    handleCanvasClick(9, 10);
    expect(handleRectClick).toHaveBeenCalledWith(9, 10);
  });

  // ── Polyline ──
  it('volá handlePolylineClick při nástroji "polyline"', () => {
    state.tool = 'polyline';
    handleCanvasClick(11, 12);
    expect(handlePolylineClick).toHaveBeenCalledWith(11, 12);
  });

  // ── Measure ──
  it('volá handleMeasureClick při nástroji "measure"', () => {
    state.tool = 'measure';
    handleCanvasClick(13, 14);
    expect(handleMeasureClick).toHaveBeenCalledWith(13, 14);
  });

  // ── Move ──
  it('volá handleMoveClick při nástroji "move"', () => {
    state.tool = 'move';
    handleCanvasClick(15, 16);
    expect(handleMoveClick).toHaveBeenCalledWith(15, 16);
  });

  // ── Tangent ──
  it('volá handleTangentClick při nástroji "tangent"', () => {
    state.tool = 'tangent';
    handleCanvasClick(17, 18);
    expect(handleTangentClick).toHaveBeenCalledWith(17, 18);
  });

  // ── Offset ──
  it('volá handleOffsetClick při nástroji "offset"', () => {
    state.tool = 'offset';
    handleCanvasClick(1, 1);
    expect(handleOffsetClick).toHaveBeenCalledWith(1, 1);
  });

  // ── Trim ──
  it('volá handleTrimClick při nástroji "trim"', () => {
    state.tool = 'trim';
    handleCanvasClick(2, 2);
    expect(handleTrimClick).toHaveBeenCalledWith(2, 2);
  });

  // ── Extend ──
  it('volá handleExtendClick při nástroji "extend"', () => {
    state.tool = 'extend';
    handleCanvasClick(3, 3);
    expect(handleExtendClick).toHaveBeenCalledWith(3, 3);
  });

  // ── Fillet ──
  it('volá handleFilletClick při nástroji "fillet"', () => {
    state.tool = 'fillet';
    handleCanvasClick(4, 4);
    expect(handleFilletClick).toHaveBeenCalledWith(4, 4);
  });

  // ── Perp ──
  it('volá handlePerpClick při nástroji "perp"', () => {
    state.tool = 'perp';
    handleCanvasClick(5, 5);
    expect(handlePerpClick).toHaveBeenCalledWith(5, 5);
  });

  // ── Horizontal ──
  it('volá handleHorizontalClick při nástroji "horizontal"', () => {
    state.tool = 'horizontal';
    handleCanvasClick(6, 6);
    expect(handleHorizontalClick).toHaveBeenCalledWith(6, 6);
  });

  // ── Parallel ──
  it('volá handleParallelClick při nástroji "parallel"', () => {
    state.tool = 'parallel';
    handleCanvasClick(7, 7);
    expect(handleParallelClick).toHaveBeenCalledWith(7, 7);
  });

  // ── Dimension ──
  it('volá handleDimensionClick při nástroji "dimension"', () => {
    state.tool = 'dimension';
    handleCanvasClick(8, 8);
    expect(handleDimensionClick).toHaveBeenCalledWith(8, 8);
  });

  // ── SnapPoint ──
  it('volá handleSnapPointClick při nástroji "snapPoint"', () => {
    state.tool = 'snapPoint';
    handleCanvasClick(9, 9);
    expect(handleSnapPointClick).toHaveBeenCalledWith(9, 9);
  });

  // ── Více bodů postupně ──
  it('přidá více bodů s inkrementujícím id', () => {
    state.tool = 'point';
    handleCanvasClick(0, 0);
    handleCanvasClick(10, 10);
    handleCanvasClick(20, 20);
    expect(state.objects).toHaveLength(3);
    expect(state.objects[0].id).not.toBe(state.objects[1].id);
    expect(state.objects[1].id).not.toBe(state.objects[2].id);
  });
});

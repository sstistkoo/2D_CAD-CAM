// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: koordinační indikátory (SOU/KAR, ABS/INC,  ║
// ║          R/⌀) a mobilní coord bar                           ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Tracked DOM elements ──
const trackedElements = {};

vi.hoisted(() => {
  const mockClassList = () => {
    const classes = new Set();
    return {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, force) => { force ? classes.add(c) : classes.delete(c); },
      contains: (c) => classes.has(c),
      _classes: classes,
    };
  };

  const mockEl = (id) => {
    const el = {
      id,
      disabled: false,
      classList: mockClassList(),
      textContent: '',
      innerHTML: '',
      style: {},
      addEventListener: vi.fn(),
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
      querySelector: () => null,
      querySelectorAll: () => [],
      closest: () => null,
      remove: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    };
    return el;
  };

  // Pre-create tracked indicator elements
  globalThis._trackedElements = {};
  const tracked = [
    'indMachine', 'indCoordMode', 'indXDisplay',
    'indGrid', 'indAngle', 'indDims',
    'btnCoordMode', 'btnXDisplay', 'btnMachineType',
    'coordBarText', 'coordDisplay',
    'drawCanvas', 'canvasWrap',
  ];
  // drawCanvas needs getContext
  const canvasCtx = {
    save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    setTransform: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    measureText: () => ({ width: 10 }),
    fillText: vi.fn(), strokeText: vi.fn(),
    lineWidth: 1, strokeStyle: '', fillStyle: '', font: '',
    globalAlpha: 1, setLineDash: vi.fn(), lineDashOffset: 0,
    textAlign: '', textBaseline: '',
  };
  for (const id of tracked) {
    const el = mockEl(id);
    if (id === 'drawCanvas') {
      el.getContext = () => canvasCtx;
      el.width = 800;
      el.height = 600;
    }
    if (id === 'canvasWrap') {
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    }
    globalThis._trackedElements[id] = el;
  }

  globalThis.document = {
    getElementById: (id) => globalThis._trackedElements[id] || mockEl(id),
    createElement: () => mockEl('_dynamic'),
    body: {
      appendChild: vi.fn(),
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
      contains: () => true,
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
  };
  globalThis.window = {
    innerWidth: 1024, innerHeight: 768,
    addEventListener: vi.fn(),
    requestAnimationFrame: (cb) => cb(),
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: vi.fn(), clipboard: { writeText: () => Promise.resolve() } },
    writable: true, configurable: true,
  });
});

vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

import { state } from '../js/state.js';
import {
  updateCoordModeBtn,
  updateXDisplayBtn,
  updateMachineTypeBtn,
} from '../js/ui.js';

// ════════════════════════════════════════
// ── Coord Mode indicator (ABS/INC) ──
// ════════════════════════════════════════
describe('indCoordMode indicator', () => {
  const ind = () => globalThis._trackedElements.indCoordMode;

  beforeEach(() => {
    state.coordMode = 'abs';
    ind().textContent = '';
    ind().classList._classes.clear();
  });

  it('ABS mode: text "ABS", no alt class', () => {
    state.coordMode = 'abs';
    updateCoordModeBtn();
    expect(ind().textContent).toBe('ABS');
    expect(ind().classList.contains('alt')).toBe(false);
  });

  it('INC mode: text "INC", has alt class', () => {
    state.coordMode = 'inc';
    updateCoordModeBtn();
    expect(ind().textContent).toBe('INC');
    expect(ind().classList.contains('alt')).toBe(true);
  });

  it('toggle back removes alt class', () => {
    state.coordMode = 'inc';
    updateCoordModeBtn();
    expect(ind().classList.contains('alt')).toBe(true);
    state.coordMode = 'abs';
    updateCoordModeBtn();
    expect(ind().classList.contains('alt')).toBe(false);
  });
});

// ════════════════════════════════════════
// ── X Display indicator (R/⌀) ──
// ════════════════════════════════════════
describe('indXDisplay indicator', () => {
  const ind = () => globalThis._trackedElements.indXDisplay;

  beforeEach(() => {
    state.xDisplayMode = 'radius';
    ind().textContent = '';
    ind().classList._classes.clear();
  });

  it('radius mode: text "R", no alt class', () => {
    state.xDisplayMode = 'radius';
    updateXDisplayBtn();
    expect(ind().textContent).toBe('R');
    expect(ind().classList.contains('alt')).toBe(false);
  });

  it('diameter mode: text "⌀", has alt class', () => {
    state.xDisplayMode = 'diameter';
    updateXDisplayBtn();
    expect(ind().textContent).toBe('⌀');
    expect(ind().classList.contains('alt')).toBe(true);
  });
});

// ════════════════════════════════════════
// ── Machine Type indicator (SOU/KAR) ──
// ════════════════════════════════════════
describe('indMachine indicator', () => {
  const ind = () => globalThis._trackedElements.indMachine;

  beforeEach(() => {
    state.machineType = 'soustruh';
    ind().textContent = '';
    ind().classList._classes.clear();
  });

  it('soustruh mode: text "SOU", no alt class', () => {
    state.machineType = 'soustruh';
    updateMachineTypeBtn();
    expect(ind().textContent).toBe('SOU');
    expect(ind().classList.contains('alt')).toBe(false);
  });

  it('karusel mode: text "KAR", has alt class', () => {
    state.machineType = 'karusel';
    updateMachineTypeBtn();
    expect(ind().textContent).toBe('KAR');
    expect(ind().classList.contains('alt')).toBe(true);
  });

  it('toggle back removes alt class', () => {
    state.machineType = 'karusel';
    updateMachineTypeBtn();
    expect(ind().classList.contains('alt')).toBe(true);
    state.machineType = 'soustruh';
    updateMachineTypeBtn();
    expect(ind().classList.contains('alt')).toBe(false);
  });
});

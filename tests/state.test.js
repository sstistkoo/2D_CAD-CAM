// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: state.js (undo/redo, toast, stav)          ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM
vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false,
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '',
  }),
  createElement: (tag) => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
});

vi.stubGlobal('window', {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: vi.fn(),
});

vi.stubGlobal('navigator', { vibrate: vi.fn() });

// Mock render.js
vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

import { state, pushUndo, undo, redo, showToast, toDisplayCoords, fromIncToAbs, toDisplayAngle } from '../js/state.js';

// ════════════════════════════════════════
// ── pushUndo ──
// ════════════════════════════════════════
describe('pushUndo', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.selected = null;
    state.drawing = false;
    state.tool = 'select';
  });

  it('uloží aktuální stav objektů na undo stack', () => {
    state.objects = [{ type: 'point', x: 1, y: 2, id: 1 }];
    pushUndo();
    expect(state.undoStack).toHaveLength(1);
    const saved = JSON.parse(state.undoStack[0]);
    expect(saved.objects).toHaveLength(1);
    expect(saved.objects[0].x).toBe(1);
  });

  it('vymaže redo stack po pushUndo', () => {
    state.redoStack = ['["something"]'];
    pushUndo();
    expect(state.redoStack).toHaveLength(0);
  });

  it('ukládá hlubokou kopii (ne referenci)', () => {
    state.objects = [{ type: 'point', x: 5, y: 5, id: 1 }];
    pushUndo();
    state.objects[0].x = 99;
    const saved = JSON.parse(state.undoStack[0]);
    expect(saved.objects[0].x).toBe(5); // nepozměněný
  });

  it('více pushUndo přidává na stack', () => {
    state.objects = [{ type: 'point', x: 0, y: 0, id: 1 }];
    pushUndo();
    state.objects = [{ type: 'point', x: 10, y: 10, id: 1 }];
    pushUndo();
    state.objects = [{ type: 'point', x: 20, y: 20, id: 1 }];
    pushUndo();
    expect(state.undoStack).toHaveLength(3);
  });
});

// ════════════════════════════════════════
// ── maxUndo limit ──
// ════════════════════════════════════════
describe('maxUndo limit', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.selected = null;
    state.drawing = false;
    state.tool = 'select';
  });

  it('undo stack nepřeroste maxUndo (50)', () => {
    for (let i = 0; i < 60; i++) {
      state.objects = [{ type: 'point', x: i, y: i, id: 1 }];
      pushUndo();
    }
    expect(state.undoStack.length).toBeLessThanOrEqual(state.maxUndo);
    expect(state.undoStack.length).toBe(50);
  });

  it('při překročení limitu se odstraní nejstarší stav', () => {
    for (let i = 0; i < 55; i++) {
      state.objects = [{ type: 'point', x: i, y: 0, id: 1 }];
      pushUndo();
    }
    // Nejstarší stavy (0-4) by měly být odstraněny
    const oldest = JSON.parse(state.undoStack[0]);
    expect(oldest.objects[0].x).toBe(5); // 0,1,2,3,4 odstraněny
  });
});

// ════════════════════════════════════════
// ── undo ──
// ════════════════════════════════════════
describe('undo', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.selected = null;
    state.drawing = false;
    state.tool = 'select';
  });

  it('obnoví předchozí stav objektů', () => {
    state.objects = [{ type: 'point', x: 1, y: 1, id: 1 }];
    pushUndo();
    state.objects = [{ type: 'point', x: 99, y: 99, id: 1 }];
    undo();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].x).toBe(1);
  });

  it('přesune stav na redo stack', () => {
    state.objects = [{ type: 'point', x: 1, y: 1, id: 1 }];
    pushUndo();
    state.objects = [{ type: 'point', x: 2, y: 2, id: 1 }];
    undo();
    expect(state.redoStack).toHaveLength(1);
    const redoState = JSON.parse(state.redoStack[0]);
    expect(redoState.objects[0].x).toBe(2);
  });

  it('na prázdném undo stacku se nic nestane', () => {
    state.objects = [{ type: 'point', x: 42, y: 42, id: 1 }];
    undo();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].x).toBe(42);
  });

  it('vícenásobné undo postupně obnovuje stavy', () => {
    state.objects = [];
    pushUndo(); // stav 0: []

    state.objects = [{ type: 'point', x: 1, y: 1, id: 1 }];
    pushUndo(); // stav 1: [point(1,1)]

    state.objects = [{ type: 'point', x: 2, y: 2, id: 1 }];
    // aktuální: [point(2,2)]

    undo(); // → [point(1,1)]
    expect(state.objects[0].x).toBe(1);

    undo(); // → []
    expect(state.objects).toHaveLength(0);
  });

  it('resetuje selected po undo', () => {
    state.objects = [{ type: 'point', x: 1, y: 1, id: 1 }];
    pushUndo();
    state.selected = 0;
    state.objects = [{ type: 'point', x: 2, y: 2, id: 1 }];
    undo();
    expect(state.selected).toBeNull();
  });
});

// ════════════════════════════════════════
// ── redo ──
// ════════════════════════════════════════
describe('redo', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.selected = null;
    state.drawing = false;
    state.tool = 'select';
  });

  it('obnoví stav po undo', () => {
    state.objects = [{ type: 'point', x: 1, y: 1, id: 1 }];
    pushUndo();
    state.objects = [{ type: 'point', x: 5, y: 5, id: 1 }];
    undo();
    expect(state.objects[0].x).toBe(1);
    redo();
    expect(state.objects[0].x).toBe(5);
  });

  it('na prázdném redo stacku se nic nestane', () => {
    state.objects = [{ type: 'point', x: 42, y: 42, id: 1 }];
    redo();
    expect(state.objects[0].x).toBe(42);
  });

  it('undo → redo → undo cyklus zachová konzistenci', () => {
    state.objects = [];
    pushUndo();
    state.objects = [{ type: 'point', x: 10, y: 10, id: 1 }];

    undo();
    expect(state.objects).toHaveLength(0);

    redo();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].x).toBe(10);

    undo();
    expect(state.objects).toHaveLength(0);
  });

  it('pushUndo po undo vymaže redo stack', () => {
    state.objects = [];
    pushUndo();
    state.objects = [{ type: 'point', x: 1, y: 1, id: 1 }];
    undo();
    expect(state.redoStack).toHaveLength(1);
    pushUndo(); // nový push → redo se vymaže
    expect(state.redoStack).toHaveLength(0);
  });
});

// ════════════════════════════════════════
// ── showToast ──
// ════════════════════════════════════════
describe('showToast', () => {
  it('nevyhodí chybu v Node prostředí', () => {
    expect(() => showToast('Test zpráva')).not.toThrow();
  });

  it('nevyhodí chybu s vlastním duration', () => {
    expect(() => showToast('Krátká', 500)).not.toThrow();
  });

  it('nevyhodí chybu s prázdným řetězcem', () => {
    expect(() => showToast('')).not.toThrow();
  });
});

// ════════════════════════════════════════
// ── toDisplayCoords s rotací ──
// ════════════════════════════════════════
describe('toDisplayCoords s rotací nulového bodu', () => {
  beforeEach(() => {
    state.coordMode = 'inc';
    state.incReference = { x: 0, y: 0 };
    state.nullPointActive = false;
    state.nullPointAngle = 0;
  });

  it('inc bez rotace – prostý offset', () => {
    state.incReference = { x: 10, y: 5 };
    const d = toDisplayCoords(15, 8);
    expect(d.x).toBeCloseTo(5);
    expect(d.y).toBeCloseTo(3);
  });

  it('inc s rotací 90° – souřadnice se otočí', () => {
    state.nullPointActive = true;
    state.nullPointAngle = 90;
    // Bod (10, 0) → offset (10, 0) → rotace -90°: lx = 0, ly = -10
    const d = toDisplayCoords(10, 0);
    expect(d.x).toBeCloseTo(0, 5);
    expect(d.y).toBeCloseTo(-10, 5);
  });

  it('inc s rotací 45° – diagonální transformace', () => {
    state.nullPointActive = true;
    state.nullPointAngle = 45;
    const sq = Math.SQRT2 / 2;
    // Bod (1, 0) → rotace -45°: lx = cos(-45)*1 = sq, ly = sin(-45)*1 = -sq
    const d = toDisplayCoords(1, 0);
    expect(d.x).toBeCloseTo(sq, 5);
    expect(d.y).toBeCloseTo(-sq, 5);
  });

  it('abs režim – ignoruje rotaci', () => {
    state.coordMode = 'abs';
    state.nullPointActive = true;
    state.nullPointAngle = 45;
    const d = toDisplayCoords(10, 5);
    expect(d.x).toBe(10);
    expect(d.y).toBe(5);
  });
});

// ════════════════════════════════════════
// ── fromIncToAbs s rotací ──
// ════════════════════════════════════════
describe('fromIncToAbs s rotací nulového bodu', () => {
  beforeEach(() => {
    state.incReference = { x: 0, y: 0 };
    state.nullPointActive = false;
    state.nullPointAngle = 0;
  });

  it('bez rotace – prostý offset', () => {
    state.incReference = { x: 10, y: 5 };
    const abs = fromIncToAbs(3, 2);
    expect(abs.x).toBeCloseTo(13);
    expect(abs.y).toBeCloseTo(7);
  });

  it('s rotací 90° – inverzní rotace', () => {
    state.nullPointActive = true;
    state.nullPointAngle = 90;
    state.incReference = { x: 0, y: 0 };
    // Lokální (10, 0) → rotace +90°: abs.x = 0, abs.y = 10
    const abs = fromIncToAbs(10, 0);
    expect(abs.x).toBeCloseTo(0, 5);
    expect(abs.y).toBeCloseTo(10, 5);
  });

  it('roundtrip: toDisplayCoords → fromIncToAbs', () => {
    state.coordMode = 'inc';
    state.nullPointActive = true;
    state.nullPointAngle = 37;
    state.incReference = { x: 15, y: 20 };
    const wx = 42, wy = 13;
    const d = toDisplayCoords(wx, wy);
    const back = fromIncToAbs(d.x, d.y);
    expect(back.x).toBeCloseTo(wx, 8);
    expect(back.y).toBeCloseTo(wy, 8);
  });
});

// ════════════════════════════════════════
// ── toDisplayAngle ──
// ════════════════════════════════════════
describe('toDisplayAngle', () => {
  beforeEach(() => {
    state.nullPointActive = false;
    state.nullPointAngle = 0;
  });

  it('bez rotace – úhel beze změny', () => {
    expect(toDisplayAngle(45)).toBe(45);
    expect(toDisplayAngle(90)).toBe(90);
  });

  it('s rotací 30° – odečte offset', () => {
    state.nullPointActive = true;
    state.nullPointAngle = 30;
    expect(toDisplayAngle(30)).toBe(0);
    expect(toDisplayAngle(90)).toBe(60);
    expect(toDisplayAngle(0)).toBe(-30);
  });
});

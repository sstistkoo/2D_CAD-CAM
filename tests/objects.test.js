// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: objects.js (addObject, moveObject)          ║
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

// Mock render.js
vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

// Mock ui.js
vi.mock('../js/ui.js', () => ({
  updateObjectList: vi.fn(),
  updateProperties: vi.fn(),
}));

// Mock geometry.js (calculateAllIntersections volá renderAll)
vi.mock('../js/geometry.js', () => ({
  calculateAllIntersections: vi.fn(),
}));

// Mock canvas.js
vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(),
  drawCanvas: { width: 800, height: 600 },
}));

import { state } from '../js/state.js';
import { addObject, moveObject } from '../js/objects.js';

// ════════════════════════════════════════
// ── addObject ──
// ════════════════════════════════════════
describe('addObject', () => {
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

  it('přidá objekt do state.objects', () => {
    addObject({ type: 'point', x: 10, y: 20 });
    expect(state.objects).toHaveLength(1);
  });

  it('přiřadí unikátní ID', () => {
    const obj1 = addObject({ type: 'point', x: 0, y: 0 });
    const obj2 = addObject({ type: 'point', x: 1, y: 1 });
    expect(obj1.id).toBe(1);
    expect(obj2.id).toBe(2);
  });

  it('inkrementuje nextId', () => {
    addObject({ type: 'point', x: 0, y: 0 });
    expect(state.nextId).toBe(2);
    addObject({ type: 'point', x: 1, y: 1 });
    expect(state.nextId).toBe(3);
  });

  it('přiřadí aktivní vrstvu pokud není specifikována', () => {
    state.activeLayer = 0;
    const obj = addObject({ type: 'point', x: 0, y: 0 });
    expect(obj.layer).toBe(0);
  });

  it('konstrukce jdou na vrstvu 1', () => {
    const obj = addObject({ type: 'constr', x1: 0, y1: 0, x2: 10, y2: 10 });
    expect(obj.layer).toBe(1);
  });

  it('respektuje explicitně zadanou vrstvu', () => {
    const obj = addObject({ type: 'point', x: 0, y: 0, layer: 1 });
    expect(obj.layer).toBe(1);
  });

  it('uloží undo stav před přidáním', () => {
    addObject({ type: 'point', x: 5, y: 5 });
    expect(state.undoStack).toHaveLength(1);
  });

  it('odmítne objekt s nekonečnou hodnotou', () => {
    const result = addObject({ type: 'point', x: Infinity, y: 0 });
    expect(result).toBeNull();
  });

  it('odmítne objekt s NaN hodnotou', () => {
    const result = addObject({ type: 'point', x: NaN, y: 0 });
    expect(result).toBeNull();
  });

  it('přidá úsečku se správnými souřadnicemi', () => {
    const obj = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 20 });
    expect(obj.type).toBe('line');
    expect(obj.x1).toBe(0);
    expect(obj.y1).toBe(0);
    expect(obj.x2).toBe(10);
    expect(obj.y2).toBe(20);
  });

  it('přidá kružnici se správnými parametry', () => {
    const obj = addObject({ type: 'circle', cx: 5, cy: 5, r: 10 });
    expect(obj.type).toBe('circle');
    expect(obj.cx).toBe(5);
    expect(obj.cy).toBe(5);
    expect(obj.r).toBe(10);
  });

  it('vrátí přidaný objekt', () => {
    const result = addObject({ type: 'point', x: 42, y: 42 });
    expect(result).toBeDefined();
    expect(result.x).toBe(42);
  });
});

// ════════════════════════════════════════
// ── moveObject ──
// ════════════════════════════════════════
describe('moveObject', () => {
  it('posune bod', () => {
    const obj = { type: 'point', x: 10, y: 20 };
    moveObject(obj, 5, -3);
    expect(obj.x).toBe(15);
    expect(obj.y).toBe(17);
  });

  it('posune úsečku (oba konce)', () => {
    const obj = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
    moveObject(obj, 5, 5);
    expect(obj.x1).toBe(5);
    expect(obj.y1).toBe(5);
    expect(obj.x2).toBe(15);
    expect(obj.y2).toBe(15);
  });

  it('posune konstrukci (oba konce)', () => {
    const obj = { type: 'constr', x1: 0, y1: 0, x2: 20, y2: 0 };
    moveObject(obj, -10, 10);
    expect(obj.x1).toBe(-10);
    expect(obj.y1).toBe(10);
    expect(obj.x2).toBe(10);
    expect(obj.y2).toBe(10);
  });

  it('posune kružnici (střed)', () => {
    const obj = { type: 'circle', cx: 50, cy: 50, r: 20 };
    moveObject(obj, -30, -30);
    expect(obj.cx).toBe(20);
    expect(obj.cy).toBe(20);
    expect(obj.r).toBe(20); // poloměr se nemění
  });

  it('posune oblouk (střed, poloměr a úhly se nemění)', () => {
    const obj = { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: Math.PI };
    moveObject(obj, 5, 5);
    expect(obj.cx).toBe(5);
    expect(obj.cy).toBe(5);
    expect(obj.r).toBe(10);
    expect(obj.startAngle).toBe(0);
    expect(obj.endAngle).toBe(Math.PI);
  });

  it('posune obdélník (oba rohy)', () => {
    const obj = { type: 'rect', x1: 0, y1: 0, x2: 20, y2: 10 };
    moveObject(obj, 10, 10);
    expect(obj.x1).toBe(10);
    expect(obj.y1).toBe(10);
    expect(obj.x2).toBe(30);
    expect(obj.y2).toBe(20);
  });

  it('posune polyline (všechny vrcholy)', () => {
    const obj = {
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0],
    };
    moveObject(obj, 5, 5);
    expect(obj.vertices[0]).toEqual({ x: 5, y: 5 });
    expect(obj.vertices[1]).toEqual({ x: 15, y: 5 });
    expect(obj.vertices[2]).toEqual({ x: 15, y: 15 });
  });

  it('zachová ostatní vlastnosti bodu', () => {
    const obj = { type: 'point', x: 0, y: 0, id: 42, layer: 1, color: '#ff0000' };
    moveObject(obj, 10, 10);
    expect(obj.id).toBe(42);
    expect(obj.layer).toBe(1);
    expect(obj.color).toBe('#ff0000');
  });

  it('zachová ostatní vlastnosti kružnice', () => {
    const obj = { type: 'circle', cx: 0, cy: 0, r: 25, id: 7, layer: 0 };
    moveObject(obj, 3, 4);
    expect(obj.r).toBe(25);
    expect(obj.id).toBe(7);
    expect(obj.layer).toBe(0);
  });

  it('zachová bulges polyline při přesunu', () => {
    const obj = {
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0.5, 0],
      closed: true,
    };
    moveObject(obj, 1, 1);
    expect(obj.bulges).toEqual([0.5, 0]);
    expect(obj.closed).toBe(true);
  });

  it('nulový posun nemění souřadnice', () => {
    const obj = { type: 'line', x1: 5, y1: 10, x2: 15, y2: 20 };
    moveObject(obj, 0, 0);
    expect(obj.x1).toBe(5);
    expect(obj.y1).toBe(10);
    expect(obj.x2).toBe(15);
    expect(obj.y2).toBe(20);
  });

  it('záporný posun funguje správně', () => {
    const obj = { type: 'point', x: 0, y: 0 };
    moveObject(obj, -100, -200);
    expect(obj.x).toBe(-100);
    expect(obj.y).toBe(-200);
  });
});

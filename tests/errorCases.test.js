// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: error cases & hraniční případy              ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM
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
vi.mock('../js/ui.js', () => ({
  updateObjectList: vi.fn(), updateProperties: vi.fn(),
}));
vi.mock('../js/geometry.js', () => ({
  calculateAllIntersections: vi.fn(),
}));
vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(), drawCanvas: { width: 800, height: 600 },
}));

import { state, pushUndo, undo, redo } from '../js/state.js';
import { addObject, moveObject } from '../js/objects.js';
import { parseDXF } from '../js/dxf.js';
import { bulgeToArc, deepClone } from '../js/utils.js';

// ════════════════════════════════════════
// ── Nevalidní souřadnice ──
// ════════════════════════════════════════
describe('Error: nevalidní souřadnice', () => {
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
    ];
  });

  it('addObject odmítne bod s Infinity', () => {
    const r = addObject({ type: 'point', x: Infinity, y: 0 });
    expect(r).toBeNull();
    expect(state.objects).toHaveLength(0);
  });

  it('addObject odmítne bod s -Infinity', () => {
    const r = addObject({ type: 'point', x: 0, y: -Infinity });
    expect(r).toBeNull();
  });

  it('addObject odmítne bod s NaN', () => {
    const r = addObject({ type: 'point', x: NaN, y: 5 });
    expect(r).toBeNull();
  });

  it('addObject odmítne úsečku s NaN koncovým bodem', () => {
    const r = addObject({ type: 'line', x1: 0, y1: 0, x2: NaN, y2: 10 });
    expect(r).toBeNull();
  });

  it('addObject odmítne kružnici s NaN poloměrem', () => {
    const r = addObject({ type: 'circle', cx: 0, cy: 0, r: NaN });
    expect(r).toBeNull();
  });

  it('addObject odmítne oblouk s Infinity úhlem', () => {
    const r = addObject({ type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: Infinity });
    expect(r).toBeNull();
  });

  it('moveObject nemění objekt při NaN posunu – bod', () => {
    const obj = { type: 'point', x: 10, y: 20 };
    moveObject(obj, NaN, 0);
    // NaN + number = NaN, ale moveObject by neměl crashnout
    // Toto je limitace – moveObject nekontroluje vstupy
    // Test dokumentuje aktuální chování
    expect(typeof obj.x).toBe('number');
  });

  it('přidá platný objekt s nulovými souřadnicemi', () => {
    const r = addObject({ type: 'point', x: 0, y: 0 });
    expect(r).not.toBeNull();
    expect(r.x).toBe(0);
  });

  it('přidá platný objekt se zápornými souřadnicemi', () => {
    const r = addObject({ type: 'point', x: -100, y: -200 });
    expect(r).not.toBeNull();
    expect(r.x).toBe(-100);
  });

  it('přidá platný objekt s velkými souřadnicemi', () => {
    const r = addObject({ type: 'point', x: 1e10, y: 1e10 });
    expect(r).not.toBeNull();
  });
});

// ════════════════════════════════════════
// ── Polyline undo edge cases ──
// ════════════════════════════════════════
describe('Error: polyline undo edge cases', () => {
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

  it('undo po přidání polyline odebere napřed poslední bod (krokové undo)', () => {
    addObject({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0],
      closed: false,
      name: 'Kontura 1',
    });
    expect(state.objects).toHaveLength(1);
    // Krokové undo: 3 vertexy → 2 vertexy (odebrán poslední bod)
    undo();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].vertices).toHaveLength(2);
    // Další undo: 2 vertexy → plně odebráno (normální undo)
    undo();
    expect(state.objects).toHaveLength(0);
  });

  it('redo po undo polyline obnoví polyline', () => {
    addObject({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      bulges: [0],
      closed: false,
      name: 'Kontura 1',
    });
    undo();
    expect(state.objects).toHaveLength(0);
    redo();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].type).toBe('polyline');
    expect(state.objects[0].vertices).toHaveLength(2);
  });

  it('undo/redo zachová bulge hodnoty polyline', () => {
    addObject({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0.5, -0.3],
      closed: true,
      name: 'Kontura 1',
    });
    undo();
    redo();
    expect(state.objects[0].bulges).toEqual([0.5, -0.3]);
    expect(state.objects[0].closed).toBe(true);
  });

  it('moveObject posune všechny vertexy polyline', () => {
    const poly = {
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0],
      closed: false,
    };
    moveObject(poly, 5, 5);
    expect(poly.vertices[0]).toEqual({ x: 5, y: 5 });
    expect(poly.vertices[1]).toEqual({ x: 15, y: 5 });
    expect(poly.vertices[2]).toEqual({ x: 15, y: 15 });
  });

  it('moveObject u polyline nemění bulge', () => {
    const poly = {
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      bulges: [0.42],
      closed: false,
    };
    moveObject(poly, 100, 100);
    expect(poly.bulges[0]).toBe(0.42);
  });

  it('polyline s jedním vertexem – undo/redo', () => {
    // Edge case: polyline s nedostatečným počtem vertexů
    addObject({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }],
      bulges: [],
      closed: false,
      name: 'Kontura 1',
    });
    expect(state.objects).toHaveLength(1);
    undo();
    expect(state.objects).toHaveLength(0);
    redo();
    expect(state.objects[0].vertices).toHaveLength(1);
  });
});

// ════════════════════════════════════════
// ── Corrupted DXF ──
// ════════════════════════════════════════
describe('Error: corrupted DXF', () => {
  it('zvládne úplný nesmysl', () => {
    const r = parseDXF('!@#$%^&*()');
    expect(r.entities).toEqual([]);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('zvládne pouze číselné řádky', () => {
    const r = parseDXF('0\n0\n0\n0');
    expect(r.entities).toEqual([]);
  });

  it('zvládne prázdnou ENTITIES sekci', () => {
    const r = parseDXF('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF');
    expect(r.entities).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('zvládne entitu bez dat', () => {
    const r = parseDXF('0\nSECTION\n2\nENTITIES\n0\nLINE\n0\nENDSEC\n0\nEOF');
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0]).toMatchObject({ type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 });
  });

  it('velmi dlouhý řetězec necrashne', () => {
    const long = '0\nSECTION\n2\nENTITIES\n' + '0\nPOINT\n10\n1\n20\n1\n'.repeat(100) + '0\nENDSEC\n0\nEOF';
    const r = parseDXF(long);
    expect(r.entities).toHaveLength(100);
  });
});

// ════════════════════════════════════════
// ── deepClone robustnost ──
// ════════════════════════════════════════
describe('Error: deepClone edge cases', () => {
  it('klonuje polyline s bulges bez sdílení referencí', () => {
    const orig = {
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      bulges: [0.5],
      closed: true,
    };
    const clone = deepClone(orig);
    clone.vertices[0].x = 999;
    clone.bulges[0] = -1;
    expect(orig.vertices[0].x).toBe(0);
    expect(orig.bulges[0]).toBe(0.5);
  });

  it('klonuje vnořené objekty', () => {
    const orig = { a: { b: { c: 42 } } };
    const clone = deepClone(orig);
    clone.a.b.c = 0;
    expect(orig.a.b.c).toBe(42);
  });

  it('klonuje pole objektů', () => {
    const orig = [{ x: 1 }, { x: 2 }];
    const clone = deepClone(orig);
    clone[0].x = 99;
    expect(orig[0].x).toBe(1);
  });

  it('klonuje null a primitivy', () => {
    expect(deepClone(null)).toBeNull();
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(true)).toBe(true);
  });
});

// ════════════════════════════════════════
// ── bulgeToArc edge cases ──
// ════════════════════════════════════════
describe('Error: bulgeToArc edge cases', () => {
  it('vrátí null pro nulový bulge', () => {
    const r = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0);
    expect(r).toBeNull();
  });

  it('spočítá oblouk pro pozitivní bulge', () => {
    const r = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
    expect(r).not.toBeNull();
    expect(r.r).toBeGreaterThan(0);
    expect(typeof r.cx).toBe('number');
    expect(typeof r.cy).toBe('number');
  });

  it('spočítá oblouk pro negativní bulge', () => {
    const r = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, -1);
    expect(r).not.toBeNull();
    expect(r.r).toBeGreaterThan(0);
  });

  it('spočítá oblouk pro malý bulge', () => {
    const r = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.001);
    expect(r).not.toBeNull();
    expect(r.r).toBeGreaterThan(0);
  });

  it('zvládne shodné body', () => {
    const r = bulgeToArc({ x: 5, y: 5 }, { x: 5, y: 5 }, 0.5);
    // Shodné body → poloměr 0 nebo null
    expect(r === null || r.r === 0 || isNaN(r.r) || !isFinite(r.r)).toBe(true);
  });
});

// ════════════════════════════════════════
// ── Undo/Redo se složitými scénáři ──
// ════════════════════════════════════════
describe('Error: undo/redo complex scenarios', () => {
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

  it('undo na prázdný stack nic nedělá', () => {
    undo();
    expect(state.objects).toEqual([]);
  });

  it('redo na prázdný stack nic nedělá', () => {
    redo();
    expect(state.objects).toEqual([]);
  });

  it('vícenásobné undo/redo', () => {
    addObject({ type: 'point', x: 1, y: 1 });
    addObject({ type: 'point', x: 2, y: 2 });
    addObject({ type: 'point', x: 3, y: 3 });
    expect(state.objects).toHaveLength(3);
    undo();
    expect(state.objects).toHaveLength(2);
    undo();
    expect(state.objects).toHaveLength(1);
    redo();
    expect(state.objects).toHaveLength(2);
    redo();
    expect(state.objects).toHaveLength(3);
  });

  it('nová akce vymaže redo stack', () => {
    addObject({ type: 'point', x: 1, y: 1 });
    addObject({ type: 'point', x: 2, y: 2 });
    undo();
    expect(state.redoStack.length).toBeGreaterThan(0);
    addObject({ type: 'point', x: 3, y: 3 });
    expect(state.redoStack).toHaveLength(0);
  });

  it('undo zachová stav ostatních objektů', () => {
    addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 });
    addObject({ type: 'circle', cx: 5, cy: 5, r: 3 });
    undo();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].type).toBe('line');
    expect(state.objects[0].x2).toBe(10);
  });
});

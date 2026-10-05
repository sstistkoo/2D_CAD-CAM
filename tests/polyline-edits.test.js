// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: úpravy kontur (polyline) a dědění vlastností ║
// ╚══════════════════════════════════════════════════════════════╝
// Regrese z kontroly CAD 5. 10. 2026: úpravy segmentu kontury nesmí
// posouvat SDÍLENÝ vrchol (deformoval se tím sousední segment), smazání
// segmentu uzavřené kontury smí odebrat jen ten jeden segment a části
// rozděleného objektu dědí vrstvu / typ čáry / polotovar.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false,
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '', innerHTML: '', querySelectorAll: () => [], appendChild: vi.fn(), style: {},
  }),
  createElement: () => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(), addEventListener: vi.fn(), setAttribute: vi.fn(), style: {},
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(), renderAllDebounced: vi.fn(), resolveObjectColor: (o) => o.color || '#89b4fa',
}));
vi.mock('../js/ui.js', () => ({
  updateObjectList: vi.fn(), updateProperties: vi.fn(), setHint: vi.fn(), resetHint: vi.fn(),
}));
vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(), drawCanvas: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  screenToWorld: (x, y) => [x, y], snapPt: (x, y) => [x, y],
}));
vi.mock('../js/dialogs.js', () => ({
  showEndpointChoiceDialog: vi.fn(), showFilletChamferDialog: vi.fn(),
}));
vi.mock('../js/dialogs/dimension.js', () => ({ updateAssociativeDimensions: vi.fn() }));

import { state } from '../js/state.js';
import { addObject, deletePolylineSegment, inheritedProps } from '../js/objects.js';
import { filletTwoLines } from '../js/geometry.js';
import { filletChamferAtCorner } from '../js/tools/filletChamferClick.js';
import { handleTrimClick, resetTrimState } from '../js/tools/trimClick.js';
import { handleBreakClick } from '../js/tools/breakClick.js';
import { getTextPathObject, expandPolylineObjects } from '../js/utils.js';

const TAN_22_5 = Math.tan(Math.PI / 8); // bulge čtvrtkruhu

beforeEach(() => {
  state.objects = [];
  state.anchors = [];
  state.undoStack = [];
  state.redoStack = [];
  state.nextId = 1;
  state.activeLayer = 0;
  state.selected = null;
  state.multiSelected = new Set();
  state.multiSelectedSegments = new Map();
  state.selectedSegment = null;
  state.zoom = 1;
  state.mouse = { snapType: null };
  state.layers = [
    { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    { id: 3, name: 'Polotovar', color: '#fab387', visible: true, locked: false },
  ];
  resetTrimState();
});

const verts = (o) => o.vertices.map(p => [+p.x.toFixed(6), +p.y.toFixed(6)]);
const square = (closed) => addObject({
  type: 'polyline', closed, name: 'K',
  vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  bulges: closed ? [0, 0, 0, 0] : [0, 0, 0],
});

describe('deletePolylineSegment', () => {
  it('uzavřená kontura: smaže JEN zvolený segment (dřív zmizely dva)', () => {
    square(true);
    expect(deletePolylineSegment(0, 1)).toBe('opened');
    const o = state.objects[0];
    expect(o.closed).toBe(false);
    expect(verts(o)).toEqual([[10, 10], [0, 10], [0, 0], [10, 0]]);
    expect(o.bulges).toHaveLength(3);
  });

  it('prostřední segment otevřené: druhá část má id a dědí vrstvu/polotovar', () => {
    addObject({ type: 'polyline', closed: false, isStock: true, layer: 3, name: 'P',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], bulges: [0, 0, 0] });
    expect(deletePolylineSegment(0, 1)).toBe('split');
    const [a, b] = state.objects;
    expect(verts(a)).toEqual([[0, 0], [10, 0]]);
    expect(verts(b)).toEqual([[10, 10], [0, 10]]);
    expect(b.id).toBeTypeOf('number');
    expect(b.id).not.toBe(a.id);
    expect(b.isStock).toBe(true);
    expect(b.layer).toBe(3);
  });
});

describe('inheritedProps', () => {
  it('přebírá vrstvu, vzhled čáry a polotovar, nic víc', () => {
    expect(inheritedProps({ type: 'line', id: 7, layer: 3, color: '#f00', lineStyle: 'dashed', dashed: true, isStock: true, x1: 1 }))
      .toEqual({ layer: 3, color: '#f00', lineStyle: 'dashed', dashed: true, isStock: true });
  });
});

describe('zaoblení / zkosení rohu kontury', () => {
  it('roh uvnitř kontury: vloží oblouk do kontury, sousední segmenty se jen zkrátí', () => {
    addObject({ type: 'polyline', closed: false, name: 'K',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], bulges: [0, 0] });
    const res = filletChamferAtCorner('fillet', 2, 2, 10, 0);
    expect(res.arc).toBeDefined();
    expect(state.objects).toHaveLength(1); // žádný samostatný oblouk
    const o = state.objects[0];
    expect(verts(o)).toEqual([[0, 0], [8, 0], [10, 2], [10, 10]]); // dřív (0,0)-(10,2)-(10,10)
    expect(o.bulges[1]).toBeCloseTo(TAN_22_5, 9);
    expect(o.bulges[0]).toBe(0);
    expect(o.bulges[2]).toBe(0);
  });

  it('uzavřená kontura, roh ve vrcholu 0: nový uzavírací segment', () => {
    square(true);
    filletChamferAtCorner('chamfer', 2, 2, 0, 0);
    const o = state.objects[0];
    expect(o.closed).toBe(true);
    expect(verts(o)).toEqual([[2, 0], [10, 0], [10, 10], [0, 10], [0, 2]]);
    expect(o.bulges).toEqual([0, 0, 0, 0, 0]);
  });

  it('příliš velký poloměr se odmítne (dřív se úsečka otočila za svůj konec)', () => {
    const r = filletTwoLines({ x1: 0, y1: 0, x2: 10, y2: 0 }, { x1: 10, y1: 0, x2: 10, y2: 10 }, 20);
    expect(r.ok).toBe(false);
  });
});

describe('oříznutí segmentu kontury', () => {
  const cutter = () => addObject({ type: 'line', x1: 5, y1: 5, x2: 15, y2: 5, name: 'L' });

  it('otevřená: rozdělí ji, sousední segment zůstane rovný', () => {
    square(false); cutter();
    handleTrimClick(10, 2);
    const polys = state.objects.filter(o => o.type === 'polyline');
    expect(polys.map(verts)).toEqual([[[0, 0], [10, 0]], [[10, 5], [10, 10], [0, 10]]]);
  });

  it('uzavřená: otevře se na jednu konturu bez ztráty uzavíracího segmentu', () => {
    square(true); cutter();
    handleTrimClick(10, 2);
    const polys = state.objects.filter(o => o.type === 'polyline');
    expect(polys).toHaveLength(1);
    expect(polys[0].closed).toBe(false);
    expect(verts(polys[0])).toEqual([[10, 5], [10, 10], [0, 10], [0, 0], [10, 0]]);
  });

  it('obloukový segment: zbytek zůstane obloukem se správným bulge', () => {
    addObject({ type: 'polyline', closed: false, name: 'K',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], bulges: [1, 0] });
    addObject({ type: 'line', x1: 5, y1: -10, x2: 5, y2: 10, name: 'L' });
    handleTrimClick(5 - 5 * Math.SQRT1_2, -5 * Math.SQRT1_2);
    const o = state.objects.find(p => p.type === 'polyline');
    expect(verts(o)).toEqual([[5, -5], [10, 0], [20, 0]]);
    expect(o.bulges[0]).toBeCloseTo(TAN_22_5, 9);
  });
});

describe('rozdělení (Break)', () => {
  it('obloukový segment kontury se rozdělí NA oblouku na dva oblouky', () => {
    addObject({ type: 'polyline', closed: false, name: 'K',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], bulges: [1, 0] });
    handleBreakClick(5, -5);
    const [a, b] = state.objects;
    expect(verts(a)).toEqual([[0, 0], [5, -5]]);
    expect(a.bulges[0]).toBeCloseTo(TAN_22_5, 9);
    expect(verts(b)).toEqual([[5, -5], [10, 0], [20, 0]]);
    expect(b.bulges[0]).toBeCloseTo(TAN_22_5, 9);
  });

  it('čára polotovaru: obě půlky zůstanou polotovarem ve své vrstvě', () => {
    addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, isStock: true, layer: 3, name: 'P' });
    handleBreakClick(4, 0);
    expect(state.objects).toHaveLength(2);
    for (const o of state.objects) {
      expect(o.isStock).toBe(true);
      expect(o.layer).toBe(3);
    }
  });
});

describe('text na cestě odkazuje přes id', () => {
  it('po smazání objektu PŘED cestou zůstane na své cestě', () => {
    addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, name: 'A' });
    const b = addObject({ type: 'line', x1: 0, y1: 20, x2: 10, y2: 20, name: 'B' });
    const t = addObject({ type: 'text', x: 0, y: 20, text: 'X', pathMode: 'line', pathObjId: b.id, name: 'T' });
    state.objects.splice(0, 1);
    expect(getTextPathObject(t)).toBe(b);
  });

  it('starý formát (index) se při načtení převede na id i přes rozložení kontur', () => {
    const { objects } = expandPolylineObjects([
      { type: 'polyline', id: 1, vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], bulges: [0, 0], closed: false },
      { type: 'line', id: 2, x1: 0, y1: 20, x2: 10, y2: 20, name: 'B' },
      { type: 'text', id: 3, x: 0, y: 20, text: 'X', pathMode: 'line', pathObjectId: 1 },
    ], 10);
    state.objects = objects;
    const t = objects.find(o => o.type === 'text');
    expect(t.pathObjectId).toBeUndefined();
    expect(getTextPathObject(t).name).toBe('B');
  });
});

describe('expandPolylineObjects – další id bez kolizí', () => {
  it('soubor bez nextId: nová id navazují za nejvyšší existující', () => {
    const { objects, nextId } = expandPolylineObjects([
      { type: 'line', id: 5, x1: 0, y1: 0, x2: 1, y2: 0 },
      { type: 'polyline', id: 9, vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], bulges: [0, 0], closed: false },
    ], undefined);
    const ids = objects.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);       // žádné duplicity
    expect(Math.min(...ids.filter(i => i !== 5))).toBeGreaterThanOrEqual(10);
    expect(nextId).toBeGreaterThan(Math.max(...ids));
  });
});

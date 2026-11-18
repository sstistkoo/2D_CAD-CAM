// @vitest-environment happy-dom
// Kontrola kódu 18. 11. 2026 – nástroje Přichytit bod a Tečna.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let state, snap, tangent, getRectCorners;

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  snap = await import('../js/tools/snapPointClick.js');
  tangent = await import('../js/tools/tangentClick.js');
  ({ getRectCorners } = await import('../js/utils.js'));
});

beforeEach(() => {
  state.objects = [];
  state.anchors = [];
  state.undoStack = [];
  state._snapPointState = null;
  state.zoom = 1;
});

describe('Přichytit bod u obdélníku', () => {
  it('nenatočený: lze chytit i roh (x2, y1) a pohne se jen ten roh', () => {
    state.objects = [{ type: 'rect', id: 1, x1: 0, y1: 0, x2: 10, y2: 5, layer: 0 }];
    snap.handleSnapPointClick(10, 0);
    expect(state._snapPointState?.key).toBe('r1');
    snap.handleSnapPointClick(12, -1);
    expect(state.objects[0]).toMatchObject({ x1: 0, y1: -1, x2: 12, y2: 5 });
  });

  it('natočený: chytá skutečný roh a celý obdélník se posune na cíl', () => {
    state.objects = [{ type: 'rect', id: 1, x1: 0, y1: 0, x2: 10, y2: 4, rotation: Math.PI / 6, layer: 0 }];
    const c = getRectCorners(state.objects[0])[2];
    snap.handleSnapPointClick(c.x, c.y);
    expect(state._snapPointState?.key).toBe('r2');
    snap.handleSnapPointClick(50, 50);
    const moved = getRectCorners(state.objects[0])[2];
    expect(moved.x).toBeCloseTo(50, 9);
    expect(moved.y).toBeCloseTo(50, 9);
    expect(state.objects[0].x2 - state.objects[0].x1).toBeCloseTo(10, 9);
  });

  it('kontura se zakotveným jiným vrcholem se nepohne a nevznikne krok Zpět', () => {
    state.objects = [{ type: 'polyline', id: 1, layer: 0, closed: false, bulges: [0, 0],
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }];
    state.anchors = [{ x: 10, y: 10 }];
    snap.handleSnapPointClick(0, 0);
    const undo = state.undoStack.length;
    snap.handleSnapPointClick(5, 5);
    expect(state.objects[0].vertices[0]).toEqual({ x: 0, y: 0 });
    expect(state.undoStack.length).toBe(undo);
    expect(state._snapPointState).toBeNull();
  });
});

describe('Tečna', () => {
  it('správné tvary počtu tečen', () => {
    expect(tangent.tangentCountText(1)).toBe('1 tečna');
    expect(tangent.tangentCountText(2)).toBe('2 tečny');
    expect(tangent.tangentCountText(4)).toBe('4 tečny');
    expect(tangent.tangentCountText(5)).toBe('5 tečen');
  });
});

describe('Tečna ke dvěma kružnicím (uživatel 18. 11. 2026)', () => {
  let t2;
  beforeAll(async () => { t2 = await import('../js/tools/tangentTwoCircles.js'); });
  const C = (cx, cy, r) => ({ cx, cy, r });
  const touches = (t, c) => {
    // úsečka je tečná: vzdálenost středu od přímky = r a konec leží na kružnici
    const dx = t.x2 - t.x1, dy = t.y2 - t.y1, len = Math.hypot(dx, dy);
    const dist = Math.abs(dx * (c.cy - t.y1) - dy * (c.cx - t.x1)) / len;
    return Math.abs(dist - c.r) < 1e-9;
  };

  it('oddělené kružnice: 2 vnější + 2 vnitřní, všechny tečné k oběma', () => {
    const a = C(0, 0, 10), b = C(50, 0, 5);
    const ts = t2.twoCircleTangents(a, b);
    expect(ts.map(t => t.label)).toEqual(['Vnější tečna 1', 'Vnější tečna 2', 'Vnitřní tečna 1', 'Vnitřní tečna 2']);
    for (const t of ts) { expect(touches(t, a)).toBe(true); expect(touches(t, b)).toBe(true); }
    // vnitřní tečna protíná spojnici středů (y = 0), vnější ne
    for (const t of ts) expect(t.y1 * t.y2 < 0).toBe(t.kind === 'inner');
  });

  it('protínající se kružnice: jen 2 vnější', () => {
    expect(t2.twoCircleTangents(C(0, 0, 10), C(15, 0, 10)).map(t => t.kind)).toEqual(['outer', 'outer']);
  });

  it('dotýkající se zvenku: nulová vnitřní tečna se nenabídne', () => {
    expect(t2.twoCircleTangents(C(0, 0, 10), C(20, 0, 10)).map(t => t.kind)).toEqual(['outer', 'outer']);
  });

  it('kružnice uvnitř druhé: žádná tečná úsečka', () => {
    expect(t2.twoCircleTangents(C(0, 0, 20), C(2, 0, 5))).toEqual([]);
  });

  it('výběr 2 kružnic → okno; vnější předvybrané, vytvoří se jako jeden krok Zpět', () => {
    state.objects = [
      { type: 'circle', id: 1, cx: 0, cy: 0, r: 10, layer: 0 },
      { type: 'circle', id: 2, cx: 50, cy: 0, r: 5, layer: 0 },
    ];
    state.selected = 0;
    state.multiSelected = new Set([1]);
    state.multiSelectedSegments = new Map();
    state.selectedPoint = null;
    expect(tangent.tangentFromSelection()).toBe(true);
    const boxes = [...document.querySelectorAll('.input-overlay input[type=checkbox]')];
    expect(boxes.map(b => b.checked)).toEqual([true, true, false, false]);
    const undo = state.undoStack.length;
    document.querySelector('#t2c-lines').click();
    expect(state.objects.filter(o => o.type === 'line')).toHaveLength(2);
    expect(state.undoStack.length).toBe(undo + 1);
    // kružnice se nepohnuly
    expect(state.objects[0]).toMatchObject({ cx: 0, cy: 0 });
  });

  it('volba „přesunout" zachová dřívější chování (kružnice 1 tečně ke 2)', () => {
    state.objects = [
      { type: 'circle', id: 1, cx: 0, cy: 0, r: 10, layer: 0 },
      { type: 'circle', id: 2, cx: 50, cy: 0, r: 5, layer: 0 },
    ];
    state.selected = 0;
    state.multiSelected = new Set([1]);
    tangent.tangentFromSelection();
    document.querySelector('#t2c-move').click();
    // 2 polohy → okno polohy; vezmi první nabízenou
    const pick = document.querySelector('.input-overlay button.btn-ok');
    pick?.click();
    const c = state.objects[0];
    expect(Math.hypot(c.cx - 50, c.cy)).toBeCloseTo(15, 6);
  });
});

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

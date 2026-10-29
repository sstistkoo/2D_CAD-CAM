// Průsečíky skrytých vrstev (třeba Konstrukce z CAM) se na výkrese, v seznamu
// ani pro SNAP neukazují; ve state.intersections zůstávají (export CNC).
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
vi.mock('../js/render.js', () => ({ renderAll: () => {} }));
vi.mock('../js/bridge.js', () => ({ bridge: {} }));

let state, calculateAllIntersections, shownIntersections;

beforeAll(async () => {
  ({ state } = await import('../js/state.js'));
  ({ calculateAllIntersections } = await import('../js/geometry/intersections.js'));
  ({ shownIntersections } = await import('../js/geometry/shownIntersections.js'));
});

const L = (layer, x1, y1, x2, y2) => ({ type: 'line', layer, x1, y1, x2, y2 });

describe('shownIntersections', () => {
  beforeEach(() => {
    state.layers = [{ id: 0, name: 'Kontura', visible: true }, { id: 1, name: 'Konstrukce', visible: true }];
    state.objects = [
      L(0, 0, 0, 10, 10), L(0, 0, 10, 10, 0),   // kontura × kontura → (5, 5)
      L(1, 2, -1, 2, 20),                        // konstrukce × obě úsečky kontury
    ];
    calculateAllIntersections();
  });

  it('vrstvy viditelné → všechny průsečíky', () => {
    expect(state.intersections).toHaveLength(3);
    expect(shownIntersections()).toHaveLength(3);
  });
  it('skrytá Konstrukce → zůstane jen průsečík kontury, stav se nemění', () => {
    state.layers[1].visible = false;
    expect(shownIntersections().map(p => [p.x, p.y])).toEqual([[5, 5]]);
    expect(state.intersections).toHaveLength(3);
  });
  it('bod společný viditelné i skryté dvojici zůstane vidět', () => {
    state.objects.push(L(1, 5, -1, 5, 20));   // konstrukce přes (5, 5)
    calculateAllIntersections();
    state.layers[1].visible = false;
    expect(shownIntersections().map(p => [p.x, p.y])).toEqual([[5, 5]]);
  });
});

// geometry.js — veřejné rozhraní a funkce, které jiné testy nespouštěly
// (pokrytí 16. 10. 2026: 41 z 66 funkcí). Psáno PŘED rozdělením geometry.js
// do js/geometry/*.js jako charakterizace: hodnoty jsou výstup kódu před
// přesunem a po něm se nesmí změnit. geometry.js zůstává rozcestníkem —
// seznam exportů musí zůstat stejný (45 souborů ho importuje).
import { describe, it, expect, vi, beforeEach } from 'vitest';

// render.js sahá přes canvas.js na DOM (jako v geometry.test.js). Mock platí
// pro modul, tedy i pro js/geometry/*.js po rozdělení.
vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
  findNumLabelAt: vi.fn(() => null),
}));

import * as G from '../js/geometry.js';
import { state } from '../js/state.js';
import { bridge } from '../js/bridge.js';

/** Čísla zaokrouhlená na 1e-6 (porovnání nezávislé na posledním bitu). */
const r6 = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));

describe('geometry.js — veřejné rozhraní', () => {
  it('exportuje stejná jména (všechno funkce)', () => {
    const names = Object.keys(G).sort();
    expect(names.every(n => typeof G[n] === 'function')).toBe(true);
    expect(names).toMatchInlineSnapshot(`
      [
        "angleBetweenLines",
        "calculateAllIntersections",
        "chamferLineAndArc",
        "chamferTwoLines",
        "circlePositionsTangentToCircleAndLine",
        "circlePositionsTangentToCircleAndPoint",
        "circlePositionsTangentToLine",
        "circlePositionsTangentToLineAndPoint",
        "circlePositionsTangentToTwoCircles",
        "circlePositionsTangentToTwoLines",
        "circlePositionsTangentToTwoSegments",
        "circleTangentToCircleAndTwoPoints",
        "circleTangentToLineAndTwoPoints",
        "circleTangentToThreeLines",
        "circleTangentToThreeSegments",
        "circleTangentToTwoLinesAndPoint",
        "circleThrough3Points",
        "circularArray",
        "distPointToInfiniteLine",
        "distToObject",
        "filletLineAndArc",
        "filletTwoLines",
        "findConstraintAt",
        "findIntersectionAt",
        "findObjectAt",
        "findSegmentAt",
        "flipObject",
        "flushAutoCncExport",
        "getCircles",
        "getLines",
        "getPolylineSegmentAsLine",
        "intersectCircleCircle",
        "intersectInfiniteLines",
        "intersectLineCircle",
        "intersectLineLine",
        "linearArray",
        "mirrorObject",
        "offsetObject",
        "pickOffsetSide",
        "projectPointToLine",
        "rotateObject",
        "scaleObject",
        "selectObjectAt",
        "tangentsFromPointToCircle",
        "tangentsTwoCircles",
      ]
    `);
  });
});

describe('tečné kružnice', () => {
  it('kružnice tečná ke kružnici a úsečce / ke kružnici a bodu / ke dvěma kružnicím', () => {
    expect(r6(G.circlePositionsTangentToCircleAndLine(2, 0, 0, 5, -10, 8, 10, 8))).toMatchInlineSnapshot(`
      [
        {
          "cx": -3.605551,
          "cy": 6,
          "r": 2,
        },
        {
          "cx": 3.605551,
          "cy": 6,
          "r": 2,
        },
      ]
    `);
    expect(r6(G.circlePositionsTangentToCircleAndPoint(2, 0, 0, 5, 8, 1))).toMatchInlineSnapshot(`
      [
        {
          "cx": 6.963832,
          "cy": -0.71066,
        },
        {
          "cx": 6.574629,
          "cy": 2.402967,
        },
      ]
    `);
    expect(r6(G.circlePositionsTangentToTwoCircles(2, 0, 0, 5, 12, 0, 3))).toMatchInlineSnapshot(`
      [
        {
          "cx": 7,
          "cy": 0,
          "r": 2,
        },
      ]
    `);
  });

  it('kružnice třemi body, tečná ke kružnici a dvěma bodům', () => {
    expect(r6(G.circleThrough3Points(0, 0, 10, 0, 0, 10))).toMatchInlineSnapshot(`
      [
        {
          "cx": 5,
          "cy": 5,
          "r": 7.071068,
        },
      ]
    `);
    expect(G.circleThrough3Points(0, 0, 5, 0, 10, 0)).toEqual([]);   // body na přímce → žádná
    expect(r6(G.circleTangentToCircleAndTwoPoints(0, 0, 5, 8, 1, 8, -1))).toMatchInlineSnapshot(`
      [
        {
          "cx": 6.666667,
          "cy": 0,
          "r": 1.666667,
        },
        {
          "cx": 1.538462,
          "cy": 0,
          "r": 6.538462,
        },
      ]
    `);
  });

  it('dispatcher dvou segmentů a Apollonius tří segmentů', () => {
    const l1 = { type: 'line', x1: -10, y1: 0, x2: 10, y2: 0 };
    const l2 = { type: 'line', x1: 0, y1: -10, x2: 0, y2: 10 };
    const c = { type: 'arc', cx: 8, cy: 3, r: 3 };
    expect(r6(G.circlePositionsTangentToTwoSegments(1.5, l1, l2))).toMatchInlineSnapshot(`
      [
        {
          "cx": -1.5,
          "cy": 1.5,
        },
        {
          "cx": 1.5,
          "cy": 1.5,
        },
        {
          "cx": -1.5,
          "cy": -1.5,
        },
        {
          "cx": 1.5,
          "cy": -1.5,
        },
      ]
    `);
    expect(r6(G.circlePositionsTangentToTwoSegments(1.5, l1, c))).toMatchInlineSnapshot(`
      [
        {
          "cx": 3.757359,
          "cy": 1.5,
          "r": 1.5,
        },
        {
          "cx": 12.242641,
          "cy": 1.5,
          "r": 1.5,
        },
        {
          "cx": 8,
          "cy": 1.5,
          "r": 1.5,
        },
        {
          "cx": 8,
          "cy": -1.5,
          "r": 1.5,
        },
      ]
    `);
    expect(r6(G.circlePositionsTangentToTwoSegments(1.5, c, l2))).toMatchInlineSnapshot(`[]`);
    expect(r6(G.circlePositionsTangentToTwoSegments(1.5, c, { type: 'arc', cx: 2, cy: 3, r: 3 }))).toMatchInlineSnapshot(`
      [
        {
          "cx": 5,
          "cy": -0.354102,
          "r": 1.5,
        },
        {
          "cx": 5,
          "cy": 6.354102,
          "r": 1.5,
        },
      ]
    `);
    const l3 = { type: 'line', x1: -10, y1: 10, x2: 10, y2: 10 };
    expect(r6(G.circleTangentToThreeSegments(l1, l2, l3, 3, 5, 4))).toMatchInlineSnapshot(`
      [
        {
          "cx": -5,
          "cy": 5,
          "r": 5,
        },
        {
          "cx": 5,
          "cy": 5,
          "r": 5,
        },
      ]
    `);
  });
});

describe('přímky a zaoblení úsečky s obloukem', () => {
  it('úsek polyline jako úsečka, vzdálenost od nekonečné přímky, úhel přímek', () => {
    const poly = { type: 'polyline', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], closed: false };
    expect(G.getPolylineSegmentAsLine(poly, 1)).toEqual({ x1: 10, y1: 0, x2: 10, y2: 5 });
    expect(G.getPolylineSegmentAsLine(poly, 2)).toBeNull();
    expect(G.getPolylineSegmentAsLine({ ...poly, closed: true }, 2)).toEqual({ x1: 10, y1: 5, x2: 0, y2: 0 });
    expect(r6(G.distPointToInfiniteLine(5, 7, 0, 0, 10, 0))).toBe(7);
    expect(r6(G.angleBetweenLines({ x1: 0, y1: 0, x2: 10, y2: 0 }, { x1: 0, y1: 0, x2: 10, y2: 10 }))).toMatchInlineSnapshot(`45`);
  });

  it('filletLineAndArc', () => {
    const line = { x1: -10, y1: 8, x2: 10, y2: 8 };
    const arc = { cx: 0, cy: 0, r: 5, startAngle: 0, endAngle: Math.PI, ccw: true };
    expect(r6(G.filletLineAndArc(line, arc, 2))).toMatchInlineSnapshot(`
      {
        "arc": {
          "cx": -3.605551,
          "cy": 6,
          "endAngle": 1.570796,
          "r": 2,
          "startAngle": -1.029697,
          "type": "arc",
        },
        "ok": true,
      }
    `);
    expect(r6({ line, arc })).toMatchInlineSnapshot(`
      {
        "arc": {
          "ccw": true,
          "cx": 0,
          "cy": 0,
          "endAngle": 2.111896,
          "r": 5,
          "startAngle": 0,
        },
        "line": {
          "x1": -3.605551,
          "x2": 10,
          "y1": 8,
          "y2": 8,
        },
      }
    `);   // vstupy jsou „mutable proxy"
  });
});

describe('výběr objektu na plátně', () => {
  beforeEach(() => {
    state.zoom = 10;   // tolerance jsou v px / zoom → 1,5 mm výběr, 2 mm snap
    state.layers = [{ id: 0, name: 'L', visible: true, locked: false }];
    state.objects = [
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, layer: 0, id: 1 },
      { type: 'line', x1: 0, y1: 5, x2: 10, y2: 5, layer: 0, id: 2, constraint: 'horizontal' },
      { type: 'polyline', vertices: [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }], bulges: [0, 0, 0], closed: false, layer: 0, id: 3, segConstraints: { 1: 'vertical' } },
    ];
    state.intersections = [{ x: 30, y: 30 }];
    state.selected = null; state.selectedSegment = null; state.selectedPoint = null;
    state._selectedSegmentObjIdx = null; state._selectedConstraint = null;
    state.multiSelected = new Set(); state.multiSelectedSegments = new Map();
    state.showObjectNumbers = false;
    state.showDimensions = 'all';
  });
  const sel = () => ({
    selected: state.selected, multi: [...state.multiSelected].sort(), seg: state.selectedSegment,
    segs: [...state.multiSelectedSegments].map(([k, v]) => [k, [...v]]), point: state.selectedPoint,
    constraint: state._selectedConstraint && { ...state._selectedConstraint },
  });

  it('klikání: výběr, přidání do výběru, odebrání, segment polyline, prázdné místo', () => {
    const steps = [];
    for (const [x, y] of [[5, 0.2], [5, 5.3], [5, 0.1], [10.2, 15], [50, 50]]) {
      G.selectObjectAt(x, y);
      steps.push([x, y, sel()]);
    }
    expect(r6(steps)).toMatchInlineSnapshot(`
      [
        [
          5,
          0.2,
          {
            "constraint": null,
            "multi": [],
            "point": null,
            "seg": null,
            "segs": [],
            "selected": 0,
          },
        ],
        [
          5,
          5.3,
          {
            "constraint": {
              "objIdx": 1,
              "segIdx": null,
            },
            "multi": [],
            "point": null,
            "seg": null,
            "segs": [],
            "selected": 1,
          },
        ],
        [
          5,
          0.1,
          {
            "constraint": null,
            "multi": [
              0,
              1,
            ],
            "point": null,
            "seg": null,
            "segs": [],
            "selected": 0,
          },
        ],
        [
          10.2,
          15,
          {
            "constraint": null,
            "multi": [
              0,
              1,
              2,
            ],
            "point": null,
            "seg": null,
            "segs": [],
            "selected": 2,
          },
        ],
        [
          50,
          50,
          {
            "constraint": null,
            "multi": [
              0,
              1,
              2,
            ],
            "point": null,
            "seg": null,
            "segs": [],
            "selected": 2,
          },
        ],
      ]
    `);
  });

  it('značka vazby (úsečka i úsek polyline) a snap bod / průsečík', () => {
    // Značka leží kolmo od středu úsečky o CONSTRAINT_OFFSET_PX / zoom — hledej v okolí.
    const hits = [];
    for (let y = -2; y <= 22; y += 0.5) for (let x = -2; x <= 12; x += 0.5) {
      const h = G.findConstraintAt(x, y);
      if (h) hits.push(`${h.objIdx}:${h.segIdx}`);
    }
    expect([...new Set(hits)].sort()).toMatchInlineSnapshot(`
      [
        "1:null",
        "2:1",
      ]
    `);
    expect(G.findIntersectionAt(0.3, 0.2)).toEqual({ x: 0, y: 0 });
    expect(r6(G.findIntersectionAt(10.2, 5.1))).toMatchInlineSnapshot(`
      {
        "x": 10,
        "y": 5,
      }
    `);
    expect(G.findIntersectionAt(30.1, 29.9)).toEqual({ x: 30, y: 30 });
    expect(G.findIntersectionAt(70, 70)).toBeNull();
  });
});

describe('okamžitý CNC export (flushAutoCncExport)', () => {
  it('čekající obnovení CNC panelu provede hned a jen jednou', () => {
    vi.useFakeTimers();
    const run = vi.fn(), sort = vi.fn();
    const saved = { run: bridge.runCncExport, sort: bridge.autoSortAllGroups };
    bridge.runCncExport = run; bridge.autoSortAllGroups = sort;
    try {
      state.objects = [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, layer: 0, id: 1 }];
      G.flushAutoCncExport();             // nic nečeká → nic
      expect(run).toHaveBeenCalledTimes(0);
      G.calculateAllIntersections();      // naplánuje obnovení (300 ms)
      G.flushAutoCncExport();
      expect([run.mock.calls.length, sort.mock.calls.length]).toEqual([1, 1]);
      vi.advanceTimersByTime(1000);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      bridge.runCncExport = saved.run; bridge.autoSortAllGroups = saved.sort;
      vi.useRealTimers();
    }
  });
});

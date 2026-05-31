// Testy importu DXF ELLIPSE a SPLINE entit přes parseDXF().
//
// Ručně sestavujeme minimální DXF (AC1009 ENTITIES sekci), parsujeme a
// ověřujeme typ + počet výsledných SKICA entit. Pro ELLIPSE s ratio≈1
// se má vrátit nativní circle/arc; jinak polylina. SPLINE se vždy
// rozloží na polylinu přes de Boor.

import { describe, it, expect } from 'vitest';
import { parseDXF } from '../js/dxf.js';

// Helper – obalí pole entit do minimální DXF struktury, kterou parseDXF dokáže
// otevřít (potřebuje sekci ENTITIES).
function wrapDXF(...entityBlocks) {
  return [
    '0', 'SECTION',
    '2', 'ENTITIES',
    ...entityBlocks.flat(),
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');
}

// ── ELLIPSE testy ──

describe('parseDXF – ELLIPSE', () => {
  it('plná kružnice (ratio=1, sweep=2π) → circle', () => {
    const dxf = wrapDXF([
      '0', 'ELLIPSE',
      '10', '5',   // cx
      '20', '0',   // cy
      '11', '10',  // major endpoint x (= a=10)
      '21', '0',
      '40', '1',   // ratio
      '41', '0',   // startParam
      '42', '6.283185307179586', // endParam = 2π
    ]);
    const r = parseDXF(dxf);
    expect(r.errors).toEqual([]);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0].type).toBe('circle');
    expect(r.entities[0].cx).toBe(5);
    expect(r.entities[0].cy).toBe(0);
    expect(r.entities[0].r).toBe(10);
  });

  it('oblouk kružnice (ratio=1, půlkruh) → arc', () => {
    const dxf = wrapDXF([
      '0', 'ELLIPSE',
      '10', '0', '20', '0',
      '11', '5', '21', '0',
      '40', '1',
      '41', '0',
      '42', '3.141592653589793',
    ]);
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0].type).toBe('arc');
    expect(r.entities[0].r).toBe(5);
  });

  it('skutečná elipsa (ratio=0.5) → uzavřená polyline aproximace', () => {
    const dxf = wrapDXF([
      '0', 'ELLIPSE',
      '10', '0', '20', '0',
      '11', '10', '21', '0',
      '40', '0.5',
      '41', '0',
      '42', '6.283185307179586',
    ]);
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    const poly = r.entities[0];
    expect(poly.type).toBe('polyline');
    expect(poly.closed).toBe(true);
    expect(poly.vertices.length).toBeGreaterThanOrEqual(32);
    // Body musí ležet na elipse: x²/a² + y²/b² ≈ 1
    for (const v of poly.vertices) {
      const err = (v.x * v.x) / 100 + (v.y * v.y) / 25 - 1;
      expect(Math.abs(err)).toBeLessThan(0.01);
    }
  });

  it('otevřený eliptický oblouk → otevřená polyline', () => {
    const dxf = wrapDXF([
      '0', 'ELLIPSE',
      '10', '0', '20', '0',
      '11', '8', '21', '0',
      '40', '0.5',
      '41', '0',
      '42', '3.141592653589793', // π = půlka
    ]);
    const r = parseDXF(dxf);
    const poly = r.entities[0];
    expect(poly.type).toBe('polyline');
    expect(poly.closed).toBe(false);
  });
});

// ── SPLINE testy ──

describe('parseDXF – SPLINE', () => {
  // Lineární spline (degree=1) se 4 control body → ekvivalentní lomené čáře
  // s totožnými body. Snadná verifikace, že de Boor reprodukuje vstup.
  it('lineární spline (degree=1) → polyline procházející řídicími body', () => {
    const ctrlPts = [
      [0, 0], [10, 0], [10, 10], [20, 10],
    ];
    // Uniformní clamped knots pro degree=1, n=4: [0,0,1,2,3,3]
    const dxf = wrapDXF([
      '0', 'SPLINE',
      '70', '0',
      '71', '1',  // degree
      '72', '6',  // počet uzlů
      '73', '4',  // počet control bodů
      '40', '0', '40', '0', '40', '1', '40', '2', '40', '3', '40', '3',
      ...ctrlPts.flatMap(([x, y]) => ['10', String(x), '20', String(y)]),
    ]);
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    const poly = r.entities[0];
    expect(poly.type).toBe('polyline');
    expect(poly.closed).toBe(false);
    // Krajní body musí odpovídat prvnímu a poslednímu řídicímu bodu
    expect(poly.vertices[0].x).toBeCloseTo(0, 3);
    expect(poly.vertices[0].y).toBeCloseTo(0, 3);
    expect(poly.vertices[poly.vertices.length - 1].x).toBeCloseTo(20, 3);
    expect(poly.vertices[poly.vertices.length - 1].y).toBeCloseTo(10, 3);
  });

  it('kvadratický spline (degree=2) prochází krajními body', () => {
    // Bezier kvadratický: 3 control body, degree=2, knots [0,0,0,1,1,1]
    const ctrlPts = [[0, 0], [5, 10], [10, 0]];
    const dxf = wrapDXF([
      '0', 'SPLINE',
      '70', '0',
      '71', '2',
      '72', '6',
      '73', '3',
      '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1',
      ...ctrlPts.flatMap(([x, y]) => ['10', String(x), '20', String(y)]),
    ]);
    const r = parseDXF(dxf);
    const poly = r.entities[0];
    expect(poly.type).toBe('polyline');
    expect(poly.vertices[0].x).toBeCloseTo(0, 3);
    expect(poly.vertices[0].y).toBeCloseTo(0, 3);
    const last = poly.vertices[poly.vertices.length - 1];
    expect(last.x).toBeCloseTo(10, 3);
    expect(last.y).toBeCloseTo(0, 3);
    // Vrchol křivky t=0.5: x=5, y=5 (Bernsteinova polynomy: y = 2·0.5·0.5·10)
    const mid = poly.vertices[Math.floor(poly.vertices.length / 2)];
    expect(mid.x).toBeCloseTo(5, 1);
    expect(mid.y).toBeCloseTo(5, 1);
  });

  it('kubický B-spline (degree=3) vyrobí hladkou polylinu', () => {
    const ctrlPts = [[0, 0], [5, 10], [10, 10], [15, 0], [20, 0]];
    // Uniformní clamped knots, degree=3, n=5: 9 knots [0,0,0,0,1,2,2,2,2]
    const dxf = wrapDXF([
      '0', 'SPLINE',
      '70', '0',
      '71', '3',
      '72', '9',
      '73', '5',
      '40', '0', '40', '0', '40', '0', '40', '0',
      '40', '1',
      '40', '2', '40', '2', '40', '2', '40', '2',
      ...ctrlPts.flatMap(([x, y]) => ['10', String(x), '20', String(y)]),
    ]);
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    const poly = r.entities[0];
    expect(poly.type).toBe('polyline');
    expect(poly.vertices.length).toBeGreaterThanOrEqual(64);
    // Krajní body se rovnají prvnímu/poslednímu řídicímu (clamped knot)
    expect(poly.vertices[0].x).toBeCloseTo(0, 2);
    expect(poly.vertices[poly.vertices.length - 1].x).toBeCloseTo(20, 2);
  });

  it('SPLINE bez control bodů, jen s fit body → fallback na lomenou čáru', () => {
    const dxf = wrapDXF([
      '0', 'SPLINE',
      '70', '0',
      '71', '3',
      '74', '3',
      '11', '0', '21', '0',
      '11', '5', '21', '10',
      '11', '10', '21', '0',
    ]);
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    const poly = r.entities[0];
    expect(poly.type).toBe('polyline');
    expect(poly.vertices).toHaveLength(3);
  });

  it('SPLINE s flagem closed (70=1) vrátí closed polyline', () => {
    const ctrlPts = [[0, 0], [5, 5], [10, 0]];
    const dxf = wrapDXF([
      '0', 'SPLINE',
      '70', '1',  // closed
      '71', '2',
      '72', '6',
      '73', '3',
      '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1',
      ...ctrlPts.flatMap(([x, y]) => ['10', String(x), '20', String(y)]),
    ]);
    const r = parseDXF(dxf);
    expect(r.entities[0].closed).toBe(true);
  });
});

// ── Mix s ostatními entitami ──

describe('parseDXF – ELLIPSE/SPLINE smíchané s ostatními entitami', () => {
  it('LINE + ELLIPSE + SPLINE v jednom souboru', () => {
    const dxf = wrapDXF(
      ['0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0'],
      [
        '0', 'ELLIPSE',
        '10', '20', '20', '0', '11', '5', '21', '0',
        '40', '1', '41', '0', '42', '6.283185307179586',
      ],
      [
        '0', 'SPLINE',
        '70', '0', '71', '1', '72', '4', '73', '2',
        '40', '0', '40', '0', '40', '1', '40', '1',
        '10', '30', '20', '0', '10', '40', '20', '5',
      ],
    );
    const r = parseDXF(dxf);
    expect(r.errors).toEqual([]);
    expect(r.entities).toHaveLength(3);
    const types = r.entities.map(e => e.type).sort();
    expect(types).toEqual(['circle', 'line', 'polyline']);
  });
});

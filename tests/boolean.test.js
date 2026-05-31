// Pokrývá veřejné API booleanMaker.js v Node prostředí (bez Maker.js).
// Testy ověřují:
//  - validátor degenerovaných tvarů,
//  - fast-path pro geometricky identické vstupy,
//  - dědění vlajek (layer/color/isStock/dashed/skipIntersections).
//
// Volání reálné combine() proti Maker.js bundlu se zde netestuje – to vyžaduje
// browser/test prostředí s window.makerjs; ověřeno v browseru přes preview.

import { describe, it, expect } from 'vitest';
import { booleanCombine } from '../js/tools/booleanMaker.js';

const circle = (cx, cy, r, extra = {}) => ({ type: 'circle', cx, cy, r, layer: 0, ...extra });
const rect = (x1, y1, x2, y2, extra = {}) => ({ type: 'rect', x1, y1, x2, y2, layer: 0, ...extra });
const closedPoly = (vs, bulges, extra = {}) => ({
  type: 'polyline',
  vertices: vs,
  bulges: bulges || vs.map(() => 0),
  closed: true,
  layer: 0,
  ...extra,
});

describe('booleanCombine – defenzivní validace', () => {
  it('odmítne kruh s nulovým poloměrem', () => {
    expect(booleanCombine(circle(0, 0, 0), circle(5, 0, 3), 'union')).toEqual([]);
  });

  it('odmítne rect s nulovou plochou', () => {
    expect(booleanCombine(rect(0, 0, 0, 10), circle(5, 0, 3), 'union')).toEqual([]);
  });

  it('odmítne polylinu se 2 vrcholy (degenerovaná)', () => {
    const degen = closedPoly([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    expect(booleanCombine(degen, circle(2, 0, 3), 'union')).toEqual([]);
  });

  it('odmítne polylinu, která není closed', () => {
    const open = { ...closedPoly([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }]), closed: false };
    expect(booleanCombine(open, circle(2, 0, 3), 'union')).toEqual([]);
  });

  it('odmítne null/undefined vstup', () => {
    expect(booleanCombine(null, circle(0, 0, 5), 'union')).toEqual([]);
    expect(booleanCombine(circle(0, 0, 5), undefined, 'union')).toEqual([]);
  });
});

describe('booleanCombine – fast-path pro identické tvary', () => {
  it('A − A vrátí prázdné pole (kruhy)', () => {
    const A = circle(0, 0, 5);
    const B = circle(0, 0, 5);
    expect(booleanCombine(A, B, 'subtract')).toEqual([]);
  });

  it('A − A vrátí prázdné pole (obdélníky)', () => {
    expect(booleanCombine(rect(0, 0, 10, 10), rect(0, 0, 10, 10), 'subtract')).toEqual([]);
  });

  it('A − A vrátí prázdné pole i s otočeným pořadím rohů rectu', () => {
    expect(booleanCombine(rect(0, 0, 10, 10), rect(10, 10, 0, 0), 'subtract')).toEqual([]);
  });

  it('A − A vrátí prázdné pole pro identické polyliny', () => {
    const vs = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
    expect(booleanCombine(closedPoly(vs), closedPoly(vs), 'subtract')).toEqual([]);
  });

  it('A ∪ A vrátí jednu kopii A jako polylinu', () => {
    const result = booleanCombine(circle(0, 0, 5), circle(0, 0, 5), 'union');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('polyline');
    expect(result[0].closed).toBe(true);
  });

  it('A ∩ A vrátí jednu kopii A jako polylinu', () => {
    const result = booleanCombine(rect(0, 0, 10, 10), rect(0, 0, 10, 10), 'intersect');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('polyline');
    expect(result[0].vertices).toHaveLength(4);
  });

  it('identické polyliny se stejnou geometrií jsou detekované i s jiným ID/name', () => {
    const vs = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
    const A = { ...closedPoly(vs), id: 1, name: 'A' };
    const B = { ...closedPoly(vs), id: 2, name: 'B' };
    expect(booleanCombine(A, B, 'subtract')).toEqual([]);
  });
});

describe('booleanCombine – dědění vlajek pro identické vstupy', () => {
  it('zdědí layer a color z prvního vstupu', () => {
    const A = circle(0, 0, 5, { layer: 2, color: '#ff0000' });
    const B = circle(0, 0, 5, { layer: 0 });
    const result = booleanCombine(A, B, 'union');
    expect(result[0].layer).toBe(2);
    expect(result[0].color).toBe('#ff0000');
  });

  it('isStock = A || B (A stock, B ne)', () => {
    const A = circle(0, 0, 5, { isStock: true });
    const B = circle(0, 0, 5);
    const result = booleanCombine(A, B, 'union');
    expect(result[0].isStock).toBe(true);
  });

  it('isStock = A || B (A ne, B stock)', () => {
    const A = circle(0, 0, 5);
    const B = circle(0, 0, 5, { isStock: true });
    const result = booleanCombine(A, B, 'union');
    expect(result[0].isStock).toBe(true);
  });

  it('isStock není nastaven, pokud ho nemá ani jeden vstup', () => {
    const result = booleanCombine(circle(0, 0, 5), circle(0, 0, 5), 'union');
    expect(result[0].isStock).toBeUndefined();
  });

  it('zdědí dashed a skipIntersections z A', () => {
    const A = circle(0, 0, 5, { dashed: true, skipIntersections: true });
    const B = circle(0, 0, 5);
    const result = booleanCombine(A, B, 'union');
    expect(result[0].dashed).toBe(true);
    expect(result[0].skipIntersections).toBe(true);
  });
});

describe('booleanCombine – v Node prostředí bez Maker.js', () => {
  it('pro neidentické vstupy vrátí null (Maker.js není dostupný v testech)', () => {
    const result = booleanCombine(circle(0, 0, 5), circle(10, 0, 5), 'union');
    expect(result).toBeNull();
  });
});

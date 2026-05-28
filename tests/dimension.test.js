import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock objects.js a state.js
vi.mock('../js/objects.js', () => ({
  addObject: vi.fn(),
}));
vi.mock('../js/state.js', () => ({
  state: { machineType: 'soustruh' },
  showToast: vi.fn(),
  axisLabels: () => ['Z', 'X'],
}));
vi.mock('../js/bridge.js', () => ({
  bridge: {},
}));

import { addDimensionForObject, addAngleDimensionForLines } from '../js/dialogs/dimension.js';
import { addObject } from '../js/objects.js';
import { showToast } from '../js/state.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addDimensionForObject', () => {
  // ── Point ──
  it('přidá kótu bodu se souřadnicemi', () => {
    addDimensionForObject({ type: 'point', x: 10, y: 20 });
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.type).toBe('point');
    expect(arg.x).toBe(10);
    expect(arg.y).toBe(20);
    expect(arg.isDimension).toBe(true);
    expect(arg.isCoordLabel).toBe(true);
    expect(arg.name).toContain('10.00');
    expect(arg.name).toContain('20.00');
  });

  // ── Line ──
  it('přidá kótu délky úsečky', () => {
    addDimensionForObject({ type: 'line', x1: 0, y1: 0, x2: 3, y2: 4 });
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.type).toBe('line');
    expect(arg.isDimension).toBe(true);
    expect(arg.name).toContain('5.00');
    // Offset kolmo k úsečce – body posunuté
    expect(arg.x1).not.toBe(0);
    expect(arg.y1).not.toBe(0);
    // Zdrojové souřadnice uložené
    expect(arg.dimSrcX1).toBe(0);
    expect(arg.dimSrcY1).toBe(0);
    expect(arg.dimSrcX2).toBe(3);
    expect(arg.dimSrcY2).toBe(4);
  });

  it('přidá kótu konstrukční čáry', () => {
    addDimensionForObject({ type: 'constr', x1: 0, y1: 0, x2: 6, y2: 8 });
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.name).toContain('10.00');
    expect(arg.isDimension).toBe(true);
  });

  it('offset kóty je kolmý k úsečce', () => {
    // Vodorovná úsečka – offset by měl být ve směru y
    addDimensionForObject({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 });
    const arg = addObject.mock.calls[0][0];
    // x souřadnice by měly být stejné jako originál (offset kolmo = vertikálně)
    expect(arg.x1).toBeCloseTo(0, 5);
    expect(arg.x2).toBeCloseTo(100, 5);
    // y souřadnice posunuté o 20 (dimOffset)
    expect(arg.y1).toBeCloseTo(20, 5);
    expect(arg.y2).toBeCloseTo(20, 5);
  });

  // ── Circle ──
  it('přidá průměrovou kótu kružnice', () => {
    addDimensionForObject({ type: 'circle', cx: 5, cy: 10, r: 15 });
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.type).toBe('line');
    expect(arg.x1).toBe(-10); // cx - r
    expect(arg.y1).toBe(10);
    expect(arg.x2).toBe(20); // cx + r
    expect(arg.y2).toBe(10);
    expect(arg.name).toContain('⌀30.00');
    expect(arg.isDimension).toBe(true);
    expect(arg.dimType).toBe('diameter');
  });

  // ── Arc ──
  it('přidá kótu poloměru a úhlovou kótu oblouku', () => {
    addDimensionForObject({ type: 'arc', cx: 0, cy: 0, r: 7.5, startAngle: 0, endAngle: Math.PI / 2 });
    expect(addObject).toHaveBeenCalledTimes(2);
    const rArg = addObject.mock.calls[0][0];
    expect(rArg.name).toContain('R7.50');
    expect(rArg.isDimension).toBe(true);
    expect(rArg.dimType).toBe('radius');
    const aArg = addObject.mock.calls[1][0];
    expect(aArg.dimType).toBe('angular');
    expect(aArg.name).toContain('∠90.0°');
  });

  // ── Rect ──
  it('přidá dvě kóty obdélníku (šířka + výška)', () => {
    addDimensionForObject({ type: 'rect', x1: 0, y1: 0, x2: 30, y2: 20 });
    expect(addObject).toHaveBeenCalledTimes(2);
    const w = addObject.mock.calls[0][0];
    const h = addObject.mock.calls[1][0];
    expect(w.name).toContain('30.00');
    expect(h.name).toContain('20.00');
    expect(w.isDimension).toBe(true);
    expect(h.isDimension).toBe(true);
  });

  it('přidá kóty obdélníku s otočenými souřadnicemi', () => {
    addDimensionForObject({ type: 'rect', x1: 30, y1: 20, x2: 0, y2: 0 });
    expect(addObject).toHaveBeenCalledTimes(2);
    const w = addObject.mock.calls[0][0];
    const h = addObject.mock.calls[1][0];
    expect(w.name).toContain('30.00');
    expect(h.name).toContain('20.00');
  });

  // ── Polyline ──
  it('přidá kóty segmentů kontury', () => {
    addDimensionForObject({
      type: 'polyline',
      vertices: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 14 },
      ],
      bulges: [0, 0],
      closed: false,
    });
    expect(addObject).toHaveBeenCalledTimes(2);
    const seg1 = addObject.mock.calls[0][0];
    const seg2 = addObject.mock.calls[1][0];
    expect(seg1.name).toContain('5.00');
    expect(seg2.name).toContain('10.00');
  });

  it('kóty uzavřené kontury obsahují zavírací segment', () => {
    addDimensionForObject({
      type: 'polyline',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      bulges: [0, 0, 0],
      closed: true,
    });
    // 3 segmenty u uzavřené kontury (0→1, 1→2, 2→0)
    expect(addObject).toHaveBeenCalledTimes(3);
  });

  it('obloukový segment polyline generuje kótu poloměru', () => {
    addDimensionForObject({
      type: 'polyline',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      bulges: [1], // polokruh
      closed: false,
    });
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.name).toContain('R');
  });

  it('polyline s méně než 2 body zobrazí toast, nepřidá kótu', () => {
    addDimensionForObject({ type: 'polyline', vertices: [{ x: 0, y: 0 }], bulges: [] });
    expect(addObject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Kontura nemá dostatek bodů');
  });

  it('polyline bez vertices zobrazí toast', () => {
    addDimensionForObject({ type: 'polyline' });
    expect(addObject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalled();
  });

  // ── Neznámý typ ──
  it('neznámý typ zobrazí upozornění', () => {
    addDimensionForObject({ type: 'unknown' });
    expect(addObject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Pro tento typ objektu nelze přidat kótu');
  });

  // ── Toast zprávy ──
  it('toast zprávy obsahují správné hodnoty', () => {
    addDimensionForObject({ type: 'point', x: 1.5, y: 2.5 });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('1.50'));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('2.50'));
  });

  it('polyline přeskočí segment s nulovou délkou', () => {
    addDimensionForObject({
      type: 'polyline',
      vertices: [
        { x: 0, y: 0 },
        { x: 0, y: 0 }, // nulová délka
        { x: 10, y: 0 },
      ],
      bulges: [0, 0],
      closed: false,
    });
    // Pouze 1 kóta – segment s nulovou délkou je přeskočen
    expect(addObject).toHaveBeenCalledOnce();
  });
});

// ════════════════════════════════════════
// ── addAngleDimensionForLines ──
// ════════════════════════════════════════
describe('addAngleDimensionForLines', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('vytvoří úhlovou kótu 90° mezi kolmými úsečkami', () => {
    const line1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const line2 = { id: 2, type: 'line', x1: 0, y1: 0, x2: 0, y2: 10 };
    addAngleDimensionForLines(line1, line2);
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.isDimension).toBe(true);
    expect(arg.dimType).toBe('angular');
    expect(arg.dimAngle).toBeCloseTo(Math.PI / 2, 5);
    expect(arg.name).toContain('∠90.0°');
    expect(arg.dimLine1Id).toBe(1);
    expect(arg.dimLine2Id).toBe(2);
  });

  it('vytvoří úhlovou kótu 45° mezi šikmými úsečkami', () => {
    const line1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const line2 = { id: 2, type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
    addAngleDimensionForLines(line1, line2);
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.dimAngle).toBeCloseTo(Math.PI / 4, 5);
    expect(arg.name).toContain('∠45.0°');
  });

  it('vypočítá průsečík jako centrum oblouku', () => {
    const line1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const line2 = { id: 2, type: 'line', x1: 5, y1: -5, x2: 5, y2: 5 };
    addAngleDimensionForLines(line1, line2);
    const arg = addObject.mock.calls[0][0];
    expect(arg.dimCenterX).toBeCloseTo(5, 5);
    expect(arg.dimCenterY).toBeCloseTo(0, 5);
  });

  it('odmítne rovnoběžné úsečky', () => {
    const line1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const line2 = { id: 2, type: 'line', x1: 0, y1: 5, x2: 10, y2: 5 };
    addAngleDimensionForLines(line1, line2);
    expect(addObject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('rovnoběžné'));
  });

  it('odmítne příliš krátkou úsečku', () => {
    const line1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 };
    const line2 = { id: 2, type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
    addAngleDimensionForLines(line1, line2);
    expect(addObject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('krátké'));
  });

  it('kóta 180° pro protisměrné úsečky', () => {
    const line1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const line2 = { id: 2, type: 'line', x1: 5, y1: 5, x2: 5, y2: -5 };
    addAngleDimensionForLines(line1, line2);
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.dimAngle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('zobrazí skutečný úhel mezi úsečkami (i tupý)', () => {
    // Svislá úsečka dolů + šikmá úsečka nahoru-vlevo → úhel ~135°
    const line1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 0, y2: -50 };
    const line2 = { id: 2, type: 'line', x1: 0, y1: 0, x2: -30, y2: 30 };
    addAngleDimensionForLines(line1, line2);
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    // Skutečný úhel ≈ 135° (3π/4)
    expect(arg.dimAngle).toBeCloseTo(3 * Math.PI / 4, 1);
    expect(arg.name).toContain('∠135');
  });
});

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

import { addDimensionForObject, addAngleDimensionForLines, addLinearDimForLine, computeLinearDimPlacement, addAngleDimForPlacement, computeAngleDimPlacement, buildZAxisRefLine, addArcAngleDim, addArcRadiusLeader } from '../js/dialogs/dimension.js';
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
  it('přidá kótu poloměru (leader) a úhlovou kótu oblouku', () => {
    addDimensionForObject({ type: 'arc', cx: 0, cy: 0, r: 7.5, startAngle: 0, endAngle: Math.PI / 2 });
    expect(addObject).toHaveBeenCalledTimes(2);
    const args = addObject.mock.calls.map(c => c[0]);
    const rArg = args.find(a => a.dimType === 'radius');
    const aArg = args.find(a => a.dimType === 'angular');
    expect(rArg).toBeDefined();
    expect(rArg.name).toContain('R7.50');
    expect(rArg.dimLeader).toBe(true);          // R je odkaz, ne od středu
    expect(rArg.dimAnchorAngle).not.toBeUndefined();
    expect(aArg).toBeDefined();
    expect(aArg.name).toContain('∠90.0°');
    expect(aArg.dimMidAng).not.toBeUndefined(); // pro směr oblouku/šipek
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
// ── computeLinearDimPlacement / addLinearDimForLine ──
// ════════════════════════════════════════
describe('computeLinearDimPlacement', () => {
  // Šikmá úsečka dx=40, dy=30 (délka 50), střed (20,15)
  const line = { id: 7, type: 'line', x1: 0, y1: 0, x2: 40, y2: 30 };

  it('zarovnaná kóta (aligned) při odsazení kolmo k úsečce', () => {
    // Kurzor ve směru normály od středu
    const p = computeLinearDimPlacement(line, -10, 55);
    expect(p.mode).toBe('aligned');
    expect(p.len).toBeCloseTo(50, 5); // skutečná délka
  });

  it('vodorovná kóta (rozměr Z) při tažení nahoru', () => {
    const p = computeLinearDimPlacement(line, 20, 100);
    expect(p.mode).toBe('horizontal');
    expect(p.len).toBeCloseTo(40, 5); // rozdíl ve vodorovné ose (Z)
    // Kótovací čára je vodorovná v úrovni kurzoru
    expect(p.y1).toBeCloseTo(100, 5);
    expect(p.y2).toBeCloseTo(100, 5);
    expect(p.x1).toBeCloseTo(0, 5);
    expect(p.x2).toBeCloseTo(40, 5);
  });

  it('svislá kóta (rozměr X) při tažení do strany', () => {
    const p = computeLinearDimPlacement(line, 100, 15);
    expect(p.mode).toBe('vertical');
    expect(p.len).toBeCloseTo(30, 5); // rozdíl ve svislé ose (X)
    expect(p.x1).toBeCloseTo(100, 5);
    expect(p.x2).toBeCloseTo(100, 5);
    expect(p.y1).toBeCloseTo(0, 5);
    expect(p.y2).toBeCloseTo(30, 5);
  });
});

describe('addLinearDimForLine', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const line = { id: 7, type: 'line', x1: 0, y1: 0, x2: 40, y2: 30 };

  it('vytvoří vodorovnou kótu s dimMode a měřenou délkou v ose Z', () => {
    addLinearDimForLine(line, 20, 100);
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.isDimension).toBe(true);
    expect(arg.dimType).toBe('linear');
    expect(arg.dimMode).toBe('horizontal');
    expect(arg.sourceObjId).toBe(7);
    expect(arg.name).toContain('40.00');
    // Zdrojové body zachovány pro odkazové čáry
    expect(arg.dimSrcX1).toBe(0);
    expect(arg.dimSrcX2).toBe(40);
  });

  it('vytvoří svislou kótu s dimMode a měřenou délkou v ose X', () => {
    addLinearDimForLine(line, 100, 15);
    const arg = addObject.mock.calls[0][0];
    expect(arg.dimMode).toBe('vertical');
    expect(arg.name).toContain('30.00');
  });
});

// ════════════════════════════════════════
// ── computeAngleDimPlacement / addAngleDimForPlacement (výběr sektoru) ──
// ════════════════════════════════════════
describe('computeAngleDimPlacement', () => {
  // Dvě ramena z (0,0): vodorovné (0°) a šikmé 50° – přímý úhel 50°
  const l1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
  const l2 = { id: 2, type: 'line', x1: 0, y1: 0, x2: 10, y2: Math.tan(50 * Math.PI / 180) * 10 };

  it('kurzor uvnitř přímého úhlu měří 50°', () => {
    // směr ~25° (uvnitř 0°–50°)
    const p = computeAngleDimPlacement(l1, l2, Math.cos(25 * Math.PI / 180), Math.sin(25 * Math.PI / 180));
    expect(p.sweep * 180 / Math.PI).toBeCloseTo(50, 4);
    expect(p.reflex).toBe(false);
  });

  it('kurzor na vnější straně měří reflexních 310° (od ramene k rameni)', () => {
    // směr ~205° (opačná strana než osa 25°)
    const p = computeAngleDimPlacement(l1, l2, Math.cos(205 * Math.PI / 180), Math.sin(205 * Math.PI / 180));
    expect(p.sweep * 180 / Math.PI).toBeCloseTo(310, 4);
    expect(p.reflex).toBe(true);
  });

  it('vše mimo přímý úhel je reflexní (žádný doplňkový sektor)', () => {
    // směr ~115° je už mimo klín 0–50 → reflex 310
    const p = computeAngleDimPlacement(l1, l2, Math.cos(115 * Math.PI / 180), Math.sin(115 * Math.PI / 180));
    expect(p.sweep * 180 / Math.PI).toBeCloseTo(310, 4);
  });

  it('poloměr odpovídá vzdálenosti kurzoru od průsečíku', () => {
    const p = computeAngleDimPlacement(l1, l2, 30, 5);
    expect(p.radius).toBeCloseTo(Math.hypot(30, 5), 4);
    expect(p.cx).toBeCloseTo(0, 4);
    expect(p.cy).toBeCloseTo(0, 4);
  });

  it('vrací null pro rovnoběžné úsečky', () => {
    const a = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const b = { id: 2, type: 'line', x1: 0, y1: 5, x2: 10, y2: 5 };
    expect(computeAngleDimPlacement(a, b, 5, 2)).toBeNull();
  });
});

describe('addAngleDimForPlacement', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const l1 = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
  const l2 = { id: 2, type: 'line', x1: 0, y1: 0, x2: 0, y2: 10 };

  it('přímá strana → 90° s dimReflex=false a dimMidAng', () => {
    // kurzor v 1. kvadrantu → přímý úhel 90°
    addAngleDimForPlacement(l1, l2, 20, 20);
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.dimType).toBe('angular');
    expect(arg.dimAngle).toBeCloseTo(Math.PI / 2, 5);
    expect(arg.name).toContain('∠90.0°');
    expect(arg.dimReflex).toBe(false);
    expect(arg.dimMidAng).not.toBeUndefined();
    expect(arg.dimLine1Id).toBe(1);
    expect(arg.dimLine2Id).toBe(2);
  });

  it('vnější strana → reflexních 270° (360−90) s dimReflex=true', () => {
    // kurzor ve 3. kvadrantu → reflex
    addAngleDimForPlacement(l1, l2, -20, -20);
    const arg = addObject.mock.calls[0][0];
    expect(arg.dimAngle * 180 / Math.PI).toBeCloseTo(270, 4);
    expect(arg.dimReflex).toBe(true);
    expect(arg.name).toContain('∠270.0°');
  });

  it('rovnoběžné úsečky nepřidají kótu', () => {
    const b = { id: 3, type: 'line', x1: 0, y1: 5, x2: 10, y2: 5 };
    addAngleDimForPlacement(l1, b, 5, 2);
    expect(addObject).not.toHaveBeenCalled();
  });
});

describe('addArcRadiusLeader / addArcAngleDim (interaktivní kóty oblouku)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const arc = { id: 5, type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: Math.PI / 2 };

  it('addArcRadiusLeader: leader se šipkou na oblouku a popiskem na kurzoru', () => {
    // kotva pod 45°, umístit ven do (20,20)
    addArcRadiusLeader(arc, Math.PI / 4, 20, 20);
    expect(addObject).toHaveBeenCalledOnce();
    const a = addObject.mock.calls[0][0];
    expect(a.dimType).toBe('radius');
    expect(a.dimLeader).toBe(true);
    expect(a.dimRadius).toBe(10);
    expect(a.sourceObjId).toBe(5);
    expect(a.dimAnchorAngle).toBeCloseTo(Math.PI / 4, 6);
    // bod na oblouku (x1,y1) = střed + r*(cos,sin)(45°)
    expect(a.x1).toBeCloseTo(10 * Math.cos(Math.PI / 4), 4);
    expect(a.y1).toBeCloseTo(10 * Math.sin(Math.PI / 4), 4);
    // popisek na (20,20)
    expect(a.x2).toBeCloseTo(20, 4);
    expect(a.y2).toBeCloseTo(20, 4);
    expect(a.name).toContain('R10.00');
  });

  it('addArcAngleDim: rozevření 90° s dimMidAng', () => {
    addArcAngleDim(arc);
    const a = addObject.mock.calls[0][0];
    expect(a.dimType).toBe('angular');
    expect(a.dimAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(a.dimMidAng).toBeCloseTo(Math.PI / 4, 6);
    expect(a.name).toContain('∠90.0°');
  });
});

describe('buildZAxisRefLine + polární úhel od osy Z', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('buildZAxisRefLine dá vodorovné rameno v průsečíku s osou Z', () => {
    // úsečka protínající osu Z v x=10 (z (10,-5) do (10+5,5))
    const line = { id: 1, type: 'line', x1: 10, y1: -5, x2: 15, y2: 5 };
    const z = buildZAxisRefLine(line);
    expect(z._zAxis).toBe(true);
    expect(z.y1).toBe(0);
    expect(z.y2).toBe(0);
    expect(z.x1).toBeCloseTo(12.5, 4); // průsečík s Y=0
  });

  it('kóta polárního úhlu od osy Z: 45° úsečka → 45° s dimVsAxis', () => {
    // úsečka pod 45° od osy Z, procházející počátkem
    const line = { id: 1, type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
    const z = buildZAxisRefLine(line);
    // kurzor v 1. kvadrantu (uvnitř přímého úhlu mezi Z+ a úsečkou)
    addAngleDimForPlacement(line, z, 8, 3, { vsAxis: 'Z' });
    expect(addObject).toHaveBeenCalledOnce();
    const arg = addObject.mock.calls[0][0];
    expect(arg.dimType).toBe('angular');
    expect(arg.dimVsAxis).toBe('Z');
    expect(arg.dimLine1Id).toBe(1);
    expect(arg.dimLine2Id).toBeNull(); // osa Z není objekt
    expect(arg.dimAngle * 180 / Math.PI).toBeCloseTo(45, 3);
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

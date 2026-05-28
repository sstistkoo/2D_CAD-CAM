// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: utils.js (čisté funkce bez závislostí)      ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect } from 'vitest';
import {
  distPointToSegment,
  isAngleBetween,
  bulgeToArc,
  radiusToBulge,
  getObjectSnapPoints,
  getNearestPointOnObject,
  safeEvalMath,
} from '../js/utils.js';
import { state } from '../js/state.js';

const PI = Math.PI;
const EPSILON = 1e-9;

// ════════════════════════════════════════
// ── distPointToSegment ──
// ════════════════════════════════════════
describe('distPointToSegment', () => {
  it('bod přímo na úsečce → vzdálenost 0', () => {
    expect(distPointToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0, 10);
  });

  it('kolmý průmět na úsečku', () => {
    // Bod (5,3) k vodorovné úsečce (0,0)→(10,0) → kolmá vzdálenost = 3
    expect(distPointToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 10);
  });

  it('bod za koncovým bodem úsečky', () => {
    // Bod (15,0) k úsečce (0,0)→(10,0) → vzdálenost k (10,0) = 5
    expect(distPointToSegment(15, 0, 0, 0, 10, 0)).toBeCloseTo(5, 10);
  });

  it('bod před počátečním bodem úsečky', () => {
    // Bod (-3,4) k úsečce (0,0)→(10,0) → vzdálenost k (0,0) = 5
    expect(distPointToSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5, 10);
  });

  it('degenerovaný segment (nulová délka) → vzdálenost k bodu', () => {
    expect(distPointToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 10);
  });

  it('bod kolmo k šikmé úsečce', () => {
    // Úsečka (0,0)→(10,10), bod (0,10) → vzdálenost = 10/√2 ≈ 7.071
    const d = distPointToSegment(0, 10, 0, 0, 10, 10);
    expect(d).toBeCloseTo(Math.sqrt(50), 6);
  });

  it('bod ve středu úsečky', () => {
    expect(distPointToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0, 10);
  });

  it('bod na koncovém bodu úsečky', () => {
    expect(distPointToSegment(10, 0, 0, 0, 10, 0)).toBeCloseTo(0, 10);
  });

  it('svislá úsečka', () => {
    expect(distPointToSegment(3, 5, 0, 0, 0, 10)).toBeCloseTo(3, 10);
  });
});

// ════════════════════════════════════════
// ── isAngleBetween ──
// ════════════════════════════════════════
describe('isAngleBetween', () => {
  it('úhel uvnitř oblouku 0→π/2 (45°)', () => {
    expect(isAngleBetween(PI / 4, 0, PI / 2)).toBe(true);
  });

  it('úhel na počátku oblouku', () => {
    expect(isAngleBetween(0, 0, PI / 2)).toBe(true);
  });

  it('úhel na konci oblouku', () => {
    expect(isAngleBetween(PI / 2, 0, PI / 2)).toBe(true);
  });

  it('úhel mimo oblouk 0→π/2 (180°)', () => {
    expect(isAngleBetween(PI, 0, PI / 2)).toBe(false);
  });

  it('oblouk přecházející přes 0° (350°→10°) — úhel 5° je uvnitř', () => {
    const start = 350 * PI / 180;  // ~6.109 rad
    const end = 10 * PI / 180;     // ~0.175 rad
    const angle = 5 * PI / 180;    // ~0.087 rad
    expect(isAngleBetween(angle, start, end)).toBe(true);
  });

  it('oblouk přecházející přes 0° (350°→10°) — úhel 180° je mimo', () => {
    const start = 350 * PI / 180;
    const end = 10 * PI / 180;
    const angle = PI;
    expect(isAngleBetween(angle, start, end)).toBe(false);
  });

  it('oblouk 0→2π (plný kruh) — normalizace end=0, prázdný oblouk', () => {
    // norm(2π - 0) = 0, takže funkce to vidí jako prázdný oblouk
    expect(isAngleBetween(PI, 0, 2 * PI)).toBe(false);
    // Pro téměř plný kruh použij end < 2π
    expect(isAngleBetween(PI, 0, 2 * PI - 1e-9)).toBe(true);
  });

  it('záporné úhly — normalizace', () => {
    // oblouk od -π/4 do π/4, úhel 0 uvnitř
    expect(isAngleBetween(0, -PI / 4, PI / 4)).toBe(true);
  });

  it('velký oblouk 0→270° — 180° je uvnitř', () => {
    const end = 270 * PI / 180;
    expect(isAngleBetween(PI, 0, end)).toBe(true);
  });

  it('velký oblouk 0→270° — 300° je mimo', () => {
    const end = 270 * PI / 180;
    const angle = 300 * PI / 180;
    expect(isAngleBetween(angle, 0, end)).toBe(false);
  });
});

// ════════════════════════════════════════
// ── bulgeToArc ──
// ════════════════════════════════════════
describe('bulgeToArc', () => {
  it('bulge=0 → null (přímý segment)', () => {
    expect(bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBeNull();
  });

  it('nulová délka → null', () => {
    expect(bulgeToArc({ x: 5, y: 5 }, { x: 5, y: 5 }, 1)).toBeNull();
  });

  it('bulge=1 (půlkruh CCW) — poloměr = polovina vzdálenosti', () => {
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
    expect(arc).not.toBeNull();
    expect(arc.r).toBeCloseTo(5, 6);
    expect(arc.ccw).toBe(true);
    // Střed by měl být na (5, ?)
    expect(arc.cx).toBeCloseTo(5, 6);
  });

  it('bulge=-1 (půlkruh CW) — opačný směr', () => {
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, -1);
    expect(arc).not.toBeNull();
    expect(arc.r).toBeCloseTo(5, 6);
    expect(arc.ccw).toBe(false);
    expect(arc.cx).toBeCloseTo(5, 6);
    // Střed CW by měl být na opačné straně než CCW
    const arcCCW = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
    expect(arc.cy).toBeCloseTo(-arcCCW.cy, 6);
  });

  it('malý bulge — velký poloměr', () => {
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.1);
    expect(arc).not.toBeNull();
    expect(arc.r).toBeGreaterThan(10); // pro malý bulge je poloměr větší než vzdálenost
  });

  it('start a end body leží na výsledném oblouku', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 0 };
    const arc = bulgeToArc(p1, p2, 0.5);
    expect(arc).not.toBeNull();
    // Vzdálenost p1 od středu ≈ r
    const d1 = Math.hypot(p1.x - arc.cx, p1.y - arc.cy);
    const d2 = Math.hypot(p2.x - arc.cx, p2.y - arc.cy);
    expect(d1).toBeCloseTo(arc.r, 6);
    expect(d2).toBeCloseTo(arc.r, 6);
  });

  it('svislá tětiva', () => {
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 0, y: 10 }, 1);
    expect(arc).not.toBeNull();
    expect(arc.r).toBeCloseTo(5, 6);
    expect(arc.cy).toBeCloseTo(5, 6);
  });
});

// ════════════════════════════════════════
// ── radiusToBulge ──
// ════════════════════════════════════════
describe('radiusToBulge', () => {
  it('půlkruh (radius = d/2) → bulge = ±1', () => {
    const b = radiusToBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, false);
    expect(Math.abs(b)).toBeCloseTo(1, 6);
  });

  it('CW → záporný bulge', () => {
    const b = radiusToBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, true);
    expect(b).toBeLessThan(0);
  });

  it('CCW → kladný bulge', () => {
    const b = radiusToBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, false);
    expect(b).toBeGreaterThan(0);
  });

  it('poloměr menší než polovina vzdálenosti → 0', () => {
    const b = radiusToBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, false);
    expect(b).toBe(0);
  });

  it('velký poloměr → malý bulge', () => {
    const b = radiusToBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 100, false);
    expect(Math.abs(b)).toBeLessThan(0.1);
  });

  it('round-trip: radiusToBulge → bulgeToArc → r ≈ original', () => {
    const p1 = { x: 0, y: 0 }, p2 = { x: 10, y: 0 };
    const originalR = 8;
    const bulge = radiusToBulge(p1, p2, originalR, false);
    const arc = bulgeToArc(p1, p2, bulge);
    expect(arc).not.toBeNull();
    expect(arc.r).toBeCloseTo(originalR, 4);
  });
});

// ════════════════════════════════════════
// ── getObjectSnapPoints ──
// ════════════════════════════════════════
describe('getObjectSnapPoints', () => {
  it('bod → 1 snap point', () => {
    const pts = getObjectSnapPoints({ type: 'point', x: 10, y: 20 });
    expect(pts).toHaveLength(1);
    expect(pts[0]).toEqual({ x: 10, y: 20 });
  });

  it('úsečka → 3 snap points (start, end, mid)', () => {
    state.snapMidpoints = true;
    const pts = getObjectSnapPoints({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]).toEqual({ x: 10, y: 0 });
    expect(pts[2]).toEqual({ x: 5, y: 0, mid: true });
    state.snapMidpoints = false;
  });

  it('úsečka bez snapMidpoints → 2 snap points', () => {
    state.snapMidpoints = false;
    const pts = getObjectSnapPoints({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(pts).toHaveLength(2);
  });

  it('konstrukční čára → 3 snap points', () => {
    state.snapMidpoints = true;
    const pts = getObjectSnapPoints({ type: 'constr', x1: 0, y1: 0, x2: 6, y2: 8 });
    expect(pts).toHaveLength(3);
    expect(pts[2]).toEqual({ x: 3, y: 4, mid: true }); // midpoint
    state.snapMidpoints = false;
  });

  it('kružnice → 5 snap points (střed + 4 kardinální)', () => {
    state.snapQuadrants = true;
    const pts = getObjectSnapPoints({ type: 'circle', cx: 0, cy: 0, r: 5 });
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual({ x: 0, y: 0 });   // center
    expect(pts[1]).toEqual({ x: 5, y: 0, quarter: true });   // right
    expect(pts[2]).toEqual({ x: -5, y: 0, quarter: true });  // left
    expect(pts[3]).toEqual({ x: 0, y: 5, quarter: true });   // top
    expect(pts[4]).toEqual({ x: 0, y: -5, quarter: true });  // bottom
    state.snapQuadrants = false;
  });

  it('kružnice bez snapQuadrants → 1 snap point (jen střed)', () => {
    state.snapQuadrants = false;
    const pts = getObjectSnapPoints({ type: 'circle', cx: 0, cy: 0, r: 5 });
    expect(pts).toHaveLength(1);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
  });

  it('oblouk → 3 snap points (střed, start, end)', () => {
    const pts = getObjectSnapPoints({
      type: 'arc', cx: 0, cy: 0, r: 10,
      startAngle: 0, endAngle: PI / 2
    });
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 0, y: 0 }); // center
    expect(pts[1].x).toBeCloseTo(10, 6);     // start (r*cos(0))
    expect(pts[1].y).toBeCloseTo(0, 6);
    expect(pts[2].x).toBeCloseTo(0, 6);      // end (r*cos(π/2))
    expect(pts[2].y).toBeCloseTo(10, 6);
  });

  it('obdélník → 5 snap points (4 rohy + střed)', () => {
    state.snapMidpoints = true;
    const pts = getObjectSnapPoints({ type: 'rect', x1: 0, y1: 0, x2: 10, y2: 6 });
    expect(pts).toHaveLength(5);
    expect(pts[4]).toEqual({ x: 5, y: 3, mid: true }); // center
    state.snapMidpoints = false;
  });

  it('polyline (otevřená, 3 body) → vrcholy + midpoints', () => {
    state.snapMidpoints = true;
    const pts = getObjectSnapPoints({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0],
      closed: false,
    });
    // 3 vertices + 2 midpoints = 5
    expect(pts).toHaveLength(5);
    expect(pts[3]).toEqual({ x: 5, y: 0, mid: true });   // mid seg 0
    expect(pts[4]).toEqual({ x: 10, y: 5, mid: true });  // mid seg 1
    state.snapMidpoints = false;
  });

  it('neznámý typ → prázdné pole', () => {
    expect(getObjectSnapPoints({ type: 'unknown' })).toEqual([]);
  });
});

// ════════════════════════════════════════
// ── getNearestPointOnObject ──
// ════════════════════════════════════════
describe('getNearestPointOnObject', () => {
  it('nejbližší bod na vodorovné úsečce', () => {
    const result = getNearestPointOnObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, 5, 3);
    expect(result).not.toBeNull();
    expect(result.x).toBeCloseTo(5, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.dist).toBeCloseTo(3, 6);
  });

  it('projekce za úsečku → clamp na koncový bod', () => {
    const result = getNearestPointOnObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, 15, 0);
    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.dist).toBeCloseTo(5, 6);
  });

  it('nejbližší bod na kružnici', () => {
    const result = getNearestPointOnObject({ type: 'circle', cx: 0, cy: 0, r: 10 }, 20, 0);
    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.dist).toBeCloseTo(10, 6);
  });

  it('kružnice — bod ve středu', () => {
    const result = getNearestPointOnObject({ type: 'circle', cx: 0, cy: 0, r: 10 }, 0, 0);
    expect(result.dist).toBeCloseTo(10, 6);
  });

  it('oblouk — bod v úhlovém rozsahu', () => {
    const result = getNearestPointOnObject({
      type: 'arc', cx: 0, cy: 0, r: 10,
      startAngle: 0, endAngle: PI / 2
    }, 20, 0);
    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(0, 6);
  });

  it('obdélník — nejbližší hrana', () => {
    const result = getNearestPointOnObject({ type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 }, 5, -3);
    expect(result).not.toBeNull();
    expect(result.y).toBeCloseTo(0, 6); // horní hrana
    expect(result.dist).toBeCloseTo(3, 6);
  });

  it('neznámý typ → null', () => {
    expect(getNearestPointOnObject({ type: 'unknown' }, 0, 0)).toBeNull();
  });
});

// ════════════════════════════════════════
// ── safeEvalMath ──
// ════════════════════════════════════════
describe('safeEvalMath', () => {
  it('jednoduché číslo', () => {
    expect(safeEvalMath('42')).toBe(42);
  });

  it('sčítání', () => {
    expect(safeEvalMath('10+5')).toBe(15);
  });

  it('násobení a dělení', () => {
    expect(safeEvalMath('200/4')).toBe(50);
    expect(safeEvalMath('3*7')).toBe(21);
  });

  it('závorky', () => {
    expect(safeEvalMath('(10+5)*2')).toBe(30);
  });

  it('mocnina (^)', () => {
    expect(safeEvalMath('2^10')).toBe(1024);
  });

  it('desetinná čárka → tečka', () => {
    expect(safeEvalMath('3,14')).toBeCloseTo(3.14, 6);
  });

  it('prázdný string → NaN', () => {
    expect(safeEvalMath('')).toBeNaN();
  });

  it('nepovolené znaky → NaN', () => {
    expect(safeEvalMath('alert(1)')).toBeNaN();
    expect(safeEvalMath('process.exit()')).toBeNaN();
  });

  it('neuzavřené závorky → NaN', () => {
    expect(safeEvalMath('(10+5')).toBeNaN();
  });

  it('extra závorky → NaN', () => {
    expect(safeEvalMath('10+5)')).toBeNaN();
  });

  it('non-string vstup', () => {
    expect(safeEvalMath(null)).toBeNaN();
    expect(safeEvalMath(undefined)).toBeNaN();
  });

  it('Infinity → NaN', () => {
    expect(safeEvalMath('1/0')).toBeNaN();
  });

  it('sin ve stupních', () => {
    expect(safeEvalMath('sin(30)')).toBeCloseTo(0.5, 6);
    expect(safeEvalMath('sin(90)')).toBeCloseTo(1, 6);
  });

  it('cos ve stupních', () => {
    expect(safeEvalMath('cos(60)')).toBeCloseTo(0.5, 6);
    expect(safeEvalMath('cos(0)')).toBeCloseTo(1, 6);
  });

  it('tan ve stupních', () => {
    expect(safeEvalMath('tan(45)')).toBeCloseTo(1, 6);
  });

  it('inverzní goniometrické funkce (výsledek ve stupních)', () => {
    expect(safeEvalMath('asin(0.5)')).toBeCloseTo(30, 6);
    expect(safeEvalMath('acos(0.5)')).toBeCloseTo(60, 6);
    expect(safeEvalMath('atan(1)')).toBeCloseTo(45, 6);
  });

  it('sqrt', () => {
    expect(safeEvalMath('sqrt(144)')).toBe(12);
    expect(safeEvalMath('sqrt(2)')).toBeCloseTo(1.41421356, 5);
  });

  it('abs', () => {
    expect(safeEvalMath('abs(-5)')).toBe(5);
  });

  it('log (log10) a ln', () => {
    expect(safeEvalMath('log(100)')).toBeCloseTo(2, 6);
    expect(safeEvalMath('ln(1)')).toBeCloseTo(0, 6);
  });

  it('round, floor, ceil', () => {
    expect(safeEvalMath('round(3.7)')).toBe(4);
    expect(safeEvalMath('floor(3.7)')).toBe(3);
    expect(safeEvalMath('ceil(3.2)')).toBe(4);
  });

  it('konstanty pi a e', () => {
    expect(safeEvalMath('pi')).toBeCloseTo(Math.PI, 6);
    expect(safeEvalMath('e')).toBeCloseTo(Math.E, 6);
  });

  it('kombinace: sqrt(2)*50', () => {
    expect(safeEvalMath('sqrt(2)*50')).toBeCloseTo(70.71068, 3);
  });

  it('vnořené funkce: sin(atan(1))', () => {
    expect(safeEvalMath('sin(atan(1))')).toBeCloseTo(Math.sin(45 * Math.PI / 180), 6);
  });

  it('výraz s pi: 2*pi', () => {
    expect(safeEvalMath('2*pi')).toBeCloseTo(2 * Math.PI, 6);
  });

  it('neznámá funkce → NaN', () => {
    expect(safeEvalMath('foo(1)')).toBeNaN();
  });

  it('neznámá konstanta → NaN', () => {
    expect(safeEvalMath('xyz')).toBeNaN();
  });

  it('stále blokuje nebezpečný kód', () => {
    expect(safeEvalMath('alert(1)')).toBeNaN();
    expect(safeEvalMath('process.exit()')).toBeNaN();
    expect(safeEvalMath('constructor')).toBeNaN();
  });
});

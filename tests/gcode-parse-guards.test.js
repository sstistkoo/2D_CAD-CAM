// Parser G-kódu pro 🔄 Vykreslit (storage/gcodeParse.js) – řádky, které se dřív
// tiše zahodily nebo nakreslily falešnou geometrii (nález 29. 10. 2026).
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGcodeToObjects } from '../js/storage/gcodeParse.js';
import { state } from '../js/state.js';

const P = (code) => parseGcodeToObjects(code);
const lines = (r) => r.objs.filter((o) => o.type === 'line');
const arcs = (r) => r.objs.filter((o) => o.type === 'arc');
const BASE = 'G90 G00 X0 Z0\nG01 X10 Z-10\n';

beforeEach(() => {
  state.machineType = 'soustruh';
  state.xDisplayMode = 'radius';
  state.flipX = false;
  state.flipZ = false;
});

describe('G-kódy, které nejsou pohyb po kontuře', () => {
  it('G04 X2.5 (prodleva) nekreslí úsečku a nepřesune polohu', () => {
    const r = P(`${BASE}G04 X2.5\nG01 X20 Z-20`);
    expect(lines(r)).toHaveLength(2);
    expect(lines(r)[1]).toMatchObject({ x1: -10, y1: 10, x2: -20, y2: 20 });
  });
  it('G28 X0 Z0 / G53 X Z nekreslí cestu domů', () => {
    expect(lines(P(`${BASE}G28 X0 Z0\nG01 X20 Z-20`))).toHaveLength(2);
    expect(lines(P(`${BASE}G53 G00 X0 Z0\nG01 X20 Z-20`))).toHaveLength(2);
  });
  it('G76 / G71 cyklus nekreslí falešnou úsečku', () => {
    expect(lines(P(`${BASE}G76 X8 Z-9 K1`))).toHaveLength(1);
  });
  it('G50/G92 se nekreslí a ohlásí posun nulového bodu', () => {
    const r = P(`${BASE}G50 X100 Z100\nG01 X20 Z-20`);
    expect(lines(r)).toHaveLength(2);
    expect(r.warnings[0]).toMatchObject({ line: 3, kept: true });
    expect(r.warnings[0].reason).toMatch(/nulový bod/);
  });
  it('G20 (palce) se ohlásí, výkres se přesto vytvoří', () => {
    const r = P('G20 G90 G00 X0 Z0\nG01 X1 Z-1');
    expect(lines(r)).toHaveLength(1);
    expect(r.warnings.filter((w) => /palce/.test(w.reason))).toHaveLength(1);
  });
});

describe('zápis čísel a přírůstků', () => {
  it('desetinná čárka X10,5 se čte jako 10.5 (dřív jen 10)', () => {
    expect(lines(P('G90 G00 X0 Z0\nG01 X10,5 Z-10'))[0].y2).toBeCloseTo(10.5, 9);
  });
  it('čárka mezi slovy se nemění', () => {
    expect(lines(P('G90 G00 X0 Z0\nG01 X10 Z-10'))).toHaveLength(1);
  });
  it('U/W = přírůstek od aktuální polohy (Fanuc), dřív se řádek zahodil', () => {
    const r = P(`${BASE}G01 U5 W-5`);
    expect(lines(r)).toHaveLength(2);
    expect(lines(r)[1]).toMatchObject({ x1: -10, y1: 10, x2: -15, y2: 15 });
  });
  it('U v diametrálním režimu je přírůstek průměru (poloměr +U/2)', () => {
    state.xDisplayMode = 'diameter';
    const r = P('G90 G00 X0 Z0\nG01 X20 Z-10\nG01 U10');
    expect(lines(r)[1].y2 - lines(r)[1].y1).toBeCloseTo(5, 9);
  });
  it('G91 na karuselu: Z-10 jde po ose Z, X10 po ose X (dřív se Z nepohnulo a X šlo do Z)', () => {
    state.machineType = 'karusel';
    const r = P('G90 G00 X0 Z0\nG91\nG01 Z-10\nG01 X10');
    // karusel: svět x = X (poloměr), y = Z
    expect(lines(r)[0]).toMatchObject({ x1: 0, y1: 0, x2: 0, y2: -10 });
    expect(lines(r)[1]).toMatchObject({ x1: 0, y1: -10, x2: 10, y2: -10 });
  });
  it('G91 na soustruhu beze změny', () => {
    const r = P('G90 G00 X0 Z0\nG91\nG01 Z-10\nG01 X10');
    expect(lines(r)[0]).toMatchObject({ x2: -10, y2: 0 });
    expect(lines(r)[1]).toMatchObject({ x2: -10, y2: 10 });
  });
  it('U/W při G91 je to samé jako X/Z', () => {
    const r = P('G90 G00 X0 Z0\nG91\nG01 U5 W-5');
    expect(lines(r)[0]).toMatchObject({ x2: -5, y2: 5 });
  });
});

describe('oblouky: nic se nezahazuje potichu', () => {
  it('oblouk bez R i I/K se ohlásí', () => {
    const r = P('G90 G00 X0 Z0\nG03 X10 Z-10');
    expect(arcs(r)).toHaveLength(0);
    expect(r.warnings[0].reason).toMatch(/nemá R ani I\/K/);
  });
  it('I/K, které nesedí ke koncovému bodu, se ohlásí (oblouk se nakreslí)', () => {
    const r = P('G90 G00 X0 Z0\nG03 X10 Z-10 I0 K-3');
    expect(arcs(r)).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ kept: true });
    expect(r.warnings[0].reason).toMatch(/I\/K nesedí/);
  });
  it('správné I/K žádné varování nedá', () => {
    // střed (X0,Z-5) leží na půli úsečky 0,0 → 0,-10 a R = 5
    const r = P('G90 G00 X0 Z0\nG03 X0 Z-10 I0 K-5');
    expect(arcs(r)).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });
  it('I je poloměr i v průměrovém režimu (Fanuc/Sinumerik): X20 → X40, I5 = střed na poloměru 15', () => {
    state.xDisplayMode = 'diameter';
    const r = P('G90 G00 X20 Z0\nG02 X40 Z0 I5 K0');
    expect(r.warnings).toEqual([]);              // dřív I/2 → „I/K nesedí"
    const a = arcs(r)[0];
    expect(a.r).toBeCloseTo(5, 9);
    expect(a.cx).toBeCloseTo(0, 9);              // soustruh: svět x = Z
    expect(a.cy).toBeCloseTo(15, 9);             // svět y = poloměr
  });
  it('I v poloměru platí i na karuselu', () => {
    state.xDisplayMode = 'diameter';
    state.machineType = 'karusel';
    const a = arcs(P('G90 G00 X20 Z0\nG02 X40 Z0 I5 K0'))[0];
    expect(a.r).toBeCloseTo(5, 9);
    expect(a.cx).toBeCloseTo(15, 9);             // karusel: svět x = poloměr
    expect(a.cy).toBeCloseTo(0, 9);
  });
  it('kružnice G02 I5 bez X/Z se ohlásí místo tichého zahození', () => {
    const r = P('G90 G00 X0 Z0\nG02 I5');
    expect(r.objs).toHaveLength(0);
    expect(r.warnings[0].reason).toMatch(/bez X\/Z/);
  });
  it('R i záporné R (velký oblouk) dál fungují', () => {
    const small = arcs(P('G90 G00 X0 Z0\nG03 X0 Z-10 R6'))[0];
    const big = arcs(P('G90 G00 X0 Z0\nG03 X0 Z-10 R-6'))[0];
    expect(small.r).toBeCloseTo(6, 9);
    expect(big.r).toBeCloseTo(6, 9);
    expect(Math.hypot(small.cx - big.cx, small.cy - big.cy)).toBeGreaterThan(1);
  });
});

describe('beze změny pro běžný program', () => {
  it('modální G01, komentáře, čísla bloků', () => {
    const r = P('N10 G90 G00 X0 Z0 ; start\nN20 G01 X10 Z-10 (hrana)\nN30 Z-20\nN40 X20');
    expect(lines(r)).toHaveLength(3);
    expect(r.warnings).toEqual([]);
  });
});

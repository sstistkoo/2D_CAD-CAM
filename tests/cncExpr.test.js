import { describe, it, expect } from 'vitest';
import { evalExpr, readAddr, resolveExpressions } from '../js/calculators/cncExpr.js';
import { analyzeDrawCode, convertLinesMode } from '../js/calculators/cncDrawTools.js';

const to = (code, line, o = {}) => analyzeDrawCode(code, o).byLine.get(line).to;

describe('výrazy a R-parametry v kódu', () => {
  it('číslo, =výraz, [výraz] i číslo s operátory', () => {
    const p = new Map(), bad = [];
    expect(readAddr('G1 X10 Z20', 'X', p, bad)).toBe(10);
    expect(readAddr('G1 X=10+5 Z20', 'X', p, bad)).toBe(15);
    expect(readAddr('G1 X[10/4] Z20', 'X', p, bad)).toBe(2.5);
    expect(readAddr('G1 X10+5 Z20', 'X', p, bad)).toBe(15);
    expect(readAddr('G1 Z=SIN(30)*10', 'Z', p, bad)).toBeCloseTo(5);
    expect(readAddr('G1 Z-10 F0.2', 'Z', p, bad)).toBe(-10);
    expect(bad).toEqual([]);
  });
  it('R-parametry se dosazují z dřívějších řádků, neznámý se ohlásí', () => {
    const an = analyzeDrawCode('R1=10\nR2=R1*2+3\nG0 X0 Z0\nG1 X=R2 Z=R1/4');
    expect(an.byLine.get(3).to).toEqual({ z: 2.5, x: 23 });
    const bad = analyzeDrawCode('G0 X0 Z0\nG1 X=R9*2 Z5');
    expect(bad.bad.get(1)).toMatch(/R9/);
    expect(bad.byLine.get(1).to.x).toBe(0);     // chybný výraz se nepromítne do geometrie (osa se nemění)
  });
  it('dříve: X10+5 dalo 10 a X=R1*2 dalo 0 – teď správně', () => {
    expect(to('G0 X0 Z0\nG1 X10+5 Z20', 1)).toEqual({ z: 20, x: 15 });
    expect(to('R1=10\nG0 X0 Z0\nG1 X=R1*2 Z20', 2)).toEqual({ z: 20, x: 20 });
  });
  it('průměr: výraz je v jednotkách kódu (X=20+10 v průměru = poloměr 15)', () => {
    expect(to('G0 X0 Z0\nG1 X=20+10 Z5', 1, { diam: true }).x).toBe(15);
  });
  it('výrazy v obloucích (R, I, K) a v polárním zadání', () => {
    const a = analyzeDrawCode('G0 X0 Z0\nG3 X10 Z10 I=0 K=5*2').byLine.get(1).arc;
    expect(a.err).toBeUndefined(); expect(a.r).toBeCloseTo(10);
    const m = analyzeDrawCode('G0 X0 Z0\nG1 PU=90/2 L=10*2').byLine.get(1);
    expect(m.to.z).toBeCloseTo(20 * Math.SQRT1_2);
  });
  it('převod na čísla zachová vše ostatní a nevyhodnotitelné nechá', () => {
    const r = resolveExpressions('R1=10\nG0 X0 Z0 ; start\nG1 X=R1*2 Z[1+1] F0.2 ; x=3+4\nG1 X=R9 Z5\nTRANS X=1+1');
    expect(r.code).toBe('R1=10\nG0 X0 Z0 ; start\nG1 X20 Z2 F0.2 ; x=3+4\nG1 X=R9 Z5\nTRANS X=1+1');
    expect(r.converted).toBe(2);
  });
  it('převod G90 ↔ G91 neporuší výraz', () => {
    const r = convertLinesMode('G0 X0 Z0\nG1 X=10+5 Z=2*3', 1, 1, 91);
    expect(r.code).toBe('G0 X0 Z0\nG91 G1 X15 Z6');
  });
  it('evalExpr: funkce ve stupních, mocnina, chyba', () => {
    expect(evalExpr('COS(60)*10', new Map())).toBeCloseTo(5);
    expect(evalExpr('2^3', new Map())).toBe(8);
    expect(evalExpr('R1+1', new Map())).toBeNaN();
    expect(evalExpr('1/0', new Map())).toBeNaN();
  });
});

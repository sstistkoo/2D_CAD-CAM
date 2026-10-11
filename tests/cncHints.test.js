import { describe, it, expect } from 'vitest';
import { lineHint } from '../js/calculators/cncHints.js';

describe('lineHint – nápověda k zápisu', () => {
  it('G0 = startovní bod, X podle režimu', () => {
    const h = lineHint('G0 X10 Z5', 1, { diam: true });
    expect(h.items[0]).toMatchObject({ k: 'G0', cur: true });
    expect(h.items[0].t).toMatch(/STARTOVNÍ/);
    expect(h.items.find(i => i.k === 'X').t).toMatch(/průměr/);
  });
  it('oblouk bez R / I K upozorní, s oběma také', () => {
    expect(lineHint('G2 X1 Z2', 0).tip).toMatch(/R/);
    expect(lineHint('G3 X1 Z2 R3 I1 K1', 0).tip).toMatch(/BUĎ/);
    expect(lineHint('G3 X1 Z2 R3', 0).tip).toBe('');
  });
  it('prázdný řádek radí start / další bod', () => {
    expect(lineHint('', 0).tip).toMatch(/startovním/);
    expect(lineHint('', 0, { hasPrevMove: true }).tip).toMatch(/G1/);
  });
  it('komentář a značky', () => {
    expect(lineHint('; KONTURA_START – x', 0).comment).toMatch(/obrysu/);
    expect(lineHint('; cokoliv', 0).comment).toMatch(/komentář/);
    expect(lineHint('G1 X5 ; G2 R9', 0).items.map(i => i.k)).toEqual(['G1', 'X']);
  });
  it('slovo pod kurzorem je první', () => {
    const h = lineHint('G1 X5 Z7', 4);
    expect(h.items[0]).toMatchObject({ k: 'X', cur: true });
  });
});

import { analyzeDrawCode, moveAtOrBefore, moveDirDeg, angleLineEnd } from '../js/calculators/cncDrawTools.js';

describe('úhel od předchozí úsečky', () => {
  it('směr předchozí úsečky + odklon dává správný konec', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 Z10');
    const p = moveAtOrBefore(an, 1);
    expect(moveDirDeg(p, an)).toBeCloseTo(0);
    // vlevo 90° od směru +Z = kolmo ve směru +X
    const r = angleLineEnd(p.to, moveDirDeg(p, an) + 90, { L: 5 }, an.xs);
    expect(r.z).toBeCloseTo(10); expect(r.x).toBeCloseTo(5 * an.xs);
  });
  it('oblouk dává tečnu, nulový pohyb null', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 X5 Z5\nG1 X5 Z5');
    expect(moveDirDeg(moveAtOrBefore(an, 1), an)).toBeCloseTo(45);
    expect(moveDirDeg(moveAtOrBefore(an, 2), an)).toBeNull();
    expect(moveDirDeg(null, an)).toBeNull();
  });
});

import { modeAtLine } from '../js/calculators/cncDrawTools.js';
describe('modeAtLine', () => {
  it('poslední G90/G91 před řádkem', () => {
    const c = 'G90 G0 X0 Z0\nG1 X5\nG91\nG1 Z2 ; G90\nG1 Z3';
    expect(modeAtLine(c, 1)).toBe(90);
    expect(modeAtLine(c, 2)).toBe(91);
    expect(modeAtLine(c, 4)).toBe(91);
    expect(modeAtLine('G1 X1', 0)).toBe(90);
  });
});

import { describe, it, expect } from 'vitest';
import { analyzeDrawCode, polarToXZ } from '../js/calculators/cncDrawTools.js';
import { joinAtIntersection } from '../js/calculators/cncJoin.js';

const EX = 'G0 X0 Z0\nG1 PU45 L1200\nG0 X50 Z200\nPU180 L1200';

describe('polární úsečky PU/L', () => {
  it('analýza spočítá konce', () => {
    const an = analyzeDrawCode(EX);
    expect(an.moves).toHaveLength(4);
    const m = an.byLine.get(1);
    expect(m.to.z).toBeCloseTo(1200 * Math.SQRT1_2); expect(m.to.x).toBeCloseTo(1200 * Math.SQRT1_2);
    const b = an.byLine.get(3);
    expect(b.g).toBe(1); expect(b.to.z).toBeCloseTo(200 - 1200); expect(b.to.x).toBeCloseTo(50);
  });
  it('PU s cílovým Z a bez L', () => {
    const m = analyzeDrawCode('G0 X0 Z0\nG1 PU0 Z40').byLine.get(1);
    expect(m.to.z).toBeCloseTo(40); expect(m.to.x).toBeCloseTo(0);
    expect(analyzeDrawCode('G0 X0 Z0\nG1 PU45').byLine.get(1).polarErr).toBeTruthy();
  });
  it('převod na X Z vynechá nezměněnou osu', () => {
    const r = polarToXZ('G0 X0 Z0\nG1 PU0 L10 ; a\nPU90 L5');
    expect(r.code).toBe('G0 X0 Z0\nG1 Z10 ; a\nG1 X5');
    expect(r.converted).toBe(2);
  });
});

describe('spojení v průsečíku', () => {
  it('příklad uživatele → X50 Z50 a Z200', () => {
    const r = joinAtIntersection(EX, 3, {});
    expect(r.err).toBeUndefined();
    expect(r.code).toBe('G0 X0 Z0\nG1 X50 Z50\nZ200');
    expect(r.point.z).toBeCloseTo(50);
  });
  it('kurzor na rychloposuvu před druhou úsečkou také funguje', () => {
    expect(joinAtIntersection(EX, 2, {}).code).toBe('G0 X0 Z0\nG1 X50 Z50\nZ200');
  });
  it('obyčejné X Z úsečky, G91 dá přírůstky', () => {
    const c = 'G0 X0 Z0\nG1 X100 Z100\nG0 X50 Z200\nG1 X50 Z0';
    expect(joinAtIntersection(c, 3, {}).code).toBe('G0 X0 Z0\nG1 X50 Z50\nZ200');
    const inc = 'G90 G0 X0 Z0\nG91\nG1 X100 Z100\nG0 X-50 Z100\nG1 Z-200';
    const r = joinAtIntersection(inc, 4, {});
    expect(r.err).toBeUndefined();
    expect(r.code).toBe('G90 G0 X0 Z0\nG91\nG1 X50 Z50\nZ150');
  });
  it('chyby: rovnoběžné, mimo úsečky, špatný kurzor', () => {
    expect(joinAtIntersection('G0 X0 Z0\nG1 Z10\nG0 X5 Z0\nG1 Z10', 3).err).toMatch(/rovnoběžné/);
    expect(joinAtIntersection('G0 X0 Z0\nG1 X10 Z10\nG0 X50 Z200\nG1 Z190', 3).err).toMatch(/neprotínají/);
    expect(joinAtIntersection(EX, 1).err).toMatch(/Kurzor/);
  });
});

describe('spojení – kód exportovaný z plátna', () => {
  it('přepíše délky v popiscích', () => {
    const c = 'G90 G00 X0 Z0 ; start\nG01 X100 Z100 ; line 1, L=141.421\nG00 X50 Z200 ; start\nG01 Z0 ; line 2, L=200';
    const r = joinAtIntersection(c, 3, {});
    expect(r.code).toBe('G90 G00 X0 Z0 ; start\nG1 X50 Z50 ; line 1, L=70.711\nZ200 ; line 2, L=150');
  });
  it('T-křížení: konec první úsečky leží uvnitř druhé', () => {
    const c = 'G0 X0 Z0\nG1 X50 Z50\nG0 Z200\nG1 Z0';
    expect(joinAtIntersection(c, 3, {}).code).toBe('G0 X0 Z0\nG1 X50 Z50\nZ200');
  });
});

import { moveInfo } from '../js/calculators/cncDrawTools.js';
it('chybné PU/L se v údajích k řádku vysvětlí', () => {
  const an = analyzeDrawCode('G0 X0 Z0\nG1 PU45');
  expect(moveInfo(an.byLine.get(1), an).join(' ')).toMatch(/délku L/);
});

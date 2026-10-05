import { describe, it, expect } from 'vitest';
import { analyzeDrawCode, moveInfo, geometryChecks, angleLineEnd, convertLinesMode, moveAtOrBefore } from '../js/calculators/cncDrawTools.js';

const ALL = { arcFit: { active: true }, contJump: { active: true }, negX: { active: true }, tangency: { active: true } };

describe('cncDrawTools – rozbor kreslicího G-kódu', () => {
  it('úsečka: modální G, chybějící osa zůstává, délka a úhel', () => {
    const an = analyzeDrawCode('G90 G0 X20 Z100\nG1 Z60\nX40');
    expect(an.moves).toHaveLength(3);
    const m = an.byLine.get(2);
    expect(m.g).toBe(1);
    expect(m.from).toEqual({ z: 60, x: 20 });
    expect(m.to).toEqual({ z: 60, x: 40 });
    expect(moveInfo(m, an)).toContain('∠ 90°');
    expect(moveInfo(an.byLine.get(1), an)).toContain('L 40');
  });

  it('průměr: X v kódu dvojnásobné, geometrie v poloměru', () => {
    const an = analyzeDrawCode('G0 X40 Z10\nG1 X80', { diam: true });
    const m = an.byLine.get(1);
    expect(m.to.x).toBe(40);
    expect(moveInfo(m, an)).toContain('L 20');
    expect(moveInfo(m, an)).toContain('ΔX 40');
  });

  it('oblouk z R i z I/K dává stejný střed', () => {
    const r = analyzeDrawCode('G0 X20 Z65\nG2 X25 Z60 R5').byLine.get(1).arc;
    const ik = analyzeDrawCode('G0 X20 Z65\nG2 X25 Z60 I5 K0').byLine.get(1).arc;
    expect(r.cx).toBeCloseTo(25, 6); expect(r.cz).toBeCloseTo(65, 6);
    expect(ik.cx).toBeCloseTo(25, 6); expect(ik.cz).toBeCloseTo(65, 6);
    expect(r.sweep * 180 / Math.PI).toBeCloseTo(90, 6);
  });

  it('oblouk s malým R a nesouhlasným I/K hlásí chybu', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG3 X0 Z20 R5\nG0 X0 Z0\nG3 X0 Z20 I0 K7');
    const errs = geometryChecks(an, { arcFit: { active: true } }).map(e => e.lineIndex);
    expect(errs).toEqual([1, 3]);
  });

  it('kontury: skok G0 uprostřed, X pod osou; polotovar začíná znovu', () => {
    const code = 'G0 X10 Z50\nG1 Z40\nG0 X20 Z30\nG1 X-2\n; STOCK_START\nG0 X30 Z50\nG1 Z0\n; STOCK_END';
    const msgs = geometryChecks(analyzeDrawCode(code), ALL);
    expect(msgs.map(e => e.lineIndex)).toEqual([2, 3]);
  });

  it('tečnost: zaoblení z převodu je tečné, ostrý přechod ne', () => {
    const ok = geometryChecks(analyzeDrawCode('G0 X20 Z100\nG1 Z65\nG2 X25 Z60 R5\nG1 X40'), ALL);
    expect(ok).toEqual([]);
    // R10 by byl tečný (střed X30 Z60) – R15 tečný není
    const bad = geometryChecks(analyzeDrawCode('G0 X20 Z100\nG1 Z60\nG2 X30 Z50 R15'), ALL);
    expect(bad).toHaveLength(1);
  });

  it('úsečka úhlem: délka, cílové X, cílové Z, průměr', () => {
    const from = { z: 100, x: 20 };
    const a = angleLineEnd(from, 180, { L: 30 });
    expect(a.z).toBeCloseTo(70, 9); expect(a.x).toBeCloseTo(20, 9);
    const b = angleLineEnd(from, 135, { X: 30 });
    expect(b.x).toBeCloseTo(30, 9); expect(b.z).toBeCloseTo(90, 9);
    const c = angleLineEnd(from, 135, { X: 60 }, 2);   // průměr 60 = poloměr 30
    expect(c.x).toBeCloseTo(60, 9); expect(c.z).toBeCloseTo(90, 9);
    expect(angleLineEnd(from, 0, { X: 30 }).err).toBeTruthy();
    expect(angleLineEnd(from, 45, { Z: 50 }).err).toBeTruthy();   // cíl za zády
  });

  it('G90 → G91 jen pro vybrané řádky a zpět beze změny geometrie', () => {
    const code = 'G90 G0 X20 Z100\nG1 Z60\nX40\nZ0';
    const inc = convertLinesMode(code, 1, 2, 91);
    expect(inc.changed).toBe(2);
    expect(inc.code.split('\n')).toEqual(['G90 G0 X20 Z100', 'G91 G1 Z-40', 'X20', 'G90 Z0']);
    const before = analyzeDrawCode(code).moves.map(m => m.to);
    expect(analyzeDrawCode(inc.code).moves.map(m => m.to)).toEqual(before);
    const back = convertLinesMode(inc.code, 1, 2, 90);
    expect(analyzeDrawCode(back.code).moves.map(m => m.to)).toEqual(before);
  });

  it('poloha na řádku bez pohybu = poslední pohyb před ním', () => {
    const an = analyzeDrawCode('G0 X10 Z5\n; poznámka\nG1 Z0');
    expect(moveAtOrBefore(an, 1).to).toEqual({ z: 5, x: 10 });
  });
});

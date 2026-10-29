// CNC Editor: po Enter se řádek se souřadnicemi bez G dokončí (první G0, další G1).
import { describe, it, expect } from 'vitest';
import { completeMotionLine as C, autoCompleteMotionG } from '../js/calculators/gcodeAutoMotion.js';

describe('completeMotionLine', () => {
  it('první řádek se souřadnicemi v prázdném editoru → G0', () => {
    expect(C('', 'X0 Z346.371')).toBe('G0 X0 Z346.371');
    expect(C('', 'Z5')).toBe('G0 Z5');
    expect(C('', 'x10 z-5')).toBe('G0 x10 z-5');
  });
  it('další řádek po G0 → G1 (přímka)', () => {
    expect(C('G0 X0 Z5\n', 'X10 Z-5')).toBe('G1 X10 Z-5');
  });
  it('po oblouku bez G → G1', () => {
    expect(C('G0 X0 Z0\nG2 X5 Z-5 R5\n', 'Z-20')).toBe('G1 Z-20');
  });
  it('platí-li už G1, řádek se nemění (platný modální zápis)', () => {
    expect(C('G0 X0 Z0\nG1 X5 Z-5\n', 'Z-20')).toBeNull();
    expect(C('G90 G00 X0 Z346\nG01 X9 Z345\n', 'Z243.123 ; Úsečka 2')).toBeNull();
  });
  it('vkládá těsně před první souřadnici, G90 a číslo bloku zůstanou', () => {
    expect(C('', 'G90 X0 Z5')).toBe('G90 G0 X0 Z5');
    expect(C('', 'N10 X0 Z5')).toBe('N10 G0 X0 Z5');
    expect(C('G0 X0 Z0\n', 'G91 X5')).toBe('G91 G1 X5');
  });
  it('komentář zůstane, souřadnice v komentáři se nepočítají', () => {
    expect(C('', 'X0 Z5 ; start')).toBe('G0 X0 Z5 ; start');
    expect(C('', '; X5 Z6')).toBeNull();
    expect(C('', '(X5) X0')).toBe('(X5) G0 X0');
  });
  it('řádek s G pohybu nebo jiným G kódem se nemění', () => {
    for (const l of ['G0 X5', 'G1 Z-5', 'G01 X5', 'G2 X5 Z5 R3', 'G03 X5 Z5 I1', 'G04 X2.5', 'G28 U0', 'G33 Z-20 K2', 'G53 X0']) {
      expect(C('G0 X0\n', l)).toBeNull();
    }
  });
  it('oblouk bez G (R/I/K) se nehádá', () => {
    expect(C('G0 X0 Z0\n', 'X10 Z-5 R3')).toBeNull();
    expect(C('G0 X0 Z0\n', 'X10 Z-5 I1 K2')).toBeNull();
  });
  it('řádky bez souřadnic, makra a Sinumerik příkazy se nemění', () => {
    for (const l of ['', 'M30', 'T0101', 'S500 M3', 'F0.2', 'G90', '; text', 'R1=5', 'IF X>5', 'DEF REAL X1', 'MSG("X5")', '#100=5']) {
      expect(C('', l)).toBeNull();
    }
  });
  it('CHF/RND za souřadnicí nevadí', () => {
    expect(C('G0 X0 Z0\n', 'Z-10 CHF=2')).toBe('G1 Z-10 CHF=2');
  });
  it('U/W přírůstky se berou jako souřadnice', () => {
    expect(C('', 'U5 W-5')).toBe('G0 U5 W-5');
  });
});

function fakeEditor(value, caret) {
  return { value, selectionStart: caret, selectionEnd: caret, scrollTop: 0, scrollLeft: 0 };
}
const ENTER = { inputType: 'insertLineBreak' };

describe('autoCompleteMotionG (Enter v editoru)', () => {
  it('doplní G0 do prvního řádku a kurzor zůstane na novém řádku', () => {
    const ed = fakeEditor('X0 Z5\n', 6);
    expect(autoCompleteMotionG(ed, ENTER)).toBe('G0 X0 Z5\n');
    expect(ed.value).toBe('G0 X0 Z5\n');
    expect(ed.selectionStart).toBe(ed.value.length);
  });
  it('další řádek → G1', () => {
    const v = 'G0 X0 Z5\nX10 Z-5\n';
    const ed = fakeEditor(v, v.length);
    expect(autoCompleteMotionG(ed, ENTER)).toBe('G0 X0 Z5\nG1 X10 Z-5\n');
    expect(ed.selectionStart).toBe(ed.value.length);
  });
  it('fungují i řádky pod kurzorem (Enter na konci řádku uprostřed programu)', () => {
    const v = 'G0 X0 Z5\nX10 Z-5\n\nG1 X20';
    const ed = fakeEditor(v, 'G0 X0 Z5\nX10 Z-5\n'.length);
    expect(autoCompleteMotionG(ed, ENTER)).toBe('G0 X0 Z5\nG1 X10 Z-5\n\nG1 X20');
  });
  it('bez události zalomení (psaní znaků) se nic neděje', () => {
    const ed = fakeEditor('X0 Z5\n', 6);
    expect(autoCompleteMotionG(ed, { inputType: 'insertText' })).toBe('X0 Z5\n');
    expect(autoCompleteMotionG(ed, undefined)).toBe('X0 Z5\n');
  });
  it('Enter uprostřed řádku se nedotýká nic', () => {
    const ed = fakeEditor('X0\n Z5', 3);
    expect(autoCompleteMotionG(ed, ENTER)).toBe('X0\n Z5');
  });
  it('výběr (selection) se neřeší', () => {
    const ed = fakeEditor('X0 Z5\n', 6);
    ed.selectionEnd = 2;
    expect(autoCompleteMotionG(ed, ENTER)).toBe('X0 Z5\n');
  });
});

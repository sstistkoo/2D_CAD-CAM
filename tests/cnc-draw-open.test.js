// Kreslicí CNC editor: kurzor po otevření na novém řádku konce kontury, AUTO překreslení.
import { describe, it, expect } from 'vitest';
import { openCaret, sameCode, contourEnd } from '../js/calculators/cncDrawOpen.js';

describe('openCaret', () => {
  it('konec souboru → za poslední řádek, vložit nový', () => {
    const v = '; KONTURA_START\nG90 G0 X300 Z200\nG1 Z250\nX0';
    expect(openCaret(v)).toEqual({ pos: v.length, newline: true });
  });
  it('před STOCK_START, prázdný řádek už je → na něj', () => {
    const v = '; KONTURA_START\nG1 X10\n\n; STOCK_START\nG0 X50';
    expect(openCaret(v)).toEqual({ pos: v.indexOf('\n\n') + 1, newline: false });
  });
  it('před STOCK_START bez prázdného řádku → konec posledního řádku kontury', () => {
    const v = '; KONTURA_START\nG1 X10\n; STOCK_START\nG0 X50';
    expect(openCaret(v)).toEqual({ pos: v.indexOf('X10') + 3, newline: true });
    expect(contourEnd(v).lastLine).toBe(1);
  });
  it('jen značka → nový řádek pod ní', () => {
    expect(openCaret('G90\n; KONTURA_START — kontura').newline).toBe(true);
  });
});
describe('sameCode', () => {
  it('prázdné řádky se nepočítají', () => {
    expect(sameCode('G1 X10\n\nG1 Z5\n', 'G1 X10\nG1 Z5')).toBe(true);
    expect(sameCode('G1 X10', 'G1 X11')).toBe(false);
  });
});

// @vitest-environment-free: autoRedrawOn čte localStorage (v node chybí → výchozí ZAP)
import { autoRedrawOn } from '../js/calculators/cncDrawOpen.js';
describe('autoRedrawOn', () => {
  it('výchozí ZAP – zavření editoru překreslí bez dotazu', () => {
    expect(autoRedrawOn()).toBe(true);
  });
});

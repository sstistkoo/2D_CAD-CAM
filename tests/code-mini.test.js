// ▼ „4 řádky" spodního panelu G-kódu v CAM (cam/sim/codeMini.js).
import { describe, it, expect } from 'vitest';
import { miniLineIdx, isBlockLine } from '../js/calculators/cam/sim/codeMini.js';

const ls = [
  '; Vygenerovaný kód', 'N10 G18', '', 'N20 G90', '; --- HRUBOVANI ---', 'N30 G0 X150', '(pozn.)', 'N40 G1 Z-5', '%',
];

describe('mini náhled G-kódu: prošlý, běžící, dva další', () => {
  it('komentáře a prázdné řádky se přeskakují', () => {
    expect(ls.map(isBlockLine)).toEqual([false, true, false, true, false, true, false, true, false]);
    expect(miniLineIdx(ls, 3)).toEqual({ prev: 1, cur: 3, next: [5, 7] });
  });
  it('na začátku chybí prošlý, na konci další', () => {
    expect(miniLineIdx(ls, 1)).toEqual({ prev: -1, cur: 1, next: [3, 5] });
    expect(miniLineIdx(ls, 7)).toEqual({ prev: 5, cur: 7, next: [-1, -1] });
  });
  it('bez platného řádku je běžící první blok', () => {
    expect(miniLineIdx(ls, null).cur).toBe(1);
    expect(miniLineIdx(ls, 99).cur).toBe(1);
    expect(miniLineIdx(['; jen komentář'], null)).toEqual({ prev: -1, cur: -1, next: [-1, -1] });
  });
});

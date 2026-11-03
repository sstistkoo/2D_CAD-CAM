// Lupa v CNC editoru: pozice v textu z řádku a sloupce (cncLoupe.js).
import { describe, it, expect } from 'vitest';
import { indexAtLineCol } from '../js/calculators/cncLoupe.js';

describe('indexAtLineCol', () => {
  const t = 'G0 X0\nG1 Z-60\n\tX5';
  it('zaokrouhlí na nejbližší hranici znaků', () => {
    expect(indexAtLineCol(t, 1, 3.4).index).toBe(6 + 3);
    expect(indexAtLineCol(t, 1, 3.6).index).toBe(6 + 4);
  });
  it('za koncem řádku → konec řádku; mimo řádky → první / poslední', () => {
    expect(indexAtLineCol(t, 0, 99).index).toBe(5);
    expect(indexAtLineCol(t, -3, 0).index).toBe(0);
    expect(indexAtLineCol(t, 9, 0)).toMatchObject({ index: 14, line: 2 });
  });
  it('tabulátor zabírá tabSize sloupců', () => {
    expect(indexAtLineCol(t, 2, 1)).toMatchObject({ index: 14, vcol: 0 });
    expect(indexAtLineCol(t, 2, 4.2)).toMatchObject({ index: 15, vcol: 4 });
  });
});

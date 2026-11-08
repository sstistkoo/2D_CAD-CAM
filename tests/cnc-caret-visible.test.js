// Kurzor v editoru G-kódu se po vložení nového řádku dorovná do viditelné části.
import { describe, it, expect } from 'vitest';
import { scrollForCaret } from '../js/calculators/cncCaretVisible.js';

const base = { col: 0, lineH: 20, charW: 8, padTop: 10, padLeft: 8, viewH: 200, viewW: 300, scrollTop: 0, scrollLeft: 0 };

describe('scrollForCaret', () => {
  it('kurzor uvnitř pohledu → beze změny', () => {
    expect(scrollForCaret({ ...base, line: 3 })).toEqual({ top: 0, left: 0 });
  });
  it('nový řádek pod okrajem → posun dolů s rezervou 1 řádku', () => {
    const r = scrollForCaret({ ...base, line: 12 });          // řádek 12: top 250, bottom 270
    expect(r.top).toBe(270 + 20 - 200);
  });
  it('kurzor nad pohledem → posun nahoru', () => {
    const r = scrollForCaret({ ...base, line: 2, scrollTop: 300 });
    expect(r.top).toBe(10 + 2 * 20 - 20);
  });
  it('dlouhý řádek → vodorovný posun za kurzorem', () => {
    const r = scrollForCaret({ ...base, line: 0, col: 60 });  // x = 8 + 480
    expect(r.left).toBe(8 + 480 + 16 - 300);
  });
  it('na začátek řádku → vodorovný posun zpět', () => {
    expect(scrollForCaret({ ...base, line: 0, col: 0, scrollLeft: 200 }).left).toBe(0);
  });
});

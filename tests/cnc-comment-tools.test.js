// Enter v poznámce za středníkem nerozdělí poznámku – nový řádek až za koncem řádku.
import { describe, it, expect } from 'vitest';
import { newlinePos } from '../js/calculators/cncCommentTools.js';

const L1 = 'G1 X10 ; dlouhá poznámka';
const v = L1 + '\nG1 Z5';

describe('newlinePos', () => {
  it('kurzor uprostřed poznámky → konec řádku', () => {
    expect(newlinePos(v, L1.indexOf('poz') + 2)).toBe(L1.length);
  });
  it('kurzor hned za kódem před středníkem → konec řádku', () => {
    expect(newlinePos(v, 'G1 X10'.length)).toBe(L1.length);
  });
  it('kurzor v kódu → běžné zalomení', () => {
    expect(newlinePos(v, 3)).toBe(null);
  });
  it('řádek bez poznámky → běžné zalomení', () => {
    expect(newlinePos(v, v.length - 1)).toBe(null);
  });
  it('začátek řádku jen s poznámkou → běžné zalomení (prázdný řádek nad ní)', () => {
    expect(newlinePos('; KONTURA_START\nG0', 0)).toBe(null);
    expect(newlinePos('; KONTURA_START\nG0', 4)).toBe('; KONTURA_START'.length);
  });
  it('středník v MSG("…") není poznámka', () => {
    expect(newlinePos('MSG("a;b") X1', 8)).toBe(null);
  });
});

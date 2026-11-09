// CNC editor: podržení ⌫ smaže celý řádek s kurzorem.
import { describe, it, expect } from 'vitest';
import { deleteLineAt as D } from '../js/calculators/cncLongDelete.js';

describe('deleteLineAt', () => {
  it('řádek uprostřed → kurzor na začátek dalšího', () => {
    expect(D('G90\nG0 X0 Z5\nG1 X10\n', 7)).toEqual({ value: 'G90\nG1 X10\n', caret: 4 });
  });
  it('poslední řádek bez zalomení → kurzor na konec předchozího', () => {
    expect(D('G90\nG91 Z-', 9)).toEqual({ value: 'G90', caret: 3 });
  });
  it('jediný řádek → prázdný editor', () => {
    expect(D('G0 X0', 2)).toEqual({ value: '', caret: 0 });
  });
  it('kurzor na začátku řádku maže tento řádek, ne předchozí', () => {
    expect(D('A\nB\nC', 2)).toEqual({ value: 'A\nC', caret: 2 });
  });
});

describe('deleteLineAt – prázdný řádek po Enter', () => {
  it('smaže řádek nad prázdným, kurzor zůstane na prázdném řádku', () => {
    expect(D('G90\nG0 X0 Z250\nG91 Z-\n', 22)).toEqual({ value: 'G90\nG0 X0 Z250\n', caret: 15 });
  });
});

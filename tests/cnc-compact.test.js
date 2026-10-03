import { describe, it, expect } from 'vitest';
import { compactCncModal } from '../js/storage/cncCompact.js';

const run = (...lines) => compactCncModal(lines.join('\n')).split('\n');

describe('compactCncModal – zhuštěný zápis G-kódu', () => {
  it('G0–G3 se nepíše znovu, dokud ho nezruší jiný pohybový G', () => {
    expect(run('G90', 'G00 X0.000 Z0.000', 'G01 X5.000 Z0.000', 'G01 X5.000 Z10.000', 'G03 X8.000 Z13.000 R3.000', 'G03 X8.000 Z20.000 R3.000'))
      .toEqual(['G90 G00 X0 Z0', 'G01 X5', 'Z10', 'G03 X8 Z13 R3', 'Z20 R3']);
  });

  it('příklad uživatele: jen měněné souřadnice', () => {
    expect(run('G90', 'G01 X30.156 Z213.667', 'G01 X30.156 Z205.009', 'G01 X6.744 Z205.009'))
      .toEqual(['G90 G01 X30.156 Z213.667', 'Z205.009', 'X6.744']);
  });

  it('samostatné G90 se sloučí do prvního pohybu i přes komentář; bez pohybu zůstane', () => {
    expect(run('G90 ; abs', '; úsek', 'G00 X1.000 Z2.000')).toEqual(['; úsek', 'G90 G00 X1 Z2']);
    expect(run('G90', 'M30')).toEqual(['G90', 'M30']);
  });

  it('poznámka objektu jde za řádek kódu (ne za G00); prázdné řádky pryč', () => {
    expect(run(';@ Usecka 1 L=9.169', 'G00 X0.000 Z5.000', 'G01 X9.000 Z5.000', '', ';@ Usecka 2 L=3', 'G01 X9.000 Z5.000'))
      .toEqual(['G00 X0 Z5', 'G01 X9 ; Usecka 1 L=9.169', '; Usecka 2 L=3']);
    expect(run(';@ Bod 1', 'G00 X1.000 Z2.000', ';@ Bod 2', 'G00 X3.000 Z2.000'))
      .toEqual(['G00 X1 Z2 ; Bod 1', 'X3 ; Bod 2']);
  });

  it('`;@@` poznámka jde k nejbližšímu G00 a nepřebije poznámku objektu', () => {
    expect(run(';@ Usecka 1, L=9', ';@@ startovní bod', 'G90', 'G00 X0.000 Z5.000', 'G01 X9.000 Z5.000'))
      .toEqual(['G90 G00 X0 Z5 ; startovní bod', 'G01 X9 ; Usecka 1, L=9']);
  });

  it('čísla bez zbytečných nul', () => {
    expect(run('G03 X10.500 Z-0.000 R10.000')).toEqual(['G03 X10.5 Z0 R10']);
  });

  it('nulový pohyb se vypouští, komentáře a ostatní řádky zůstávají', () => {
    expect(run('; úsek', 'G01 X1.000 Z2.000', 'G01 X1.000 Z2.000', '', 'M30'))
      .toEqual(['; úsek', 'G01 X1 Z2', 'M30']);
  });

  it('G91: nulové přírůstky se vynechají; první nájezd s G90 zůstane celý', () => {
    expect(run('G00 X10.000 Z20.000 G90', 'G91', 'G01 X0.000 Z-5.000', 'G01 X3.000 Z0.000'))
      .toEqual(['G00 X10 Z20 G90', 'G91 G01 Z-5', 'X3']);
  });

  it('celá kružnice (I/K bez změny souřadnic) zůstane úplná', () => {
    expect(run('G01 X0.000 Z0.000', 'G02 X0.000 Z0.000 I0.000 K5.000'))
      .toEqual(['G01 X0 Z0', 'G02 X0 Z0 I0 K5']);
  });
});

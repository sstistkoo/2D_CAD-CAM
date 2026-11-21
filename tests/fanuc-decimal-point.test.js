// Fanuc: celé souřadnice s desetinnou tečkou (audit 21. 11. 2026).
// Fanuc bez parametru 3401#0 (DPI) čte `X500` jako 0,5 mm — `G0 X500 Z500`
// (bezpečná poloha) by vjel rychloposuvem do dílu.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fanucDecimalPoints, fanucAscii, fanucProgramFrame, convertGCodeControlSystem } from '../js/calculators/cam/controlDialect.js';
import { mergePrograms } from '../js/calculators/cam/gcodeMerge.js';
import { runCamProg } from './helpers/camHeadless.mjs';

// Celé nenulové číslo u osy mimo komentář = chyba.
const intAxisWords = (code) => code.split('\n')
  .map((l) => l.replace(/\([^)]*\)?/g, '').replace(/;.*$/, ''))
  .filter((l) => /(?<![A-Z_#])[XZUWIKR]-?0*[1-9]\d*(?![\d.])/i.test(l));

describe('fanucDecimalPoints', () => {
  it.each([
    ['N10 G0 X500 Z500 ( Rychloposuv )', 'N10 G0 X500. Z500. ( Rychloposuv )'],
    ['N20 G1 X12.5 Z-3 F0.25', 'N20 G1 X12.5 Z-3. F0.25'],
    ['G2 X40 Z-10 R5', 'G2 X40. Z-10. R5.'],
    ['G28 U0 W0', 'G28 U0 W0'],
    ['G04 P500', 'G04 P500'],
    ['N30 T0101 ( Nástroj 1 X5 )', 'N30 T0101 ( Nástroj 1 X5 )'],
    ['G0 X150 ; X5 komentář', 'G0 X150. ; X5 komentář'],
    ['G0 X#101 Z5', 'G0 X#101 Z5.'],
    ['G50 S2000', 'G50 S2000'],
  ])('%s', (inp, out) => {
    expect(fanucDecimalPoints(inp)).toBe(out);
    expect(fanucDecimalPoints(out)).toBe(out);   // idempotentní
  });
});

describe('Fanuc výstup bez celých souřadnic', () => {
  it('vygenerovaný program', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', 'part-1.camprog'), 'utf8'));
    prog.params = { ...prog.params, controlSystem: 'fanuc', safeX: 500, safeZ: 500 };
    const { gcode } = await runCamProg(prog);
    expect(gcode).toMatch(/G0 X500\. Z500\./);
    expect(intAxisWords(gcode)).toEqual([]);
    expect(gcode.split('\n').filter(l => /[^\x00-\x7F]/.test(l))).toEqual([]);   // jen ASCII
    expect(gcode).toMatch(/\( Metricky vstup \)/);
  }, 180000);

  it('převod Sinumerik → Fanuc', () => {
    const sin = ['; Vygenerovaný kód SINUMERIK 840D', 'G0 X500 Z500', '; --- HRUBOVANI ---', 'G0 X150 Z5', 'G1 X40 F0.3', 'G2 X60 Z-10 CR=10', 'M30'].join('\n');
    const out = convertGCodeControlSystem(sin, 'sinumerik', 'fanuc', { speed: 200, mode: 'DIAMON', machineType: 'LIMS=2000' }, false, false, []);
    expect(out).toMatch(/G0 X150\. Z5\./);
    expect(intAxisWords(out)).toEqual([]);
    const withCmt = convertGCodeControlSystem('; hlava\n; --- HRUBOVANI ---\nG1 X40 F0.3 ; Výjezd čelem\nM30', 'sinumerik', 'fanuc', { speed: 200, mode: 'DIAMON', machineType: 'LIMS=2000' }, false, false, []);
    expect(withCmt).toMatch(/\( Vyjezd celem \)/);
    expect(withCmt.split('\n').filter(l => /[^\x00-\x7F]/.test(l))).toEqual([]);
  });

  it('spojení fanucovských částí', () => {
    const part = '( FANUC )\nG28 U0 W0\nT0101\n( --- HRUBOVANI --- )\nG0 X150 Z5\nG1 X40 F0.3\nM30';
    const out = mergePrograms([{ name: 'A', code: part }, { name: 'B', code: part }], 'fanuc');
    expect(out).toMatch(/G0 X150\. Z5\./);
    expect(intAxisWords(out)).toEqual([]);
  });
});

describe('fanucAscii', () => {
  it.each([
    ['( Metrický vstup )', '( Metricky vstup )'],
    ['( ŘEZ – Ø40 × 2° )', '( REZ - D40 x 2 st )'],
    ['G0 X500. Z500.', 'G0 X500. Z500.'],
  ])('%s', (inp, out) => expect(fanucAscii(inp)).toBe(out));
});

describe('fanucProgramFrame (výstup do souboru/schránky)', () => {
  it('Fanuc dostane % … % a O-číslo, jednou', () => {
    const out = fanucProgramFrame('( HLAVA )\nN10 G21\nN20 M30\n( --- KONTURA --- )\n', 'fanuc');
    expect(out.split('\n')).toEqual(['%', 'O0001 ( SKICA )', '( HLAVA )', 'N10 G21', 'N20 M30', '( --- KONTURA --- )', '%']);
    expect(fanucProgramFrame(out, 'fanuc')).toBe(out);   // idempotentní
  });
  it('vlastní O-číslo zůstane, ostatní systémy beze změny', () => {
    expect(fanucProgramFrame('%\nO1234\nM30\n%', 'fanuc')).toBe('%\nO1234\nM30\n%');
    expect(fanucProgramFrame('G0 X1\nM30', 'sinumerik')).toBe('G0 X1\nM30');
  });
});


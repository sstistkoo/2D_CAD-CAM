// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – dialekt řídicího systému × čtení G-kódu zpátky         ║
// ╚══════════════════════════════════════════════════════════════╝
// Nálezy auditu 15. 9. 2026. Všechny čtyři případy byly na HEAD zelené
// (sada je nepokrývala) a všechny dosažitelné běžným ovládáním:
// stačilo v panelu Parametry přepnout „Řídicí systém" na Fanuc.
import { describe, it, expect } from 'vitest';
import { parseManualGCodeToPath, _parseGCodeRange } from '../js/calculators/cam/gcodeParser.js';
import { buildControlHeaderLines, convertGCodeControlSystem } from '../js/calculators/cam/controlDialect.js';
import { mergePrograms } from '../js/calculators/cam/gcodeMerge.js';

const prms = () => ({
  safeX: 150, safeZ: 5, mode: 'DIAMON', speed: 200,
  machineType: 'LIMS=2000', toolName: 'ROUGHER_T1', feed: 0.25,
});

describe('parseManualGCodeToPath – přírůstkové adresy U/W', () => {
  it('G28 U0 W0 (hlavička i závěr Fanuc programu) nehne nástrojem', () => {
    // Před opravou se U/W četly jako ABSOLUTNÍ souřadnice, takže z toho
    // vyšel přejezd na X0 Z0 — skrz celý obrobek do osy. Na konci programu
    // dokonce POSUVEM, protože se dědil modální G1.
    const code = ['G28 U0 W0', 'G0 X120 Z2', 'G1 X120 Z-30 F0.2', 'G28 U0 W0'].join('\n');
    const path = parseManualGCodeToPath(code, prms(), false);
    expect(path.every(p => p.x > 0)).toBe(true);
    // Poslední bod zůstává tam, kde skončil řez (X60 = ⌀120, Z−30).
    const last = path[path.length - 1];
    expect(last.x).toBeCloseTo(60, 6);
    expect(last.z).toBeCloseTo(-30, 6);
  });

  it('U/W je přírůstek k aktuální poloze (v DIAMON je U průměr)', () => {
    const path = parseManualGCodeToPath(['G0 X100 Z0', 'G1 U-20 W-5'].join('\n'), prms(), false);
    const last = path[path.length - 1];
    expect(last.x).toBeCloseTo(40, 6);   // 50 − 20/2
    expect(last.z).toBeCloseTo(-5, 6);
  });

  it('X/Z dál platí absolutně a mají přednost před U/W', () => {
    const path = parseManualGCodeToPath(['G0 X100 Z0', 'G1 X60 Z-10'].join('\n'), prms(), false);
    const last = path[path.length - 1];
    expect(last.x).toBeCloseTo(30, 6);
    expect(last.z).toBeCloseTo(-10, 6);
  });

  it('prázdná Bezpečná poloha Z nedělá NaN (stejně jako u safeX)', () => {
    const p = { ...prms() };
    delete p.safeZ;
    const path = parseManualGCodeToPath('G0 X100 Z2', p, false);
    expect(Number.isFinite(path[0].z)).toBe(true);
    expect(path[0].z).toBe(0);
  });
});

describe('_parseGCodeRange – komentář za kódem', () => {
  it('souřadnice se nečtou z textu komentáře', () => {
    const lines = ['G0 Z2 ; najedeme nad X50', 'G1 X20 Z-10'];
    const pts = _parseGCodeRange(lines, 0, lines.length, 1);
    expect(pts[0].z).toBe(2);
    expect(pts[0].x).not.toBe(50);
    expect(pts[1].x).toBe(20);
  });

  it('totéž pro fanucovský styl závorek', () => {
    const lines = ['G0 Z2 ( nad X50 )'];
    expect(_parseGCodeRange(lines, 0, lines.length, 1)[0].x).not.toBe(50);
  });
});

describe('buildControlHeaderLines – průměr × poloměr bez DIAMON/DIAMOF', () => {
  // Fanuc ani Heidenhain ISO na přepnutí průměr/poloměr G-kód nemají
  // (rozhoduje strojní parametr), takže hlavička aspoň říká, v jakém zápisu
  // je program psaný — jinak by se při nesouladu všechny radiální rozměry
  // lišily dvojnásobně a nikdo by to z programu nepoznal.
  for (const ctrl of ['fanuc', 'heidenhain']) {
    it(`${ctrl}: hlavička vysloví režim X`, () => {
      const dia = buildControlHeaderLines(ctrl, { ...prms(), mode: 'DIAMON' }, false, false);
      const rad = buildControlHeaderLines(ctrl, { ...prms(), mode: 'DIAMOF' }, false, false);
      expect(dia.join('\n')).toMatch(/X = PRŮMĚR/);
      expect(rad.join('\n')).toMatch(/POZOR: X = POLOMĚR/);
    });
  }

  it('fanucký komentář nemá vnořené závorky (ukončily by ho dřív)', () => {
    for (const mode of ['DIAMON', 'DIAMOF']) {
      for (const line of buildControlHeaderLines('fanuc', { ...prms(), mode }, false, false)) {
        expect((line.match(/\(/g) || []).length).toBeLessThanOrEqual(1);
        expect((line.match(/\)/g) || []).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('sinumerik to dál říká slovem DIAMON/DIAMOF', () => {
    expect(buildControlHeaderLines('sinumerik', { ...prms(), mode: 'DIAMOF' }, false, false).join('\n'))
      .toMatch(/^DIAMOF\b/m);
  });
});

describe('convertGCodeControlSystem – převod nesmí mazat program', () => {
  it('program bez G1/G2/G3 a bez dělicího komentáře zůstane zachovaný', () => {
    // Před opravou vyšlo tělo prázdné a z celého programu zbyla jen nová
    // hlavička — přepnutí řídicího systému uživateli smazalo práci.
    const code = ['G18', 'G90', 'G0 X150 Z5', 'M3', 'G0 X50 Z0', 'M5', 'M30'].join('\n');
    const out = convertGCodeControlSystem(code, 'sinumerik', 'fanuc', prms(), false, false);
    expect(out).toContain('G0 X50 Z0');
    expect(out).toContain('M3');
    expect(out).toMatch(/\bM30\b/);
  });

  it('s dělicím komentářem se hlavička dál vyměňuje a tělo zůstává', () => {
    const code = ['; hlavička', 'G18 ; Rovina ZX', '; --- HRUBOVANI ---',
      'G1 X40 Z-10 F0.25', 'M30 ; Konec'].join('\n');
    const out = convertGCodeControlSystem(code, 'sinumerik', 'fanuc', prms(), false, false);
    expect(out).toContain('G1 X40 Z-10 F0.25');
    expect(out).toContain('( Rovina ZX )');       // nová fanucovská hlavička
    expect(out).not.toMatch(/^\s*(N\d+\s*)?G18\s*;/m);
  });
});

describe('mergePrograms – dopisované řádky v dialektu spojovaného kódu', () => {
  const fanucPart = (tool, cut) => [
    '( Vygenerovaný kód FANUC )', 'G21 ( Metrický vstup )', 'G18 ( Rovina ZX )',
    'G28 U0 W0 ( Referenční bod )', 'G96 S200 M3', `${tool} ( Nástroj )`, 'M8',
    'G0 X150 Z5', '( --- HRUBOVANI --- )', cut, 'G0 X150 Z5', 'M30 ( Konec )',
  ].join('\n');

  it('fanucovské části se spojí bez středníků a bez STOPRE', () => {
    const out = mergePrograms([
      { name: 'Hrubování', code: fanucPart('T0101', 'G1 X40 Z-10 F0.25') },
      { name: 'Drážky', code: fanucPart('T0303', 'G1 X30 Z-20 F0.12') },
    ]);
    expect(out).not.toContain('STOPRE');           // sinumerikové slovo
    expect(out).not.toMatch(/;/);                  // Fanuc středník neumí
    expect(out).toContain('( ===== Drážky ===== )');
    expect(out).toContain('M5 ( Vřeteno STOP )');
    expect(out).toContain('M3 ( Vřeteno CW )');
  });

  it('sinumerikové části se spojí jako dosud (středníky, STOPRE)', () => {
    const sin = (tool, cut) => [
      '; Vygenerovaný kód SINUMERIK 840D', 'G18 ; Rovina ZX', 'G75 X150',
      `T="${tool}" D1 M6`, 'M3', 'M8', 'G0 X150 Z5', '; --- HRUBOVANI ---',
      cut, 'G0 X150 Z5', 'M30 ; Konec programu',
    ].join('\n');
    const out = mergePrograms([
      { name: 'A', code: sin('ROUGHER_T1', 'G1 X40 Z-10 F0.25') },
      { name: 'B', code: sin('GROOVE_T3', 'G1 X30 Z-20 F0.12') },
    ]);
    expect(out).toContain('STOPRE');
    expect(out).toContain('; ===== B =====');
    expect(out).toContain('M5 ; Vřeteno STOP');
  });
});

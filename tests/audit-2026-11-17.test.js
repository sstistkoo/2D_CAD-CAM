// Kontrola kódu 17. 11. 2026 – číselné zadání oblouku.
import { describe, it, expect } from 'vitest';
import { arcSweep, signedArcRadius } from '../js/dialogs/numArcSign.js';
import { arcFromEndpointsRadius } from '../js/utils.js';

describe('numerický vstup: R se znaménkem v ručním G-kódu', () => {
  it('oblouk do 180° má kladné R, přes 180° záporné', () => {
    const deg = (d) => d * Math.PI / 180;
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(90), ccw: true })).toBe(5);
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(270), ccw: true })).toBe(-5);
    // Stejné úhly po směru hodin: 0 → 270° CW je jen 90°.
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(270), ccw: false })).toBe(5);
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(90), ccw: false })).toBe(-5);
    expect(arcSweep(deg(350), deg(10), true)).toBeCloseTo(deg(20), 9);
  });

  it('Start + konec se záporným R postaví dlouhý oblouk a zapíše se zpět záporně', () => {
    const p1 = { x: 0, y: 0 }, p2 = { x: 10, y: 0 };
    for (const ccw of [true, false]) {
      const short = arcFromEndpointsRadius(p1, p2, 8, ccw);
      const long = arcFromEndpointsRadius(p1, p2, 8, ccw, { longArc: true });
      const g = (a) => ({ r: a.r, sa: a.startAngle, ea: a.endAngle, ccw });
      expect(signedArcRadius(g(short))).toBe(8);
      expect(signedArcRadius(g(long))).toBe(-8);
    }
  });
});

describe('import G-kódu do výkresu: Sinumerik CR=', () => {
  it('oblouk s CR= se nakreslí, záporné CR= = oblouk přes 180°', async () => {
    const { parseGcodeToObjects } = await import('../js/storage/gcodeParse.js');
    const short = parseGcodeToObjects('G0 X0 Z0\nG3 X10 Z-5 CR=8');
    expect(short.warnings).toEqual([]);
    expect(short.objs.map(o => o.type)).toEqual(['arc']);
    const long = parseGcodeToObjects('G0 X0 Z0\nG3 X10 Z-5 CR=-8');
    expect(long.objs[0].r).toBeCloseTo(8, 6);
    expect(long.objs[0].cx).not.toBeCloseTo(short.objs[0].cx, 3);
  });
});

describe('kalkulačka Kužel: Morse podle normy', () => {
  it('délky L dávají normovou kuželovitost', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../js/calculators/taper.js', import.meta.url), 'utf8');
    const norm = { MT0: 19.212, MT1: 20.047, MT2: 20.020, MT3: 19.922, MT4: 19.254, MT5: 19.002 };
    const rows = [...src.matchAll(/name: "(MT\d)", D: ([\d.]+), d: ([\d.]+), L: ([\d.]+)/g)];
    expect(rows.length).toBe(6);
    for (const [, n, D, d, L] of rows) expect(Math.abs(+L / (+D - +d) - norm[n])).toBeLessThan(0.03);
  });
});

describe('G90 ↔ G91: komentáře se nepřepočítávají', () => {
  it('číslo v poznámce neposune polohu a slovo se nepřepíše', async () => {
    const { codeToAbsolute, codeToIncremental } = await import('../js/calculators/gcodeCoordConvert.js');
    expect(codeToAbsolute('G91\nG1 X10 Z5 ; index 2\nG1 X2 ; přejezd na X50\nG1 Z-1'))
      .toBe('G90\nG1 X10 Z5 ; index 2\nG1 X12 ; přejezd na X50\nG1 Z4');
    expect(codeToIncremental('G90 G0 X10 Z5\nG1 X20 ; max 5\nG1 Z-10'))
      .toBe('G90 G0 X10 Z5\nG91 G1 X10 ; max 5\nG91 G1 Z-15');
  });
});

describe('Kontrola programu v editoru: konec M2 / M99', () => {
  it('M2 a M99 jsou platný konec programu', async () => {
    const { CNCParser, defaultParserConfig } = await import('../js/calculators/gcodeEditorParser.js');
    const p = new CNCParser({});
    for (const end of ['M30', 'M2', 'M02', 'M17', 'M99']) {
      expect(p.parseProgram(`G90 G95\nG0 X10 Z5\n${end}`, 'A', defaultParserConfig()).errors).toEqual([]);
    }
    expect(p.parseProgram('G90 G95\nG0 X10 Z5', 'A', defaultParserConfig()).errors.length).toBe(1);
  });
});

describe('Kontrola programu v editoru: vřeteno M03', () => {
  it('M03 (Fanuc) zapne vřeteno stejně jako M3', async () => {
    const { CNCParser, defaultParserConfig } = await import('../js/calculators/gcodeEditorParser.js');
    const p = new CNCParser({});
    const code = (m) => `G90 G95 G97\n${m} S500\nG0 X10 Z5\nG1 Z-10 F0.2\nM30`;
    expect(p.parseProgram(code('M03'), 'A', defaultParserConfig()).errors).toEqual([]);
    expect(p.parseProgram(code('M04'), 'A', defaultParserConfig()).errors).toEqual([]);
  });
});

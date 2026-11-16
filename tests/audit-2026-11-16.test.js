// ╔══════════════════════════════════════════════════════════════╗
// ║  Kontrola kódu 16. 11. 2026 — CAM (spojení, převod, import)    ║
// ║  a CAD (DXF export textu)                                      ║
// ╚══════════════════════════════════════════════════════════════╝
import { describe, it, expect, beforeEach } from 'vitest';
import { mergePrograms, classifyHeaderLine } from '../js/calculators/cam/gcodeMerge.js';
import { convertGCodeControlSystem } from '../js/calculators/cam/controlDialect.js';
import { mergeCollinearMoves } from '../js/calculators/cam/gcodeCollapse.js';
import { parseContourGCode, buildStockPointsFromCanvas } from '../js/calculators/cam/gcodeParser.js';
import { getArcParams } from '../js/calculators/cam/camMath.js';
import { exportDXF } from '../js/dxf.js';
import { state } from '../js/state.js';

const part = (tool, cut) => ['G18 G90', 'G54 G95', 'G96 S200 M3', `T="${tool}" D1 M6`, '; ---', cut, 'M9', 'M5', 'M30'].join('\n');

describe('spojení programů: jméno nástroje s mezerou', () => {
  it('výměna HRUB 80 → HRUB 55 ve spojeném programu zůstane', () => {
    const out = mergePrograms([
      { name: 'A', code: part('HRUB 80', 'G1 X10 Z-5 F0.1') },
      { name: 'B', code: part('HRUB 55', 'G1 X12 Z-6 F0.1') },
    ]);
    expect(out).toContain('T="HRUB 55" D1 M6');
    expect(out).toMatch(/STOPRE[\s\S]*T="HRUB 55"/);
  });

  it('D a S ze jména nástroje nejsou korekce ani otáčky', () => {
    const keys = Object.fromEntries(classifyHeaderLine('T="D8 S16 VRTAK" D1 M6'));
    expect(keys.tool).toBe('T="D8 S16 VRTAK"');
    expect(keys.dcorr).toBe('D1');
    expect(keys.sval).toBeUndefined();
  });

  it('fanucovský komentář části bez vnořených závorek', () => {
    const fan = (t) => ['G21', 'G99', `${t}`, '( --- )', 'G1 X10 Z-5 F0.1', 'M30'].join('\n');
    const out = mergePrograms([{ name: 'díl (2)', code: fan('T0101') }, { name: 'B', code: fan('T0202') }], 'fanuc');
    expect(out).toContain('( ===== díl 2 ===== )');
  });
});

describe('převod Sinumerik → Fanuc: závorky v komentáři', () => {
  it('`; Výjezd (čelo)` nedá vnořenou závorku', () => {
    const code = ['G18 G90', 'T="A" D1 M6', '; --- HRUBOVANI ---', 'G1 X10 Z-5 F0.2 ; Výjezd (čelo)', 'M30'].join('\n');
    const out = convertGCodeControlSystem(code, 'sinumerik', 'fanuc', { mode: 'DIAMON', speed: 200, safeX: 100, safeZ: 5, machineType: 'M4' }, false, false);
    const line = out.split('\n').find(l => l.includes('X10'));
    expect(line).toMatch(/\( Výjezd čelo \)$/);
  });
});

describe('slučování bloků: modální G jen z pohybové skupiny', () => {
  it('pohyb bez G za prodlevou G4 se nevypíše jako G4', () => {
    const lines = ['N10 G1 X10 Z0 F0.2', 'N20 G4 F1', 'N30 Z-5', 'N40 Z-10'].map((text, i) => ({ text, simIdx: i }));
    const out = mergeCollinearMoves(lines).map(l => l.text);
    expect(out.some(t => /\bG4\b.*Z/.test(t))).toBe(false);
    expect(out).toContain('N30 G1 Z-10');
  });
});

describe('import kontury z G-kódu: čísla s úvodní tečkou', () => {
  it('`Z-.5` a `X.8` se přečtou', () => {
    const pts = parseContourGCode('G0 X10. Z2.\nG1 X.8 Z-.5');
    expect(pts[1]).toMatchObject({ x: 0.8, z: -0.5 });
    expect(pts[0]).toMatchObject({ x: 10, z: 2 });
  });
});

describe('polotovar z výkresu: oblouk přes 180°', () => {
  beforeEach(() => { state.objects = []; state.machineType = 'soustruh'; });

  it('dostane záporné R a projde delší cestou', () => {
    // 270° oblouk (střed 0,50, r 20) + tětiva — uzavřený obrys polotovaru
    const sa = -Math.PI / 2, ea = Math.PI;
    state.objects = [
      { type: 'arc', isStock: true, cx: 0, cy: 50, r: 20, startAngle: sa, endAngle: ea, ccw: true },
      { type: 'line', isStock: true, x1: -20, y1: 50, x2: 0, y2: 30 },
    ];
    const pts = buildStockPointsFromCanvas({ mode: 'RADIUS' });
    const arcPt = pts.find(p => p.type === 'G2' || p.type === 'G3');
    expect(arcPt.r).toBeCloseTo(-20, 3);
    // Střed oblouku z getArcParams musí být skutečný střed (z 0, x 50).
    const i = pts.indexOf(arcPt), prev = pts[i - 1];
    const a = getArcParams({ x: prev.x, z: prev.z }, { x: arcPt.x, z: arcPt.z }, arcPt.r, arcPt.type);
    expect(a.cz).toBeCloseTo(0, 3);
    expect(a.cx).toBeCloseTo(50, 3);
  });

  it('polyline s |bulge| > 1 dostane záporné R, půlkruh kladné', () => {
    state.objects = [{ type: 'polyline', isStock: true, closed: false,
      vertices: [{ x: 0, y: 30 }, { x: 0, y: 70 }, { x: 10, y: 70 }], bulges: [2, 0] }];
    const r = buildStockPointsFromCanvas({ mode: 'RADIUS' }).filter(p => p.type === 'G2' || p.type === 'G3').map(p => p.r);
    expect(r.length).toBe(1);
    expect(r[0]).toBeLessThan(0);
  });
});

describe('DXF export: víceřádkový text', () => {
  it('konec řádku v textu nerozbije páry kód/hodnota', () => {
    const dxf = exportDXF([{ type: 'text', x: 0, y: 0, text: 'Ø50 h7\nRa 1,6', fontSize: 5 }]);
    const lines = dxf.split('\n');
    const i = lines.lastIndexOf('1');
    expect(lines[i + 1]).toBe('Ø50 h7 Ra 1,6');
    // páry: sudý řádek = celé číslo (kód skupiny)
    for (let k = 0; k < lines.length - 1; k += 2) expect(lines[k]).toMatch(/^-?\d+$/);
  });
});

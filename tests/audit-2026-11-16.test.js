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

// ── Druhé kolo kontroly 16. 11. 2026 ───────────────────────────────
import { parseSVGPath } from '../js/storage/svgPath.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { generateSprocketProfile } from '../js/tools/gearGenerator.js';

describe('import SVG: cesta <path>', () => {
  it('číslo s exponentem není příkaz', () => {
    const objs = parseSVGPath('M 0 0 L 1e1 0 L 10 5e0');
    expect(objs.map(o => [o.x2, o.y2])).toEqual([[10, -0], [10, -5]]);
  });

  it('Bézierova křivka posune aktuální bod a vznikne kontura', () => {
    const objs = parseSVGPath('M 0 0 C 0 10 10 10 10 0 L 20 0');
    expect(objs[0].type).toBe('polyline');
    const v = objs[0].vertices;
    expect(v[v.length - 1]).toMatchObject({ x: 10 });
    expect(objs[1]).toMatchObject({ type: 'line', x1: 10, x2: 20 });
  });

  it('S zrcadlí řídicí bod, Q/T kvadratické', () => {
    const objs = parseSVGPath('M 0 0 Q 5 10 10 0 T 20 0');
    expect(objs.length).toBe(2);
    // T zrcadlí (5,10) přes (10,0) → (15,−10): křivka jde pod osu (svět +y)
    expect(Math.max(...objs[1].vertices.map(p => p.y))).toBeGreaterThan(1);
  });

  it('oblouk s rx = 0 je úsečka', () => {
    expect(parseSVGPath('M 0 0 A 0 0 0 0 1 10 0')).toEqual([{ type: 'line', x1: 0, y1: -0, x2: 10, y2: -0 }]);
  });
});

describe('prodleva Fanuc: G04 P (ms) i v bloku poháněných nástrojů', () => {
  it('rozepsané vrtání píše G04 P500, ne G4 X', () => {
    const L = buildLiveBlock({ controlSystem: 'fanuc', mode: 'DIAMON', safeX: 100, safeZ: 5,
      live: { cycles: false }, liveOps: [{ kind: 'drill', dwell: 0.5, peck: 0 }] });
    expect(L.some(l => /^G04 P500\b/.test(l))).toBe(true);
    expect(L.some(l => /\bG0?4 X/.test(l))).toBe(false);
  });

  it('převod Fanuc → Sinumerik přepíše i G04 X2.5', () => {
    const code = ['G21', 'T0101', '( --- )', 'G1 X10 Z-5 F0.1', 'G04 X2.5', 'M30'].join('\n');
    const out = convertGCodeControlSystem(code, 'fanuc', 'sinumerik', { mode: 'DIAMON', speed: 200, safeX: 100, safeZ: 5, machineType: 'M4' }, false, false);
    expect(out).toMatch(/\bG4 F2\.5\b/);
    expect(out).not.toMatch(/G0?4 X/);
  });
});

describe('řetězové kolo: obrys se nekříží', () => {
  const seg = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (const z of [6, 10, 17, 40]) it(`z = ${z}`, () => {
    const { vertices: v, bulges } = generateSprocketProfile(12.7, z, 8.51);
    const N = v.length;
    let n = 0;
    for (let i = 0; i < N; i++) for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) continue;
      if (seg(v[i], v[(i + 1) % N], v[j], v[(j + 1) % N])) n++;
    }
    expect(n).toBe(0);
    expect(bulges[0]).toBeLessThan(0);   // sedlo po směru hodin kolem válečku
  });
});

// ── 17. 11. 2026: oblouky I/K se znaménkem R, hřeben zuby nahoru ─────
import { generateRackProfile } from '../js/tools/gearGenerator.js';

describe('import kontury: oblouk I/K přes 180° dostane záporné R', () => {
  // Střed (poloměr 20, Z −10), r 10: start poloměr 30 Z −10 → konec poloměr 20 Z −20.
  // Jeden smysl je 90°, druhý 270° — oba musí trefit skutečný střed.
  const cases = [
    { mode: 'DIAMON', text: (g) => `G0 X60 Z-10\n${g} X40 Z-20 I-10 K0`, div: 2 },
    { mode: 'DIAMOF', text: (g) => `G0 X30 Z-10\n${g} X20 Z-20 I-10 K0`, div: 1 },
    { mode: 'DIAMOF', text: (g) => `DIAMON\nG0 X60 Z-10\n${g} X40 Z-20 I-10 K0`, div: 2 },  // řádek DIAMON přebije
  ];
  for (const c of cases) it(`${c.mode}${c.div === 2 && c.mode === 'DIAMOF' ? ' + řádek DIAMON' : ''}`, () => {
    const signs = [];
    for (const g of ['G2', 'G3']) {
      const [p0, p1] = parseContourGCode(c.text(g), { mode: c.mode });
      expect(Math.abs(p1.r)).toBeCloseTo(10, 6);
      signs.push(Math.sign(p1.r));
      const a = getArcParams({ x: p0.x / c.div, z: p0.z }, { x: p1.x / c.div, z: p1.z }, p1.r, g);
      expect(a.cx).toBeCloseTo(20, 6);
      expect(a.cz).toBeCloseTo(-10, 6);
    }
    expect(signs.sort()).toEqual([-1, 1]);
  });

  it('R zadané přímo se nemění', () => {
    expect(parseContourGCode('G0 X60 Z0\nG2 X40 Z-10 R-10')[1].r).toBe(-10);
  });
});

describe('hřeben: zuby nahoru (osa Y výkresu nahoru)', () => {
  it('hlava nad roztečnou čárou, tělo pod ní', () => {
    const { vertices } = generateRackProfile(2, 4, 20, 0, 0, 50);
    const ys = vertices.map(v => v.y);
    expect(Math.max(...ys)).toBeCloseTo(52, 6);        // cy + ha
    expect(Math.min(...ys)).toBeCloseTo(50 - 2.5 - 2, 6); // pata cy − hf, tělo o m níž
  });
});

// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – skládání programu z více operací (částí)              ║
// ╚══════════════════════════════════════════════════════════════╝
// Pokrývá cam/opParts.js (obrobený polotovar pro další operaci, složení
// programu) a cam/gcodeMerge.js (spojení částí = sdíleno s CAM Editorem).
import { describe, it, expect } from 'vitest';
import {
  applyPartToState, buildCombinedProgram, loopsToStockProfile, machinedStockPoints,
  makePart, partsAsMergeItems, partToolLabel, syncPartFromState,
} from '../js/calculators/cam/opParts.js';
import { mergePrograms, splitHeaderBody, classifyHeaderLine } from '../js/calculators/cam/gcodeMerge.js';
import { buildStockLoopRaw } from '../js/calculators/cam/materialRemoval.js';
import { getArcParams } from '../js/calculators/cam/camMath.js';
import { polyArea, pointInLoop } from '../js/geom/geomCore.js';

// ── Testovací stav simulátoru (jen pole, která opParts potřebuje) ──
function mkState(over = {}) {
  return {
    params: {
      mode: 'DIAMOF', stockMode: 'cylinder', stockDiameter: 40, stockLength: 50,
      stockFace: 2, toolRadius: 0.8, depthOfCut: 2, toolName: 'ROUGHER_T1',
      machineStructure: 'lathe', controlSystem: 'sinumerik', safeX: 150, safeZ: 5,
    },
    zLimits: { chuck: null, rangeActive: false },
    xLimits: { rangeXMin: null, active: false },
    stockPoints: [],
    selectedMaterial: 'Ocel 11 373 (S235)',
    activeMagazineSlot: null,
    toolMagazine: [],
    manualGCode: 'G0 X50 Z5\nG1 X20 Z-10\nM30',
    opParts: [],
    ...over,
  };
}

// Podélný průchod ⌀40 → ⌀30 (poloměr 20 → 15) v Z ∈ ⟨0, −30⟩.
const SIM_PATH_TURN = [
  { x: 25, z: 5, type: 'G0' },
  { x: 15, z: 5, type: 'G0' },
  { x: 15, z: -30, type: 'G1' },
  { x: 25, z: -30, type: 'G0' },
];

describe('makePart / syncPartFromState / applyPartToState', () => {
  it('část si nese vlastní parametry, limity i polotovar', () => {
    const S = mkState();
    const part = makePart(S, {});
    expect(part.name).toContain('Část 1');
    expect(part.gcode).toBe(S.manualGCode);

    // Změna živého stavu se do záznamu nepropíše, dokud se nesynchronizuje.
    S.params.feed = 0.9;
    expect(part.params.feed).toBeUndefined();
    syncPartFromState(part, S);
    expect(part.params.feed).toBe(0.9);
  });

  it('applyPartToState zachová sdílené parametry stroje/výkresu', () => {
    const S = mkState();
    const part = makePart(S, {});
    part.params.controlSystem = 'fanuc';   // vlastnost stroje, ne operace
    part.params.feed = 0.4;                // vlastnost operace
    S.params.controlSystem = 'heidenhain';
    applyPartToState(part, S);
    expect(S.params.controlSystem).toBe('heidenhain'); // sdílené: nepřepsáno
    expect(S.params.feed).toBe(0.4);                   // operační: převzato
  });

  it('applyPartToState nesdílí reference (úprava části neteče do stavu)', () => {
    const S = mkState();
    const part = makePart(S, {});
    applyPartToState(part, S);
    S.params.feed = 1.23;
    S.stockPoints.push({ x: 1, z: 1 });
    expect(part.params.feed).not.toBe(1.23);
    expect(part.stockPoints.length).toBe(0);
  });

  it('partToolLabel bere nůž ze zásobníku, jinak jméno z parametrů', () => {
    expect(partToolLabel(mkState())).toBe('ROUGHER_T1');
    expect(partToolLabel(mkState({
      toolMagazine: [{ slot: 3, name: 'UPICH' }], activeMagazineSlot: 0,
    }))).toBe('T3 UPICH');
  });
});

describe('loopsToStockProfile', () => {
  it('obdélníkový polotovar → otevřený profil končící na ose', () => {
    // Válec r=20, z ∈ ⟨2, −50⟩ (stejný tvar jako buildStockLoopRaw).
    const loop = [{ x: 0, z: 2 }, { x: 20, z: 2 }, { x: 20, z: -50 }, { x: 0, z: -50 }];
    const { points } = loopsToStockProfile([loop]);
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points[0].z).toBeGreaterThan(points[points.length - 1].z);  // start vpravo
    expect(Math.abs(points[points.length - 1].x)).toBeLessThan(1e-6);  // konec na ose
    expect(points.every(p => p.x >= -1e-6)).toBe(true);
  });

  it('profil znovu uzavřený k ose má (přibližně) plochu původní smyčky', () => {
    const loop = [{ x: 0, z: 2 }, { x: 20, z: 2 }, { x: 20, z: -50 }, { x: 0, z: -50 }];
    const { points } = loopsToStockProfile([loop]);
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      segs.push({ type: 'line', p1: points[i], p2: points[i + 1] });
    }
    const reclosed = buildStockLoopRaw({ stockMode: 'casting' }, segs);
    // Odsazení o SIMPLIFY_EPS (0,05 mm) profil nepatrně nafoukne — proto tolerance.
    expect(Math.abs(polyArea([reclosed]))).toBeGreaterThan(20 * 52);
    expect(Math.abs(polyArea([reclosed]))).toBeLessThan(20 * 52 * 1.02);
  });

  it('smyčka bez bodu na ose (trubka) profilem nejde zapsat', () => {
    const ring = [{ x: 5, z: 0 }, { x: 20, z: 0 }, { x: 20, z: -10 }, { x: 5, z: -10 }];
    const res = loopsToStockProfile([ring]);
    expect(res.points.length).toBe(0);
    expect(res.noAxis).toBe(true);
  });

  it('z více smyček bere největší a menší počítá jako zahozené', () => {
    const big = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: -50 }, { x: 0, z: -50 }];
    const chip = [{ x: 0, z: -60 }, { x: 3, z: -60 }, { x: 3, z: -62 }, { x: 0, z: -62 }];
    const { points, dropped } = loopsToStockProfile([chip, big]);
    expect(dropped).toBe(1);
    expect(Math.max(...points.map(p => p.x))).toBeGreaterThan(15);
  });
});

describe('machinedStockPoints', () => {
  const prms = {
    mode: 'DIAMOF', stockMode: 'cylinder', stockDiameter: 40,
    stockLength: 50, stockFace: 2, toolRadius: 0.8, depthOfCut: 2,
  };

  it('podélný průchod zmenší polotovar na obrobený průměr', () => {
    const { points } = machinedStockPoints(prms, [], SIM_PATH_TURN);
    expect(points.length).toBeGreaterThan(2);
    expect(points[0].type).toBe('G0');
    expect(points.slice(1).every(p => ['G1', 'G2', 'G3'].includes(p.type))).toBe(true);

    // V obrobeném úseku (Z ∈ ⟨−5, −25⟩) už nesmí být materiál nad r ≈ 16.
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      segs.push({ type: 'line', p1: points[i], p2: points[i + 1] });
    }
    const loop = buildStockLoopRaw({ stockMode: 'casting' }, segs);
    expect(pointInLoop({ x: 18, z: -15 }, loop)).toBe('outside');  // odebráno
    expect(pointInLoop({ x: 10, z: -15 }, loop)).toBe('inside');   // zbylý materiál
    expect(pointInLoop({ x: 18, z: -45 }, loop)).toBe('inside');   // za koncem řezu
  });

  it('DIAMON zapisuje X jako průměr', () => {
    const rad = machinedStockPoints(prms, [], SIM_PATH_TURN).points;
    const dia = machinedStockPoints({ ...prms, mode: 'DIAMON' }, [], SIM_PATH_TURN).points;
    // Zaokrouhlení na 3 desetinná místa proběhne až po zdvojnásobení.
    expect(Math.max(...dia.map(p => p.x))).toBeCloseTo(Math.max(...rad.map(p => p.x)) * 2, 2);
  });

  it('bez dráhy nebo bez polotovaru nevrací profil', () => {
    expect(machinedStockPoints(prms, [], []).points).toEqual([]);
    expect(machinedStockPoints({ ...prms, stockDiameter: 0 }, [], SIM_PATH_TURN).points).toEqual([]);
  });

  it('profil má rozumný počet bodů (jde přes něj scan hrubování)', () => {
    const { points } = machinedStockPoints(prms, [], SIM_PATH_TURN);
    expect(points.length).toBeLessThanOrEqual(400);
  });

  it('zaoblení se prolží oblouky, ne stovkami úseček', () => {
    // Rádius špičky (R0,8) vykrouží na koncích řezu zaoblené rohy — ty musí
    // vyjít jako G2/G3, jinak by z nich Clipper udělal drť drobných úseček.
    const { points, arcs } = machinedStockPoints(prms, [], SIM_PATH_TURN);
    expect(arcs).toBeGreaterThan(0);
    expect(points.some(p => p.type === 'G2' || p.type === 'G3')).toBe(true);
    // Oblouk musí nést použitelný poloměr (v mm poloměru, ne průměru).
    points.filter(p => p.type === 'G2' || p.type === 'G3')
      .forEach(p => expect(p.r).toBeGreaterThan(0));
    // Bez proložení by profil měl řádově víc bodů než teď.
    expect(points.length).toBeLessThan(40);
  });

  it('velký polotovar bez zaoblení zůstane pár úsečkami', () => {
    const loop = [{ x: 0, z: 2 }, { x: 20, z: 2 }, { x: 20, z: -50 }, { x: 0, z: -50 }];
    const { points, arcs } = loopsToStockProfile([loop]);
    expect(arcs).toBe(0);
    expect(points.length).toBeLessThanOrEqual(5);
  });
});

describe('oblouky odvozeného polotovaru se nesmí obrátit', () => {
  // Polotovar s velkým kulovým vrchlíkem: fit by ho bez rozdělení popsal
  // jedním skoro-180° obloukem, jehož střed se po zaokrouhlení souřadnic
  // dopočítá úplně jinde (na plátně to vypadá jako obrácený směr G2/G3).
  function domeLoop(r, sweepDeg, steps = 160) {
    const pts = [{ x: 0, z: 60 }, { x: 10, z: 60 }];
    const half = (sweepDeg / 2) * Math.PI / 180;
    for (let i = 0; i <= steps; i++) {
      const a = half - 2 * half * (i / steps);
      pts.push({ x: 10 + Math.cos(a) * r, z: Math.sin(a) * r });
    }
    pts.push({ x: 10, z: -60 }, { x: 0, z: -60 });
    return pts;
  }

  // Vrátí největší vzdálenost skutečně vykresleného oblouku od zadaného tvaru.
  function arcDeviation(prev, p, loop) {
    const g = getArcParams({ x: prev.x, z: prev.z }, { x: p.x, z: p.z }, p.r, p.type);
    let sA = Math.atan2(prev.x - g.cx, prev.z - g.cz);
    let eA = Math.atan2(p.x - g.cx, p.z - g.cz);
    if (p.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
    if (p.type === 'G3' && eA < sA) eA += 2 * Math.PI;
    let worst = 0;
    for (let k = 0; k <= 24; k++) {
      const t = sA + (eA - sA) * (k / 24);
      const qx = g.cx + Math.sin(t) * g.r, qz = g.cz + Math.cos(t) * g.r;
      let best = Infinity;
      for (const lp of loop) best = Math.min(best, Math.hypot(lp.x - qx, lp.z - qz));
      worst = Math.max(worst, best);
    }
    return worst;
  }

  for (const [r, sweep] of [[20, 160], [50, 170], [8, 178]]) {
    it(`vrchlík R${r} / ${sweep}° zůstane na svém tvaru`, () => {
      const loop = domeLoop(r, sweep);
      const { points } = loopsToStockProfile([loop]);
      const arcPts = points.map((p, i) => ({ p, prev: points[i - 1] }))
        .filter(o => o.prev && (o.p.type === 'G2' || o.p.type === 'G3'));
      expect(arcPts.length).toBeGreaterThan(0);
      // Žádný oblouk nesmí ujet mimo tvar — obrácený směr by dal chybu řádu R.
      arcPts.forEach(({ p, prev }) => {
        expect(arcDeviation(prev, p, loop)).toBeLessThan(1);
      });
    });
  }

  it('žádný oblouk nemá rozvin nad 90° (zápis R zůstane stabilní)', () => {
    const loop = domeLoop(30, 170);
    const { points } = loopsToStockProfile([loop]);
    points.forEach((p, i) => {
      if (p.type !== 'G2' && p.type !== 'G3') return;
      const prev = points[i - 1];
      const d = Math.hypot(p.x - prev.x, p.z - prev.z);
      // rozvin ≤ 90° ⇔ tětiva ≤ R·√2
      expect(d).toBeLessThanOrEqual(p.r * Math.SQRT2 + 1e-6);
      // a poloměr musí s rezervou pokrýt půlku tětivy (jinak getArcParams chybuje)
      expect(p.r).toBeGreaterThan(d / 2);
    });
  });

  it('oblouky přežijí zaokrouhlení i v režimu DIAMON', () => {
    const prms = {
      mode: 'DIAMON', stockMode: 'cylinder', stockDiameter: 40,
      stockLength: 50, stockFace: 2, toolRadius: 0.8, depthOfCut: 2,
    };
    const { points, degraded } = machinedStockPoints(prms, [], SIM_PATH_TURN);
    expect(degraded).toBe(0);
    points.forEach((p, i) => {
      if (p.type !== 'G2' && p.type !== 'G3') return;
      // Kontrola v REÁLNÝCH (poloměrových) souřadnicích, jak profil čte CAM.
      const prev = points[i - 1];
      const d = Math.hypot((p.x - prev.x) / 2, p.z - prev.z);
      expect(p.r).toBeGreaterThan(d / 2);
      expect(getArcParams(
        { x: prev.x / 2, z: prev.z }, { x: p.x / 2, z: p.z }, p.r, p.type
      ).error).toBe(false);
    });
  });
});

// ── Skládání programu ──────────────────────────────────────────
const PART_A = [
  '; Vygenerovaný kód SINUMERIK 840D',
  'G18 ; Rovina ZX', 'G90 ; Absolutní programování', 'G54', 'G95',
  'G75 X150 ; Nájezd do ref. bodu', 'G75 Z5',
  'LIMS=2000', 'G96 S200 LIMS=2000', 'DIAMON',
  'T="ROUGHER_T1" D1 M6 ; Výměna nástroje', 'M3', 'M8',
  'G0 X150 Z5 ; Rychloposuv',
  '; --- HRUBOVANI ---',
  'G1 X40 Z-10 F0.25',
  'G0 X150 Z5',
  'M30 ; Konec programu',
].join('\n');

const PART_B = PART_A
  .replace('ROUGHER_T1', 'GROOVE_T3')
  .replace('G1 X40 Z-10 F0.25', 'G1 X30 Z-20 F0.12');

describe('splitHeaderBody / classifyHeaderLine', () => {
  it('hlavička končí dělicím komentářem', () => {
    const { header, body } = splitHeaderBody(PART_A);
    expect(header.some(l => l.includes('T="ROUGHER_T1"'))).toBe(true);
    expect(body[0]).toContain('--- HRUBOVANI ---');
  });

  it('rozpozná i Fanuc styl komentářů ( ... )', () => {
    const fanuc = ['G21 ( Metrický vstup )', 'T0101 ( Nástroj 1 )', '( --- HRUBOVANI --- )', 'G1 X10'].join('\n');
    const { header, body } = splitHeaderBody(fanuc);
    expect(header.length).toBe(2);
    expect(body[0]).toContain('HRUBOVANI');
  });

  it('nástroj a ref. bod se klasifikují jako modální skupiny', () => {
    expect(classifyHeaderLine('T="ROUGHER_T1" D1 M6 ; Výměna')).toEqual(
      expect.arrayContaining([['tool', 'T="ROUGHER_T1"'], ['dcorr', 'D1']]));
    expect(classifyHeaderLine('G28 U0 W0 ( Referenční bod )')).toEqual(
      expect.arrayContaining([['refpoint', 'G28']]));
  });
});

describe('mergePrograms', () => {
  const merged = mergePrograms([{ name: 'Část 1', code: PART_A }, { name: 'Část 2', code: PART_B }]);

  it('M30 zůstane jen na konci', () => {
    expect(merged.match(/\bM30\b/g).length).toBe(1);
    expect(merged.trim().split('\n').pop()).toContain('M30');
  });

  it('nemění-li se nastavení, hlavička druhé části se neopakuje', () => {
    expect(merged.match(/\bG18\b/g).length).toBe(1);
    expect(merged.match(/\bDIAMON\b/g).length).toBe(1);
  });

  it('při výměně nože vyjede do ref. bodu a dá STOPRE', () => {
    const afterFirst = merged.slice(merged.indexOf('===== Část 2'));
    expect(afterFirst).toContain('G75 X150');   // vypsáno i když se nemění
    expect(afterFirst).toContain('STOPRE');
    expect(afterFirst).toContain('T="GROOVE_T3"');
    expect(afterFirst.indexOf('G75 X150')).toBeLessThan(afterFirst.indexOf('T="GROOVE_T3"'));
  });

  it('mezi částmi vypne a zase zapne vřeteno i chlazení', () => {
    expect(merged).toContain('M5 ; Vřeteno STOP');
    expect(merged).toContain('M9 ; Chlazení VYP');
    expect(merged).toContain('M3 ; Vřeteno CW');
    expect(merged).toContain('M8 ; Chlazení ZAP');
  });

  it('beze změny nože se ref. bod neopakuje', () => {
    const same = mergePrograms([{ name: 'A', code: PART_A }, { name: 'B', code: PART_A }]);
    expect(same.match(/G75 X150/g).length).toBe(1);
    expect(same).not.toContain('STOPRE');
  });

  it('výsledek je souvisle přečíslovaný po 10', () => {
    const nums = merged.split('\n')
      .map(l => (l.match(/^N(\d+)\b/) || [])[1])
      .filter(Boolean).map(Number);
    expect(nums[0]).toBe(10);
    nums.forEach((n, i) => expect(n).toBe(10 + i * 10));
  });
});

describe('buildCombinedProgram / partsAsMergeItems', () => {
  it('jedna část = její kód beze změny', () => {
    expect(buildCombinedProgram([{ name: 'Část 1', gcode: PART_A }])).toBe(PART_A);
  });

  it('části bez drah se přeskočí', () => {
    const out = buildCombinedProgram([
      { name: 'Část 1', gcode: PART_A },
      { name: 'Část 2', gcode: '   ' },
    ]);
    expect(out).toBe(PART_A);
    expect(buildCombinedProgram([{ name: 'x', gcode: '' }])).toBe('');
    expect(buildCombinedProgram([])).toBe('');
  });

  it('dvě části se spojí a označí komentářem', () => {
    const out = buildCombinedProgram([
      { name: 'Hrubování', gcode: PART_A },
      { name: 'Drážky', gcode: PART_B },
    ]);
    expect(out).toContain('; ===== Hrubování =====');
    expect(out).toContain('; ===== Drážky =====');
  });

  it('fronta pro CAM Editor dostane .MPF názvy a jen části s dráhami', () => {
    const items = partsAsMergeItems([
      { name: 'Hrubování', gcode: PART_A },
      { name: 'Prázdná', gcode: '' },
    ]);
    expect(items).toEqual([{ name: 'Hrubování.MPF', code: PART_A }]);
  });
});

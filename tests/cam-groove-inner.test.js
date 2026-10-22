// ╔══════════════════════════════════════════════════════════════╗
// ║  Zápich v díře (Upich + ◎ Vnitřní) — ops/grooveInner.js        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Doplnění pravidla 13 (docs/cam-pravidla.md, schválil uživatel 22. 10. 2026):
// vnější Upich v zrcadle — zápich VEN od stěny díry vnitřní zapichovací tyčí,
// libovolná šířka (zápichy vedle sebe s krokem ≤ šířka destičky, dokončení
// bok → dno → druhý bok), tyč se musí vejít, pohyb přes osu díry.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife, isoGroovingBar, isoInnerGrooveWidths, isoInternalBars, isoInternalTypeById, isoBoringBarDiameter } from '../js/calculators/isoInternalTools.js';
import { grooveInnerGeom } from '../js/calculators/cam/ops/grooveInner.js';

const bar = (d, w) => buildIsoInternalKnife('BGI', { bar: d, width: w });

// Díl ⌀80 × 60 s dírou ⌀40 × 30 (zprava, ústí Z0), předvrtání ⌀30.
const contourPoints = [
  { id: 1, type: 'G0', x: 20, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -60, r: 0, mode: 'ABS' },
];
const stockPoints = [
  { id: 11, type: 'G0', x: 0, z: 2, r: 0, mode: 'ABS' },
  { id: 12, type: 'G1', x: 42, z: 2, r: 0, mode: 'ABS' },
  { id: 13, type: 'G1', x: 42, z: -62, r: 0, mode: 'ABS' },
  { id: 14, type: 'G1', x: 0, z: -62, r: 0, mode: 'ABS' },
];
const hole = { boreZStart: 0, borePreDiameter: 30, borePreDepth: 40, boreDiameter: 40, boreDepth: 30 };
const params = (tool, over = {}) => ({
  machineType: 'LIMS=2000', mode: 'RADIUS', controlSystem: 'sinumerik', speed: 120, feed: 0.06,
  safeX: 150, safeZ: 5, roughingSide: 'right', rapidClearance: 1, retractDistance: 2, partingApproachFeed: 0.5,
  allowanceX: 0, allowanceZ: 0, finishAllowance: 0.2, doFinishing: true, partOffSmooth: true,
  ...tool.tool, toolName: tool.name, ...hole,
  partOffZ: -10, partOffInner: true, grooveWidth: 8, grooveBottomX: 23,
  ...over,
});
const prog = (p) => ({ params: p, contourPoints, stockPoints, flipX: false, flipZ: false });

/** Blok zápichu → pohyby { g, x, z } (modálně doplněné). */
function moves(gcode) {
  const out = [];
  let x = null, z = null, on = false;
  for (const l of gcode.split('\n')) {
    if (l.includes('ZAPICH V DIRE')) on = true;
    if (!on) continue;
    const m = /\b(G[01])\b/.exec(l);
    if (!m) continue;
    const mx = /X(-?[\d.]+)/.exec(l), mz = /Z(-?[\d.]+)/.exec(l);
    if (mx) x = parseFloat(mx[1]);
    if (mz) z = parseFloat(mz[1]);
    out.push({ g: m[1], x, z, text: l });
  }
  return out;
}

describe('katalog: vnitřní zapichovací tyč', () => {
  it('tyče ⌀16–80, šířky do tyče, dosah a Dmin ≥ d + a', () => {
    const bars = isoInternalBars(isoInternalTypeById('BGI')).map(b => b.d);
    expect(bars).toEqual([16, 20, 25, 32, 40, 50, 63, 80]);
    for (const d of bars) {
      for (const g of isoInnerGrooveWidths(d)) {
        const rec = bar(d, g.w);
        expect(rec.tool.toolShape).toBe('parting');
        expect(rec.tool.toolInternal).toBe(true);
        expect(rec.tool.toolLength).toBe(g.w);
        expect(rec.iso.dmin).toBeGreaterThanOrEqual(d + g.a);
        expect(isoGroovingBar(rec.name)).toEqual({ d, w: g.w, a: g.a });
        // Zapichovací tyč se nesmí plést s vyvrtávací (výběr tyče pro Hrub. + ◎ Vnitřní).
        expect(isoBoringBarDiameter(rec.name)).toBe(null);
      }
    }
  });
});

describe('geometrie zápichu v díře', () => {
  it('zápichy vedle sebe: krok ≤ 0,8 × šířka, boky s přídavkem, dokončení na boky', () => {
    const g = grooveInnerGeom(params(bar(25, 3)));
    expect(g.ok).toBe(true);
    expect(g.rHole).toBe(20);
    // 8 mm − 2 × 0,2 přídavek = 7,6 → 3 zápichy po 2,3 mm.
    expect(g.plunges).toHaveLength(3);
    for (let i = 1; i < g.plunges.length; i++) expect(Math.abs(g.plunges[i] - g.plunges[i - 1])).toBeLessThanOrEqual(0.8 * 3 + 1e-9);
    // Bok u ústí −10, druhý −18; destička 3 mm, rádius 0,2 (střed = levý roh).
    expect(g.zFinA).toBeCloseTo(-12.8, 6);
    expect(g.zFinB).toBeCloseTo(-17.8, 6);
    expect(g.rcBotFinal).toBeCloseTo(22.8, 6);
    expect(g.rcBotRough).toBeCloseTo(22.6, 6);
  });
  it('šířka = šířka destičky → jeden zápich na místě boku', () => {
    const g = grooveInnerGeom(params(bar(25, 3), { grooveWidth: 0 }));
    expect(g.ok).toBe(true);
    expect(g.plunges).toEqual([-12.8]);
  });
  it('tyč se nevejde do díry → dráha se nevydá', () => {
    const g = grooveInnerGeom(params(bar(40, 3), { boreDiameter: 40 }));
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/nevejde/);
  });
  it('zápich hlubší než dosah destičky → dráha se nevydá', () => {
    const g = grooveInnerGeom(params(bar(25, 3), { grooveBottomX: 26 }));
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/dosáhne/);
  });
  it('vnější upichovák do díry nejde', () => {
    const t = bar(25, 3);
    const g = grooveInnerGeom(params({ ...t, tool: { ...t.tool, toolInternal: false } }));
    expect(g.ok).toBe(false);
  });
  it('dno uvnitř díry / užší šířka než destička → hlášení', () => {
    expect(grooveInnerGeom(params(bar(25, 3), { grooveBottomX: 19 })).reason).toMatch(/VEN/);
    expect(grooveInnerGeom(params(bar(25, 3), { grooveWidth: 2 })).reason).toMatch(/menší než šířka destičky/);
  });
  it('bez vyvrtávání bere předvrtání, ruční ⌀ díry ho přebije', () => {
    expect(grooveInnerGeom(params(bar(20, 3), { boreDiameter: 0, grooveBottomX: 17 })).rHole).toBe(15);
    expect(grooveInnerGeom(params(bar(20, 3), { grooveHoleD: 32, grooveBottomX: 18 })).rHole).toBe(16);
  });
});

describe('program zápichu v díře', () => {
  it('do díry přes osu, zápichy ven, dokončení, ven z díry osou', async () => {
    const { gcode, errorsSim } = await runCamProg(prog(params(bar(25, 3))));
    const mv = moves(gcode);
    // Vnější obrys se nedokončuje → žádné falešné kolize tyče ani hlášky vnějšího upichu.
    expect(errorsSim.map(e => e.msg)).toEqual([]);
    expect(gcode).toContain('ZAPICH V DIRE');
    expect(gcode).not.toContain('UPICHNUTI');
    // Nájezd: před ústí i před čelo polotovaru (Z2 + vůle 1 + 1 = Z4) a ještě
    // o 0,6 mm, kam tyč sahá za špičku do díry (Z4,6); pak k ose (X 16,3),
    // teprve potom na Z zápichu.
    expect(mv[0]).toMatchObject({ g: 'G0', z: 4.6 });
    expect(mv[1].x).toBeCloseTo(16.3, 3);
    // Žádný pohyb v díře nesmí stěnou díry (r 20) mimo pás zápichu Z −10 … −18.
    for (const m of mv) {
      if (m.z === null || m.x === null || m.z > 0 || m.text.includes('Bezpečná')) continue;
      const inGroove = m.z <= -10 + 1e-6 && m.z >= -18 - 1e-6;
      if (!inGroove) expect(m.x + 0.2).toBeLessThanOrEqual(20 + 1e-6);
      expect(m.x + 0.2).toBeLessThanOrEqual(23 + 1e-6);   // nikdy za dno zápichu
    }
    // Řezy: G1 jen ven k dnu (hrubování 22,6, dokončení 22,8) a po dně.
    const g1 = mv.filter(m => m.g === 'G1');
    expect(g1.filter(m => m.x === 22.6)).toHaveLength(3);
    expect(g1.some(m => m.x === 22.8 && m.z === -12.8)).toBe(true);
    expect(g1.some(m => m.x === 22.8 && m.z === -17.8)).toBe(true);
    // Ven: osou díry před ústí, pak bezpečná poloha.
    const iOut = mv.findIndex(m => m.text.includes('Ven z díry'));
    expect(mv[iOut - 1].x).toBeCloseTo(16.3, 3);
    expect(mv[iOut].z).toBe(4.6);
  });
  it('průměrové X (DIAMON) = dvojnásobek', async () => {
    const { gcode } = await runCamProg(prog(params(bar(25, 3), { mode: 'DIAMON' })));
    expect(gcode).toMatch(/G1 X45\.200/);
  });
  it('peckování: výjezdy jen ke stěně díry, ne přes ni', async () => {
    const { gcode } = await runCamProg(prog(params(bar(25, 3), { partOffSmooth: false, retractDistance: 1 })));
    const mv = moves(gcode);
    expect(mv.filter(m => m.text.includes('uvolnění')).every(m => m.x === 18.8)).toBe(true);
  });
  it('nevejde-li se tyč, program nemá zápich a ⚠ to hlásí', async () => {
    const { gcode } = await runCamProg(prog(params(bar(40, 3))));
    expect(gcode).toMatch(/! Tyč se do díry nevejde/);
    expect(moves(gcode).filter(m => m.g === 'G1')).toHaveLength(0);
  });
  it('zleva = zrcadlo v Z (díra otevřená doleva)', async () => {
    const p = params(bar(25, 3), { roughingSide: 'left', boreZStart: -60, partOffZ: -50 });
    const g = grooveInnerGeom(p);
    expect(g.ok).toBe(true);
    // Bok u ústí −50, druhý −42 (hlouběji = doprava).
    expect(g.zB).toBe(-42);
    expect(Math.min(...g.plunges)).toBeGreaterThan(-50);
    expect(Math.max(...g.plunges)).toBeLessThan(-42);
    expect(g.zOut).toBeLessThan(-60);
  });
});

describe('UI: pole Upich + ◎ Vnitřní', async () => {
  const { grooveInnerFieldsHtml } = await import('../js/calculators/cam/sim/paramsGrooveHtml.js');
  it('ukáže Z boku, šířku, dno, ⌀ díry (auto z vyvrtávání) a plán zápichů', () => {
    const html = grooveInnerFieldsHtml(params(bar(25, 3)));
    for (const k of ['partOffZ', 'grooveWidth', 'grooveBottomX', 'grooveHoleD', 'allowanceZ', 'finishAllowance']) expect(html).toContain(`data-p="${k}"`);
    expect(html).toContain('3 zápichy');
    expect(html).toContain('⌀40 z vyvrtávání');
    expect(html).not.toContain('Start X');
  });
  it('nevydaná dráha → důvod červeně', () => {
    expect(grooveInnerFieldsHtml(params(bar(25, 3), { grooveBottomX: 26 }))).toMatch(/⚠ Zápich je hlubší/);
  });
});

describe('simulace zápichu v díře (skutečný svět)', async () => {
  const { MaterialRemoval, insertWorldLoop } = await import('../js/calculators/cam/materialRemoval.js');
  const { holderWorldLoop, validateToolpath } = await import('../js/calculators/cam/collisionValidator.js');
  const { simStockArgs } = await import('../js/calculators/cam/sim/grooveSim.js');
  const { polyIntersect, polyArea } = await import('../js/geom/geomCore.js');
  const box = (x0, x1, z0, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const area = (loops, b) => Math.abs(polyArea(polyIntersect(loops, [b])));

  it('destička ostřím ven, tělo i tyč k ose (obrácená radiálně jen při zápichu v díře)', () => {
    const p = params(bar(25, 3));
    const ins = insertWorldLoop(p), hol = holderWorldLoop(p);
    expect(Math.max(...ins.map(q => q.x))).toBeCloseTo(0.2, 6);      // ostří = rádius ven od středu
    expect(Math.min(...hol.map(q => q.x))).toBeLessThan(-25);         // tyč ⌀25 k ose
    const pOff = { ...p, partOffZ: null };                           // jiná operace: beze změny
    expect(Math.min(...insertWorldLoop(pOff).map(q => q.x))).toBeCloseTo(-0.2, 6);
  });

  it('úběr = jen zápich (dno r 23, boky Z −10 … −18), validátor bez kolizí', async () => {
    const { calcSim, S } = await runCamProg(prog(params(bar(25, 3))));
    const [sp, segs] = simStockArgs(S, calcSim);
    expect(sp.stockMode).toBe('casting');                            // polotovar mínus díra ⌀40
    const rm = new MaterialRemoval(sp, segs);
    expect(rm.valid).toBe(true);
    const before = rm.model.loops.map(l => l.map(q => ({ ...q })));
    rm.advanceTo(calcSim.simPath, calcSim.simPath.length - 1);
    const after = rm.model.loops;
    const removedIn = (b) => area(before, b) - area(after, b);
    expect(removedIn(box(20, 23, -18, -10))).toBeGreaterThan(0.95 * 3 * 8);   // celý zápich
    expect(removedIn(box(23.05, 30, -40, 2))).toBeLessThan(0.01);              // nic za dnem
    expect(removedIn(box(20, 30, -9.95, 2))).toBeLessThan(0.01);               // nic před bokem u ústí
    expect(removedIn(box(20, 30, -40, -18.05))).toBeLessThan(0.01);            // nic za druhým bokem
    const issues = validateToolpath(calcSim.simPath, sp, segs, { planStock: true });
    expect(issues).toEqual([]);
  });
});

describe('vyložení tyče (pravidlo 13, jen hlášení)', async () => {
  const { barOverhangNote } = await import('../js/calculators/cam/ops/barOverhang.js');
  it('nad 4 × ⌀ ocelové tyče hlásí, do 4 × ⌀ ne; vnější nůž se nehlídá', () => {
    const t = bar(16, 2).tool;
    expect(barOverhangNote(t, 64)).toBe(null);
    expect(barOverhangNote(t, 64.5)).toMatch(/⌀16 snese asi 64 mm/);
    expect(barOverhangNote({ ...t, toolInternal: false }, 200)).toBe(null);
  });
  it('hluboký zápich tenkou tyčí: program se vydá s ⚠ v komentáři', async () => {
    const p = params(bar(16, 2), { boreDiameter: 0, borePreDiameter: 20, borePreDepth: 80, partOffZ: -60, grooveBottomX: 11.5 });
    const { gcode } = await runCamProg(prog(p));
    expect(gcode).toMatch(/! Vyložení tyče: špička jde 68 mm/);
    expect(gcode).toMatch(/G1 X11\.\d+ F/);                      // zápich se vydal
  });
  it('mělký zápich bez hlášení', async () => {
    const { gcode } = await runCamProg(prog(params(bar(25, 3))));
    expect(gcode).not.toContain('Vyložení');
  });
});

describe('díra z výkresu (✏ tvar)', async () => {
  const { grooveInnerFieldsHtml } = await import('../js/calculators/cam/sim/paramsGrooveHtml.js');
  // Samostatný řetěz díry: ⌀30 do Z −20, schod, ⌀24 do Z −40 (poloměry, RADIUS).
  const P = (pts) => pts.map(([x, z], i) => ({ id: 100 + i, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
  const borePoints = P([[15, 0], [15, -20], [12, -20], [12, -40]]);
  // V polích zůstal starý válec ⌀40 — nesmí se použít.
  const cad = (over) => params(bar(16, 2), { boreSource: 'cad', boreDiameter: 40, borePreDiameter: 20, borePreDepth: 45, ...over });

  it('generátor bere díru z výkresu, ne ⌀ z polí', async () => {
    const { gcode } = await runCamProg({ ...prog(cad({ partOffZ: -5, grooveWidth: 4, grooveBottomX: 17 })), borePoints });
    expect(gcode).not.toMatch(/^; ! /m);
    // Start zápichu o vůli 1 + rádius 0,2 před stěnou ⌀30: X 13,8.
    expect(gcode).toMatch(/G0 X13\.800/);
    expect(gcode).toMatch(/G1 X16\.\d+ F/);
  });
  it('zápich v užší části díry (⌀24) počítá se stěnou ⌀24', async () => {
    const { gcode } = await runCamProg({ ...prog(cad({ partOffZ: -25, grooveWidth: 4, grooveBottomX: 14 })), borePoints });
    expect(gcode).toMatch(/G0 X10\.800/);
  });
  it('panel ukazuje totéž co program', () => {
    const S = { params: cad({ partOffZ: -5, grooveWidth: 4, grooveBottomX: 17 }), contourPoints, borePoints };
    const html = grooveInnerFieldsHtml(S.params, S);
    expect(html).toContain('Díra ⌀30');
    expect(html).toContain('tvar díry z výkresu');
  });
});

describe('náhled zápichu na polotovaru', async () => {
  const { grooveOutline } = await import('../js/calculators/cam/sim/grooveSim.js');
  it('obrys zápichu (boky Z −10 / −18, dno r 23) a stěna díry od ústí', () => {
    const go = grooveOutline({ params: params(bar(25, 3)), contourPoints });
    expect(go.groove).toEqual([[20, -10], [23, -10], [23, -18], [20, -18]]);
    expect(go.wall).toEqual([[20, 0], [20, -10]]);
  });
  it('nevydaná dráha: aspoň kde zápich je; bez Z nic', () => {
    const go = grooveOutline({ params: params(bar(40, 3)), contourPoints });   // tyč se nevejde
    expect(go.groove[1]).toEqual([23, -10]);
    expect(grooveOutline({ params: params(bar(25, 3), { partOffZ: null }), contourPoints })).toBe(null);
  });
});

describe('zápich z výkresu (bod 3)', async () => {
  const { groovesInChain, groovesFromDrawing, chainWithoutGrooves } = await import('../js/calculators/cam/sim/grooveCad.js');
  const { grooveCadRowHtml } = await import('../js/calculators/cam/sim/paramsGrooveHtml.js');
  const { grooveHoleLoop } = await import('../js/calculators/cam/sim/grooveSim.js');
  const P = (pts) => pts.map(([x, z], i) => ({ id: 200 + i, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
  // Díra ⌀40 do Z −30 se zápichem ⌀46 mezi Z −10 a −18 (samostatný řetěz).
  const borePoints = P([[20, 0], [20, -10], [23, -10], [23, -18], [20, -18], [20, -30]]);
  const S = (over) => ({ params: params(bar(25, 3), { boreSource: 'cad', ...over }), contourPoints, borePoints });

  it('najde obdélníkový zápich: bok u ústí, šířka, dno, stěna', () => {
    expect(groovesFromDrawing(S())).toEqual([{ zA: -10, W: 8, rBot: 23, rWall: 20 }]);
  });
  it('bez zápichu nic; šikmý schod není zápich', () => {
    expect(groovesInChain([{ type: 'line', p1: { x: 20, z: 0 }, p2: { x: 20, z: -30 } }])).toEqual([]);
    const tilted = [{ p1: { x: 20, z: 0 }, p2: { x: 20, z: -10 } }, { p1: { x: 20, z: -10 }, p2: { x: 23, z: -11 } },
      { p1: { x: 23, z: -11 }, p2: { x: 23, z: -18 } }, { p1: { x: 23, z: -18 }, p2: { x: 20, z: -18 } }].map(s => ({ type: 'line', ...s }));
    expect(groovesInChain(tilted)).toEqual([]);
  });
  it('panel nabídne tlačítko; vyplněný zápich svítí zeleně', () => {
    const html = grooveCadRowHtml(S({ partOffZ: -5 }));   // jiný zápich než nakreslený
    expect(html).toContain('data-act="groove-from-cad" data-i="0" class="cam-sim-btn cam-sim-btn-gray"');
    expect(html).toContain('Z -10 · š 8 · ⌀46');
    expect(grooveCadRowHtml(S({ partOffZ: -10, grooveWidth: 8, grooveBottomX: 23 }))).toContain('cam-sim-btn-green');
  });
  it('převzatý zápich: program stejný jako ručně zadaný, stěna z výkresu', async () => {
    const { gcode } = await runCamProg({ ...prog(S().params), borePoints });
    expect(gcode).toMatch(/G0 X18\.800/);              // stěna ⌀40 z výkresu, ne dno zápichu
    expect(gcode).toMatch(/G1 X22\.800 F/);
  });
  it('polotovar simulace zápich ještě nemá (stěna místo něj)', () => {
    const filled = chainWithoutGrooves(groovesFromDrawing(S()).length ? [
      { type: 'line', p1: { x: 20, z: 0 }, p2: { x: 20, z: -10 } }, { type: 'line', p1: { x: 20, z: -10 }, p2: { x: 23, z: -10 } },
      { type: 'line', p1: { x: 23, z: -10 }, p2: { x: 23, z: -18 } }, { type: 'line', p1: { x: 23, z: -18 }, p2: { x: 20, z: -18 } },
      { type: 'line', p1: { x: 20, z: -18 }, p2: { x: 20, z: -30 } }] : []);
    expect(Math.max(...filled.flatMap(s => [s.p1.x, s.p2.x]))).toBe(20);
    expect(Math.max(...grooveHoleLoop(S()).map(q => q.x))).toBe(20);
  });
});

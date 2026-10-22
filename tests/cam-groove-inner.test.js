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
    // Nájezd: před ústí (Z > 0), pak k ose (X 16,3), teprve potom na Z zápichu.
    expect(mv[0]).toMatchObject({ g: 'G0', z: 2 });
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
    expect(mv[iOut].z).toBe(2);
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

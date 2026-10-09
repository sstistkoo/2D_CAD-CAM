// ╔══════════════════════════════════════════════════════════════╗
// ║  Vyvrtávání z plného: vrták → vyvrtávací tyč v jednom programu ║
// ║  (cam/ops/borePreDrill.js)                                     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 9. 10. 2026 (projekt_2026-10-09): kalíšek ⌀290 s dírou ⌀137,93
// napojenou na čelo, dno díry rovné k ose, polotovar plný. Má se vrtat
// vrtákem ze 🔧 Zásobníku a pak vyvrtávat tyčí — automaticky, v jednom
// programu. Rozhodnutí uživatele: „špička nesmí do dna" → vrták skončí
// špičkou na dně + Přídavek Z; tyč z předvrtání se špičkou vezme stěnu jen
// do hloubky plného ⌀ a dno (prstenec + kužel) se nahlásí.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife } from '../js/calculators/isoInternalTools.js';
import { preDrillPlan, preDrillParams, preDrillSplitIndex, catalogDrillFor, drillPointLength } from '../js/calculators/cam/ops/borePreDrill.js';
import { boreMirrorSim, boreRemovedLoops } from '../js/calculators/cam/ops/bore.js';
import { computeCalculation } from '../js/calculators/cam/calculatePipeline.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { MaterialRemoval, buildStockLoopRaw } from '../js/calculators/cam/materialRemoval.js';
import { polyDifference, pointInLoop } from '../js/geom/geomCore.js';

const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
// Kalíšek z projektu uživatele (RADIUS): dno díry Z30,139, stěna X68,965, čelo Z143,274.
const CUP = [[30.139, 0], [30.139, 68.965], [143.274, 68.965], [143.274, 144.971], [0, 144.971], [0, 0]];
const drill = (D, len, slot = 7) => ({ slot, name: `Vrtak HSS D${D}`, shape: 'drill', radius: D / 2, tipAngle: 118, toolAngle: 0,
  toolLength: len, vc: 25, f: 0.26, ap: D, holderLength: 80, holderWidth: 40, holderHand: 'R', knifeAngle: 270, holderProfile: null });

function prog(mag, extra = {}) {
  const bar = buildIsoInternalKnife('BCL', { bar: 16 });
  return {
    params: {
      mode: 'RADIUS', controlSystem: 'sinumerik', speed: 150, feed: 0.2, depthOfCut: 2, retractDistance: 2,
      allowanceX: 0.5, allowanceZ: 0.5, noStepRoughing: true, roughingSide: 'right', machineType: 'LIMS=2000',
      stockMode: 'cylinder', stockDiameter: 300, stockLength: 5, stockFace: 146, safeX: 160, safeZ: 155,
      ...bar.tool, toolName: bar.name,
      boreActive: true, boreSource: 'cad', borePreDrill: true, drillPeck: 10, drillChipMode: 'clear', drillRetract: 1,
      ...extra,
    },
    contourPoints: P(CUP), stockPoints: [], toolMagazine: mag,
  };
}
const moves = (code) => code.split('\n').filter(l => /^N\d+ G[0-3]\b/.test(l));

describe('vyvrtávání z plného — plán předvrtání', () => {
  it('vrták ze zásobníku: špička na dně + přídavek Z, plný ⌀ o špičku výš', async () => {
    const r = await runCamProg(prog([drill(20, 145)]));
    const plan = preDrillPlan(r.S);
    expect(plan.ok).toBe(true);
    expect(plan.D).toBe(20);
    expect(plan.L).toBeCloseTo(143.274 - 30.139, 6);
    expect(plan.depthTip).toBeCloseTo(plan.L - 0.5, 3);
    expect(plan.L0).toBeCloseTo(plan.depthTip - drillPointLength(20, 118), 3);
    // Pipeline přepsala předvrtání podle vrtáku (UI i simulace vidí totéž).
    expect([r.S.params.borePreDiameter, r.S.params.borePreDepth, r.S.params.borePreTip]).toEqual([20, plan.L0, plan.tipL]);
  });

  it('vybere největší vrták, který dosáhne na dno; nedosáhne-li žádný větší, ten s dosahem', async () => {
    const r = await runCamProg(prog([drill(20, 145, 1), drill(50, 90, 2), drill(30, 180, 3)]));
    const plan = preDrillPlan(r.S);
    expect(plan.D).toBe(30);   // ⌀50 nedosáhne (vyložení 90 < 112,6)
    expect(plan.auto).toBe(true);
  });

  it('bez vrtáku v zásobníku: hláška s katalogem a katalog poradí vrták, který dosáhne', async () => {
    const r = await runCamProg(prog([]));
    const plan = preDrillPlan(r.S);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/katalog/);
    const rec = catalogDrillFor(plan.dMax, plan.L - 0.5);
    expect(rec.tool.toolShape).toBe('drill');
    expect(rec.tool.toolLength).toBeGreaterThanOrEqual(plan.L - 0.5);
    expect(2 * rec.tool.toolRadius).toBeLessThanOrEqual(plan.dMax);
    expect(r.S.genNotes.some(n => /Předvrtání:/.test(n.msg))).toBe(true);
  });
});

describe('vyvrtávání z plného — program a simulace', () => {
  it('jeden program: vrtání vrtákem, výměna, vyvrtávání tyčí; dno díry se nahlásí', async () => {
    const r = await runCamProg(prog([drill(20, 145)]));
    const code = r.gcode;
    const iDrill = code.indexOf('T="Vrtak HSS D20"'), iBar = code.indexOf('T="S16Q-SCLCR09"');
    expect(iDrill).toBeGreaterThan(0);
    expect(iBar).toBeGreaterThan(iDrill);
    expect(code.slice(iDrill, iBar)).toMatch(/STOPRE/);
    expect(code).not.toMatch(/nevejde/);
    // Vrtání: nejhlubší bod špičky = dno díry + přídavek Z.
    const drillPart = code.slice(0, iBar);
    const zs = moves(drillPart).filter(l => /Vrtání/.test(l)).map(l => +l.match(/Z(-?\d*\.?\d+)/)[1]);
    expect(Math.min(...zs)).toBeCloseTo(30.139 + 0.5, 3);
    // Vyvrtávání má pohyby a hlásí zbylé dno.
    expect(moves(code.slice(iBar)).length).toBeGreaterThan(50);
    expect(r.S.genNotes.some(n => /dno díry od Z 36,65 do Z 30,14/.test(n.msg))).toBe(true);
  });

  it('simulace: vrták ve skutečném světě, tyč v zrcadle — bez kolizí; úběr sedí s plánem', async () => {
    const r = await runCamProg(prog([drill(20, 145)]));
    const { simPath, stockPathSegments } = r.calcSim;
    const iSplit = preDrillSplitIndex(simPath, r.gcode);
    expect(iSplit).toBeGreaterThan(10);
    const plan = preDrillPlan(r.S);
    const dp = preDrillParams(r.S.params, plan);
    // ⛔ úsek vrtání (skutečný svět) a úsek tyče (zrcadlo).
    expect(validateToolpath(simPath.slice(0, iSplit + 1), dp, stockPathSegments, { planStock: true })).toEqual([]);
    const bs = boreMirrorSim(r.S, simPath.slice(iSplit), computeCalculation);
    expect(validateToolpath(bs.calcM.simPath, bs.params, bs.calcM.stockPathSegments, { planStock: true })).toEqual([]);
    // Po vrtání: díra v ose, kolem ní materiál.
    const base = buildStockLoopRaw(r.S.params, stockPathSegments);
    const mrD = new MaterialRemoval(dp, stockPathSegments);
    mrD.advanceTo(simPath, iSplit - 1);
    const solidD = (x, z) => mrD.model.loops.some(l => pointInLoop({ x, z }, l) === 'inside');
    expect(solidD(3, 100)).toBe(false);
    expect(solidD(15, 100)).toBe(true);
    // Na konci: stěna vyvrtaná do hloubky plného ⌀, dno (prstenec, kužel) stojí.
    const mrB = new MaterialRemoval(bs.params, bs.calcM.stockPathSegments);
    mrB.advanceTo(bs.calcM.simPath, bs.calcM.simPath.length - 1);
    const final = polyDifference([base], boreRemovedLoops(bs.g, bs.un(mrB.model.loops)));
    const solid = (x, z) => final.some(l => pointInLoop({ x, z }, l) === 'inside');
    expect(solid(40, 80)).toBe(false);     // stěna díry vyvrtaná
    expect(solid(67, 120)).toBe(false);    // až k přídavku na stěně
    expect(solid(69.2, 120)).toBe(true);   // díl za stěnou
    expect(solid(40, 33)).toBe(true);      // prstenec dna pod hloubkou plného ⌀
    expect(solid(5, 31.5)).toBe(true);     // materiál kolem kuželu po špičce
    expect(solid(1, 34)).toBe(false);      // vyvrtaný kužel
  });

  it('bez předvrtání vrtákem se nic nemění (ruční předvrtání = válec)', async () => {
    const r = await runCamProg(prog([drill(20, 145)], { borePreDrill: false, borePreDiameter: 20, borePreDepth: 120 }));
    expect(r.gcode).not.toMatch(/Vrtak HSS D20/);
    expect(r.S.params.borePreTip).toBe(0);
    expect(moves(r.gcode).length).toBeGreaterThan(50);
  });
});

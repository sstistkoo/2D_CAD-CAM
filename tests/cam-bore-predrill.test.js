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
import { boreRealCollisions, partLoopOf } from '../js/calculators/cam/boreRealCollision.js';
import { boreFloorSim, boreFloorSplitIndex, boreFloorLayer, boreBodyGap } from '../js/calculators/cam/ops/boreFloor.js';
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
    // Dno díry (prstenec + kužel) dobere čelní fáze téhož nože — nic nezůstává.
    expect(code).toMatch(/DNO DIRY/);
    expect(code.indexOf('DNO DIRY')).toBeGreaterThan(iBar);
    expect(r.S.genNotes.some(n => /dno díry od Z/.test(n.msg))).toBe(false);
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
    const iFloor = boreFloorSplitIndex(simPath, r.gcode);
    expect(iFloor).toBeGreaterThan(iSplit);
    const bs = boreMirrorSim(r.S, simPath.slice(iSplit, iFloor), computeCalculation);
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
    expect(solid(40, 33)).toBe(true);      // prstenec dna pod hloubkou plného ⌀ (jen podélná fáze)
    expect(solid(5, 31.5)).toBe(true);     // materiál kolem kuželu po špičce
    expect(solid(1, 34)).toBe(false);      // vyvrtaný kužel
  });

  it('dno díry čelně: bez kolizí, dno vyčištěné po přídavek Z, kužel pryč, pod dnem a za stěnou nic', async () => {
    const r = await runCamProg(prog([drill(20, 145)]));
    const { simPath } = r.calcSim;
    const iFloor = boreFloorSplitIndex(simPath, r.gcode);
    const fs = boreFloorSim(r.S, simPath.slice(iFloor - 1), computeCalculation);
    expect(validateToolpath(fs.calcM.simPath, fs.params, fs.calcM.stockPathSegments, { planStock: true })).toEqual([]);
    const mr = new MaterialRemoval(fs.params, fs.calcM.stockPathSegments);
    mr.advanceTo(fs.calcM.simPath, fs.calcM.simPath.length - 1);
    const rem = fs.un(mr.model.loops);
    const solid = (x, z) => rem.some(l => pointInLoop({ x, z }, l) === 'inside');
    // Dno Z30,139 + přídavek Z 0,5: výš je vyčištěno, pod ním zůstává.
    expect(solid(40, 30.9)).toBe(false);
    expect(solid(40, 30.4)).toBe(true);
    expect(solid(40, 29)).toBe(true);
    // Kužel po špičce vrtáku je pryč i uprostřed (špička v ose).
    expect(solid(1, 31.3)).toBe(false);
    expect(solid(8, 33)).toBe(false);
    // Stěna díry (přídavek X 0,5 + rε) a díl za ní zůstává.
    expect(solid(69.3, 35)).toBe(true);
  });

  it('vrstva dna je nejvýš mezera mezi špičkou a tělesem tyče a mřížka dosedne přesně na dno', async () => {
    const r = await runCamProg(prog([drill(20, 145)]));
    const gap = boreBodyGap(r.S.params);
    expect(gap).toBeGreaterThan(1);
    expect(boreFloorLayer(r.S.params)).toBeLessThanOrEqual(gap - 0.2 + 1e-9);
    // Poslední vrstva leží na offsetu dna (dno + přídavek Z + rε = Z31,039).
    const NL = String.fromCharCode(10);
    const i = r.gcode.indexOf('DNO DIRY');
    const zs = r.gcode.slice(i).split(NL).filter(l => /^N\d+ G0 Z[\d.]+$/.test(l)).map(l => +l.match(/Z([\d.]+)/)[1]).filter(z => z < 40);
    expect(Math.min(...zs)).toBeCloseTo(31.039, 2);
  });

  it('Bezpečná poloha za dílem (Z5): rychloposuvy tyče nikdy neprojedou dílem — nejdřív v Z venku, pak před čelem do osy', async () => {
    // Uživatel 9. 10. 2026 (projekt_2026-10-09 (2)): Bp X300 Z5 leží u dílu Z0–143;
    // program jel G0 X9 Z5 a pak osou Z5→Z145 přímo skrz plné dno dílu.
    const r = await runCamProg(prog([drill(20, 145)], { safeX: 300, safeZ: 5, boreFinish: true }));
    const part = r.calcSim.worldPoints.map(p => ({ x: p.xReal, z: p.zReal }));
    const inPart = (x, z) => pointInLoop({ x, z }, part) === 'inside';
    const sp = r.calcSim.simPath;
    let bad = null;
    for (let i = 1; i < sp.length && !bad; i++) {
      if (sp[i].type !== 'G0') continue;
      const a = sp[i - 1], b = sp[i], n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
        // Pás 0,3 mm od hranice se nepočítá (stěna díry, čelo).
        if (inPart(x, z) && inPart(x + 0.3, z) && inPart(x - 0.3, z) && inPart(x, z + 0.3) && inPart(x, z - 0.3)) { bad = { i, x, z, line: b.originalLineIdx }; break; }
      }
    }
    expect(bad).toBeNull();
    // Příjezd do díry: Z po vnější Bp (X300), pak radiálně.
    const i = r.gcode.indexOf('VYVRTAVANI ⌀');
    const mv = r.gcode.slice(i).split(String.fromCharCode(10)).filter(l => /^N\d+ G0 /.test(l)).slice(0, 2);
    expect(mv[0]).toMatch(/G0 Z1\d\d/);
    expect(mv[1]).toMatch(/G0 X9\./);
  });

  it('kolize tyče s dílem ve skutečném světě: program nic nenajde, rychloposuv osou skrz plné dno se najde', async () => {
    // Zrcadlová simulace nezná nic mimo díru → samostatné zametení tyče proti hotovému dílu.
    const r = await runCamProg(prog([drill(20, 145)], { safeX: 300, safeZ: 5, boreFinish: true }));
    const part = partLoopOf(r.calcSim);
    const sp = r.calcSim.simPath, i0 = preDrillSplitIndex(sp, r.gcode);
    expect(boreRealCollisions(r.S.params, sp.slice(i0), part)).toEqual([]);
    const bad = [{ x: 300, z: 5, type: 'G0' }, { x: 9, z: 5, type: 'G0', originalLineIdx: 1 }, { x: 9, z: 150, type: 'G0', originalLineIdx: 2 }];
    const hits = boreRealCollisions(r.S.params, bad, part);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].kind).toBe('rapid');
    expect(hits[0].area).toBeGreaterThan(50);
  });

  it('izolace: ruční předvrtání (válec, bez kužele) nemá fázi dna', async () => {
    const r = await runCamProg(prog([drill(20, 145)], { borePreDrill: false, borePreDiameter: 20, borePreDepth: 120 }));
    expect(r.gcode).not.toMatch(/DNO DIRY/);
  });

  it('bez předvrtání vrtákem se nic nemění (ruční předvrtání = válec)', async () => {
    const r = await runCamProg(prog([drill(20, 145)], { borePreDrill: false, borePreDiameter: 20, borePreDepth: 120 }));
    expect(r.gcode).not.toMatch(/Vrtak HSS D20/);
    expect(r.S.params.borePreTip).toBe(0);
    expect(moves(r.gcode).length).toBeGreaterThan(50);
  });
});

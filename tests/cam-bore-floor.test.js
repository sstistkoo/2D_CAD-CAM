// ╔══════════════════════════════════════════════════════════════╗
// ║  Vyvrtávání — DNO DÍRY ČELNĚ: okrajové případy (boreFloor.js)  ║
// ╚══════════════════════════════════════════════════════════════╝
// Základní případ (kalíšek zprava, RADIUS, díra z výkresu) hlídá
// cam-bore-predrill.test.js. Tady: zleva = zrcadlo zprava, DIAMON, díra zadaná
// válcem (ne z výkresu), jiné řídicí systémy, vypnuté předvrtání vrtákem.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife } from '../js/calculators/isoInternalTools.js';
import { boreFloorSim, boreFloorSplitIndex } from '../js/calculators/cam/ops/boreFloor.js';
import { computeCalculation } from '../js/calculators/cam/calculatePipeline.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { boreRealCollisions, partLoopOf } from '../js/calculators/cam/boreRealCollision.js';
import { preDrillSplitIndex } from '../js/calculators/cam/ops/borePreDrill.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { ContourGouge } from '../js/calculators/cam/contourGouge.js';

const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
const CUP = [[30.139, 0], [30.139, 68.965], [143.274, 68.965], [143.274, 144.971], [0, 144.971], [0, 0]];
const mirZ = (pts) => pts.map(([z, x]) => [-z, x]);
const drill = (D, len, slot = 7) => ({ slot, name: `Vrtak HSS D${D}`, shape: 'drill', radius: D / 2, tipAngle: 118, toolAngle: 0,
  toolLength: len, vc: 25, f: 0.26, ap: D, holderLength: 80, holderWidth: 40, holderHand: 'R', knifeAngle: 270, holderProfile: null });

const bar = buildIsoInternalKnife('BCL', { bar: 16 });
const common = (over = {}) => ({
  mode: 'RADIUS', controlSystem: 'sinumerik', speed: 150, feed: 0.2, depthOfCut: 2, retractDistance: 2,
  allowanceX: 0.5, allowanceZ: 0.5, noStepRoughing: true, roughingSide: 'right', machineType: 'LIMS=2000',
  stockMode: 'cylinder', stockDiameter: 300, stockLength: 5, stockFace: 146, safeX: 160, safeZ: 155,
  ...bar.tool, toolName: bar.name, boreActive: true, boreSource: 'cad', borePreDrill: true,
  drillPeck: 10, drillChipMode: 'clear', drillRetract: 1, ...over,
});
const run = (over, pts = CUP, mag = [drill(20, 145)]) =>
  runCamProg({ params: common(over), contourPoints: P(pts), stockPoints: [], toolMagazine: mag });

/** Pohybové řádky fáze „dno" (bez N, bez komentářů). */
function floorMoves(gcode) {
  const lines = gcode.split('\n');
  const i = lines.findIndex(l => l.includes('DNO DIRY'));
  if (i < 0) return null;
  const out = [];
  for (const l of lines.slice(i)) {
    if (/\bM30\b/.test(l)) break;
    const code = l.split(/[;(]/)[0].replace(/^N\d+\s+/, '').trim();
    if (/\bG0?[0-3]\b/.test(code)) out.push(code);
  }
  return out;
}
const xz = (l) => ({ x: (l.match(/X(-?\d*\.?\d+)/) || [])[1], z: (l.match(/Z(-?\d*\.?\d+)/) || [])[1] });
const norm = (l) => l.replace(/([XZ])(-?\d*\.?\d+)/g, (_, a, v) => a + (+parseFloat(v).toFixed(3)));
const flipZ = (l) => l.replace(/Z(-?\d*\.?\d+)/g, (_, v) => { const z = -parseFloat(v); return 'Z' + (Math.abs(z) < 5e-4 ? 0 : z).toFixed(3); });

describe('dno díry čelně — okrajové případy', () => {
  it('zleva = přesné zrcadlo zprava (Z → −Z, X stejné)', async () => {
    const r = await run({}, CUP);
    const l = await run({ roughingSide: 'left', safeZ: -155 }, mirZ(CUP));
    const fr = floorMoves(r.gcode), fl = floorMoves(l.gcode);
    expect(fr && fr.length).toBeGreaterThan(10);
    expect(fl).not.toBeNull();
    expect(fl.map(norm)).toEqual(fr.map(flipZ).map(norm));
  });

  it('DIAMON: stejné dráhy, X v průměrech', async () => {
    const r = await run({}, CUP);
    // V DIAMON jsou X kontury i Bp průměry.
    const d = await run({ mode: 'DIAMON', safeX: 320 }, CUP.map(([z, x]) => [z, 2 * x]));
    const fr = floorMoves(r.gcode), fd = floorMoves(d.gcode);
    expect(fd && fd.length).toBe(fr.length);
    fr.forEach((l, i) => {
      const a = xz(l), b = xz(fd[i]);
      expect(b.z).toBe(a.z);
      if (a.x !== undefined) expect(parseFloat(b.x)).toBeCloseTo(2 * parseFloat(a.x), 2);
    });
  });

  it('díra zadaná válcem (ne z výkresu): dno se dobere, nic za stěnou ani pod dnem', async () => {
    const pts = [[0, 0], [0, 100], [143.274, 100], [143.274, 0]];   // plný válec ⌀200
    const r = await run({ boreSource: 'cylinder', boreDiameter: 137.93, boreDepth: 113.135, boreZStart: 143.274, borePreDiameter: 20, borePreDepth: 100 }, pts);
    const f = floorMoves(r.gcode);
    expect(f).not.toBeNull();
    const cut = f.filter(l => /\bG0?1\b/.test(l)).map(xz);
    // Řez nikdy za stěnu (R 68,965) ani pod dno (Z 30,139).
    for (const m of cut) {
      if (m.x !== undefined) expect(parseFloat(m.x)).toBeLessThanOrEqual(68.965 + 1e-6);
      if (m.z !== undefined) expect(parseFloat(m.z)).toBeGreaterThan(30.139);
    }
    expect(r.S.genNotes.some(n => /dno díry od Z/.test(n.msg))).toBe(false);
  });

  it('Fanuc i Heidenhain: program s fází dna vznikne a nemá NaN', async () => {
    for (const cs of ['fanuc', 'heidenhain']) {
      const r = await run({ controlSystem: cs }, CUP);
      expect(r.gcode).not.toMatch(/NaN|undefined/);
      expect(r.gcode).toMatch(/DNO DIRY/);
    }
  });

  it('předvrtání bez použitelného vrtáku: žádný zbytkový kužel ani fáze dna (stará hodnota borePreTip se nepoužije)', async () => {
    const r = await run({ borePreTip: 6.009, borePreDiameter: 20, borePreDepth: 106.6 }, CUP, []);   // zásobník bez vrtáku
    expect(r.S.params.borePreTip).toBe(0);
    expect(r.gcode).not.toMatch(/DNO DIRY/);
  });

  it('dno s plochou nad osou (prstenec místo dna k ose): fáze se nevydá a hlásí důvod', async () => {
    const ring = [[30.139, 20], [30.139, 68.965], [143.274, 68.965], [143.274, 144.971], [0, 144.971], [0, 0]];
    const r = await run({}, ring);
    expect(r.gcode).not.toMatch(/DNO DIRY/);
  });

  it('zaoblení v rohu dna (R5): dno se dobere, tyč nezajede do kontury ani do držáku', async () => {
    for (const dir of ['G2', 'G3']) {
      const pts = [[30.139, 0, 'G0'], [30.139, 63.965], [35.139, 68.965, dir, 5], [143.274, 68.965], [143.274, 144.971], [0, 144.971], [0, 0]]
        .map(([z, x, ty, rr], i) => ({ id: i + 1, type: ty || 'G1', x, z, r: rr || 0, mode: 'ABS' }));
      const r = await runCamProg({ params: common(), contourPoints: pts, stockPoints: [], toolMagazine: [drill(20, 145)] });
      expect(r.gcode).toMatch(/DNO DIRY/);
      const sp = r.calcSim.simPath, fi = boreFloorSplitIndex(sp, r.gcode);
      const fs = boreFloorSim(r.S, sp.slice(fi - 1), computeCalculation);
      expect(validateToolpath(fs.calcM.simPath, fs.params, fs.calcM.stockPathSegments, { planStock: true })).toEqual([]);
      // Zajetí do hotové kontury (v zrcadle dna): žádné.
      const mr = new MaterialRemoval(fs.params, fs.calcM.stockPathSegments);
      mr.advanceTo(fs.calcM.simPath, fs.calcM.simPath.length - 1);
      const cg = new ContourGouge(fs.params, fs.calcM.contourSegments, fs.calcM.stockPathSegments);
      const gouge = cg.valid ? cg.update(mr.model.loops) : [];
      const area = gouge.reduce((a, l) => a + Math.abs(l.reduce((s2, p, i) => { const q = l[(i + 1) % l.length]; return s2 + (p.x * q.z - q.x * p.z); }, 0) / 2), 0);
      expect(area).toBeLessThan(0.5);
    }
  });

  it('kolize tyče s dílem: zprava i zleva bez falešných nálezů (držák na správné straně)', async () => {
    for (const side of ['right', 'left']) {
      const pts = side === 'left' ? mirZ(CUP) : CUP;
      const r = await run({ roughingSide: side, safeX: 300, safeZ: 5, boreFinish: true }, pts);
      const sp = r.calcSim.simPath, i0 = preDrillSplitIndex(sp, r.gcode);
      expect(i0).toBeGreaterThan(5);
      expect(boreRealCollisions(r.S.params, sp.slice(i0), partLoopOf(r.calcSim))).toEqual([]);
      // A opačně: rychloposuv osou skrz plné dno se najde i zleva.
      const sg = side === 'left' ? -1 : 1;
      const bad = [{ x: 300, z: sg * 5, type: 'G0' }, { x: 9, z: sg * 5, type: 'G0', originalLineIdx: 1 }, { x: 9, z: sg * 150, type: 'G0', originalLineIdx: 2 }];
      expect(boreRealCollisions(r.S.params, bad, partLoopOf(r.calcSim)).length).toBeGreaterThan(0);
    }
  });

  it('jiná tyč (⌀25, vrták ⌀40): dno bez kolize držáku, bez zajetí do kontury, bez nálezů tyče s dílem', async () => {
    const b25 = buildIsoInternalKnife('BCL', { bar: 25 });
    const r = await runCamProg({ params: { ...common(), ...b25.tool, toolName: b25.name }, contourPoints: P(CUP), stockPoints: [], toolMagazine: [drill(40, 145)] });
    expect(r.gcode).toMatch(/DNO DIRY/);
    const sp = r.calcSim.simPath, fi = boreFloorSplitIndex(sp, r.gcode), i0 = preDrillSplitIndex(sp, r.gcode);
    const fs = boreFloorSim(r.S, sp.slice(fi - 1), computeCalculation);
    expect(validateToolpath(fs.calcM.simPath, fs.params, fs.calcM.stockPathSegments, { planStock: true })).toEqual([]);
    const mr = new MaterialRemoval(fs.params, fs.calcM.stockPathSegments);
    mr.advanceTo(fs.calcM.simPath, fs.calcM.simPath.length - 1);
    const cg = new ContourGouge(fs.params, fs.calcM.contourSegments, fs.calcM.stockPathSegments);
    const gouge = cg.valid ? cg.update(mr.model.loops) : [];
    const area = gouge.reduce((a, l) => a + Math.abs(l.reduce((s2, p, i) => { const q = l[(i + 1) % l.length]; return s2 + (p.x * q.z - q.x * p.z); }, 0) / 2), 0);
    expect(area).toBeLessThan(0.5);
    expect(boreRealCollisions(r.S.params, sp.slice(i0), partLoopOf(r.calcSim))).toEqual([]);
  });

  it('tyč s tělesem těsně u špičky (mezera 0,05): fáze dna se nevydá, hlásí důvod a zbylé dno', async () => {
    const thin = [{ x: 0.05, z: 2.6 }, { x: 180, z: 2.6 }, { x: 180, z: 18.6 }, { x: 0.05, z: 18.6 }, { x: 0.05, z: 2.6 }];
    const r = await run({ holderProfile: { sideA: thin, sideB: [] } });
    expect(r.gcode).not.toMatch(/DNO DIRY/);
    expect(r.S.genNotes.some(n => /mezera je menší než nejtenčí vrstva/.test(n.msg))).toBe(true);
    // Dno se přesto hlásí jako zbylé (nic tiše nezmizí).
    expect(r.S.genNotes.some(n => /dno díry od Z/.test(n.msg))).toBe(true);
  });

  it('zleva: Bp ve skutečném Z — Bp za dílem se nepoužije, Bp před čelem se zachová', async () => {
    const behind = await run({ roughingSide: 'left', safeX: 300, safeZ: 5 }, mirZ(CUP));
    const front = await run({ roughingSide: 'left', safeX: 300, safeZ: -170 }, mirZ(CUP));
    const firstZ = (g) => parseFloat(g.slice(g.indexOf('VYVRTAVANI ⌀')).split(String.fromCharCode(10)).find(l => /^N\d+ G0 Z-?\d/.test(l)).match(/Z(-?[\d.]+)/)[1]);
    expect(firstZ(behind.gcode)).toBeCloseTo(-(143.274 + 1 + 5), 0);   // před čelem díry, ne na Bp
    expect(firstZ(front.gcode)).toBeCloseTo(-170, 3);
  });
});

describe('náhled tyče (knifeThumb): příznak vnitřního nože', () => {
  it('katalogová tyč nese toolInternal; příznak má přednost před tvarem držáku, starý slot bez něj se pozná podle tvaru', async () => {
    const { isBoringBarLike } = await import('../js/calculators/knifeThumb.js');
    const { paramsFromMagSlot } = await import('../js/calculators/cam/toolSlotPreview.js');
    expect(bar.tool.toolInternal).toBe(true);
    expect(isBoringBarLike(bar.tool)).toBe(true);
    expect(isBoringBarLike({ ...bar.tool, toolInternal: false })).toBe(false);          // výslovně vnější
    const { toolInternal, ...old } = bar.tool;                                          // starý slot bez příznaku
    expect(isBoringBarLike(old)).toBe(true);                                            // tvar držáku
    expect(paramsFromMagSlot({ shape: 'polygon', internal: true }).toolInternal).toBe(true);
    expect(paramsFromMagSlot({ shape: 'polygon' }).toolInternal).toBeUndefined();
  });
});

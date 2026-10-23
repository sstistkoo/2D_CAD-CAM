// ╔══════════════════════════════════════════════════════════════╗
// ║  Čelní (axiální) zápich — Upich + ⊚ Čelní, pravidlo 19          ║
// ╚══════════════════════════════════════════════════════════════╝
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoFaceGroove, isoFaceGrooveFromName, isoFaceGrooveCount, FACE_GROOVE_RANGES } from '../js/calculators/isoFaceGrooves.js';
import { grooveFaceGeom } from '../js/calculators/cam/ops/grooveFace.js';
import { MaterialRemoval, insertWorldLoop } from '../js/calculators/cam/materialRemoval.js';
import { validateToolpath, holderWorldLoop } from '../js/calculators/cam/collisionValidator.js';
import { pointInLoop } from '../js/geom/geomCore.js';

const knife = (range = 1, width = 3) => buildIsoFaceGroove({ range, width });
// Díl ⌀80 s čelem Z 0, polotovar válec ⌀80 s přídavkem na čele 2 mm.
const contourPoints = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -50, r: 0, mode: 'ABS' },
];
const params = (k, over = {}) => ({
  machineType: 'LIMS=2000', mode: 'RADIUS', controlSystem: 'sinumerik', speed: 120, feed: 0.05,
  safeX: 150, safeZ: 5, roughingSide: 'right', rapidClearance: 1, retractDistance: 1, partingApproachFeed: 0.5,
  stockMode: 'cylinder', stockDiameter: 80, stockLength: 60, stockFace: 2,
  allowanceX: 0, allowanceZ: 0, finishAllowance: 0.2, doFinishing: true, partOffSmooth: true,
  ...k.tool, toolName: k.name,
  partOffZ: 0, partOffFace: true, faceGrooveD1: 32, faceGrooveD2: 40, faceGrooveDepth: 3,
  ...over,
});
const prog = (p) => ({ params: p, contourPoints, stockPoints: [], flipX: false, flipZ: false });
const solidAt = (loops, x, z) => loops.some(l => pointInLoop({ x, z }, l) === 'inside');

describe('katalog: čelní zapichovací nože', () => {
  it('destička natočená do čela: ostří k −Z, čepel a dřík k +Z, jméno nese rozsah a dosah', () => {
    const k = knife();
    expect(k.tool.toolAngle).toBe(-90);
    expect(isoFaceGrooveFromName(k.name)).toEqual({ w: 3, a: 6, dmin: 30, dmax: 45 });
    const ins = insertWorldLoop(k.tool);
    // MGMN300-M: šířka 3, rádius 0,4.
    expect(Math.min(...ins.map(q => q.z))).toBeCloseTo(-0.4, 6);      // ostří o rádius pod středem rohu
    expect(Math.max(...ins.map(q => q.x))).toBeCloseTo(0.4, 6);       // referenční roh = vnější
    expect(Math.min(...ins.map(q => q.x))).toBeCloseTo(-2.6, 6);      // šířka k ose
    const hol = holderWorldLoop(k.tool);
    expect(Math.min(...hol.map(q => q.z))).toBeGreaterThan(6);        // nic nad dosahem 6 pod čepelí
    expect(isoFaceGrooveCount()).toBeGreaterThan(FACE_GROOVE_RANGES.length);
  });
});

describe('geometrie čelního zápichu', () => {
  it('2 zápichy radiálně (krok ≤ 0,8 × 3), dno s přídavkem, dokončení stěna → dno → stěna', () => {
    const g = grooveFaceGeom(params(knife()));
    expect(g.ok).toBe(true);
    // Rádius destičky 0,4: střed vnějšího rohu = 16 + u + 3 − 0,4.
    expect(g.plunges.map(v => +v.toFixed(6))).toEqual([18.8, 19.4]);
    expect(g.zRough).toBeCloseTo(-2.4, 6);
    expect(g.zFinal).toBeCloseTo(-2.6, 6);
    expect(g.xFinA).toBeCloseTo(18.6, 6);
    expect(g.xFinB).toBeCloseTo(19.6, 6);
  });
  it('mimo rozsah čepele / hlubší než dosah / užší než destička → hlášení', () => {
    expect(grooveFaceGeom(params(knife(), { faceGrooveD1: 26 })).reason).toMatch(/neleží v rozsahu čepele ⌀30–45/);
    expect(grooveFaceGeom(params(knife(), { faceGrooveDepth: 7 })).reason).toMatch(/čepel dosáhne \(6 mm\)/);
    expect(grooveFaceGeom(params(knife(), { faceGrooveD2: 37 })).reason).toMatch(/užší/);
  });
  it('vnější upichovák (nenatočený) do čela nejde', () => {
    const k = knife();
    expect(grooveFaceGeom(params({ ...k, tool: { ...k.tool, toolAngle: 0 } })).ok).toBe(false);
  });
});

describe('program a simulace čelního zápichu', () => {
  it('zápichy osově do čela, dokončení, úběr jen v zápichu, bez kolizí', async () => {
    const r = await runCamProg(prog(params(knife())));
    expect(r.gcode).toContain('CELNI ZAPICH');
    expect(r.gcode).not.toMatch(/^; ! /m);
    expect(r.errorsSim.map(e => e.msg)).toEqual([]);
    expect(validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments, { planStock: true })).toEqual([]);
    const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments);
    rm.advanceTo(r.calcSim.simPath, r.calcSim.simPath.length - 1);
    const L = rm.model.loops;
    expect(solidAt(L, 18, -1.5)).toBe(false);      // zápich vybraný
    expect(solidAt(L, 15.9, -1.5)).toBe(true);     // vnitřní stěna ⌀32 na míru
    expect(solidAt(L, 16.1, -1.5)).toBe(false);
    expect(solidAt(L, 19.9, -1.5)).toBe(false);    // vnější stěna ⌀40 na míru
    expect(solidAt(L, 20.1, -1.5)).toBe(true);
    expect(solidAt(L, 18, -2.9)).toBe(false);      // dno na Z −3
    expect(solidAt(L, 18, -3.1)).toBe(true);
    expect(solidAt(L, 30, -1)).toBe(true);         // čelo vedle nedotčené
  });
  it('se sražením 0,5: hrany u čela sražené, bez kolizí', async () => {
    const r = await runCamProg(prog(params(knife(), { grooveChamfer: 0.5 })));
    expect(r.gcode).toContain('Dokončení se sražením 0.5×45°');
    expect(validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments, { planStock: true })).toEqual([]);
    const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments);
    rm.advanceTo(r.calcSim.simPath, r.calcSim.simPath.length - 1);
    const L = rm.model.loops;
    expect(solidAt(L, 15.85, -0.15)).toBe(false);  // sražení u ⌀32
    expect(solidAt(L, 15.6, -0.4)).toBe(true);
    expect(solidAt(L, 20.15, -0.15)).toBe(false);  // sražení u ⌀40
    expect(solidAt(L, 20.4, -0.4)).toBe(true);
  });
  it('zleva = zrcadlo v Z (čelo na −Z, zápich do +Z)', () => {
    const g = grooveFaceGeom(params(knife(), { roughingSide: 'left', partOffZ: -50 }));
    expect(g.ok).toBe(true);
    expect(g.zFinal).toBeCloseTo(-47.4, 6);
  });
  it('peckování osově: výjezdy nad čelo', async () => {
    const { gcode } = await runCamProg(prog(params(knife(), { partOffSmooth: false, retractDistance: 1 })));
    expect((gcode.match(/Vyjezd – uvolnění třísek/g) || []).length).toBeGreaterThan(2);
  });
});

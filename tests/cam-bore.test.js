// ╔══════════════════════════════════════════════════════════════╗
// ║  Vyvrtávání (operace Vyvrtávání, cam/ops/bore.js)              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pravidlo 13 (docs/cam-pravidla.md): vnitřní obrábění = zrcadlo vnějšího
// v ose X. Díra se překlopí (r' = R_ref − r), spočítá se obyčejné vnější
// hrubování a řádky se překlopí zpátky. Hlídá se:
//   • dráhy jen v díře — mezi předvrtáním (minus vůle) a stěnou díry
//     (minus přídavek a rádius nosu), nic za dnem,
//   • vrstvy po ap, poslední na dně, konec programu radiálně v díře → ven,
//   • průměry (DIAMON) i poloměry, Sinumerik i Fanuc dávají tytéž dráhy,
//   • tyč, která se do předvrtání nevejde, nejede (pravidlo 13),
//   • simulace v zrcadle: ⛔ validátor bez nálezů (ve skutečném světě bez
//     předvrtání by rychloposuvy hlásil), úběr vybere celou díru.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife, isoBoringBarDiameter } from '../js/calculators/isoInternalTools.js';
import { boreGeom, unmirrorBoreLine, boreMirrorSim } from '../js/calculators/cam/ops/bore.js';
import { computeCalculation } from '../js/calculators/cam/calculatePipeline.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { polyArea, polyIntersect } from '../js/geom/geomCore.js';

const bar20 = buildIsoInternalKnife('BCL', { bar: 20 }).tool;   // S20S-PCLNR09, CNMG 09, rε 0,8, Dmin 25
const base = {
  mode: 'DIAMON', speed: 180, feed: 0.2, depthOfCut: 1.5, retractDistance: 1, allowanceX: 0.3, allowanceZ: 0.1,
  noStepRoughing: true, stockMode: 'cylinder', stockDiameter: 62, stockLength: 45, stockFace: 1, safeX: 100, safeZ: 5,
  controlSystem: 'sinumerik', ...bar20,
  boreActive: true, boreZStart: 0, boreDiameter: 40, boreDepth: 30, borePreDiameter: 25, borePreDepth: 35,
};
// Vnější kontura (trubka ⌀60 × 40) — vyvrtávání ji nečte.
const contour = (k) => [[0, 0], [0, 30], [-40, 30], [-40, 0]]
  .map(([z, r], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x: r * k, z, r: 0, mode: 'ABS' }));
const prog = (over = {}) => {
  const params = { ...base, ...over };
  return { params, contourPoints: contour(params.mode === 'DIAMON' ? 2 : 1), stockPoints: [] };
};

// Pohyby těla VYVRTAVANI → [{ g, x (POLOMĚR), z, line }].
function moves(gcode, k) {
  const out = [];
  let x = null, z = null, on = false;
  for (const l of gcode.split('\n')) {
    if (l.includes('VYVRTAVANI')) on = true;
    if (!on) continue;
    if (/\bM30\b/.test(l)) break;
    const code = l.split(/[;(]/)[0];
    const g = (code.match(/\bG0?([0-3])\b/) || [])[1];
    const mx = code.match(/X(-?\d*\.?\d+)/), mz = code.match(/Z(-?\d*\.?\d+)/);
    if (mx) x = parseFloat(mx[1]) / k;
    if (mz) z = parseFloat(mz[1]);
    if (g !== undefined && (mx || mz)) out.push({ g: +g, x, z, line: l });
  }
  return out;
}

describe('vyvrtávání válcové díry ⌀40 × 30 z předvrtání ⌀25 × 35 (S20S-PCLNR09)', () => {
  it('dráhy jen v díře, vrstvy po ap, poslední na dně, konec radiálně v díře a ven', async () => {
    const { gcode } = await runCamProg(prog());
    const mv = moves(gcode, 2);
    const cuts = mv.filter(m => m.g === 1);
    expect(cuts.length).toBeGreaterThan(4);
    const g = boreGeom(base);
    const xWall = 20 - 0.3 - 0.8;            // stěna − přídavek X − rε (střed nosu)
    for (const m of mv.filter(q => q.z < 0)) {
      expect(m.x, m.line).toBeGreaterThanOrEqual(g.rIn - 1e-3);
      expect(m.x, m.line).toBeLessThanOrEqual(xWall + 1e-3);
      expect(m.z, m.line).toBeGreaterThanOrEqual(-30 + 0.1 - 1e-3);
    }
    // Žádný G1 mimo díru (vnější hrubování se nevydalo).
    for (const l of gcode.split('\n').filter(q => /^N\d+ G0?1\b/.test(q))) {
      const mx = l.match(/X(-?\d*\.?\d+)/);
      if (mx) expect(parseFloat(mx[1]) / 2, l).toBeLessThanOrEqual(xWall + 1e-3);
    }
    // Vrstvy = axiální řezy na stálém X: rozestup nejvýš ap, poslední na dně.
    const layers = [...new Set(cuts.filter((m, i) => i > 0 && m.line.includes('Z') && !m.line.match(/X/)).map(m => m.x.toFixed(3)))]
      .map(Number).sort((a, b) => a - b);
    expect(layers[layers.length - 1]).toBeCloseTo(xWall, 3);
    for (let i = 1; i < layers.length; i++) expect(layers[i] - layers[i - 1]).toBeLessThanOrEqual(1.5 + 1e-6);
    // Konec: v díře radiálně na bezpečný poloměr, ven v Z, pak bezpečná poloha.
    const tail = mv.slice(-3);
    expect(tail[0].g).toBe(0); expect(tail[0].x).toBeCloseTo(g.rIn, 3);
    expect(tail[1].z).toBeCloseTo(5, 3);
    expect(tail[2].x).toBeCloseTo(50, 3);
  });

  it('průměry i poloměry, Sinumerik i Fanuc — tytéž dráhy', async () => {
    const a = moves((await runCamProg(prog())).gcode, 2);
    const b = moves((await runCamProg(prog({ mode: 'RADIUS', controlSystem: 'fanuc', safeX: 50 }))).gcode, 1);
    expect(b.length).toBe(a.length);
    a.forEach((m, i) => { expect(b[i].g).toBe(m.g); expect(b[i].x).toBeCloseTo(m.x, 3); expect(b[i].z).toBeCloseTo(m.z, 3); });
  });

  it('pravidlo 13: tyč, která se do předvrtání nevejde, nejede a nahlásí se', async () => {
    const g = boreGeom({ ...base, borePreDiameter: 20 });
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/nevejde/);
    const res = await runCamProg(prog({ borePreDiameter: 20 }));
    expect(moves(res.gcode, 2).filter(m => m.g === 1)).toEqual([]);
    expect(res.S.genNotes.some(n => /nevejde/.test(n.msg))).toBe(true);
  });

  it('simulace v zrcadle: ⛔ validátor bez nálezů, úběr vybere celou díru', async () => {
    const res = await runCamProg(prog());
    const simPath = res.calcSim.simPath;
    const sim = boreMirrorSim(res.S, simPath, computeCalculation);
    expect(sim).not.toBeNull();
    const issues = validateToolpath(sim.calcM.simPath, sim.params, sim.calcM.stockPathSegments, { backside: false, planStock: true });
    expect(issues).toEqual([]);
    // Ve skutečném světě bez předvrtání by tytéž rychloposuvy v díře šly „materiálem".
    const real = validateToolpath(simPath, res.params, res.calcSim.stockPathSegments, { backside: false, planStock: true });
    expect(real.some(it => it.kind === 'rapid')).toBe(true);
    // Úběr: v pásu díry (předvrtání → stěna − přídavek − 0,05) nezůstane nic.
    const rm = new MaterialRemoval(sim.params, sim.calcM.stockPathSegments);
    expect(rm.valid).toBe(true);
    rm.advanceTo(sim.calcM.simPath, sim.calcM.simPath.length - 1);
    const left = sim.un(rm.model.loops);
    const band = [{ x: 12.5, z: 0 }, { x: 19.65, z: 0 }, { x: 19.65, z: -29.4 }, { x: 12.5, z: -29.4 }];
    expect(Math.abs(polyArea(polyIntersect(left, [band])))).toBeLessThan(0.5);
  });
});

describe('vyvrtávání — zadání a převod řádků', () => {
  it('boreGeom hlídá zadání (⌀, hloubky, nástroj); zleva je platné', () => {
    expect(boreGeom(base).ok).toBe(true);
    expect(boreGeom({ ...base, boreDiameter: 24 }).reason).toMatch(/není větší/);
    expect(boreGeom({ ...base, boreDepth: 40 }).reason).toMatch(/hlubší/);
    expect(boreGeom({ ...base, roughingSide: 'left' }).ok).toBe(true);   // zleva od 8. 10. (cam-bore-left)
    expect(boreGeom({ ...base, toolShape: 'drill' }).reason).toMatch(/vyvrtávací tyč/);
    expect(boreGeom({ ...base, borePreDiameter: 0 }).reason).toMatch(/předvrtání/);
  });

  it('řádek ze zrcadla: X = k·R_ref − X′, G2↔G3, komentář beze změny', () => {
    expect(unmirrorBoreLine('N10 G2 X10.000 Z-5 CR=2.000 ; G3 X1', 50)).toBe('N10 G3 X40.000 Z-5 CR=2.000 ; G3 X1');
    expect(unmirrorBoreLine('G03 X0 Z1 R2', 50)).toBe('G02 X50.000 Z1 R2');
    expect(unmirrorBoreLine('N20 G0 Z2.800', 50)).toBe('N20 G0 Z2.800');
    expect(unmirrorBoreLine('G1 X50 ( Konec )', 50)).toBe('G1 X0.000 ( Konec )');
  });

  it('průměr vyvrtávací tyče z jejího jména', () => {
    expect(isoBoringBarDiameter('S20S-PCLNR09')).toBe(20);
    expect(isoBoringBarDiameter('S10K-SCLCR06')).toBe(10);
    expect(isoBoringBarDiameter('PCLNR2525M12')).toBeNull();
    expect(isoBoringBarDiameter('')).toBeNull();
  });
});

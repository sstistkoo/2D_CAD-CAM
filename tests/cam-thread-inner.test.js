// ╔══════════════════════════════════════════════════════════════╗
// ║  Vnitřní závit — nájezd a výjezd ústím díry, simulace          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Doplnění pravidla 13 (docs/cam-pravidla.md, schválil uživatel 22. 10. 2026):
// do díry jen přes ústí — před ústí i čelo polotovaru, k ose na odskok,
// teprve pak na Z startu; ven stejně. Dřív se jelo šikmo z bezpečné polohy
// na start a zpátky — u závitu hlouběji v díře by tyč projela stěnou.
// Simulace: nůž obrácený radiálně (toolRadialFlip.js), polotovar s dírou
// ⌀(D − 2H) (sim/grooveSim.js).
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife } from '../js/calculators/isoInternalTools.js';
import { simStockArgs } from '../js/calculators/cam/sim/grooveSim.js';
import { validateToolpath, holderWorldLoop } from '../js/calculators/cam/collisionValidator.js';
import { radialFlip } from '../js/calculators/cam/toolRadialFlip.js';

const knife = buildIsoInternalKnife('BTH', { bar: 12 });   // SNR0012M11, Dmin 16
// Díl ⌀80 × 60, polotovar s čelem Z0, závit M20×2,5 od ústí Z0 do Z −20
// (starý šikmý výjezd z Z −20 do bezpečné polohy vedl stěnou díry).
const params = (over = {}) => ({
  machineType: 'LIMS=2000', mode: 'RADIUS', controlSystem: 'sinumerik', speed: 100, feed: 0.2,
  safeX: 150, safeZ: 5, roughingSide: 'right', rapidClearance: 1,
  stockMode: 'cylinder', stockDiameter: 80, stockLength: 60, stockFace: 0,
  ...knife.tool, toolName: knife.name,
  threadActive: true, threadExternal: false, threadName: 'M20', threadType: 'mc',
  threadDiameter: 20, threadPitch: 2.5, threadAngle: 60, threadDepth: 1.353,
  threadZStart: 0, threadZEnd: -20, threadRunIn: 3, threadRunOut: 0,
  threadPasses: 5, threadSpringPasses: 1, threadTaperRatio: 0, threadInfeed: 'radial',
  ...over,
});
const contourPoints = [
  { id: 1, type: 'G0', x: 10, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -60, r: 0, mode: 'ABS' },
];
const prog = (p) => ({ params: p, contourPoints, stockPoints: [], flipX: false, flipZ: false });
/** Pohyby G0/G33 bloku závitu (modálně doplněné). */
function moves(gcode) {
  const out = [];
  let x = null, z = null, on = false;
  for (const l of gcode.split('\n')) {
    if (l.includes('ZAVITOVANI')) on = true;
    if (!on || l.includes('KONTURA')) { if (on && l.includes('KONTURA')) break; continue; }
    const m = /\b(G0|G1|G33)\b/.exec(l);
    if (!m) continue;
    const mx = /X(-?[\d.]+)/.exec(l), mz = /Z(-?[\d.]+)/.exec(l);
    if (mx) x = parseFloat(mx[1]);
    if (mz) z = parseFloat(mz[1]);
    out.push({ g: m[1], x, z, text: l });
  }
  return out;
}

describe('vnitřní závit v díře', () => {
  it('nájezd i výjezd osou přes ústí, nikdy šikmo přes stěnu', async () => {
    const { gcode } = await runCamProg(prog(params()));
    const mv = moves(gcode);
    const rHole = 10 - 1.353;
    // 1) před ústí a čelo polotovaru: náběh Z3 + vůle 2 + 1 + kam tyč SNR
    //    sahá za špičku do díry; 2) k ose; 3) na Z startu (0 + 3 náběh).
    const zOut = mv[0].z;
    expect(mv[0].g).toBe('G0');
    expect(zOut).toBeGreaterThan(6 + 5);
    expect(mv[1].x).toBeLessThan(rHole);
    expect(mv[2].z).toBeCloseTo(3, 3);
    // Rychloposuvy v díře (Z < 0) jen osově; podél Z jen pod stěnou díry
    // (radiální odskok ze závitu vede z hotového profilu k ose).
    for (let i = 1; i < mv.length; i++) {
      const a = mv[i - 1], b = mv[i];
      if (b.g !== 'G0' || b.text.includes('Bezpečná')) continue;
      if (Math.min(a.z, b.z) >= 0) continue;
      expect(a.x === b.x || a.z === b.z, b.text).toBe(true);
      if (a.z !== b.z) expect(b.x, b.text).toBeLessThan(rHole);
    }
    const iOut = mv.findIndex(m => m.text.includes('Ven z díry'));
    expect(iOut).toBeGreaterThan(0);
    expect(mv[iOut].z).toBe(zOut);
    expect(mv[iOut + 1].text).toContain('Bezpečná');
  });

  it('vnější závit beze změny (šikmý nájezd z bezpečné polohy)', async () => {
    const { gcode } = await runCamProg(prog(params({ threadExternal: true, threadZStart: 0, threadZEnd: -20, toolInternal: false })));
    expect(gcode).not.toContain('Před ústí díry');
    expect(gcode).toMatch(/G0 X[\d.]+ Z3\.000 ; Nájezd před závit/);
  });

  it('simulace: tyč k ose, polotovar s dírou, validátor bez kolizí', async () => {
    const { calcSim, S } = await runCamProg(prog(params()));
    expect(radialFlip(S.params)).toBe(true);
    expect(Math.min(...holderWorldLoop(S.params).map(q => q.x))).toBeLessThan(-6);   // tyč ⌀12 k ose
    const [sp, segs] = simStockArgs(S, calcSim);
    expect(sp.stockMode).toBe('casting');
    expect(validateToolpath(calcSim.simPath, sp, segs, { planStock: true })).toEqual([]);
  });
});

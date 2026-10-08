// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – poslední vrstva na plošinách vedle nedosažitelného      ║
// ║  zápichu (polygon, „bez schodků", pravidlo 3)                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nález 8. 10. 2026: zápich se svislými stěnami, kam destička (CCMT/DCMT,
// natočení 5°) dosáhne jen po mezní čáře. Na dně nesmí zůstat víc než
// přídavek — a na plošinách vedle zápichu zůstávala celá poslední vrstva:
//
//  1. Vnější hřídel ⌀30 se zápichem ⌀24 × 6: rampa dojezdu vrstvy X 15
//     přejela zápich, dosedla na jeho protější stěnu a skončila — plošina
//     za zápichem zůstala 0,3 mm nad přídavkem (klíč `leadOutPastRampWall`).
//  2. Vyvrtávání ⌀30 s vybráním ⌀36 (vnitřní svět = vnější zrcadlo): hlubší
//     hloubka nevydala nic a bisekce poslední vrstvy vybrala hloubku 0,01 mm
//     pod plošinou, na které sken plošinu zablokoval, `blockedAt` ne — vrstva
//     jela jen ve vybrání a obě plošiny zůstaly 0,3 mm nad přídavkem
//     (`realStockLayers`). Vrstva rovně přes vybrání pak nechala klín
//     0,5 mm nad dosažitelným dnem (`closingLayerTracesFloor`).
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { offsetSilhouetteLoop } from '../js/calculators/cam/toolEnvelope.js';
import { topXOnLoop } from '../js/calculators/cam/camMath.js';
import { polyOffset } from '../js/geom/geomCore.js';
import { buildIsoInternalKnife } from '../js/calculators/isoInternalTools.js';
import { boreMirrorState } from '../js/calculators/cam/ops/bore.js';

// [z, x] → body programu
const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));

// Nejvyšší zbytek nad dílem + přídavkem v Z-rozsahu (jako P3 „zbytek na dně"
// v scripts/cam_rules_check.mjs, viz cam-round-layers-floor.test.js).
function maxLeftover(r, zLo, zHi) {
  const prm = r.params;
  const rm = new MaterialRemoval(prm, r.calcSim.stockPathSegments, {});
  rm.advanceTo(r.calcSim.simPath, r.calcSim.simPath.length - 1);
  const part = offsetSilhouetteLoop(r.calc.contourSegments);
  const allow = Math.max(parseFloat(prm.allowanceX) || 0, parseFloat(prm.allowanceZ) || 0);
  const o = polyOffset([part], allow);
  const allowLoop = o && o[0] ? o.sort((u, v) => v.length - u.length)[0] : part;
  let worst = 0;
  for (let z = zLo; z <= zHi; z += 0.25) {
    const pt = topXOnLoop(allowLoop, z);
    let top = null;
    for (const l of rm.model.loops) { const t = topXOnLoop(l, z); if (t !== null && (top === null || t > top)) top = t; }
    if (pt !== null && top !== null) worst = Math.max(worst, top - pt);
  }
  return worst;
}

const HOLDER = {
  holderLength: 125, holderWidth: 20, holderHand: 'R', knifeAngle: 270, holderInflate: 0, holderInflateAll: false,
  holderProfile: { sideA: [{ x: 8.27, z: 1.326 }, { x: 24.602, z: 8.941 }, { x: 24.602, z: 125 }, { x: 4.602, z: 125 },
    { x: 4.602, z: 26 }, { x: 3.818, z: 26 }, { x: 1.326, z: 8.27 }, { x: 8.27, z: 1.326 }], sideB: [] },
};

describe('CAM: poslední vrstva vedle nedosažitelného zápichu (polygon)', () => {
  it('vnější zápich ⌀24 × 6: dojezd po rampě pokračuje za zápichem po plošině', async () => {
    const params = {
      mode: 'RADIUS', speed: 180, feed: 0.2, depthOfCut: 1, retractDistance: 1, allowanceX: 0.3, allowanceZ: 0.1,
      noStepRoughing: true, roughingStrategy: 'longitudinal', roughingSide: 'right', stockMode: 'cylinder',
      stockDiameter: 40, stockLength: 32, stockFace: 0, safeX: 30, safeZ: 5, partOffZ: null,
      toolShape: 'polygon', toolLength: 9.67, toolAngle: 5, toolTipAngle: 80, toolRadius: 0.4, toolTipFlat: 0.1,
      toolTipMirror: false, toolVbdCode: 'CCMT09T304', toolClearanceAngle: 7, ...HOLDER,
    };
    const contour = [[0, 0], [0, 15], [-10, 15], [-10, 12], [-16, 12], [-16, 15], [-30, 15], [-30, 20], [-32, 20]];
    const r = await runCamProg({ params, contourPoints: P(contour), stockPoints: [] });
    // Plošina před zápichem i za ním (mimo náběh rohů).
    expect(maxLeftover(r, -9.5, -0.5)).toBeLessThan(0.05);
    expect(maxLeftover(r, -28.5, -17)).toBeLessThan(0.05);
  });

  for (const shape of ['BCL', 'BDU']) {
    it(`vyvrtávání ⌀30 s vybráním ⌀36 (${shape}): poslední vrstva přes obě plošiny i po dně vybrání`, async () => {
      const bar = buildIsoInternalKnife(shape, { bar: 16 });
      const params = {
        mode: 'RADIUS', speed: 180, feed: 0.2, depthOfCut: 1, retractDistance: 1, allowanceX: 0.3, allowanceZ: 0.1,
        noStepRoughing: true, stockMode: 'cylinder', stockDiameter: 62, stockLength: 42, stockFace: 1, safeX: 50,
        safeZ: 5, controlSystem: 'sinumerik', ...bar.tool, boreActive: true, boreSource: 'cad',
        borePreDiameter: 22, borePreDepth: 35,
      };
      const S = {
        params, contourPoints: P([[0, 0], [0, 30], [-40, 30], [-40, 0]]),
        borePoints: P([[0, 15], [-10, 15], [-10, 18], [-16, 18], [-16, 15], [-30, 15], [-30, 11]]),
        zLimits: {}, flipX: false, flipZ: false, toolMagazine: [],
      };
      // Vnitřní svět = vnější hrubování zrcadla (pravidlo 13) — měří se tam.
      const { S2 } = boreMirrorState(S);
      const r = await runCamProg({ params: S2.params, contourPoints: S2.contourPoints, stockPoints: [], xLimits: S2.xLimits });
      expect(maxLeftover(r, -9, -1)).toBeLessThan(0.05);
      expect(maxLeftover(r, -28.5, -17)).toBeLessThan(0.05);
      // Ve vybrání sjede poslední vrstva po mezní čáře až na protější stěnu.
      const floorX = Math.min(...r.calc.offsetPath.filter(s => s.p1.z < -10.5 && s.p1.z > -15.6).map(s => s.p1.x));
      const reach = r.calc.passes.some(p => (p.contourLeadOut || []).some(s => Math.abs(s.x2 - floorX) < 0.02 && s.z2 < -15.4));
      expect(reach, `vrstva nesjela na dno vybrání X ${floorX.toFixed(3)}`).toBe(true);
    });
  }
});

// Kontrola počátečního bodu (cam/startCheck.js): nástroj nesmí začínat v materiálu.
// Uživatel 9. 10. 2026 (vrták Bp X150 Z5 u dílu ⌀290, odlitek jen čárou).
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { startInMaterial } from '../js/calculators/cam/startCheck.js';

const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
const CUP = [[30.139, 0], [30.139, 68.965], [143.274, 68.965], [143.274, 144.971], [0, 144.971], [0, 0]];
const drillTool = { shape: 'drill', toolShape: 'drill', toolRadius: 10, toolTipAngle: 118, toolLength: 145, toolAngle: 0,
  holderLength: 80, holderWidth: 40, toolClearanceAngle: 0, holderProfile: null, respectInsertGeometry: true };
const prog = (over) => ({
  params: { mode: 'RADIUS', controlSystem: 'sinumerik', speed: 25, feed: 0.26, depthOfCut: 2, retractDistance: 2,
    allowanceX: 0.5, allowanceZ: 0.5, roughingStrategy: 'longitudinal', roughingSide: 'right', machineType: 'LIMS=2000',
    stockMode: 'casting', safeX: 150, safeZ: 5, drillActive: true, drillZStart: null, drillDepth: 50, drillPeck: 5,
    drillChipMode: 'clear', drillRetract: 1, drillClearance: 2, toolName: 'Vrtak', ...drillTool, ...over },
  contourPoints: P(CUP), stockPoints: [{ id: 1, type: 'G0', x: 68.965, z: 143.274, r: 0, mode: 'ABS' }, { id: 2, type: 'G1', x: 0, z: 143.274, r: 0, mode: 'ABS' }],
});

describe('kontrola počátečního bodu', () => {
  it('vrták Ø20 s vyložením 145 v Bp X150 Z5 leží v dílu ⌀290 — nahlásí se', async () => {
    const r = await runCamProg(prog({}));
    const hit = startInMaterial(r.S.params, r.calcSim, {});
    expect(hit).not.toBeNull();
    expect(hit.what).toMatch(/dílu/);
    expect(hit.z).toBeCloseTo(5, 6);
  });

  it('Bp nad dílem (X200) je mimo materiál — nic se nehlásí', async () => {
    const r = await runCamProg(prog({ safeX: 200 }));
    expect(startInMaterial(r.S.params, r.calcSim, {})).toBeNull();
  });
});

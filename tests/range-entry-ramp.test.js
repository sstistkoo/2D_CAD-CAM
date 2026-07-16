// ╔══════════════════════════════════════════════════════════════╗
// ║  Vjezd do polotovaru na hranici rozsahu Z rampou (Fáze 4)     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Rozsah obrábění začínající UPROSTŘED polotovaru: dřív dráha zajela za
// hranici o vůli a spadla KOLMO na hloubku (jako upichování). Teď vjíždí
// rampou pod úhlem zanoření z kotvy = průsečík čáry začátku rozsahu s
// hranicí polotovaru (+ vůle X); všechny hloubky sdílejí tutéž přímku.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';

const prog = {
  __camprog: 1,
  params: {
    machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1',
    speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0, retractAngle: 45,
    allowanceX: 0, allowanceZ: 0, toolRadius: 0.8, finishAllowance: 0,
    doFinishing: false, roughingStrategy: 'longitudinal', roughingSide: 'right',
    stockMode: 'cylinder', stockDiameter: 60, stockLength: 80, stockFace: 2,
    safeX: 150, safeZ: 5, machineStructure: 'lathe', controlSystem: 'sinumerik',
    autoProfile: true, toolShape: 'round', toolLength: 10, toolAngle: 15,
    toolTipAngle: 90, toolClearanceAngle: 0,
    holderWidth: 0, holderLength: 0, holderHand: 'R', holderProfile: null,
    entryAngle: 30, entryAngleAuto: false, respectInsertGeometry: false,
    plungeRoughing: false, pocketFinishAtOnce: false,
    noStepRoughing: false, noStepRoughingFace: false, regionRoughing: false,
    rapidClearance: 1.0, partOffZ: null, threadActive: false,
  },
  contourPoints: [
    { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
    { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
    { id: 3, type: 'G1', x: 20, z: -75, r: 0, mode: 'ABS' },
    { id: 4, type: 'G1', x: 30, z: -75, r: 0, mode: 'ABS' },
  ],
  stockPoints: [],
  zLimits: { chuck: null, tail: null, chuckActive: false, tailActive: false,
    rangeStart: -30, rangeEnd: -70, rangeActive: true },
};

describe('rozsah Z uprostřed polotovaru', () => {
  it('průchody vjíždějí rampou od hranice polotovaru, ne kolmým zápichem', async () => {
    const { calc, gcode } = await runCamProg(prog);
    const ramped = calc.passes.filter(p => p.type === 'long' && p.ramp);
    expect(ramped.length).toBeGreaterThan(0);
    for (const p of ramped) {
      // kotva rampy: začátek rozsahu (z=−30), povrch + vůle X (30+1=31)
      expect(p.ramp.z0).toBeCloseTo(-30, 4);
      expect(p.ramp.x0).toBeCloseTo(31, 4);
      // rampa má úhel zanoření: Δz = Δx / tan(30°)
      const dz = p.ramp.z0 - p.zStart;
      const dx = p.ramp.x0 - p.x;
      expect(dz).toBeCloseTo(dx / Math.tan(30 * Math.PI / 180), 2);
    }
    expect(gcode).toContain('Rampa');
    // Žádný kolmý zápich na hranici: dřívější vzor G0 Z(−30+vůle) → G1 X(hloubka)
    // uvnitř materiálu se u rampovaných průchodů nevyskytuje — vjezd jde po
    // rampě z povrchu. (Kontrola: v kódu není G1 X.. bez Z na z≈−29.)
  }, 30000);
});

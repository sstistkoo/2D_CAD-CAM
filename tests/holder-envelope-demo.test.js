// ╔══════════════════════════════════════════════════════════════╗
// ║  Fáze 3a: obálka držáku — hrubování demo dílu musí být bez   ║
// ║  kolizí držáku (křížová kontrola validátorem z Fáze 2)       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Spustí REÁLNÝ pipeline (kontura → dráhy → G-kód) nad výchozím demo
// dílem s obdélníkovým držákem 20×200 a zapnutým „Hlídat geometrii",
// a nechá vygenerované dráhy zkontrolovat nezávislým validátorem
// (collisionValidator). HRUBOVACÍ část programu nesmí obsahovat žádnou
// kolizi držáku — konce průchodů hlídá obálka (silueta ⊕ −držák) +
// schodová podmínka. Dokončování zatím obálku nemá (Fáze 3b) — jeho
// nálezy se z asserce vylučují.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const demoProg = {
  __camprog: 1,
  params: {
    machineType: 'LIMS=2000', mode: 'DIAMON', toolName: 'ROUGHER_T1',
    speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0, retractAngle: 45,
    allowanceX: 0.5, allowanceZ: 0.1, toolRadius: 0.8, finishAllowance: 0,
    doFinishing: true, roughingStrategy: 'longitudinal', roughingSide: 'right',
    stockMode: 'cylinder', stockMargin: 5.0, stockDiameter: 100, stockLength: 100,
    stockFace: 2.0, safeX: 150, safeZ: 5, machineStructure: 'lathe',
    controlSystem: 'sinumerik', autoProfile: true, toolShape: 'round',
    toolLength: 10, toolAngle: 15, toolTipAngle: 90, toolClearanceAngle: 0,
    holderWidth: 20, holderLength: 200, holderHand: 'R', holderProfile: null,
    entryAngle: 30, entryAngleAuto: true,
    respectInsertGeometry: true, plungeRoughing: false, pocketFinishAtOnce: false,
    noStepRoughing: false, noStepRoughingFace: false, regionRoughing: false,
    rapidClearance: 1.0, partOffZ: null, threadActive: false,
  },
  // Výchozí demo kontura (S.contourPoints v camSimulator.js)
  contourPoints: [
    { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
    { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
    { id: 3, type: 'G1', x: 20, z: -15, r: 0, mode: 'ABS' },
    { id: 4, type: 'G1', x: 30, z: -15, r: 0, mode: 'ABS' },
    { id: 5, type: 'G1', x: 35, z: -25, r: 0, mode: 'ABS' },
    { id: 6, type: 'G1', x: 35, z: -40, r: 0, mode: 'ABS' },
    { id: 7, type: 'G2', x: 55, z: -50, r: 10, mode: 'ABS' },
    { id: 8, type: 'G1', x: 55, z: -55, r: 0, mode: 'ABS' },
    { id: 81, type: 'G1', x: 45, z: -55, r: 0, mode: 'ABS' },
    { id: 82, type: 'G1', x: 45, z: -60, r: 0, mode: 'ABS' },
    { id: 83, type: 'G1', x: 55, z: -60, r: 0, mode: 'ABS' },
    { id: 9, type: 'G1', x: 55, z: -65, r: 0, mode: 'ABS' },
    { id: 10, type: 'G3', x: 65, z: -75, r: 12, mode: 'ABS' },
    { id: 11, type: 'G1', x: 80, z: -100, r: 0, mode: 'ABS' },
  ],
  stockPoints: [
    { id: 101, type: 'G0', x: 85, z: 2, r: 0, mode: 'ABS' },
    { id: 102, type: 'G1', x: 85, z: -105, r: 0, mode: 'ABS' },
    { id: 103, type: 'G1', x: 0, z: -105, r: 0, mode: 'ABS' },
  ],
};

describe('obálka držáku na demo dílu (Fáze 3a)', () => {
  it('hrubování je bez kolizí držáku a bez rychloposuvů materiálem', async () => {
    // calcSim = druhý průchod z vygenerovaného G-kódu → REÁLNÝ simPath
    // (calc.simPath prvního průchodu je prázdný — viz camHeadless).
    const { calcSim, gcode } = await runCamProg(demoProg);
    const issues = validateToolpath(calcSim.simPath, demoProg.params, calcSim.stockPathSegments,
      { backside: false, maxIssues: 99 });
    // Dokončování obálku zatím nemá (Fáze 3b) — nálezy od začátku
    // dokončovací sekce se vylučují.
    const lines = gcode.split('\n');
    const finishStart = lines.findIndex(l => /DOKON|FINISH/i.test(l));
    const roughingIssues = issues.filter(i =>
      finishStart < 0 || i.lineIdx == null || i.lineIdx < finishStart);
    const fmt = roughingIssues.map(i =>
      `${i.kind} ${(lines[i.lineIdx] || '').trim().slice(0, 30)} X${(i.x * 2).toFixed(1)} Z${i.z.toFixed(1)} ~${i.area.toFixed(1)}mm²`);
    expect(fmt).toEqual([]);
  }, 60000);
});

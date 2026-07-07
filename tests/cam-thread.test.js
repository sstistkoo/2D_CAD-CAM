// ╔══════════════════════════════════════════════════════════════╗
// ║  Závitování (operace Závit): průchody G33/G32                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Aktivní threadActive generuje závitovací cyklus místo hrubování:
//   • degresivní radiální přísuv cum_i = H·√(i/n) (konstantní průřez třísky),
//   • auto počet průchodů podle hloubky s 1. záběrem ≤ 0,15 mm (jako
//     kalkulačka Závity v CAD), ručně přes threadPasses,
//   • vnější: z ⌀D dolů na ⌀(D−2H); vnitřní: z ⌀(D−2H) nahoru na ⌀D,
//   • G33 Z.. K.. (Sinumerik/Heidenhain) vs. G32 Z.. F.. (Fanuc),
//   • G97 konstantní otáčky (G96 by rozladil stoupání),
//   • jiskřící průchody (ap=0) na finálním průměru.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';

const baseParams = {
  machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1', speed: 200, feed: 0.25,
  depthOfCut: 2, retractDistance: 2, partingApproachFeed: 1,
  allowanceX: 0, allowanceZ: 0, finishAllowance: 0, toolRadius: 0.2,
  doFinishing: true, roughingStrategy: 'longitudinal', roughingSide: 'right',
  stockMode: 'cylinder', stockMargin: 5, stockDiameter: 40, stockLength: 60, stockFace: 2,
  safeX: 150, safeZ: 5, machineStructure: 'lathe', controlSystem: 'sinumerik',
  toolShape: 'threading', toolLength: 4, toolAngle: 0, toolTipAngle: 60,
  toolClearanceAngle: 0, finishingSlot: null, entryAngle: 15, entryAngleAuto: true,
  respectInsertGeometry: false, plungeRoughing: false, rapidClearance: 1,
  partOffZ: null,
  threadActive: true, threadName: 'M20', threadType: 'mc',
  threadDiameter: 20, threadPitch: 2.5, threadAngle: 60, threadDepth: 1.534,
  threadExternal: true, threadZStart: 0, threadZEnd: -20,
  threadRunIn: 3, threadRunOut: 0, threadPasses: 5, threadSpringPasses: 1,
};
const contourPoints = [
  { id: 1, type: 'G0', x: 0, z: 40, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 10, z: 40, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 10, z: 0, r: 0, mode: 'ABS' },
  { id: 4, type: 'G1', x: 0, z: 0, r: 0, mode: 'ABS' },
];
const stockPoints = [
  { id: 11, type: 'G0', x: 0, z: 42, r: 0, mode: 'ABS' },
  { id: 12, type: 'G1', x: 20, z: 42, r: 0, mode: 'ABS' },
  { id: 13, type: 'G1', x: 20, z: -5, r: 0, mode: 'ABS' },
  { id: 14, type: 'G1', x: 0, z: -5, r: 0, mode: 'ABS' },
];
const prog = (over) => ({ params: { ...baseParams, ...over }, contourPoints, stockPoints, flipX: false, flipZ: false });

// Rozbor ZAVITOVANI bloku: X přísuvy před závitovými řádky, Z cíle závitu.
function analyze(gcode) {
  const lines = gcode.split('\n');
  const start = lines.findIndex(l => l.includes('ZAVITOVANI'));
  const end = lines.findIndex((l, i) => i > start && l.includes('KONTURA'));
  const body = start === -1 ? [] : lines.slice(start, end === -1 ? lines.length : end);
  const passX = [];       // G0 X těsně před G33/G32 (poloha přísuvu)
  const threadZ = [];     // Z cíl závitového řádku
  let lastG0X = null;
  let threadCmd = null;   // 'G33' | 'G32'
  let pitchWord = null;   // 'K2.5' / 'F2.5'
  for (const l of body) {
    let m = l.match(/G0 X([\-0-9.]+)/);
    if (m) lastG0X = parseFloat(m[1]);
    m = l.match(/\b(G3[23]) Z([\-0-9.]+) ([KF])([0-9.]+)/);
    if (m) {
      threadCmd = m[1]; pitchWord = m[3] + m[4];
      threadZ.push(parseFloat(m[2]));
      passX.push(lastG0X);
    }
  }
  return {
    active: start !== -1,
    passX, threadZ, threadCmd, pitchWord,
    hasG97: body.some(l => /\bG97\b/.test(l)),
    z0: (body.join('\n').match(/G0 X[\-0-9.]+ Z([\-0-9.]+)/) || [])[1],
  };
}

describe('Závitování (operace Závit)', () => {
  it('vnější M20×2.5, 5 průchodů + jiskřící → degresivní přísuv z ⌀D na dno profilu', async () => {
    const { gcode } = await runCamProg(prog({}));
    const a = analyze(gcode);
    expect(a.active).toBe(true);
    expect(a.threadCmd).toBe('G33');
    expect(a.pitchWord).toBe('K2.5');
    expect(a.hasG97).toBe(true);
    expect(a.passX.length).toBe(6);                          // 5 řezných + 1 jiskřící
    // cum_i = H·√(i/5), rPass = 10 − cum (RADIUS mód → poloměry)
    expect(a.passX[0]).toBeCloseTo(10 - 1.534 * Math.sqrt(1 / 5), 3);
    expect(a.passX[4]).toBeCloseTo(10 - 1.534, 3);           // poslední řezný = plná hloubka
    expect(a.passX[5]).toBeCloseTo(a.passX[4], 3);           // jiskřící na stejném X
    a.threadZ.forEach(z => expect(z).toBeCloseTo(-20, 3));   // bez výběhu končí na Z konec
    expect(parseFloat(a.z0)).toBeCloseTo(3, 3);              // náběh 3 mm před Z start
  });

  it('vnitřní závit → přísuv z předvrtané díry nahoru na ⌀D', async () => {
    const { gcode } = await runCamProg(prog({ threadExternal: false }));
    const a = analyze(gcode);
    const rMinor = 10 - 1.534;
    expect(a.passX[0]).toBeCloseTo(rMinor + 1.534 * Math.sqrt(1 / 5), 3);
    expect(a.passX[4]).toBeCloseTo(10, 3);                   // finál = jmenovitý poloměr
    expect(Math.min(...a.passX)).toBeGreaterThan(rMinor);    // vše nad dírou
  });

  it('Fanuc → G32 se stoupáním jako F', async () => {
    const { gcode } = await runCamProg(prog({ controlSystem: 'fanuc' }));
    const a = analyze(gcode);
    expect(a.threadCmd).toBe('G32');
    expect(a.pitchWord).toBe('F2.5');
  });

  it('auto průchody (0) → průměrný záběr ~0,12 mm, 1. záběr ≤ 0,4 mm', async () => {
    const { gcode } = await runCamProg(prog({ threadPasses: 0, threadDepth: 0.6, threadPitch: 1 }));
    const a = analyze(gcode);
    const firstCut = 10 - a.passX[0];
    expect(firstCut).toBeLessThanOrEqual(0.4 + 1e-6);
    expect(a.passX.length).toBe(5 + 1);                      // ceil(0.6/0.12) = 5 + jiskřící
  });

  it('auto průchody M20×2.5 (H=1.534) → realistických 15 průchodů', async () => {
    const { gcode } = await runCamProg(prog({ threadPasses: 0 }));   // H=1.534 z baseParams
    const a = analyze(gcode);
    expect(a.passX.length).toBe(15 + 1);                     // 13 → +2 kvůli stropu 1. záběru 0,4
    expect(10 - a.passX[0]).toBeLessThanOrEqual(0.4 + 1e-6);
  });

  it('výběh → závit pokračuje za Z konec', async () => {
    const { gcode } = await runCamProg(prog({ threadRunOut: 2 }));
    const a = analyze(gcode);
    a.threadZ.forEach(z => expect(z).toBeCloseTo(-22, 3));
  });

  it('DIAMON → X jako průměry', async () => {
    const { gcode } = await runCamProg(prog({ mode: 'DIAMON' }));
    const a = analyze(gcode);
    expect(a.passX[4]).toBeCloseTo(2 * (10 - 1.534), 3);
  });

  it('threadActive=false → běžné hrubování, žádný ZAVITOVANI blok', async () => {
    const { gcode } = await runCamProg(prog({ threadActive: false }));
    const a = analyze(gcode);
    expect(a.active).toBe(false);
    expect(gcode).toMatch(/HRUBOVANI/);
  });

  it('jiskřící průchody lze vypnout', async () => {
    const { gcode } = await runCamProg(prog({ threadSpringPasses: 0 }));
    const a = analyze(gcode);
    expect(a.passX.length).toBe(5);
  });
});

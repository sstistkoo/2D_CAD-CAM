// ╔══════════════════════════════════════════════════════════════╗
// ║  Upichnutí (part-off): zápich plátkem po svislé úsečce         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Upich se chová jako obrábění syntetické (svislé) kontury v Z=partOffZ
// plátkem (kulatý/upichovací) s korekcí rádiusu a přídavky:
//   • Přídavek X (allowanceX) = DOJEZD spodní hrany → střed plátku dojede
//     na allowanceX + R.
//   • Přídavek Z + Přídavek na hotovo = Z-offset (hrubování odsazené, pak
//     dokončení přesně na rovinu řezu).
//   • roughingSide určuje znaménko Z-offsetu.
//   • polygon = nepodporováno → žádné dráhy + varování.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';

const baseParams = {
  machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1', speed: 200, feed: 0.25,
  depthOfCut: 2, retractDistance: 2, partingApproachFeed: 1,
  allowanceX: 0, allowanceZ: 0, finishAllowance: 0, toolRadius: 0.8,
  doFinishing: true, roughingStrategy: 'face', roughingSide: 'right',
  stockMode: 'cylinder', stockMargin: 5, stockDiameter: 40, stockLength: 60, stockFace: 2,
  safeX: 150, safeZ: 5, machineStructure: 'lathe', controlSystem: 'sinumerik',
  toolShape: 'round', toolLength: 5, toolAngle: 0, toolTipAngle: 90,
  toolClearanceAngle: 0, finishingSlot: null, entryAngle: 15, entryAngleAuto: true,
  respectInsertGeometry: false, plungeRoughing: false, rapidClearance: 1,
  partOffZ: 10,
};
const contourPoints = [
  { id: 1, type: 'G0', x: 0, z: 40, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 15, z: 40, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 15, z: 0, r: 0, mode: 'ABS' },
  { id: 4, type: 'G1', x: 0, z: 0, r: 0, mode: 'ABS' },
];
const stockPoints = [
  { id: 11, type: 'G0', x: 0, z: 42, r: 0, mode: 'ABS' },
  { id: 12, type: 'G1', x: 20, z: 42, r: 0, mode: 'ABS' },
  { id: 13, type: 'G1', x: 20, z: -5, r: 0, mode: 'ABS' },
  { id: 14, type: 'G1', x: 0, z: -5, r: 0, mode: 'ABS' },
];
const prog = (over) => ({ params: { ...baseParams, ...over }, contourPoints, stockPoints, flipX: false, flipZ: false });

// Rozbor UPICHNUTI bloku: nejhlubší G1 X (dno = poloha středu), Z roviny řezu,
// počet G1 v dokončovací (plynulé) dráze.
function analyze(gcode) {
  const lines = gcode.split('\n');
  const start = lines.findIndex(l => l.includes('UPICHNUTI'));
  const end = lines.findIndex((l, i) => i > start && l.includes('KONTURA'));
  const body = lines.slice(start, end === -1 ? lines.length : end);
  const g1x = [];
  const zPlanes = [];
  let finishG1 = null;      // počet G1 po značce „plynule" (musí být 1 = bez peckování)
  let feedStartX = null;    // G0 X těsně před PRVNÍM G1 (odkud začíná posuv)
  let lastG0X = null;
  for (const l of body) {
    let m = l.match(/G0 X([\-0-9.]+)/);
    if (m) lastG0X = parseFloat(m[1]);
    m = l.match(/G1 X([\-0-9.]+)/);
    if (m) { if (feedStartX === null) feedStartX = lastG0X; g1x.push(parseFloat(m[1])); if (finishG1 !== null) finishG1++; }
    m = l.match(/G0 Z([\-0-9.]+)/); if (m) { const z = parseFloat(m[1]); if (Math.abs(z) > 1e-9) zPlanes.push(+z.toFixed(3)); }
    if (l.includes('plynule')) finishG1 = 0;
  }
  return {
    deepestCenterX: g1x.length ? Math.min(...g1x) : null,
    zPlanes, finishG1, feedStartX,
    hasFinish: /plynule/.test(body.join('\n')),
    g1count: g1x.length,
    hasPeckRetract: body.some(l => /uvolnění třísek/.test(l)),
  };
}

describe('Upichnutí (part-off) plátkem', () => {
  it('kulatý, Dojezd X=0 → spodní hrana na osu (střed na R), jedna rovina, bez dokončení', async () => {
    const { gcode } = await runCamProg(prog({}));   // finishAllowance=0 → žádné dokončení
    const a = analyze(gcode);
    expect(a.deepestCenterX).toBeCloseTo(0.8, 3);   // střed = allowanceX + R
    expect(a.zPlanes).toEqual([10.8]);              // pz + R
    expect(a.hasFinish).toBe(false);
  });

  it('kulatý, Dojezd X=10 → dojezd spodní hrany na X10', async () => {
    const { gcode } = await runCamProg(prog({ allowanceX: 10 }));
    const a = analyze(gcode);
    expect(a.deepestCenterX).toBeCloseTo(10.8, 3);  // 10 + R
  });

  it('Přídavek Z (trvalý) NEtriggeruje dokončení → jediná dráha, posunutá rovina', async () => {
    const { gcode } = await runCamProg(prog({ allowanceZ: 0.2 }));  // finishAllowance zůstává 0
    const a = analyze(gcode);
    expect(a.deepestCenterX).toBeCloseTo(0.8, 3);
    expect(a.zPlanes).toEqual([11.0]);              // pz + R + Přídavek Z (0.2), žádná druhá dráha
    expect(a.hasFinish).toBe(false);
  });

  it('Přídavek na hotovo + Dokončovací operace → 2 dráhy, dokončení PLYNULÉ (1×G1)', async () => {
    const { gcode } = await runCamProg(prog({ finishAllowance: 0.2, doFinishing: true }));
    const a = analyze(gcode);
    expect(a.deepestCenterX).toBeCloseTo(0.8, 3);
    expect(a.zPlanes).toEqual([11.0, 10.8]);        // rough = finfinal+na hotovo, finish = pz+R
    expect(a.hasFinish).toBe(true);
    expect(a.finishG1).toBe(1);                     // dokončení bez peckování
  });

  it('Přídavek na hotovo BEZ Dokončovací operace → jediná dráha, ale přídavek nechá stát', async () => {
    const { gcode } = await runCamProg(prog({ finishAllowance: 0.2, doFinishing: false }));
    const a = analyze(gcode);
    expect(a.zPlanes).toEqual([11.0]);              // pz + R + Přídavek na hotovo (0.2) — dráha ho nechá
    expect(a.hasFinish).toBe(false);               // jen se nejede druhá dráha
  });

  it('Plynulé upichnutí → hlavní zápich bez peckování (1×G1, žádné uvolnění třísek)', async () => {
    const { gcode } = await runCamProg(prog({ partOffSmooth: true }));
    const a = analyze(gcode);
    expect(a.deepestCenterX).toBeCloseTo(0.8, 3);
    expect(a.g1count).toBe(1);                      // jediný plynulý posuv na dno
    expect(a.hasPeckRetract).toBe(false);           // žádné výjezdy pro lámání třísky
  });

  it('Peckované upichnutí (default) → víc G1 + výjezdy pro lámání třísky', async () => {
    const { gcode } = await runCamProg(prog({ partOffSmooth: false }));
    const a = analyze(gcode);
    expect(a.g1count).toBeGreaterThan(1);
    expect(a.hasPeckRetract).toBe(true);
  });

  it('Plynulé + Přídavek na hotovo → 2 dráhy, obě plynulé (2×G1 celkem)', async () => {
    const { gcode } = await runCamProg(prog({ partOffSmooth: true, finishAllowance: 0.3, doFinishing: true }));
    const a = analyze(gcode);
    expect(a.zPlanes).toEqual([11.1, 10.8]);        // rough = finfinal+0.3, finish = pz+R
    expect(a.g1count).toBe(2);                       // hlavní plynulý + dokončovací plynulý
    expect(a.hasPeckRetract).toBe(false);
  });

  it('Start X → posuv začíná až od Start X (rychloposuv sem)', async () => {
    // stockTop = 20 (⌀40). Start X=8 → posuv od středu 8.8; Dojezd X=2 → dno 2.8.
    const { gcode } = await runCamProg(prog({ partOffSmooth: true, partOffStartX: 8, allowanceX: 2 }));
    const a = analyze(gcode);
    expect(a.feedStartX).toBeCloseTo(8.8, 3);       // Start X + R (ne povrch 20.8)
    expect(a.deepestCenterX).toBeCloseTo(2.8, 3);   // Dojezd X + R
  });

  it('Start X = 0 (neaktivní) → posuv začíná od povrchu polotovaru', async () => {
    const { gcode } = await runCamProg(prog({ partOffSmooth: true, partOffStartX: 0, allowanceX: 2 }));
    const a = analyze(gcode);
    expect(a.feedStartX).toBeCloseTo(20.8, 3);      // stockTop (20) + R
  });

  it('Peck výjezd (uvolnění třísek) jede na Start X, ne nad polotovar', async () => {
    const { gcode } = await runCamProg(prog({ partOffSmooth: false, partOffStartX: 8, allowanceX: 2 }));
    const retracts = gcode.split('\n').filter(l => /uvolnění třísek/.test(l)).map(l => parseFloat(l.match(/X([\-0-9.]+)/)[1]));
    expect(retracts.length).toBeGreaterThan(0);
    retracts.forEach(x => expect(x).toBeCloseTo(8.8, 3));   // Start X (8) + R (0.8)
  });

  it('strana zleva → záporné znaménko Z-offsetu', async () => {
    const { gcode } = await runCamProg(prog({ roughingSide: 'left' }));
    const a = analyze(gcode);
    expect(a.zPlanes).toEqual([9.2]);               // pz - R
  });

  it('upichovací plátek (šířka > 2R) → rohový rádius = R', async () => {
    const { gcode } = await runCamProg(prog({ toolShape: 'parting', toolLength: 5, toolRadius: 0.8 }));
    const a = analyze(gcode);
    expect(a.deepestCenterX).toBeCloseTo(0.8, 3);
    expect(a.zPlanes).toEqual([10.8]);
  });

  it('polygon → žádné dráhy + varování v G-kódu', async () => {
    const { gcode } = await runCamProg(prog({ toolShape: 'polygon' }));
    const a = analyze(gcode);
    expect(a.deepestCenterX).toBeNull();            // žádný zápich
    expect(gcode).toMatch(/kulatý \/ upichovací plátek/i);
  });
});

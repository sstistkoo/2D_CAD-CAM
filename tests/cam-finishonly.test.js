// ╔══════════════════════════════════════════════════════════════╗
// ║  Jen dokončení („Hot."): objede konturu bez hrubování          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// finishOnly = true → vynechá hrubovací průchody (passes prázdné) a objede
// konturu jediným dokončovacím průchodem (offset = R nástroje), tj. stejnou
// dráhou jako závěrečné dokončení v Hrub. Ověřuje se, že:
//   • finishOnly NEgeneruje hrubování (žádné passes, žádný blok HRUBOVANI),
//   • pořád vznikne dokončovací offset a blok DOKONCOVANI,
//   • dokončovací dráha je totožná s finishOffsetPath z Hrub.+dokončení,
//   • výměna dokončovacího nástroje (finishingSlot) se vloží i tady.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';

const baseParams = {
  machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1', speed: 200, feed: 0.25,
  depthOfCut: 2, retractDistance: 2, partingApproachFeed: 1,
  allowanceX: 0, allowanceZ: 0, finishAllowance: 0, toolRadius: 0.8,
  doFinishing: true, roughingStrategy: 'longitudinal', roughingSide: 'right',
  stockMode: 'cylinder', stockMargin: 5, stockDiameter: 40, stockLength: 60, stockFace: 2,
  safeX: 150, safeZ: 5, machineStructure: 'lathe', controlSystem: 'sinumerik',
  toolShape: 'round', toolLength: 5, toolAngle: 0, toolTipAngle: 90,
  toolClearanceAngle: 0, finishingSlot: null, entryAngle: 15, entryAngleAuto: true,
  respectInsertGeometry: false, plungeRoughing: false, rapidClearance: 1,
  partOffZ: null,
};
// Osazený válec: Ø10 na Ø15 (schod ve 20 mm) — vyžaduje hrubování (2 průchody).
const contourPoints = [
  { id: 1, type: 'G0', x: 0, z: 40, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 10, z: 40, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 10, z: 20, r: 0, mode: 'ABS' },
  { id: 4, type: 'G1', x: 15, z: 20, r: 0, mode: 'ABS' },
  { id: 5, type: 'G1', x: 15, z: 0, r: 0, mode: 'ABS' },
];
const stockPoints = [
  { id: 11, type: 'G0', x: 0, z: 42, r: 0, mode: 'ABS' },
  { id: 12, type: 'G1', x: 18, z: 42, r: 0, mode: 'ABS' },
  { id: 13, type: 'G1', x: 18, z: -2, r: 0, mode: 'ABS' },
  { id: 14, type: 'G1', x: 0, z: -2, r: 0, mode: 'ABS' },
];
const prog = (over, extra = {}) => ({
  params: { ...baseParams, ...over }, contourPoints, stockPoints,
  flipX: false, flipZ: false, ...extra,
});

// Kompaktní charakteristika jednoho segmentu offsetu (na zaokrouhlení odolná).
const segKey = (s) => s.type === 'line'
  ? `L ${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)}->${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)}`
  : `A r=${s.r.toFixed(2)} ${s.dir}`;

describe('Jen dokončení (finishOnly / záložka Hot.)', () => {
  it('finishOnly=false → hrubování + dokončení (baseline)', async () => {
    const { calc, gcode } = await runCamProg(prog({ finishOnly: false }));
    expect(calc.passes.length).toBeGreaterThan(0);          // hrubovací průchody
    expect(calc.finishOffsetPath.length).toBeGreaterThan(0); // + dokončovací offset
    expect(gcode).toContain('HRUBOVANI');
    expect(gcode).toContain('DOKONCOVANI');
  });

  it('finishOnly=true → žádné hrubování, jen dokončovací objezd kontury', async () => {
    const { calc, gcode } = await runCamProg(prog({ finishOnly: true }));
    expect(calc.passes.length).toBe(0);                      // žádné hrubovací průchody
    expect(calc.finishOffsetPath.length).toBeGreaterThan(0); // dokončovací offset zůstává
    expect(gcode).not.toContain('HRUBOVANI');                // bez hrubovacího bloku
    expect(gcode).not.toMatch(/Pr.chod \d+/);                // ani komentářů "Průchod N"
    expect(gcode).toContain('DOKONCOVANI');
  });

  it('dokončovací dráha je TOTOŽNÁ s dokončením z Hrub.', async () => {
    const rough = await runCamProg(prog({ finishOnly: false }));
    const fin = await runCamProg(prog({ finishOnly: true }));
    expect(fin.calc.finishOffsetPath.map(segKey)).toEqual(rough.calc.finishOffsetPath.map(segKey));
  });

  it('dokončovací offset = kontura + korekce R (0.8) na X', async () => {
    const { calc } = await runCamProg(prog({ finishOnly: true, toolRadius: 0.8 }));
    const maxX = Math.max(...calc.finishOffsetPath.flatMap(s =>
      s.type === 'line' ? [s.p1.x, s.p2.x] : [s.cx + s.r]));
    // Největší X kontury je 15 → offset o R=0.8 → ~15.8.
    expect(maxX).toBeCloseTo(15.8, 1);
  });

  it('finishOnly s jiným dokončovacím nástrojem → výměna T2 v G-kódu', async () => {
    const toolMagazine = [
      { slot: 1, name: 'Hrubovací', radius: 0.8, vc: 200, f: 0.25, ap: 2, vbdCode: '' },
      { slot: 2, name: 'Dokončovací', radius: 0.4, vc: 260, f: 0.12, ap: 0.3, vbdCode: '' },
    ];
    const { gcode } = await runCamProg(
      prog({ finishOnly: true, finishingSlot: 1 }, { toolMagazine })
    );
    expect(gcode).toContain('DOKONCOVANI');
    expect(gcode).toMatch(/T="Dokončovací"/);                // Sinumerik výměna nástroje
  });
});

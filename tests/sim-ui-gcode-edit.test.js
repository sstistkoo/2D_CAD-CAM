// @vitest-environment happy-dom
// Úprava drah přímo v G-kódu (skupina „Úprava drah v G-kódu: uzly, úsečky,
// zápis řádků" → js/calculators/cam/sim/gcodeNodes.js): „−" smaže pohyb,
// „+" na uzlu přidá pohyb za řádek, tažení úsečky dráhy posune oba její
// konce v zamčené ose, klik na oblouk dráhy označí jeho řádek. Ruční
// program (DIAMON) — nezávisí na generátoru drah. Test prošel na starém
// kódu před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
const PROGRAM = [
  'N10 G0 X100 Z10',
  'N20 G1 X40 Z5 F0.2',
  'N30 G1 X40 Z-30',
  'N40 G3 X40 Z-50 CR=10',
  'N50 G1 X40 Z-60',
  'N60 G0 X100 Z10',
];

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
});
afterAll(async () => { await sim?.close(); });

function setup() {
  const { S } = sim;
  S.params.mode = 'DIAMON';
  S.params.respectInsertGeometry = false;
  S.params.stockMode = 'cylinder';
  S.params.stockDiameter = 66; S.params.stockLength = 66; S.params.stockFace = 2;
  S.params.feed = 0.25;
  S.contourPoints = structuredClone(CONTOUR);
  S.guideLines = [];
  S.manualGCode = PROGRAM.join('\n');
  S.gcodeDirty = false;
  S.snapEnabled = false;
  S.gcodeEditEnabled = true; S.pointDragEnabled = false;
  S.addPointMode = false; S.delPointMode = false;
  S.showZLimits = 'off';
  S.view = { scale: 4, panX: 500, panY: 300 };
  sim.fullUpdate();
}
const lines = () => sim.S.manualGCode.split('\n');
const click = (x, z) => { sim.mouse('mousedown', x, z); sim.mouse('mouseup', x, z); };

describe('simulátor — úprava drah v G-kódu', () => {
  it('„−" na uzlu smaže jeho pohyb; program je pak ručně upravený', () => {
    setup();
    sim.S.delPointMode = true;
    click(20, -60);   // uzel N50
    expect(lines()).toEqual(['N10 G0 X100 Z10', 'N20 G1 X40 Z5 F0.2', 'N30 G1 X40 Z-30', 'N40 G3 X40 Z-50 CR=10', 'N60 G0 X100 Z10']);
    expect(sim.S.gcodeDirty).toBe(true);
    sim.S.delPointMode = false;
  });

  it('„+" na uzlu → modal → nový pohyb za řádek (N mezi sousedy, posuv)', async () => {
    setup();
    sim.S.addPointMode = true;
    click(20, -30);   // uzel N30
    await settle(5);
    const x = document.querySelector('#agm-x'), z = document.querySelector('#agm-z');
    expect([x.value, z.value]).toEqual(['40', '-30']);
    x.value = '50'; z.value = '-35';
    document.querySelector('#agm-ok').click();
    expect(lines().slice(2, 5)).toEqual(['N30 G1 X40 Z-30', 'N35 G1 X50.000 Z-35.000 F0.25', 'N40 G3 X40 Z-50 CR=10']);
    expect(sim.S._gcodeFocusLine).toBe(3);
  });

  it('tažení úsečky dráhy: posune oba konce v zamčené ose (X)', () => {
    setup();
    sim.mouse('mousedown', 20, -17);       // úsečka N30 (X20 Z5 → X20 Z-30)
    expect(sim.S._draggedGSeg && sim.S._draggedGSeg.lineIdx).toBe(2);
    sim.mouse('mousemove', 22, -17.2);     // převážně v X
    expect(lines().slice(1, 3)).toEqual(['N20 G1 X44.000 Z5 F0.2', 'N30 G1 X44.000 Z-30']);
    sim.mouse('mouseup', 22, -17.2);
  });

  it('klik na oblouk dráhy (i mimo úpravu drah) označí jeho řádek', () => {
    setup();
    sim.S.gcodeEditEnabled = false;
    const sp = sim.S._cachedCalc.simPath.filter(p => p.originalLineIdx === 3);
    expect(sp.length).toBeGreaterThan(2);
    const mid = sp[Math.floor(sp.length / 2)];
    sim.S._gcodeFocusLine = null;
    click(mid.x, mid.z);
    expect(sim.S._gcodeFocusLine).toBe(3);
  });
});

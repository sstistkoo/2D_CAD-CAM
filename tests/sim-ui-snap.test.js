// @vitest-environment happy-dom
// SNAP v simulátoru (bloky „SNAP (jako v CAD)" a „SNAP MEZNÍCH ČAR" →
// js/calculators/cam/sim/snap.js): indikátor přichycení pod kurzorem (bod
// přednost před hranou), tažení mezní čáry (přichytí se jen k bodu
// u kurzoru) a tažení uzlu dráhy (bod / úhlový snap vodorovně-kolmo).
// Vlastní kontura a ruční program — nezávisí na generátoru drah. Test
// prošel na starém kódu před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

// Ø40 → půlkruh R10 (střed X20 Z-40) → Ø40, DIAMON; poloměry ve světě.
const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -30, r: 0, mode: 'ABS' },
  { id: 4, type: 'G3', x: 40, z: -50, r: 10, mode: 'ABS' },
  { id: 5, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
const STOCK = [
  { id: 101, type: 'G0', x: 70, z: 2, r: 0, mode: 'ABS' },
  { id: 102, type: 'G1', x: 70, z: -67.4, r: 0, mode: 'ABS' },
  { id: 103, type: 'G1', x: 0, z: -67.4, r: 0, mode: 'ABS' },
];

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
});
afterAll(async () => { await sim?.close(); });

/** Kontura + polotovar, měřítko 4 px/mm → body do 4,5 mm, hrany do 2,5 mm. */
function setup({ program = '' } = {}) {
  const { S } = sim;
  S.params.mode = 'DIAMON';
  S.params.respectInsertGeometry = false;
  S.params.stockMode = 'casting';
  S.contourPoints = structuredClone(CONTOUR);
  S.stockPoints = structuredClone(STOCK);
  S.guideLines = [];
  S.manualGCode = program;
  S.gcodeDirty = !!program;
  S.snapEnabled = true;
  S.gcodeEditEnabled = false; S.pointDragEnabled = false;
  S.addPointMode = false; S.delPointMode = false;
  S.showZLimits = 'off';
  S.view = { scale: 4, panX: 500, panY: 300 };
  sim.fullUpdate();
}
const r3 = (v) => Math.round(v * 1000) / 1000;
const snapAt = (x, z) => {
  sim.mouse('mousemove', x, z);
  const s = sim.S._snap;
  return s ? { x: r3(s.x), z: r3(s.z), type: s.type } : null;
};

describe('simulátor — SNAP', () => {
  it('indikátor pod kurzorem: bod, hrana, střed oblouku, nic; vypnutý SNAP', () => {
    setup();
    expect(snapAt(20.5, -29.5)).toEqual({ x: 20, z: -30, type: 'point' });     // vrchol kontury
    expect(snapAt(21, -8)).toEqual({ x: 20, z: -8, type: 'edge' });          // hrana Ø40
    expect(snapAt(20.5, -40.5)).toEqual({ x: 20, z: -40, type: 'point' });   // střed oblouku
    expect(snapAt(20.4, -15.3)).toEqual({ x: 20, z: -15, type: 'point' });   // střed úsečky
    expect(snapAt(10, -20)).toBeNull();
    sim.S.snapEnabled = false;
    expect(snapAt(20.5, -29.5)).toBeNull();
    sim.S.snapEnabled = true;
  });

  it('tažení mezní čáry (čelisti): přichytí se k bodu u kurzoru, ne k bodu jinde na čáře', () => {
    setup();
    const { S } = sim;
    S.showZLimits = 'on';
    Object.assign(S.zLimits, { chuck: -80, chuckActive: true });
    sim.fullUpdate();
    sim.mouse('mousedown', 10, -80);
    expect(S.draggedLimit).toBe('chuck');
    sim.mouse('mousemove', 21, -62.6);   // u bodu X20 Z-62,4
    expect(S.zLimits.chuck).toBe(-62.4);
    sim.mouse('mousemove', 31, -62.6);   // táž Z, ale 11 mm od bodu → bez přichycení
    expect(S.zLimits.chuck).toBe(-62.6);
    sim.mouse('mouseup', 31, -62.6);
    expect(S.draggedLimit).toBeNull();
    S.showZLimits = 'off';
    Object.assign(S.zLimits, { chuck: null, chuckActive: false });
  });

  it('tažení uzlu dráhy: k bodu kontury, jinak úhlový snap svisle pod předchozí bod', () => {
    setup({ program: ['G0 X100 Z10', 'G1 X40 Z5 F0.2', 'G1 X40 Z-60', 'G0 X100 Z10'].join('\n') });
    const { S } = sim;
    S.gcodeEditEnabled = true;
    const line3 = () => {
      const m = S.manualGCode.split('\n')[2].match(/X(-?[\d.]+)\s+Z(-?[\d.]+)/);
      return m ? [r3(+m[1]), r3(+m[2])] : S.manualGCode.split('\n')[2];
    };
    sim.mouse('mousedown', 20, -60);   // uzel řádku 3
    expect(S.draggedGNode && S.draggedGNode.lineIdx).toBe(2);
    sim.mouse('mousemove', 20.6, -50.4);   // u bodu kontury X20 Z-50
    expect(line3()).toEqual([40, -50]);
    sim.mouse('mousemove', 20.3, -85);     // skoro svisle pod X20 Z5 → přesně svisle
    expect(line3()).toEqual([40, -85]);
    sim.mouse('mouseup', 20.3, -85);
    S.gcodeEditEnabled = false;
  });
});

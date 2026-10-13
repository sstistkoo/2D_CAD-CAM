// @vitest-environment happy-dom
// Konstrukční čáry v simulátoru (skupina „Konstrukční čáry" bývalého bloku
// SNAP MEZNÍCH ČAR → js/calculators/cam/sim/guideLines.js): offset čáry
// o rádius plátku (SNAP), ⊢ Prodl / ⊣ Ořez uzlu dráhy i konce čáry, tažení
// konce po čáře se snapem k průsečíku, smazání „−", „+" na konci čáry
// rozdělí úsečku i oblouk kontury. Bez automatických mezních čar (ty dělá
// generátor) — vlastní kontura a ruční program. Test prošel na starém kódu
// před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture } from './helpers/simUi.mjs';

const FLAT = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
// Ø40 → půlkruh R10 (vrchol X30 Z-40) → Ø40.
const ARC = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -30, r: 0, mode: 'ABS' },
  { id: 4, type: 'G3', x: 40, z: -50, r: 10, mode: 'ABS' },
  { id: 5, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
// Vodorovná čára v R25 a svislé čáry v Z-20 a Z-45 (poloměry ve světě).
const H = { x1: 25, z1: 5, x2: 25, z2: -10 };
const V20 = { x1: 0, z1: -20, x2: 40, z2: -20 };
const V45 = { x1: 0, z1: -45, x2: 40, z2: -45 };

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
});
afterAll(async () => { await sim?.close(); });

function setup({ contour = FLAT, guides = [], program = '' } = {}) {
  const { S } = sim;
  Object.assign(S.params, {
    mode: 'DIAMON', respectInsertGeometry: false, stockMode: 'cylinder',
    stockDiameter: 66, stockLength: 66, stockFace: 2,
    toolRadius: 0.8, allowanceX: 0, allowanceZ: 0, finishAllowance: 0, partOffZ: null,
  });
  S.contourPoints = structuredClone(contour);
  S.guideLines = structuredClone(guides);
  S.manualGCode = program;
  S.gcodeDirty = !!program;
  S.snapEnabled = true;
  S.gcodeEditEnabled = false; S.pointDragEnabled = false;
  S.addPointMode = false; S.delPointMode = false;
  S.gExtendMode = false; S.gTrimMode = false;
  S.showZLimits = 'off';
  S.view = { scale: 4, panX: 500, panY: 300 };
  sim.fullUpdate();
}
const r3 = (v) => Math.round(v * 1000) / 1000;
const click = (x, z) => { sim.mouse('mousedown', x, z); sim.mouse('mouseup', x, z); };
const guide = (i) => { const g = sim.S.guideLines[i]; return [r3(g.x1), r3(g.z1), r3(g.x2), r3(g.z2)]; };
const pts = () => sim.S.contourPoints.map(({ type, x, z, r, mode }) => `${type} X${x} Z${z} R${r} ${mode}`);

describe('simulátor — konstrukční čáry', () => {
  it('SNAP nabízí i konec offsetu čáry o rádius plátku (kam dojede střed)', () => {
    setup({ guides: [H] });
    sim.mouse('mousemove', 25.9, -10.1);
    const s = sim.S._snap;
    // Přesný konec napojuje výpočet (guideOffsetJoin.js) — tady jen, že je to
    // bod na offsetu (≥ R25 + 0,8 mm), ne konec čáry samotné (R25).
    expect(s && s.type).toBe('point');
    expect(r3(s.z)).toBe(-10);
    expect(s.x).toBeGreaterThanOrEqual(25.8);
  });

  it('⊣ Ořez / ⊢ Prodl uzlu dráhy k nejbližší čáře', () => {
    setup({ guides: [V20, { x1: 0, z1: -10, x2: 40, z2: -10 }, V45], program: ['G0 X100 Z10', 'G1 X50 Z5 F0.2', 'G1 X50 Z-20', 'G0 X100 Z10'].join('\n') });
    const { S } = sim;
    S.gcodeEditEnabled = true;
    S.gTrimMode = true;
    click(25, -20);                     // uzel řádku 3 → zpět k Z-10
    expect(S.manualGCode.split('\n')[2]).toBe('G1 X50.000 Z-10.000');
    S.gTrimMode = false; S.gExtendMode = true;
    click(25, -10);                     // → vpřed k Z-20
    expect(S.manualGCode.split('\n')[2]).toBe('G1 X50.000 Z-20.000');
  });

  it('⊢ Prodl / ⊣ Ořez konce konstrukční čáry', () => {
    setup({ guides: [H, V20, V45] });
    const { S } = sim;
    S.gcodeEditEnabled = true;
    S.gExtendMode = true;
    click(25, -10);
    expect(guide(0)).toEqual([25, 5, 25, -20]);
    click(25, -20);
    expect(guide(0)).toEqual([25, 5, 25, -45]);
    S.gExtendMode = false; S.gTrimMode = true;
    click(25, -45);
    expect(guide(0)).toEqual([25, 5, 25, -20]);
    click(25, -20);                     // dál už žádný průsečík → beze změny
    expect(guide(0)).toEqual([25, 5, 25, -20]);
  });

  it('tažení konce čáry: po čáře, se snapem k průsečíku', () => {
    setup({ guides: [H, V45] });
    const { S } = sim;
    S.gcodeEditEnabled = true;
    sim.mouse('mousedown', 25, -10);
    expect(S._draggedGuideEnd).toEqual({ guideIdx: 0, endIdx: 1 });
    sim.mouse('mousemove', 27, -30);    // projekce na čáru → Z-30 (bez průsečíku)
    expect(guide(0)).toEqual([25, 5, 25, -30]);
    sim.mouse('mousemove', 27, -44);    // u průsečíku s Z-45 → přichytí se
    expect(guide(0)).toEqual([25, 5, 25, -45]);
    sim.mouse('mouseup', 27, -44);
  });

  it('„−" mimo body smaže ruční čáru pod kurzorem', () => {
    setup({ guides: [H, V45] });
    sim.S.delPointMode = true;
    click(25, -2);
    expect(sim.S.guideLines).toEqual([V45]);
  });

  it('„+" na konci čáry ležícím na kontuře rozdělí úsečku i oblouk', () => {
    setup({ contour: ARC, guides: [{ x1: 20, z1: -10, x2: 35, z2: -10 }, { x1: 30, z1: -40, x2: 40, z2: -40 }] });
    const { S } = sim;
    S.addPointMode = true;
    click(20, -10);
    S.addPointMode = true;
    click(30, -40);
    expect(pts()).toMatchInlineSnapshot(`
      [
        "G0 X0 Z0 R0 ABS",
        "G1 X40 Z0 R0 ABS",
        "G1 X40 Z-10 R0 ABS",
        "G1 X40 Z-30 R0 ABS",
        "G3 X60 Z-40 R10 ABS",
        "G3 X40 Z-50 R10 ABS",
        "G1 X40 Z-62.4 R0 ABS",
      ]
    `);
  });
});

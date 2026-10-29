// @vitest-environment happy-dom
// Návrat z CAM do CAD křížkem ✕: bez změn jen zavře, se změnami se zeptá
// „Zahodit změny / 📐 Zachovat a přenést". Přenos vrátí na plátno CAD
// konturu, polotovar, konstrukční čáry a skrytou poznámku s programem
// (js/calculators/cam/sim/sendToCanvas.js). Hodnoty jsou charakterizace
// kódu z 13. 10. 2026 (tehdy i tlačítkem „📐 Kreslit", které uživatel nechal
// odstranit — nepoužíval ho, vrací se vždy křížkem).
import { describe, it, expect, beforeAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

// Ø40 → půlkruh R10 → Ø40 (DIAMON): úsečky i oblouk.
const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -30, r: 0, mode: 'ABS' },
  { id: 4, type: 'G3', x: 40, z: -50, r: 10, mode: 'ABS' },
  { id: 5, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
const GUIDE = { x1: 25, z1: 5, x2: 25, z2: -10 };

let state;
beforeAll(async () => {
  installSimDom();
  ({ state } = await import('../js/state.js'));
});

const r3 = (v) => Math.round(v * 1000) / 1000;
function summary(objs) {
  return objs.map(o => {
    const f = (...v) => v.filter(x => x !== '').join(' ');
    if (o.type === 'line' || o.type === 'constr') return f(o.type, r3(o.x1), r3(o.y1), '→', r3(o.x2), r3(o.y2), o.isStock ? 'stock' : '', o.finite ? 'finite' : '');
    if (o.type === 'arc') return f(o.type, 'c', r3(o.cx), r3(o.cy), 'r', r3(o.r), r3(o.startAngle), '→', r3(o.endAngle), o.ccw ? 'ccw' : 'cw', o.isStock ? 'stock' : '');
    if (o.type === 'camNote') return f(o.type, 'gcode:' + (o.gcode.length > 0), 'dirty:' + o.gcodeDirty, 'key:' + typeof o.gcodeKey);
    return o.type;
  });
}

const OLD = { type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, id: 999, name: 'starý výkres', layer: 0 };

/** Otevře simulátor nad konturou; `setup(S)` může stav upravit. */
async function openWith(machineType, setup = () => {}) {
  state.machineType = machineType;
  state.objects.length = 0;
  state.objects.push({ ...OLD });
  const sim = await openSim(loadFixture('cam/part-1.camprog'));
  const { S } = sim;
  S.params.mode = 'DIAMON';
  S.contourPoints = structuredClone(CONTOUR);
  S.guideLines = [{ ...GUIDE, id: 1 }];
  setup(S);
  return sim;
}
const closeBtn = () => document.querySelector('.cam-sim-toolbar .calc-close-btn');
const choice = () => document.querySelector('.cam-confirm-overlay [data-r="save"]')?.closest('.cam-confirm-overlay') || null;

/** ✕ se změnou v programu → „📐 Zachovat a přenést" → objekty výkresu CAD. */
async function sendToCanvas(machineType, setup) {
  const sim = await openWith(machineType, setup);
  sim.S.manualGCode += '\n; ruční poznámka';   // změna → ✕ se zeptá
  closeBtn().click();
  await settle(10);
  expect(choice()).not.toBeNull();
  choice().querySelector('[data-r="save"]').click();
  await settle(20);
  expect(document.querySelector('.cam-sim-root')).toBeNull();   // simulátor se zavřel
  return summary(state.objects);
}

describe('✕ zavřít CAM', () => {
  it('bez změn jen zavře — bez dotazu, výkres CAD zůstane; „📐 Kreslit" už není', async () => {
    const sim = await openWith('soustruh');
    expect(sim.q('[data-code="to-canvas"]')).toBeNull();
    sim.q('[data-tab="editor"]').click();
    expect(sim.root.querySelector('[data-act="to-canvas-edit"]')).toBeNull();
    expect(sim.qa('button').some(b => b.textContent.includes('📐 Kreslit'))).toBe(false);
    closeBtn().click();
    await settle(10);
    expect(choice()).toBeNull();
    expect(document.querySelector('.cam-sim-root')).toBeNull();
    expect(state.objects).toEqual([OLD]);
  });

  it('se změnami se zeptá; „Zahodit změny" zavře a výkres nechá', async () => {
    const sim = await openWith('soustruh');
    sim.S.manualGCode += '\n; ruční poznámka';
    closeBtn().click();
    await settle(10);
    expect(choice().textContent).toContain('Neuložené změny v CAM');
    choice().querySelector('[data-r="discard"]').click();
    await settle(10);
    expect(document.querySelector('.cam-sim-root')).toBeNull();
    expect(state.objects).toEqual([OLD]);
  });
});

describe('✕ → 📐 Zachovat a přenést: simulátor → plátno CAD', () => {
  it('soustruh: kontura (úsečky + oblouk), válec jako polotovar, konstrukční čára, program', async () => {
    const objs = await sendToCanvas('soustruh', (S) => {
      S.params.stockMode = 'cylinder';
      S.params.stockDiameter = 66; S.params.stockLength = 66; S.params.stockFace = 2;
    });
    expect(objs).toMatchInlineSnapshot(`
      [
        "line 0 0 → 0 20",
        "line 0 20 → -30 20",
        "arc c -40 20 r 10 0 → 3.142 ccw",
        "line -50 20 → -62.4 20",
        "line 2 0 → 2 33 stock",
        "line 2 33 → -66 33 stock",
        "line -66 33 → -66 0 stock",
        "line -66 0 → 2 0 stock",
        "constr -10 25 → 5 25 finite",
        "constr 238.838 29.94 → 219.001 24.625 finite",
        "constr 143.791 33.551 → 117.638 26.544 finite",
        "constr 69.162 37.397 → 40.275 29.657 finite",
        "constr 0 41.978 → -11 39.031 finite",
        "camNote gcode:true dirty:false key:string",
      ]
    `);
  });

  it('kontura jde do vrstvy Kontura, i když je aktivní Konstrukce', async () => {
    state.activeLayer = 1;
    try {
      await sendToCanvas('soustruh', (S) => { S.params.stockMode = 'cylinder'; S.params.stockDiameter = 66; S.params.stockLength = 66; });
      const layers = (t) => [...new Set(state.objects.filter(t).map(o => o.layer))];
      expect(layers(o => (o.type === 'line' || o.type === 'arc') && !o.isStock)).toEqual([0]);
      expect(layers(o => o.isStock)).toEqual([3]);
      expect(layers(o => o.type === 'constr')).toEqual([1]);
      expect(layers(o => o.type === 'camNote')).toEqual([0]);
    } finally { state.activeLayer = 0; }
  });
  it('karusel: osy prohozené, oblouk opačně, vlastní tvar polotovaru', async () => {
    const objs = await sendToCanvas('karusel', (S) => {
      S.params.stockMode = 'casting';
      S.stockPoints = [
        { id: 101, type: 'G0', x: 50, z: 2, r: 0, mode: 'ABS' },
        { id: 102, type: 'G1', x: 50, z: -67.4, r: 0, mode: 'ABS' },
        { id: 103, type: 'G1', x: 0, z: -67.4, r: 0, mode: 'ABS' },
      ];
    });
    expect(objs).toMatchInlineSnapshot(`
      [
        "line 0 0 → 20 0",
        "line 20 0 → 20 -30",
        "arc c 20 -40 r 10 1.571 → -1.571 cw",
        "line 20 -50 → 20 -62.4",
        "line 25 2 → 25 -67.4 stock",
        "line 25 -67.4 → 0 -67.4 stock",
        "constr 25 -10 → 25 5 finite",
        "constr 29.94 238.838 → 24.625 219.001 finite",
        "constr 33.551 143.791 → 26.544 117.638 finite",
        "constr 37.397 69.162 → 29.657 40.275 finite",
        "constr 41.978 0 → 39.031 -11 finite",
        "camNote gcode:true dirty:false key:string",
      ]
    `);
  });
});

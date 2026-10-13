// @vitest-environment happy-dom
// „+" režim, klik na oblouk → modal „📐 Tečna pod úhlem z oblouku" (blok
// „Modal: tečná úsečka pod úhlem z oblouku" → js/calculators/cam/sim/
// tangentLineModal.js). Test prošel na starém kódu před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

// Ø40 → půlkruh R10 (střed X20 Z-40, vrchol X30 Z-40) → Ø40, DIAMON.
const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -30, r: 0, mode: 'ABS' },
  { id: 4, type: 'G3', x: 40, z: -50, r: 10, mode: 'ABS' },
  { id: 5, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
// Vlastní tvar polotovaru: Ø70 od Z2 do Z-67,4.
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

const modal = () => document.querySelector('#tlm-ang')?.closest('.cam-confirm-overlay') || null;
const $ = (sel) => modal().querySelector(sel);

/** Výchozí kontura + klik v „+" režimu na vrchol oblouku (X30 Z-40). */
async function openOnArcTop() {
  const { S } = sim;
  S.params.mode = 'DIAMON';
  S.contourPoints = structuredClone(CONTOUR);
  S.guideLines = [];
  S.params.stockMode = 'casting';
  S.stockPoints = structuredClone(STOCK);
  S.view = { scale: 8, panX: 600, panY: 400 };
  sim.fullUpdate();
  S.addPointMode = true;
  sim.mouse('mousedown', 30, -40);
  sim.mouse('mouseup', 30, -40);
  await settle(5);
  expect(modal()).not.toBeNull();
  expect(S.addPointMode).toBe(false);   // „+" režim se po kliknutí vypne
}

function fill({ ang, mode, len, result }) {
  if (ang !== undefined) $('#tlm-ang').value = String(ang);
  if (mode !== undefined) { $('#tlm-mode').value = mode; $('#tlm-mode').dispatchEvent(new Event('change')); }
  if (len !== undefined) $('#tlm-len').value = String(len);
  if (result !== undefined) $('#tlm-result').value = result;
}

describe('simulátor — tečna pod úhlem z oblouku', () => {
  it('Pomocná čára: 0° délka 10 z vrcholu oblouku, kontura beze změny', async () => {
    await openOnArcTop();
    fill({ ang: 0, mode: 'length', len: 10, result: 'guide' });
    $('#tlm-ok').click();
    await settle(5);
    expect(modal()).toBeNull();
    expect(sim.S.guideLines).toEqual([{ x1: 30, z1: -40, x2: 30, z2: -30 }]);
    expect(sim.S.contourPoints).toEqual(CONTOUR);
  });

  it('🧹 smaže pomocné čáry, Zrušit zavře bez změny', async () => {
    await openOnArcTop();   // vynuluje guideLines → tlačítko 🧹 se neukáže
    expect(modal().querySelector('#tlm-clear')).toBeNull();
    $('#tlm-cancel').click();
    sim.S.guideLines = [{ x1: 1, z1: 2, x2: 3, z2: 4 }];
    sim.S.addPointMode = true;
    sim.mouse('mousedown', 30, -40);
    sim.mouse('mouseup', 30, -40);
    await settle(5);
    expect($('#tlm-clear').textContent).toContain('(1)');
    $('#tlm-clear').click();
    expect(sim.S.guideLines).toEqual([]);
    expect(modal().querySelector('#tlm-clear')).toBeNull();
    $('#tlm-cancel').click();
    expect(modal()).toBeNull();
  });

  it('Vložit do kontury: oblouk končí v tečném bodě, za ním G1 zadané délky + krok historie', async () => {
    await openOnArcTop();
    const past = sim.S.past.length;
    fill({ ang: 0, mode: 'length', len: 5, result: 'insert' });
    $('#tlm-ok').click();
    await settle(5);
    expect(modal()).toBeNull();
    const pts = sim.S.contourPoints.map(({ type, x, z, r, mode }) => ({ type, x, z, r, mode }));
    expect(pts.slice(3, 5)).toEqual([
      { type: 'G3', x: 60, z: -40, r: 10, mode: 'ABS' },   // tečný bod X30 (Ø60)
      { type: 'G1', x: 60, z: -35, r: 0, mode: 'ABS' },    // + 5 mm v +Z
    ]);
    expect(pts).toHaveLength(6);
    expect(sim.S.past.length).toBe(past + 1);
  });

  it('presety hran destičky (polygon) a „Do průsečíku"', async () => {
    sim.S.params.toolShape = 'polygon';
    sim.S.params.toolAngle = 3;
    sim.S.params.toolTipAngle = 80;
    await openOnArcTop();
    $('#tlm-preset-front').click();
    expect([$('#tlm-ang').value, $('#tlm-mode').value, $('#tlm-len-row').style.display]).toEqual(['-97', 'intersect', 'none']);
    $('#tlm-preset-bottom').click();
    expect($('#tlm-ang').value).toBe('-177');
    // −90° (dolů): oba tečné body stejně daleko od kliku → začátek oblouku
    // (X20 Z-30), paprsek leží v kontuře → průsečík žádný, modal zůstane.
    fill({ ang: -90, result: 'guide' });
    $('#tlm-ok').click();
    await settle(5);
    expect(modal()).not.toBeNull();
    expect(sim.S.guideLines).toEqual([]);
    // 180° (k −Z) z vrcholu oblouku → do průsečíku se dnem polotovaru.
    fill({ ang: 180 });
    $('#tlm-ok').click();
    await settle(5);
    expect(modal()).toBeNull();
    const um = (l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
    expect(sim.S.guideLines.map(um)).toEqual([{ x1: 30, z1: -40, x2: 30, z2: -67.4 }]);
  });
});

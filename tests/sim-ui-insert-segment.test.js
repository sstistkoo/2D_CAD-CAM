// @vitest-environment happy-dom
// „+" režim, klik na bod → modal „➕ Vložit segment za bod" (blok „Modal pro
// vložení segmentu" → js/calculators/cam/sim/insertSegmentModal.js). Test
// prošel na starém kódu před přestěhováním. Režim poloměru (RADIUS): v Ø
// režimu má 🎯 Přebrat souřadnice zapsanou chybu (docs/plan-rozdeleni-cam-simulatoru.md).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

// Poloměry: R20 → půlkruh R10 → R20.
const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 20, z: -30, r: 0, mode: 'ABS' },
  { id: 4, type: 'G3', x: 20, z: -50, r: 10, mode: 'ABS' },
  { id: 5, type: 'G1', x: 20, z: -62.4, r: 0, mode: 'ABS' },
];
const STOCK = [
  { id: 101, type: 'G0', x: 35, z: 2, r: 0, mode: 'ABS' },
  { id: 102, type: 'G1', x: 35, z: -67.4, r: 0, mode: 'ABS' },
  { id: 103, type: 'G1', x: 0, z: -67.4, r: 0, mode: 'ABS' },
];

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
});
afterAll(async () => { await sim?.close(); });

const modal = () => document.querySelector('#ism-ok')?.closest('.cam-confirm-overlay') || null;
const $ = (sel) => modal().querySelector(sel);
const pts = (list) => list.map(({ type, x, z, r, mode }) => ({ type, x, z, r, mode }));

/** Kontura + polotovar, klik v „+" režimu na bod X20 Z-30 (index 2). */
async function openAfterPoint() {
  const { S } = sim;
  S.params.mode = 'RADIUS';
  S.params.respectInsertGeometry = false;   // bez automatických mezních čar u bodů
  S.params.stockMode = 'casting';
  S.contourPoints = structuredClone(CONTOUR);
  S.stockPoints = structuredClone(STOCK);
  S.guideLines = [];
  S.editMode = 'contour';
  S.view = { scale: 8, panX: 600, panY: 400 };
  sim.fullUpdate();
  S.addPointMode = true;
  sim.mouse('mousedown', 20, -30);
  sim.mouse('mouseup', 20, -30);
  await settle(5);
  expect(modal()).not.toBeNull();
}
const ok = async () => { $('#ism-ok').click(); await settle(5); expect(modal()).toBeNull(); };

describe('simulátor — vložit segment za bod', () => {
  it('výchozí hodnoty (X bodu, Z − 5, G1, ABS) → vloží se za bod + krok historie', async () => {
    await openAfterPoint();
    expect([$('#ism-x').value, $('#ism-z').value, $('#ism-mode').textContent.trim()]).toEqual(['20', '-35', 'G90 ABS']);
    const past = sim.S.past.length;
    await ok();
    expect(pts(sim.S.contourPoints).slice(2, 4)).toEqual([
      { type: 'G1', x: 20, z: -30, r: 0, mode: 'ABS' },
      { type: 'G1', x: 20, z: -35, r: 0, mode: 'ABS' },
    ]);
    expect(sim.S.contourPoints).toHaveLength(6);
    expect(sim.S.past.length).toBe(past + 1);
  });

  it('G2 s poloměrem, INC, Zrušit nic nemění', async () => {
    await openAfterPoint();
    modal().querySelector('[data-type="G2"]').click();
    expect($('#ism-r')).not.toBeNull();
    $('#ism-x').value = '25'; $('#ism-z').value = '-40'; $('#ism-r').value = '7';
    $('#ism-mode').click();
    expect($('#ism-mode').textContent.trim()).toBe('G91 INC');
    expect([$('#ism-x').value, $('#ism-z').value, $('#ism-r').value]).toEqual(['25', '-40', '7']);   // hodnoty přežijí překreslení
    await ok();
    expect(pts(sim.S.contourPoints)[3]).toEqual({ type: 'G2', x: 25, z: -40, r: 7, mode: 'INC' });

    await openAfterPoint();
    $('#ism-cancel').click();
    expect(modal()).toBeNull();
    expect(pts(sim.S.contourPoints)).toEqual(pts(CONTOUR));
  });

  it('↘ X/Z: úhel + délka a Do průsečíku', async () => {
    await openAfterPoint();
    $('#ism-ang').value = '0'; $('#ism-anglen').value = '10';
    $('#ism-angcalc').click();
    expect([$('#ism-x').value, $('#ism-z').value]).toEqual(['20', '-20']);
    $('#ism-ang').value = '90';
    $('#ism-angmode').value = 'intersect'; $('#ism-angmode').dispatchEvent(new Event('change'));
    expect(modal().querySelector('#ism-anglen-wrap').style.display).toBe('none');
    $('#ism-angcalc').click();
    expect([$('#ism-x').value, $('#ism-z').value]).toEqual(['35', '-30']);   // nahoru do polotovaru R35
    $('#ism-cancel').click();
  });

  it('Kam: Polotovar → bod na konec polotovaru', async () => {
    await openAfterPoint();
    modal().querySelector('[data-tgt="stock"]').click();
    $('#ism-x').value = '30'; $('#ism-z').value = '-70';
    await ok();
    expect(pts(sim.S.stockPoints)).toEqual([...pts(STOCK), { type: 'G1', x: 30, z: -70, r: 0, mode: 'ABS' }]);
    expect(pts(sim.S.contourPoints)).toEqual(pts(CONTOUR));
  });

  it('🎯 Přebrat souřadnice: klik do plátna u bodu → přichytí se na bod, Esc v pick módu vrátí modal', async () => {
    await openAfterPoint();
    $('#ism-pick').click();
    expect(modal().style.display).toBe('none');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal().style.display).toBe('');
    $('#ism-pick').click();
    sim.mouse('mousedown', 20.5, -50.5);   // kousek vedle bodu X20 Z-50
    sim.mouse('mouseup', 20.5, -50.5);
    await settle(5);
    expect(modal().style.display).toBe('');
    expect([$('#ism-x').value, $('#ism-z').value]).toEqual(['20', '-50']);
    await ok();
    expect(pts(sim.S.contourPoints)[3]).toEqual({ type: 'G1', x: 20, z: -50, r: 0, mode: 'ABS' });
  });
});

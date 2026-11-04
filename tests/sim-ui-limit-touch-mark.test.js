// @vitest-environment happy-dom
// Mobil: mezní čáry (čelisti, koník, rozsahy 📐) přes zaměřovadlo
// (cam/sim/limitTouchMark.js, uživatel 4. 11. 2026: „blbě se na to na mobilu
// trefuje"). Podržet → křížek 60 px nad prstem, najet na čáru, pustit =
// označit; znovu podržet = čára skočí na křížek a táhne se s ním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

const OFF = -60;   // CAM_CH_OFFSET v camSimulator.js
let sim;
beforeAll(async () => {
  installSimDom();
  const { state } = await import('../js/state.js');
  state.machineType = 'karusel';
  sim = await openSim(loadFixture('cam-cases/carousel-zigzag-ap6.camprog'));
});
afterAll(async () => { await sim?.close(); });

const wrap = () => document.querySelector('.cam-sim-canvas-wrap');
function touch(type, x, y) {
  const ev = new Event(type, { bubbles: true });
  const pts = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(ev, 'touches', { value: pts });
  wrap().dispatchEvent(ev);
}
async function hold(x, y, moveTo = null) {
  touch('touchstart', x, y);
  await settle(400);                           // long-press 320 ms
  if (moveTo) { touch('touchmove', moveTo[0], moveTo[1]); await settle(30); }
  const [ex, ey] = moveTo || [x, y];
  touch('touchend', ex, ey);
  await settle(30);
}

describe('mezní čáry na karuselu přes zaměřovadlo', () => {
  it('čelisti: označit křížkem, podruhé chytit a přetáhnout', async () => {
    const { S } = sim;
    S.showZLimits = 'both';
    S.zLimits.chuck = 20; S.zLimits.chuckActive = true;
    S.view = { scale: 1, panX: 50, panY: 400 };
    sim.draw();
    // Karusel: Z svisle, y = panY − z·scale → čára čelistí na y 380.
    const lineY = 400 - 20;
    // 1) podržet mimo čáru, křížkem (60 px nad prstem) na ni najet, pustit → označeno
    await hold(200, lineY + 40 - OFF, [200, lineY - OFF]);
    expect(S._camMarkedLimit).toBe('chuck');
    expect(S.zLimits.chuck).toBe(20);
    // 2) znovu podržet jinde a táhnout: čára jde s křížkem (Z = 400 − y)
    await hold(300, 330 - OFF, [300, 300 - OFF]);
    expect(S._camMarkedLimit).toBeNull();
    expect(S.zLimits.chuck).toBeCloseTo(100, 0);
  });

  it('soustruh: koník (svislá čára) a rozsah X max (vodorovná) stejným postupem', async () => {
    const { S } = sim;
    S.params.machineStructure = 'lathe';
    S.showZLimits = 'both';
    S.zLimits.tail = 30; S.zLimits.tailActive = true; S.zLimits.chuckActive = false;
    S.xLimits = { rangeXMin: null, rangeXMax: 80, active: true, minActive: false, maxActive: true };
    S.view = { scale: 1, panX: 300, panY: 400 };
    sim.draw();
    // Soustruh: Z vodorovně (x = panX + z), X svisle (y = panY − x).
    await hold(300 + 30 - 40, 250 - OFF, [300 + 30, 250 - OFF]);   // najet na koník zleva
    expect(S._camMarkedLimit).toBe('tail');
    await hold(200, 250 - OFF, [360, 250 - OFF]);
    expect(S.zLimits.tail).toBeCloseTo(60, 0);
    // Rozsah X max: vodorovná čára na y = 400 − 80
    await hold(150, 400 - 80 + 30 - OFF, [150, 400 - 80 - OFF]);
    expect(S._camMarkedLimit).toBe('rangeXMax');
    await hold(150, 300 - OFF, [150, 280 - OFF]);
    expect(S.xLimits.rangeXMax).toBeCloseTo(120, 0);
    S.params.machineStructure = 'carousel';
  });

  it('krátký tap označení zruší', async () => {
    const { S } = sim;
    S._camMarkedLimit = 'chuck';
    touch('touchstart', 100, 100); await settle(30); touch('touchend', 100, 100); await settle(30);
    expect(S._camMarkedLimit).toBeNull();
  });
});

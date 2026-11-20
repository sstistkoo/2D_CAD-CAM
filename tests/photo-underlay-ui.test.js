// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let state, panel, UL, canvas;
beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  panel = await import('../js/underlay/underlayPanel.js');
  ({ UL } = await import('../js/underlay/underlayDraw.js'));
  ({ drawCanvas: canvas } = await import('../js/canvas.js'));
});
const tap = (x, y) => {
  canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
};

describe('🖼️ panel podkladu', () => {
  it('bez fotky jsou úpravy vypnuté; měřítko 2 klepnutími + Umístit', async () => {
    UL.u = null;
    panel.showUnderlayPanel();
    const ov = document.querySelector('.calc-overlay[data-type="photoUnderlay"]');
    expect(ov).not.toBeNull();
    expect(ov.querySelector('#ulScale').disabled).toBe(true);
    ov.remove();
    // fotka „načtená" (bez skutečného obrázku)
    UL.u = { src: '', w: 1000, h: 800, ox: 0, oy: 0, ux: 0.1, uy: 0, vx: 0, vy: -0.1, opacity: 0.5, visible: true };
    state.tool = 'line';
    panel.showUnderlayPanel();
    const ov2 = document.querySelector('.calc-overlay[data-type="photoUnderlay"]');
    ov2.querySelector('#ulScale').click();
    expect(state.tool).toBe('select');                 // klepnutí nekreslí
    tap(100, 200); tap(300, 200);
    const real = document.getElementById('ulReal');
    expect(real).not.toBeNull();
    real.value = '480';
    document.getElementById('ulRealOk').click();
    expect(state.tool).toBe('line');                   // nástroj vrácený
    const k = Math.hypot(UL.u.ux, UL.u.uy);
    expect(k).toBeGreaterThan(0.1);                    // fotka se zvětšila
    ov2.querySelector('#ulPlace').click();
    tap(150, 250);
    document.getElementById('ulH').value = '0';
    document.getElementById('ulV').value = '0';
    document.getElementById('ulPlaceOk').click();
    expect(document.getElementById('ulH')).toBeNull();
    ov2.remove();
    expect(UL.marks).toBeNull();
  });
});

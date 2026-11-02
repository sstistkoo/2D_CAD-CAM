// @vitest-environment happy-dom
// Návrat z CAM do CAD: mikronové schody polotovaru se srovnají (sendToCanvas.js).
import { describe, it, expect, beforeAll } from 'vitest';
import { installSimDom } from './helpers/simUi.mjs';

let snapStockJitter;
beforeAll(async () => {
  installSimDom();
  ({ snapStockJitter } = await import('../js/calculators/cam/sim/sendToCanvas.js'));
});

const P = (type, xAbs, zAbs) => ({ type, xAbs, zAbs });

describe('snapStockJitter', () => {
  it('schod 1 µm poloměru (2 µm průměru) na vodorovné čáře se srovná, skutečný schod ne', () => {
    const pts = [P('G0', 33.486, 149.544), P('G1', 33.488, 167.259), P('G1', 33.488, 196.278), P('G1', 80, 196.278)];
    const out = snapStockJitter(pts, true);
    expect(out.map(p => p.xAbs)).toEqual([33.486, 33.486, 33.486, 80]);
    expect(pts[1].xAbs).toBe(33.488);   // vstup se nemění
  });

  it('bod před obloukem se nesnapuje', () => {
    const pts = [P('G0', 33.486, 100), P('G1', 33.488, 120), P('G3', 40, 130)];
    expect(snapStockJitter(pts, true)[1].xAbs).toBe(33.488);
  });
});

// @vitest-environment happy-dom
// Hit-testy simulátoru (skupina „Hit-testy" bývalého bloku SNAP MEZNÍCH ČAR →
// js/calculators/cam/sim/hitTest.js): úsečka kontury pod kurzorem (◆ Kontura),
// tažení X-meze rozsahu 📐, úchopy upichnutí (Dojezd X / Start X).
// Body a oblouky („+" režim) hlídají sim-ui-insert-segment a sim-ui-tangent-line,
// mez Z sim-ui-snap. Test prošel na starém kódu před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture } from './helpers/simUi.mjs';
import { partOffGeom } from '../js/calculators/cam/threadHelpers.js';

const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
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
  S.params.partOffZ = null;
  S.contourPoints = structuredClone(CONTOUR);
  S.guideLines = [];
  S.manualGCode = '';
  S.snapEnabled = false;
  S.gcodeEditEnabled = false; S.pointDragEnabled = false;
  S.addPointMode = false; S.delPointMode = false;
  S.showZLimits = 'off';
  S.view = { scale: 4, panX: 500, panY: 300 };
  sim.fullUpdate();
}

describe('simulátor — hit-testy', () => {
  it('úsečka kontury pod kurzorem (◆ Kontura) → kurzor „move", mimo ni „crosshair"', () => {
    setup();
    sim.S.pointDragEnabled = true;
    sim.mouse('mousemove', 20.5, -31);
    expect(sim.canvas.style.cursor).toBe('move');
    sim.mouse('mousemove', 10, -31);
    expect(sim.canvas.style.cursor).toBe('crosshair');
    sim.S.pointDragEnabled = false;
    sim.mouse('mousemove', 20.5, -31);
    expect(sim.canvas.style.cursor).toBe('crosshair');
  });

  it('tažení X-meze rozsahu (X max) jen když je mez zapnutá a vidět', () => {
    setup();
    const { S } = sim;
    S.showZLimits = 'on';
    Object.assign(S.xLimits, { rangeXMin: null, rangeXMax: 30, active: true, minActive: false, maxActive: true });
    sim.fullUpdate();
    sim.mouse('mousedown', 30, -20);
    expect(S.draggedLimit).toBe('rangeXMax');
    sim.mouse('mousemove', 35, -20);
    expect(S.xLimits.rangeXMax).toBe(35);
    sim.mouse('mouseup', 35, -20);
    S.xLimits.maxActive = false;
    sim.mouse('mousedown', 35, -20);
    expect(S.draggedLimit).toBeNull();
    sim.mouse('mouseup', 35, -20);
    S.showZLimits = 'off';
    Object.assign(S.xLimits, { rangeXMin: null, rangeXMax: null, active: false, minActive: false, maxActive: false });
  });

  it('úchopy upichnutí: tažení Dojezd X → Přídavek X, Start X → partOffStartX', () => {
    setup();
    const { S } = sim;
    Object.assign(S.params, { toolShape: 'round', toolRadius: 3, partOffZ: -40, allowanceX: 0, partOffStartX: 0 });
    sim.fullUpdate();
    S.pointDragEnabled = true;
    const g = partOffGeom(S.params, S._cachedCalc);
    expect(g.canCut).toBe(true);
    sim.mouse('mousedown', g.xBottomEdge, g.pz);
    expect(S.isDragging).toBe(true);
    sim.mouse('mousemove', 5, g.pz);
    expect(S.params.allowanceX).toBe(5);
    sim.mouse('mouseup', 5, g.pz);
    const g2 = partOffGeom(S.params, S._cachedCalc);
    sim.mouse('mousedown', g2.startEdgeX, g2.pz);
    sim.mouse('mousemove', 20, g2.pz);
    expect(S.params.partOffStartX).toBe(20);
    sim.mouse('mouseup', 20, g2.pz);
    S.pointDragEnabled = false;
    Object.assign(S.params, { partOffZ: null, allowanceX: 0, partOffStartX: 0 });
  });
});

// ╔══════════════════════════════════════════════════════════════╗
// ║  ◎ Díry z CAD do CAM: začátek vrtání, přenos sám, spodek řezu  ║
// ╚══════════════════════════════════════════════════════════════╝
// Čelo v CAD (posuvník) může stát ve vzduchu před přírubou — díra pro CAM
// začne vrtat na prvním materiálu (faceDepth.holeForCam → op.zTop). Díry
// se do operací přenesou samy při otevření CAM (live/liveCadSync.js). Řez
// v CAM má spodní polovinu (cam/sim/drawLowerHalf.js), díry 180°…360° se
// sklopí pod osu (live/liveSection.lowerAngle). (uživatel 20. 10. 2026)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('document', {
  getElementById: () => null,
  createElement: () => ({ classList: { add: vi.fn() }, style: {}, appendChild: vi.fn(), addEventListener: vi.fn(), setAttribute: vi.fn() }),
  body: { appendChild: vi.fn() },
  head: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: vi.fn(),
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

import { state } from '../js/state.js';
import { holeForCam, faceDrawingsForCam } from '../js/faceView/faceDepth.js';
import { liveOpsFromCad } from '../js/calculators/cam/live/liveFromCad.js';
import { cadSyncOps } from '../js/calculators/cam/live/liveCadSync.js';
import { lowerAngle, faceSpans } from '../js/calculators/cam/live/liveSection.js';
import { liveCutAt } from '../js/calculators/cam/live/liveCut.js';
import { contourRuns, stockRuns, lowerHalfOn } from '../js/calculators/cam/sim/drawLowerHalf.js';

const L = (x1, y1, x2, y2) => ({ type: 'line', layer: 0, x1, y1, x2, y2 });
// Hřídel Ø40 (Z0–200), příruba Ø90 (Z200–280), čep Ø30 (Z280–340).
const profile = () => [
  L(0, 0, 0, 20), L(0, 20, 200, 20), L(200, 20, 200, 45), L(200, 45, 280, 45),
  L(280, 45, 280, 15), L(280, 15, 340, 15), L(340, 15, 340, 0),
];
const O = { x: 440, y: 0 };
const hole = (x, y, holeDepth) => ({ type: 'circle', layer: 7, cx: O.x + x, cy: O.y + y, r: 3.5, ...(holeDepth ? { holeDepth } : {}) });
const local = (x, y, holeDepth) => ({ type: 'circle', cx: x, cy: y, r: 3.5, ...(holeDepth ? { holeDepth } : {}) });
const GEO = { faceZ: 340, outerD: 90, stockR: 50 };

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true },
    { id: 7, name: 'Čelo (bokorys)', visible: true, isFace: true, faceCurrent: true, origin: O, faceZ: 312, faceSide: 'right' }];
  state.objects = profile();
  state.machineType = 'soustruh';
});

describe('díra pro CAM (holeForCam)', () => {
  const skrz = { mode: 'through', value: null };
  it('čelo ve vzduchu (Z312): vrtá se od příruby Z280, skrz = 80 + hrot 3,1', () => {
    expect(holeForCam(local(0, 40, skrz), 312, 'right')).toMatchObject({ zTop: 280, depth: 83.1, depthTag: 'skrz' });
  });
  it('čelo na materiálu (Z280): bez zTop, hloubka jako dřív', () => {
    const h = holeForCam(local(0, 40, skrz), 280, 'right');
    expect(h.zTop).toBeUndefined();
    expect(h.depth).toBe(83.1);
  });
  it('hloubka od roviny čela: konec díry stejný, od příruby kratší; nezasáhne → bez hloubky', () => {
    expect(holeForCam(local(0, 40, { mode: 'depth', value: 50 }), 312, 'right')).toMatchObject({ zTop: 280, depth: 18 });
    expect(holeForCam(local(0, 40, { mode: 'z', value: 270 }), 312, 'right')).toMatchObject({ zTop: 280, depth: 10 });
    const miss = holeForCam(local(0, 40, { mode: 'depth', value: 20 }), 312, 'right');
    expect(miss.zTop).toBe(280);
    expect(miss.depth).toBeUndefined();
  });
  it('díra bez hloubky dostane jen začátek vrtání', () => {
    const h = holeForCam(local(0, 40), 312, 'right');
    expect(h.zTop).toBe(280);
    expect(h.depth).toBeUndefined();
  });
});

describe('📥 Z CAD se začátkem vrtání', () => {
  it('operace vrtá od Z280, název nese Z', () => {
    state.objects.push(hole(0, 40, { mode: 'through', value: null }), hole(0, -40, { mode: 'through', value: null }));
    const res = liveOpsFromCad(faceDrawingsForCam(), GEO, []);
    expect(res.holes).toBe(2);
    expect(res.ops).toHaveLength(1);
    expect(res.ops[0]).toMatchObject({ zTop: 280, depth: 83.1, holeD: 7, faceDir: 1 });
    expect(res.ops[0].name).toMatch(/Z280/);
  });
  it('díry s jiným začátkem vrtání jsou zvlášť operace', () => {
    state.objects.push(hole(0, 40, { mode: 'through', value: null }), hole(0, 10, { mode: 'through', value: null }));
    const res = liveOpsFromCad(faceDrawingsForCam(), GEO, []);
    expect(res.ops.map(o => o.zTop).sort((a, b) => a - b)).toEqual([280, 312]);
  });
});

describe('přenos sám při otevření CAM (cadSyncOps)', () => {
  it('nové díry → operace; podruhé beze změny → null; ruční operace zůstanou', () => {
    state.objects.push(hole(0, 40, { mode: 'through', value: null }));
    const params = { liveOps: [] };
    const res = cadSyncOps(params, GEO, faceDrawingsForCam());
    expect(res && res.holes).toBe(1);
    params.liveOps = res.ops;
    expect(cadSyncOps(params, GEO, faceDrawingsForCam())).toBeNull();
    // nástroj upravený v CAM se převezme, změna polohy v CAD se přenese
    params.liveOps = res.ops.map(o => ({ ...o, toolD: 6.8 }));
    state.objects[state.objects.length - 1].cy = 30;
    const res2 = cadSyncOps(params, GEO, faceDrawingsForCam());
    expect(res2.ops[0].toolD).toBe(6.8);
  });
  it('v CAD nic → nic se nemění', () => {
    expect(cadSyncOps({ liveOps: [] }, GEO, faceDrawingsForCam())).toBeNull();
  });
});

describe('spodní polovina řezu v CAM', () => {
  it('díry 180°…360° patří pod osu, 0°…180° nad', () => {
    expect([0, 45, 90, 180, 225, 270, 315].map(lowerAngle)).toEqual([false, false, false, false, true, true, true]);
  });
  it('kreslí se jen s operacemi poháněných nástrojů', () => {
    expect(lowerHalfOn({ liveOps: [] })).toBe(false);
    state.objects.push(hole(0, 40, { mode: 'through', value: null }));
    expect(lowerHalfOn({ liveOps: liveOpsFromCad(faceDrawingsForCam(), GEO, []).ops })).toBe(true);
  });
  it('kontura: G0 dělí čáry, oblouk se navzorkuje; válcový polotovar = obdélník od osy', () => {
    const wp = [
      { xReal: 0, zReal: 0 }, { xReal: 20, zReal: 0, type: 'G1' }, { xReal: 20, zReal: -50, type: 'G1' },
      { xReal: 30, zReal: -60, type: 'G0' }, { xReal: 30, zReal: -80, type: 'G1' },
    ];
    const runs = contourRuns(wp);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: -50 }]);
    expect(stockRuns({ stockMode: 'cylinder', stockDiameter: '100', stockLength: '120', stockFace: '2' }, []))
      .toEqual([[{ x: 0, z: 2 }, { x: 50, z: 2 }, { x: 50, z: -120 }, { x: 0, z: -120 }]]);
  });
});

describe('řez v CAM jako nárys v CAD (faceSpans) a polotovar v pohledu na čelo', () => {
  it('díra na C0° a C180° leží na ose Z, C90° nahoře, C270° dole', () => {
    const op = { kind: 'drill', side: 'face', pattern: 'pcd', pcd: 80, count: 4, startAngle: 0, holeD: 7 };
    const sp = faceSpans(op).map(s => [+s.y0.toFixed(3), +s.y1.toFixed(3)]);
    expect(sp).toEqual([[-3.5, 3.5], [36.5, 43.5], [-3.5, 3.5], [-43.5, -36.5]]);
  });
  it('drážka přes svůj rozsah y (+ poloměr frézy)', () => {
    const op = { kind: 'mill', millType: 'slot', side: 'face', toolD: 8, slot: { x1: -20, y1: -10, x2: 20, y2: 30 } };
    expect(faceSpans(op)).toEqual([{ y0: -14, y1: 34, i: 0 }]);
  });
  it('liveCutAt: větší polotovar za řezem je vidět (jako bokorys CAD)', () => {
    const Ls = (x1, y1, x2, y2) => ({ ...L(x1, y1, x2, y2), isStock: true });
    const objects = [...profile(),
      Ls(-2, 0, -2, 25), Ls(-2, 25, 195, 25), Ls(195, 25, 195, 50), Ls(195, 50, 285, 50),
      Ls(285, 50, 285, 20), Ls(285, 20, 342, 20), Ls(342, 20, 342, 0)];
    const c = liveCutAt({ objects }, 300, 'right');
    expect(c.at.stockR).toBe(20);
    expect(c.stockView.visible).toContain(50);
    expect(c.stockView.visible).not.toContain(25);
  });
});

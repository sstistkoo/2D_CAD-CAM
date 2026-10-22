// ╔══════════════════════════════════════════════════════════════╗
// ║  ◎ Drážka do čela (ovál) — výkres → CAM → NC                    ║
// ╚══════════════════════════════════════════════════════════════╝
// Nástroj Drážka v bokorysu kreslí obrys drážky (stadion) do čela
// (faceView/faceSlots.js); osa a šířka z geometrie, hloubka jako díry.
// Do CAM frézování „Drážka" se šířkou slotW — širší než fréza = víc
// průjezdů kolem osy (liveModel.millMoves). (uživatel 22. 10. 2026)
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
import { stadiumOf, faceSlotPolyline, faceSlotForCam } from '../js/faceView/faceSlots.js';
import { cadDrawingsForCam } from '../js/faceView/cadForCam.js';
import { rotateObject } from '../js/geometry/transforms.js';
import { faceSlotSpec } from '../js/calculators/faceSlot.js';
import { liveOpsFromCad } from '../js/calculators/cam/live/liveFromCad.js';
import { millMoves, liveOpProblems, liveOpSummary, normalizeLiveOp, slotWidth } from '../js/calculators/cam/live/liveModel.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { buildLiveTimeline } from '../js/calculators/cam/live/liveMachining.js';
import { checkLiveOp } from '../js/calculators/cam/live/liveChecks.js';
import { profileObjects } from '../js/faceView/faceLayer.js';

const L = (x1, y1, x2, y2) => ({ type: 'line', layer: 0, x1, y1, x2, y2 });
// Kotouč Ø120 Z0…−30 (čelo vpravo Z0).
const profile = () => [L(0, 0, 0, 60), L(0, 60, -30, 60), L(-30, 60, -30, 0)];
const O = { x: 200, y: 0 };
const FACE = { id: 7, name: 'Čelo', visible: true, isFace: true, faceCurrent: true, origin: O, faceZ: 0, faceSide: 'right' };
const GEO = { faceZ: 0, outerD: 120, stockR: 65 };

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true }, { ...FACE }];
  state.objects = profile();
  state.machineType = 'soustruh';
});

describe('obrys drážky (stadion)', () => {
  it('osa a šířka z geometrie, i po otočení (Kr.pole)', () => {
    const o = faceSlotPolyline(FACE, { cx: 30, cy: 0, len: 30, w: 10, angle: 0 });
    expect(stadiumOf(o)).toEqual({ x1: 240, y1: 0, x2: 220, y2: 0, w: 10 });
    rotateObject(o, O.x, O.y, Math.PI / 2);
    const s = stadiumOf(o);
    expect(s.x1).toBeCloseTo(200, 6); expect(s.y1).toBeCloseTo(40, 6);
    expect(s.y2).toBeCloseTo(20, 6); expect(s.w).toBeCloseTo(10, 6);
  });
  it('okno: střed, délka, šířka a úhel zpět z obrysu', () => {
    const o = faceSlotPolyline(FACE, { cx: 10, cy: 20, len: 40, w: 8, angle: 135 });
    const e = faceSlotSpec(o, O);
    expect(e.cx).toBeCloseTo(10, 6); expect(e.cy).toBeCloseTo(20, 6);
    expect(e.len).toBeCloseTo(40, 6); expect(e.w).toBeCloseTo(8, 6); expect(e.angle).toBeCloseTo(135, 6);
  });
  it('jiná polylina není drážka', () => {
    expect(stadiumOf({ type: 'polyline', closed: true, vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], bulges: [0, 0, 0] })).toBe(null);
    expect(stadiumOf({ type: 'polyline', closed: false, vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }], bulges: [1, 1] })).toBe(null);
  });
  it('hloubka pro CAM jako díra: do hloubky, skrz = materiál + přesah', () => {
    const local = d => ({ ...faceSlotPolyline({ id: 7, origin: { x: 0, y: 0 } }, { cx: 30, cy: 0, len: 30, w: 10, angle: 0, depth: d }) });
    expect(faceSlotForCam(local({ mode: 'depth', value: 5 }), 0, 'right', profile(), 'soustruh'))
      .toMatchObject({ type: 'line', x1: 40, x2: 20, slotW: 10, depth: 5, depthTag: 'hl. 5' });
    expect(faceSlotForCam(local({ mode: 'through', value: null }), 0, 'right', profile(), 'soustruh').depth).toBe(34);   // 30 + 0,3·10 + 1
  });
});

describe('přenos do CAM a frézování', () => {
  const draw = spec => state.objects.push(faceSlotPolyline(FACE, { cx: 30, cy: 0, len: 30, angle: 0, depth: { mode: 'depth', value: 6 }, ...spec }));
  it('drážka → frézování Drážka se šířkou; fréza zúžena na šířku', () => {
    draw({ w: 8 });
    const { ops, slots } = liveOpsFromCad(cadDrawingsForCam(), GEO, []);
    expect(slots).toBe(1);
    expect(ops[0]).toMatchObject({ kind: 'mill', millType: 'slot', slotW: 8, toolD: 8, depth: 6, toolName: 'FREZA_D8', slot: { x1: 41, x2: 19 } });
    expect(liveOpProblems(ops[0])).toEqual([]);
  });
  it('širší drážka: fréza Ø10 zůstane, víc průjezdů kolem osy', () => {
    draw({ w: 22, len: 40 });
    const [op] = liveOpsFromCad(cadDrawingsForCam(), GEO, []).ops;
    expect(op).toMatchObject({ slotW: 22, toolD: 10 });
    expect(liveOpSummary(op)).toMatch(/Drážka š\. 22 hl\. 6 \(fréza Ø10\)/);
    const mv = millMoves({ ...op, stepDown: 6 });
    // Odsazení 5 a 6 (okraj = (22 − 10) / 2): dvě závodní dráhy s oblouky kolem konců osy.
    const arcs = mv.filter(m => m.k === 'arc');
    expect(arcs).toHaveLength(4);
    const far = Math.max(...mv.map(m => Math.abs(m.y)));
    expect(far).toBeCloseTo(6, 6);
    const prof = { objects: profileObjects().map(o => ({ ...o })), cylStock: [] };
    expect(checkLiveOp(prof, op).issues).toEqual([]);
  });
  it('úzká fréza ručně: drážka užší než fréza → chyba zadání', () => {
    const op = normalizeLiveOp({ kind: 'mill', millType: 'slot', toolD: 12, slotW: 8 });
    expect(liveOpProblems(op)).toContain('Fréza je širší než drážka.');
    expect(slotWidth(normalizeLiveOp({ kind: 'mill', millType: 'slot', toolD: 6 }))).toBe(6);   // bez šířky = Ø frézy
  });
  it('NC i simulace: polárně (C + X) i TRANSMIT, šířka sedí', () => {
    draw({ w: 22, len: 40 });
    const [op] = liveOpsFromCad(cadDrawingsForCam(), GEO, []).ops;
    for (const mode of ['spos', 'transmit']) {
      const Lb = buildLiveBlock({ controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, live: { mode }, liveOps: [{ ...op, stepDown: 6 }] });
      expect(Lb.some(l => /^G1 .*Z-6/.test(l) || /Z-6\b/.test(l))).toBe(true);
      if (mode === 'transmit') expect(Lb.filter(l => /^G[23] /.test(l)).length).toBeGreaterThan(0);
    }
    const tl = buildLiveTimeline([{ ...op, stepDown: 6 }], { rapidFeed: 6000 });
    const cut = tl.pts.filter(p => p.cut);
    expect(Math.max(...cut.map(p => Math.abs(p.y)))).toBeCloseTo(6, 1);
  });
});

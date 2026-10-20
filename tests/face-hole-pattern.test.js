// ╔══════════════════════════════════════════════════════════════╗
// ║  ◎ Bokorys: díry z Rozmístění děr do čela, roztečná kružnice  ║
// ╚══════════════════════════════════════════════════════════════╝
// „◎ Do čela" (calculators/boltCircle.js, holePattern.js) → faceView/facePattern.js:
// díry = kružnice plnou čarou, roztečná kružnice čerchovaně — pomocná, do CAM
// (faceDrawingsLocal → 📥 Z CAD) nejde a nedělá průsečíky.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('document', {
  getElementById: () => ({ disabled: false, classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '' }),
  createElement: () => ({ classList: { add: vi.fn() }, style: {}, appendChild: vi.fn(), addEventListener: vi.fn(), setAttribute: vi.fn() }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));
vi.mock('../js/ui.js', () => ({ updateObjectList: vi.fn(), updateProperties: vi.fn() }));
vi.mock('../js/geometry.js', () => ({ calculateAllIntersections: vi.fn() }));
vi.mock('../js/canvas.js', () => ({ autoCenterView: vi.fn(), drawCanvas: { width: 800, height: 600 } }));

import { state } from '../js/state.js';
import { isAuxCircle, faceDrawingsLocal } from '../js/faceView/faceLayer.js';
import { holePatternObjects, drawHolesToFace } from '../js/faceView/facePattern.js';
import { boltCircle } from '../js/calculators/boltCircleMath.js';
import { liveOpsFromCad } from '../js/calculators/cam/live/liveFromCad.js';

const FACE = { id: 7, name: 'Čelo Z0 ◀', visible: true, isFace: true, faceCurrent: true, faceZ: 0, faceSide: 'right', origin: { x: 100, y: 0 } };
const holes6 = () => boltCircle({ count: 6, pcd: 50, start: 30 }).holes;

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true }, { ...FACE, origin: { ...FACE.origin } }];
  state.objects = [{ id: 1, layer: 0, type: 'line', x1: 0, y1: 40, x2: -50, y2: 40 }];
  state.nextId = 2;
  state.activeLayer = 7;
  state.undoStack = [];
  state.redoStack = [];
  state.lineStyleActive = false;
  state.drawStockMode = false;
  state.machineType = 'soustruh';
});

describe('pomocná (roztečná) kružnice', () => {
  it('čárkovaná / čerchovaná kružnice je pomocná, plná čára je díra', () => {
    expect(isAuxCircle({ type: 'circle', r: 5, lineStyle: 'dashDot', dashed: true })).toBe(true);
    expect(isAuxCircle({ type: 'circle', r: 5, lineStyle: 'dashed' })).toBe(true);
    expect(isAuxCircle({ type: 'circle', r: 5, dashed: true })).toBe(true);
    expect(isAuxCircle({ type: 'circle', r: 5 })).toBe(false);
    expect(isAuxCircle({ type: 'circle', r: 5, lineStyle: 'solidThin' })).toBe(false);
    expect(isAuxCircle({ type: 'line', x1: 0, y1: 0, x2: 1, y2: 0, dashed: true })).toBe(false);
  });
  it('do CAM jde jen díra, roztečná kružnice se vynechá', () => {
    state.objects.push(
      { id: 2, layer: 7, type: 'circle', cx: 100, cy: 0, r: 25, lineStyle: 'dashDot', dashed: true },
      { id: 3, layer: 7, type: 'circle', cx: 125, cy: 0, r: 4 });
    const objs = faceDrawingsLocal()[0].objects;
    expect(objs.map(o => o.id)).toEqual([3]);
    const res = liveOpsFromCad(faceDrawingsLocal(), { faceZ: 0, outerD: 100 }, []);
    expect([res.holes, res.skipped]).toEqual([1, 0]);
  });
});

describe('Rozmístění děr → čelo', () => {
  it('objekty vůči středu čela: roztečná čerchovaně bez průsečíků, díry plnou čarou', () => {
    const objs = holePatternObjects(state.layers[1], { holes: holes6(), d: 8, pcd: 50, cx: 0, cy: 0 });
    expect(objs).toHaveLength(7);
    expect(objs[0]).toMatchObject({ type: 'circle', layer: 7, cx: 100, cy: 0, r: 25, lineStyle: 'dashDot', skipIntersections: true });
    expect(isAuxCircle(objs[0])).toBe(true);
    expect(objs[1]).toMatchObject({ type: 'circle', layer: 7, r: 4, dashed: false });
    expect(objs[1].cx).toBeCloseTo(100 + 25 * Math.cos(Math.PI / 6), 9);
    expect(objs[1].cy).toBeCloseTo(25 * Math.sin(Math.PI / 6), 9);
    objs.slice(1).forEach(o => expect(isAuxCircle(o)).toBe(false));
  });
  it('střed mimo osu se přičte ke středu čela, bez rozteče jen díry', () => {
    const objs = holePatternObjects(state.layers[1], { holes: [{ x: -15, y: -30 }], d: 5 });
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ cx: 85, cy: -30, r: 2.5 });
  });
  it('nakreslí do aktuálního čela jedním krokem ↩; CAM pozná roztečnou kružnici', () => {
    const n = drawHolesToFace({ holes: holes6(), d: 8, pcd: 50, cx: 0, cy: 0 });
    expect(n).toBe(6);
    expect(state.objects.filter(o => o.layer === 7)).toHaveLength(7);
    expect(state.undoStack).toHaveLength(1);
    const res = liveOpsFromCad(faceDrawingsLocal(), { faceZ: 0, outerD: 100 }, []);
    expect(res.holes).toBe(6);
    const op = res.ops.find(o => o.holeD === 8);
    expect([op.pattern, op.pcd, op.count, op.startAngle]).toEqual(['pcd', 50, 6, 30]);
  });
  it('díra zůstane dírou i se zapnutým „Typ čáry" čerchovaně', () => {
    state.lineStyleActive = true;
    state.lineStyle = { key: 'dashDot', color: null, aux: true };
    drawHolesToFace({ holes: holes6(), d: 8, pcd: 50 });
    const face = state.objects.filter(o => o.layer === 7);
    expect(face.filter(o => !isAuxCircle(o))).toHaveLength(6);
  });
  it('bez Ø díry nebo bez čela nic nekreslí', () => {
    expect(drawHolesToFace({ holes: holes6(), d: null, pcd: 50 })).toBe(0);
    state.layers[1].origin = null;
    expect(drawHolesToFace({ holes: holes6(), d: 8, pcd: 50 })).toBe(0);
    expect(state.objects).toHaveLength(1);
  });
});

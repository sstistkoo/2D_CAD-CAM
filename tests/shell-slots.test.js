// ╔══════════════════════════════════════════════════════════════╗
// ║  ⊐ Drážka pro pero v plášti — výkres → CAM → NC                ║
// ╚══════════════════════════════════════════════════════════════╝
// Nástroj Drážka: klepnutí na díl v nárysu → drážka pro pero (faceView/
// shellSlots.js); do CAM jako frézování millType 'keyway' (side radial):
// kus stojí na úhlu C, fréza Ø = šířka zanoří v X a jede v Z. (22. 10. 2026)
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
import { profileObjects } from '../js/faceView/faceLayer.js';
import { resolveShellSlot, shellSlotObject, shellSlotSpan, shellSlotsForCam } from '../js/faceView/shellSlots.js';
import { cadDrawingsForCam } from '../js/faceView/cadForCam.js';
import { shellSlotProjections } from '../js/faceView/shellHoleView.js';
import { liveOpsFromCad } from '../js/calculators/cam/live/liveFromCad.js';
import { cadSyncOps } from '../js/calculators/cam/live/liveCadSync.js';
import { keywaySpan, liveOpProblems, liveOpSummary, normalizeLiveOp } from '../js/calculators/cam/live/liveModel.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { buildLiveTimeline } from '../js/calculators/cam/live/liveMachining.js';
import { checkLiveOp } from '../js/calculators/cam/live/liveChecks.js';

const L = (x1, y1, x2, y2) => ({ type: 'line', layer: 0, x1, y1, x2, y2 });
// Hřídel Ø40 Z−200…−100, Ø60 Z−100…0 (čelo vpravo v Z0).
const profile = () => [
  L(0, 0, 0, 30), L(0, 30, -100, 30), L(-100, 30, -100, 20), L(-100, 20, -200, 20), L(-200, 20, -200, 0),
];
const SH = 9;
const spec = (o = {}) => ({ w: 8, depth: { mode: 'depth', value: 4 }, count: 1, angle: 90, ...o });
const GEO = { faceZ: 0, outerD: 60, stockR: 35 };

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true }, { id: SH, name: 'Díry v plášti', visible: true, isShell: true }];
  state.objects = profile();
  state.machineType = 'soustruh';
});

describe('plášť a hloubka drážky', () => {
  it('do hloubky / do Ø, Ø pláště z profilu', () => {
    expect(resolveShellSlot(spec(), -20, -60)).toMatchObject({ xTop: 60, depth: 4 });
    expect(resolveShellSlot(spec({ depth: { mode: 'dia', value: 52 } }), -20, -60).depth).toBe(4);
    expect(resolveShellSlot(spec(), -120, -160).xTop).toBe(40);
  });
  it('přes osazení, kratší než šířka, mimo díl → chyba', () => {
    expect(resolveShellSlot(spec(), -80, -120).error).toMatch(/osazení/);
    expect(resolveShellSlot(spec(), -20, -25).error).toMatch(/kratší/);
    expect(resolveShellSlot(spec(), 10, -10).error).toMatch(/není materiál/);
  });
  it('objekt: úsečka na plášti mezi konci, není profil', () => {
    const o = shellSlotObject(spec(), -20, -60, SH);
    expect(o).toMatchObject({ type: 'line', x1: -20, x2: -60, y1: 30, y2: 30 });
    expect(shellSlotSpan(o)).toEqual({ z1: -20, z2: -60 });
    state.objects.push(o);
    expect(profileObjects()).not.toContain(o);
  });
  it('nárys: z boku pás do hloubky, k nám stadion', () => {
    const res = { R: 30, depth: 4 };
    const [top, side] = shellSlotProjections(-20, -60, spec({ count: 2, angle: 90 }), res, 0);
    expect(top.stadium).toEqual([-60, -20, expect.closeTo(0, 6), 4]);   // C90 při C0 nahoře: míří k nám
    const [up] = shellSlotProjections(-20, -60, spec(), res, 90);
    expect(up.rect).toEqual([-60, -20, 26, 30]);
    expect(side.stadium).toBeTruthy();
  });
});

describe('přenos do CAM a NC', () => {
  const op = (o = {}) => {
    state.objects.push(shellSlotObject(spec(o), -20, -60, SH));
    return liveOpsFromCad(cadDrawingsForCam(), GEO, []).ops[0];
  };
  it('drážka → frézování Drážka pro pero na plášti', () => {
    const k = op({ count: 2, angle: 0 });
    expect(k).toMatchObject({ kind: 'mill', millType: 'keyway', side: 'radial', toolD: 8, holeD: 8, depth: 4, xTop: 60,
      kz1: -20, kz2: -60, pattern: 'pcd', count: 2, startAngle: 0, fromCad: true, toolName: 'FREZA_D8' });
    expect(keywaySpan(k)).toEqual({ zMin: -60, zMax: -20, za: -24, zb: -56 });
    expect(liveOpProblems(k)).toEqual([]);
    expect(liveOpSummary(k)).toMatch(/Pero š\. 8 hl\. 4 · Z-20…-60 – 2× po obvodu/);
    const prof = { objects: profileObjects().map(o => ({ ...o })), cylStock: [] };
    expect(checkLiveOp(prof, k).issues).toEqual([]);
    // Drážka přes osazení (ruční změna konců) → kontrola hlásí.
    expect(checkLiveOp(prof, { ...k, kz2: -120 }).sev).toBe('error');
  });
  it('normalizace drží drážku na plášti a šířku = Ø frézy', () => {
    const n = normalizeLiveOp({ kind: 'mill', millType: 'keyway', side: 'face', toolD: 10, holeD: 3, kz1: '-5', kz2: -30 });
    expect(n).toMatchObject({ side: 'radial', holeD: 10, kz1: -5 });
    expect(normalizeLiveOp({ kind: 'mill', millType: 'pocket', side: 'radial' }).side).toBe('face');
  });
  it('změna délky ve výkresu → přenos se obnoví, nástroj zůstane', () => {
    const first = [op()];
    first[0].toolName = 'FREZA_D8_Z2'; first[0].rpm = 2500;
    const o = state.objects.find(x => x.shellSlot);
    o.x2 = -70;
    const res = cadSyncOps({ liveOps: first }, GEO);
    expect(res.ops[0]).toMatchObject({ kz2: -70, toolName: 'FREZA_D8_Z2', rpm: 2500 });
  });
  const nc = (ctrl, o) => buildLiveBlock({ controlSystem: ctrl, mode: 'DIAMON', safeX: 150, safeZ: 5, live: {}, liveOps: [o] });
  it('Sinumerik: SPOS, Z na začátek, zanoření v X, vrstvy v Z tam a zpět (Ø)', () => {
    const L2 = nc('sinumerik', { ...op(), stepDown: 2, safe: 2, retract: 5 });
    const i = L2.findIndex(l => /^G0 Z-24/.test(l));
    expect(i).toBeGreaterThan(-1);
    expect(L2.slice(i + 1, i + 8)).toEqual(['G0 X70', 'G0 X64', 'G1 X56 F90', 'G1 Z-56 F300', 'G1 X52 F90', 'G1 Z-24 F300', 'G0 X70']);
    expect(L2.some(l => /^SPOS=/.test(l))).toBe(true);
    expect(L2.some(l => /G19|CYCLE|TRANSMIT/.test(l))).toBe(false);
  });
  it('Fanuc / Heidenhain: natočení C, stejné pohyby', () => {
    for (const ctrl of ['fanuc', 'heidenhain']) {
      const L2 = nc(ctrl, { ...op({ count: 2, angle: 0 }), stepDown: 4 });
      expect(L2.filter(l => /^G0 C\d/.test(l))).toHaveLength(2);
      expect(L2.filter(l => l === 'G1 Z-56 F300')).toHaveLength(2);
    }
  });
  it('simulace: zanoření a pojezd v Z na poloměru pláště − hloubka', () => {
    const tl = buildLiveTimeline([{ ...op(), stepDown: 4 }], { rapidFeed: 6000 });
    const cut = tl.pts.filter(p => p.cut);
    expect(cut.length).toBeGreaterThan(0);
    expect(Math.max(...cut.map(p => p.d))).toBeCloseTo(4, 6);
    expect(cut.some(p => Math.abs(p.z + 56) < 1e-9)).toBe(true);
    const last = cut[cut.length - 1];
    expect(Math.hypot(last.x, last.y)).toBeCloseTo(26, 6);
  });
  it('chyba drážky se přeskočí (počet v skipped)', () => {
    state.objects.push(shellSlotObject(spec(), -80, -120, SH));
    const { slots, errors } = shellSlotsForCam();
    expect(slots).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(liveOpsFromCad(cadDrawingsForCam(), GEO, []).skipped).toBe(1);
  });
});

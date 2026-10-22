// ╔══════════════════════════════════════════════════════════════╗
// ║  ⊥ Díry v plášti (radiální) — výkres → CAM → NC               ║
// ╚══════════════════════════════════════════════════════════════╝
// Díra do pláště se kreslí v nárysu (nástroj Díra, faceView/shellHoles.js),
// Ø pláště a hloubka z profilu, natočení C (i podle díry v čele), do CAM
// jako vrtání do pláště (osa X). (uživatel 22. 10. 2026)
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
import { profileObjects, isFeatureLayerId } from '../js/faceView/faceLayer.js';
import {
  resolveShellHole, shellHoleObject, shellHolesForCam, shellAngles, shellHoleZ,
} from '../js/faceView/shellHoles.js';
import { cadDrawingsForCam } from '../js/faceView/cadForCam.js';
import { shellFrontOutline } from '../js/faceView/shellHoleView.js';
import { faceHoleRefs } from '../js/calculators/shellHole.js';
import { liveOpsFromCad } from '../js/calculators/cam/live/liveFromCad.js';
import { cadSyncOps } from '../js/calculators/cam/live/liveCadSync.js';
import { livePositions } from '../js/calculators/cam/live/liveModel.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { checkLiveOp } from '../js/calculators/cam/live/liveChecks.js';

const L = (x1, y1, x2, y2) => ({ type: 'line', layer: 0, x1, y1, x2, y2 });
// Hřídel Ø40 (Z0–100), trubka Ø60 s vývrtem Ø30 (Z100–200).
const profile = () => [
  L(0, 0, 0, 20), L(0, 20, 100, 20), L(100, 20, 100, 30), L(100, 30, 200, 30),
  L(200, 30, 200, 15), L(200, 15, 100, 15), L(100, 15, 100, 0),
];
const SH = 9;
const spec = (o = {}) => ({ d: 8, depth: { mode: 'depth', value: 10 }, count: 1, angle: 90, ...o });
const GEO = { faceZ: 200, outerD: 60, stockR: 35 };

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true }, { id: SH, name: 'Díry v plášti', visible: true, isShell: true }];
  state.objects = profile();
  state.machineType = 'soustruh';
});

describe('plášť a hloubka z profilu', () => {
  it('do hloubky / do Ø / skrz stěnu do vývrtu', () => {
    expect(resolveShellHole(spec(), 50)).toMatchObject({ xTop: 40, depth: 10 });
    expect(resolveShellHole(spec({ depth: { mode: 'dia', value: 24 } }), 50)).toMatchObject({ xTop: 40, depth: 8 });
    // Stěna 30−15 = 15 + přesah 0,3·8 + 1 = 3,4.
    expect(resolveShellHole(spec({ depth: { mode: 'through', value: null } }), 150)).toMatchObject({ xTop: 60, depth: 18.4 });
    expect(resolveShellHole(spec({ depth: { mode: 'through', value: 1 } }), 150).depth).toBe(16);
  });
  it('do Ø bez zadaného Ø → chyba, ne díra do osy (null >= 0 je true)', () => {
    expect(resolveShellHole(spec({ depth: { mode: 'dia', value: null } }), 50).error).toMatch(/zadejte Ø/);
  });
  it('Z na osazení (SNAP na roh) se odmítne — plášť by byl dvojznačný', () => {
    expect(resolveShellHole(spec(), 100).error).toMatch(/osazení \(Ø40 \/ Ø60\)/);
    expect(resolveShellHole(spec(), 100.5).xTop).toBe(60);
  });
  it('díra bez vrstvy (↩ po smazání vrstvy) není profil a jde do CAM', () => {
    const o = shellHoleObject(spec(), 50, 42);   // vrstva 42 neexistuje
    state.objects.push(o);
    expect(profileObjects()).not.toContain(o);
    expect(shellHolesForCam()[0].holes).toHaveLength(1);
  });
  it('chyby: plný materiál skrz, přes osu, mimo díl', () => {
    expect(resolveShellHole(spec({ depth: { mode: 'through', value: null } }), 50).error).toMatch(/plný materiál/);
    expect(resolveShellHole(spec({ depth: { mode: 'depth', value: 25 } }), 50).error).toMatch(/přes osu/);
    expect(resolveShellHole(spec(), 300).error).toMatch(/není materiál/);
  });
  it('úhly po obvodu od úhlu C', () => {
    expect(shellAngles(spec({ count: 4, angle: 45 }))).toEqual([45, 135, 225, 315]);
    expect(shellAngles(spec({ count: 3, angle: 300 }))).toEqual([300, 60, 180]);
  });
});

describe('výkres', () => {
  it('osa díry napříč osou, vrstva děr v plášti není profil', () => {
    const o = shellHoleObject(spec(), 50, SH);
    expect(o).toMatchObject({ type: 'line', x1: 50, x2: 50, y1: 23, y2: 7, layer: SH });
    expect(shellHoleZ(o)).toBe(50);
    state.objects.push(o);
    expect(profileObjects()).not.toContain(o);
    expect(isFeatureLayerId(SH)).toBe(true);
    expect(isFeatureLayerId(0)).toBe(false);
  });
  it('karusel: osy prohozené (Z svisle, poloměr vodorovně)', () => {
    state.machineType = 'karusel';
    state.objects = profile().map(l => ({ ...l, x1: l.y1, y1: l.x1, x2: l.y2, y2: l.x2 }));
    const o = shellHoleObject(spec(), 50, SH);
    expect(o).toMatchObject({ y1: 50, y2: 50, x1: 23, x2: 7 });
    expect(shellHoleZ(o)).toBe(50);
  });
  it('obrys v nárysu: od pláště do hloubky se špičkou', () => {
    expect(shellFrontOutline(50, 8, 20, 10)).toEqual([[46, 20], [46, 10], [50, 10 - 2.4], [54, 10], [54, 20]]);
  });
  it('natočení podle díry v čele = její úhel C', () => {
    const face = { id: 7, faceZ: 200, faceSide: 'right', origin: { x: 300, y: 0 } };
    const refs = faceHoleRefs([
      { face, o: { cx: 300 + 20, cy: 20, r: 3 } },
      { face, o: { cx: 300 - 20, cy: 20, r: 3 } },
      { face, o: { cx: 300, cy: 0, r: 5 } },   // v ose — bez úhlu
    ]);
    expect(refs.map(r => r.angle)).toEqual([45, 135]);
    expect(refs[0].label).toMatch(/Ø6 .*C45°/);
  });
});

describe('přenos do CAM', () => {
  it('díry po obvodu v jedné výšce → vrtání do pláště po obvodu', () => {
    state.objects.push(shellHoleObject(spec({ count: 4, angle: 45 }), 50, SH));
    const [sh] = shellHolesForCam();
    const { ops, holes } = liveOpsFromCad([sh], GEO, []);
    expect(holes).toBe(4);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ side: 'radial', kind: 'drill', holeD: 8, depth: 10, xTop: 40, pattern: 'pcd', count: 4, startAngle: 45, zPos: 50, fromCad: true });
    const prof = { objects: profileObjects().map(o => ({ ...o })), cylStock: [] };
    expect(checkLiveOp(prof, ops[0]).issues).toEqual([]);
  });
  it('Lin.pole podél osy → seznam bodů úhel; Z, jiný plášť = jiná operace', () => {
    state.objects.push(shellHoleObject(spec(), 30, SH), shellHoleObject(spec(), 60, SH), shellHoleObject(spec({ angle: 0 }), 150, SH));
    const { ops } = liveOpsFromCad(cadDrawingsForCam(), GEO, []);
    expect(ops).toHaveLength(2);
    const shaft = ops.find(o => o.xTop === 40), tube = ops.find(o => o.xTop === 60);
    expect(shaft.pattern).toBe('points');
    expect(livePositions(shaft)).toEqual([{ a: 90, z: 60 }, { a: 90, z: 30 }]);
    expect(tube).toMatchObject({ pattern: 'pcd', count: 1, startAngle: 0, zPos: 150 });
  });
  it('nástroj z dřívější radiální operace zůstane, přenos sám i bez čel', () => {
    state.objects.push(shellHoleObject(spec(), 50, SH));
    const first = liveOpsFromCad(cadDrawingsForCam(), GEO, []).ops;
    first[0].toolName = 'VRTAK_D8_HSS'; first[0].rpm = 1500;
    state.objects.find(o => o.shellHole).shellHole.depth.value = 12;
    const res = cadSyncOps({ liveOps: first }, GEO);
    expect(res).not.toBeNull();
    expect(res.ops[0]).toMatchObject({ depth: 12, toolName: 'VRTAK_D8_HSS', rpm: 1500 });
  });
  it('díra, kterou nejde určit, do CAM nejde (přeskočena)', () => {
    state.objects.push(shellHoleObject(spec({ depth: { mode: 'through', value: null } }), 50, SH));
    const res = liveOpsFromCad(cadDrawingsForCam(), GEO, []);
    expect(res.holes).toBe(0);
    expect(res.skipped).toBe(1);
  });
  it('skrz stěnu do vývrtu z výkresu kontrola nehlásí (záměr), ruční ano', () => {
    state.objects.push(shellHoleObject(spec({ depth: { mode: 'through', value: null } }), 150, SH));
    const [op] = liveOpsFromCad(cadDrawingsForCam(), GEO, []).ops;
    expect(op.throughWall).toBe(true);
    const prof = { objects: profileObjects().map(o => ({ ...o })), cylStock: [] };
    expect(checkLiveOp(prof, op).issues).toEqual([]);
    expect(checkLiveOp(prof, { ...op, throughWall: false }).issues[0].text).toMatch(/skrz stěnu do vývrtu/);
  });
});

describe('NC výstup vrtání do pláště', () => {
  const op = () => {
    state.objects.push(shellHoleObject(spec({ count: 2, angle: 0, depth: { mode: 'depth', value: 12 } }), 50, SH));
    return { ...liveOpsFromCad(cadDrawingsForCam(), GEO, []).ops[0], peck: 4, chipMode: 'clear' };
  };
  const nc = (ctrl, cycles, o) => buildLiveBlock({ controlSystem: ctrl, mode: 'DIAMON', safeX: 150, safeZ: 5, live: { cycles }, liveOps: [o] });
  it('Sinumerik: G19 + DIAMOF, CYCLE83 v poloměru, zpět DIAMON G18', () => {
    const L = nc('sinumerik', true, op());
    const i19 = L.findIndex(l => /^G19/.test(l));
    expect(i19).toBeGreaterThan(-1);
    expect(L[i19 + 1]).toMatch(/^DIAMOF/);
    expect(L.filter(l => /^CYCLE83\(25, 20, 2, 8,/.test(l))).toHaveLength(2);   // RTP 20+5, RFP 20, DP 20−12
    expect(L.indexOf('DIAMON')).toBeGreaterThan(L.findIndex(l => /^CYCLE83/.test(l)));
  });
  it('Fanuc: G87 Z C X(Ø dna) R Q', () => {
    const L = nc('fanuc', true, op());
    expect(L.some(l => /^G87 Z50 C\d+ X16 R-3 Q4000 F/.test(l))).toBe(true);
    expect(L).toContain('G80');
  });
  it('Heidenhain: rozepsaně, dno v Ø', () => {
    const L = nc('heidenhain', true, op());
    expect(L.some(l => /CYCLE|G87/.test(l))).toBe(false);
    expect(L.filter(l => l === 'G1 X16 F120')).toHaveLength(2);
  });
});

describe('natočení pohledu (posuvník vpravo od bokorysu)', async () => {
  const { shellFrontProjections, snapViewC } = await import('../js/faceView/shellHoleView.js');
  const { frontHoles } = await import('../js/faceView/faceFrontView.js');
  const { faceViewC, setFaceViewC } = await import('../js/faceView/faceLayer.js');
  it('výchozí C nahoře: soustruh 90°, karusel 0°; uloží se do čel', () => {
    state.layers.push({ id: 7, isFace: true, faceCurrent: true, origin: { x: 300, y: 0 }, faceZ: 200, faceSide: 'right', visible: true });
    expect(faceViewC()).toBe(90);
    state.machineType = 'karusel';
    expect(faceViewC()).toBe(0);
    expect(setFaceViewC(-30)).toBe(330);
    expect(faceViewC()).toBe(330);
  });
  it('přichycení k dírám (4°) a po 45° (2°)', () => {
    expect(snapViewC(48, [51])).toBe(51);
    expect(snapViewC(44, [])).toBe(45);
    expect(snapViewC(358.5, [])).toBe(0);
    expect(snapViewC(40, [])).toBe(40);
  });
  it('díra v plášti: průmět podle C díry a C nahoře, k nám = kružnice', () => {
    const res = { R: 20, depth: 10 };
    const [up, side, down, diag] = shellFrontProjections(50, { d: 8, count: 4, angle: 90 }, res, 90);
    expect(up.pts[0]).toEqual([46, 20]);
    expect(side).toMatchObject({ circle: true, rh: 4 });   // C180 při C90 nahoře míří k nám / od nás
    expect(down.pts[0][1]).toBeCloseTo(-20, 6);
    expect(diag.circle).toBe(true);                        // C0
    const [t45] = shellFrontProjections(50, { d: 8, count: 1, angle: 0 }, res, 45);
    expect(t45.pts[0][1]).toBeCloseTo(20 * Math.SQRT1_2, 6);
  });
  it('díra v čele: výška v nárysu = průmět do směru C nahoře', () => {
    const face = { id: 7, faceZ: 200, faceSide: 'right', origin: { x: 300, y: 0 } };
    const holes = [{ face, o: { cx: 300 + 15, cy: 15, r: 3, holeDepth: { mode: 'depth', value: 10 } } }];
    const c = v => frontHoles(holes, profile(), 'soustruh', v)[0].lines.center[0][1];
    expect(c(90)).toBeCloseTo(15, 6);
    expect(c(0)).toBeCloseTo(15, 6);
    expect(c(45)).toBeCloseTo(15 * Math.SQRT2, 6);
    expect(c(225)).toBeCloseTo(-15 * Math.SQRT2, 6);
  });
});

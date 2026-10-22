// ╔══════════════════════════════════════════════════════════════╗
// ║  Závity do děr (závitník) a navrtání před vrtáním (22. 10. 2026) ║
// ╚══════════════════════════════════════════════════════════════╝
import { describe, it, expect } from 'vitest';
import { tapDepth, buildIsoTap, threadByName } from '../js/calculators/isoTaps.js';
import { liveOpsFromCad } from '../js/calculators/cam/live/liveFromCad.js';
import { withHoleExtras, spotDepth, holeKey } from '../js/calculators/cam/live/liveHoleExtras.js';
import { autoDrillTools, magazineDrills, toggleLiveGroup } from '../js/calculators/cam/live/liveDrillTools.js';
import { addCatalogTapsSpots, tapCutData, magazineTaps, isSpotSlot } from '../js/calculators/cam/live/liveTapTools.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { liveOpSummary } from '../js/calculators/cam/live/liveModel.js';
import { buildIsoDrill } from '../js/calculators/isoDrills.js';
import { _isoMagSlot } from '../js/calculators/cam/sim/magSlots.js';

const GEO = { faceZ: 0, outerD: 100 };
const hole = (cx, cy, o = {}) => ({ type: 'circle', cx, cy, r: 3.4, depth: 20, depthTag: 'hl. 20', holeThread: { name: 'M8', pitch: 1.25, depth: 17.5 }, ...o });
const face = objs => [{ z: 0, side: 'right', objects: objs }];
const pcd4 = () => [hole(30, 0), hole(0, 30), hole(-30, 0), hole(0, -30)];

describe('hloubka závitu a katalog', () => {
  it('skrz = materiál + 2P, slepá = hloubka − 2P, mělká → null', () => {
    expect(tapDepth(1.25, { through: true, thick: 10 })).toBe(12.5);
    expect(tapDepth(1.25, { depth: 20 })).toBe(17.5);
    expect(tapDepth(1.25, { depth: 3 })).toBe(null);
  });
  it('závitník z katalogu do zásobníku nese stoupání; F = P · n', () => {
    const s = _isoMagSlot(buildIsoTap({ thread: 'M10' }), 9);
    expect(s).toMatchObject({ slot: 9, shape: 'tap', radius: 5, pitch: 1.5 });
    const [t] = magazineTaps([s]);
    const c = tapCutData(t);
    expect(c.rpm).toBe(Math.round(10 * 1000 / (Math.PI * 10)));
    expect(c.feed).toBeCloseTo(1.5 * c.rpm, 6);
  });
  it('navrtávák není obyčejný vrták', () => {
    const sp = _isoMagSlot(buildIsoDrill({ kind: 'spot90', diameter: 10 }), 3);
    expect(isSpotSlot(sp)).toBe(true);
    expect(magazineDrills([sp])).toEqual([]);
  });
});

describe('operace z výkresu', () => {
  it('díra se závitem → vrtání Ø6,8 + závit M8 až po vrtání', () => {
    const { ops } = liveOpsFromCad(face(pcd4()), GEO, []);
    expect(ops.map(o => o.role || 'main')).toEqual(['main', 'tap']);
    const [drill, tap] = ops;
    expect(drill).toMatchObject({ holeD: 6.8, depth: 20, pattern: 'pcd', count: 4 });
    expect(drill.name).toMatch(/M8/);
    expect(tap).toMatchObject({ role: 'tap', holeD: 8, pitch: 1.25, depth: 17.5, peck: 0, pattern: 'pcd', count: 4, pcd: 60 });
    expect(tap.forKey).toBe(holeKey(drill));
    expect(liveOpSummary(tap)).toMatch(/Závit M8×1.25 hl. 17.5/);
  });
  it('navrtání: před všemi vrtáními, sražení Ø závitu + 2·0,5, hloubka pro 90°', () => {
    const objs = [...pcd4(), { type: 'circle', cx: 0, cy: 0, r: 5 }];
    const { ops } = liveOpsFromCad(face(objs), GEO, [], { spot: true, spotChamfer: 0.5 });
    expect(ops.map(o => o.role || 'main')).toEqual(['spot', 'spot', 'main', 'main', 'tap']);
    const spotM8 = ops.find(o => o.role === 'spot' && o.spotD === 9);
    expect(spotM8.depth).toBe(4.5);
    expect(ops.find(o => o.role === 'spot' && o.spotD === 11)).toBeTruthy();   // díra Ø10 bez závitu
    expect(spotDepth(10, 120)).toBeCloseTo(5 / Math.tan(Math.PI / 3), 3);
    // Vypnutí navrtání operace odebere.
    expect(withHoleExtras(ops, { spot: false }).some(o => o.role === 'spot')).toBe(false);
  });
  it('výběr skupiny: závit a navrtání jdou s hlavní dírou', () => {
    const objs = [...pcd4(), { type: 'circle', cx: 0, cy: 0, r: 5 }];
    const { ops } = liveOpsFromCad(face(objs), GEO, [], { spot: true });
    const tapIdx = ops.findIndex(o => o.role === 'tap');
    const next = toggleLiveGroup(ops, tapIdx, true);    // klepnutí na závit = hlavní díra M8
    const main = next.find(o => !o.role && o.holeD === 6.8);
    expect(main.enabled).toBe(false);
    next.filter(o => o.forKey === holeKey(main)).forEach(o => expect(o.enabled).toBe(false));
    expect(next.find(o => !o.role && o.holeD === 10).enabled).not.toBe(false);
  });
  it('převezme nástroj závitníku z dřívější operace; hloubku z výkresu', () => {
    const first = liveOpsFromCad(face(pcd4()), GEO, []).ops;
    first[1] = { ...first[1], toolNo: 12, rpm: 300, autoTool: false };
    const again = liveOpsFromCad(face(pcd4().map(h => ({ ...h, holeThread: { ...h.holeThread, depth: 15 } }))), GEO, first).ops;
    expect(again[1]).toMatchObject({ role: 'tap', toolNo: 12, rpm: 300, depth: 15 });
  });
  it('radiální díra se závitem → závit do pláště', () => {
    const sh = [{ kind: 'shell', holes: [{ d: 5, z: -20, xTop: 60, depth: 12, tag: 'hl. 12', angles: [0, 180], thread: { name: 'M6', pitch: 1, depth: 10 } }] }];
    const { ops } = liveOpsFromCad(sh, GEO, []);
    expect(ops[1]).toMatchObject({ role: 'tap', side: 'radial', holeD: 6, depth: 10, xTop: 60, zPos: -20 });
  });
});

describe('nástroje ze zásobníku a z 📚', () => {
  it('chybí závitník a navrtávák → přidají se z katalogu, operace je dostanou', () => {
    const { ops } = liveOpsFromCad(face(pcd4()), GEO, [], { spot: true });
    const mag = [_isoMagSlot(buildIsoDrill({ kind: 'hss', diameter: 6.8 }), 1)];
    const pre = autoDrillTools(ops, mag, {});
    expect(pre.missing.map(m => m.kind).sort()).toEqual(['spot', 'tap']);
    const added = addCatalogTapsSpots(mag, pre.missing, _isoMagSlot);
    expect(added.map(s => s.name)).toEqual(['Zavitnik HSSE B M8', 'Navrtavak 90 D10']);
    const r = autoDrillTools(ops, mag, {});
    expect(r.missing).toEqual([]);
    const [spot, drill, tap] = r.ops;
    expect(drill.toolNo).toBe(1);
    expect(spot).toMatchObject({ toolNo: 3, spotAngle: 90, depth: 4.5 });
    expect(tap.toolNo).toBe(2);
    expect(tap.feed).toBeCloseTo(1.25 * tap.rpm, 6);
  });
});

describe('NC závitování', () => {
  const tapOps = () => liveOpsFromCad(face(pcd4()), GEO, []).ops;
  const block = (ctrl, live = {}) => buildLiveBlock({ controlSystem: ctrl, mode: 'DIAMON', safeX: 150, safeZ: 5, live, liveOps: tapOps() });
  it('Sinumerik: SETMS + CYCLE84 se stoupáním a otáčkami', () => {
    const L = block('sinumerik');
    const i = L.findIndex(l => l.startsWith('CYCLE84('));
    expect(i).toBeGreaterThan(0);
    expect(L.filter(l => l.startsWith('SETMS(2)'))).toHaveLength(1);
    expect(L.findIndex(l => l.startsWith('SETMS(2)'))).toBeLessThan(i);
    expect(L.findLastIndex(l => /^SETMS\b(?!\()/.test(l))).toBeGreaterThan(L.findLastIndex(l => l.startsWith('CYCLE84(')));
    expect(L[i]).toMatch(/CYCLE84\(5, 0, 2, -17\.5, , 0, 3, , 1\.25, 0, \d+, \d+\)/);
  });
  it('Fanuc: M29 S + G84 s F = P · n', () => {
    const L = block('fanuc');
    const g = L.find(l => l.startsWith('G84 '));
    const s = +/M29 S(\d+)/.exec(L.find(l => l.startsWith('M29')))[1];
    expect(+/F([\d.]+)/.exec(g)[1]).toBeCloseTo(1.25 * s, 3);
    expect(g).toMatch(/Z-17\.5/);
  });
  it('bez cyklů / Heidenhain: rozepsaně s reverzem nástroje', () => {
    const L = block('heidenhain');
    expect(L.some(l => /M4\b/.test(l))).toBe(true);
    expect(L.some(l => /^G1 Z-17\.5 F/.test(l))).toBe(true);
    expect(block('sinumerik', { cycles: false }).some(l => /M2=4/.test(l))).toBe(true);
  });
  it('radiální závit Fanuc G88', () => {
    const sh = [{ kind: 'shell', holes: [{ d: 5, z: -20, xTop: 60, depth: 12, tag: '', angles: [0], thread: { name: 'M6', pitch: 1, depth: 10 } }] }];
    const L = buildLiveBlock({ controlSystem: 'fanuc', mode: 'DIAMON', safeX: 150, safeZ: 5, live: {}, liveOps: liveOpsFromCad(sh, GEO, []).ops });
    expect(L.some(l => /^G88 Z-20 C\S+ X40/.test(l))).toBe(true);
    expect(threadByName('m6').pitch).toBe(1);
  });
});

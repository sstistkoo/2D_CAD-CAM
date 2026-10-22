// ╔══════════════════════════════════════════════════════════════╗
// ║  ✣ Frézy v zásobníku a jejich výběr pro frézování z výkresu    ║
// ╚══════════════════════════════════════════════════════════════╝
// Fréza = slot zásobníku `shape: 'mill'` (Ø, z, Vc, fz, řeže středem),
// 📚 katalog fréz (isoMills.js), výběr podle operace a řezné podmínky
// (cam/live/liveMillTools.js), číslo T mimo jiné nástroje. (22. 10. 2026)
import { describe, it, expect } from 'vitest';
import { buildIsoMill, isoMillDiameters, millFz, ISO_MILL_KINDS } from '../js/calculators/isoMills.js';
import { magazineMills, millCutData, pickMill, autoMillTools, addCatalogMills, catalogMillD, millToolText } from '../js/calculators/cam/live/liveMillTools.js';
import { autoDrillTools } from '../js/calculators/cam/live/liveDrillTools.js';
import { normalizeLiveOp } from '../js/calculators/cam/live/liveModel.js';
import { checkLiveOp } from '../js/calculators/cam/live/liveChecks.js';
import { _isoMagSlot, _setMagSlotShape, _defaultMagSlot } from '../js/calculators/cam/sim/magSlots.js';

const millSlot = (slot, d, o = {}) => ({ ..._isoMagSlot(buildIsoMill({ kind: 'hm3', diameter: d }), slot), ...o });
const knife = slot => ({ ..._defaultMagSlot(slot), shape: 'parting', name: 'Upichovak' });
const pocket = (o = {}) => normalizeLiveOp({ kind: 'mill', millType: 'pocket', holeD: 20, toolD: 10, toolNo: 6, depth: 5, ...o });

describe('📚 katalog fréz', () => {
  it('fréza VHM Ø10 z3: tvar, Vc, fz, řeže středem, jméno bez diakritiky', () => {
    const r = buildIsoMill({ kind: 'hm3', diameter: 10 });
    expect(r).toMatchObject({ name: 'Freza HM Z3 D10', vc: 120, teeth: 3, centerCut: true, tool: { toolShape: 'mill', toolRadius: 5 } });
    expect(r.f).toBe(millFz(10, true));
    expect(buildIsoMill({ kind: 'hss4', diameter: 8 }).centerCut).toBe(false);
    expect(isoMillDiameters()).toContain(6);
    expect(ISO_MILL_KINDS.length).toBe(4);
  });
  it('slot zásobníku z katalogu nese zuby a řez středem; tvar ✣ dá výchozí frézu', () => {
    const s = millSlot(9, 8);
    expect(s).toMatchObject({ slot: 9, shape: 'mill', radius: 4, teeth: 3, centerCut: true, vc: 120 });
    const t = _defaultMagSlot(4);
    _setMagSlotShape(t, 'mill');
    expect(t).toMatchObject({ slot: 4, shape: 'mill', radius: 5, teeth: 3 });
  });
});

describe('výběr frézy a řezné podmínky', () => {
  const mag = [knife(6), millSlot(9, 8), millSlot(10, 16), millSlot(11, 6, { centerCut: false })];
  it('otáčky a posuv z Vc, fz a zubů', () => {
    const [m] = magazineMills([millSlot(9, 10)]);
    const c = millCutData(m);
    expect(c.rpm).toBe(Math.round(120 * 1000 / (Math.PI * 10)));
    expect(c.feed).toBe(Math.round(m.fz * 3 * c.rpm));
  });
  it('kapsa: největší fréza, která se vejde; drážka a pero: přesně šířka; širší drážka: ≤ šířka', () => {
    const ms = magazineMills(mag);
    expect(pickMill(ms, pocket({ holeD: 20 })).mill.D).toBe(16);
    expect(pickMill(ms, pocket({ holeD: 12 })).mill.D).toBe(8);
    expect(pickMill(ms, normalizeLiveOp({ kind: 'mill', millType: 'slot', toolD: 8 })).mill.D).toBe(8);
    expect(pickMill(ms, normalizeLiveOp({ kind: 'mill', millType: 'slot', toolD: 10 })).mill).toBe(null);
    expect(pickMill(ms, normalizeLiveOp({ kind: 'mill', millType: 'slot', toolD: 10, slotW: 22 })).mill.D).toBe(16);
    expect(pickMill(ms, normalizeLiveOp({ kind: 'mill', millType: 'keyway', toolD: 6 })).mill.slot).toBe(11);
  });
  it('doplní T, jméno, Ø, otáčky, posuv a krok; ručně změněné nechá', () => {
    const { ops, filled } = autoMillTools([pocket(), pocket({ autoTool: false })], mag);
    expect(filled).toHaveLength(1);
    expect(ops[0]).toMatchObject({ toolNo: 10, toolName: 'Freza HM Z3 D16', toolD: 16, toolCenterCut: true });
    expect(ops[0].stepDown).toBeLessThanOrEqual(ops[0].depth);
    expect(ops[1].toolNo).toBe(6);
  });
  it('chybí fréza → nabídka z katalogu a T mimo upichovák (dřív T6 → Fanuc T0606)', () => {
    const { ops, missing } = autoMillTools([normalizeLiveOp({ kind: 'mill', millType: 'keyway', toolD: 12, toolNo: 6 })], [knife(6), millSlot(9, 8)]);
    expect(missing[0]).toMatchObject({ kind: 'mill', D: 12 });
    expect(ops[0].toolNo).toBe(10);
    expect(millToolText(ops[0], [knife(6)])).toMatch(/fréza Ø12 není v 🔧 Zásobníku/);
    expect(catalogMillD({ exact: 7 })).toBe(null);
    expect(catalogMillD({ max: 15 })).toBe(14);
  });
  it('přidání z katalogu (jednou na Ø, další volné T) a vrtání + frézování najednou', () => {
    const m2 = [knife(6)];
    const added = addCatalogMills(m2, [12, 12, 6], _isoMagSlot);
    expect(added.map(s => [s.slot, s.name])).toEqual([[7, 'Freza HM Z3 D12'], [8, 'Freza HM Z3 D6']]);
    const r = autoDrillTools([normalizeLiveOp({ kind: 'drill', holeD: 8 }), pocket({ holeD: 14 })], m2, {});
    expect(r.ops[1]).toMatchObject({ toolNo: 7, toolD: 12 });
    expect(r.missing.some(x => x.kind !== 'mill' && x.D === 8)).toBe(true);
  });
  it('fréza, která neřeže středem → varování kontroly', () => {
    const op = { ...pocket({ toolCenterCut: false, holeD: 10.2 }), zTop: 0, pcd: 0, count: 1 };   // na šroubovici málo místa
    const prof = { objects: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: 50 }, { type: 'line', x1: 0, y1: 50, x2: -20, y2: 50 }, { type: 'line', x1: -20, y1: 50, x2: -20, y2: 0 }], cylStock: [] };
    expect(checkLiveOp(prof, op).issues.some(x => /neřeže středem/.test(x.text))).toBe(true);
  });
});

describe('zanoření frézy, která neřeže středem (rampa 3°)', async () => {
  const { millMoves, keywayPath, rampPossible, RAMP_DEG } = await import('../js/calculators/cam/live/liveModel.js');
  const { buildLiveBlock } = await import('../js/calculators/cam/live/liveGcode.js');
  const tan = Math.tan(RAMP_DEG * Math.PI / 180);
  const slope = mv => {
    let worst = 0;
    for (let i = 1; i < mv.length; i++) {
      const a = mv[i - 1], b = mv[i];
      if (b.k !== 'lin' || !(b.z < a.z - 1e-9) || b.z >= -1e-9) continue;   // klesání v materiálu (pod Z0)
      const run = Math.hypot(b.x - a.x, b.y - a.y);
      worst = Math.max(worst, run > 1e-9 ? (a.z - b.z) / run : Infinity);
    }
    return worst;
  };
  const slot = (o = {}) => normalizeLiveOp({ kind: 'mill', millType: 'slot', toolD: 8, depth: 4, stepDown: 2, zTop: 0, slot: { x1: 0, y1: 20, x2: 0, y2: 40 }, ...o });
  it('drážka: kolmo jen řezající středem, jinak cik-cak po ose se sklonem ≤ 3°', () => {
    expect(slope(millMoves(slot()))).toBe(Infinity);
    const mv = millMoves(slot({ toolCenterCut: false }));
    expect(slope(mv)).toBeLessThanOrEqual(tan + 1e-9);
    expect(Math.min(...mv.map(m => m.z))).toBeCloseTo(-4, 9);
    // Na každé hloubce projede celou osu (oba konce).
    [-2, -4].forEach(z => [20, 40].forEach(y => expect(mv.some(m => Math.abs(m.z - z) < 1e-9 && Math.abs(m.y - y) < 1e-9)).toBe(true)));
  });
  it('kapsa: šroubovice uvnitř, malá kapsa rampou nejde (kontrola hlásí)', () => {
    const p = pocket({ holeD: 30, toolD: 10, toolCenterCut: false, zTop: 0, pcd: 0, count: 1 });
    const mv = millMoves(p);
    expect(slope(mv)).toBeLessThanOrEqual(tan + 1e-6);
    expect(Math.max(...mv.map(m => Math.hypot(m.x, m.y)))).toBeLessThanOrEqual(15 - 5 + 1e-9);
    expect(rampPossible(p)).toBe(true);
    expect(rampPossible({ ...p, holeD: 10.2 })).toBe(false);
  });
  it('pero: cik-cak v Z se sklonem ≤ 3°, NC G1 X… Z…', () => {
    const k = normalizeLiveOp({ kind: 'mill', millType: 'keyway', toolD: 8, depth: 4, stepDown: 2, xTop: 60, kz1: -20, kz2: -60, count: 1, toolCenterCut: false, feed: 300 });
    const path = keywayPath(k);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (b.f === 'ramp') expect((b.d - a.d) / Math.abs(b.z - a.z)).toBeLessThanOrEqual(tan + 1e-9);
      expect(b.f).not.toBe('plunge' === b.f && b.d > 0 ? 'plunge' : '__');
    }
    expect(Math.max(...path.map(q => q.d))).toBeCloseTo(4, 9);
    const L = buildLiveBlock({ controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, live: {}, liveOps: [k] });
    expect(L.some(l => /^G1 X\d[\d.]* Z-\d/.test(l))).toBe(true);
    expect(L.some(l => /rampou/.test(l))).toBe(true);
  });
  it('polárně (C + X) se Z na rampě mění spojitě, ne skokem', () => {
    const L = buildLiveBlock({ controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, live: { mode: 'caxis' }, liveOps: [slot({ toolCenterCut: false, slot: { x1: 0, y1: 20, x2: 0, y2: 60 } })] });
    const zs = L.filter(l => /^G1 X/.test(l)).map(l => +/Z(-?[\d.]+)/.exec(l)[1]);
    const jumps = zs.slice(1).map((z, i) => Math.abs(z - zs[i]));
    expect(Math.max(...jumps)).toBeLessThan(0.2);
  });
});

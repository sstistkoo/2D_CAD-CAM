// Výběr děr k vrtání a vrták ze 🔧 Zásobníku podle Ø (cam/live/liveDrillTools.js),
// nevybrané skupiny se nevrtají (NC blok, časová osa obrábění).
import { describe, it, expect } from 'vitest';
import { magazineDrills, pickDrill, drillCutData, autoDrillTools, toggleLiveGroup, drillToolText } from '../js/calculators/cam/live/liveDrillTools.js';
import { newLiveOp, normalizeLiveOp, liveOpOn } from '../js/calculators/cam/live/liveModel.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { buildLiveTimeline, liveStateAt } from '../js/calculators/cam/live/liveMachining.js';

const geo = { faceZ: 0, outerD: 100 };
const op = over => normalizeLiveOp({ ...newLiveOp('drill', geo, 1), ...over });
const MAG = [
  { slot: 1, name: 'SCLCR', shape: 'round', radius: 0.8, vc: 200, f: 0.25 },
  { slot: 9, name: 'Vrtak HSS D10', shape: 'drill', radius: 5, vc: 25, f: 0.15 },
  { slot: 7, name: 'Vrtak HSS D7', shape: 'drill', radius: 3.5, vc: 22, f: 0.1 },
];

describe('vrták podle Ø díry', () => {
  it('jen vrtáky ze zásobníku, podle T', () => {
    expect(magazineDrills(MAG).map(d => [d.slot, d.D])).toEqual([[7, 7], [9, 10]]);
  });
  it('na Ø díry, jinak nejbližší jako nápověda', () => {
    const ds = magazineDrills(MAG);
    expect(pickDrill(ds, 7).drill.slot).toBe(7);
    const p = pickDrill(ds, 8);
    expect(p.drill).toBe(null);
    expect(p.near.slot).toBe(7);
  });
  it('otáčky a posuv poháněného vrtáku z Vc a f', () => {
    const c = drillCutData({ D: 7, vc: 22, f: 0.1 });
    expect(c.rpm).toBe(Math.round(22000 / (Math.PI * 7)));   // 1000
    expect(c.feed).toBe(Math.round(0.1 * c.rpm));
  });
  it('doplní vybrané, ručně změněné a nevybrané nechá; Q a prodlevu operace nepřepíše (29. 10. 2026)', () => {
    const ops = [op({ holeD: 7, toolNo: 5, peck: 2, dwell: 0.2, safe: 1 }), op({ holeD: 10, enabled: false }), op({ holeD: 7, autoTool: false, toolNo: 3 }), op({ holeD: 8 })];
    const r = autoDrillTools(ops, MAG, { drillPeck: 4, drillDwell: 0.5, drillClearance: 3 });
    expect(r.ops[0]).toMatchObject({ toolNo: 7, toolName: 'Vrtak HSS D7', peck: 2, dwell: 0.2, safe: 1 });
    expect(r.ops[1].toolNo).toBe(ops[1].toolNo);
    expect(r.ops[2].toolNo).toBe(3);
    expect(r.missing).toEqual([{ op: 3, D: 8, near: expect.objectContaining({ slot: 7 }) }]);
    expect(drillToolText(r.ops[3], MAG)).toMatch(/není v 🔧 Zásobníku/);
  });
});

describe('výběr skupin děr', () => {
  const ops = [op({ name: 'A' }), op({ name: 'B' }), op({ name: 'C' })];
  it('první klepnutí, když se vrtá vše = jen tahle skupina; další klepnutí přepíná', () => {
    let s = toggleLiveGroup(ops, 1);
    expect(s.map(liveOpOn)).toEqual([false, true, false]);
    s = toggleLiveGroup(s, 2);
    expect(s.map(liveOpOn)).toEqual([false, true, true]);
    s = toggleLiveGroup(s, 1);
    expect(s.map(liveOpOn)).toEqual([false, false, true]);
  });
  it('zaškrtávátko jen přepíná (i když se vrtá vše)', () => {
    expect(toggleLiveGroup(ops, 1, true).map(liveOpOn)).toEqual([true, false, true]);
  });
  it('nevybrané se nevrtají: NC blok i čas obrábění', () => {
    const two = [op({ name: 'Díry A', holeD: 7 }), op({ name: 'Díry B', holeD: 10, enabled: false })];
    const block = buildLiveBlock({ controlSystem: 'sinumerik', liveOps: two }).join('\n');
    expect(block).toContain('Díry A');
    expect(block).not.toContain('Díry B');
    const tl = buildLiveTimeline(two, {});
    const end = liveStateAt(tl, tl.total);
    expect(end.depth.has('0:0')).toBe(true);
    expect([...end.depth.keys()].some(k => k.startsWith('1:'))).toBe(false);
    expect(buildLiveBlock({ controlSystem: 'sinumerik', liveOps: [two[1]] })).toEqual([]);
  });
});

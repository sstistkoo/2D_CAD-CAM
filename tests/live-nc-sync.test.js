// Přehrávání bloku poháněných nástrojů (cam/live/liveNcSync.js, uživatel
// 21. 10. 2026: „nevygenerovaly se mi dráhy na to vrtání, mám tam v G kódu
// jenom G0 X150 Z5"): řádek G-kódu podle stavu obrábění, údaj nad časem,
// dráhy středu nástroje v řezu.
import { describe, it, expect } from 'vitest';
import { liveCodeLine, liveMotionText, livePathSegments } from '../js/calculators/cam/live/liveNcSync.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { newLiveOp } from '../js/calculators/cam/live/liveModel.js';
import { buildLiveTimeline, liveStateAt } from '../js/calculators/cam/live/liveMachining.js';

const geo = { faceZ: 0, outerD: 100 };
const drill = o => ({ ...newLiveOp('drill', geo, 1), pcd: 60, count: 2, depth: 10, peck: 0, dwell: 0, ...o });
const prms = o => ({ controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, ...o });

describe('řádek G-kódu při přehrávání', () => {
  const ops = [drill({ name: 'A', enabled: false }), drill({ name: 'B' }), drill({ name: 'C', count: 3 })];
  const P = prms({ liveOps: ops });
  const lines = ['N10 G0 X150 Z5', ...buildLiveBlock(P), 'M30'];
  const tl = buildLiveTimeline(ops, P);
  it('vrtání druhé díry operace C (v bloku [2] — nevybraná A se nečísluje) → řádek cyklu', () => {
    const p = tl.pts.find(q => q.op === 2 && q.hole === 1 && q.cut);
    const m = liveStateAt(tl, p.t - 0.01);   // uprostřed posuvu
    const li = liveCodeLine(lines, ops, m);
    expect(lines[li]).toMatch(/^CYCLE8/);
    expect(lines.slice(0, li).reverse().find(l => /díra/.test(l))).toMatch(/díra 2/);
    expect(lines.slice(0, li).reverse().find(l => /^; \[\d\]/.test(l))).toMatch(/^; \[2\] C:/);
  });
  it('najetí na díru → řádek polohy „díra k"', () => {
    const p = tl.pts.find(q => q.op === 1 && q.hole === 1 && q.gap);
    const li = liveCodeLine(lines, ops, liveStateAt(tl, p.t - 0.05));
    expect(lines[li]).toMatch(/díra 2/);
  });
  it('bez bloku v programu nebo mimo obrábění → null', () => {
    const m = liveStateAt(tl, 1);
    expect(liveCodeLine(['G0 X150 Z5'], ops, m)).toBe(null);
    expect(liveCodeLine(lines, ops, liveStateAt(tl, tl.total))).toBe(null);
  });
  it('údaj nad časem: při řezu nástroj, otáčky a posuv; jinak G0', () => {
    const cut = liveStateAt(tl, tl.pts.find(q => q.cut).t - 0.01);
    expect(liveMotionText(ops, cut).text).toMatch(/T5 VRTAK_D8 · 2000 ot\/min · F 120 mm\/min/);
    expect(liveMotionText(ops, liveStateAt(tl, 0.01)).rapid).toBe(true);
  });
});

describe('dráhy v řezu', () => {
  it('čelo: bezpečná X → Z odjezdu → poloměr díry → posuvem do hloubky → zpět', () => {
    const segs = livePathSegments([drill({ count: 4 })], prms());
    const feed = segs.filter(s => !s.rapid);
    expect(feed).toHaveLength(1);                         // 4 díry na jednom poloměru = jedna čára
    expect(feed[0]).toEqual({ a: { x: 30, z: 2 }, b: { x: 30, z: -10 }, rapid: false });
    expect(segs[0]).toEqual({ a: { x: 75, z: 5 }, b: { x: 30, z: 5 }, rapid: true });   // Ø150 → poloměr 75
    expect(segs[segs.length - 1].b).toEqual({ x: 75, z: 5 });   // konec na bezpečné poloze
  });
  it('čelo zleva: odjezd X před Z (ne šikmo přes díl)', () => {
    const segs = livePathSegments([drill({ zTop: -50, faceDir: -1 })], prms());
    segs.filter(s => s.rapid).forEach(s => expect(s.a.x === s.b.x || s.a.z === s.b.z).toBe(true));
  });
  it('chybné zadání a nevybraná skupina se nekreslí (jako v NC)', () => {
    expect(livePathSegments([drill({ depth: -1 }), drill({ enabled: false })], prms())).toEqual([]);
  });
});

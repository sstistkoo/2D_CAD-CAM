// Přehrávání bloku poháněných nástrojů (cam/live/liveNcSync.js, uživatel
// 21. 10. 2026: „nevygenerovaly se mi dráhy na to vrtání, mám tam v G kódu
// jenom G0 X150 Z5"): řádek G-kódu podle stavu obrábění, údaj nad časem,
// dráhy středu nástroje v řezu.
import { describe, it, expect } from 'vitest';
import { liveCodeLine, liveMotionText, livePathSegments, showLiveCodeLine } from '../js/calculators/cam/live/liveNcSync.js';
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

describe('odvod třísky a rozepsaný kód (uživatel 21. 10. 2026)', () => {
  // Všechny okamžiky jedné díry (bez najetí) → řádky, na kterých se stálo.
  const linesDuring = (ops, P, hole) => {
    const lines = buildLiveBlock(P);
    const tl = buildLiveTimeline(ops, P);
    const pts = tl.pts.filter(q => q.hole === hole);
    const out = [];
    for (let t = pts[1].t - 0.001; t < pts[pts.length - 1].t; t += 0.002) {   // odskok 1 mm trvá ~6 ms
      const m = liveStateAt(tl, t);
      if (m.active && m.active.hole === hole && m.step > 0) out.push(lines[liveCodeLine(lines, ops, m)]);
    }
    return [...new Set(out)];
  };
  it('cyklus s vyjížděním: celé vrtání díry na řádku CYCLE83 (ne střídavě s řádkem díry)', () => {
    const ops = [drill({ peck: 3, depth: 10 })];
    expect(linesDuring(ops, prms({ liveOps: ops }), 1)).toEqual(['CYCLE83(5, 0, 2, -10, , -3, , 0, 0, 0, 1, 1)']);
  });
  it('rozepsaně: řádek po řádku — R rovina, záběry, vyjetí, návrat, odjezd', () => {
    const ops = [drill({ peck: 4, depth: 10, dwell: 0.5 })];
    const P = { ...prms({ liveOps: ops }), live: { cycles: false } };
    expect(linesDuring(ops, P, 1)).toEqual([
      'G0 Z2', 'G1 Z-4 F120', 'G0 Z-3.7', 'G1 Z-8 F120', 'G0 Z-7.7', 'G1 Z-10 F120', 'G4 F0.5', 'G0 Z5',
    ]);
  });
  it('rozepsaně s lámáním třísky: záběr, odskok, záběr… (simulace = NC)', () => {
    const ops = [drill({ peck: 4, depth: 10, chipMode: 'break', chipBack: 1 })];
    const P = { ...prms({ liveOps: ops }), live: { cycles: false } };
    expect(linesDuring(ops, P, 1)).toEqual(['G0 Z2', 'G1 Z-4 F120', 'G0 Z-3', 'G1 Z-8 F120', 'G0 Z-7', 'G1 Z-10 F120', 'G0 Z5']);
  });
  it('rozepsaně do pláště: najetí X k plášti se přeskočí, záběr = G1 X', () => {
    const ops = [drill({ side: 'radial', count: 2, xTop: 80, zPos: -20, depth: 8, peck: 0 })];
    const P = { ...prms({ liveOps: ops }), live: { cycles: false } };
    expect(linesDuring(ops, P, 0)).toEqual(['G0 X42', 'G1 X32 F120', 'G0 X45']);
  });
  it('„4 řádky": překreslí se jen při změně řádku', () => {
    const calls = [];
    const mini = { dataset: {}, children: [{}, { textContent: '' }] };
    const root = { querySelector: s => (s.includes('mini') ? mini : null) };
    const lines = ['G0 X150 Z5', 'G0 X60 ; díra 1', 'CYCLE83(…)'];
    const render = (box, ls, i) => { calls.push(i); box.children[1].textContent = ls[i]; };
    showLiveCodeLine(root, 2, lines, render);
    showLiveCodeLine(root, 2, lines, render);
    showLiveCodeLine(root, 1, lines, render);
    expect(calls).toEqual([2, 1]);
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
  it('karusel: nástroj vpravo (0°) → dráha na poloměru díry, ne na ose', () => {
    const feed = livePathSegments([drill({ count: 4 })], prms({ machineStructure: 'carousel' })).filter(s => !s.rapid);
    expect(feed[0].a.x).toBeCloseTo(30, 9);
  });
  it('do pláště stejné výšky: mezi dírami jen natočení C, ne ven na bezpečnou X', () => {
    const segs = livePathSegments([drill({ side: 'radial', count: 3, xTop: 80, zPos: -20, depth: 8 })], prms());
    // Z na výšku díry na začátku, na konci ven na X a zpět na Z — mezi dírami nic.
    expect(segs.filter(s => s.b.x === 75)).toHaveLength(3);
  });
  it('chybné zadání a nevybraná skupina se nekreslí (jako v NC)', () => {
    expect(livePathSegments([drill({ depth: -1 }), drill({ enabled: false })], prms())).toEqual([]);
  });
});

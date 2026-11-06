// Snížené posuvy: u čela v cik caku (ops/zigzagFeed.js) a při zanoření ve
// všech hrubovacích strategiích (cam/feedTuning.js). Dráha se nemění.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { zigzagFeedPlan, zigzagWallFeed, wedgeEngagement } from '../js/calculators/cam/ops/zigzagFeed.js';
import { tuneFeeds, plungeFeedFactor } from '../js/calculators/cam/feedTuning.js';

// Tvar pohybů z lathe-zigzag-stock-valley (ap 10, 45°, R 5): vjezd rampou u
// pravého čela, vrstva doleva, rampa od levého čela, vrstva doprava…
const MOVES = [
  { g: 'G0', x: 141, z: 614.74 }, { g: 'G1', x: 131, z: 604.74 },
  { g: 'G1', x: 131, z: 293.57 }, { g: 'G1', x: 121, z: 303.57 },
  { g: 'G1', x: 121, z: 603.23 }, { g: 'G1', x: 111, z: 593.23 },
  { g: 'G1', x: 111, z: 298.18 },
];
const P = { feed: 0.2, toolRadius: 20, feedWallOn: true, feedPctWall: 50 };

describe('posuv u čela (cik cak)', () => {
  it('bez zaškrtnutí nic', () => {
    expect(zigzagWallFeed({ feedPctWall: 50 })).toBeNull();
    expect(zigzagWallFeed({ feedWallOn: true, feedPctWall: 100 })).toBeNull();
  });
  it('snížení až od dotyku klínu, ne celou šířku klínu + R', () => {
    const b = zigzagFeedPlan(MOVES, P).map(s => [s.x, +s.z.toFixed(2), s.f && +s.f.toFixed(3)]);
    // první příjezd k levému čelu: klín tam není → plný posuv, žádné dělení
    expect(b[1]).toEqual([131, 293.57, 0.2]);
    const wall = b.filter(s => s[2] === 0.1);
    expect(wall.length).toBe(2);
    // Kus se sníženým posuvem je kratší než šířka klínu + R (15 mm).
    const i = b.findIndex(s => s[2] === 0.1);
    const L = Math.abs(b[i][1] - b[i - 1][1]);
    expect(L).toBeGreaterThan(0.5);
    expect(L).toBeLessThan(10 + 20);
  });
  it('wedgeEngagement: přebytek klínu > 0, bez rampy u stěny null', () => {
    const e = wedgeEngagement({ x: 131, z: 604.74 }, { x: 121, z: 594.74 }, { x: 111, z: 300 }, { x: 111, z: 600 }, 20);
    expect(e && e.h).toBeGreaterThan(0);
    // ap 10 ≥ R 5: kružnice nad dno předchozí vrstvy nedosáhne → klín se nezabírá.
    expect(wedgeEngagement({ x: 131, z: 604.74 }, { x: 121, z: 594.74 }, { x: 111, z: 300 }, { x: 111, z: 600 }, 5)).toBeNull();
  });
  it('Auto: % podle ap / (ap + přebytek)', () => {
    const b = zigzagFeedPlan(MOVES, { ...P, feedWallAuto: true });
    const red = b.filter(s => s.wall);
    expect(red.length).toBe(2);
    for (const s of red) { expect(s.f).toBeLessThan(0.2); expect(s.f).toBeGreaterThanOrEqual(0.05 - 1e-9); }
  });
});

describe('posuv při zanoření (feedTuning)', () => {
  it('bez zaškrtnutí 1', () => {
    expect(plungeFeedFactor({ feedPctPlunge: 50 })).toBe(1);
    expect(plungeFeedFactor({ feedPlungeOn: true, feedPctPlunge: 50 })).toBe(0.5);
  });
  it('rampa dostane % F, další blok zpět na F (i modální bez F)', () => {
    const tag = { axis: 'x', sign: -1 };
    const L = [
      { text: 'N10 G1 X20 Z10 F0.2', from: { x: 10, z: 20 }, to: { x: 10, z: 10 }, tag },
      { text: 'N20 G1 X16 Z6 ; Rampa', from: { x: 10, z: 10 }, to: { x: 8, z: 6 }, tag },
      { text: 'N30 G1 Z0', from: { x: 8, z: 6 }, to: { x: 8, z: 0 }, tag },
    ];
    tuneFeeds(L, { feedPlungeOn: true, feedPctPlunge: 50, mode: 'DIAMON' });
    expect(L.map(l => l.text)).toEqual(['N10 G1 X20 Z10 F0.2', 'N20 G1 X16 Z6 F0.1 ; Rampa', 'N30 G1 Z0 F0.2']);
  });
  it('metadata nesedí s textem → beze změny', () => {
    const L = [{ text: 'N10 G1 X99 Z6 F0.2', from: { x: 10, z: 10 }, to: { x: 8, z: 6 }, tag: { axis: 'x', sign: -1 } }];
    tuneFeeds(L, { feedPlungeOn: true, feedPctPlunge: 50, mode: 'DIAMON' });
    expect(L[0].text).toBe('N10 G1 X99 Z6 F0.2');
  });
});

const caseFile = (n) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', n), 'utf8'));
const key = (p) => `${p.x.toFixed(3)}|${p.z.toFixed(3)}`;
const samePath = (a, b) => { const s = new Set(b.calcSim.simPath.map(key)); return a.calcSim.simPath.filter(p => !s.has(key(p))); };

describe('na dílu', () => {
  it('cik cak: zanoření + u čela, dráha stejná', async () => {
    const prog = caseFile('lathe-zigzag-stock-valley.camprog');
    const base = { ...prog.params, roughingStrategy: 'zigzag', doFinishing: false };
    const off = await runCamProg({ ...prog, params: base });
    const on = await runCamProg({ ...prog, params: { ...base, feedPlungeOn: true, feedPctPlunge: 50, feedWallOn: true, feedPctWall: 50 } });
    const half = String(parseFloat((parseFloat(base.feed) / 2).toFixed(3)));
    expect(on.gcode).toContain(`F${half}`);
    expect(samePath(off, on)).toEqual([]);
  }, 120000);
  it('podélně se zanořováním: rampy na % F, dráha stejná', async () => {
    const prog = JSON.parse(readFileSync(new URL('./fixtures/cam/part-1.camprog', import.meta.url), 'utf8'));
    const base = { ...prog.params, roughingStrategy: 'longitudinal', plungeRoughing: true, doFinishing: false };
    const off = await runCamProg({ ...prog, params: base });
    const on = await runCamProg({ ...prog, params: { ...base, feedPlungeOn: true, feedPctPlunge: 50 } });
    const half = String(parseFloat((parseFloat(base.feed) / 2).toFixed(3)));
    const ramps = on.gcode.split('\n').filter(l => /Rampa/.test(l));
    expect(ramps.length).toBeGreaterThan(0);
    // Platné (modální) F na řádcích s rampou — za svislým vjezdem je snížené
    // F už modálně a znovu se nepíše.
    let f = null;
    const rampF = [];
    for (const l of on.gcode.split('\n')) {
      const m = l.replace(/;.*$/, '').match(/\bF([\d.]+)/);
      if (m) f = m[1];
      if (/Rampa/.test(l)) rampF.push(f);
    }
    expect(rampF.every(v => v === half)).toBe(true);
    expect(samePath(off, on)).toEqual([]);
  }, 120000);
});

describe('konstantní tloušťka třísky (jen hrubování)', () => {
  it('sin κ a faktor: R20, ap 8 nastavené', async () => {
    const { sinKappa, chipFeedFactor } = await import('../js/calculators/cam/feedTuning.js');
    expect(sinKappa(8, 20)).toBeCloseTo(0.8, 9);
    expect(sinKappa(25, 20)).toBe(1);
    const p = { chipThinOn: true, toolShape: 'round', toolRadius: 20, depthOfCut: 8, feed: 0.12 };
    expect(chipFeedFactor(p, 8)).toBeNull();                     // plná vrstva = F
    expect(chipFeedFactor(p, 4)).toBeCloseTo(0.8 / 0.6, 9);      // ap 4 → 1,33×
    expect(chipFeedFactor(p, 1)).toBe(2);                        // strop 2 × F
    expect(chipFeedFactor({ ...p, chipMaxF: 0.3 }, 1)).toBeCloseTo(2.5, 9);        // strop Max. F 0,3
    expect(chipFeedFactor({ ...p, chipMaxF: 0.5 }, 1)).toBeCloseTo(0.8 / sinKappa(1, 20), 9);
    expect(chipFeedFactor(p, 30)).toBeCloseTo(0.8, 9);           // tlustší vrstva pomaleji
    expect(chipFeedFactor({ ...p, chipThinOn: false }, 1)).toBeNull();
    expect(chipFeedFactor({ ...p, toolShape: 'parting' }, 1)).toBeNull();
  });
  it('cik cak R20: hrubování mění F, dokončení zůstává F, dráha stejná', async () => {
    const prog = caseFile('lathe-zigzag-stock-valley.camprog');
    const base = { ...prog.params, roughingStrategy: 'zigzag', toolRadius: 20, depthOfCut: 8, doFinishing: true };
    const off = await runCamProg({ ...prog, params: base });
    const on = await runCamProg({ ...prog, params: { ...base, chipThinOn: true } });
    expect(samePath(off, on)).toEqual([]);
    const F = String(base.feed);
    const [rough, fin] = on.gcode.split('DOKONCOVANI');
    expect(rough.split('\n').some(l => /^N\d+ G1\b/.test(l) && /\bF[\d.]+/.test(l) && !new RegExp(`\bF${F}(\s|$)`).test(l))).toBe(true);
    const finF = [...fin.matchAll(/\bF([\d.]+)/g)].map(m => m[1]);
    expect(finF.every(v => v === F)).toBe(true);
  }, 180000);
});

describe('skutečné ap průchodu (passDepth)', () => {
  it('čelně: sloupec materiálu nad dnem řezu z modelu zbytku, ne rozestup vrstev', async () => {
    const { passDepth } = await import('../js/calculators/cam/feedTuning.js');
    // Materiál do X 50 až po Z 10 (výš vzduch); průchod zprava na Z 8, R 0,8.
    const topAt = (z) => (z <= 10 ? 50 : null);
    const ap = passDepth({ type: 'face', z: 8, xEnd: 0, xSurface: 50 }, { topAt, tipR: 0.8, step: 2.5 });
    expect(ap).toBeCloseTo(2.8, 1);          // od dna 7,2 po povrch 10
    // Vyšší polotovar v jiném úseku → plná výška, žádné falešně tenké ap.
    const ap2 = passDepth({ type: 'face', z: 8, xEnd: 0, xSurface: 50 }, { topAt: (z) => (z <= 14 ? 50 : null), tipR: 0.8, step: 2.5 });
    expect(ap2).toBeCloseTo(6.8, 1);
  });
  it('podélně: povrch nad průchodem − dno řezu (+ přídavek)', async () => {
    const { passDepth } = await import('../js/calculators/cam/feedTuning.js');
    const ap = passDepth({ type: 'long', x: 40, zStart: 0, zEnd: -20 }, { topAt: () => 42, tipR: 1, margin: 0.3 });
    expect(ap).toBeCloseTo(3.3, 9);
  });
});

describe('tloušťka třísky na čelném dílu', () => {
  it('face-casting: dráha stejná', async () => {
    const prog = JSON.parse(readFileSync(new URL('./fixtures/cam/face-casting.camprog', import.meta.url), 'utf8'));
    const off = await runCamProg(prog);
    const on = await runCamProg({ ...prog, params: { ...prog.params, chipThinOn: true } });
    expect(samePath(off, on)).toEqual([]);
  }, 120000);
});

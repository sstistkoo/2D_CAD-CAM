// Posuv dokončení: F z cílového Ra a snížené F ve vnitřních rozích (cam/finishFeed.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';
import { raToFeed, feedToRa, finishFeedFromRa, isInnerCorner, splitLineAtCorners, cornerFeedFactor } from '../js/calculators/cam/finishFeed.js';

describe('F podle Ra', () => {
  it('rε 0,8 + Ra 1,6 → F ≈ 0,2; zpětně Ra', () => {
    expect(raToFeed(1.6, 0.8)).toBeCloseTo(0.2024, 3);
    expect(feedToRa(0.2, 0.8)).toBeCloseTo(1.5625, 9);
  });
  it('strop max F (výchozí 2 × F), vypnuto = null', () => {
    expect(finishFeedFromRa({ finRa: 1.6, toolRadius: 0.8, feed: 0.25 })).toBeNull();
    const r = finishFeedFromRa({ finRaOn: true, finRa: 1.6, toolRadius: 20, feed: 0.12 });
    expect(r.capped).toBe(true);
    expect(r.f).toBe(0.24);
    const s = finishFeedFromRa({ finRaOn: true, finRa: 1.6, toolRadius: 1.2, feed: 0.25 }, { radius: 0.8, f: 0.15 });
    expect(s.f).toBeCloseTo(0.202, 3);                       // rε dokončovacího nástroje ze zásobníku
  });
});

describe('vnitřní roh', () => {
  // Osazení: průměr r20 pro Z > 0, čelo na Z 0 až do r40, rε 0,8 (vnitřní rámec x = poloměr).
  const R = 0.8;
  const loop = [{ x: 0, z: 30 }, { x: 20, z: 30 }, { x: 20, z: 0 }, { x: 40, z: 0 }, { x: 40, z: -30 }, { x: 0, z: -30 }];
  const along = { type: 'line', p1: { x: 20 + R, z: 30 }, p2: { x: 20 + R, z: R } };
  const up = { type: 'line', p1: { x: 20 + R, z: R }, p2: { x: 40 + R, z: R } };
  it('osazení = vnitřní roh; obrácený zlom (vypuklý) ne', () => {
    expect(isInnerCorner(along, up, R, loop)).toBe(true);
    // Vypuklý roh čela r40 → průměr r40: dráha tam má ostrý zlom jen bez oblouku — ověř, že ho test odmítne.
    const face = { type: 'line', p1: { x: 20 + R, z: R }, p2: { x: 40 + R, z: R } };
    const down = { type: 'line', p1: { x: 40 + R, z: R }, p2: { x: 40 + R, z: -30 } };
    expect(isInnerCorner(face, down, R, loop)).toBe(false);
  });
  it('přímka se rozdělí: rε před rohem sníženě', () => {
    const p = splitLineAtCorners(along, false, true, R);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ slow: false });
    expect(p[0].z).toBeCloseTo(R + R, 9);
    expect(p[1]).toMatchObject({ x: 20 + R, z: R, slow: true });
  });
  it('faktor jen se zaškrtnutím', () => {
    expect(cornerFeedFactor({ feedPctCorner: 50 })).toBeNull();
    expect(cornerFeedFactor({ feedCornerOn: true, feedPctCorner: 50 })).toBe(0.5);
  });
});

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/cam/${name}`, import.meta.url), 'utf8'));
const key = (p) => `${p.x.toFixed(3)}|${p.z.toFixed(3)}`;
const fin = (g) => g.slice(g.indexOf('DOKONCOVANI'));

describe('na dílu part-1', () => {
  it('vnitřní rohy: dráha stejná, v dokončení snížené F, za ním zpět', async () => {
    const prog = fixture('part-1.camprog');
    const off = await runCamProg(prog);
    const on = await runCamProg({ ...prog, params: { ...prog.params, feedCornerOn: true, feedPctCorner: 50 } });
    const s = new Set(on.calcSim.simPath.map(key));
    expect(off.calcSim.simPath.filter(p => !s.has(key(p)))).toEqual([]);
    const F = parseFloat(prog.params.feed);
    const half = String(parseFloat((F / 2).toFixed(3)));
    expect(fin(on.gcode)).toContain(`F${half}`);
    expect(fin(off.gcode)).not.toContain(`F${half}`);
    // Hrubování se nemění.
    expect(on.gcode.slice(0, on.gcode.indexOf('DOKONCOVANI'))).toBe(off.gcode.slice(0, off.gcode.indexOf('DOKONCOVANI')));
  }, 120000);
  it('Ra: dokončení jede F z Ra, hrubování beze změny', async () => {
    const prog = fixture('part-1.camprog');
    const off = await runCamProg(prog);
    const on = await runCamProg({ ...prog, params: { ...prog.params, finRaOn: true, finRa: 3.2 } });
    const exp = finishFeedFromRa({ ...prog.params, finRaOn: true, finRa: 3.2 }).f;
    const fs = [...fin(on.gcode).matchAll(/\bF([\d.]+)/g)].map(m => parseFloat(m[1]));
    expect(fs.length).toBeGreaterThan(0);
    expect(fs.every(v => v === exp)).toBe(true);
    expect(on.gcode.slice(0, on.gcode.indexOf('DOKONCOVANI'))).toBe(off.gcode.slice(0, off.gcode.indexOf('DOKONCOVANI')));
  }, 120000);
});

describe('strop F dokončení a nikdy F0', () => {
  it('Ra (2×) × oblouk (3×) nepřekročí 3 × nastavené F', async () => {
    const { makeArcFeedWriter, formatFeed } = await import('../js/calculators/cam/arcFeedComp.js');
    const out = [];
    const w = makeArcFeedWriter((l) => out.push(l), 0.48, 0.72);   // F z Ra 0,48, nastavené 0,24
    w.writeArc('G3 X10 Z0 CR=1.000', 3);
    expect(out[0]).toBe('G3 X10 Z0 CR=1.000 F0.72');
    expect(formatFeed(0.0004)).toBe('0.001');
    expect(formatFeed(0)).toBe('0.001');
  });
  it('round-r10-face-small-fillet: všechno zapnuto → dokončení nejvýš 3 × F', async () => {
    const prog = JSON.parse(readFileSync(new URL('./fixtures/cam-cases/round-r10-face-small-fillet.camprog', import.meta.url), 'utf8'));
    const ALL = { arcFeedComp: true, finRaOn: true, finRa: 1.6, feedCornerOn: true };
    const g = (await runCamProg({ ...prog, params: { ...prog.params, ...ALL } })).gcode;
    const fin = g.slice(g.indexOf('DOKONCOVANI')).replace(/[;(][^\n]*/g, '');
    const fs = [...fin.matchAll(/\bF([\d.]+)/g)].map(m => parseFloat(m[1]));
    expect(Math.max(...fs)).toBeLessThanOrEqual(3 * parseFloat(prog.params.feed) + 1e-9);
    expect(Math.min(...fs)).toBeGreaterThan(0);
  }, 120000);
});

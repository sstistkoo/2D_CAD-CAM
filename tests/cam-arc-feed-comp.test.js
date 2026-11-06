// Konstantní posuv na oblouku dle rε (cam/arcFeedComp.js, přepínač arcFeedComp).
// Dráha jede středem rádiusu destičky, takže F středu se na oblouku přepočte
// poměrem r dráhy / R kontury — v bodě řezu je pak posuv stále F.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';
import { arcFeedFactor, makeArcFeedWriter, formatFeed } from '../js/calculators/cam/arcFeedComp.js';

describe('arcFeedFactor', () => {
  it('vypuklý R2, rε 0,8 → 2,8/2 = 1,4× ; vydutý R2 → 1,2/2 = 0,6×', () => {
    expect(arcFeedFactor({ type: 'arc', cx: 0, cz: 0, r: 2.8, refP1: { x: 2, z: 0 } })).toBeCloseTo(1.4, 9);
    expect(arcFeedFactor({ type: 'arc', cx: 0, cz: 0, r: 1.2, refP1: { x: 0, z: -2 } })).toBeCloseTo(0.6, 9);
  });
  it('bez bodu kontury / přímka / stejný poloměr → null (F beze změny)', () => {
    expect(arcFeedFactor({ type: 'arc', cx: 0, cz: 0, r: 3 })).toBeNull();
    expect(arcFeedFactor({ type: 'line' })).toBeNull();
    expect(arcFeedFactor({ type: 'arc', cx: 0, cz: 0, r: 3, refP1: { x: 3, z: 0 } })).toBeNull();
  });
  it('vydutý R ≈ rε se omezí na 0,1×', () => {
    expect(arcFeedFactor({ type: 'arc', cx: 0, cz: 0, r: 0.01, refP1: { x: 0.81, z: 0 } })).toBe(0.1);
  });
});

describe('makeArcFeedWriter', () => {
  it('oblouk dostane přepočtené F, další řezný blok se vrátí na základní F', () => {
    const out = [];
    const w = makeArcFeedWriter((l) => out.push(l), 0.2);
    w.write('G1 X10 Z0');
    w.writeArc('G3 X15 Z-5 CR=5.000', 1.4);
    w.write('G0 X50');                 // rychloposuv F nepotřebuje
    w.write('G1 X20 Z-10 ; komentar');
    w.write('G1 X20 Z-20');
    expect(out).toEqual(['G1 X10 Z0', 'G3 X15 Z-5 CR=5.000 F0.28', 'G0 X50', 'G1 X20 Z-10 F0.2 ; komentar', 'G1 X20 Z-20']);
  });
  it('formatFeed: 3 desetinná místa bez koncových nul', () => {
    expect(formatFeed(0.2 * 0.6)).toBe('0.12');
    expect(formatFeed('0.25')).toBe('0.25');
  });
});

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/cam/${name}`, import.meta.url), 'utf8'));
const stripF = (g) => g.split('\n').map(l => l.replace(/\s*F[\d.]+/g, '')).join('\n');

describe('dokončování s přepínačem arcFeedComp', () => {
  it('part-1: dráha beze změny, jen F na obloucích dokončení', async () => {
    const prog = fixture('part-1.camprog');
    const off = (await runCamProg({ ...prog, params: { ...prog.params, doFinishing: true, arcFeedComp: false } })).gcode;
    const on = (await runCamProg({ ...prog, params: { ...prog.params, doFinishing: true, arcFeedComp: true } })).gcode;
    expect(stripF(on)).toBe(stripF(off));
    const fin = on.slice(on.indexOf('DOKONCOVANI')).split('\n');
    const arcsWithF = fin.filter(l => /\bG0?[23]\b/.test(l) && /\bF[\d.]/.test(l));
    expect(arcsWithF.length).toBeGreaterThan(0);
    // Za každým obloukem s přepočteným F nese další řezný blok vlastní F.
    for (let i = 0; i < fin.length; i++) {
      if (!(/\bG0?[23]\b/.test(fin[i]) && /\bF[\d.]/.test(fin[i]))) continue;
      const next = fin.slice(i + 1).find(l => /\bG0?[123]\b/.test(l));
      if (next) expect(next).toMatch(/\bF[\d.]/);
    }
  }, 120000);
  it('part-1: oblouky HRUBOVÁNÍ taky (r dráhy / (r ∓ rε))', async () => {
    const prog = fixture('part-1.camprog');
    const base = { ...prog.params, doFinishing: false };
    const off = (await runCamProg({ ...prog, params: { ...base, arcFeedComp: false } })).gcode;
    const on = (await runCamProg({ ...prog, params: { ...base, arcFeedComp: true } })).gcode;
    expect(stripF(on)).toBe(stripF(off));
    const F = String(base.feed);
    const arcs = on.split('\n').filter(l => /^N\d+ G0?[23]\b/.test(l) && !new RegExp(`\\bF${F}(\\s|$)`).test(l));
    expect(arcs.length).toBeGreaterThan(0);
  }, 120000);
});

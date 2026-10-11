import { describe, it, expect } from 'vitest';
import { analyzeDrawCode, tangentToIK, tangentAt, moveDirDeg } from '../js/calculators/cncDrawTools.js';

const OPTS = [
  {}, { diam: true }, { flip: true }, { karusel: true }, { karusel: true, flip: true }, { diam: true, karusel: true },
];

describe('tečný oblouk (T)', () => {
  it('úsečka +Z a oblouk doleva (X+) = G3, střed (Z10, X10), R10', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 Z10\nG3 X10 Z20 T');
    const a = an.byLine.get(2).arc;
    expect(a.err).toBeUndefined();
    expect(a.r).toBeCloseTo(10); expect(a.cz).toBeCloseTo(10); expect(a.cx).toBeCloseTo(10);
    expect(a.warn).toBeUndefined();
    expect(a.sweep * 180 / Math.PI).toBeCloseTo(90);
  });
  it('opačný smysl G2/G3 se ohlásí a převod ho opraví', () => {
    const code = 'G0 X0 Z0\nG1 Z10\nG2 X10 Z20 T';
    const an = analyzeDrawCode(code);
    expect(an.byLine.get(2).arc.warn).toMatch(/G3/);
    const r = tangentToIK(code);
    expect(r.converted).toBe(1);
    expect(r.code).toBe('G0 X0 Z0\nG1 Z10\nG3 X10 Z20 I10 K0');
  });
  it('chyby: po G0, koncový bod na tečně, stejný bod', () => {
    expect(analyzeDrawCode('G0 X0 Z0\nG2 X10 Z20 T').byLine.get(1).arc.err).toMatch(/před sebou/);
    expect(analyzeDrawCode('G0 X0 Z0\nG1 Z10\nG3 X0 Z20 T').byLine.get(2).arc.err).toMatch(/na tečně/);
    expect(analyzeDrawCode('G0 X0 Z0\nG1 Z10\nG3 X0 Z10 T').byLine.get(2).arc.err).toMatch(/stejný/);
  });
  it('T5 (nástroj) a G1 s T se nepočítá jako tečné napojení', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 Z10\nG3 X10 Z20 R10 T5');
    expect(an.byLine.get(2).tangent).toBeUndefined();
  });
  it('převod po tečném oblouku navazuje dál a zachová F a komentář', () => {
    const r = tangentToIK('G0 X0 Z0\nG1 Z10\nG3 X10 Z20 T F0.2 ; oblouk\nG1 Z40');
    expect(r.code.split('\n')[2]).toBe('G3 F0.2 X10 Z20 I10 K0 ; oblouk');
  });
  it.each(OPTS.map(o => [JSON.stringify(o), o]))('po převodu je oblouk tečný ke směru před ním (%s)', (_n, o) => {
    const xs = o.diam ? 2 : 1;
    // soustruh i karusel: libovolný směr úsečky a koncový bod doleva i doprava
    for (const ang of [0, 30, 135, -60]) {
      for (const [dz, dx] of [[12, 7], [12, -7], [5, 14]]) {
        const a = ang * Math.PI / 180;
        const z1 = 20 * Math.cos(a), x1 = 20 * Math.sin(a);
        const code = `G0 X0 Z0\nG1 X${(x1 * xs).toFixed(4)} Z${z1.toFixed(4)}\nG2 X${((x1 + dx) * xs).toFixed(4)} Z${(z1 + dz).toFixed(4)} T`;
        const cv = tangentToIK(code, o);
        const an0 = analyzeDrawCode(code, o);
        if (an0.byLine.get(2).arc.err) continue;
        expect(cv.converted).toBe(1);
        const an = analyzeDrawCode(cv.code, o);
        const prev = an.byLine.get(1), arc = an.byLine.get(2);
        expect(arc.arc.err).toBeUndefined();
        const t = tangentAt(arc, false, an), d = moveDirDeg(prev, an) * Math.PI / 180;
        expect(t.z * Math.cos(d) + t.x * Math.sin(d)).toBeGreaterThan(0.9999);   // tečna oblouku = směr úsečky
      }
    }
  });
});

describe('tečný oblouk – G91 a návaznost', () => {
  it('v G91 se X Z zapíšou jako přírůstky, I K zůstanou relativní', () => {
    const r = tangentToIK('G90 G0 X0 Z0\nG91\nG1 Z10\nG3 X10 Z10 T');
    expect(r.code).toBe('G90 G0 X0 Z0\nG91\nG1 Z10\nG3 X10 Z10 I10 K0');
  });
  it('T hned za polárním řádkem a řetěz dvou tečných oblouků', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 PU0 L10\nG3 X10 Z20 T\nG2 X20 Z30 T');
    expect(an.byLine.get(2).arc.err).toBeUndefined();
    const a2 = an.byLine.get(3).arc;
    expect(a2.err).toBeUndefined();
    expect(a2.warn).toBeUndefined();   // S-křivka: druhý oblouk jde opačným smyslem = G2
  });
});

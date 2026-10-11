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

describe('tečný oblouk – R + jedna souřadnice', () => {
  const base = 'G0 X0 Z0\nG1 Z10\n';
  it('G3 X10 R10 T → konec Z20 (kratší oblouk), střed X10 Z10', () => {
    const an = analyzeDrawCode(base + 'G3 X10 R10 T');
    const m = an.byLine.get(2);
    expect(m.arc.err).toBeUndefined();
    expect(m.to.z).toBeCloseTo(20); expect(m.to.x).toBeCloseTo(10);
    expect(m.arc.cz).toBeCloseTo(10); expect(m.arc.cx).toBeCloseTo(10);
    expect(m.arc.sweep * 180 / Math.PI).toBeCloseTo(90);
  });
  it('G3 Z20 R10 T (dotyk) a G2 X-10 R10 T (druhá strana)', () => {
    expect(analyzeDrawCode(base + 'G3 Z20 R10 T').byLine.get(2).to.x).toBeCloseTo(10);
    const m = analyzeDrawCode(base + 'G2 X-10 R10 T').byLine.get(2);
    expect(m.to.z).toBeCloseTo(20); expect(m.to.x).toBeCloseTo(-10);
  });
  it('následující řádky vycházejí z dopočteného konce; převod zapíše X Z I K', () => {
    const code = base + 'G3 X10 R10 T\nG1 X30';
    const an = analyzeDrawCode(code);
    expect(an.byLine.get(3).from.z).toBeCloseTo(20);
    expect(tangentToIK(code).code).toBe(base + 'G3 X10 Z20 I10 K0\nG1 X30');
  });
  it('chyby: nedosáhne, R bez X/Z, R = 0', () => {
    expect(analyzeDrawCode(base + 'G3 X30 R10 T').byLine.get(2).arc.err).toMatch(/nedosáhne/);
    expect(analyzeDrawCode(base + 'G3 R10 T').byLine.get(2)).toBeUndefined();   // bez X / Z to není pohyb
    expect(analyzeDrawCode(base + 'G3 X10 R0 T').byLine.get(2).arc.err).toBeTruthy();
  });
  it.each(OPTS.map(o => [JSON.stringify(o), o]))('R-varianta dá stejný konec jako varianta X Z (%s)', (_n, o) => {
    const xs = o.diam ? 2 : 1;
    for (const ang of [0, 40, 150, -70]) {
      for (const [dz, dx] of [[12, 7], [12, -7], [6, 10]]) {
        const a = ang * Math.PI / 180, z1 = 20 * Math.cos(a), x1 = 20 * Math.sin(a);
        const head = `G0 X0 Z0\nG1 X${(x1 * xs).toFixed(5)} Z${z1.toFixed(5)}\n`;
        const full = analyzeDrawCode(head + `G2 X${((x1 + dx) * xs).toFixed(5)} Z${(z1 + dz).toFixed(5)} T`, o);
        const f = full.byLine.get(2);
        if (f.arc.err) continue;
        const code3 = tangentToIK(head + `G2 X${((x1 + dx) * xs).toFixed(5)} Z${(z1 + dz).toFixed(5)} T`, o).code.split('\n')[2];
        const gw = code3.startsWith('G3') ? 'G3' : 'G2';
        const sweep = f.arc.sweep;
        if (sweep > Math.PI - 0.05) continue;              // delší než půlkruh: kratší řešení by bylo jiné
        const rr = f.arc.r.toFixed(6);
        const viaX = analyzeDrawCode(head + `${gw} X${(f.to.x * xs).toFixed(6)} R${rr} T`, o).byLine.get(2);
        const viaZ = analyzeDrawCode(head + `${gw} Z${f.to.z.toFixed(6)} R${rr} T`, o).byLine.get(2);
        for (const v of [viaX, viaZ]) {
          expect(v.arc.err).toBeUndefined();
          // stejná kružnice (G2/G3 + R dá stejnou stranu jako varianta X Z) a dojetí není delší než původní
          expect(v.arc.cx).toBeCloseTo(f.arc.cx, 3); expect(v.arc.cz).toBeCloseTo(f.arc.cz, 3);
          expect(v.arc.sweep).toBeLessThanOrEqual(f.arc.sweep + 1e-6);
        }
      }
    }
  });
});

it('při opačném G2/G3 se výseč počítá z tečnosti (90°), ne z G-kódu (270°)', () => {
  const m = analyzeDrawCode('G0 X0 Z0\nG1 Z10\nG2 X10 Z20 T').byLine.get(2);
  expect(m.arc.warn).toBeTruthy();
  expect(m.arc.sweep * 180 / Math.PI).toBeCloseTo(90);
});

describe('řetěz tečných oblouků (T za obloukem)', () => {
  // Směr pohybu v daném konci / začátku (úsečka = její směr, oblouk = tečna), v radiánech.
  const dir = (mv, atEnd, an) => {
    if (mv.g <= 1) return moveDirDeg(mv, an) * Math.PI / 180;
    const t = tangentAt(mv, atEnd, an); return Math.atan2(t.x, t.z);
  };
  const sameDir = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;

  it.each(OPTS.map(o => [JSON.stringify(o), o]))('úsečka → 3 tečné oblouky (X Z, R+Z, X Z) jsou v každém spoji tečné (%s)', (_n, o) => {
    const xs = o.diam ? 2 : 1;
    // G2/G3: u X Z ho určuje geometrie (varování), u R + souřadnice ho volí uživatel – zkusí se G3, pak G2.
    const pick = (head, tail) => {
      const a = analyzeDrawCode(head + 'G3 ' + tail, o);
      const mv = [...a.byLine.values()].pop();
      return mv.arc && (mv.arc.warn || mv.arc.err) ? 'G2 ' + tail : 'G3 ' + tail;
    };
    let code = `G0 X0 Z0\nG1 X${(8 * xs).toFixed(4)} Z6\n`;
    code += pick(code, `X${(14 * xs).toFixed(4)} Z14 T`) + '\n';
    code += pick(code, 'Z24 R9 T') + '\n';
    code += pick(code, `X${(22 * xs).toFixed(4)} Z30 T`);
    const an = analyzeDrawCode(code, o);
    const mvs = an.moves.slice(1);                    // bez G0
    expect(mvs).toHaveLength(4);
    mvs.forEach(m => { expect(m.arc?.err).toBeUndefined(); expect(m.arc?.warn).toBeUndefined(); });
    for (let i = 1; i < mvs.length; i++) {
      expect(sameDir(dir(mvs[i], false, an), dir(mvs[i - 1], true, an))).toBe(true);
    }
    // po převodu na X Z I K vycházejí stejné konce i středy
    const an2 = analyzeDrawCode(tangentToIK(code, o).code, o);
    an.moves.forEach((m, i) => {
      expect(an2.moves[i].to.z).toBeCloseTo(m.to.z, 3); expect(an2.moves[i].to.x).toBeCloseTo(m.to.x, 3);
      if (m.arc) { expect(an2.moves[i].arc.cz).toBeCloseTo(m.arc.cz, 3); expect(an2.moves[i].arc.cx).toBeCloseTo(m.arc.cx, 3); }
    });
  });

  it('T za obyčejným obloukem (R): stejný poloměr, protože úsečka + čtvrtkruh → opět čtvrtkruh', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 Z10\nG3 X10 Z20 R10\nG3 X20 Z30 T');
    const m = an.byLine.get(3);
    expect(m.arc.err).toBeUndefined();
    expect(m.arc.r).toBeCloseTo(10);
  });
});

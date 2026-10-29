// CNC Editor – dialog ⌒ Oblouk: výpočet řádku G2/G3 (calculators/cncArcTools.js).
import { describe, it, expect } from 'vitest';
import { arcContext, previewArc, tangentSweepEnd } from '../js/calculators/cncArcTools.js';

const OPTS = { diam: false, karusel: false, flip: false };
const ctxOf = (code, opts = OPTS) => arcContext(code, code.split('\n').length - 1, opts);
const START = 'G90 G00 X0 Z0';                     // za G0 se tečně navázat nedá
const LINE = 'G90 G00 X0 Z0\nG01 X0 Z-20';        // úsečka ve směru −Z, konec Z-20
const base = { g: 3, tangent: false, X: null, Z: null, R: null, sweep: null, big: false };
const near = (a, b, d = 2) => expect(a).toBeCloseTo(b, d);

describe('netečně', () => {
  it('konec X+Z + R → G3 X Z R, úhel 90°', () => {
    const r = previewArc(ctxOf(START), { ...base, X: 10, Z: -10, R: 10 });
    expect(r.line).toBe('G3 X10 Z-10 R10');
    near(r.info.sweepDeg, 90);
    near(r.info.r, 10);
  });
  it('velký oblouk = záporné R, úhel 270°', () => {
    const r = previewArc(ctxOf(START), { ...base, X: 10, Z: -10, R: 10, big: true });
    expect(r.line).toBe('G3 X10 Z-10 R-10');
    near(r.info.sweepDeg, 270);
  });
  it('konec X+Z + úhel rozevření → dopočte R (90° → R10, 270° → R-10)', () => {
    const a = previewArc(ctxOf(START), { ...base, X: 10, Z: -10, sweep: 90 });
    expect(a.line).toBe('G3 X10 Z-10 R10');
    near(a.info.sweepDeg, 90);
    const b = previewArc(ctxOf(START), { ...base, X: 10, Z: -10, sweep: 270 });
    expect(b.line).toBe('G3 X10 Z-10 R-10');
    near(b.info.sweepDeg, 270);
  });
  it('půlkruh (180°) vyjde bez chyby kvůli zaokrouhlení R', () => {
    const r = previewArc(ctxOf(START), { ...base, X: 0, Z: -10, sweep: 180 });
    expect(r.err).toBeUndefined();
    near(r.info.sweepDeg, 180, 1);
  });
  it('G2 a G3 dají opačně orientovaný oblouk (střed na opačné straně)', () => {
    const g2 = previewArc(ctxOf(START), { ...base, g: 2, X: 10, Z: -10, R: 10 });
    const g3 = previewArc(ctxOf(START), { ...base, g: 3, X: 10, Z: -10, R: 10 });
    expect(g2.line.startsWith('G2')).toBe(true);
    expect(g3.line.startsWith('G3')).toBe(true);
  });
  it('chybějící / nadbytečné údaje', () => {
    const c = ctxOf(START);
    expect(previewArc(c, { ...base, Z: -10, R: 5 }).err).toMatch(/X i Z/);
    expect(previewArc(c, { ...base, X: 10, Z: -10 }).err).toMatch(/Zadej R, nebo úhel/);
    expect(previewArc(c, { ...base, X: 10, Z: -10, R: 5, sweep: 90 }).err).toMatch(/ne obojí/);
    expect(previewArc(c, { ...base, X: 0, Z: 0, R: 5 }).err).toMatch(/stejný bod/);
    expect(previewArc(c, { ...base, X: 10, Z: -10, R: -5 }).err).toMatch(/kladné/);
    expect(previewArc(c, { ...base, X: 10, Z: -10, sweep: 360 }).err).toMatch(/0° a 360°/);
  });
  it('R menší než půlka tětivy se ohlásí z analýzy', () => {
    expect(previewArc(ctxOf(START), { ...base, X: 10, Z: -10, R: 5 }).err).toMatch(/menší než půlka/);
  });
});

describe('tečně', () => {
  it('za G0 ani na začátku programu tečné napojení není', () => {
    const c = ctxOf(START);
    expect(c.tangentOk).toBe(false);
    expect(previewArc(c, { ...base, tangent: true, X: 10, Z: -10 }).err).toMatch(/Tečně nejde.*G0/);
    expect(ctxOf('').tangentOk).toBe(false);
  });
  it('tečně + konec X+Z: smysl G2/G3 určí napojení (obě volby dají tentýž řádek)', () => {
    const c = ctxOf(LINE);
    expect(c.tangentOk).toBe(true);
    const a = previewArc(c, { ...base, g: 2, tangent: true, X: 10, Z: -30 });
    const b = previewArc(c, { ...base, g: 3, tangent: true, X: 10, Z: -30 });
    expect(a.line).toBe(b.line);
    expect(a.line).toMatch(/^G[23] X10 Z-30 T$/);
    expect(a.info.autoDir).toBe(true);
    near(a.info.r, 10);
    near(a.info.sweepDeg, 90);
  });
  it('tečně + R + X: jen jedna ze stran G2/G3 dosáhne, druhá hlásí chybu', () => {
    const c = ctxOf(LINE);
    const rs = [2, 3].map((g) => previewArc(c, { ...base, g, tangent: true, R: 10, X: 10 }));
    expect(rs.filter((r) => !r.err)).toHaveLength(1);
    expect(rs.filter((r) => r.err)[0].err).toMatch(/nedosáhne/);
    const ok = rs.find((r) => !r.err);
    expect(ok.line).toMatch(/^G[23] X10 R10 T$/);
    near(ok.info.end.z, -30);
    near(ok.info.sweepDeg, 90);
  });
  it('tečně + R + úhel rozevření: konec se dopočte (G2 i G3, zrcadlově)', () => {
    const c = ctxOf(LINE);
    for (const g of [2, 3]) {
      const r = previewArc(c, { ...base, g, tangent: true, R: 10, sweep: 90 });
      expect(r.err).toBeUndefined();
      expect(r.line).toMatch(new RegExp(`^G${g} X-?10 Z-30 T$`));
      near(Math.abs(r.info.end.x), 10);
      near(r.info.end.z, -30);
      near(r.info.sweepDeg, 90);
      near(r.info.r, 10);
    }
    const left = previewArc(c, { ...base, g: 3, tangent: true, R: 10, sweep: 90 }).info.end.x;
    const right = previewArc(c, { ...base, g: 2, tangent: true, R: 10, sweep: 90 }).info.end.x;
    expect(Math.sign(left)).toBe(-Math.sign(right));
  });
  it('tečně + R + úhel nad 180° dá velký oblouk', () => {
    const r = previewArc(ctxOf(LINE), { ...base, g: 3, tangent: true, R: 10, sweep: 270 });
    expect(r.err).toBeUndefined();
    near(r.info.sweepDeg, 270);
  });
  it('nepřípustné kombinace', () => {
    const c = ctxOf(LINE);
    expect(previewArc(c, { ...base, tangent: true, X: 10, Z: -30, R: 10 }).err).toMatch(/už R ani úhel/);
    expect(previewArc(c, { ...base, tangent: true, R: 10 }).err).toMatch(/Tečně zadej/);
    expect(previewArc(c, { ...base, tangent: true, R: 10, X: 10, sweep: 90 }).err).toMatch(/úhel nepotřebuje/);
  });
  it('tangentSweepEnd je konzistentní s analýzou editoru', () => {
    const e = tangentSweepEnd({ z: -20, x: 0 }, 180, 10, 90, true, false);
    near(Math.abs(e.x), 10);
    near(e.z, -30);
  });
});

describe('G91, průměr, polotovar', () => {
  it('v G91 se zapisují přírůstky, náhled hlásí absolutní konec', () => {
    const code = 'G90 G00 X0 Z0\nG91\nG01 Z-20';
    const c = ctxOf(code);
    expect(c.incr).toBe(true);
    const r = previewArc(c, { ...base, X: 10, Z: -30, R: 10 });
    expect(r.line).toBe('G3 X10 Z-10 R10');
    near(r.info.end.z, -30);
    near(r.info.end.x, 10);
  });
  it('průměrový režim: X se zadává i zapisuje jako průměr', () => {
    const opts = { diam: true, karusel: false, flip: false };
    const r = previewArc(ctxOf(START, opts), { ...base, X: 20, Z: -10, R: 10 });
    expect(r.line).toBe('G3 X20 Z-10 R10');
    near(r.info.sweepDeg, 90);
    near(r.info.end.x, 20);   // v jednotkách kódu (průměr)
  });
  it('polotovar: první bod za STOCK_START nemá s kontury předchozí pohyb', () => {
    const code = 'G90 G00 X0 Z0\nG01 X5 Z-5\n; STOCK_START\n';
    expect(ctxOf(code).tangentOk).toBe(false);
  });
});

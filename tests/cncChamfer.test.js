import { describe, it, expect } from 'vitest';
import { analyzeDrawCode } from '../js/calculators/cncDrawTools.js';
import { chamferByAngle, joinAtIntersection } from '../js/calculators/cncJoin.js';

const NL = '\n';

describe('sražení úhel × délka', () => {
  const base = ['G0 X0 Z0', 'G1 Z10', 'G1 X10'].join(NL);
  it('délka po 1. úsečce, 45° → 3×45°', () => {
    const r = chamferByAngle(base, 1, 3, 45, 'first');
    expect(r.err).toBeUndefined();
    expect(r.code).toBe(['G0 X0 Z0', 'G1 Z7', 'G1 X3 Z10 ; sražení 3×45°', 'G1 X10'].join(NL));
    expect(r.a).toEqual({ z: 7, x: 0 }); expect(r.b.z).toBeCloseTo(10); expect(r.b.x).toBeCloseTo(3);
  });
  it('délka po 2. úsečce (3×30°: 3 podél osy X, sklon 30° k ní)', () => {
    const r = chamferByAngle(base, 1, 3, 30, 'second');
    expect(r.err).toBeUndefined();
    // PA = K + 3·dB = (z10, x3); sražení svírá 30° s 2. úsečkou → na 1. úsečce 3·tan(30°) od rohu
    expect(r.a.x).toBeCloseTo(0); expect(r.a.z).toBeCloseTo(10 - 3 * Math.tan(30 * Math.PI / 180), 3);
    expect(r.b).toEqual({ z: 10, x: 3 });
  });
  it('po sražení navazují body: konec 1. úsečky = začátek sražení, konec sražení = začátek 2. úsečky', () => {
    const r = chamferByAngle(base, 1, 3, 45);
    const an = analyzeDrawCode(r.code);
    const m = an.moves;
    expect(m).toHaveLength(4);
    expect(m[2].from).toEqual(m[1].to);
    expect(m[3].from.z).toBeCloseTo(m[2].to.z); expect(m[3].from.x).toBeCloseTo(m[2].to.x);
    expect(m[3].to).toEqual({ z: 10, x: 10 });
  });
  it('zachová F a komentář zkracované úsečky, v průměru počítá správně', () => {
    const r = chamferByAngle('G0 X0 Z0\nG1 Z10 F0.2 ; válec\nG1 X20', 1, 3, 45, 'first', { diam: true });
    expect(r.err).toBeUndefined();
    expect(r.code.split(NL)[1]).toBe('G1 F0.2 Z7 ; válec');
    expect(r.code.split(NL)[2]).toBe('G1 X6 Z10 ; sražení 3×45°');       // X v průměru: poloměr 3 → X6
  });
  it('chyby', () => {
    expect(chamferByAngle(base, 1, 0, 45).err).toMatch(/kladnou/);
    expect(chamferByAngle(base, 1, 3, 95).err).toMatch(/0° a 90°/);
    expect(chamferByAngle(base, 1, 30, 45).err).toMatch(/větší/);
    expect(chamferByAngle(base, 2, 3, 45).err).toMatch(/Kurzor/);                 // poslední úsečka nemá následující
    expect(chamferByAngle('G0 X0 Z0\nG1 Z10\nG1 Z20', 1, 3, 45).err).toMatch(/jedné přímce/);
    expect(chamferByAngle('G0 X0 Z0\nG91\nG1 Z10\nG1 X10', 2, 3, 45).err).toMatch(/G90/);
    expect(chamferByAngle(['G0 X0 Z0', 'G1 Z10', 'G1 X2'].join(NL), 1, 3, 45).err).toMatch(/za/);   // přesah přes 2. úsečku
  });
});

describe('spojení v průsečíku – oblouky', () => {
  const circle = (zc, r, zs) => `G0 X0 Z${zs}${NL}G3 X0 Z${zs} I0 K${zc - zs}`;   // plná kružnice, začíná na ose X = 0
  it('úsečka × kružnice: bere se první průsečík po A, B se obrátí', () => {
    const code = ['G0 X5 Z0', 'G1 X5 Z40', circle(20, 10, 10)].join(NL);
    const r = joinAtIntersection(code, 3, {});
    expect(r.err).toBeUndefined();
    const z = 20 - Math.sqrt(75);
    expect(r.point.z).toBeCloseTo(z); expect(r.point.x).toBeCloseTo(5);
    const an = analyzeDrawCode(r.code);
    const [g0, a, b] = an.moves;
    expect(a.to.z).toBeCloseTo(z);
    expect(b.g).toBe(2);                                    // obráceno: G3 → G2
    expect(b.from.z).toBeCloseTo(z); expect(b.to).toEqual({ z: 10, x: 0 });
    expect(b.arc.err).toBeUndefined();
    expect(b.arc.cz).toBeCloseTo(20); expect(b.arc.cx).toBeCloseTo(0);
    expect(b.arc.sweep * 180 / Math.PI).toBeCloseTo(360 - 30, 1);   // 330°: od P zpět k začátku kružnice
  });
  it('oblouk × úsečka (A je oblouk): A se ořízne obloukem se stejným středem', () => {
    const code = [circle(20, 10, 10), 'G0 X5 Z40', 'G1 X5 Z0'].join(NL);
    const r = joinAtIntersection(code, 4, {});
    expect(r.err).toBeUndefined();
    const an = analyzeDrawCode(r.code);
    const [, a, b] = an.moves;
    expect(a.g).toBe(3); expect(a.arc.cz).toBeCloseTo(20);
    expect(a.from).toEqual({ z: 10, x: 0 });
    expect(b.g).toBe(1);                                    // za obloukem musí být G1 výslovně
    expect(b.to).toEqual({ z: 40, x: 5 });
  });
  it('kružnice × kružnice: průsečík leží na obou', () => {
    const code = [circle(10, 10, 0), circle(20, 10, 10)].join(NL);
    const r = joinAtIntersection(code, 3, {});
    expect(r.err).toBeUndefined();
    expect(r.point.z).toBeCloseTo(15);
    expect(Math.abs(r.point.x)).toBeCloseTo(Math.sqrt(75));
  });
  it('oblouk mimo dosah: hláška; prodloužení: hláška s průsečíkem', () => {
    const farCircle = [circle(20, 10, 10)].join(NL);
    expect(joinAtIntersection(['G0 X30 Z0', 'G1 X30 Z40', farCircle].join(NL), 3, {}).err).toMatch(/neprotínají/);
    // půlkruh G3 od (z10,x0) k (z30,x0) leží pod osou (x ≤ 0); úsečka x = 5 ho mine (průsečíky jen na druhé půlce kružnice)
    const half = 'G0 X0 Z10\nG3 X0 Z30 I0 K10';
    const r = joinAtIntersection(['G0 X5 Z0', 'G1 X5 Z40', half].join(NL), 3, {});
    expect(r.err).toMatch(/neprotínají/);
  });
});

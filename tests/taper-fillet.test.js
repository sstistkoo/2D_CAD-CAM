import { describe, it, expect } from 'vitest';
import { taperFillets, cornerFromStart, arcExtremes } from '../js/calculators/taperFilletMath.js';

const DEG = Math.PI / 180;
const C10 = 2 * Math.tan(10 * DEG);                     // α = 10° (sklon k ose)

describe('kužel – tvarový přechod R', () => {
  it('vrch: průsečík Ø330, α 10°, R12, čelo k ose (ruční výpočet)', () => {
    const r = taperFillets({ D: 330 + 100 * Math.tan(10 * DEG), d: 330, L: 50, C: C10, bigSide: 'A',
      edges: { B: { R: 12, face: 'in', given: 'corner' }, A: null } });
    const e = r.edges.B;
    const t = 12 / Math.tan(50 * DEG);                  // úhel kužel–čelo 100°
    expect(e.t).toBeCloseTo(t, 9);
    expect(e.onFace.dia).toBeCloseTo(330 - 2 * t, 9);
    expect(e.onFace.z).toBe(50);
    expect(e.onCone.dia).toBeCloseTo(330 + 2 * t * Math.sin(10 * DEG), 9);
    expect(50 - e.onCone.z).toBeCloseTo(t * Math.cos(10 * DEG), 9);
    expect(50 - e.center.z).toBeCloseTo(12, 9);         // střed je R pod čelem
    expect(e.center.dia).toBeCloseTo(e.onFace.dia, 9);  // a přímo pod začátkem R
    expect(e.maxDia).toBe(null);
    expect(r.error).toBe('');
  });

  it('začátek R na čele → průsečík (zpětně)', () => {
    const t = 12 / Math.tan(50 * DEG);
    expect(cornerFromStart(330 - 2 * t, 12, 'B', C10, 'A', 'in')).toBeCloseTo(330, 9);
    const r = taperFillets({ D: 340, d: 330, L: 50, C: C10, bigSide: 'A',
      edges: { B: { R: 12, face: 'in', given: 'start', dia: 330 - 2 * t } } });
    expect(r.edges.B.corner.dia).toBeCloseTo(330, 9);
    expect(r.edges.B.mismatch).toBeCloseTo(0, 9);
  });

  it('ostrý úhel kužel–čelo: hrana D je jen teoretická, změřit jde největší Ø na R', () => {
    // větší Ø dole, na spodku čelo k ose (úhel 80°): zaoblení vrcholu
    const D = 200;
    const r = taperFillets({ D, d: D - 2 * 30 * Math.tan(10 * DEG), L: 30, C: C10, bigSide: 'A',
      edges: { A: { R: 5, face: 'in', given: 'corner' } } });
    const e = r.edges.A;
    expect(e.maxDia).not.toBe(null);
    expect(e.maxDia.dia).toBeCloseTo(e.center.dia + 10, 9);
    expect(e.maxDia.dia).toBeLessThan(D);
    expect(e.maxDia.dia).toBeGreaterThan(Math.max(e.onCone.dia, e.onFace.dia));
    expect(e.maxDia.z).toBeCloseTo(e.center.z, 9);
  });

  it('šikmé čelo: −15° (klesá ke spodku), střed R ve vzdálenosti R od obou ploch', () => {
    const R = 5, b = -15 * DEG;
    const r = taperFillets({ D: 200, d: 200 - 2 * 40 * Math.tan(10 * DEG), L: 40, C: C10, bigSide: 'A',
      edges: { A: { R, face: 'out', beta: -15, given: 'corner' } } });
    const e = r.edges.A;
    const a = 10 * DEG;
    // kužel jde od hrany nahoru k ose (100° od +r), čelo ven 15° dolů (−15°) → 115°
    const t = R / Math.tan((115 * DEG) / 2);
    expect(e.t).toBeCloseTo(t, 9);
    expect(e.onFace.dia).toBeCloseTo(200 + 2 * t * Math.cos(b), 9);
    expect(e.onFace.z).toBeCloseTo(t * Math.sin(b), 9);
    // vzdálenost středu od přímky čela a od površky kužele = R
    const c = { r: e.center.dia / 2, z: e.center.z };
    const distLine = (p, u) => Math.abs((c.r - p.r) * u.z - (c.z - p.z) * u.r);
    expect(distLine({ r: 100, z: 0 }, { r: Math.cos(b), z: Math.sin(b) })).toBeCloseTo(R, 9);
    expect(distLine({ r: 100, z: 0 }, { r: -Math.sin(a), z: Math.cos(a) })).toBeCloseTo(R, 9);
    // zpětně ze začátku R na šikmém čele
    expect(cornerFromStart(e.onFace.dia, R, 'A', C10, 'A', 'out', -15)).toBeCloseTo(200, 9);
  });

  it('rádiusy delší než kužel → chyba', () => {
    const r = taperFillets({ D: 102, d: 100, L: 5, C: 0.4, bigSide: 'A',
      edges: { B: { R: 20, face: 'out', given: 'corner' }, A: { R: 20, face: 'in', given: 'corner' } } });
    expect(r.error || r.edges.A.error || r.edges.B.error).toBeTruthy();
  });

  it('kvadrant jen uvnitř kratšího oblouku', () => {
    const c = { r: 0, z: 0 };
    expect(arcExtremes(c, 1, { r: Math.cos(0.3), z: Math.sin(0.3) }, { r: 0, z: -1 }).max).not.toBe(null);
    expect(arcExtremes(c, 1, { r: 0, z: 1 }, { r: -1, z: 0 }).max).toBe(null);
  });
});

describe('kužel – přechod R, náhodná kontrola geometrie', () => {
  it('střed R je ve vzdálenosti R od površky i od čela, tečné body leží na nich', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 400; i++) {
      const aDeg = 1 + rnd() * 40, C = 2 * Math.tan(aDeg * DEG), L = 5 + rnd() * 100;
      const d = 20 + rnd() * 300, D = d + C * L, bigSide = rnd() < 0.5 ? 'A' : 'B';
      for (const side of ['A', 'B']) {
        const e = { R: 0.5 + rnd() * 10, face: rnd() < 0.5 ? 'in' : 'out', beta: (rnd() - 0.5) * 120, given: 'corner' };
        const r = taperFillets({ D, d, L, C, bigSide, edges: { [side]: e } }).edges[side];
        if (!r || !r.corner) continue;
        const P = { r: r.corner.dia / 2, z: r.corner.z };
        const c = { r: r.center.dia / 2, z: r.center.z };
        // površka: přes průsečík a druhou hranu
        const zo = side === 'B' ? 0 : L, other = (bigSide === (side === 'B' ? 'A' : 'B') ? D : d) / 2;
        const u = { r: other - P.r, z: zo - P.z }, ul = Math.hypot(u.r, u.z);
        const distCone = Math.abs((c.r - P.r) * u.z - (c.z - P.z) * u.r) / ul;
        const b = e.beta * DEG, f = { r: (e.face === 'in' ? -1 : 1) * Math.cos(b), z: Math.sin(b) };
        const distFace = Math.abs((c.r - P.r) * f.z - (c.z - P.z) * f.r);
        expect(distCone).toBeCloseTo(e.R, 7);
        expect(distFace).toBeCloseTo(e.R, 7);
        expect(Math.hypot(r.onCone.dia / 2 - c.r, r.onCone.z - c.z)).toBeCloseTo(e.R, 7);
        expect(Math.hypot(r.onFace.dia / 2 - c.r, r.onFace.z - c.z)).toBeCloseTo(e.R, 7);
        expect(r.t).toBeGreaterThan(0);
        if (r.maxDia) expect(r.maxDia.dia).toBeGreaterThanOrEqual(Math.max(r.onCone.dia, r.onFace.dia) - 1e-9);
        if (r.minDia) expect(r.minDia.dia).toBeLessThanOrEqual(Math.min(r.onCone.dia, r.onFace.dia) + 1e-9);
      }
    }
  });
});

describe('kužel – přechod R, konec čela', () => {
  const base = { D: 330 + 100 * Math.tan(10 * DEG), d: 330, L: 50, C: C10, bigSide: 'A' };
  const t = 12 / Math.tan(50 * DEG);
  it('Ø konce čela → délka čela a bod konce; délka → Ø konce', () => {
    const a = taperFillets({ ...base, edges: { B: { R: 12, face: 'in', given: 'corner', faceEndDia: 218 } } }).edges.B;
    expect(a.faceLen).toBeCloseTo((330 - 218) / 2, 9);
    expect(a.faceEnd.dia).toBeCloseTo(218, 9);
    expect(a.error).toBe('');
    const b = taperFillets({ ...base, edges: { B: { R: 12, face: 'in', given: 'corner', faceLen: 56 } } }).edges.B;
    expect(b.faceEnd.dia).toBeCloseTo(218, 9);
  });
  it('šikmé čelo: délka po čele, ne v Ø', () => {
    const e = taperFillets({ ...base, edges: { B: { R: 12, face: 'in', beta: 30, given: 'corner', faceLen: 20 } } }).edges.B;
    expect(e.faceEnd.dia).toBeCloseTo(330 - 2 * 20 * Math.cos(30 * DEG), 9);
    expect(e.faceEnd.z).toBeCloseTo(50 + 20 * Math.sin(30 * DEG), 9);
  });
  it('R se na čelo nevejde / konec čela na druhé straně → chyba', () => {
    const short = taperFillets({ ...base, edges: { B: { R: 12, face: 'in', given: 'corner', faceLen: t - 1 } } }).edges.B;
    expect(short.error).toContain('nevejde');
    const wrong = taperFillets({ ...base, edges: { B: { R: 12, face: 'in', given: 'corner', faceEndDia: 400 } } }).edges.B;
    expect(wrong.error).toContain('druhé straně');
  });
});

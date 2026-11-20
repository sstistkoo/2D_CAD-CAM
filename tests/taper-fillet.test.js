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

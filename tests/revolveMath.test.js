import { describe, it, expect } from 'vitest';
import { toZR, revolveProps, profilePoints, cylinderVolume } from '../js/calculators/revolveMath.js';

const line = (z1, r1, z2, r2) => ({ type: 'line', z1, r1, z2, r2 });
/** Oblouk v (z, r): střed, rádius, od úhlu a do úhlu [°], smysl. */
const arc = (zc, rc, R, a1, a2, ccw) => {
  const p = (a) => [zc + R * Math.cos(a * Math.PI / 180), rc + R * Math.sin(a * Math.PI / 180)];
  const [z1, r1] = p(a1), [z2, r2] = p(a2);
  return { type: 'arc', z1, r1, z2, r2, zc, rc, R, ccw };
};

describe('revolveProps – objem a těžiště', () => {
  it('válec Ø40 × 50 (otevřený profil: kolmice a osa se nepočítají)', () => {
    const r = revolveProps([line(0, 20, 50, 20)]);
    expect(r.volume).toBeCloseTo(cylinderVolume(40, 50), 6);
    expect(r.zCentroid).toBeCloseTo(25, 9);
    expect(r.rMax).toBe(20);
  });
  it('tentýž válec nakreslený uzavřeně včetně osy a kolmic, opačným směrem', () => {
    const r = revolveProps([line(50, 0, 50, 20), line(50, 20, 0, 20), line(0, 20, 0, 0), line(0, 0, 50, 0)]);
    expect(r.volume).toBeCloseTo(cylinderVolume(40, 50), 6);
    expect(r.zCentroid).toBeCloseTo(25, 9);
  });
  it('komolý kužel: V = πh/3·(R² + Rr + r²), těžiště podle vzorce', () => {
    const R = 30, r = 10, h = 60;
    const res = revolveProps([line(0, R, h, r)]);
    expect(res.volume).toBeCloseTo(Math.PI * h / 3 * (R * R + R * r + r * r), 6);
    const zc = h * (R * R + 2 * R * r + 3 * r * r) / (4 * (R * R + R * r + r * r));   // od velké podstavy
    expect(res.zCentroid).toBeCloseTo(zc, 6);
  });
  it('polokoule R25 (oblouk od osy po osu): 2/3·π·R³, těžiště 3/8·R od roviny řezu', () => {
    const R = 25;
    const res = revolveProps([arc(0, 0, R, 90, 0, false)]);        // z vrcholu (0,R) dolů do (R,0), po hodinách
    expect(res.volume).toBeCloseTo(2 / 3 * Math.PI * R ** 3, 6);
    expect(res.zCentroid).toBeCloseTo(3 / 8 * R, 6);
  });
  it('koule: horní půlkruh od osy po osu, a oblouk proti hodinám dá stejné', () => {
    const R = 12;
    const res = revolveProps([arc(5, 0, R, 180, 0, false)]);
    expect(res.volume).toBeCloseTo(4 / 3 * Math.PI * R ** 3, 6);
    expect(res.zCentroid).toBeCloseTo(5, 6);
    expect(revolveProps([arc(5, 0, R, 0, 180, true)]).volume).toBeCloseTo(4 / 3 * Math.PI * R ** 3, 6);
    expect(res.crossesAxis).toBe(false);
  });
  it('kruh přes osu (celá koule nakreslená dvěma půlkruhy) se pozná jako neplatný profil', () => {
    const res = revolveProps([arc(0, 0, 12, 180, 0, false), arc(0, 0, 12, 0, -180, false)]);
    expect(res.crossesAxis).toBe(true);
  });
  it('torus (kruh r = 5 se středem ve vzdálenosti 20 od osy): 2π²·R·r²', () => {
    const res = revolveProps([arc(0, 20, 5, 0, 180, true), arc(0, 20, 5, 180, 360, true)]);
    expect(res.volume).toBeCloseTo(2 * Math.PI ** 2 * 20 * 25, 5);
    expect(res.zCentroid).toBeCloseTo(0, 6);
    expect(res.crossesAxis).toBe(false);
    expect(res.rMin).toBeCloseTo(15, 9); expect(res.rMax).toBeCloseTo(25, 9);
  });
  it('celý kruh jedním obloukem (shodný začátek a konec)', () => {
    const res = revolveProps([arc(0, 20, 5, 0, 0, true)]);
    expect(res.volume).toBeCloseTo(2 * Math.PI ** 2 * 20 * 25, 5);
  });
  it('prstenec (trubka Ø60/Ø40 × 30): objem = válec − válec', () => {
    const res = revolveProps([line(0, 30, 30, 30), line(30, 30, 30, 20), line(30, 20, 0, 20), line(0, 20, 0, 30)]);
    expect(res.volume).toBeCloseTo(cylinderVolume(60, 30) - cylinderVolume(40, 30), 6);
  });
  it('profil pod osou (záporné r) dá stejný objem; přechod přes osu se pozná', () => {
    expect(revolveProps([line(0, -20, 50, -20)]).volume).toBeCloseTo(cylinderVolume(40, 50), 6);
    expect(revolveProps([line(0, -5, 10, 5)]).crossesAxis).toBe(true);
  });
  it('rozsah počítá i vrchol oblouku (půlkruh nad tětivou)', () => {
    const res = revolveProps([arc(0, 0, 10, 0, 180, true)]);
    expect(res.rMax).toBeCloseTo(10, 9);
    expect(res.zMin).toBeCloseTo(-10, 9); expect(res.zMax).toBeCloseTo(10, 9);
  });
  it('prázdný profil → null', () => { expect(revolveProps([])).toBeNull(); });
});

describe('toZR – soustruh × karusel', () => {
  const canvas = [
    { type: 'line', p1: { x: 0, y: 20 }, p2: { x: 50, y: 20 } },
    { type: 'arc', p1: { x: 50, y: 20 }, p2: { x: 60, y: 10 }, cx: 50, cy: 10, r: 10, ccw: false },
  ];
  it('soustruh: z = x, r = y', () => {
    const s = toZR(canvas, false);
    expect(s[0]).toMatchObject({ z1: 0, r1: 20, z2: 50, r2: 20 });
    expect(s[1]).toMatchObject({ zc: 50, rc: 10, ccw: false });
  });
  it('karusel: z = y, r = x, smysl oblouku se obrátí – objem stejného dílu je shodný', () => {
    // stejný díl nakreslený na karuselu (osy prohozené)
    const karusel = canvas.map(s => s.type === 'line'
      ? { ...s, p1: { x: s.p1.y, y: s.p1.x }, p2: { x: s.p2.y, y: s.p2.x } }
      : { ...s, p1: { x: s.p1.y, y: s.p1.x }, p2: { x: s.p2.y, y: s.p2.x }, cx: s.cy, cy: s.cx, ccw: !s.ccw });
    const a = revolveProps(toZR(canvas, false)), b = revolveProps(toZR(karusel, true));
    expect(b.volume).toBeCloseTo(a.volume, 6);
    expect(b.zCentroid).toBeCloseTo(a.zCentroid, 6);
  });
});

describe('profilePoints', () => {
  it('oblouk se vzorkuje a končí v koncovém bodě', () => {
    const p = profilePoints([arc(0, 0, 10, 0, 90, true)], 10);
    expect(p).toHaveLength(11);
    expect(p[10][0]).toBeCloseTo(0, 9); expect(p[10][1]).toBeCloseTo(10, 9);
  });
});

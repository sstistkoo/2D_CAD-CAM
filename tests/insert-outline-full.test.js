// ╔══════════════════════════════════════════════════════════════╗
// ║  Celá destička (jen kreslení) × řezná část (výpočet)           ║
// ╚══════════════════════════════════════════════════════════════╝
// Polygon se dřív kreslil jako trojúhelník špičky — tedy jen ŘEZNÁ ČÁST, ze
// které žije výpočet (úběr, dosah hrany, odečet od kolize držáku). Kreslí se
// teď celý kosočtverec/čtverec (buildInsertOutlineSegments), výpočet zůstává
// na řezné části: zadní půlka neřeže a sedí v lůžku držáku (uživatel
// 30. 9. 2026). Změřeno: jako řezná část by pohnula part-19 o průchod.
import { describe, it, expect } from 'vitest';
import { buildInsertProfileSegments, buildInsertOutlineSegments } from '../js/calculators/cam/insertPreview.js';

const sample = (segs) => {
  const pts = [];
  for (const s of segs) {
    if (s.type === 'line') { pts.push(s.from); continue; }
    const aF = Math.atan2(s.from.z - s.cz, s.from.x - s.cx);
    let d = Math.atan2(s.to.z - s.cz, s.to.x - s.cx) - aF;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    for (let k = 0; k < 64; k++) {
      const a = aF + d * (k / 64);
      pts.push({ x: s.cx + Math.cos(a) * s.r, z: s.cz + Math.sin(a) * s.r });
    }
  }
  return pts;
};
const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
};
const inside = (pts, p) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
// Bod na hranici nebo uvnitř (smrštěný ke středu o kousek, ať hrana neplete).
const covers = (outer, p) => {
  const cx = outer.reduce((s, q) => s + q.x, 0) / outer.length;
  const cz = outer.reduce((s, q) => s + q.z, 0) / outer.length;
  return inside(outer, { x: p.x + (cx - p.x) * 1e-3, z: p.z + (cz - p.z) * 1e-3 });
};
const base = { toolShape: 'polygon', toolLength: 10, toolRadius: 0.8, toolAngle: 15 };

describe('buildInsertOutlineSegments — celá polygonální destička', () => {
  for (const eps of [35, 55, 80, 90]) {
    it(`ε ${eps}° → uzavřený kosočtverec s R i v protějším rohu, obsahuje řeznou část`, () => {
      const prms = { ...base, toolTipAngle: eps };
      const full = buildInsertOutlineSegments(prms);
      const cut = buildInsertProfileSegments(prms);
      // Řezná část je pořád trojúhelník špičky (výpočet se nemění).
      expect(cut.map(s => s.type)).toEqual(['line', 'line', 'line', 'arc']);
      expect(full.map(s => s.type)).toEqual(['line', 'line', 'arc', 'line', 'line', 'arc']);
      // Navazující řetěz.
      for (let i = 0; i < full.length; i++) {
        const a = full[i].to, b = full[(i + 1) % full.length].from;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-9);
      }
      // Plocha = kosočtverec L²·sin ε bez dvou zaoblených rohů.
      const e = eps * Math.PI / 180, R = 0.8, L = 10;
      const corner = R * R * (1 / Math.tan(e / 2) - (Math.PI - e) / 2);
      expect(area(sample(full))).toBeCloseTo(L * L * Math.sin(e) - 2 * corner, 1);
      const fullPts = sample(full);
      for (const p of sample(cut)) expect(covers(fullPts, p)).toBe(true);
    });
  }

  it('⇄ Přehodit stranu → celá destička na té straně, kde je řezná část', () => {
    const prms = { ...base, toolTipAngle: 80, toolTipMirror: true };
    const fullPts = sample(buildInsertOutlineSegments(prms));
    for (const p of sample(buildInsertProfileSegments(prms))) expect(covers(fullPts, p)).toBe(true);
    const plain = sample(buildInsertOutlineSegments({ ...prms, toolTipMirror: false }));
    expect(area(fullPts)).toBeCloseTo(area(plain), 6);
  });

  it('ε 60° (trojúhelník) a trigon W → celá destička = řezná část', () => {
    for (const prms of [{ ...base, toolTipAngle: 60 }, { ...base, toolTipAngle: 80, toolVbdCode: 'WNMG080408' }]) {
      expect(buildInsertOutlineSegments(prms)).toEqual(buildInsertProfileSegments(prms));
    }
  });

  it('kulatá a upichovák → beze změny', () => {
    for (const prms of [{ toolShape: 'round', toolRadius: 10 }, { toolShape: 'parting', toolLength: 5, toolRadius: 0.5, toolAngle: 0 }]) {
      expect(buildInsertOutlineSegments(prms)).toEqual(buildInsertProfileSegments(prms));
    }
  });
});

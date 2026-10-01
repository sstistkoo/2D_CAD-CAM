// ╔══════════════════════════════════════════════════════════════╗
// ║  Celá destička (jen kreslení) × řezná část (výpočet)           ║
// ╚══════════════════════════════════════════════════════════════╝
// Polygon se dřív kreslil jako trojúhelník špičky — tedy jen ŘEZNÁ ČÁST, ze
// které žije výpočet (úběr, dosah hrany, odečet od kolize držáku). Kreslí se
// teď celý kosočtverec/čtverec (buildInsertOutlineSegments), výpočet zůstává
// na řezné části: zadní půlka neřeže a sedí v lůžku držáku (uživatel
// 30. 9. 2026). Změřeno: jako řezná část by pohnula part-19 o průchod.
import { describe, it, expect } from 'vitest';
import { buildInsertProfileSegments, buildInsertOutlineSegments, threadingToothSegments, THREADING_INSERT_EDGE_MM } from '../js/calculators/cam/insertPreview.js';

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
// Plocha, kterou rádius R ubere z ostrého rohu o úhlu θ.
const cornerCut = (th, R) => R * R * (1 / Math.tan(th / 2) - (Math.PI - th) / 2);
// Body řezné části mimo ostré rohy na koncích hran (ty z celého, zaobleného
// obrysu vyčnívají o kousek — kreslí se oříznuté, výpočet je bere ostré).
const cutAwayFromEdgeEnds = (cut, R) => sample(cut).filter(p =>
  [cut[0].to, cut[2].from].every(c => Math.hypot(p.x - c.x, p.z - c.z) > 3 * R));

describe('buildInsertOutlineSegments — celá polygonální destička', () => {
  for (const eps of [35, 55, 80, 90]) {
    it(`ε ${eps}° → uzavřený kosočtverec s R ve všech rozích, obsahuje řeznou část`, () => {
      const prms = { ...base, toolTipAngle: eps };
      const full = buildInsertOutlineSegments(prms);
      const cut = buildInsertProfileSegments(prms);
      // Řezná část je pořád trojúhelník špičky (výpočet se nemění).
      expect(cut.map(s => s.type)).toEqual(['line', 'line', 'line', 'arc']);
      expect(full.map(s => s.type)).toEqual(['line', 'arc', 'line', 'arc', 'line', 'arc', 'line', 'arc']);
      // Navazující řetěz.
      for (let i = 0; i < full.length; i++) {
        const a = full[i].to, b = full[(i + 1) % full.length].from;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-9);
      }
      // Plocha = kosočtverec L²·sin ε bez čtyř zaoblených rohů (2× ε, 2× 180° − ε).
      const e = eps * Math.PI / 180, R = 0.8, L = 10;
      const corners = 2 * cornerCut(e, R) + 2 * cornerCut(Math.PI - e, R);
      expect(area(sample(full))).toBeCloseTo(L * L * Math.sin(e) - corners, 1);
      // Mimo řeznou část nic nevyčnívá: rohy na koncích hran jsou zaoblené.
      for (const p of [cut[0].to, cut[2].from]) expect(covers(sample(full), p)).toBe(false);
      const fullPts = sample(full);
      for (const p of cutAwayFromEdgeEnds(cut, R)) expect(covers(fullPts, p)).toBe(true);
    });
  }

  it('⇄ Přehodit stranu → celá destička na té straně, kde je řezná část', () => {
    const prms = { ...base, toolTipAngle: 80, toolTipMirror: true };
    const fullPts = sample(buildInsertOutlineSegments(prms));
    for (const p of cutAwayFromEdgeEnds(buildInsertProfileSegments(prms), 0.8)) expect(covers(fullPts, p)).toBe(true);
    const plain = sample(buildInsertOutlineSegments({ ...prms, toolTipMirror: false }));
    expect(area(fullPts)).toBeCloseTo(area(plain), 6);
  });

  it('ε 60° (trojúhelník) → bez zadní půlky, ale s R ve všech třech rozích', () => {
    const prms = { ...base, toolTipAngle: 60 };
    const full = buildInsertOutlineSegments(prms);
    expect(full.map(s => s.type)).toEqual(['line', 'arc', 'line', 'arc', 'line', 'arc']);
    const R = 0.8, L = 10;
    expect(area(sample(full))).toBeCloseTo(Math.sqrt(3) / 4 * L * L - 3 * cornerCut(Math.PI / 3, R), 1);
  });

  it('velký R (oblouky by se překryly) → obrys se nezkříží', () => {
    const segX = (a, b, c, d) => {
      const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
      return o(a, b, c) * o(a, b, d) < -1e-12 && o(c, d, a) * o(c, d, b) < -1e-12;
    };
    for (const prms of [
      { ...base, toolTipAngle: 90, toolRadius: 10 },
      { ...base, toolTipAngle: 35, toolRadius: 3 },
      { ...base, toolTipAngle: 60, toolRadius: 4 },
      { ...base, toolTipAngle: 80, toolRadius: 6, toolTipMirror: true },
    ]) {
      const pts = sample(buildInsertOutlineSegments(prms));
      const n = pts.length;
      let crossings = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue;
          if (segX(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) crossings++;
        }
      }
      expect(crossings, `ε${prms.toolTipAngle} R${prms.toolRadius}`).toBe(0);
    }
  });

  it('trigon W → celá destička = řezná část (kosočtverec by ho nevystihl)', () => {
    const prms = { ...base, toolTipAngle: 80, toolVbdCode: 'WNMG080408' };
    expect(buildInsertOutlineSegments(prms)).toEqual(buildInsertProfileSegments(prms));
  });

  it('kulatá a upichovák → beze změny', () => {
    for (const prms of [{ toolShape: 'round', toolRadius: 10 }, { toolShape: 'parting', toolLength: 5, toolRadius: 0.5, toolAngle: 0 }]) {
      expect(buildInsertOutlineSegments(prms)).toEqual(buildInsertProfileSegments(prms));
    }
  });
});

describe('buildInsertOutlineSegments — celá závitová destička', () => {
  // Úhly a spodní strany jako po výběru závitu (Tr/Acme 0,366·P, jinak 0,1).
  const cases = [
    { name: 'M 60°', toolTipAngle: 60, toolTipFlat: 0.1 },
    { name: 'G 55°', toolTipAngle: 55, toolTipFlat: 0.1 },
    { name: 'Tr 30° P6', toolTipAngle: 30, toolTipFlat: 2.2 },
    { name: 'Acme 29° P5', toolTipAngle: 29, toolTipFlat: 1.83 },
  ];
  for (const c of cases) {
    it(`${c.name} → trojúhelník se třemi stejnými zuby, pracovní zub uvnitř`, () => {
      const prms = { toolShape: 'threading', toolLength: 4, toolRadius: 0, ...c };
      // Výpočet závitovou destičku dál nebere.
      expect(buildInsertProfileSegments(prms)).toEqual([]);
      const full = buildInsertOutlineSegments(prms);
      expect(full.length).toBe(12);
      for (let i = 0; i < full.length; i++) {
        const a = full[i].to, b = full[(i + 1) % full.length].from;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-9);
      }
      const pts = full.map(s => s.from);
      // Pracovní zub: spodní strana na špičce (z = 0) a nic pod ní.
      expect(Math.min(...pts.map(p => p.z))).toBeCloseTo(0, 9);
      // Tři stejné zuby: otočení o 120° kolem těžiště obrys nezmění.
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      const co = Math.cos(2 * Math.PI / 3), si = Math.sin(2 * Math.PI / 3);
      for (const p of pts) {
        const q = { x: cx + (p.x - cx) * co - (p.z - cz) * si, z: cz + (p.x - cx) * si + (p.z - cz) * co };
        expect(Math.min(...pts.map(r => Math.hypot(r.x - q.x, r.z - q.z)))).toBeLessThan(1e-9);
      }
      // Těleso: boky jdou z horního rohu zubu do horního rohu sousedního zubu,
      // prodloužené do vrcholů dají rovnostranný trojúhelník o hraně 16 mm.
      // Horní roh zubu (polovina šířky a) leží na boku 2a od vrcholu, tj. na
      // každém konci boku chybí šířka vršku zubu 2a.
      const side = full[3];
      const sideLen = Math.hypot(side.to.x - side.from.x, side.to.z - side.from.z);
      const toothTopW = Math.hypot(full[0].from.x - full[2].to.x, full[0].from.z - full[2].to.z);
      expect(sideLen + 2 * toothTopW).toBeCloseTo(THREADING_INSERT_EDGE_MM, 6);
      // Pracovní zub leží v celé destičce.
      const fullPts = sample(full);
      for (const p of sample(threadingToothSegments(prms))) expect(covers(fullPts, p)).toBe(true);
    });
  }

  it('60° → bok zubu plynule pokračuje bokem tělesa (destička A60 je roh trojúhelníku)', () => {
    const full = buildInsertOutlineSegments({ toolShape: 'threading', toolLength: 4, toolTipAngle: 60, toolTipFlat: 0.1 });
    const dir = s => Math.atan2(s.to.z - s.from.z, s.to.x - s.from.x);
    expect(dir(full[3])).toBeCloseTo(dir(full[2]), 9);   // pravý bok zubu → bok tělesa
  });
});

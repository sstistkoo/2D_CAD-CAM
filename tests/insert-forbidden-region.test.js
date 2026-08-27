// ╔══════════════════════════════════════════════════════════════╗
// ║  insertWorldLoop + buildToolForbiddenRegion (Fáze 2b/3)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Foundation pro sjednocenou zakázanou oblast nástroje: obrys destičky ve
// světě + F_all = (obstacle ⊕ −držák) ∪ (obstacle ⊕ −destička). Zamyká, že
// obrys destičky sedí (round = kruh R, parting = tělo šířky b) a že se dílčí
// oblasti sjednotí do čistých smyček. Viz docs/geometry-libs-migration.md.
import { describe, it, expect } from 'vitest';
import { insertWorldLoop, buildToolForbiddenRegion, buildTipForbiddenRegion } from '../js/calculators/cam/toolEnvelope.js';
import { buildInsertProfileSegments, PARTING_BODY_MIN_H_MM } from '../js/calculators/cam/insertPreview.js';
import { holderWorldLoop } from '../js/calculators/cam/collisionValidator.js';
import { polyArea } from '../js/geom/geomCore.js';

const extent = (loop) => {
  const xs = loop.map(p => p.x), zs = loop.map(p => p.z);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
};
const area = (loop) => Math.abs(polyArea([loop]));

describe('insertWorldLoop — obrys destičky ve světě', () => {
  it('round → kruh rádiusu R (plocha ≈ πR²)', () => {
    const loop = insertWorldLoop({ toolShape: 'round', toolRadius: 2 });
    const e = extent(loop);
    expect(e.xMin).toBeCloseTo(-2, 1); expect(e.xMax).toBeCloseTo(2, 1);
    expect(e.zMin).toBeCloseTo(-2, 1); expect(e.zMax).toBeCloseTo(2, 1);
    expect(area(loop)).toBeCloseTo(Math.PI * 4, 0);   // 12.57, vzorkováno → tolerance
  });

  it('parting → tělo destičky sahá radiálně nahoru (šířka b v ose z)', () => {
    const loop = insertWorldLoop({ toolShape: 'parting', toolLength: 5, toolRadius: 0.8, toolAngle: 0 });
    const e = extent(loop);
    // Tělo míří k držáku (+x radiálně) o ~15 mm (PARTING_BODY_MIN_H_MM), špička u 0.
    expect(e.xMax).toBeGreaterThan(10);
    expect(e.xMin).toBeCloseTo(-0.8, 1);
    // Šířka plátku b=5 → z rozsah ~ toolLength.
    expect(e.zMax - e.zMin).toBeGreaterThan(4);
    expect(area(loop)).toBeGreaterThan(50);
  });

  it('parting → uzavřený souměrný obrys s OBĚMA boky (rovná plocha, ne půlkruh)', () => {
    // Regrese: pravý rádius mířil rovnou na horní roh těla, který na kružnici
    // NELEŽÍ — z pravé strany plátku vyšel půlkruh místo rovného boku a obrys
    // zůstal otevřený (nález uživatele při „Kreslit držák na CAD plátně“).
    const b = 5, R = 0.8;
    const segs = buildInsertProfileSegments({ toolShape: 'parting', toolLength: b, toolRadius: R, toolAngle: 0 });
    // Řetěz musí navazovat a uzavřít se.
    segs.forEach((sg, i) => {
      const nx = segs[(i + 1) % segs.length];
      expect(Math.hypot(sg.to.x - nx.from.x, sg.to.z - nx.from.z)).toBeLessThan(1e-9);
    });
    // Oba rádiusy jsou ČTVRTOBLOUKY — oba konce leží na své kružnici.
    const arcs = segs.filter(sg => sg.type === 'arc');
    expect(arcs).toHaveLength(2);
    arcs.forEach(sg => [sg.from, sg.to].forEach(pt =>
      expect(Math.hypot(pt.x - sg.cx, pt.z - sg.cz)).toBeCloseTo(sg.r, 9)));
    // Plocha = obdélník b × výška těla bez dvou rohových výřezů. Bez pravého
    // boku vycházela menší (73,18 místo 78,71 mm²).
    const h = Math.max(b * 0.6, R + PARTING_BODY_MIN_H_MM);
    const corner = R * R - Math.PI * R * R / 4;
    const loop = insertWorldLoop({ toolShape: 'parting', toolLength: b, toolRadius: R, toolAngle: 0 });
    expect(area(loop)).toBeCloseTo(b * h - 2 * corner, 1);
  });

  it('polygon → nenulový konvexní obrys', () => {
    const loop = insertWorldLoop({ toolShape: 'polygon', toolLength: 10, toolRadius: 0.8, toolTipAngle: 80, toolAngle: 0 });
    expect(loop.length).toBeGreaterThanOrEqual(4);
    expect(area(loop)).toBeGreaterThan(10);
  });

  it('threading → null (V-profil se do kolizní obálky nepočítá)', () => {
    expect(insertWorldLoop({ toolShape: 'threading', toolTipAngle: 60, toolLength: 4 })).toBeNull();
  });
});

describe('buildToolForbiddenRegion — sjednocení držák ∪ destička', () => {
  const obstacle = [
    { x: 0, z: 40 }, { x: 25, z: 40 }, { x: 25, z: 25 },
    { x: 10, z: 25 }, { x: 10, z: 10 }, { x: 25, z: 10 },
    { x: 25, z: -5 }, { x: 0, z: -5 },
  ];

  it('držák + round destička → jedna souvislá oblast, reachX = dosah držáku', () => {
    const { forbidden, reachX } = buildToolForbiddenRegion([obstacle],
      { toolShape: 'round', toolRadius: 0.8, holderWidth: 8, holderLength: 20, toolLength: 10 });
    expect(forbidden.length).toBeGreaterThanOrEqual(1);
    expect(reachX).toBeCloseTo(30, 1);   // z0=10 + l1=20
    expect(forbidden.reduce((s, l) => s + area(l), 0)).toBeGreaterThan(100);
  });

  it('parting (šířka b) přispívá tělem — F_all vznikne i bez čistě kruhové špičky', () => {
    const { forbidden, reachX } = buildToolForbiddenRegion([obstacle],
      { toolShape: 'parting', toolLength: 5, toolRadius: 0.8, toolAngle: 0, holderWidth: 8, holderLength: 20 });
    expect(forbidden.length).toBeGreaterThanOrEqual(1);
    expect(reachX).toBeCloseTo(25, 1);   // z0=max(toolLen5,4)=5 + l1=20
  });

  // ── Politika „tělo jen bez úlevu" (rozhodnutí migrace Fáze 2b/3) ──
  it('parting BEZ držáku → tělo (šířka b) samo vytvoří kolizní oblast', () => {
    const { forbidden } = buildToolForbiddenRegion([obstacle],
      { toolShape: 'parting', toolLength: 5, toolRadius: 0.8, toolAngle: 0, holderWidth: 0, holderLength: 0 });
    expect(forbidden.length).toBeGreaterThanOrEqual(1);
    expect(forbidden.reduce((s, l) => s + area(l), 0)).toBeGreaterThan(100);
  });

  it('round BEZ držáku → prázdná oblast (celá destička je aktivní nos)', () => {
    const { forbidden } = buildToolForbiddenRegion([obstacle],
      { toolShape: 'round', toolRadius: 0.8, holderWidth: 0, holderLength: 0 });
    expect(forbidden).toEqual([]);
  });

  it('polygon BEZ držáku → prázdná oblast (zadní hrany mají úlev → tělo se nepočítá)', () => {
    const { forbidden } = buildToolForbiddenRegion([obstacle],
      { toolShape: 'polygon', toolLength: 10, toolRadius: 0.8, toolTipAngle: 80, toolAngle: 0, holderWidth: 0, holderLength: 0 });
    expect(forbidden).toEqual([]);
  });

  it('polygon S držákem → F_all = PŘESNĚ holder-only (tělo polygonu nepřispívá)', () => {
    const prms = { toolShape: 'polygon', toolLength: 10, toolRadius: 0.8, toolTipAngle: 80, toolAngle: 0, holderWidth: 8, holderLength: 20, toolLength2: 10 };
    const holderOnly = buildTipForbiddenRegion([obstacle], holderWorldLoop(prms, false));
    const all = buildToolForbiddenRegion([obstacle], prms);
    // Stejná reprezentace (syrové smyčky, žádný polyUnion navíc) → nulová regrese.
    expect(all.forbidden).toEqual(holderOnly);
  });

  it('threading (holder 0) → prázdná oblast', () => {
    const { forbidden, reachX } = buildToolForbiddenRegion([obstacle],
      { toolShape: 'threading', toolTipAngle: 60, toolLength: 4, holderWidth: 0, holderLength: 0 });
    expect(forbidden).toEqual([]);
    expect(reachX).toBe(0);
  });
});

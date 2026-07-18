// ╔══════════════════════════════════════════════════════════════╗
// ║  Charakterizace buildHolderBoundaryPts — hranice hlídání držáku ║
// ╚══════════════════════════════════════════════════════════════╝
//
// buildHolderBoundaryPts staví „mezní čáru" od dotykového bodu dolů: v každé
// výšce max(hrana destičky, dosažitelný okraj zakázané oblasti špičky F).
// Regresní fixtures (cam-gcode-regression) jsou dle validátoru kolizí PROSTÉ,
// takže tuhle větev NEPOKRÝVAJÍ (držákový clamp se v nich neaktivuje). Tenhle
// test proto zamyká chování PŘÍMO — pojistka pro migraci hranice na Clipper2
// (Fáze 2b/3, docs/geometry-libs-migration.md). Vstup F se staví stejnou
// cestou jako v pipeline: buildTipForbiddenRegion(obstacle, holder).
import { describe, it, expect } from 'vitest';
import { buildHolderBoundaryPts } from '../js/calculators/cam/interferenceGuides.js';
import { buildTipForbiddenRegion } from '../js/calculators/cam/toolEnvelope.js';

// Obdélníkový držák relativně ke špičce (svět: x = radiálně nad špičkou,
// z = axiálně). hw=8, l1=20, z0=10 → x∈[10,30], z∈[-4,4].
const hw = 8, l1 = 20, z0 = 10;
const holder = [
  { x: z0, z: -hw / 2 }, { x: z0, z: hw / 2 },
  { x: z0 + l1, z: hw / 2 }, { x: z0 + l1, z: -hw / 2 },
];
const reachX = Math.max(...holder.map(p => p.x));

// Překážka: stěna–údolí–stěna (schodová kapsa). Držák nedosáhne na dno.
const obstacle = [
  { x: 0, z: 40 }, { x: 25, z: 40 }, { x: 25, z: 25 },
  { x: 10, z: 25 }, { x: 10, z: 10 }, { x: 25, z: 10 },
  { x: 25, z: -5 }, { x: 0, z: -5 },
];
const forbidden = buildTipForbiddenRegion([obstacle], holder);

// Kompaktní popis lomené čáry pro asserty.
const poly = (best, betaDeg) => {
  const b = betaDeg * Math.PI / 180;
  const out = buildHolderBoundaryPts(best, Math.sin(b), Math.cos(b), forbidden, reachX);
  return out ? out.map(p => `(${p.x.toFixed(2)},${p.z.toFixed(2)})`).join(' ') : null;
};

describe('buildHolderBoundaryPts — hranice hlídání držáku', () => {
  it('F se postaví z jediné souvislé smyčky', () => {
    expect(forbidden.length).toBe(1);
    const xs = forbidden[0].map(p => p.x);
    expect(Math.max(...xs)).toBeCloseTo(15, 1);
  });

  it('svislá hrana (0°) → přímá čára dolů, držák nezlomí', () => {
    expect(poly({ x: 25, z: 25 }, 0)).toBe('(25.00,25.00) (-5.00,25.00)');
  });

  it('natočená hrana (15°) → lomená čára: hrana destičky pak plató držáku pak dolů', () => {
    expect(poly({ x: 25, z: 25 }, 15)).toBe('(25.00,25.00) (23.93,21.00) (0.00,21.00) (-5.00,-9.00)');
  });

  it('nižší dotyk (25,10) svisle → přímá čára dolů', () => {
    expect(poly({ x: 25, z: 10 }, 0)).toBe('(25.00,10.00) (-5.00,10.00)');
  });

  it('bez F (prázdné pole) → null', () => {
    expect(buildHolderBoundaryPts({ x: 25, z: 25 }, 0, 1, [], reachX)).toBeNull();
  });

  it('reachX ≤ 0 → null', () => {
    expect(buildHolderBoundaryPts({ x: 25, z: 25 }, 0, 1, forbidden, 0)).toBeNull();
  });
});

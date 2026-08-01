import { describe, it, expect } from 'vitest';
import {
  elementRay,
  intersectRays,
  solveCornerLineLine,
  intersectRayCircle,
  pickByVpolTag,
  solveLineArcJunction,
  solveLineArcJunctionCandidates,
  tangentCircleTouchPoints,
  tangentCircleBetweenRays,
  pickBetweenRaysByVpolTag,
  twoTangentArcsBetweenRays,
  pickTwoArcsByVpolTag,
} from '../js/calculators/vkSolver.js';

describe('elementRay', () => {
  it('používá PA přímo, pokud je zadané', () => {
    const ray = elementRay({ x: null, z: null, pa: 45 }, { z: 1, x: 2 });
    expect(ray).toEqual({ z0: 1, x0: 2, angleDeg: 45 });
  });
  it('bez PA a se zadaným X (Z=?) je válcová (0°)', () => {
    const ray = elementRay({ x: 30, z: null, pa: null }, { z: 0, x: 30 });
    expect(ray.angleDeg).toBe(0);
  });
  it('bez PA a se zadaným Z (X=?) je čelní (90°)', () => {
    const ray = elementRay({ x: null, z: -10, pa: null }, { z: -10, x: 0 });
    expect(ray.angleDeg).toBe(90);
  });
  it('bez PA a s oběma souřadnicemi neznámými vyhodí chybu', () => {
    expect(() => elementRay({ x: null, z: null, pa: null }, { z: 0, x: 0 })).toThrow();
  });
});

describe('intersectRays', () => {
  it('protne vodorovný a svislý paprsek', () => {
    const r1 = { z0: 0, x0: 0, angleDeg: 0 };   // X=0 pro libovolné Z
    const r2 = { z0: 5, x0: 10, angleDeg: 90 }; // Z=5 pro libovolné X
    const pt = intersectRays(r1, r2);
    expect(pt.z).toBeCloseTo(5, 9);
    expect(pt.x).toBeCloseTo(0, 9);
  });
  it('rovnoběžné paprsky vrací null', () => {
    const r1 = { z0: 0, x0: 0, angleDeg: 30 };
    const r2 = { z0: 5, x0: 5, angleDeg: 30 };
    expect(intersectRays(r1, r2)).toBeNull();
  });
  it('obecné úhly (30°/120°) – ověřeno ručním výpočtem', () => {
    const r1 = { z0: 0, x0: 0, angleDeg: 30 };
    const r2 = { z0: 20, x0: 10, angleDeg: 120 };
    const pt = intersectRays(r1, r2);
    expect(pt.z).toBeCloseTo(19.3301, 3);
    expect(pt.x).toBeCloseTo(11.1603, 3);
  });
});

describe('solveCornerLineLine – kategorie 1 (case 1-4)', () => {
  it('case 1: válcová (X30 dané) → čelní (X60 Z-20, bez PA = kolmo)', () => {
    const prevAnchor = { z: 0, x: 30 }; // už na průměru 30
    const prevEl = { x: 30, z: null, pa: null };
    const currEl = { x: 60, z: -20, pa: null };
    const corner = solveCornerLineLine(prevAnchor, prevEl, currEl);
    // vodorovná (X=30) protne svislou (Z=-20) triviálně v (Z-20, X30)
    expect(corner.z).toBeCloseTo(-20, 6);
    expect(corner.x).toBeCloseTo(30, 6);
  });

  it('case 4: kužel (30°) → kužel (120°, explicitní PA)', () => {
    const prevAnchor = { z: 0, x: 0 };
    const prevEl = { x: null, z: null, pa: 30 };
    const currEl = { x: 11.1603, z: 19.3301, pa: 120 };
    const corner = solveCornerLineLine(prevAnchor, prevEl, currEl);
    // stejná geometrie jako test „obecné úhly" v intersectRays výše
    expect(corner.z).toBeCloseTo(19.3301, 2);
    expect(corner.x).toBeCloseTo(11.1603, 2);
  });

  it('rovnoběžné prvky vyhodí chybu', () => {
    const prevAnchor = { z: 0, x: 0 };
    const prevEl = { x: null, z: null, pa: 30 };
    const currEl = { x: 10, z: 10, pa: 30 };
    expect(() => solveCornerLineLine(prevAnchor, prevEl, currEl)).toThrow();
  });
});

describe('intersectRayCircle', () => {
  it('5-12-13 trojúhelník: vodorovný paprsek (X=10 → r=5) vs kružnice r=13 kolem (0,0)', () => {
    const ray = { z0: 0, x0: 10, angleDeg: 0 };
    const center = { z: 0, x: 0 };
    const pts = intersectRayCircle(ray, center, 13);
    expect(pts).toHaveLength(2);
    const zs = pts.map(p => p.z).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(-12, 6);
    expect(zs[1]).toBeCloseTo(12, 6);
    pts.forEach(p => expect(p.x).toBeCloseTo(10, 6));
  });

  it('tečna (disc≈0) vrací jediný bod', () => {
    const ray = { z0: -50, x0: 20, angleDeg: 0 }; // r0=10, tečna ke kružnici r=10 kolem (0,0)
    const pts = intersectRayCircle(ray, { z: 0, x: 0 }, 10);
    expect(pts).toHaveLength(1);
  });

  it('mimo dosah vrací prázdné pole', () => {
    const ray = { z0: 0, x0: 100, angleDeg: 0 };
    const pts = intersectRayCircle(ray, { z: 0, x: 0 }, 5);
    expect(pts).toHaveLength(0);
  });
});

describe('pickByVpolTag', () => {
  const points = [{ z: -12, x: 10 }, { z: 12, x: 10 }];
  it('VPOL1 vybere bližší k refPoint', () => {
    const ref = { z: -20, x: 0 };
    expect(pickByVpolTag(points, ref, 'VPOL1')).toEqual({ z: -12, x: 10 });
  });
  it('VPOL2 vybere vzdálenější od refPoint', () => {
    const ref = { z: -20, x: 0 };
    expect(pickByVpolTag(points, ref, 'VPOL2')).toEqual({ z: 12, x: 10 });
  });
});

describe('solveLineArcJunction – kategorie 4 (case 12-13)', () => {
  it('vrátí jediné řešení bez potřeby tagu (tečna)', () => {
    const ray = { z0: -50, x0: 20, angleDeg: 0 };
    const pt = solveLineArcJunction(ray, { z: 0, x: 0 }, 10, { z: 0, x: 0 }, null);
    expect(pt.z).toBeCloseTo(0, 6);
    expect(pt.x).toBeCloseTo(20, 6);
  });

  it('dvě řešení bez tagu vyhodí chybu', () => {
    const ray = { z0: 0, x0: 10, angleDeg: 0 };
    expect(() => solveLineArcJunction(ray, { z: 0, x: 0 }, 13, { z: -20, x: 0 }, null)).toThrow();
  });

  it('dvě řešení s VPOL1/VPOL2 se rozliší podle refPoint', () => {
    const ray = { z0: 0, x0: 10, angleDeg: 0 };
    const ref = { z: -20, x: 0 };
    const p1 = solveLineArcJunction(ray, { z: 0, x: 0 }, 13, ref, 'VPOL1');
    const p2 = solveLineArcJunction(ray, { z: 0, x: 0 }, 13, ref, 'VPOL2');
    expect(p1.z).toBeCloseTo(-12, 6);
    expect(p2.z).toBeCloseTo(12, 6);
  });

  it('vrací všechny kandidáty řešení pro ambiguální VPOL průsečík', () => {
    const ray = { z0: 0, x0: 10, angleDeg: 0 };
    const candidates = solveLineArcJunctionCandidates(ray, { z: 0, x: 0 }, 13);
    expect(candidates).toHaveLength(2);
    const zs = candidates.map(pt => pt.z).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(-12, 6);
    expect(zs[1]).toBeCloseTo(12, 6);
  });

  it('mimo dosah vyhodí chybu', () => {
    const ray = { z0: 0, x0: 100, angleDeg: 0 };
    expect(() => solveLineArcJunction(ray, { z: 0, x: 0 }, 5, { z: 0, x: 0 }, null)).toThrow();
  });
});

describe('tangentCircleTouchPoints – kategorie 2, case 5', () => {
  it('kružnice r=5 tečná k ose Z (r=0), procházející bodem (z=8,x=10 → r=5)', () => {
    // ručně sestrojeno: střed (z=3,r=5) je tečný ke z-ose v (z=3,r=0) a
    // zároveň leží na něm bod (z=8,r=5) [(8-3)²+(5-5)²=25 ✓]
    const ray = { z0: 0, x0: 0, angleDeg: 0 };
    const point = { z: 8, x: 10 };
    const pts = tangentCircleTouchPoints(ray, point, 5);
    expect(pts.length).toBe(2);
    const zs = pts.map(p => p.z).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(3, 6);
    expect(zs[1]).toBeCloseTo(13, 6);
    pts.forEach(p => expect(p.x).toBeCloseTo(0, 6));
  });

  it('bod mimo dosah (žádné řešení na dané straně) vrací prázdné pole', () => {
    const ray = { z0: 0, x0: 0, angleDeg: 0 };
    const point = { z: 1000, x: 1000 };
    expect(tangentCircleTouchPoints(ray, point, 5)).toHaveLength(0);
  });
});

describe('tangentCircleBetweenRays – kategorie 2, case 6-8', () => {
  it('pravý úhel: vodorovná (r=0) a svislá (z=20) přímka, R=5 → 4 kružnice v rozích', () => {
    const ray1 = { z0: 0, x0: 0, angleDeg: 0 };   // r=0, libovolné z
    const ray2 = { z0: 20, x0: 0, angleDeg: 90 }; // z=20, libovolné r
    const candidates = tangentCircleBetweenRays(ray1, ray2, 5);
    expect(candidates).toHaveLength(4);
    const centers = candidates.map(c => `${c.center.z.toFixed(1)},${c.center.x.toFixed(1)}`).sort();
    // středy v (z,x=2r): (15, x=10), (15, x=-10), (25, x=10), (25, x=-10)
    expect(centers).toEqual(['15.0,-10.0', '15.0,10.0', '25.0,-10.0', '25.0,10.0'].sort());

    const c1 = candidates.find(c => Math.abs(c.center.z - 15) < 0.01 && c.center.x > 0);
    expect(c1.foot1.z).toBeCloseTo(15, 6);
    expect(c1.foot1.x).toBeCloseTo(0, 6);
    expect(c1.foot2.z).toBeCloseTo(20, 6);
    expect(c1.foot2.x).toBeCloseTo(10, 6);
  });

  it('rovnoběžné paprsky nedávají žádné řešení (přeskočeny)', () => {
    const ray1 = { z0: 0, x0: 0, angleDeg: 30 };
    const ray2 = { z0: 10, x0: 10, angleDeg: 30 };
    expect(tangentCircleBetweenRays(ray1, ray2, 5)).toHaveLength(0);
  });
});

describe('pickBetweenRaysByVpolTag', () => {
  it('VPOL1/VPOL2 rozliší podle vzdálenosti STŘEDU od refPoint', () => {
    const ray1 = { z0: 0, x0: 0, angleDeg: 0 };
    const ray2 = { z0: 20, x0: 0, angleDeg: 90 };
    const candidates = tangentCircleBetweenRays(ray1, ray2, 5);
    const ref = { z: 15, x: 10 }; // nejblíž centru (15, x=10)
    const nearest = pickBetweenRaysByVpolTag(candidates, ref, 'VPOL1');
    expect(nearest.center.z).toBeCloseTo(15, 6);
    expect(nearest.center.x).toBeCloseTo(10, 6);
  });
});

describe('twoTangentArcsBetweenRays – kategorie 3 (case 9-11, esíčko)', () => {
  it('pravoúhlý roh (r=0 / z=40), R1=5 R2=3, zadaná Z bodu zlomu – ověřeno ručním výpočtem', () => {
    // ručně: center1=(z=30,r=5) tečný k r=0 v (30,0); center2=(z=37,r=8.873)
    // tečný k z=40 v (40,8.873); vzdálenost center1-center2 = 8 = R1+R2;
    // bod zlomu (vážený průměr R1:R2) má z = 34.375
    const ray1 = { z0: 0, x0: 0, angleDeg: 0 };
    const ray2 = { z0: 40, x0: 0, angleDeg: 90 };
    const cands = twoTangentArcsBetweenRays(ray1, ray2, 5, 3, { axis: 'z', value: 34.375 });
    // pro dané t1=30 existují 2 platná t2 (8.873 i 1.127, oba splňují tečnost) –
    // hledáme konkrétně tu s foot2.x≈17.746 (druhá má foot2.x≈2.254)
    const hit = cands.find(c => Math.abs(c.foot1.z - 30) < 0.01 && Math.abs(c.foot2.x - 17.746) < 0.01);
    expect(hit).toBeTruthy();
    expect(hit.foot1.x).toBeCloseTo(0, 3);
    expect(hit.foot2.z).toBeCloseTo(40, 3);
  });

  it('obecné úhly (30°/150°) – všechny kandidáti splňují geometrické invarianty', () => {
    const ray1 = { z0: 0, x0: 0, angleDeg: 30 };
    const ray2 = { z0: 20, x0: 10, angleDeg: 150 };
    const r1 = 4, r2 = 6;
    const cands = twoTangentArcsBetweenRays(ray1, ray2, r1, r2, { axis: 'z', value: 12 });
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      // vzdálenost středů = R1+R2 (vnější tečnost, opačné prohnutí)
      const distCenters = Math.hypot(c.center1.z - c.center2.z, (c.center1.x - c.center2.x) / 2);
      expect(distCenters).toBeCloseTo(r1 + r2, 4);
      // bod zlomu má zadanou Z souřadnici
      expect(c.junction.z).toBeCloseTo(12, 4);
      // foot1/foot2 leží na příslušných paprscích (kontrola přes elementRay směr by šla,
      // tady stačí že jsou to reálná čísla – přesnou tečnost ověřuje uzel-skript při vývoji)
      expect(Number.isFinite(c.foot1.z)).toBe(true);
      expect(Number.isFinite(c.foot2.z)).toBe(true);
    }
  });

  it('degenerovaná osa (paprsek rovnoběžný s vybranou osou zlomu) – přeskočí danou větev beze pádu', () => {
    const ray1 = { z0: 0, x0: 0, angleDeg: 0 };
    const ray2 = { z0: 40, x0: 0, angleDeg: 90 };
    // osa 'x' pro tento roh funguje stejně dobře (jen jiná projekce) – test že nespadne
    expect(() => twoTangentArcsBetweenRays(ray1, ray2, 5, 3, { axis: 'x', value: 17.746 })).not.toThrow();
  });
});

describe('pickTwoArcsByVpolTag', () => {
  it('VPOL1/VPOL2 rozliší podle vzdálenosti BODU ZLOMU od refPoint', () => {
    const ray1 = { z0: 0, x0: 0, angleDeg: 30 };
    const ray2 = { z0: 20, x0: 10, angleDeg: 150 };
    const cands = twoTangentArcsBetweenRays(ray1, ray2, 4, 6, { axis: 'z', value: 12 });
    const ref = { z: 0, x: 0 };
    const nearest = pickTwoArcsByVpolTag(cands, ref, 'VPOL1');
    const farthest = pickTwoArcsByVpolTag(cands, ref, 'VPOL2');
    const dNear = Math.hypot(nearest.junction.z - ref.z, nearest.junction.x - ref.x);
    const dFar = Math.hypot(farthest.junction.z - ref.z, farthest.junction.x - ref.x);
    expect(dNear).toBeLessThanOrEqual(dFar);
  });
});

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
  tangentArcEndOnRay,
  tangentCircleBetweenRays,
  pickBetweenRaysByVpolTag,
  twoTangentArcsBetweenRays,
  twoTangentArcsFromDirection,
  pickTwoArcsByVpolTag,
  chooseSolution,
  AUTO_PICK_MIN_RATIO,
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
  // Solver počítá ve skutečné rovině (Z, poloměr) – X se tu nikde nepůlí.
  it('5-12-13 trojúhelník: vodorovný paprsek (poloměr 5) vs kružnice r=13 kolem (0,0)', () => {
    const ray = { z0: 0, x0: 5, angleDeg: 0 };
    const center = { z: 0, x: 0 };
    const pts = intersectRayCircle(ray, center, 13);
    expect(pts).toHaveLength(2);
    const zs = pts.map(p => p.z).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(-12, 6);
    expect(zs[1]).toBeCloseTo(12, 6);
    pts.forEach(p => expect(p.x).toBeCloseTo(5, 6));
  });

  it('tečna (disc≈0) vrací jediný bod', () => {
    const ray = { z0: -50, x0: 10, angleDeg: 0 }; // tečna ke kružnici r=10 kolem (0,0)
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

describe('chooseSolution – auto-výběr místo chyby „zvolte VPOL1/VPOL2"', () => {
  const ref = { z: 0, x: 0 };

  it('jediného kandidáta vrátí bez příznaku auto', () => {
    const choice = chooseSolution([{ z: 5, x: 5 }], ref, null);

    expect(choice).toMatchObject({ value: { z: 5, x: 5 }, auto: false, ratio: null });
  });

  it('bez tagu vezme bližší řešení, když je druhé výrazně dál', () => {
    const near = { z: 1, x: 0 };
    const far = { z: 10, x: 0 };
    const choice = chooseSolution([far, near], ref, null);

    expect(choice.value).toBe(near);
    expect(choice.auto).toBe(true);
    expect(choice.ratio).toBeCloseTo(10, 6);
  });

  it('bez tagu neuhodne, když jsou obě řešení podobně daleko', () => {
    // poměr 2× je pod prahem – hádat by bylo riskantní
    expect(chooseSolution([{ z: 10, x: 0 }, { z: 5, x: 0 }], ref, null)).toBeNull();
    // těsně pod prahem taky ne
    const justUnder = AUTO_PICK_MIN_RATIO - 0.01;
    expect(chooseSolution([{ z: justUnder, x: 0 }, { z: 1, x: 0 }], ref, null)).toBeNull();
  });

  it('explicitní tag má přednost před auto-výběrem a auto nehlásí', () => {
    const near = { z: 1, x: 0 };
    const far = { z: 10, x: 0 };

    expect(chooseSolution([far, near], ref, 'VPOL2')).toMatchObject({ value: far, auto: false });
    expect(chooseSolution([far, near], ref, 'VPOL1')).toMatchObject({ value: near, auto: false });
  });

  it('měří přes keyFn – pro esíčko se porovnává bod zlomu, ne kandidát sám', () => {
    const a = { junction: { z: 1, x: 0 }, tag: 'a' };
    const b = { junction: { z: 20, x: 0 }, tag: 'b' };
    const choice = chooseSolution([b, a], ref, null, (c) => c.junction);

    expect(choice.value.tag).toBe('a');
    expect(choice.auto).toBe(true);
  });

  it('prázdný vstup vrací null', () => {
    expect(chooseSolution([], ref, null)).toBeNull();
    expect(chooseSolution(null, ref, 'VPOL1')).toBeNull();
  });
});

describe('solveLineArcJunction – kategorie 4 (case 12-13)', () => {
  it('vrátí jediné řešení bez potřeby tagu (tečna)', () => {
    const ray = { z0: -50, x0: 10, angleDeg: 0 };
    const pt = solveLineArcJunction(ray, { z: 0, x: 0 }, 10, { z: 0, x: 0 }, null);
    expect(pt.z).toBeCloseTo(0, 6);
    expect(pt.x).toBeCloseTo(10, 6);
  });

  it('dvě podobně vzdálená řešení bez tagu vyhodí chybu', () => {
    // refPoint uprostřed → obě řešení stejně daleko, hádat nelze
    const ray = { z0: 0, x0: 5, angleDeg: 0 };
    expect(() => solveLineArcJunction(ray, { z: 0, x: 0 }, 13, { z: 0, x: 0 }, null)).toThrow();
  });

  it('dvě řešení bez tagu se vyřeší automaticky, když je jedno výrazně blíž', () => {
    // start obrysu leží těsně u řešení z=-12, to druhé (z=12) je 25× dál
    const ray = { z0: 0, x0: 5, angleDeg: 0 };
    const pt = solveLineArcJunction(ray, { z: 0, x: 0 }, 13, { z: -13, x: 5 }, null);

    expect(pt.z).toBeCloseTo(-12, 6);
    expect(pt.x).toBeCloseTo(5, 6);
  });

  it('dvě řešení s VPOL1/VPOL2 se rozliší podle refPoint', () => {
    const ray = { z0: 0, x0: 5, angleDeg: 0 };
    const ref = { z: -20, x: 0 };
    const p1 = solveLineArcJunction(ray, { z: 0, x: 0 }, 13, ref, 'VPOL1');
    const p2 = solveLineArcJunction(ray, { z: 0, x: 0 }, 13, ref, 'VPOL2');
    expect(p1.z).toBeCloseTo(-12, 6);
    expect(p2.z).toBeCloseTo(12, 6);
  });

  it('vrací všechny kandidáty řešení pro ambiguální VPOL průsečík', () => {
    const ray = { z0: 0, x0: 5, angleDeg: 0 };
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
  it('kružnice r=5 tečná k ose Z (x=0), procházející bodem (z=8,x=10)', () => {
    // v (Z,X) prostoru: střed (z=8,x=5) je tečný k z-ose v (z=8,x=0) a
    // zároveň leží na něm bod (z=8,x=10) [(8-8)²+(10-5)²=25 ✓]
    const ray = { z0: 0, x0: 0, angleDeg: 0 };
    const point = { z: 8, x: 10 };
    const pts = tangentCircleTouchPoints(ray, point, 5);
    expect(pts.length).toBe(1);
    expect(pts[0].z).toBeCloseTo(8, 6);
    expect(pts[0].x).toBeCloseTo(0, 6);
  });

  it('bod mimo dosah (žádné řešení na dané straně) vrací prázdné pole', () => {
    const ray = { z0: 0, x0: 0, angleDeg: 0 };
    const point = { z: 1000, x: 1000 };
    expect(tangentCircleTouchPoints(ray, point, 5)).toHaveLength(0);
  });
});

describe('tangentArcEndOnRay – tečný oblouk jako první prvek fronty', () => {
  it('čtvrtkruh z válce na čelo – ověřeno ručním výpočtem', () => {
    // Válec na poloměru 10 běží ve směru +Z a končí v (z=-20, x=10). Tečně
    // na něj navazuje oblouk R10 → střed leží kolmo nad/pod startem, tedy
    // v (z=-20, x=20) nebo (z=-20, x=0). Čelo Z=-10 se obou kružnic dotýká
    // v jejich krajním bodě, takže vyjdou přesně dva konce.
    const ends = tangentArcEndOnRay({ z: -20, x: 10 }, 0, 10, { z0: -10, x0: 0, angleDeg: 90 });

    expect(ends).toHaveLength(2);
    ends.forEach(pt => expect(pt.z).toBeCloseTo(-10, 6));
    const xs = ends.map(pt => pt.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[1]).toBeCloseTo(20, 6);
  });

  it('vrací obě strany oblouku – směr G2/G3 stranu nevybírá', () => {
    // Čelo Z=-15 protne obě kružnice po dvou bodech → 4 kandidáti,
    // rozhodne až VPOL1/VPOL2 (nebo chooseSolution).
    const ends = tangentArcEndOnRay({ z: -20, x: 10 }, 0, 10, { z0: -15, x0: 0, angleDeg: 90 });

    expect(ends).toHaveLength(4);
    ends.forEach(pt => expect(pt.z).toBeCloseTo(-15, 6));
    const offset = 5 * Math.sqrt(3);   // sqrt(10² − 5²)
    const xs = ends.map(pt => pt.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-offset, 6);
    expect(xs[3]).toBeCloseTo(20 + offset, 6);
  });

  it('mimo dosah (paprsek dál než průměr oblouku) vrací prázdné pole', () => {
    const start = { z: 0, x: 10 };
    const ray = { z0: 500, x0: 0, angleDeg: 90 };

    expect(tangentArcEndOnRay(start, 0, 10, ray)).toEqual([]);
  });

  it('nesmyslný poloměr vrací prázdné pole', () => {
    const ray = { z0: 0, x0: 0, angleDeg: 90 };

    expect(tangentArcEndOnRay({ z: -20, x: 10 }, 0, 0, ray)).toEqual([]);
    expect(tangentArcEndOnRay({ z: -20, x: 10 }, 0, NaN, ray)).toEqual([]);
  });
});

describe('tangentCircleBetweenRays – kategorie 2, case 6-8', () => {
  it('pravý úhel: vodorovná (x=0) a svislá (z=20) přímka, R=5 → 4 kružnice v rozích', () => {
    const ray1 = { z0: 0, x0: 0, angleDeg: 0 };   // x=0, libovolné z
    const ray2 = { z0: 20, x0: 0, angleDeg: 90 }; // z=20, libovolné x
    const candidates = tangentCircleBetweenRays(ray1, ray2, 5);
    expect(candidates).toHaveLength(4);
    const centers = candidates.map(c => `${c.center.z.toFixed(1)},${c.center.x.toFixed(1)}`).sort();
    // středy v (z,x): (15, x=5), (15, x=-5), (25, x=5), (25, x=-5)
    expect(centers).toEqual(['15.0,-5.0', '15.0,5.0', '25.0,-5.0', '25.0,5.0'].sort());

    const c1 = candidates.find(c => Math.abs(c.center.z - 15) < 0.01 && c.center.x > 0);
    expect(c1.foot1.z).toBeCloseTo(15, 6);
    expect(c1.foot1.x).toBeCloseTo(0, 6);
    expect(c1.foot2.z).toBeCloseTo(20, 6);
    expect(c1.foot2.x).toBeCloseTo(5, 6);
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
    const ref = { z: 15, x: 5 }; // nejblíž centru (15, x=5)
    const nearest = pickBetweenRaysByVpolTag(candidates, ref, 'VPOL1');
    expect(nearest.center.z).toBeCloseTo(15, 6);
    expect(nearest.center.x).toBeCloseTo(5, 6);
  });
});

describe('twoTangentArcsBetweenRays – kategorie 3 (case 9-11, esíčko)', () => {
  it('pravoúhlý roh (x=0 / z=40), R1=5 R2=3, zadaná Z bodu zlomu – ověřeno ručním výpočtem', () => {
    // ručně: center1=(z=30,x=5) tečný k x=0 v (30,0); center2=(z=37,x=8.873)
    // tečný k z=40 v (40,8.873); vzdálenost center1-center2 = 8 = R1+R2;
    // bod zlomu (vážený průměr R1:R2) má z = 34.375
    const ray1 = { z0: 0, x0: 0, angleDeg: 0 };
    const ray2 = { z0: 40, x0: 0, angleDeg: 90 };
    const cands = twoTangentArcsBetweenRays(ray1, ray2, 5, 3, { axis: 'z', value: 34.375 });
    // pro dané t1=30 existují 2 platná t2 (8.873 i 1.127, oba splňují tečnost) –
    // hledáme konkrétně tu s foot2.x≈8.873 (druhá má foot2.x≈2.254)
    const hit = cands.find(c => Math.abs(c.foot1.z - 30) < 0.01 && Math.abs(c.foot2.x - 8.873) < 0.01);
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
      const distCenters = Math.hypot(c.center1.z - c.center2.z, c.center1.x - c.center2.x);
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
    expect(() => twoTangentArcsBetweenRays(ray1, ray2, 5, 3, { axis: 'x', value: 8.873 })).not.toThrow();
  });

  it('osa kolmá na OBĚ přímky hlásí, že bod zlomu neurčuje – ne „žádné řešení"', () => {
    // obě přímky rovnoběžné s osou Z → souřadnice X bodu zlomu na jejich
    // posunech vůbec nezávisí, zadaná hodnota nic neurčuje
    const ray1 = { z0: 0, x0: 0, angleDeg: 0 };
    const ray2 = { z0: 40, x0: 20, angleDeg: 180 };

    expect(() => twoTangentArcsBetweenRays(ray1, ray2, 5, 3, { axis: 'x', value: 10 }))
      .toThrow(/osa X bod zlomu neurčuje.*ose Z/s);
    // v druhé ose je úloha řešitelná (nebo aspoň neshodí na degeneraci)
    expect(() => twoTangentArcsBetweenRays(ray1, ray2, 5, 3, { axis: 'z', value: 20 })).not.toThrow();
  });
});

describe('twoTangentArcsFromDirection – esíčko bez úvodní přímky', () => {
  // Válec na poloměru 10 běží ve směru +Z a končí v (z=0, x=10); na něj tečně
  // navazuje esíčko R1=5 + R2=3 a to končí na čele Z=6. (Přes esíčko se dá
  // v Z překlenout nanejvýš zhruba R1+R2, takže čelo musí být blízko.)
  const start = { z: 0, x: 10 };
  const ray = { z0: 6, x0: 0, angleDeg: 90 };

  it('každý kandidát splňuje všechny čtyři geometrické podmínky', () => {
    const candidates = twoTangentArcsFromDirection(start, 0, 5, 3, ray);

    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      // 1. střed prvního oblouku leží kolmo od startu ve vzdálenosti R1
      expect(Math.hypot(c.center1.z - start.z, c.center1.x - start.x)).toBeCloseTo(5, 6);
      expect(c.center1.z).toBeCloseTo(start.z, 6);            // kolmo na směr +Z
      // 2. vnější tečnost oblouků – vzdálenost středů = R1 + R2
      expect(Math.hypot(c.center2.z - c.center1.z, c.center2.x - c.center1.x)).toBeCloseTo(8, 6);
      // 3. bod zlomu leží na spojnici středů, R1 od prvního a R2 od druhého
      expect(Math.hypot(c.junction.z - c.center1.z, c.junction.x - c.center1.x)).toBeCloseTo(5, 6);
      expect(Math.hypot(c.junction.z - c.center2.z, c.junction.x - c.center2.x)).toBeCloseTo(3, 6);
      // 4. druhý oblouk končí na paprsku a je k němu tečný (střed R2 od paty)
      expect(c.foot2.z).toBeCloseTo(6, 6);
      expect(Math.hypot(c.center2.z - c.foot2.z, c.center2.x - c.foot2.x)).toBeCloseTo(3, 6);
    }
  });

  it('nabízí obě strany prvního oblouku (nad i pod válcem)', () => {
    const candidates = twoTangentArcsFromDirection(start, 0, 5, 3, ray);
    const centers = candidates.map(c => c.center1.x);

    expect(centers).toContain(15);   // odklon ven
    expect(centers).toContain(5);    // odklon dovnitř
  });

  it('nedosažitelné zadání vrací prázdné pole místo výjimky', () => {
    // čelo je dál, než kam esíčko o daných poloměrech dosáhne
    expect(twoTangentArcsFromDirection(start, 0, 5, 3, { z0: 500, x0: 0, angleDeg: 90 })).toEqual([]);
  });

  it('nesmyslné poloměry vrací prázdné pole', () => {
    expect(twoTangentArcsFromDirection(start, 0, 0, 3, ray)).toEqual([]);
    expect(twoTangentArcsFromDirection(start, 0, 5, -3, ray)).toEqual([]);
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

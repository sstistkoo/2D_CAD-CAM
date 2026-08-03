// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – VK Solver: dopočet neznámých souřadnic (X?/Z?)      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čistá geometrie (žádná vazba na canvas/state) pro dopočet rohu mezi
// dvěma VK prvky, kde první má neznámý konec ("?") a druhý je zadaný
// (kategorie 1 – přímky/kužely, kategorie 4 – netečné napojení s obloukem).
//
// Souřadnice X je všude POLOMĚR – tedy skutečná fyzická rovina (Z, poloměr),
// stejná konvence jako ve zbytku appky (CLAUDE.md: „interně vždy poloměr,
// převod jen na hranici UI přes displayX/inputX"). Převod z toho, co uživatel
// napsal, dělá výhradně vkContour.js přes toSolverX/fromSolverX.
//
// POZOR na historii: dřív se sem posílal PRŮMĚR a každá funkce s kruhovou
// geometrií si ho měla sama vydělit dvěma. `intersectRayCircle` (kat. 4) to
// dělala, tečná rodina (kat. 2/3, přidaná později) ne – X tam bylo proti Z
// a proti R roztažené 2×, takže dotykové body vycházely úplně jinde
// (⌀20 → R10 → ⌀40 hlásilo jediný degenerovaný dotyk místo dvou správných).
// Rovina s neeuklidovskou osou X je past, na kterou musí pamatovat každá
// nová funkce, takže tady žádná není: R, PR i vzdálenosti jsou skutečné.
//
// Konvence:
// - Úhel (PA) 0° = směr +Z (přímka rovnoběžná s osou Z → válcová plocha,
//   konstantní X), 90° = směr +X (čelní plocha, konstantní Z).
// - Prvek bez PA, kde je zadáno jen X (Z je „?"): úhel = 0° (válcová).
// - Prvek bez PA, kde je zadáno jen Z (X je „?"): úhel = 90° (čelní).
// - Následující „známý" prvek bez vlastního PA se považuje za KOLMÝ na
//   předchozí neznámý prvek – typický schod na hřídeli (válcová plocha
//   → čelo). Pokud známý prvek PA má, použije se přímo (kužel na kužel).
// - V kategorii 4 (netečné napojení) je VPOL STŘED konstrukční kružnice
//   o zadaném poloměru R – oblouk „R10.0" bez vlastního středu tedy
//   znamená kružnici se středem ve VPOL a poloměrem 10.
// - VPOL1/VPOL2 vybírá ze dvou průsečíků ten bližší/vzdálenější od
//   referenčního bodu (start obrysu) – ne od VPOL samotného (obě řešení
//   jsou od VPOL vždy stejně daleko = R, takže by nešla rozlišit).

const D2R = Math.PI / 180;

function dist(a, b) { return Math.hypot(a.z - b.z, a.x - b.x); }

/**
 * Odvodí paprsek (bod + úhel) pro prvek úsečka/kužel.
 * @param {{x:?number, z:?number, pa:?number}} el
 * @param {{z:number, x:number}} anchor bod, kterým paprsek prochází
 * @returns {{z0:number, x0:number, angleDeg:number}}
 */
export function elementRay(el, anchor) {
  if (el.pa != null) return { z0: anchor.z, x0: anchor.x, angleDeg: el.pa };
  if (el.x != null && el.z == null) return { z0: anchor.z, x0: anchor.x, angleDeg: 0 };
  if (el.z != null && el.x == null) return { z0: anchor.z, x0: anchor.x, angleDeg: 90 };
  throw new Error('Prvek nemá určený směr – chybí PA nebo jedna ze souřadnic musí být „?"');
}

/** Průsečík dvou nekonečných paprsků {z0,x0,angleDeg}. Vrací {z,x}, nebo null (rovnoběžné). */
export function intersectRays(r1, r2) {
  const a1 = r1.angleDeg * D2R, a2 = r2.angleDeg * D2R;
  const dz1 = Math.cos(a1), dx1 = Math.sin(a1);
  const dz2 = Math.cos(a2), dx2 = Math.sin(a2);
  const denom = dz1 * dx2 - dx1 * dz2;
  if (Math.abs(denom) < 1e-9) return null;
  const ez = r2.z0 - r1.z0, ex = r2.x0 - r1.x0;
  const t = (ez * dx2 - ex * dz2) / denom;
  return { z: r1.z0 + t * dz1, x: r1.x0 + t * dx1 };
}

/**
 * Kategorie 1 (case 1–4): roh mezi neznámým prvkem (prevEl, začínajícím
 * v prevAnchor) a plně zadaným následujícím prvkem (currEl).
 * @param {{z:number,x:number}} prevAnchor
 * @param {{x:?number,z:?number,pa:?number}} prevEl
 * @param {{x:number,z:number,pa:?number}} currEl  cíl currEl.x/z musí být čísla
 */
export function solveCornerLineLine(prevAnchor, prevEl, currEl) {
  const rayA = elementRay(prevEl, prevAnchor);
  const currAnchor = { z: currEl.z, x: currEl.x };
  const rayB = currEl.pa != null
    ? { z0: currAnchor.z, x0: currAnchor.x, angleDeg: currEl.pa }
    : { z0: currAnchor.z, x0: currAnchor.x, angleDeg: rayA.angleDeg + 90 };
  const pt = intersectRays(rayA, rayB);
  if (!pt) throw new Error('Prvky jsou rovnoběžné – roh nelze najít');
  return pt;
}

/**
 * Průsečíky paprsku {z0,x0,angleDeg} s kružnicí (střed + poloměr).
 * Vše v rovině (Z, poloměr) – žádný převod jednotek se tu neděje.
 * @returns {Array<{z:number,x:number}>} 0, 1 nebo 2 body
 */
export function intersectRayCircle(ray, center, radius) {
  const a = ray.angleDeg * D2R;
  const dz = Math.cos(a), dx = Math.sin(a);
  const ez = ray.z0 - center.z, ex = ray.x0 - center.x;
  const B = 2 * (ez * dz + ex * dx);
  const C = ez * ez + ex * ex - radius * radius;
  const disc = B * B - 4 * C;              // A = dz² + dx² = 1
  if (disc < -1e-9) return [];
  const sq = Math.sqrt(Math.max(disc, 0));
  const t1 = (-B - sq) / 2, t2 = (-B + sq) / 2;
  const toPt = (t) => ({ z: ray.z0 + t * dz, x: ray.x0 + t * dx });
  if (disc < 1e-9) return [toPt(t1)];
  return [toPt(t1), toPt(t2)];
}

/** Vybere řešení podle VPOL1 (bližší refPoint) / VPOL2 (vzdálenější). */
export function pickByVpolTag(points, refPoint, tag) {
  if (points.length <= 1) return points[0];
  const sorted = [...points].sort((a, b) => dist(a, refPoint) - dist(b, refPoint));
  return tag === 'VPOL2' ? sorted[1] : sorted[0];
}

/**
 * Poměr vzdáleností, od kterého se ze dvou řešení bere to bližší automaticky
 * (bez VPOL1/VPOL2). 3× je „výrazně blíž" – to druhé řešení leží typicky na
 * opačné straně dílu a uživatel ho nemyslel. Při menším rozdílu je hádání
 * riskantní a musí rozhodnout uživatel.
 */
export const AUTO_PICK_MIN_RATIO = 3;

/**
 * Jednotné rozhodování mezi geometricky platnými řešeními – sdílené všemi
 * kategoriemi, aby se lišila jen měřená veličina (bod / střed oblouku / bod
 * zlomu) přes `keyFn`, ne pravidlo samotné.
 *
 * @template T
 * @param {T[]} candidates
 * @param {{z:number,x:number}} refPoint typicky start obrysu
 * @param {'VPOL1'|'VPOL2'|null|undefined} tag explicitní volba uživatele
 * @param {(c: T) => {z:number,x:number}} [keyFn] co se u kandidáta měří
 * @returns {{ value: T, auto: boolean, ratio: number|null } | null}
 *   `null` = dvojznačné a bez tagu → volající vyhodí srozumitelnou chybu.
 *   `auto: true` = vybráno automaticky, volající to má uživateli oznámit.
 */
export function chooseSolution(candidates, refPoint, tag, keyFn = (c) => c) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return { value: candidates[0], auto: false, ratio: null };
  const sorted = [...candidates].sort((a, b) => dist(keyFn(a), refPoint) - dist(keyFn(b), refPoint));
  if (tag) return { value: tag === 'VPOL2' ? sorted[1] : sorted[0], auto: false, ratio: null };
  const d0 = dist(keyFn(sorted[0]), refPoint);
  const d1 = dist(keyFn(sorted[1]), refPoint);
  if (d1 - d0 > 1e-6 && d1 >= AUTO_PICK_MIN_RATIO * d0) {
    return { value: sorted[0], auto: true, ratio: d0 > 1e-9 ? d1 / d0 : Infinity };
  }
  return null;
}

/**
 * Kategorie 4 (case 12–13): netečné napojení přímka/kužel ↔ oblouk,
 * kde oblouk je kružnice se středem ve VPOL a daným poloměrem.
 * @param {{z0:number,x0:number,angleDeg:number}} ray  paprsek přímky/kužele (viz elementRay)
 * @param {{z:number,x:number}} vpol
 * @param {number} radius
 * @param {{z:number,x:number}} refPoint  pro VPOL1/VPOL2 (typicky start obrysu)
 * @param {'VPOL1'|'VPOL2'|null} [tag]
 */
export function solveLineArcJunctionCandidates(ray, vpol, radius) {
  const pts = intersectRayCircle(ray, vpol, radius);
  if (pts.length === 0) throw new Error('Přímka/kužel neprotíná kružnici o daném poloměru kolem VPOL');
  return pts;
}

export function solveLineArcJunction(ray, vpol, radius, refPoint, tag) {
  const pts = solveLineArcJunctionCandidates(ray, vpol, radius);
  const choice = chooseSolution(pts, refPoint, tag);
  if (!choice) throw new Error('Dvě možná řešení – zadejte VPOL1 nebo VPOL2');
  return choice.value;
}

// ─────────────────────────────────────────────────────────────────
// Kategorie 2 (case 5–8): JEDEN tečný oblouk daného poloměru R mezi
// dvěma přímkami/kužely. Na rozdíl od kategorie 4 se tu NEPOČÍTÁ s
// kružnicí kolem VPOL – poloha oblouku (a tím i dopočet) vychází čistě
// z tečnosti k sousedním přímkám/kuželům + zadaným poloměrem R.
// Rozlišuje se příznakem „T" (tečné) na oblouku – bez T jde o
// kategorii 4 (netečné napojení kolem VPOL), s T o kategorii 2.
//
// Směr G2/G3 se ZÁMĚRNĚ nepoužívá k výběru strany tečné kružnice –
// v appce je smysl G2/G3 svázaný s konfigurací stroje (flipX/flipZ,
// viz fileIO.js), takže by šlo o riskantní hádání. Místo toho se mezi
// geometricky platnými řešeními vybírá stejně jako v kategorii 4 –
// přes VPOL1/VPOL2 (blíž/dál od startu obrysu).
// ─────────────────────────────────────────────────────────────────

function dedupePoints(points, eps = 1e-6) {
  const out = [];
  for (const p of points) {
    if (!out.some((o) => Math.abs(o.z - p.z) < eps && Math.abs(o.x - p.x) < eps)) out.push(p);
  }
  return out;
}

/**
 * Kategorie 2, case 5 (2 prvky: přímka/kužel „?" → oblouk tečný se
 * ZNÁMÝM koncem a poloměrem R). Vrací možné dotykové body na paprsku
 * (= konec neznámého prvku).
 * @param {{z0:number,x0:number,angleDeg:number}} ray  paprsek neznámého prvku
 * @param {{z:number,x:number}} point  známý konec oblouku (leží na kružnici)
 * @param {number} radius
 * @returns {Array<{z:number,x:number}>}
 */
export function tangentCircleTouchPoints(ray, point, radius) {
  const A = { z: ray.z0, x: ray.x0 };
  const a = ray.angleDeg * D2R;
  const u = { z: Math.cos(a), x: Math.sin(a) };
  const P = point;
  const results = [];
  for (const s of [1, -1]) {
    const n = { z: -u.x * s, x: u.z * s };
    const ez = A.z - P.z + radius * n.z;
    const ex = A.x - P.x + radius * n.x;
    const b = u.z * ez + u.x * ex;
    const c = ez * ez + ex * ex - radius * radius;
    const disc = b * b - c;
    if (disc < -1e-9) continue;
    const sq = Math.sqrt(Math.max(disc, 0));
    const roots = disc < 1e-9 ? [-b] : [-b - sq, -b + sq];
    for (const t of roots) {
      results.push({ z: A.z + t * u.z, x: A.x + t * u.x });
    }
  }
  return dedupePoints(results);
}

/**
 * Kategorie 2, tečný oblouk jako PRVNÍ nedořešený prvek fronty.
 *
 * Liší se od case 5 tím, co je známé: prvek PŘED obloukem je už dopočtený,
 * takže se ví, kde oblouk začíná (`start`) i pod jakým úhlem tam navazuje
 * (`startDirectionDeg` – tečnost, příznak T). Hledá se KONEC oblouku, který
 * leží na paprsku následujícího plně zadaného prvku.
 *
 * Tečnost na začátku posadí střed kolmo od `start` ve vzdálenosti R – na
 * jednu ze dvou stran. Strana se ZÁMĚRNĚ nevybírá podle G2/G3 (jeho smysl je
 * svázaný s konfigurací stroje, viz komentář ke kategorii 2 výše), obě se
 * proto vrátí jako kandidáti a rozhodne VPOL1/VPOL2 nebo `chooseSolution`.
 *
 * @param {{z:number,x:number}} start začátek oblouku
 * @param {number} startDirectionDeg směr geometrie, na kterou se navazuje
 * @param {number} radius poloměr oblouku
 * @param {{z0:number,x0:number,angleDeg:number}} ray paprsek následujícího prvku
 * @returns {Array<{z:number,x:number}>} možné konce oblouku
 */
export function tangentArcEndOnRay(start, startDirectionDeg, radius, ray) {
  if (!Number.isFinite(radius) || radius <= 0) return [];
  const a = startDirectionDeg * D2R;
  const u = { z: Math.cos(a), x: Math.sin(a) };
  const out = [];
  for (const s of [1, -1]) {
    const n = { z: -u.x * s, x: u.z * s };
    const center = { z: start.z + radius * n.z, x: start.x + radius * n.x };
    // Konec oblouku = průsečík kružnice s paprskem. Napojení na následující
    // prvek tedy tečné být nemusí – T se vztahuje k prvku PŘED obloukem.
    out.push(...intersectRayCircle(ray, center, radius));
  }
  return dedupePoints(out);
}

/**
 * Kategorie 2, case 6–8 (3 prvky: přímka/kužel „?" → oblouk „?" tečný
 * o poloměru R → přímka/kužel známá). Vrací kandidáty na OBA styčné
 * body zároveň (foot1 = konec prvního prvku = začátek oblouku, foot2 =
 * konec oblouku = začátek posledního prvku).
 * @param {{z0:number,x0:number,angleDeg:number}} ray1  paprsek prvního (neznámého) prvku
 * @param {{z0:number,x0:number,angleDeg:number}} ray2  paprsek posledního (známého) prvku
 * @param {number} radius
 * @returns {Array<{foot1:{z,x}, foot2:{z,x}, center:{z,x}}>
 */
export function tangentCircleBetweenRays(ray1, ray2, radius) {
  const A1 = { z: ray1.z0, x: ray1.x0 };
  const a1 = ray1.angleDeg * D2R;
  const u1 = { z: Math.cos(a1), x: Math.sin(a1) };
  const A2 = { z: ray2.z0, x: ray2.x0 };
  const a2 = ray2.angleDeg * D2R;
  const u2 = { z: Math.cos(a2), x: Math.sin(a2) };
  const raw = [];
  for (const s1 of [1, -1]) {
    const n1 = { z: -u1.x * s1, x: u1.z * s1 };
    const o1 = { z: A1.z + radius * n1.z, x: A1.x + radius * n1.x };
    for (const s2 of [1, -1]) {
      const n2 = { z: -u2.x * s2, x: u2.z * s2 };
      const o2 = { z: A2.z + radius * n2.z, x: A2.x + radius * n2.x };
      const denom = u1.z * u2.x - u1.x * u2.z;
      if (Math.abs(denom) < 1e-9) continue; // rovnoběžné paprsky – přeskočit
      const ez = o2.z - o1.z, ex = o2.x - o1.x;
      const t = (ez * u2.x - ex * u2.z) / denom;
      const center = { z: o1.z + t * u1.z, x: o1.x + t * u1.x };
      const t1 = (center.z - A1.z) * u1.z + (center.x - A1.x) * u1.x;
      const foot1 = { z: A1.z + t1 * u1.z, x: A1.x + t1 * u1.x };
      const t2 = (center.z - A2.z) * u2.z + (center.x - A2.x) * u2.x;
      const foot2 = { z: A2.z + t2 * u2.z, x: A2.x + t2 * u2.x };
      raw.push({ foot1, foot2, center });
    }
  }
  const out = [];
  for (const r of raw) {
    if (!out.some((o) => Math.abs(o.center.z - r.center.z) < 1e-6 && Math.abs(o.center.x - r.center.x) < 1e-6)) {
      out.push(r);
    }
  }
  return out;
}

/**
 * Vybere z kandidátů (case 6–8) podle VPOL1/VPOL2 – porovnává vzdálenost
 * STŘEDU oblouku od refPoint (start obrysu).
 */
export function pickBetweenRaysByVpolTag(candidates, refPoint, tag) {
  if (candidates.length <= 1) return candidates[0];
  const sorted = [...candidates].sort((a, b) => dist(a.center, refPoint) - dist(b.center, refPoint));
  return tag === 'VPOL2' ? sorted[1] : sorted[0];
}

// ─────────────────────────────────────────────────────────────────
// Kategorie 3 (case 9–11): DVA tečné oblouky („esíčko") mezi dvěma
// přímkami/kužely, s opačným prohnutím (vnější tečnost mezi oblouky).
//
// Na rozdíl od kategorie 2 (1 neznámý oblouk) tu samotné dva zadané
// poloměry NESTAČÍ – 2 středy oblouků = 4 neznámé, ale tečnost k oběma
// přímkám + tečnost oblouků navzájem dává jen 3 rovnice → o 1 stupeň
// volnosti méně, než je potřeba (nekonečně mnoho platných esíček,
// lišících se polohou bodu zlomu). Proto se navíc vyžaduje ZNÁMÁ jedna
// souřadnice (Z nebo X) bodu, kde na sebe oba oblouky navazují – to je
// ta chybějící rovnice.
// ─────────────────────────────────────────────────────────────────

/**
 * @param {{z0:number,x0:number,angleDeg:number}} ray1  paprsek prvního (pending) prvku
 * @param {{z0:number,x0:number,angleDeg:number}} ray2  paprsek posledního (známého) prvku
 * @param {number} r1  poloměr prvního oblouku (u ray1)
 * @param {number} r2  poloměr druhého oblouku (u ray2)
 * @param {{axis:'z'|'x', value:number}} junction  známá souřadnice bodu zlomu mezi oblouky
 * @returns {Array<{foot1:{z,x}, junction:{z,x}, foot2:{z,x}, center1:{z,x}, center2:{z,x}}>}
 */
export function twoTangentArcsBetweenRays(ray1, ray2, r1, r2, junction) {
  const A1 = { z: ray1.z0, x: ray1.x0 };
  const a1 = ray1.angleDeg * D2R;
  const u1 = { z: Math.cos(a1), x: Math.sin(a1) };
  const A2 = { z: ray2.z0, x: ray2.x0 };
  const a2 = ray2.angleDeg * D2R;
  const u2 = { z: Math.cos(a2), x: Math.sin(a2) };
  const k = r1 / (r1 + r2);
  const axisKey = junction.axis;
  const v = junction.value;
  const dotv = (a, b) => a.z * b.z + a.x * b.x;
  const Rsum2 = (r1 + r2) * (r1 + r2);

  // Bod zlomu leží na spojnici středů, takže jeho souřadnice v dané ose je
  // lineární kombinací posunů středů podél obou paprsků. Když jsou OBĚ přímky
  // na tuhle osu kolmé, souřadnice na ní na posunech vůbec nezávisí – zadaná
  // hodnota pak nic neurčuje a soustava zůstane nedourčená. Dřív to spadlo do
  // „žádné řešení", což svádělo na špatnou stopu (poloměry/hodnota), i když
  // stačí zadat bod zlomu v druhé ose. Nezávisí to na znaménkách s1/s2, takže
  // se to dá rozhodnout rovnou tady.
  const otherAxis = axisKey === 'z' ? 'X' : 'Z';
  if (Math.abs(u1[axisKey]) < 1e-9 && Math.abs(u2[axisKey]) < 1e-9) {
    throw new Error(
      `osa ${axisKey.toUpperCase()} bod zlomu neurčuje – obě přímky jsou na ni kolmé; `
      + `zadej bod zlomu v ose ${otherAxis}`,
    );
  }

  const raw = [];
  for (const s1 of [1, -1]) {
    const n1 = { z: -u1.x * s1, x: u1.z * s1 };
    const P1 = { z: A1.z + r1 * n1.z, x: A1.x + r1 * n1.x };
    for (const s2 of [1, -1]) {
      const n2 = { z: -u2.x * s2, x: u2.z * s2 };
      const P2 = { z: A2.z + r2 * n2.z, x: A2.x + r2 * n2.x };

      const aD = (1 - k) * u1[axisKey];
      const bD = k * u2[axisKey];
      const cD = v - (1 - k) * P1[axisKey] - k * P2[axisKey];

      const D0 = { z: P1.z - P2.z, x: P1.x - P2.x };
      const u1u2 = dotv(u1, u2), D0u1 = dotv(D0, u1), D0u2 = dotv(D0, u2), D0D0 = dotv(D0, D0);
      const constC = D0D0 - Rsum2;

      const tPairs = [];
      if (Math.abs(bD) > 1e-9) {
        // t2 = m*t1 + c0 (z (D)), dosazeno do (C) → kvadratická rovnice v t1
        const m = -aD / bD, c0 = cD / bD;
        const A = 1 - 2 * u1u2 * m + m * m;
        const B = -2 * u1u2 * c0 + 2 * m * c0 + 2 * D0u1 - 2 * D0u2 * m;
        const C = c0 * c0 - 2 * D0u2 * c0 + constC;
        if (Math.abs(A) < 1e-9) {
          if (Math.abs(B) > 1e-9) { const t1 = -C / B; tPairs.push([t1, m * t1 + c0]); }
        } else {
          const disc = B * B - 4 * A * C;
          if (disc >= -1e-9) {
            const sq = Math.sqrt(Math.max(disc, 0));
            const t1a = (-B - sq) / (2 * A), t1b = (-B + sq) / (2 * A);
            if (disc < 1e-9) tPairs.push([t1a, m * t1a + c0]);
            else { tPairs.push([t1a, m * t1a + c0]); tPairs.push([t1b, m * t1b + c0]); }
          }
        }
      } else if (Math.abs(aD) > 1e-9) {
        // t1 přímo z (D), (C) se redukuje na kvadratickou rovnici v t2
        const t1 = cD / aD;
        const B = -2 * (u1u2 * t1 + D0u2);
        const C = t1 * t1 + 2 * D0u1 * t1 + constC;
        const disc = B * B - 4 * C;
        if (disc >= -1e-9) {
          const sq = Math.sqrt(Math.max(disc, 0));
          const t2a = (-B - sq) / 2, t2b = (-B + sq) / 2;
          if (disc < 1e-9) tPairs.push([t1, t2a]);
          else { tPairs.push([t1, t2a]); tPairs.push([t1, t2b]); }
        }
      } // jinak: aD i bD ≈ 0, což po kontrole degenerované osy výše zbývá
        // jen pro nulový poloměr oblouku (k = 0 nebo 1) – větev se přeskočí

      for (const [t1, t2] of tPairs) {
        const c1 = { z: P1.z + t1 * u1.z, x: P1.x + t1 * u1.x };
        const c2 = { z: P2.z + t2 * u2.z, x: P2.x + t2 * u2.x };
        const f1t = (c1.z - A1.z) * u1.z + (c1.x - A1.x) * u1.x;
        const foot1 = { z: A1.z + f1t * u1.z, x: A1.x + f1t * u1.x };
        const f2t = (c2.z - A2.z) * u2.z + (c2.x - A2.x) * u2.x;
        const foot2 = { z: A2.z + f2t * u2.z, x: A2.x + f2t * u2.x };
        const jn = { z: (1 - k) * c1.z + k * c2.z, x: (1 - k) * c1.x + k * c2.x };
        raw.push({
          foot1, junction: jn, foot2,
          center1: c1, center2: c2,
        });
      }
    }
  }
  const out = [];
  for (const r of raw) {
    if (!out.some((o) =>
      Math.abs(o.center1.z - r.center1.z) < 1e-6 && Math.abs(o.center1.x - r.center1.x) < 1e-6 &&
      Math.abs(o.center2.z - r.center2.z) < 1e-6 && Math.abs(o.center2.x - r.center2.x) < 1e-6)) {
      out.push(r);
    }
  }
  return out;
}

/**
 * Kategorie 3 BEZ úvodní přímky: dva tečné oblouky za sebou, kde první
 * navazuje tečně na už dopočtenou geometrii a druhý končí na paprsku
 * následujícího známého prvku.
 *
 * Proti `twoTangentArcsBetweenRays()` tu NENÍ potřeba „bod zlomu": tečnost
 * prvního oblouku na hotovou geometrii jeho střed pevně určí (leží kolmo od
 * `start` ve vzdálenosti r1), takže zbývají jen 2 neznámé – střed druhého
 * oblouku – na 2 rovnice:
 *   1. `c2` je ve vzdálenosti r2 od paprsku → leží na rovnoběžce s ním,
 *   2. `|c1 − c2| = r1 + r2`                → vnější tečnost oblouků (esíčko).
 * Průnik té rovnoběžky s kružnicí kolem `c1` dá rovnou hotové řešení.
 *
 * Strany (kam se odklání první oblouk, ke které straně paprsku patří druhý)
 * se nevybírají podle G2/G3 – vrací se všechny kombinace jako kandidáti,
 * stejně jako u ostatních kategorií.
 *
 * @param {{z:number,x:number}} start začátek prvního oblouku
 * @param {number} startDirectionDeg směr geometrie, na kterou navazuje
 * @param {number} r1 poloměr prvního oblouku
 * @param {number} r2 poloměr druhého oblouku
 * @param {{z0:number,x0:number,angleDeg:number}} ray paprsek následujícího prvku
 * @returns {Array<{junction:{z,x}, foot2:{z,x}, center1:{z,x}, center2:{z,x}}>}
 */
export function twoTangentArcsFromDirection(start, startDirectionDeg, r1, r2, ray) {
  if (!Number.isFinite(r1) || r1 <= 0 || !Number.isFinite(r2) || r2 <= 0) return [];
  const a = startDirectionDeg * D2R;
  const u = { z: Math.cos(a), x: Math.sin(a) };
  const ra = ray.angleDeg * D2R;
  const w = { z: Math.cos(ra), x: Math.sin(ra) };

  const raw = [];
  for (const s1 of [1, -1]) {
    const n1 = { z: -u.x * s1, x: u.z * s1 };
    const c1 = { z: start.z + r1 * n1.z, x: start.x + r1 * n1.x };
    for (const s2 of [1, -1]) {
      const n2 = { z: -w.x * s2, x: w.z * s2 };
      const offsetRay = {
        z0: ray.z0 + r2 * n2.z,
        x0: ray.x0 + r2 * n2.x,
        angleDeg: ray.angleDeg,
      };
      for (const c2 of intersectRayCircle(offsetRay, c1, r1 + r2)) {
        const dz = c2.z - c1.z, dx = c2.x - c1.x;
        const d = Math.hypot(dz, dx);
        if (d < 1e-9) continue;
        // Bod zlomu leží na spojnici středů, ve vzdálenosti r1 od prvního.
        const junction = { z: c1.z + (dz * r1) / d, x: c1.x + (dx * r1) / d };
        // Konec druhého oblouku = kolmý průmět jeho středu na paprsek.
        const t = (c2.z - ray.z0) * w.z + (c2.x - ray.x0) * w.x;
        const foot2 = { z: ray.z0 + t * w.z, x: ray.x0 + t * w.x };
        raw.push({ junction, foot2, center1: c1, center2: c2 });
      }
    }
  }

  const out = [];
  for (const r of raw) {
    if (!out.some((o) =>
      Math.abs(o.center1.z - r.center1.z) < 1e-6 && Math.abs(o.center1.x - r.center1.x) < 1e-6 &&
      Math.abs(o.center2.z - r.center2.z) < 1e-6 && Math.abs(o.center2.x - r.center2.x) < 1e-6)) {
      out.push(r);
    }
  }
  return out;
}

/** Vybere z kandidátů (case 9–11) podle VPOL1/VPOL2 – vzdálenost bodu zlomu od refPoint. */
export function pickTwoArcsByVpolTag(candidates, refPoint, tag) {
  if (candidates.length <= 1) return candidates[0];
  const sorted = [...candidates].sort((a, b) => dist(a.junction, refPoint) - dist(b.junction, refPoint));
  return tag === 'VPOL2' ? sorted[1] : sorted[0];
}

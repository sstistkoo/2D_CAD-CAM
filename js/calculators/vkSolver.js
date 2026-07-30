// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – VK Solver: dopočet neznámých souřadnic (X?/Z?)      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čistá geometrie (žádná vazba na canvas/state) pro dopočet rohu mezi
// dvěma VK prvky, kde první má neznámý konec ("?") a druhý je zadaný
// (kategorie 1 – přímky/kužely, kategorie 4 – netečné napojení s obloukem).
//
// Souřadnice X jsou všude PRŮMĚR (jak je zadává uživatel). Pro kruhovou
// geometrii (oblouk kolem VPOL) se interně převádí na skutečný poloměr
// r = X/2 a zpátky na průměr X = 2r – jinak by kružnice v (Z, X) rovině
// vycházela eliptická a poloměr/tečnost by neseděly.
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
 * X je průměr → uvnitř se převádí na skutečný poloměr (r = X/2).
 * @returns {Array<{z:number,x:number}>} 0, 1 nebo 2 body
 */
export function intersectRayCircle(ray, center, radius) {
  const a = ray.angleDeg * D2R;
  const dz = Math.cos(a), dr = Math.sin(a) / 2; // X→R
  const z0 = ray.z0, r0 = ray.x0 / 2;
  const cz = center.z, cr = center.x / 2;
  const ez = z0 - cz, er = r0 - cr;
  const A = dz * dz + dr * dr;
  const B = 2 * (ez * dz + er * dr);
  const C = ez * ez + er * er - radius * radius;
  const disc = B * B - 4 * A * C;
  if (disc < -1e-9) return [];
  const sq = Math.sqrt(Math.max(disc, 0));
  const t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A);
  const toPt = (t) => ({ z: z0 + t * dz, x: 2 * (r0 + t * dr) });
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
 * Kategorie 4 (case 12–13): netečné napojení přímka/kužel ↔ oblouk,
 * kde oblouk je kružnice se středem ve VPOL a daným poloměrem.
 * @param {{z0:number,x0:number,angleDeg:number}} ray  paprsek přímky/kužele (viz elementRay)
 * @param {{z:number,x:number}} vpol
 * @param {number} radius
 * @param {{z:number,x:number}} refPoint  pro VPOL1/VPOL2 (typicky start obrysu)
 * @param {'VPOL1'|'VPOL2'|null} [tag]
 */
export function solveLineArcJunction(ray, vpol, radius, refPoint, tag) {
  const pts = intersectRayCircle(ray, vpol, radius);
  if (pts.length === 0) throw new Error('Přímka/kužel neprotíná kružnici o daném poloměru kolem VPOL');
  if (pts.length === 1) return pts[0];
  if (!tag) throw new Error('Dvě možná řešení – zadejte VPOL1 nebo VPOL2');
  return pickByVpolTag(pts, refPoint, tag);
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

function toRadiusPt(p) { return { z: p.z, r: p.x / 2 }; }
function toDiamPt(p) { return { z: p.z, x: 2 * p.r }; }

function normalizeVec(v) {
  const m = Math.hypot(v.z, v.r);
  return { z: v.z / m, r: v.r / m };
}

/** Směrový jednotkový vektor paprsku v (Z, R) – R = X/2, takže se musí přenormovat. */
function rayDirRadius(ray) {
  const a = ray.angleDeg * D2R;
  return normalizeVec({ z: Math.cos(a), r: Math.sin(a) / 2 });
}

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
  const A = { z: ray.z0, r: ray.x0 / 2 };
  const u = rayDirRadius(ray);
  const P = toRadiusPt(point);
  const results = [];
  for (const s of [1, -1]) {
    const n = { z: -u.r * s, r: u.z * s };
    const ez = A.z - P.z + radius * n.z;
    const er = A.r - P.r + radius * n.r;
    const b = u.z * ez + u.r * er;
    const c = ez * ez + er * er - radius * radius;
    const disc = b * b - c;
    if (disc < -1e-9) continue;
    const sq = Math.sqrt(Math.max(disc, 0));
    const roots = disc < 1e-9 ? [-b] : [-b - sq, -b + sq];
    for (const t of roots) {
      results.push(toDiamPt({ z: A.z + t * u.z, r: A.r + t * u.r }));
    }
  }
  return dedupePoints(results);
}

/**
 * Kategorie 2, case 6–8 (3 prvky: přímka/kužel „?" → oblouk „?" tečný
 * o poloměru R → přímka/kužel známá). Vrací kandidáty na OBA styčné
 * body zároveň (foot1 = konec prvního prvku = začátek oblouku, foot2 =
 * konec oblouku = začátek posledního prvku).
 * @param {{z0:number,x0:number,angleDeg:number}} ray1  paprsek prvního (neznámého) prvku
 * @param {{z0:number,x0:number,angleDeg:number}} ray2  paprsek posledního (známého) prvku
 * @param {number} radius
 * @returns {Array<{foot1:{z,x}, foot2:{z,x}, center:{z,x}}>}
 */
export function tangentCircleBetweenRays(ray1, ray2, radius) {
  const A1 = { z: ray1.z0, r: ray1.x0 / 2 };
  const u1 = rayDirRadius(ray1);
  const A2 = { z: ray2.z0, r: ray2.x0 / 2 };
  const u2 = rayDirRadius(ray2);
  const raw = [];
  for (const s1 of [1, -1]) {
    const n1 = { z: -u1.r * s1, r: u1.z * s1 };
    const o1 = { z: A1.z + radius * n1.z, r: A1.r + radius * n1.r };
    for (const s2 of [1, -1]) {
      const n2 = { z: -u2.r * s2, r: u2.z * s2 };
      const o2 = { z: A2.z + radius * n2.z, r: A2.r + radius * n2.r };
      const denom = u1.z * u2.r - u1.r * u2.z;
      if (Math.abs(denom) < 1e-9) continue; // rovnoběžné paprsky – přeskočit
      const ez = o2.z - o1.z, er = o2.r - o1.r;
      const t = (ez * u2.r - er * u2.z) / denom;
      const center = { z: o1.z + t * u1.z, r: o1.r + t * u1.r };
      const t1 = (center.z - A1.z) * u1.z + (center.r - A1.r) * u1.r;
      const foot1 = { z: A1.z + t1 * u1.z, r: A1.r + t1 * u1.r };
      const t2 = (center.z - A2.z) * u2.z + (center.r - A2.r) * u2.r;
      const foot2 = { z: A2.z + t2 * u2.z, r: A2.r + t2 * u2.r };
      raw.push({ foot1: toDiamPt(foot1), foot2: toDiamPt(foot2), center: toDiamPt(center) });
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
  const A1 = { z: ray1.z0, r: ray1.x0 / 2 };
  const u1 = rayDirRadius(ray1);
  const A2 = { z: ray2.z0, r: ray2.x0 / 2 };
  const u2 = rayDirRadius(ray2);
  const k = r1 / (r1 + r2);
  const axisKey = junction.axis === 'x' ? 'r' : 'z';
  const v = junction.axis === 'x' ? junction.value / 2 : junction.value;
  const dotv = (a, b) => a.z * b.z + a.r * b.r;
  const Rsum2 = (r1 + r2) * (r1 + r2);

  const raw = [];
  for (const s1 of [1, -1]) {
    const n1 = { z: -u1.r * s1, r: u1.z * s1 };
    const P1 = { z: A1.z + r1 * n1.z, r: A1.r + r1 * n1.r };
    for (const s2 of [1, -1]) {
      const n2 = { z: -u2.r * s2, r: u2.z * s2 };
      const P2 = { z: A2.z + r2 * n2.z, r: A2.r + r2 * n2.r };

      const aD = (1 - k) * u1[axisKey];
      const bD = k * u2[axisKey];
      const cD = v - (1 - k) * P1[axisKey] - k * P2[axisKey];

      const D0 = { z: P1.z - P2.z, r: P1.r - P2.r };
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
      } // jinak: zadaná osa je degenerovaná pro obě přímky – nelze určit (zkuste druhou osu)

      for (const [t1, t2] of tPairs) {
        const c1 = { z: P1.z + t1 * u1.z, r: P1.r + t1 * u1.r };
        const c2 = { z: P2.z + t2 * u2.z, r: P2.r + t2 * u2.r };
        const f1t = (c1.z - A1.z) * u1.z + (c1.r - A1.r) * u1.r;
        const foot1 = { z: A1.z + f1t * u1.z, r: A1.r + f1t * u1.r };
        const f2t = (c2.z - A2.z) * u2.z + (c2.r - A2.r) * u2.r;
        const foot2 = { z: A2.z + f2t * u2.z, r: A2.r + f2t * u2.r };
        const jn = { z: (1 - k) * c1.z + k * c2.z, r: (1 - k) * c1.r + k * c2.r };
        raw.push({
          foot1: toDiamPt(foot1), junction: toDiamPt(jn), foot2: toDiamPt(foot2),
          center1: toDiamPt(c1), center2: toDiamPt(c2),
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

/** Vybere z kandidátů (case 9–11) podle VPOL1/VPOL2 – vzdálenost bodu zlomu od refPoint. */
export function pickTwoArcsByVpolTag(candidates, refPoint, tag) {
  if (candidates.length <= 1) return candidates[0];
  const sorted = [...candidates].sort((a, b) => dist(a.junction, refPoint) - dist(b.junction, refPoint));
  return tag === 'VPOL2' ? sorted[1] : sorted[0];
}

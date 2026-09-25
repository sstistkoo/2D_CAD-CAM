// ╔══════════════════════════════════════════════════════════════╗
// ║  HRANICE ÚSEKŮ — pravidlo 1 (docs/cam-pravidla.md)             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// „Díl se rozdělí na úseky. Úsek končí tam, kde čára zanoření vyjede
// z materiálu." Hranice leží na PATĚ té čáry. Čára, která z materiálu
// nevyjede, díl nedělí. Jiné dělení neexistuje — nikdy uprostřed údolí
// ani uprostřed hrbu.
//
// Upichovák čáry zanoření nemá: bere se svislá čára z paty STRMÉ stěny
// (≥ 1 mm na 0,5 mm), za kterou kontura proti směru obrábění spadne.
// Pozvolné (kruhové) údolí stěnu nemá a díl nedělí.
//
// JEDNA DEFINICE pro generátor (ops/long/regions.js) i kontrolu
// (scripts/lib/camRuleOrder.mjs) — hranice, podle které se měří, je táž,
// podle které se obrábí.
//
// Souřadnice „u" = Z ve směru, ODKUD se obrábí (vyšší u = blíž začátku).
// Generátor pracuje v už zrcadleném světě (u = z), kontrola si u = z·dir
// přepočte sama.

const WALL_STEP = 0.25;    // krok hledání strmé stěny upichováku [mm]
const WALL_RISE = 1;       // stěna = stoupne aspoň o 1 mm …
const WALL_RUN = 0.5;      // … na 0,5 mm v u
const MERGE = 1;           // paty blíž než 1 mm splynou
const STEEP_RISE = 0.25;   // strmá část stěny = stoupá aspoň o tolik na WALL_STEP

/**
 * @param guides     mezní čáry `{ kind, x1, z1, x2, z2 }`, z = u
 * @param isOutside  (pt {x, z=u}) => leží bod mimo polotovar?
 * @param parting    null, nebo `{ offsetXAt(u), uLo, uHi }` pro upichovák
 * @returns vzestupně seřazené u hranic
 */
export function sectionFeet(args) {
  return sectionEdges(args).map(e => e.u);
}

/**
 * Totéž co `sectionFeet`, jen s VRCHOLEM stěny: `{ u, top }`. „Nad vrcholem
 * stěny hranice neplatí a vrstva jde vcelku" (pravidlo 1, upichovák) —
 * `top` je X vrcholu stěny, nad kterým hranice neplatí. U čáry zanoření
 * platí hranice na každé hloubce (`top = Infinity`).
 */
export function sectionEdges({ guides, isOutside, parting }) {
  const edges = [];
  for (const g of guides || []) {
    if (!g || g.kind !== 'zanoreni') continue;
    const a = { x: g.x1, z: g.z1 }, b = { x: g.x2, z: g.z2 };
    if (!isOutside(a) && !isOutside(b)) continue;       // nevyjede → nedělí
    edges.push({ u: (a.x <= b.x ? a : b).z, top: Infinity });
  }
  if (parting) {
    const { offsetXAt, uLo, uHi } = parting;
    for (let u = uLo + WALL_RUN; u < uHi - WALL_RUN; u += WALL_STEP) {
      const x = offsetXAt(u), xF = offsetXAt(u + WALL_RUN), xB = offsetXAt(u - WALL_STEP);
      if (x === null || xF === null || xB === null) continue;
      if (!(xF >= x + WALL_RISE && Math.abs(xB - x) <= 0.02)) continue;
      // Vrchol stěny = konec její STRMÉ části (rozhodnutí uživatele
      // 24. 9. 2026). Kontura za ním může stoupat dál (plošina, pozvolný
      // hrb) — to už stěna není a nad vrcholem hranice neplatí.
      let top = x, prev = x, rising = false;
      for (let v = u + WALL_STEP; v <= uHi; v += WALL_STEP) {
        const xv = offsetXAt(v);
        if (xv === null) break;
        if (xv - prev >= STEEP_RISE) rising = true;
        else if (rising || v > u + WALL_RUN + 1e-9) break;   // strmá část skončila
        top = Math.max(top, xv);
        prev = xv;
      }
      edges.push({ u, top });
    }
  }
  edges.sort((p, q) => p.u - q.u);
  return edges.filter((e, k) => k === 0 || e.u - edges[k - 1].u > MERGE);
}

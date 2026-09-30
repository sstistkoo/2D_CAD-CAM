// ╔════════════════════════════════════════════════════════╗
// ║  REGIONY — na kolik úseků se díl rozpadá a v jakém pořadí jedou  ║
// ╚════════════════════════════════════════════════════════╝
//
// TADY SE ROZHODUJE POŘADÍ OBRÁBĚNÍ. Region = Z-okno (úsek), které se
// vyhrubuje shora dolů samostatně; mezi regiony se přejíždí nad polotovarem.
//
// HRANICE ÚSEKŮ = PRAVIDLO 1 (docs/cam-pravidla.md), nic jiného: pata čáry
// zanoření, která vyjede z materiálu (u upichováku pata strmé stěny) —
// `sectionFeet.js`, táž funkce, podle které měří kontrola pravidel.
// Do 24. 9. 2026 se tu dělilo i uprostřed údolí polotovaru a uprostřed hrbu
// kontury (a podle hrbu se plánovalo dvakrát a vybíralo); to pravidlo 1
// výslovně zakazuje a bylo odstraněno.

import { pointInLoop } from '../../../../geom/geomCore.js';
import { getInsert } from '../../inserts/index.js';
import { sectionEdges } from './sectionFeet.js';

/**
 * Složí počítání regionů nad předanými daty. Vrací `{ FULL_REGION, computeRegions }`.
 * Všechno, co potřebuje ze strategie, dostane v `deps` — žádný skrytý stav.
 */
export function makeRegions(deps) {
  const {
    prms, offsetXAt, interferenceGuides,
    stockLoopFullL, partZRange,
  } = deps;
  const FULL_REGION = [{ zHi: Infinity, zLo: -Infinity }];

  // Z-okna úseků z hranic (seřazených shora dolů): každá hranice je dolní
  // mezí úseku NAD ní a horní mezí úseku POD ní. `zLoSurf`/`zHiSurf` = vrchol
  // stěny upichováku — NAD ním hranice neplatí (pravidlo 1) a vrstva jde
  // vcelku; u čáry zanoření platí na každé hloubce (Infinity).
  const assembleRegions = (edges) => {
    if (!edges || edges.length === 0) return FULL_REGION;
    const regions = [];
    let hi = Infinity, hiTop;
    for (const e of edges) {
      regions.push({ zHi: hi, zHiSurf: hiTop, zHiKind: hi === Infinity ? undefined : 'foot',
        zLo: e.u, zLoSurf: e.top, zLoKind: 'foot' });
      hi = e.u; hiTop = e.top;
    }
    regions.push({ zHi: hi, zHiSurf: hiTop, zHiKind: 'foot', zLo: -Infinity, zLoKind: undefined });
    return regions;
  };

  const edgesZ = () => {
    const inStock = (p) => {
      if (!stockLoopFullL) return true;
      try { return pointInLoop(p, stockLoopFullL) !== 'outside'; } catch { return true; }
    };
    const parting = getInsert(prms).cutsFullWidth && partZRange
      ? { offsetXAt, uLo: partZRange.zLo, uHi: partZRange.zHi }
      : null;
    // Hranice mimo díl (za čelem, za koncem) nic nedělí — obě strany by
    // byly jeden úsek s prázdnou polovinou.
    const lo = partZRange ? partZRange.zLo : -Infinity, hi = partZRange ? partZRange.zHi : Infinity;
    return sectionEdges({ guides: interferenceGuides, isOutside: (p) => !inStock(p), parting })
      .filter(e => e.u > lo + 1e-6 && e.u < hi - 1e-6);
  };

  // ── POŘADÍ ÚSEKŮ = PRAVIDLO 8 (docs/cam-pravidla.md) ─────────────────
  // **Po řadě od strany, odkud se obrábí — Ú1, Ú2, Ú3, … — každý celý.**
  // Zleva se neřeší zvlášť: hrubování zleva je ZRCADLO téže cesty (mirZ
  // v calculatePipeline), takže „vyšší Z“ v zrcadleném světě je právě levá
  // strana reálného dílu — pořadí se tím otočí samo.
  //
  // Do 30. 9. 2026 tu zůstalo pořadí z 27. 8. („větší průměr má přednost"),
  // které uživatel 25. 9. změnil — nové dostalo jen „✂ Po úsecích"
  // (sections/sectionPlan.js `orderSteps`). „🔄 Dráhy" celého programu pak
  // obrábělo úsek 2 dílu uživatele dřív než úsek 1 (Ú3 → Ú2 → Ú1 → Ú4), vedle
  // ještě stojícího polotovaru úseku 1: v údolí přibyla zbytečná rampa
  // (`N1980 G1 X28.981`) a chyběla poslední vrstva se zanořením (Po úsecích ji
  // má, X 15,03).
  const orderRegions = (regions) => {
    if (!regions || regions.length < 2) return regions;
    const out = regions.slice().sort((a, b) => b.zHi - a.zHi);
    // Úsek se stěnou upichováku nahoře: hloubky NAD vrcholem stěny patří
    // úseku nad ním (hranice tam neplatí), takže tenhle smí začít až po něm —
    // jinak by jeho první vrstva sjela pod materiál, který ještě stojí
    // (nález 24. 9. 2026, part-20-zleva-parting-taper: držák 97 mm²).
    for (let guard = 0; guard < out.length * out.length; guard++) {
      let moved = false;
      for (let i = 0; i < out.length; i++) {
        const r = out[i];
        if (!Number.isFinite(r.zHiSurf)) continue;
        const j = out.findIndex(q => q.zLo === r.zHi);
        if (j > i) { out.splice(i, 1); out.splice(j, 0, r); moved = true; break; }
      }
      if (!moved) break;
    }
    return out;
  };

  const computeRegions = () => {
    const edges = edgesZ().sort((a, b) => b.u - a.u);
    const regions = orderRegions(assembleRegions(edges));
    // Diagnostický seam (guarded, v produkci no-op): tests/cam-region-guide-split.
    if (globalThis.__REGION_LOG__) globalThis.__REGION_LOG__.push({
      splits: edges.map(e => ({ z: +e.u.toFixed(1), top: e.top })),
      regions,
    });
    return regions;
  };
  return { FULL_REGION, computeRegions };
}

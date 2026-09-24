// ╔════════════════════════════════════════════════════════╗
// ║  REGIONY — na kolik úseků se díl rozpadá a v jakém pořadí jedou  ║
// ╚════════════════════════════════════════════════════════╝
//
// TADY SE ROZHODUJE POŘADÍ OBRÁBĚNÍ. Region = Z-okno, které se vyhrubuje
// shora dolů samostatně; mezi regiony se přejíždí nad polotovarem. Když se
// díl na regiony NEROZDĚLÍ, jede sweep po hloubkách přes celý Z-rozsah, tedy
// v každé vrstvě střídavě vpravo a vlevo od hrbu.
//
// Potřebuješ-li změnit, KDY se dělí a v jakém pořadí úseky jedou, je to tady
// (`splitIsNeeded`, `assembleRegions`) — ne v hloubkové smyčce.

import { pointInLoop } from '../../../../geom/geomCore.js';

/**
 * Složí počítání regionů nad předanými daty. Vrací `{ FULL_REGION, computeRegions }`.
 * Všechno, co potřebuje ze strategie, dostane v `deps` — žádný skrytý stav.
 */
export function makeRegions(deps) {
  const {
    prms, depths, dzScan, offsetXAt, machiningRange, interferenceGuides,
    stockWorldPoints, stockLoopFullL, stockZRangeAt,
    passEntryZ, scan, stockLoopL, step, holderFitsOverContour, partZRange,
  } = deps;
  // ── Regiony (opt-in, jen odlitek) ──────────────────────────────────────
  // Polotovar odlitku má „výstupky" (bosses) oddělené „údolími", kde se
  // povrch blíží kontuře. Bez regionů jede sweep po hloubkách přes CELÝ
  // Z-rozsah → mělký průchod se táhne po kontuře napříč dílem (uživatel:
  // „přejíždí po kontuře"). S regiony se každý výstupek vyhrubuje shora
  // dolů SAMOSTATNĚ (Z-okno regionu), mezi regiony rychloposuv nad polotovar.
  // Split = střed údolí (lokální minimum X mezi dvěma výstupky).
  const FULL_REGION = [{ zHi: Infinity, zLo: -Infinity }];
  // Sestavení Z-oken regionů z bodů dělení `splits = [{ z, xSurf }]`
  // (seřazené shora dolů). Sdíleno ruční i booleovskou detekcí — každý split
  // je horní hranice regionu POD ním a dolní hranice regionu NAD ním; xSurf =
  // povrch dna údolí (hranice platí jen NAD ním, v kůře regiony splynou).
  // `zHiValleyTop` = VZDÁLENĚJŠÍ ústí údolí, ve kterém leží horní hranice
  // regionu (`zHi`). Tam až smí dojet KOTVA ZANOŘENÍ — viz holderEntryReachZ.
  // `zHiMouth`/`zLoMouth` = ÚSTÍ téhož údolí (kde sestup začíná / kde se
  // vrací na protistěnu). Hranice totiž nese DVĚ role, které se nad dnem
  // údolí a v jeho kůře rozcházejí — viz regZHi/regZLo v hloubkové smyčce:
  // střed dna dělí SOUVISLÝ materiál, ústí ohraničuje VZDUCH nad údolím.
  // Region NAD údolím končí u ústí na své straně (`s.zHi`), region POD ním
  // začíná u ústí na té své (`s.zLo`).
  const assembleRegions = (splits) => {
    if (!splits || splits.length === 0) return FULL_REGION;
    const regions = [];
    let hi = Infinity, hiSurf, hiMouth, hiValleyTop, hiKind;
    for (const s of splits) {
      regions.push({
        zHi: hi, zHiSurf: hiSurf, zHiMouth: hiMouth, zHiValleyTop: hiValleyTop, zHiKind: hiKind,
        zLo: s.z, zLoSurf: s.xSurf, zLoMouth: s.zHi, zLoKind: s.kind,
      });
      hi = s.z; hiSurf = s.xSurf; hiMouth = s.zLo; hiValleyTop = s.zHi; hiKind = s.kind;
    }
    regions.push({
      zHi: hi, zHiSurf: hiSurf, zHiMouth: hiMouth, zHiValleyTop: hiValleyTop, zHiKind: hiKind,
      zLo: -Infinity, zLoSurf: undefined, zLoMouth: undefined, zLoKind: undefined,
    });
    return regions;
  };
  // ── HRANICE ÚSEKŮ = PRAVIDLO 1 (docs/cam-pravidla.md, 23. 9. 2026) ─────
  // Úsek končí tam, kde čára zanoření VYJEDE z materiálu; hranice leží na
  // PATĚ té čáry (kde začíná na kontuře). Jiné dělení NEEXISTUJE — žádný
  // střed údolí ani hrbu (uživatel: „nic takového tam nechci").
  // Čára, která celá zůstane v polotovaru, díl nedělí. Materiál = celý
  // polotovar (`stockLoopFullL`, bez ořezu rozsahem 📐).
  const guideSplits = () => {
    if (!stockLoopFullL || !Array.isArray(interferenceGuides)) return [];
    const inStock = (p) => { try { return pointInLoop(p, stockLoopFullL) !== 'outside'; } catch { return true; } };
    const out = [];
    for (const g of interferenceGuides) {
      if (g.kind !== 'zanoreni') continue;
      const a = { x: g.x1, z: g.z1 }, b = { x: g.x2, z: g.z2 };
      if (inStock(a) && inStock(b)) continue;
      const foot = a.x <= b.x ? a : b;
      if (machiningRange && (foot.z > machiningRange.zHi || foot.z < machiningRange.zLo)) continue;
      out.push({ z: foot.z, xSurf: foot.x, zHi: foot.z, zLo: foot.z, kind: 'guide' });
    }
    return out;
  };
  // ── POŘADÍ ÚSEKŮ (27. 8. 2026) ───────────────────────────────────
  // Zadání uživatele: **větší průměr má přednost** — začíná se u nejvyššího X,
  // i kdyby ležel úplně vlevo. Při shodě má přednost PRAVÁ STRANA, tedy vyšší Z.
  //
  // Zleva se neřeší zvlášť: hrubování zleva je ZRCADLO téže cesty (mirZ
  // v calculatePipeline), takže „vyšší Z“ v zrcadleném světě je právě levá
  // strana reálného dílu — pravidlo se tím otočí samo.
  //
  // Dočud se řadilo jen podle Z (shora dolů), takže na díle, kde největší
  // průměr leží vlevo, se začínalo od menšího.
  const regionMaxX = (r) => {
    for (const X of depths) {          // depths jdou od největšího průměru dolů
      const sz = stockZRangeAt(X);
      if (!sz) continue;
      if (sz.zMax > r.zLo + 1e-9 && sz.zMin < r.zHi - 1e-9) return X;
    }
    return -Infinity;
  };
  const orderRegions = (regions) => {
    if (!regions || regions.length < 2) return regions;
    const keyed = regions.map((r, i) => ({ r, i, x: regionMaxX(r) }));
    keyed.sort((a, b) => (b.x - a.x) || (b.r.zHi - a.r.zHi) || (a.i - b.i));
    return keyed.map(k => k.r);
  };

  const computeRegions = () => {
    // Zadne dalsi podminky: pravidlo „dojet vrstvu, pak celou jednu stranu“
    // (docs/cam-pravidla-drah.md §6.0) plati VZDY — i na valci. Jedina zbyla
    // podminka je technicka: bez siluety se zlomy spocitat nedaji.
    if (!stockLoopL || stockLoopL.length < 3) return FULL_REGION;
    // Dva zdroje zlomů: úDOLÍ POLOTOVARU a HRBY KONTURY (viz výš). Seřazí se
    // shora dolů a blízké dvojice splynou — údolí má přednost, protože o něm
    // rozhodují starší, změřené testy.
    const rawSplits = guideSplits().sort((a, b) => b.z - a.z)
      .filter((q, k, arr) => k === 0 || Math.abs(q.z - arr[k - 1].z) > Math.max(2 * dzScan, 1));
    const splits = rawSplits;
    const regions = orderRegions(assembleRegions(splits));

    // Diagnostický test seam (guarded, v produkci no-op): tests/boolean-region-
    // roughing.test.js jím ověřuje separaci regionů ruční vs booleovské cesty.
    if (globalThis.__REGION_LOG__) globalThis.__REGION_LOG__.push({
      bool: !!prms.booleanRoughing,
      raw: rawSplits.map(s => ({ z: +s.z.toFixed(1), xSurf: +s.xSurf.toFixed(1) })),
      splits: splits.map(s => ({ z: +s.z.toFixed(1), xSurf: +s.xSurf.toFixed(1) })),
      // Ústí údolí (zHi/zLo) — hranice úseku je nad dnem právě u nich.
      mouths: splits.map(s => ({ zHi: +(s.zHi ?? NaN).toFixed(1), zLo: +(s.zLo ?? NaN).toFixed(1) })),
      regions,
    });
    return regions;
  };
  return { FULL_REGION, computeRegions };
}

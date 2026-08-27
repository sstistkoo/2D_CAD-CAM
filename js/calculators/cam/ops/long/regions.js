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
import { computeResidualRegions } from '../../booleanRoughing.js';

/**
 * Složí počítání regionů nad předanými daty. Vrací `{ FULL_REGION, computeRegions }`.
 * Všechno, co potřebuje ze strategie, dostane v `deps` — žádný skrytý stav.
 */
export function makeRegions(deps) {
  const {
    prms, depths, dzScan, offsetXAt, machiningRange, interferenceGuides,
    stockWorldPoints, stockLoopFullL, stockCrossingsAt, stockZRangeAt,
    passEntryZ, scan, stockLoopL, holderEntryReachZ, step, holderFitsOverContour,
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
  // ── Detekce údolí — JEDNA implementace pro obě cesty (ÚKLID bod 2) ─────
  // Údolí = lokální minima horní hrany SILUETY polotovaru
  // (`computeResidualRegions` v booleanRoughing.js). Dřív to byly DVĚ funkce:
  // ruční `manualRegionSplits` chodila po vrcholech `stockWorldPoints`,
  // booleovská vzorkovala smyčku po `dzScan`. Nejlepší důkaz, že duplicita
  // škodila: obě měly identickou chybu (hranice = střed dna údolí místo ústí)
  // a záplata by dopadla jen na jednu kopii.
  //
  // Sloučeno na VZORKOVANOU verzi, protože ta určuje ÚSTÍ údolí přesněji:
  // vrcholová heuristika brala jako ústí SOUSEDNÍ VRCHOL obrysu, což je na
  // dlouhé šikmé stěně až její druhý konec (na part-11/12 se ústí lišilo tak,
  // že `splitIsNeeded` níž rozhodl opačně — 23 vs 31 průchodů). Ústí je přitom
  // to, podle čeho se k údolí přiřadí mezní čára destičky.
  //
  // POZOR (proč silueta, ne zbytek stock−dílec): legacy model regionů
  // (zHiSurf/zLoSurf) umí vyjádřit JEN odlitkový hrb — region oddělen MĚLCE
  // (X > xSurf) a v kůře dna splyne. Komponenty ZBYTKU (stock − dílec) mají
  // ale i OPAČNÝ směr (kapsa/hrb dílu = oddělen hluboko, splyne mělko), který
  // tenhle model neumí — složení celého zbytku pak nechává stát materiál
  // (ověřeno na holder-region-roughing: +121 mm² pod z≈22.9). Obecné
  // residual-komponentové regiony patří až do restrukturace emisní smyčky.
  const regionSplits = () => {
    if (!stockLoopL || stockLoopL.length < 3) return [];
    let zMax = -Infinity, zMin = Infinity;
    for (const p of stockLoopL) { if (p.z > zMax) zMax = p.z; if (p.z < zMin) zMin = p.z; }
    return computeResidualRegions([stockLoopL], zMax, zMin, dzScan);
  };
  // ── ZLOMY Z KONTURY: hrb, který přeruší vrstvu (27. 8. 2026) ─────────
  // `regionSplits` výš chodí po ÚDOLÍCH POLOTOVARU. Jenže vrstvu stejně dobře
  // přeruší HRB NA HOTOVNÍ KONTUŘE — schod, osazení, obloukové údolí — a to
  // dosud žádný úsek nezakladálo: průchody se pak v každé hloubce střídaly
  // zprava doleva a zpátky (nález uživatele 27. 8. 2026 na levé části dílu).
  //
  // JE TO ZRCADLO ÚDOLÍ, ne táž věc: u údolí polotovaru se úseky oddělí NAD
  // dnem a v kůře pod ním splynou; u hrbu kontury vrstva NAD hrbem projede
  // vcelku a trhá se až POD ním. Zlom si proto nese `kind` a testy se podle
  // něj otočí (viz `splitIsNeeded`).
  //
  // Práh: hrb musí čnít aspoň o jednu Hloubku záběru nad nižší ze svých dvou
  // údolí — drobné hrbolky vrstvu reálně netrhají a dělit se kvůli nim nemá.
  const contourPeakSplits = () => {
    if (!stockLoopL || stockLoopL.length < 3) return [];
    let zMax = -Infinity, zMin = Infinity;
    for (const q of stockLoopL) { if (q.z > zMax) zMax = q.z; if (q.z < zMin) zMin = q.z; }
    if (machiningRange) { zMax = Math.min(zMax, machiningRange.zHi); zMin = Math.max(zMin, machiningRange.zLo); }
    if (!(zMax > zMin + 1e-6)) return [];
    const h = Math.max(dzScan, 0.2);
    const pts = [];
    for (let z = zMax; z >= zMin - 1e-9; z -= h) {
      const x = offsetXAt(z);
      pts.push({ z, x: x === null ? -Infinity : x });
    }
    const prom = Math.max(step, 0.5);
    const out = [];
    for (let i = 1; i < pts.length - 1; i++) {
      if (!(pts[i].x > pts[i - 1].x - 1e-9) || !(pts[i].x >= pts[i + 1].x - 1e-9)) continue;
      // vrchol plošiny: vzít její střed
      let j = i;
      while (j + 1 < pts.length && Math.abs(pts[j + 1].x - pts[i].x) < 1e-9) j++;
      if (j + 1 < pts.length && pts[j + 1].x > pts[i].x + 1e-9) { i = j; continue; }
      // výrazné aspoň o `prom` na OBĚ strany
      let loL = pts[i].x, loR = pts[i].x;
      for (let k = i - 1; k >= 0 && pts[k].x <= pts[i].x + 1e-9; k--) loL = Math.min(loL, pts[k].x);
      for (let k = j + 1; k < pts.length && pts[k].x <= pts[i].x + 1e-9; k++) loR = Math.min(loR, pts[k].x);
      if (!(pts[i].x - loL >= prom && pts[i].x - loR >= prom)) { i = j; continue; }
      const zPeak = (pts[i].z + pts[j].z) / 2;
      out.push({ z: zPeak, xSurf: pts[i].x, kind: 'peak' });
      i = j;
    }
    return out;
  };

  // ── Dělí to údolí opravdu díl na úseky? (mezní čára hlídání destičky) ──
  // PRVNÍ (a nejlevnější) test, který `splitIsNeeded` níž pouští na každý
  // kandidátní split. Údolí odlitku samo o sobě hranici NEDĚLÁ. Signál je DOSAH
  // DESTIČKY: mezní čára hlídání geometrie (`interferenceGuides`, kind
  // 'zanoreni') vede od místa, kam se destička ještě dostane, ven — a teprve
  // když její volný konec VYJEDE Z POLOTOVARU do vzduchu, je za ní materiál
  // z téhle strany nedostupný a začíná další úsek. Čára, která začíná i končí
  // UVNITŘ polotovaru, končí ve stojícím materiálu: ten se dá vzít dál týmž
  // sweepem, jen se přes vzduch nad údolím přeletí rychloposuvem.
  //
  // Reálný nález na díle uživatele (part-11/12-zleva, údolí Z≈35): mezní čára
  // v tom údolí končí na hotovní kontuře, tedy uvnitř polotovaru. Přesto se
  // tam řezalo na dva úseky — nejdřív celá pravá strana údolí až na dno, pak
  // teprve levá. Protože hranice úseku se v kůře dna rozpouští, zajížděly
  // hluboké průchody pravého úseku do Z-zóny toho levého, kde nad nimi ještě
  // stál neodebraný materiál → záběr rampy/oblouku přes Hloubku (ap).
  // Zprava doleva na TÉMŽE dílu přitom `splitIsNeeded` níž hranici zahodí
  // (sweep tam údolí projede vcelku) — asymetrie čistě jen podle toho, jestli
  // sweep narazí na stěnu kontury před údolím, nebo až za ním.
  //
  // Vyhodnocuje se na CELÉM polotovaru (`stockLoopFullL`, bez ořezu rozsahem
  // 📐): jestli čára vyjede do vzduchu, je vlastnost dílu, ne zvoleného
  // úseku obrábění. Bez hlídání geometrie (`respectInsertGeometry` vypnuto)
  // je pole prázdné → nic se nezahazuje, chování beze změny.
  const guideStaysInStock = (s) => {
    if (!stockLoopFullL || !Array.isArray(interferenceGuides) || interferenceGuides.length === 0) return false;
    if (s.zHi === undefined || s.zLo === undefined) return false;
    const inStock = (p) => { try { return pointInLoop(p, stockLoopFullL) !== 'outside'; } catch { return true; } };
    let found = false;
    for (const g of interferenceGuides) {
      // Jen čáry zanoření (kam destička nedosáhne při sjíždění do údolí);
      // 'dojezd' je opačná strana břitu a o dělení úseků nevypovídá.
      if (g.kind !== 'zanoreni') continue;
      const a = { x: g.x1, z: g.z1 }, b = { x: g.x2, z: g.z2 };
      // Leží čára v ústí TOHOTO údolí?
      if (Math.max(a.z, b.z) < s.zLo - 1e-9 || Math.min(a.z, b.z) > s.zHi + 1e-9) continue;
      if (!inStock(a) || !inStock(b)) return false;   // vyjíždí ven → hranice platí
      found = true;
    }
    return found;
  };
  // ── Který split je opravdu potřeba ────────────────────────────────────
  // Druhý test: i údolí, které destička nedělí, je jen SIGNÁL, ne důvod dělit
  // dráhy. Hranice regionu dává smysl jedině tehdy, když se materiál POD
  // splitem nedá vzít týmž zátahem jako materiál NAD ním — tedy když vrstvu
  // mezi nimi něco ZASTAVÍ (stěna hotovní kontury nebo obálka držáku).
  // Nezastaví-li nic, hranice jen rozřízne souvislý zátah: nejdřív se dodělá
  // celá PRAVÁ strana a teprve pak levá — i když je vlevo VĚTŠÍ průměr (reálný
  // nález na díle uživatele: údolí vzniklé obloukem na odlitku, hrb vlevo Ø77
  // se hruboval až po hrbu vpravo Ø70). Vzduch nad údolím přitom průchod
  // přeletí rychloposuvem, takže sloučený zátah po vrstvách jde odshora dolů
  // přesně tak, jak má: od největšího průměru a doleva až tam, kam pustí
  // kontura.
  //
  // Test (čte jen geometrii, žádné vedlejší efekty): pro každou hloubku, kde
  // region POD splitem ještě něco bere, se zkusí SLOUČENÝ sken od okna nad
  // splitem po dno okna pod ním. Když sloučený zátah pokaždé dojede aspoň tak
  // hluboko jako samostatný region, split se zahodí. POZOR: tenhle test je
  // jednosměrný (porovnává jen PRVNÍ interval), takže sám o sobě odpoví jinak
  // zprava doleva než zleva doprava — proto je nad ním `guideStaysInStock`.
  const splitIsNeeded = (splits, i) => {
    const s = splits[i];
    if (s.kind !== 'peak' && guideStaysInStock(s)) return false;
    // HRB: vrstvu opravdu přeruší, ale ÚSEK Z NĚJ ZATÍM NEVZNIKÁ — změřeno
    // 27. 8. 2026. Rozdělením se mění POŘADÍ obrábění: když se jeden úsek
    // dodělá celý, vedle pořád stojí materiál a ZANOŘENÍ DO KAPSY do něj vjede
    // držákem (7 fixtures, 5,8–43,6 mm² — vždy na „Rampa…°“ / „zanoření v kapse“).
    // Na díle uživatele je přitom výsledek ČISTÝ a lepší (úběr +100 mm²,
    // výjezdů nad konturu 39 → 12), takže to není vlastnost pravidla, ale
    // toho, že hlídání zanoření neumí říct „v tomhle pořadí se držák nevejde“.
    // `orderAwareHolder` to nerozliší — je to code-owned parametr s výchozí
    // hodnotou true, takže ho mají zapnutý všechny.
    // ZBÝVÁ: skutečný test proveditelnosti na každý kandidát (naplánovat obojí
    // a porovnat nálezy držáku), pak tenhle řádek zmizí.
    // HRB: vrstvu opravdu přeruší, ale úsek z něj vznikne jen tehdy, když se za
    // hranici VEJDE DRŽÁK. Rozdělením se soused obrobí jen do své hloubky, takže
    // tam zůstane stát stěna až do kontury — a nástroj pracující u hranice přes
    // ni přejíždí držákem (viz holderFitsOverContour v roughLong).
    if (s.kind === 'peak') {
      if (prms.__noPeakSplits) return false;   // druhý pokus plánování bez dělení
      // Držák je široký desítky mm, takže přes hranici dosáhne i z místa hluboko
      // uvnitř úseku — test proto projde CELÝ PÁS do vzdálenosti držáku od
      // hranice, ne jen hranici samotnou (na `part-10` byl nález 17 mm od ní).
      if (typeof holderFitsOverContour !== 'function') return false;
      const band = Math.max(parseFloat(prms.holderWidth) || 0, 20);
      for (let z = s.z; z >= s.z - band - 1e-9; z -= 1) {
        const tip = offsetXAt(z);
        if (tip === null) continue;
        if (!holderFitsOverContour(z, tip)) return false;
      }
      return true;
    }
    const zTop = i > 0 ? splits[i - 1].z : Infinity;
    const zBot = i + 1 < splits.length ? splits[i + 1].z : -Infinity;
    for (const X of depths) {
      // ÚDOLÍ: pod dnem hranice splývá. HRB: nad ním vrstva projede vcelku,
      // trhá se až pod ním — test se proto otočí.
      if (s.kind === 'peak' ? X >= s.xSurf - 0.01 : X <= s.xSurf + 0.01) continue;
      const sz = stockZRangeAt(X);
      if (!sz) continue;
      const zHiWin = Math.min(machiningRange ? Math.min(sz.zMax, machiningRange.zHi) : sz.zMax, zTop);
      const zLoWin = Math.max(machiningRange ? Math.max(sz.zMin, machiningRange.zLo) : sz.zMin, zBot);
      if (zHiWin - zLoWin < 0.1) continue;
      // Vzal by samostatný region pod splitem na téhle hloubce vůbec něco?
      const zEntryLo = passEntryZ(Math.min(s.z, zHiWin), zLoWin, sz, X);
      if (zEntryLo === null) continue;
      const low = scan(X, zEntryLo, zLoWin, false);
      const ivLow = low.firstOpen ? low.intervals[0] : null;
      if (!ivLow || ivLow.zStart - ivLow.zEnd < dzScan) continue;
      // Dojede tam sloučený zátah shora? Schválně se bere jen PRVNÍ interval:
      // za stěnou kontury uvnitř okna už další interval není otevřený vjezd,
      // ale KAPSA (dosažitelná jen rampou a jen se zapnutým zanořováním) —
      // brát její dosah jako důkaz, že sloučený zátah stačí, by vedlo
      // k zahození hranice a ztrátě materiálu (ověřeno na range-end-leadout:
      // vypadly celé průchody Z 61–82).
      const zEntryAll = passEntryZ(zHiWin, zLoWin, sz, X);
      if (zEntryAll === null) return true;
      const all = scan(X, zEntryAll, zLoWin, false);
      const ivAll = all.firstOpen ? all.intervals[0] : null;
      if (!ivAll || ivAll.zEnd > ivLow.zEnd + 0.05) return true;
    }
    return false;
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
    if (!prms.regionRoughing || prms.stockMode !== 'casting' || stockWorldPoints.length < 3) return FULL_REGION;
    // Dva zdroje zlomů: úDOLÍ POLOTOVARU a HRBY KONTURY (viz výš). Seřazí se
    // shora dolů a blízké dvojice splynou — údolí má přednost, protože o něm
    // rozhodují starší, změřené testy.
    const rawSplits = [
      ...regionSplits().map(q => (q.kind ? q : { ...q, kind: 'valley' })),
      ...contourPeakSplits(),
    ].sort((a, b) => b.z - a.z)
      .filter((q, k, arr) => k === 0 || Math.abs(q.z - arr[k - 1].z) > Math.max(2 * dzScan, 1));
    const splits = rawSplits.filter((_, i) => splitIsNeeded(rawSplits, i));
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

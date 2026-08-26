// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – hlídání DRŽÁKU proti modelu zbytku (ne proti obálce)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Krok 2 plánu `docs/cam-order-aware-holder.md`.
//
// Dnešní `makeHolderClamp` (toolEnvelope.js) staví zakázanou oblast špičky
// Minkowského sumou `překážka ⊕ (−obrys držáku)` z HOTOVÉHO dílu. Je to
// přesné a analytické, ale (a) o materiálu, který v okamžiku průchodu ještě
// stojí, neví nic, a (b) přestavět se dá jen celé (157–382 ms), takže na
// každou hloubku zvlášť to nejde.
//
// Tady je totéž bez Minkowského: obrys držáku se prostě POLOŽÍ na (x, z)
// a protne se s modelem zbytku (`ResidualTracker`). Rozhraní `clamp` je
// schválně shodné s tím z `makeHolderClamp`, aby se dalo vyměnit za sebe.
//
// ── PROČ ZAMETENÝ DRŽÁK A NE SKEN PO KROCÍCH ──────────────────────────────
// Plán navrhoval „hrubý sken po dzScan + půlení". Sken po krocích ale může
// PŘESKOČIT překážku užší než krok — a to je nebezpečný směr. Místo toho se
// testuje STOPA držáku přes celý zbývající interval najednou
// (`toolSweep(holderLoop, [(X,z1),(X,z2)])`). Ta predikce je MONOTÓNNÍ:
// kratší interval má stopu podmnožinou té delší, takže plocha průniku roste
// se zvětšujícím se intervalem. Půlení nad monotónní predikcí je přesné
// a nemá díry.
//
// Vedlejší efekt je rychlost: volný interval (drtivá většina) stojí JEDEN
// dotaz místo stovek, blokovaný ~13 (půlení na 0,01 mm).
//
// ── CO Z TOHO JE ZAPOJENÉ (26. 8. 2026) ───────────────────────────────────
//   `holderAreaAlongResidual`  ANO — hlídá VJEZD kapsového zákroku
//                              (`residEntryArea` v roughingStrategies, za
//                              příznakem `orderAwareHolder`). Tam byla zbylá
//                              vada nálezu 09 a tam se to vyplácí: `part-8`
//                              4 nálezy / 33,4 mm² → 0 za 328 mm² úběru.
//   `makeResidualClamp`        NE — má vlastní akceptační test (parita
//                              s Minkowského obálkou), ale jeho ZAMÝŠLENÉ
//                              MÍSTO, ořez Z-intervalů v `applyHolderClamp`,
//                              bylo změřeno a zamítnuto ve třech variantách:
//                              náhrada obálky dala úběr −14 % a kolize 4 → 67,
//                              „jen zkrátit" pak +3 nálezy / 2 578 mm² na
//                              `part-10` a `part-8` beze změny. Důvod je
//                              v komentáři u `applyHolderClamp`. Necháno jako
//                              stavební kámen, kdyby se revidovaly kapsy nebo
//                              regiony — NE jako živý kód.
import { polyArea, polyIntersect, polyOffset, polyDifference, toolSweep } from '../../geom/geomCore.js';
import { holderWorldLoop } from './collisionValidator.js';
import { toolFootprintVisual } from './materialRemoval.js';
import { HOLDER_CLAMP_MARGIN } from './toolEnvelope.js';

// Kolik průniku držáku se zbytkem se ještě NEPOČÍTÁ jako kolize [mm²].
//
// 0,5 jako u validátoru, NE 2,0 jako `HOLDER_FIT_TOL` v roughingStrategies.
// Ta dvojka je vědomá kompenzace HRUBÉHO modelu (sken povrchu po Z + profil
// spodní hrany), který systematicky nadhodnocuje — změřeno tamtéž:
//   part-13-zleva-flange  sken 0,63 mm²  → polygon 0
//   part-17-long-parting  sken 1,09/0,61 → polygon 0,12
// Tady se měří POLYGONOVÝM průnikem, tedy stejně jako ve validátoru, takže
// se dvojka nedědí; dědila by se jen ta chyba, kterou kompenzuje.
export const RESIDUAL_FIT_TOL = 0.5;

/**
 * Obrys držáku pro dotazy nad zbytkem: světový obrys BEZ PROSTORU DESTIČKY,
 * zeštíhlený o `shrink`. Vzor je `holderCutShrunkLoop` v gcodeEmit.js.
 *
 * Odečtení destičky není kosmetika: u hrotu se držák s destičkou překrývá,
 * jenže materiál, který tam stojí, ŘEŽE DESTIČKA. Bez odečtení by test
 * narazil do drážky, kterou týž průchod právě vyřízl, a hlásil to jako
 * kolizi držáku.
 *
 * @returns {Array|null} smyčka {x, z} relativně ke špičce, nebo null
 */
export function residualHolderLoop(prms, backside = false, { subtractInsert = true, shrink = 0.05 } = {}) {
  const hl = holderWorldLoop(prms, backside);
  if (!hl || hl.length < 3) return null;
  let cut = hl;
  if (subtractInsert) {
    const ins = toolFootprintVisual(prms);
    if (ins && ins.length >= 3) {
      try { cut = polyDifference([hl], [ins])[0] || hl; } catch { cut = hl; }
    }
  }
  if (!(shrink > 0)) return cut;
  try { return polyOffset([cut], -shrink)[0] || cut; } catch { return cut; }
}

/** Plocha průniku držáku (špička na x, z) se zbytkem [mm²]. */
export function holderAreaInResidual(loops, holderLoop, x, z) {
  if (!loops || loops.length === 0 || !holderLoop || holderLoop.length < 3) return 0;
  try {
    const placed = holderLoop.map(p => ({ x: x + p.x, z: z + p.z }));
    return Math.abs(polyArea(polyIntersect(loops, [placed])));
  } catch { return 0; }
}

/** Vejde se držák se špičkou na (x, z) do zbytku? */
export function holderFitsInResidual(loops, holderLoop, x, z, tol = RESIDUAL_FIT_TOL) {
  return holderAreaInResidual(loops, holderLoop, x, z) <= tol;
}

/**
 * Nejhorší vnoření držáku PODÉL dráhy (rampa, nájezd po kontuře) [mm²].
 *
 * Polygonový protějšek `holderFitAreaAlong` v roughingStrategies.js a se
 * stejnou konvencí: vzorkuje se po dráze a VLASTNÍM ŘEZEM je vždy jen ta
 * ČÁST, kterou má nástroj v daném bodě UŽ ZA SEBOU. Zametená stopa přes celou
 * rampu by byla moc velkorysá — držák je v ose Z přes 20 mm široký, kdežto
 * rampa si vykope jen svou čáru (tatáž úvaha jako u `holderEntryCapZ`).
 *
 * @param {Array} pts dráha špičky {x, z}, v pořadí jízdy
 * @param {{ownFoot?: Array, step?: number, maxSamples?: number}} [opts]
 */
export function holderAreaAlongResidual(loops, holderLoop, pts, {
  ownFoot = null, step = 1, maxSamples = 64,
} = {}) {
  if (!loops || loops.length === 0 || !holderLoop || !Array.isArray(pts) || pts.length < 2) return 0;
  // Délka dráhy → počet vzorků (po ~1 mm, jako holderFitAreaAlong).
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const n = Math.max(1, Math.min(maxSamples, Math.ceil(len / Math.max(step, 0.05))));
  // Bod na dráze v poměrné vzdálenosti t ∈ [0,1] + prefix dráhy k němu.
  const at = (t) => {
    let want = len * t, prev = pts[0];
    const pre = [prev];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - prev.x, pts[i].z - prev.z);
      if (want <= d || i === pts.length - 1) {
        const u = d < 1e-9 ? 0 : Math.min(1, want / d);
        const q = { x: prev.x + (pts[i].x - prev.x) * u, z: prev.z + (pts[i].z - prev.z) * u };
        pre.push(q);
        return { q, pre };
      }
      want -= d; prev = pts[i]; pre.push(prev);
    }
    return { q: pts[pts.length - 1], pre: pts.slice() };
  };
  // Vlastní řez se odečítá z PŮVODNÍHO zbytku, pro každý vzorek zvlášť.
  // Vypadá to kvadraticky a hromadit ho přírůstkově se nabízí — ZKOUŠENO
  // A ZMĚŘENO 26. 8. 2026, je to HORŠÍ: postupné `polyDifference` nabaluje
  // modelu vrcholy, takže každý další rozdíl je dražší než jeden rozdíl
  // proti původnímu (part-13 10,4 → 30,8 ms na dotaz).
  let worst = 0;
  for (let k = 0; k <= n; k++) {
    const { q, pre } = at(k / n);
    let stand = loops;
    if (ownFoot && k > 0 && pre.length >= 2) {
      try { stand = polyDifference(loops, toolSweep(ownFoot, pre)); } catch { stand = loops; }
    }
    if (!stand || stand.length === 0) continue;
    const a = holderAreaInResidual(stand, holderLoop, q.x, q.z);
    if (a > worst) worst = a;
  }
  return worst;
}

/**
 * Ořez intervalu proti ZBYTKU — náhrada `clampZTowardNegative` nad obálkou.
 *
 * Vrací funkci se SHODNÝM rozhraním jako `clamp` z `makeHolderClamp`:
 *   clamp(X, zStart, zEnd) → null      … zakázaný už začátek intervalu
 *                          → nové zEnd … (≥ původní zEnd)
 * plus `clamp.area(x, z)`, `clamp.isForbidden(x, z)` a `clamp.sweptArea`.
 *
 * `null` když není co hlídat (prázdný zbytek nebo žádný držák) — stejně jako
 * `makeHolderClamp`, takže volající pozná „hlídání se nekoná" týmž testem.
 *
 * @param {Array<Array<{x:number,z:number}>>} loops zbytek (ResidualTracker.loops)
 * @param {Array<{x:number,z:number}>} holderLoop obrys držáku vůči špičce
 */
export function makeResidualClamp(loops, holderLoop, {
  margin = HOLDER_CLAMP_MARGIN, tol = RESIDUAL_FIT_TOL, eps = 0.01, maxSteps = 24,
  ownFoot = null,
} = {}) {
  if (!Array.isArray(loops) || loops.length === 0) return null;
  if (!holderLoop || holderLoop.length < 3) return null;

  const areaAt = (x, z) => holderAreaInResidual(loops, holderLoop, x, z);

  // Plocha, kterou držák zabere PŘI PRŮJEZDU z z1 do z2 na hloubce X.
  // Monotónní v délce intervalu — na tom stojí půlení níž.
  const sweptArea = (X, z1, z2) => {
    if (Math.abs(z1 - z2) < 1e-9) return areaAt(X, z1);
    try {
      const path = [{ x: X, z: z1 }, { x: X, z: z2 }];
      const swept = toolSweep(holderLoop, path);
      if (!swept || swept.length === 0) return 0;
      // VLASTNÍ ŘEZ PRŮCHODU. Držák se táhne V DRÁŽCE, kterou tenhle průchod
      // právě řeže — obrys držáku začíná u hrotu (u upichováku i u nožů
      // z magazínu doslova na něm), takže bez odečtení vlastní stopy „stojí"
      // materiál těsně za špičkou při KAŽDÉM běžném řezu. Táž úvaha jako
      // `ownCut` u `holderFitArea` v roughingStrategies.js.
      //
      // Změřeno bez toho (26. 8. 2026): part-17 úběr 4 933 → 10 220 mm²
      // a 36 nálezů, part-10 +1 458 mm², part-8 +2 176 — clamp zkracoval
      // podle materiálu, který týž průchod odveze.
      const stand = ownFoot ? polyDifference(loops, toolSweep(ownFoot, path)) : loops;
      if (!stand || stand.length === 0) return 0;
      return Math.abs(polyArea(polyIntersect(stand, swept)));
    } catch {
      // Bez stopy zbývá aspoň konzervativní odhad z obou konců.
      return Math.max(areaAt(X, z1), areaAt(X, z2));
    }
  };

  const clamp = (X, zStart, zEnd) => {
    if (!Number.isFinite(X) || !Number.isFinite(zStart) || !Number.isFinite(zEnd)) return zEnd;
    if (!(zStart > zEnd)) return zEnd;                    // prázdný/obrácený interval
    if (areaAt(X, zStart) > tol) return null;             // start uvnitř materiálu
    if (sweptArea(X, zStart, zEnd) <= tol) return zEnd;   // celý interval volný

    // Největší zc, kde je jízda zStart → zc ještě volná. Predikce je
    // monotónní, takže půlení dá hranici, ne odhad.
    let good = zStart, bad = zEnd;
    for (let i = 0; i < maxSteps && good - bad > eps; i++) {
      const mid = (good + bad) / 2;
      if (sweptArea(X, zStart, mid) > tol) bad = mid; else good = mid;
    }
    const clamped = bad + margin;
    if (clamped >= zStart) return null;                   // po rezervě nezbylo nic
    return Math.max(zEnd, clamped);
  };

  clamp.area = areaAt;
  clamp.isForbidden = (x, z) => areaAt(x, z) > tol;
  clamp.sweptArea = sweptArea;
  return clamp;
}

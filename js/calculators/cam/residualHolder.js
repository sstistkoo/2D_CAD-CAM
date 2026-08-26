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
} = {}) {
  if (!Array.isArray(loops) || loops.length === 0) return null;
  if (!holderLoop || holderLoop.length < 3) return null;

  const areaAt = (x, z) => holderAreaInResidual(loops, holderLoop, x, z);

  // Plocha, kterou držák zabere PŘI PRŮJEZDU z z1 do z2 na hloubce X.
  // Monotónní v délce intervalu — na tom stojí půlení níž.
  const sweptArea = (X, z1, z2) => {
    if (Math.abs(z1 - z2) < 1e-9) return areaAt(X, z1);
    try {
      const swept = toolSweep(holderLoop, [{ x: X, z: z1 }, { x: X, z: z2 }]);
      if (!swept || swept.length === 0) return 0;
      return Math.abs(polyArea(polyIntersect(loops, swept)));
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

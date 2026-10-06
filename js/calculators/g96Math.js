// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – G96 konstantní řezná rychlost (čistý výpočet)       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Při G96 řídicí systém drží vc, takže otáčky n = 1000·vc / (π·D) rostou
// k ose – až na omezení n max (Sinumerik LIMS, Fanuc G50 S). Pod mezním
// průměrem D_lim = 1000·vc / (π·n max) se točí n max a vc klesá.
//
// Strojní čas po dráze z Ø D1 na Ø D2 (osová délka L; L = 0 = čelení):
// dráha s = √(L² + ((D1 − D2)/2)²), na 1 mm průměru připadá k = s / |D1 − D2|.
//   G96 část (D ≥ D_lim): t = ∫ k·π·D / (1000·vc·f) dD = k·π·(D_hi² − D_s²) / (2000·vc·f)
//   část na limitu:        t = k·(D_s − D_lo) / (f·n max)

/** Otáčky pro vc na průměru D [min⁻¹]. */
export function rpmAt(vc, D) {
  return 1000 * vc / (Math.PI * D);
}

/** Mezní průměr, pod kterým jedou otáčky na limitu n max [mm]. */
export function limitDiameter(vc, nMax) {
  return nMax > 0 ? 1000 * vc / (Math.PI * nMax) : 0;
}

/**
 * Strojní čas při G96 s omezením otáček a srovnání s G97 (konstantní otáčky
 * nastavené pro vc na větším průměru).
 * @param {{vc:number, f:number, D1:number, D2?:number, L?:number, nMax?:number|null}} p
 * @returns {{t:number, tConst:number, tLimit:number, t97:number, s:number, Dlim:number,
 *   nHi:number, nLo:number, vcLo:number}|null} časy v minutách; nHi/nLo = otáčky
 *   na větším/menším průměru, vcLo = skutečná vc na menším průměru
 */
export function g96Time({ vc, f, D1, D2 = 0, L = 0, nMax = null }) {
  if (!(vc > 0) || !(f > 0) || !(D1 >= 0) || !(D2 >= 0) || !(L >= 0)) return null;
  if (nMax != null && !(nMax > 0)) return null;
  const hi = Math.max(D1, D2), lo = Math.min(D1, D2);
  if (!(hi > 0)) return null;
  const nLim = nMax > 0 ? nMax : Infinity;
  const Dlim = limitDiameter(vc, nMax);
  const n = (D) => (D > 0 ? Math.min(rpmAt(vc, D), nLim) : nLim);
  const s = Math.hypot(L, (hi - lo) / 2);
  if (!(s > 0)) return null;

  let tConst, tLimit;
  if (hi - lo < 1e-12) {                       // válec – průměr se nemění
    const atLimit = hi < Dlim;
    tConst = atLimit ? 0 : s / (f * n(hi));
    tLimit = atLimit ? s / (f * nLim) : 0;
  } else {
    const k = s / (hi - lo);
    const split = Math.min(Math.max(Dlim, lo), hi);
    tConst = k * Math.PI * (hi * hi - split * split) / (2000 * vc * f);
    tLimit = Number.isFinite(nLim) ? k * (split - lo) / (f * nLim) : 0;
  }
  const nHi = n(hi), nLo = n(lo);
  return {
    t: tConst + tLimit, tConst, tLimit,
    t97: s / (f * nHi),
    s, Dlim, nHi, nLo,
    vcLo: lo > 0 ? Math.PI * lo * nLo / 1000 : 0,
  };
}

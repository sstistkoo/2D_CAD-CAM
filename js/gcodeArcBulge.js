// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bulge oblouku z G-kódu (R se znaménkem, I/K)         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Sdílené parsery „G-kód → body + bulge" (AI profil, trasování profilu).
// Dřív si je každý počítal sám a oba stejně chybně: záporné R jen otočilo
// znaménko bulge (krátký oblouk OPAČNÝM směrem místo dlouhého) a I/K se
// převádělo přes poloměr, takže oblouk přes 180° vyšel vždy ten kratší.
// Bulge = tan(rozvin/4), kladný = proti směru hodinových ručiček.

const TAU = 2 * Math.PI;

/** Bulge oblouku p1→p2 kolem známého středu v daném smyslu (i přes 180°). */
export function bulgeAroundCenter(p1, p2, cx, cy, cw) {
  const a1 = Math.atan2(p1.y - cy, p1.x - cx), a2 = Math.atan2(p2.y - cy, p2.x - cx);
  const s = (((cw ? a1 - a2 : a2 - a1) % TAU) + TAU) % TAU;
  if (s < 1e-9) return 0;
  return (cw ? -1 : 1) * Math.tan(s / 4);
}

/**
 * Bulge krátkého oblouku (|R| ≥ půlka tětivy) převedený podle znaménka R:
 * R < 0 = oblouk přes 180° STEJNÝM směrem, tan((2π − θ)/4) = 1 / tan(θ/4).
 * @param {number} shortBulge bulge kratšího oblouku (z radiusToBulge)
 * @param {number} r R se znaménkem z G-kódu
 */
export function signedRadiusBulge(shortBulge, r) {
  return r < 0 && shortBulge ? 1 / shortBulge : shortBulge;
}

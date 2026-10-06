// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Geometrie špičky vrtáku (čistý výpočet, bez DOM)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Špička je teoretický kužel s vrcholovým úhlem σ (bez příčného břitu).
// Délka špičky L = osová vzdálenost od hrotu k místu, kde vrták zabírá
// na průměr d:  L = (d / 2) / tan(σ / 2).  Pro 118° vychází L ≈ 0,3·d.

/**
 * Základní vrtáky a jejich úhly špičky (orientační – rozhoduje katalog).
 * type: typ šroubovice dle DIN 1414 (N normální, H tvrdé/krátká tříska,
 * W měkké/dlouhá tříska); prázdný = nejde o šroubovitý vrták.
 */
export const DRILL_PRESETS = [
  { name: 'Ocel konstrukční, uhlíková', angle: 118, type: 'N' },
  { name: 'Ocel legovaná, zušlechtěná', angle: 130, type: 'N' },
  { name: 'Nerez (austenitická)',       angle: 135, type: 'N' },
  { name: 'Litina šedá',                angle: 118, type: 'N' },
  { name: 'Hliník a slitiny Al',        angle: 140, type: 'W' },
  { name: 'Měď',                        angle: 140, type: 'W' },
  { name: 'Mosaz, bronz',               angle: 118, type: 'H' },
  { name: 'Plasty (PA, POM)',           angle: 90,  type: 'H' },
  { name: 'Plexisklo (PMMA)',           angle: 60,  type: 'H' },
  { name: 'Tvrdokovový (SK) vrták',     angle: 140, type: '' },
  { name: 'NC navrtávák 90°',           angle: 90,  type: '' },
  { name: 'NC navrtávák 120°',          angle: 120, type: '' },
  { name: 'Kuželový záhlubník 90°',     angle: 90,  type: '' },
  { name: 'Vrták s rovným čelem',       angle: 180, type: '' },
];

function validAngle(angleDeg) {
  return Number.isFinite(angleDeg) && angleDeg > 0 && angleDeg <= 180;
}

/**
 * Osová vzdálenost od hrotu k místu, kde kužel špičky dosáhne průměru d.
 * @param {number} d - průměr [mm] (průměr vrtáku → délka celé špičky)
 * @param {number} angleDeg - vrcholový úhel špičky σ [°], (0, 180]
 * @returns {number} [mm], NaN pro neplatný vstup
 */
export function drillTipLength(d, angleDeg) {
  if (!Number.isFinite(d) || d < 0 || !validAngle(angleDeg)) return NaN;
  if (angleDeg === 180) return 0;
  return (d / 2) / Math.tan(angleDeg * Math.PI / 360);
}

/**
 * Průměr kuželu špičky v dané hloubce od hrotu (obrácený výpočet).
 * @param {number} depth - vzdálenost od hrotu [mm]
 * @param {number} angleDeg - σ [°], (0, 180)
 * @returns {number} [mm], NaN pro neplatný vstup
 */
export function drillDiameterAtDepth(depth, angleDeg) {
  if (!Number.isFinite(depth) || depth < 0 || !validAngle(angleDeg) || angleDeg === 180) return NaN;
  return 2 * depth * Math.tan(angleDeg * Math.PI / 360);
}

/**
 * Délka hlavního břitu (površka kuželu od hrotu po obvod vrtáku).
 * @param {number} D - průměr vrtáku [mm]
 * @param {number} angleDeg - σ [°], (0, 180]
 * @returns {number} [mm], NaN pro neplatný vstup
 */
export function drillLipLength(D, angleDeg) {
  if (!Number.isFinite(D) || D < 0 || !validAngle(angleDeg)) return NaN;
  return (D / 2) / Math.sin(angleDeg * Math.PI / 360);
}

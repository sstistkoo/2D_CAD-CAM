// ╔════════════════════════════════════════╗
// ║  ZNAMÉNKO POLOMĚRU OBLOUKU (CR= / R)                  ║
// ╚════════════════════════════════════════╝
// Oblouk zadaný koncovým bodem a poloměrem je dvojznačný: kladné CR=/R
// = kratší oblouk (≤ 180°), ZÁPORNÉ = delší (> 180°) — Sinumerik i Fanuc.
// Emitor do 10. 11. 2026 psal poloměr vždy kladný, takže oblouk přes 180°
// by stroj (i simulátor, getArcParams) projel kratší cestou na druhé straně.
//
// Úhly v konvenci CAM: atan2(x − cx, z − cz); G2 = úhel klesá, G3 = roste
// (stejně jako gcodeParser.js). `dir` je KANONICKÝ směr (před flipArc).

const TWO_PI = 2 * Math.PI;

/** Orientovaný úhel oblouku [rad] z počátečního a koncového úhlu. */
function directedSweep(a0, a1, dir) {
  let d = a1 - a0;
  if (dir === 'G2') { while (d > 0) d -= TWO_PI; while (d <= -TWO_PI) d += TWO_PI; }
  else { while (d < 0) d += TWO_PI; while (d >= TWO_PI) d -= TWO_PI; }
  return d;
}

/**
 * Poloměr se znaménkem pro výstup: záporný, když oblouk přesahuje 180°.
 * Počátek: (x1, z1), jinak seg.startAngle; konec: seg.x2/z2, jinak seg.endAngle.
 * @param {{r:number, dir:string, cx:number, cz:number, startAngle?:number, endAngle?:number, x2?:number, z2?:number}} seg
 * @param {number} [x1]
 * @param {number} [z1]
 */
export function arcSignedR(seg, x1, z1) {
  const r = Math.abs(parseFloat(seg && seg.r) || 0);
  if (!seg || !r || !isFinite(seg.cx) || !isFinite(seg.cz)) return r;
  const a0 = (isFinite(x1) && isFinite(z1)) ? Math.atan2(x1 - seg.cx, z1 - seg.cz) : seg.startAngle;
  const a1 = (isFinite(seg.x2) && isFinite(seg.z2)) ? Math.atan2(seg.x2 - seg.cx, seg.z2 - seg.cz) : seg.endAngle;
  if (!isFinite(a0) || !isFinite(a1)) return r;
  // Tolerance 1e-6 rad: přesný půlkruh zůstane kladný (obě řešení splývají).
  return Math.abs(directedSweep(a0, a1, seg.dir)) > Math.PI + 1e-6 ? -r : r;
}

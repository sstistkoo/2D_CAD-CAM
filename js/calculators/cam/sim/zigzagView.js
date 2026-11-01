// ╔══════════════════════════════════════════════════════════════╗
// ║  Náhled Cik cak: čára zanoření × obrácené vrstvy               ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 1. 11. 2026: kde se vrstvy za hrbolem vzaly obráceně (ze vzduchu
// ke stěně, ops/zigzagReverse.js), čára zanoření „nemá co dělat" — schovat;
// a hranice úseku má vést až dolů na polotovar (bod S6), ne končit na patě
// čáry zanoření. Mění se jen KRESBA, dráhy ani plán úseků ne.

import { maxXAt } from '../passHelpers.js';

const zRange = (p) => {
  let lo = Infinity, hi = -Infinity;
  for (const m of p.moves) { lo = Math.min(lo, m.z); hi = Math.max(hi, m.z); }
  return [lo, hi];
};
const reversed = (calc) => (calc.passes || []).filter((p) => p.reversedLayer && p.moves && p.moves.length);

/** Mezní čára zanoření, kterou obrácené vrstvy nahradily (překrývá jejich Z). */
export function guideHiddenByReverse(calc, g) {
  if (!g || !g.plungeLimit) return false;
  const gl = Math.min(g.z1, g.z2), gh = Math.max(g.z1, g.z2);
  return reversed(calc).some((p) => { const [lo, hi] = zRange(p); return lo < gh && hi > gl; });
}

/** Úsek offsetu napojený na čáru zanoření (guideOffsetJoin.js) v obrácené oblasti. */
export function offsetSegHiddenByReverse(calc, seg, prms = null) {
  if (!seg || !(seg.fromGuideOffset || seg.fromGuideDrop) || !seg.p1 || !seg.p2) return false;
  // U Cik cak se kreslí offset bez napojení (offsetPathForView), tyhle
  // úseky v něm nejsou.
  if (prms && prms.roughingStrategy === 'zigzag') return true;
  const gl = Math.min(seg.p1.z, seg.p2.z), gh = Math.max(seg.p1.z, seg.p2.z);
  return reversed(calc).some((p) => { const [lo, hi] = zRange(p); return lo < gh + 0.5 && hi > gl - 0.5; });
}

/**
 * Čára přídavku (hrubovací offset) pro kresbu. U Cik cak bez napojení na čáry
 * zanoření — zanořování se nepoužívá, a po vynechání napojení by v čáře
 * zůstala díra (uživatel: „chybí přerušovaná čára od přídavku na hotovo").
 */
export function offsetPathForView(calc, prms = null) {
  if (prms && prms.roughingStrategy === 'zigzag' && calc && Array.isArray(calc.offsetPathNoGuide) && calc.offsetPathNoGuide.length) return calc.offsetPathNoGuide;
  return calc.offsetPath;
}

/** Plán úseků pro kresbu: hranice u obrácených vrstev až dolů na polotovar. */
export function sectionPlanForView(calc) {
  const plan = calc && calc.sectionPlan;
  const rev = reversed(calc);
  const st = calc && calc.stockPathSegments;
  if (!plan || !rev.length || !st || !st.length) return plan;
  const near = (z) => rev.some((p) => { const [lo, hi] = zRange(p); return z >= lo - 1 && z <= hi + 1; });
  const edges = plan.edges.map((e) => {
    if (!near(e.z)) return e;
    const a = maxXAt(st, e.z - 0.5), b = maxXAt(st, e.z + 0.5);
    const low = Math.min(a ?? Infinity, b ?? Infinity);
    return Number.isFinite(low) && low < e.x ? { ...e, x: low } : e;
  });
  return { ...plan, edges };
}

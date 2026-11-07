// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – posuv podle plátku: hrubování × dokončení             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 7. 11. 2026: „ten posuv uprav, aby to víc sedělo k plátkům a k tomu,
// jestli se hrubuje, nebo jede na hotovo". Orientační start (ne doporučení
// výrobce, materiál ocel); uživatel ho v zásobníku přepíše.
//
// HRUBOVÁNÍ — posuv nese rádius špičky rε a pevnost špičky:
//   polygon: f = 0,6 · rε · k(ε), meze 0,1–0,8 mm/ot
//     k(ε): ε ≥ 80° (S, C, W) 1 · ε ≥ 60° (T) 0,85 · ε ≥ 55° (D) 0,75 · ostřejší (V) 0,5
//     SNMG ..08 → 0,48 · ..12 → 0,72 · ..16 → 0,8 · DNMG ..04 → 0,18
//   kulatá: f = 0,08 · R, meze 0,15–1,0 (tříska se rádiusem ztenčuje)
//     R5 → 0,4 · R8 → 0,64 · R10 → 0,8 · R16 → 1,0
//
// DOKONČENÍ — posuv z drsnosti Ra 1,6 µm: Ra ≈ 1000 · f² / (32 · rε)
//   → f = √(32 · rε · 1,6 / 1000), nejvýš posuv hrubování téhož plátku;
//   polygon 0,05–0,35, kulatá 0,1–0,5.
//     rε 0,4 → 0,14 · 0,8 → 0,2 · 1,2 → 0,25 · kulatá R5 → 0,4 · R10 → 0,5
//
// Upichovák, závit, vrták, fréza a závitník: null (mají vlastní odhad).

export const FINISH_RA_UM = 1.6;

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Pevnost špičky podle vrcholového úhlu ε. */
export function tipStrength(eps) {
  const e = num(eps);
  return e >= 80 ? 1 : e >= 60 ? 0.85 : e >= 55 ? 0.75 : 0.5;
}

/** Posuv hrubování [mm/ot] pro plátek { shape, radius, tipAngle }; null = tvar bez pravidla. */
export function insertRoughFeed({ shape, radius, tipAngle } = {}) {
  const R = Math.max(0, num(radius));
  if (shape === 'round') return r2(clamp(0.08 * R, 0.15, 1));
  if (shape === 'polygon') return r2(clamp(0.6 * R * tipStrength(tipAngle), 0.1, 0.8));
  return null;
}

/** Posuv dokončení [mm/ot] pro plátek; null = tvar bez pravidla. */
export function insertFinishFeed(insert = {}) {
  const rough = insertRoughFeed(insert);
  if (rough === null) return null;
  const R = Math.max(0, num(insert.radius));
  const fRa = Math.sqrt(32 * R * FINISH_RA_UM / 1000);
  const f = insert.shape === 'round' ? clamp(fRa, 0.1, 0.5) : clamp(fRa, 0.05, 0.35);
  return r2(Math.min(f, rough));
}

/** Posuv dokončení slotu zásobníku: vlastní fFin, jinak odhad z plátku, jinak f. */
export function slotFinishFeed(slot) {
  if (!slot) return 0;
  if (num(slot.fFin) > 0) return num(slot.fFin);
  return insertFinishFeed(slot) ?? num(slot.f);
}

/** Posuv dokončení z parametrů CAM (týž nůž): plátek toolShape/toolRadius/toolTipAngle. */
export function paramsFinishFeed(prms) {
  return insertFinishFeed({ shape: prms?.toolShape, radius: prms?.toolRadius, tipAngle: prms?.toolTipAngle });
}

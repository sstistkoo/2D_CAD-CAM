// SKICA – Průsečíky viditelných vrstev
// ─────────────────────────────────────────────────────────────────────
// state.intersections obsahuje průsečíky všech vrstev (export CNC z nich
// ořezává i skryté). Na výkrese, v seznamu a pro SNAP se ale ukazují jen ty,
// které vznikly z viditelných vrstev — skrytá Konstrukce (vodítka plátku z
// CAM) nemá nechávat body na výkrese (uživatel 29. 10. 2026).
// Každý průsečík nese pt.pairs = [[vrstva A, vrstva B], …] (calculateAllIntersections);
// je vidět, když aspoň jedna dvojice má obě vrstvy viditelné.
import { state } from '../state.js';

function hiddenLayerIds() {
  return new Set((state.layers || []).filter(l => !l.visible).map(l => l.id));
}

function shown(pt, off) {
  return !Array.isArray(pt.pairs) || pt.pairs.some(([a, b]) => !off.has(a) && !off.has(b));
}

/** Průsečíky k zobrazení (bez těch, které vznikly jen ze skrytých vrstev). */
export function shownIntersections() {
  const all = state.intersections || [];
  const off = hiddenLayerIds();
  return off.size ? all.filter(pt => shown(pt, off)) : all;
}

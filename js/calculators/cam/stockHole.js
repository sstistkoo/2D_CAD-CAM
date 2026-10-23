// Díra v POLOTOVARU části programu (díl obrobený předchozími částmi —
// skutečná díra i vybrání). Zápich v díře a vnitřní závit z ní berou stěnu
// díry dřív než z parametrů vyvrtávání, které mají výchozí hodnoty (⌀30 × 20)
// i v části, kde se nevyvrtává (nález 23. 10. 2026).
import { pointInLoop } from '../../geom/geomCore.js';

/**
 * Poloměr stěny díry v polotovaru ve skutečném Z.
 * @returns {number|null} poloměr; Infinity = v tom Z polotovar není (vzduch
 *   před čelem); null = polotovar je u osy plný (díru nemá → rozhodnou parametry)
 */
export function stockHoleRadiusAt(loop, z) {
  if (!Array.isArray(loop) || loop.length < 3) return null;
  if (pointInLoop({ x: 0.05, z }, loop) === 'inside') return null;
  let best = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    if (Math.abs(b.z - a.z) < 1e-9 || (a.z - z) * (b.z - z) > 0) continue;
    const x = a.x + (z - a.z) * (b.x - a.x) / (b.z - a.z);
    if (x > 0.05 && x < best) best = x;
  }
  return best;
}

/**
 * Nejužší místo díry v polotovaru na úseku Z (po 0,25 mm + konce).
 * @returns {number|null} poloměr (Infinity = celý úsek ve vzduchu),
 *   null = někde na úseku je polotovar u osy plný
 */
export function stockHoleMinRadius(loop, z1, z2) {
  const lo = Math.min(z1, z2), hi = Math.max(z1, z2);
  const n = Math.max(1, Math.ceil((hi - lo) / 0.25));
  let m = Infinity;
  for (let i = 0; i <= n; i++) {
    const r = stockHoleRadiusAt(loop, lo + (hi - lo) * i / n);
    if (r === null) return null;
    m = Math.min(m, r);
  }
  return m;
}

/**
 * Ústí díry v polotovaru: čelo polotovaru na straně obrábění (zprava
 * největší Z, zleva nejmenší) — odtud tyč do díry vjíždí.
 */
export function stockFrontZ(loop, s) {
  const zs = (loop || []).map(q => q.z).filter(Number.isFinite);
  return zs.length ? (s > 0 ? Math.max(...zs) : Math.min(...zs)) : null;
}

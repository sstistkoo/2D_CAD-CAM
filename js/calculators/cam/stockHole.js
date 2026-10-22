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

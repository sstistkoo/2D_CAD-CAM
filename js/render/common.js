// SKICA – render: Sdílené drobnosti renderu (barva objektu, vazba kóty na body)
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { COLORS } from '../constants.js';
import { state } from '../state.js';

export const DIM_MATCH_TOL = 1e-4;

/**
 * Vrátí barvu, jakou se objekt skutečně kreslí (vlastní `obj.color`, jinak
 * barva jeho vrstvy, jinak výchozí fallback). Sdílené mezi hlavním render
 * loopem, náhledem zrcadlení a "eyedropper" výběrem barvy z plátna, aby
 * všechna místa použila stejné pravidlo.
 */
export function resolveObjectColor(obj) {
  const layer = state.layers.find((l) => l.id === obj.layer);
  const layerColor = layer ? layer.color : (obj.isStock ? COLORS.stock : COLORS.primary);
  return obj.color || layerColor;
}
/** Zjistí, zda kóta (isDimension) vychází z některého vybraného bodu. */
export function isDimConnectedToPoints(obj, pts) {
  if (!obj.isDimension || !pts || pts.length === 0) return false;
  const sx1 = obj.dimSrcX1 !== undefined ? obj.dimSrcX1 : obj.x1;
  const sy1 = obj.dimSrcY1 !== undefined ? obj.dimSrcY1 : obj.y1;
  const sx2 = obj.dimSrcX2 !== undefined ? obj.dimSrcX2 : obj.x2;
  const sy2 = obj.dimSrcY2 !== undefined ? obj.dimSrcY2 : obj.y2;
  return pts.some(pt =>
    Math.hypot(sx1 - pt.x, sy1 - pt.y) < DIM_MATCH_TOL
    || Math.hypot(sx2 - pt.x, sy2 - pt.y) < DIM_MATCH_TOL
  );
}

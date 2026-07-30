// ╔══════════════════════════════════════════════════════════════╗
// ║  Spojení dvou úseček ve společném bodě – click logika        ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { SNAP_POINT_THRESHOLD } from '../constants.js';
import { hasAnchoredPoint } from './anchorClick.js';

const ANGLE_TOL = 0.02; // rad (~1.15°) – tolerance kolinearity

function normalizeAngle(a) {
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** Spojí dvě stejnosměrné úsečky se společným koncovým bodem v místě kliknutí. */
export function handleJoinClick(wx, wy) {
  const threshold = SNAP_POINT_THRESHOLD / state.zoom;

  const candidates = [];
  state.objects.forEach((obj, idx) => {
    if (obj.type !== 'line' && obj.type !== 'constr') return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && (layer.locked || !layer.visible)) return;

    const ends = [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    ends.forEach((p, which) => {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < threshold) candidates.push({ idx, obj, which, d, pt: p });
    });
  });

  if (candidates.length < 2) {
    showToast("Klepněte na bod, kde se dvě úsečky spojují");
    return;
  }

  candidates.sort((a, b) => a.d - b.d);

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      if (a.idx === b.idx) continue;
      if (a.obj.type !== b.obj.type) continue;
      if (hasAnchoredPoint(a.obj) || hasAnchoredPoint(b.obj)) continue;

      const aFar = a.which === 0 ? { x: a.obj.x2, y: a.obj.y2 } : { x: a.obj.x1, y: a.obj.y1 };
      const bFar = b.which === 0 ? { x: b.obj.x2, y: b.obj.y2 } : { x: b.obj.x1, y: b.obj.y1 };

      const dirA = Math.atan2(a.pt.y - aFar.y, a.pt.x - aFar.x);
      const dirB = Math.atan2(bFar.y - a.pt.y, bFar.x - a.pt.x);
      let diff = Math.abs(normalizeAngle(dirA) - normalizeAngle(dirB));
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff > ANGLE_TOL) continue;

      pushUndo();
      const [loIdx, hiIdx] = a.idx < b.idx ? [a.idx, b.idx] : [b.idx, a.idx];
      state.objects.splice(hiIdx, 1);
      state.objects.splice(loIdx, 1);

      addObject({
        type: a.obj.type,
        x1: aFar.x, y1: aFar.y,
        x2: bFar.x, y2: bFar.y,
        ...(a.obj.color ? { color: a.obj.color } : {}),
      });

      calculateAllIntersections();
      updateAssociativeDimensions();
      renderAll();
      showToast("Spojeno ✓");
      return;
    }
  }

  showToast("Nenalezeny dvě stejnosměrné úsečky ke spojení");
}

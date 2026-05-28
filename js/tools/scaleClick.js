// ╔══════════════════════════════════════════════════════════════╗
// ║  Škálování (Scale) – click logika                           ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { findObjectAt, calculateAllIntersections, scaleObject } from '../geometry.js';
import { resetHint, setHint } from '../ui.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { showScaleDialog } from '../dialogs.js';
import { hasAnchoredPoint } from './anchorClick.js';

/** Spočítá těžiště (centroid) jednoho objektu. */
function objCenter(obj) {
  switch (obj.type) {
    case 'point': return { x: obj.x, y: obj.y };
    case 'line': case 'constr':
      return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 };
    case 'circle': case 'arc':
      return { x: obj.cx, y: obj.cy };
    case 'rect':
      return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 };
    case 'polyline': {
      const v = obj.vertices;
      const sx = v.reduce((s, p) => s + p.x, 0) / v.length;
      const sy = v.reduce((s, p) => s + p.y, 0) / v.length;
      return { x: sx, y: sy };
    }
    case 'text': return { x: obj.x, y: obj.y };
    default: return { x: 0, y: 0 };
  }
}

/** Škáluje vybraný objekt kliknutím. */
export function handleScaleClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na objekt ke změně měřítka"); return; }

  if (hasAnchoredPoint(state.objects[idx])) {
    showToast("Objekt je zakotven – nelze škálovat");
    return;
  }

  state.selected = idx;
  renderAll();
  applyScale([idx]);
}

/** Škáluje z předvybraných. */
export function scaleFromSelection() {
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : (state.selected !== null ? [state.selected] : []);

  const targets = indices.filter(i => {
    const o = state.objects[i];
    return o && !o.isDimension && !o.isCoordLabel;
  });
  if (targets.length === 0) return false;

  applyScale(targets);
  return true;
}

function applyScale(indices) {
  setHint("Zadejte měřítkový faktor");

  showScaleDialog((factor) => {
    // Kontrola kotvení
    const anchored = indices.filter(i => hasAnchoredPoint(state.objects[i]));
    if (anchored.length > 0) {
      showToast(`${anchored.length} zakotven${anchored.length === 1 ? 'ý objekt' : 'é objekty'} nelze škálovat`);
      return;
    }

    // Referenční bod = centroid všech vybraných
    let cx = 0, cy = 0;
    if (indices.length === 0) return;
    for (const i of indices) {
      const c = objCenter(state.objects[i]);
      cx += c.x; cy += c.y;
    }
    cx /= indices.length;
    cy /= indices.length;

    pushUndo();
    for (const i of indices) {
      scaleObject(state.objects[i], cx, cy, factor);
    }
    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
    resetHint();
    showToast(`Měřítko ×${factor} ✓`);
  });
}

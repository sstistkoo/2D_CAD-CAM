// ╔══════════════════════════════════════════════════════════════╗
// ║  Kóta – click logika                                       ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint, resetHint } from '../ui.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { addDimensionForObject, addAngleDimensionForLines } from '../dialogs.js';

export function handleDimensionClick(wx, wy) {
  // Pokud je výběr → okamžitě přidat kóty
  if (!state.drawing && !state._dimFirstLine && dimensionFromSelection()) return;
  // Režim: čekáme na druhou úsečku pro úhlovou kótu
  if (state._dimFirstLine) {
    const idx = findObjectAt(wx, wy);
    if (idx !== null) {
      const obj = state.objects[idx];
      if ((obj.type === 'line' || obj.type === 'constr') && !obj.isDimension && obj.id !== state._dimFirstLine.id) {
        pushUndo();
        addAngleDimensionForLines(state._dimFirstLine, obj);
        state._dimFirstLine = null;
        calculateAllIntersections();
        renderAll();
        resetHint();
        return;
      }
    }
    // Klik jinam – zrušit režim úhlové kóty, přidat lineární kótu první úsečky
    pushUndo();
    addDimensionForObject(state._dimFirstLine);
    state._dimFirstLine = null;
    calculateAllIntersections();
    renderAll();
    resetHint();
    return;
  }

  if (!state.drawing) {
    // Snap k bodu (endpoint/midpoint) → kóta souřadnic bodu
    if (state.mouse.snapType === 'point') {
      pushUndo();
      addDimensionForObject({ type: 'point', x: wx, y: wy });
      calculateAllIntersections();
      renderAll();
      return;
    }
    // Režim B: klik na existující objekt → přidá kótu
    const idx = findObjectAt(wx, wy);
    if (idx !== null) {
      const obj = state.objects[idx];
      // Úsečka/konstr. → nabídnout úhlovou kótu (kliknout na druhou)
      if ((obj.type === 'line' || obj.type === 'constr') && !obj.isDimension) {
        state._dimFirstLine = obj;
        setHint("Klepněte na druhou úsečku pro kótu úhlu, nebo jinam pro kótu délky");
        return;
      }
      pushUndo();
      addDimensionForObject(obj);
      calculateAllIntersections();
      renderAll();
      return;
    }
    // Režim A: 2 body – 1. klik
    state.drawing = true;
    state.tempPoints = [{ x: wx, y: wy }];
    setHint("Klepněte na druhý bod pro kótu");
  } else {
    // 2. klik – dokončit kótu mezi body
    const p1 = state.tempPoints[0];
    const d = Math.hypot(wx - p1.x, wy - p1.y);
    if (d < 1e-6) { showToast("Body jsou totožné"); return; }
    pushUndo();
    addObject({
      type: 'line',
      x1: p1.x, y1: p1.y,
      x2: wx, y2: wy,
      name: `Kóta ${d.toFixed(2)}mm`,
      isDimension: true,
      color: COLORS.textSecondary,
      layer: 2,
    });
    showToast(`Kóta ${d.toFixed(2)}mm přidána ✓`);
    state.drawing = false;
    state.tempPoints = [];
    calculateAllIntersections();
    renderAll();
    resetHint();
  }
}

/**
 * Přidá kóty k aktuálně vybraným objektům / snap bodům.
 * @returns {boolean} true pokud byla akce provedena
 */
export function dimensionFromSelection() {
  const pts = state.selectedPoint ? state.selectedPoint.slice() : [];
  const objIndices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : (state.selected !== null ? [state.selected] : []);
  const objs = objIndices.map(i => state.objects[i]).filter(Boolean);

  if (pts.length === 0 && objs.length === 0) return false;

  pushUndo();
  let count = 0;

  // Snap body → kóty souřadnic
  for (const pt of pts) {
    addDimensionForObject({ type: 'point', x: pt.x, y: pt.y });
    count++;
  }

  // Úhlové kóty mezi páry úseček
  const lines = objs.filter(o => (o.type === 'line' || o.type === 'constr') && !o.isDimension);
  if (lines.length >= 2) {
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        addAngleDimensionForLines(lines[i], lines[j]);
        count++;
      }
    }
  }

  // Kóty pro jednotlivé objekty (ne-kóty)
  for (const o of objs) {
    if (o.isDimension || o.isCoordLabel) continue;
    addDimensionForObject(o);
    count++;
  }

  if (count > 0) {
    calculateAllIntersections();
    renderAll();
    showToast(`Přidáno ${count} kót ✓`);
  }

  // Vyčistit výběr
  state.multiSelected.clear();
  state.selected = null;
  state.selectedPoint = null;
  renderAll();
  return true;
}

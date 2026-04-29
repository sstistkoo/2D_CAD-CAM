import { state, pushUndo, showToast } from '../state.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { updateProperties, resetHint, setHint } from '../ui.js';
import { moveObject } from '../objects.js';
import { renderAll } from '../render.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { hasAnchoredPoint } from './anchorClick.js';

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handleMoveClick(wx, wy) {
  if (!state.dragging) {
    // Multi-select přesun
    if (state.multiSelected.size > 0) {
      // Zajistit, že i state.selected je v setu
      if (state.selected !== null) state.multiSelected.add(state.selected);
      // Vyčistit segment mode při multi-drag
      state.selectedSegment = null;
      state._selectedSegmentObjIdx = null;
      state.multiSelectedSegments.clear();
      pushUndo();
      state.dragging = true;
      state.dragObjIdx = -1; // signál pro multi-drag
      state.dragStartWorld = { x: wx, y: wy };

      // Indexy vybraných ne-kót
      const selectedIndices = [...state.multiSelected].filter(i => {
        const o = state.objects[i];
        return o && !o.isDimension && !o.isCoordLabel;
      });

      // Najít ID vybraných objektů
      const selectedIds = new Set(selectedIndices.map(i => state.objects[i].id).filter(id => id != null));

      // Přidat kóty:
      // - asociativní (sourceObjId odpovídá vybraným) → budou aktualizovány přes updateAssociativeDimensions
      // - nenavázané (isDimension bez sourceObjId) → přesunout přímo
      const dimIndices = [];
      state.objects.forEach((o, i) => {
        if (o.isDimension || o.isCoordLabel) {
          if (o.sourceObjId && selectedIds.has(o.sourceObjId)) {
            dimIndices.push(i); // asociativní kóta
          } else if (!o.sourceObjId) {
            dimIndices.push(i); // nenavázaná kóta – přesunout přímo
          }
        }
      });

      const allIndices = [...selectedIndices, ...dimIndices];
      state._multiDragSnapshots = allIndices.map(i => ({
        idx: i,
        snapshot: JSON.stringify(state.objects[i]),
      }));
      setHint("Klepněte pro umístění");
      return;
    }
    // Zjistit objekt pod kurzorem nebo použít existující výběr
    let idx = findObjectAt(wx, wy);
    if (idx === null && state.selected !== null) {
      // Objekt pod kurzorem nenalezen, ale máme výběr → použij ho
      idx = state.selected;
    }
    if (idx !== null) {
      if (hasAnchoredPoint(state.objects[idx])) {
        showToast("Objekt je zakotven – nelze přesunout");
        return;
      }
      pushUndo();
      state.dragging = true;
      state.dragObjIdx = idx;
      state.dragStartWorld = { x: wx, y: wy };
      state.dragObjSnapshot = JSON.stringify(state.objects[idx]);
      state.selected = idx;
      updateProperties();
      setHint("Klepněte pro umístění");
    }
  } else {
    if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
      // Finalizace multi-drag
      state.dragging = false;
      state.dragObjIdx = null;
      state._multiDragSnapshots = null;
      updateProperties();
      calculateAllIntersections();
      resetHint();
      return;
    }
    state.dragging = false;
    // Pokud se přetahovala kóta, uložit nový offset
    const draggedObj = state.objects[state.dragObjIdx];
    if (draggedObj && draggedObj.isDimension && draggedObj.sourceObjId && draggedObj.dimType === 'linear') {
      const src = state.objects.find(o => o.id === draggedObj.sourceObjId);
      if (src && (src.type === 'line' || src.type === 'constr')) {
        // Kolmá vzdálenost středu kóty od zdrojové úsečky
        const mx = (draggedObj.x1 + draggedObj.x2) / 2;
        const my = (draggedObj.y1 + draggedObj.y2) / 2;
        const ang = Math.atan2(src.y2 - src.y1, src.x2 - src.x1);
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        const smx = (src.x1 + src.x2) / 2;
        const smy = (src.y1 + src.y2) / 2;
        draggedObj.dimOffset = (mx - smx) * nx + (my - smy) * ny;
      }
    }
    state.dragObjIdx = null;
    updateAssociativeDimensions();
    updateProperties();
    calculateAllIntersections();
    resetHint();
  }
}

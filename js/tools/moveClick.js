import { state, pushUndo, showToast, updateUndoButtons } from '../state.js';
import { moveObject } from '../objects.js';
import { bridge } from '../bridge.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { updateProperties, resetHint, setHint } from '../ui.js';
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

      // Indexy vybraných ne-kót (zakotvené objekty se z přesunu vynechají,
      // stejně jako u rotate/mirror – viz handleRotateClick v events.js).
      let anyAnchored = false;
      const selectedIndices = [...state.multiSelected].filter(i => {
        const o = state.objects[i];
        if (!o || o.isDimension || o.isCoordLabel) return false;
        if (hasAnchoredPoint(o)) { anyAnchored = true; return false; }
        return true;
      });
      if (anyAnchored) showToast("Zakotvené objekty se nepřesunou");

      // Najít ID vybraných objektů
      const selectedIds = new Set(selectedIndices.map(i => state.objects[i].id).filter(id => id != null));

      // Přidat kóty:
      // - asociativní (sourceObjId odpovídá vybraným) → budou aktualizovány přes updateAssociativeDimensions
      // - nenavázané (isDimension bez sourceObjId) → přesunout přímo, ale JEN
      //   když jsou samy vybrané – jinak by s výběrem odjely všechny volné
      //   kóty a souřadnicové štítky z celého výkresu
      const dimIndices = [];
      state.objects.forEach((o, i) => {
        if (o.isDimension || o.isCoordLabel) {
          if (o.sourceObjId && selectedIds.has(o.sourceObjId)) {
            dimIndices.push(i); // asociativní kóta
          } else if (!o.sourceObjId && state.multiSelected.has(i)) {
            dimIndices.push(i); // vybraná nenavázaná kóta – přesunout přímo
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

// ── Průběh a zrušení tažení – JEDINÁ implementace pro myš (events.js),
//    dotyk i precizní dotykový režim (touch.js) a přepnutí nástroje (ui.js).
//    Dřív byla ve třech kopiích, které se rozešly (viz cancelDrag). ──

/** Obnoví objekt ze snapshotu – i smaže vlastnosti přidané během tažení (pathStart…). */
function _restoreFromSnapshot(obj, snapshotJson) {
  const snap = JSON.parse(snapshotJson);
  for (const k of Object.keys(obj)) {
    if (!(k in snap)) delete obj[k];
  }
  Object.assign(obj, snap);
}

/** Posune nenavázanou kótu přímo (asociativní kóty srovná updateAssociativeDimensions). */
function _moveFreeDimension(obj, dx, dy) {
  if (obj.type === 'point') { obj.x += dx; obj.y += dy; return; }
  if (obj.type !== 'line') return;
  obj.x1 += dx; obj.y1 += dy;
  obj.x2 += dx; obj.y2 += dy;
  if (obj.dimSrcX1 != null) { obj.dimSrcX1 += dx; obj.dimSrcY1 += dy; }
  if (obj.dimSrcX2 != null) { obj.dimSrcX2 += dx; obj.dimSrcY2 += dy; }
  if (obj.dimCenterX != null) { obj.dimCenterX += dx; obj.dimCenterY += dy; }
}

/**
 * Průběh tažení: objekty se vrátí do stavu ze začátku tažení a posunou se
 * o (dx, dy) od počátečního bodu (ne přírůstkově – bez hromadění chyb).
 */
export function applyDragDelta(dx, dy) {
  if (!state.dragging || state.dragObjIdx === null) return;
  if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
    for (const { idx, snapshot } of state._multiDragSnapshots) {
      const obj = state.objects[idx];
      if (obj) _restoreFromSnapshot(obj, snapshot);
    }
    for (const { idx } of state._multiDragSnapshots) {
      const obj = state.objects[idx];
      if (!obj) continue;
      if (!obj.isDimension && !obj.isCoordLabel) moveObject(obj, dx, dy);
      else if (!obj.sourceObjId) _moveFreeDimension(obj, dx, dy);
    }
    updateAssociativeDimensions();
    return;
  }
  const obj = state.objects[state.dragObjIdx];
  if (!obj) return;
  if (state.dragObjSnapshot) _restoreFromSnapshot(obj, state.dragObjSnapshot);
  moveObject(obj, dx, dy);
}

/**
 * Zruší rozdělané tažení (Esc, mobilní ✕, přepnutí nástroje): vrátí jednotlivý
 * i hromadný přesun, srovná asociativní kóty a zahodí prázdný krok Zpět,
 * který tažení uložilo na začátku. Vrací true, když se nějaké tažení rušilo.
 */
export function cancelDrag() {
  if (!state.dragging) return false;
  try {
    if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
      for (const { idx, snapshot } of state._multiDragSnapshots) {
        const obj = state.objects[idx];
        if (obj) _restoreFromSnapshot(obj, snapshot);
      }
    } else {
      const obj = state.objects[state.dragObjIdx];
      if (obj && state.dragObjSnapshot) _restoreFromSnapshot(obj, state.dragObjSnapshot);
    }
  } catch (e) { console.warn('Vrácení tažení selhalo:', e); }
  state.dragging = false;
  state.dragObjIdx = null;
  state.dragObjSnapshot = null;
  state._multiDragSnapshots = null;
  updateAssociativeDimensions();
  // Tažení nic nezměnilo → krok Zpět ze začátku tažení je prázdný
  const top = state.undoStack[state.undoStack.length - 1];
  if (top && top === JSON.stringify({ objects: state.objects, anchors: state.anchors })) {
    state.undoStack.pop();
    updateUndoButtons();
  }
  return true;
}

// ui.js (setTool) ruší tažení přes bridge – přímý import by uzavřel cyklus ui ↔ moveClick
bridge.cancelDrag = cancelDrag;

// ╔══════════════════════════════════════════════════════════════╗
// ║  Kruhové pole (Circular Array) – click logika               ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { findObjectAt, calculateAllIntersections, circularArray } from '../geometry.js';
import { addObject } from '../objects.js';
import { resetHint, setHint, updateProperties, updateObjectList } from '../ui.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { showCircularArrayDialog } from '../dialogs.js';

/** Kruhové pole – kliknutím vybere objekt, pak otevře dialog. */
export function handleCircularArrayClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na objekt pro kruhové pole"); return; }

  state.selected = idx;
  renderAll();

  const obj = state.objects[idx];
  setHint("Zadejte parametry kruhového pole");

  showCircularArrayDialog(obj, (cx, cz, count, totalAngle, includeOriginal) => {
    pushUndo();
    const copies = circularArray(obj, cx, cz, count, totalAngle, includeOriginal);
    for (const copy of copies) {
      addObject(copy);
    }
    calculateAllIntersections();
    updateAssociativeDimensions();
    updateObjectList();
    updateProperties();
    renderAll();
    resetHint();
    showToast(`Vytvořeno ${copies.length} kopií`);
  });
}

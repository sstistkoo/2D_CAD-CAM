// ╔══════════════════════════════════════════════════════════════╗
// ║  Kruhové pole (Circular Array) – click logika               ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, withUndoBatch } from '../state.js';
import { renderAll } from '../render.js';
import { findObjectAt, calculateAllIntersections, circularArray } from '../geometry.js';
import { addObject } from '../objects.js';
import { resetHint, setHint, updateProperties, updateObjectList } from '../ui.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { showCircularArrayDialog } from '../dialogs.js';
import { faceViewOn, getFaceLayer } from '../faceView/faceLayer.js';
import { inFaceDisc } from '../faceView/faceReference.js';
import { openBoltCircleCalc } from '../calculators/boltCircle.js';

/**
 * Kruhové pole – kliknutím vybere objekt, pak otevře dialog. V bokorysu
 * (◎ Čelo) klik do prázdna (typicky na střed) otevře ◎ Rozmístění děr se
 * středem v kliknutém bodě — roztečná kružnice + díry rovnou do čela.
 */
export function handleCircularArrayClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) {
    const face = faceViewOn() ? getFaceLayer() : null;
    if (face && face.origin && inFaceDisc(wx, wy)) {
      const old = document.querySelector('.calc-overlay[data-type="boltCircle"]');
      if (old) old.remove();
      openBoltCircleCalc({ cx: wx - face.origin.x, cy: wy - face.origin.y });
      setHint("Zadejte počet děr, Ø rozteč a Ø díry → ◎ Do čela");
      return;
    }
    showToast("Klepněte na objekt pro kruhové pole");
    return;
  }

  state.selected = idx;
  renderAll();

  const obj = state.objects[idx];
  setHint("Zadejte parametry kruhového pole");

  showCircularArrayDialog(obj, (cx, cz, count, totalAngle, includeOriginal) => {
    const copies = circularArray(obj, cx, cz, count, totalAngle, includeOriginal);
    withUndoBatch(() => {
      for (const copy of copies) {
        addObject(copy);
      }
    });
    calculateAllIntersections();
    updateAssociativeDimensions();
    updateObjectList();
    updateProperties();
    renderAll();
    resetHint();
    showToast(`Vytvořeno ${copies.length} kopií`);
  });
}

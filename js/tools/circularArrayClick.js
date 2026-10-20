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
import { drawCanvas } from '../canvas.js';
import { startDrawing, finishDrawing } from './helpers.js';
import { faceViewOn, getFaceLayer } from '../faceView/faceLayer.js';
import { inFaceDisc } from '../faceView/faceReference.js';
import { openBoltCircleCalc } from '../calculators/boltCircle.js';

const DRAG_PX = 8;   // posun myši se stisknutým tlačítkem = tažení (ne klik)
let _down = null;    // surová poloha stisku, kterým začala roztečná kružnice
let _armed = false;

/** Tažení: puštění tlačítka jinde než stisk dokončí roztečnou kružnici. */
function onMouseUp() {
  const d = _down;
  _down = null;
  if (!d || state.tool !== 'circularArray' || !state.drawing || !state.tempPoints.length) return;
  const px = Math.hypot(state.mouse.rawX - d.x, state.mouse.rawY - d.y) * state.zoom;
  if (px > DRAG_PX) finishPitch(state.mouse.x, state.mouse.y);
}

/** Roztečná kružnice v čele: střed (tempPoints[0]) + bod na obvodu → kalkulačka. */
function finishPitch(wx, wy) {
  const c = state.tempPoints[0];
  finishDrawing();
  const face = getFaceLayer();
  if (!face || !face.origin) { renderAll(); return; }
  const r = Math.hypot(wx - c.x, wy - c.y);
  const old = document.querySelector('.calc-overlay[data-type="boltCircle"]');
  if (old) old.remove();
  openBoltCircleCalc({ cx: c.x - face.origin.x, cy: c.y - face.origin.y, pcd: r > 1e-6 ? 2 * r : null });
  setHint("Zadejte počet děr, Ø díry a hloubku → ◎ Do čela");
  renderAll();
}

/**
 * Kruhové pole – kliknutím vybere objekt, pak otevře dialog. V bokorysu
 * (◎ Čelo) klik do prázdna (typicky na střed) začne roztečnou kružnici:
 * vytáhnout tažením nebo druhým klepnutím (klepnutí znovu do středu = Ø
 * zadat číslem) → ◎ Rozmístění děr se středem a Ø → díry rovnou do čela.
 */
export function handleCircularArrayClick(wx, wy) {
  if (state.drawing && state.tempPoints.length) { finishPitch(wx, wy); return; }
  const idx = findObjectAt(wx, wy);
  if (idx === null) {
    const face = faceViewOn() ? getFaceLayer() : null;
    if (face && face.origin && inFaceDisc(wx, wy)) {
      if (!_armed && drawCanvas && drawCanvas.addEventListener) { drawCanvas.addEventListener('mouseup', onMouseUp); _armed = true; }
      _down = { x: state.mouse.rawX ?? wx, y: state.mouse.rawY ?? wy };
      startDrawing(wx, wy, "Roztečná kružnice: táhněte nebo klepněte na obvod (znovu do středu = Ø zadat číslem)");
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

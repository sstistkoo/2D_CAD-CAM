import { state } from '../state.js';
import { renderAll } from '../render.js';
import { setHint } from '../ui.js';
import { showPolylineSegmentDialog } from '../dialogs/postDrawDialog.js';

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handlePolylineClick(wx, wy) {
  if (!state.drawing) {
    state.drawing = true;
    state.tempPoints = [{ x: wx, y: wy }];
    state._polylineBulges = [];
    setHint("Klepněte na další bod kontury (Enter = dokončit, Shift+Enter = uzavřít, B = oblouk)");
    renderAll();
  } else {
    state.tempPoints.push({ x: wx, y: wy });
    if (!state._polylineBulges) state._polylineBulges = [];
    state._polylineBulges.push(0);
    setHint(`Bod ${state.tempPoints.length} přidán (Enter = dokončit, Shift+Enter = uzavřít, B = oblouk)`);
    renderAll();
    // Show segment dialog for editing + finish/close options
    showPolylineSegmentDialog();
  }
}

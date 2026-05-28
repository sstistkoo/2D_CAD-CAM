import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { startDrawing, finishDrawing } from './helpers.js';
import { showPostDrawCircleDialog } from '../dialogs/postDrawDialog.js';

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handleCircleClick(wx, wy) {
  if (!state.drawing) {
    startDrawing(wx, wy, "Klepněte pro poloměr");
  } else {
    const cp = state.tempPoints[0];
    const r = Math.hypot(wx - cp.x, wy - cp.y);
    if (r < 1e-9) {
      showToast("Kružnice má nulový poloměr");
      finishDrawing();
      return;
    }
    const circObj = addObject({
      type: "circle",
      cx: cp.x,
      cy: cp.y,
      r,
      name: `Kružnice ${state.nextId}`,
    });
    finishDrawing();
    if (circObj) showPostDrawCircleDialog(circObj);
  }
}

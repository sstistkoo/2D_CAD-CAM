import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { startDrawing, finishDrawing } from './helpers.js';
import { showPostDrawLineDialog } from '../dialogs/postDrawDialog.js';

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handleLineClick(wx, wy) {
  if (!state.drawing) {
    startDrawing(wx, wy, "Klepněte na koncový bod");
  } else {
    const tp = state.tempPoints[0];
    if (Math.hypot(wx - tp.x, wy - tp.y) < 1e-9) {
      showToast("Úsečka má nulovou délku");
      finishDrawing();
      return;
    }
    const lineObj = addObject({
      type: state.tool === "constr" ? "constr" : "line",
      x1: tp.x,
      y1: tp.y,
      x2: wx,
      y2: wy,
      name: `${state.tool === "constr" ? "Konstr" : "Úsečka"} ${state.nextId}`,
      dashed: state.tool === "constr",
    });
    finishDrawing();
    if (lineObj) showPostDrawLineDialog(lineObj);
  }
}

import { state, showToast } from '../state.js';
import { addRectAsSegments } from '../objects.js';
import { startDrawing, finishDrawing } from './helpers.js';

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handleRectClick(wx, wy) {
  if (!state.drawing) {
    startDrawing(wx, wy, "Klepněte na protější roh");
  } else {
    const rp = state.tempPoints[0];
    if (Math.abs(wx - rp.x) < 1e-9 && Math.abs(wy - rp.y) < 1e-9) {
      showToast("Obdélník má nulovou velikost");
      finishDrawing();
      return;
    }
    addRectAsSegments(rp.x, rp.y, wx, wy);
    finishDrawing();
  }
}

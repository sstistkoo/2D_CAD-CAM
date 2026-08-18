import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { startDrawing, finishDrawing } from './helpers.js';
import { showPostDrawLineDialog } from '../dialogs/postDrawDialog.js';
import { activeLineProps, activeLineStyle } from '../lineStyles.js';

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
    // Aktivní volba „Typ čáry" (dialog otevřený z tlačítka v liště) platí
    // pro úsečku bez ohledu na to, jestli se kreslí přes nástroj Úsečka
    // nebo Typ čáry – typ čáry dle ČSN EN ISO 128, barva a příznak pomocné čáry.
    const styleProps = state.lineStyleActive
      ? activeLineProps()
      : { type: "line", dashed: false };
    const lineObj = addObject({
      ...styleProps,
      x1: tp.x,
      y1: tp.y,
      x2: wx,
      y2: wy,
      name: `${state.lineStyleActive ? activeLineStyle().label : "Úsečka"} ${state.nextId}`,
    });
    finishDrawing();
    if (lineObj) showPostDrawLineDialog(lineObj);
  }
}

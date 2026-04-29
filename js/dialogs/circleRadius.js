// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Poloměr kružnice                       ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeInputOverlay } from '../dialogFactory.js';
import { state, axisLabels } from '../state.js';
import { addObject } from '../objects.js';
import { safeEvalMath } from '../utils.js';
import { resetHint } from '../ui.js';

// ── Dialog pro zadání poloměru kružnice ──
/** Otevře dialog pro přímé zadání poloměru kružnice. */
export function showCircleRadiusDialog() {
  const cp = state.tempPoints[0];
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Kružnice – zadání poloměru</h3>
      <label>Střed: ${axisLabels()[0]}=${cp.x.toFixed(2)}, ${axisLabels()[1]}=${cp.y.toFixed(2)}</label>
      <label>Poloměr (mm):</label>
      <input type="text" id="dlgRadius" value="10" inputmode="decimal" autofocus>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="dlgOk">OK</button>
      </div>
    </div>`);
  const inp = overlay.querySelector("#dlgRadius");
  inp.focus();
  inp.select();
  const accept = () => {
    const r = safeEvalMath(inp.value);
    if (r > 0) {
      addObject({
        type: "circle",
        cx: cp.x,
        cy: cp.y,
        r,
        name: `Kružnice ${state.nextId}`,
      });
      state.drawing = false;
      state.tempPoints = [];
      resetHint();
    }
    overlay.remove();
  };
  overlay.querySelector("#dlgOk").addEventListener("click", accept);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") accept();
    if (e.key === "Escape") overlay.remove();
  });
}

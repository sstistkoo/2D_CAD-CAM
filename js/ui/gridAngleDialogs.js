// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy: velikost mřížky, krok úhlového snapu       ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2b). Otevírá je pravý klik na tlačítka snapu (ui.js) a mobilní
// ovládání; kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { state, showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { focusInput, closeOnBackdropClick } from '../dialogFactory.js';
import { renderAll } from '../render.js';
import { bridge } from '../bridge.js';
import { persistSettings } from '../ui.js';

// Po změně v dialogu: překreslit (mřížka), obnovit indikátory # / ∠ a uložit
// nastavení — jako stejná pole v Nastavení (dřív jen do paměti do obnovení stránky).
function _applied() {
  renderAll();
  bridge.updateCoordBarIndicators?.();
  persistSettings();
}

// ── Dialog: Grid Size ──
/** Otevře dialog pro nastavení velikosti mřížky. */
export function showGridSizeDialog() {
  const overlay = document.createElement("div");
  overlay.className = "input-overlay";
  overlay.innerHTML = `
    <div class="input-dialog">
      <h3># Velikost mřížky</h3>
      <label>Velikost kroku (mm):</label>
      <input type="number" id="dlgGridSize" step="0.1" min="0.1" value="${state.gridSize}" inputmode="decimal">
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="dlgGridOk">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const inp = overlay.querySelector("#dlgGridSize");
  focusInput(inp, { select: true });
  function confirm() {
    const v = safeEvalMath(inp.value);
    if (!isNaN(v) && v > 0) {
      state.gridSize = v;
      _applied();
      showToast(`Mřížka: ${v} mm`);
    }
    overlay.remove();
  }
  overlay.querySelector("#dlgGridOk").addEventListener("click", confirm);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") overlay.remove();
    e.stopPropagation();
  });
  closeOnBackdropClick(overlay, () => overlay.remove());
}

// ── Dialog: Angle Snap Step ──
/** Otevře dialog pro nastavení kroku úhlového snapu. */
export function showAngleSnapDialog() {
  const overlay = document.createElement("div");
  overlay.className = "input-overlay";
  overlay.innerHTML = `
    <div class="input-dialog">
      <h3>∠ Krok úhlového snapu</h3>
      <div class="btn-row" style="flex-wrap:wrap;gap:6px;margin-bottom:12px;">
        <button class="btn-cancel angle-preset" data-deg="15">15°</button>
        <button class="btn-cancel angle-preset" data-deg="30">30°</button>
        <button class="btn-cancel angle-preset" data-deg="45">45°</button>
        <button class="btn-cancel angle-preset" data-deg="90">90°</button>
      </div>
      <label>Vlastní krok (°):</label>
      <input type="number" id="dlgAngleStep" step="1" min="1" max="180" value="${state.angleSnapStep}" inputmode="decimal">
      <label style="margin-top:8px">Tolerance přichycení (°):</label>
      <input type="number" id="dlgAngleTol" step="1" min="1" max="45" value="${state.angleSnapTolerance}" inputmode="decimal">
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="dlgAngleOk">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const inp = overlay.querySelector("#dlgAngleStep");
  focusInput(inp, { select: true });

  overlay.querySelectorAll(".angle-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const deg = parseInt(btn.dataset.deg);
      state.angleSnapStep = deg;
      _applied();
      showToast(`Úhlový snap: ${deg}°`);
      overlay.remove();
    });
  });

  function confirm() {
    const v = safeEvalMath(inp.value);
    const tolInp = overlay.querySelector("#dlgAngleTol");
    const tol = safeEvalMath(tolInp.value);
    if (!isNaN(v) && v > 0 && v <= 180) {
      state.angleSnapStep = v;
    }
    if (!isNaN(tol) && tol > 0 && tol <= 45) {
      state.angleSnapTolerance = tol;
    }
    _applied();
    showToast(`Úhlový snap: ${state.angleSnapStep}° (tolerance ${state.angleSnapTolerance}°)`);
    overlay.remove();
  }
  overlay.querySelector("#dlgAngleOk").addEventListener("click", confirm);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") overlay.remove();
    e.stopPropagation();
  });
  closeOnBackdropClick(overlay, () => overlay.remove());
}

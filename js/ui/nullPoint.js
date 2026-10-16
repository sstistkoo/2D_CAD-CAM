// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nulový bod (📍, indikátor v panelu, dialog)          ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2b). Listenery tlačítek jsou v initNullPointButtons() — volá ji
// js/ui.js na původním místě (pořadí listenerů). Kód aplikace importuje jen
// z js/ui.js (updateNullPointUI, clearNullPoint), nikdy z js/ui/* napřímo.

import { state, showToast, fmtStatusCoords } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { renderAll } from '../render.js';
import { drawCanvas, screenToWorld, snapPt } from '../canvas.js';
import { makeInputOverlay, focusInput } from '../dialogFactory.js';
import { updateCoordModeBtn } from '../ui.js';

// ── Nul. bod tlačítko – nastavení/zrušení nulového bodu ──

/** Aktualizuje indikátor nulového bodu v levém panelu a styl tlačítka. */
export function updateNullPointUI() {
  const btn = document.getElementById("btnSetRef");
  const indicator = document.getElementById("nullPointIndicator");
  const coordsSpan = document.getElementById("nullPointCoords");
  if (state.nullPointActive) {
    btn.classList.add('null-active');
    const isK = state.machineType === 'karusel';
    let lbl = isK
      ? `X: ${state.incReference.x.toFixed(3)}  Z: ${state.incReference.y.toFixed(3)}`
      : `X: ${state.incReference.y.toFixed(3)}  Z: ${state.incReference.x.toFixed(3)}`;
    if (state.nullPointAngle !== 0) lbl += `  ∠${state.nullPointAngle}°`;
    coordsSpan.textContent = lbl;
    indicator.hidden = false;
  } else {
    btn.classList.remove('null-active');
    coordsSpan.textContent = '';
    indicator.hidden = true;
  }
}

/** Zruší nulový bod a vrátí se na ABS. */
export function clearNullPoint() {
  state.incReference = { x: 0, y: 0 };
  state.nullPointActive = false;
  state.nullPointAngle = 0;
  state.coordMode = 'abs';
  updateCoordModeBtn();
  updateNullPointUI();
  renderAll();
  showToast('Nulový bod zrušen – ABS režim');
}

/** Aplikuje nový nulový bod. */
function applyNullPoint(wx, wy, angle) {
  state.incReference = { x: wx, y: wy };
  state.nullPointAngle = angle || 0;
  state.nullPointActive = true;
  if (state.coordMode !== 'inc') {
    state.coordMode = 'inc';
    updateCoordModeBtn();
  }
  updateNullPointUI();
  renderAll();
  showToast(`Nulový bod: ${fmtStatusCoords(wx, wy)}${angle ? ' ∠' + angle + '°' : ''}`);
}

/** Zobrazí dialog pro nastavení nulového bodu. */
function showNullPointDialog() {
  const isK = state.machineType === 'karusel';
  const hLabel = isK ? 'X' : 'Z';
  const vLabel = isK ? 'Z' : 'X';

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:360px">
      <h3>📍 Nastavení nulového bodu</h3>
      <p style="font-size:11px;color:#9399b2;margin-bottom:10px">Zadejte souřadnice nebo vyberte bod z výkresu.</p>
      <div class="input-row">
        <div><label>${hLabel}:</label><input type="text" id="nullPtH" value="0"></div>
        <div><label>${vLabel}:</label><input type="text" id="nullPtV" value="0"></div>
        <div class="pick-col"><button type="button" class="pick-btn" id="nullPtPick" title="Vybrat z výkresu">🎯</button></div>
      </div>
      <div class="input-row" style="margin-top:4px">
        <div><label>Natočení (°):</label><input type="text" id="nullPtAngle" value="0"></div>
      </div>
      <div style="font-size:10px;color:#585b70;margin:6px 0;font-style:italic">💡 Natočení otáčí osy nulového bodu (0° = bez natočení)</div>
      <div class="btn-row">
        <button class="btn-cancel" id="nullPtCancel">Zrušit</button>
        <button class="btn-ok" id="nullPtOk">Potvrdit</button>
      </div>
    </div>`);

  const inputH = overlay.querySelector('#nullPtH');
  const inputV = overlay.querySelector('#nullPtV');
  const inputAngle = overlay.querySelector('#nullPtAngle');

  // Auto-focus (na mobilu ne – vytáhl by klávesnici přes dialog)
  setTimeout(() => focusInput(inputH), 50);

  // -- Pick from map (stejný vzor jako v číselném zadání) --
  function pickFromMap(callback) {
    overlay.style.display = "none";
    showToast("Klikněte na výkres pro výběr bodu...");

    function cleanup() {
      drawCanvas.removeEventListener("click", onPick);
      drawCanvas.removeEventListener("touchend", onTouch);
    }

    function onPick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let [wx, wy] = screenToWorld(sx, sy);
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
      cleanup();
      if (!document.body.contains(overlay)) return; // overlay removed by Escape
      overlay.style.display = "flex";
      callback(wx, wy);
    }

    function onTouch(e) {
      if (e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = drawCanvas.getBoundingClientRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        let [wx, wy] = screenToWorld(sx, sy);
        if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
        cleanup();
        if (!document.body.contains(overlay)) return; // overlay removed by Escape
        overlay.style.display = "flex";
        e.preventDefault();
        callback(wx, wy);
      }
    }

    drawCanvas.addEventListener("click", onPick);
    drawCanvas.addEventListener("touchend", onTouch);
  }

  // Pick button
  overlay.querySelector('#nullPtPick').addEventListener('click', () => {
    pickFromMap((wx, wy) => {
      inputH.value = wx.toFixed(3);
      inputV.value = wy.toFixed(3);
    });
  });

  // Potvrdit ručním zadáním
  overlay.querySelector('#nullPtOk').addEventListener('click', () => {
    const hVal = safeEvalMath(inputH.value);
    const vVal = safeEvalMath(inputV.value);
    const aVal = safeEvalMath(inputAngle.value);
    if (hVal == null || vVal == null || isNaN(hVal) || isNaN(vVal)) {
      showToast('Neplatné souřadnice');
      return;
    }
    const angle = (aVal != null && !isNaN(aVal)) ? aVal : 0;
    overlay.remove();
    applyNullPoint(hVal, vVal, angle);
  });

  // Enter v inputech
  function onEnter(e) {
    if (e.key === 'Enter') overlay.querySelector('#nullPtOk').click();
  }
  inputH.addEventListener('keydown', onEnter);
  inputV.addEventListener('keydown', onEnter);
  inputAngle.addEventListener('keydown', onEnter);

  // Zrušit
  overlay.querySelector('#nullPtCancel').addEventListener('click', () => overlay.remove());
}

/** Listenery 📍 a ✕ nulového bodu (při načtení — volá js/ui.js na původním místě). */
export function initNullPointButtons() {
  document.getElementById("btnSetRef").addEventListener("click", () => {
    // Druhé kliknutí na aktivní nul. bod → zrušit
    if (state.nullPointActive) {
      clearNullPoint();
      return;
    }
    showNullPointDialog();
  });

  // Clear button v panelu
  document.getElementById("btnClearNullPoint").addEventListener("click", clearNullPoint);
}

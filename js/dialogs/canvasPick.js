// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Jednorázový odběr kliku na CAD plátno (🎯 z mapy)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Sdílený „nabitý" odběr jednoho kliku: tlačítko 🎯 odběr nabije, další
// klik na plátno se spotřebuje a odběr se odzbrojí. Vzor pochází
// z původního `pickFromMap` v numericalInput.js.
//
// Proč ne přes `handleCanvasClick` v events.js: tam by se jeden klik
// zároveň zapsal do formuláře A nakreslil aktivním nástrojem. Takhle
// nástroje nic neví a nic se nemusí blokovat.

import { state, showToast } from '../state.js';
import { screenToWorld, snapPt, drawCanvas } from '../canvas.js';

/**
 * @typedef {object} CanvasPicker
 * @property {(callback: (wx: number, wy: number) => void, opts?: {field?: HTMLElement|null, hint?: string}) => void} pick
 * @property {() => void} cancel
 * @property {() => boolean} isArmed
 */

/**
 * Vyrobí odběr kliku na plátno. Jedna instance na okno – nové `pick()`
 * přebije to předchozí, takže nikdy nejsou nabité dva odběry naráz.
 * @returns {CanvasPicker}
 */
export function createCanvasPicker() {
  let cleanup = null;

  function disarm() {
    if (cleanup) cleanup();
  }

  function pick(callback, opts = {}) {
    disarm();
    const { field = null, hint = 'Klikněte na plátno pro výběr bodu…' } = opts;
    // Zvýrazněné může být i víc polí naráz (jeden klik doplní X i Z).
    const fields = (Array.isArray(field) ? field : [field]).filter(Boolean);
    fields.forEach(el => el.classList.add('pick-armed'));
    showToast(hint);

    function done() {
      drawCanvas.removeEventListener('click', onClick);
      document.removeEventListener('touchend', onTouch, true);
      fields.forEach(el => el.classList.remove('pick-armed'));
      cleanup = null;
    }

    function resolveWorld(wx, wy) {
      done();
      callback(wx, wy);
    }

    function resolveClient(clientX, clientY) {
      const rect = drawCanvas.getBoundingClientRect();
      let [wx, wy] = screenToWorld(clientX - rect.left, clientY - rect.top);
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
      resolveWorld(wx, wy);
    }

    function onClick(e) {
      resolveClient(e.clientX, e.clientY);
    }

    function onTouch(e) {
      if (e.target !== drawCanvas) return;
      if (e.changedTouches.length !== 1) return;
      e.preventDefault();
      // Dlouhý stisk zapne přesný zaměřovač, který je schválně posunutý NAD
      // prst (touch.js) – platí pak jeho poloha, ne dotyková. Bez tohohle se
      // bod zapsal o CROSSHAIR_OFFSET_Y vedle toho, co uživatel viděl.
      if (state.touchPrecision.active) {
        resolveWorld(state.touchPrecision.wx, state.touchPrecision.wy);
        return;
      }
      const touch = e.changedTouches[0];
      resolveClient(touch.clientX, touch.clientY);
    }

    drawCanvas.addEventListener('click', onClick);
    // Zachytávací fáze na `document`: obsluha touchend v touch.js visí přímo
    // na plátně a při uvolnění prstu zaměřovač schová (`active` → false).
    // Ve fázi AT_TARGET se listenery volají v pořadí registrace bez ohledu na
    // capture, takže na plátně by se sem už žádná pozice křížku nedostala.
    document.addEventListener('touchend', onTouch, true);
    cleanup = done;
  }

  return {
    pick,
    cancel: disarm,
    isArmed: () => cleanup !== null,
  };
}

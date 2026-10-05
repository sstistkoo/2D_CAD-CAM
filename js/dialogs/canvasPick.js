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

// Kolik odběrů je právě nabitých – napříč VŠEMI instancemi (číselné zadání
// i VK mají svou vlastní). V praxi nejvýš jeden, ale čítač je bezpečnější
// než bool proti dvojímu odzbrojení stejné instance.
// `events.js` (mousedown → handleCanvasClick, AKTIVNÍ NÁSTROJ) podle
// `isAnyPickerArmed()` klik při nabitém odběru přeskočí – jinak by stejný
// klik zároveň zapsal bod SEM (přes 'click' níž) A vybral vrchol/objekt
// nástrojem Výběr (mousedown běží dřív), takže by po výběru z mapy zůstal
// viset zvýrazněný bod na plátně (uživatel to nahlásil).
let armedCount = 0;
/** @returns {boolean} je právě nabitý libovolný odběr (kdekoli v appce)? */
export function isAnyPickerArmed() {
  return armedCount > 0;
}

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
    // `forceSnap` = chytat body objektů/průsečíky i při vypnutém přichytávání
    // (editor z Kalkulaček chce přesné souřadnice, ne místo prstu).
    const { field = null, hint = 'Klikněte na plátno pro výběr bodu…', forceSnap = false } = opts;
    // Zvýrazněné může být i víc polí naráz (jeden klik doplní X i Z).
    const fields = (Array.isArray(field) ? field : [field]).filter(Boolean);
    fields.forEach(el => el.classList.add('pick-armed'));
    showToast(hint);

    function done() {
      drawCanvas.removeEventListener('click', onClick);
      document.removeEventListener('touchend', onTouch, true);
      fields.forEach(el => el.classList.remove('pick-armed'));
      cleanup = null;
      armedCount--;
    }

    function resolveWorld(wx, wy) {
      done();
      callback(wx, wy);
    }

    function snapped(wx, wy) {
      if (!state.snapToPoints && !forceSnap) return [wx, wy];
      const prev = state.snapToPoints;
      state.snapToPoints = true;          // snapPt chytá body jen se zapnutým přepínačem
      try { return snapPt(wx, wy); } finally { state.snapToPoints = prev; }
    }

    function resolveClient(clientX, clientY) {
      const rect = drawCanvas.getBoundingClientRect();
      const [wx, wy] = screenToWorld(clientX - rect.left, clientY - rect.top);
      resolveWorld(...snapped(wx, wy));
    }

    function onClick(e) {
      resolveClient(e.clientX, e.clientY);
    }

    function onTouch(e) {
      if (e.target !== drawCanvas) return;
      if (e.changedTouches.length !== 1) return;
      // Křížek nad tlačítkem: touch.js klikne na tlačítko, bod se nebere.
      if (state.touchPrecision.active && state.touchPrecision.overButton) return;
      e.preventDefault();
      // Dlouhý stisk zapne přesný zaměřovač, který je schválně posunutý NAD
      // prst (touch.js) – platí pak jeho poloha, ne dotyková. Bez tohohle se
      // bod zapsal o CROSSHAIR_OFFSET_Y vedle toho, co uživatel viděl.
      if (state.touchPrecision.active) {
        resolveWorld(...(forceSnap ? snapped(state.touchPrecision.wx, state.touchPrecision.wy) : [state.touchPrecision.wx, state.touchPrecision.wy]));
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
    armedCount++;
  }

  return {
    pick,
    cancel: disarm,
    isArmed: () => cleanup !== null,
  };
}

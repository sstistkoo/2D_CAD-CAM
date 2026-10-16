// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Renderování (mřížka, objekty, kóty, snap)         ║
// ╚══════════════════════════════════════════════════════════════╝

// Jádro (plánování překreslení) + rozcestník: kód kreslení žije v js/render/*.js
// (rozděleno 16. 10. 2026 podle témat). Seznam exportů je stejný jako dřív —
// ostatní moduly importují odsud. Nové funkce patří do modulu svého tématu.
import { renderAxes } from './render/axes.js';
import { bridge } from './bridge.js';
import { ctx } from './canvas.js';
import { renderAngleSnapGuide } from './render/constraints.js';
import { renderObjects } from './render/objects.js';
import { state } from './state.js';

export { resolveObjectColor } from './render/common.js';
export { boundsOverlap, getObjectBounds } from './render/bounds.js';
export { getSelectionCounterLabel } from './render/overlays.js';
export { findNumLabelAt } from './render/labels.js';
export { drawArc, drawCircle, drawLine, drawPoint, drawPolyline, drawRect } from './render/primitives.js';
export { drawAutoDimensionOn, drawDimensionOn, drawText, drawTextOn } from './render/text.js';

let _renderRAF = null;
let _shownZoom = null;   // zoom naposledy vypsaný v mobilním řádku souřadnic
/** Naplánuje překreslení celého canvasu (requestAnimationFrame). */
export function renderAll() {
  if (_renderRAF) return;
  _renderRAF = requestAnimationFrame(() => {
    _renderRAF = null;
    renderObjects();
    renderAxes();
    renderAngleSnapGuide();
    // Náhled VK kontury – přes bridge, aby render.js nemusel importovat
    // calculators/vkContour.js (viz CLAUDE.md: žádné přímé cyklické importy).
    if (state.vkPreview?.visible && bridge.renderVkPreview) bridge.renderVkPreview(ctx);
    // Živý náhled záložky 🔢 Číselné zadání – přes bridge ze stejného
    // důvodu jako VK (render.js nesmí importovat dialogové moduly).
    if (state.numPreview?.visible && bridge.renderNumPreview) bridge.renderNumPreview(ctx);
    // Aktualizovat mobilní Cancel tlačítko
    if (bridge.updateMobileCancelBtn) bridge.updateMobileCancelBtn();
    // Aktualizovat tlačítka Dokončit/Uzavřít konturu
    if (bridge.updatePolylineButtons) bridge.updatePolylineButtons();
    // Aktualizovat tlačítka trasování profilu
    if (bridge.updateTraceButtons) bridge.updateTraceButtons();
    // Aktualizovat lištu Potvrdit/Zrušit ručního kreslení obrysu držáku (CAM)
    if (bridge.updateHolderDrawButtons) bridge.updateHolderDrawButtons();
    // Aktualizovat přepínač VK „kreslit myší" (setTool končí renderAll,
    // takže tlačítko drží krok i při přepnutí nástroje z toolbaru)
    if (bridge.updateVkDrawButton) bridge.updateVkDrawButton();
    // Zoom v % v mobilním řádku souřadnic – mění ho i vycentrování a přiblížení
    // z dialogů (fitViewToWorldBounds…), ne jen gesta; jinak tam zůstalo staré číslo.
    if (state.zoom !== _shownZoom && bridge.updateMobileCoords) {
      _shownZoom = state.zoom;
      bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
    }
  });
}

let _renderDebounceTimer = null;
/**
 * Debounced renderAll — pro rychlé UI změny (barva, vlastnosti).
 * Seskupí vícenásobná volání do jednoho renderAll po uplynutí delay.
 */
export function renderAllDebounced(delay = 32) {
  clearTimeout(_renderDebounceTimer);
  _renderDebounceTimer = setTimeout(() => {
    _renderDebounceTimer = null;
    renderAll();
  }, delay);
}

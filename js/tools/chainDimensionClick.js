// ╔══════════════════════════════════════════════════════════════╗
// ║  Řetězcové kótování – click logika                        ║
// ║  Chain dimension: kóty end-to-end v řetězci               ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint, resetHint } from '../ui.js';
import { calculateAllIntersections } from '../geometry.js';

/**
 * Řetězcové kótování – klikání bodů v řadě.
 * Každý další klik vytvoří kótu od předchozího bodu k novému.
 * Enter/Escape ukončí řetězec.
 */
export function handleChainDimensionClick(wx, wy) {
  if (!state.drawing) {
    // 1. klik – začátek řetězce
    state.drawing = true;
    state.tempPoints = [{ x: wx, y: wy }];
    state._chainDimCount = 0;
    setHint("Klepněte na další bod řetězcové kóty (Enter/Escape = konec)");
  } else {
    const prev = state.tempPoints[state.tempPoints.length - 1];
    const d = Math.hypot(wx - prev.x, wy - prev.y);
    if (d < 1e-6) {
      showToast("Body jsou totožné");
      return;
    }

    // Přidat bod do řetězce
    state.tempPoints.push({ x: wx, y: wy });

    // Vytvořit kótu od předchozího bodu k novému
    if (state._chainDimCount === 0) pushUndo(); // undo pro celý řetězec

    const dimOffset = 20;
    const ang = Math.atan2(wy - prev.y, wx - prev.x);
    const nx = -Math.sin(ang) * dimOffset;
    const ny = Math.cos(ang) * dimOffset;

    addObject({
      type: 'line',
      x1: prev.x + nx, y1: prev.y + ny,
      x2: wx + nx, y2: wy + ny,
      isDimension: true,
      dimType: 'linear',
      dimOffset: dimOffset,
      dimSrcX1: prev.x, dimSrcY1: prev.y,
      dimSrcX2: wx, dimSrcY2: wy,
      name: `Kóta ${d.toFixed(2)}mm`,
      color: COLORS.textSecondary,
      isChainDim: true,
    });

    state._chainDimCount = (state._chainDimCount || 0) + 1;

    showToast(`Řetězová kóta ${d.toFixed(2)}mm (#${state._chainDimCount})`);
    setHint(`Řetězcové kótování: ${state._chainDimCount} kót – klepněte další bod (Enter/Escape = konec)`);
    calculateAllIntersections();
    renderAll();
  }
}

/**
 * Dokončení řetězcového kótování (Enter / změna nástroje).
 */
export function finishChainDimension() {
  const count = state._chainDimCount || 0;
  if (count > 0) {
    showToast(`Řetězcové kótování dokončeno: ${count} kót ✓`);
  }
  state.drawing = false;
  state.tempPoints = [];
  state._chainDimCount = 0;
  resetHint();
  renderAll();
}

/**
 * Reset stavu řetězcového kótování.
 */
export function resetChainDimensionState() {
  state._chainDimCount = 0;
}

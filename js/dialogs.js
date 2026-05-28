// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy (barrel – re-exporty z ./dialogs/*)        ║
// ╚══════════════════════════════════════════════════════════════╝

import { applyMobileInputMode, wireExprInputs } from './dialogs/mobileEdit.js';

// Re-export pro zpětnou kompatibilitu
export { safeEvalMath } from './utils.js';

// ── Sub-moduly ──
export { showMeasureResult, showIntersectionInfo, showMeasureObjectInfo,
  showMeasureTwoPointsResult, showMeasureMultiPointResult,
  showMeasureTwoLinesResult, showMeasureTwoCirclesResult,
  showMeasurePointToLineResult, showMeasurePointToCircleResult,
  showMeasureTwoObjectsResult, showMeasureMultiObjectResult } from './dialogs/measure.js';
export { showCircleRadiusDialog } from './dialogs/circleRadius.js';
export { showNumericalInputDialog } from './dialogs/numericalInput.js';
export { showPolarDrawingDialog } from './dialogs/polarDrawing.js';
export { showBulgeDialog } from './dialogs/bulge.js';
export { addDimensionForObject, addAngleDimensionForLines } from './dialogs/dimension.js';
export { applyMobileInputMode, wireExprInputs, showMobileEditDialog, showEditObjectDialog } from './dialogs/mobileEdit.js';
export { showOffsetDialog, showOffsetAngleDialog, showMirrorDialog, showLinearArrayDialog, showCircularArrayDialog, showRotateDialog, showFilletDialog, showChamferDialog, showFilletChamferDialog, showScaleDialog, showEndpointChoiceDialog } from './dialogs/objectDialogs.js';
export { showTangentChoiceDialog, showTangentPositionDialog } from './dialogs/tangentDialogs.js';
export { showBooleanDialog } from './dialogs/booleanDialog.js';
export { autoDetectFeatures } from './dialogs/autoDetect.js';

// ── Focus trap pro dialogy ──
// Zachytí Tab v otevřeném overlay dialogu, aby focus neutekl za dialog
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const overlay = document.querySelector('.input-overlay, .calc-overlay');
  if (!overlay) return;
  const focusable = overlay.querySelectorAll(
    'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// ── Auto-apply inputmode + auto-select + blur-eval na nové dialogy ──
const _dialogObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === 1 && node.classList && (node.classList.contains("input-overlay") || node.classList.contains("calc-overlay"))) {
        applyMobileInputMode(node);
        wireExprInputs(node);
        // Scroll input do viditelné oblasti na mobilu (nad klávesnici)
        node.addEventListener("focus", (e) => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
            setTimeout(() => {
              e.target.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 300);
          }
        }, true);
      }
    }
  }
});
_dialogObserver.observe(document.body, { childList: true });

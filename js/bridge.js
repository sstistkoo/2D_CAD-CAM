// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bridge (callback registry pro cyklické závislosti) ║
// ╚══════════════════════════════════════════════════════════════╝

/** @type {import('./types.js').Bridge} */
export const bridge = {
  updateMobileCancelBtn: null,
  updateMobileCoords: null,
  updatePolylineButtons: null,
  updateTraceButtons: null,
  finishProfileTrace: null,
  finishChainDimension: null,
  updateProperties: null,
  updateObjectList: null,
  updateIntersectionList: null,
  calculateAllIntersections: null,
  runCncExport: null,
  renderAll: null,
  resetHint: null,
  measureSelection: null,
  tangentFromSelection: null,
  offsetFromSelection: null,
  trimFromSelection: null,
  extendFromSelection: null,
  filletFromSelection: null,
  chamferFromSelection: null,
  perpFromSelection: null,
  horizontalFromSelection: null,
  parallelFromSelection: null,
  centerMarkFromSelection: null,
  scaleFromSelection: null,
  filletChamferFromSelection: null,
  mirrorFromSelection: null,
  rotateFromSelection: null,
  linearArrayFromSelection: null,
  circularArrayFromSelection: null,
  copyPlaceFromSelection: null,
};

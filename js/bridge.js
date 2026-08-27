// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bridge (callback registry pro cyklické závislosti) ║
// ╚══════════════════════════════════════════════════════════════╝

/** @type {import('./types.js').Bridge} */
export const bridge = {
  updateMobileCancelBtn: null,
  updateMobileCoords: null,
  updatePolylineButtons: null,
  updateTraceButtons: null,
  updateHolderDrawButtons: null,
  confirmHolderDraw: null,
  cancelHolderDraw: null,
  refreshCamToolGeometry: null,
  getCamToolGeometry: null,
  applyCamToolGeometry: null,
  finishProfileTrace: null,
  finishChainDimension: null,
  updateProperties: null,
  updateObjectList: null,
  updateIntersectionList: null,
  calculateAllIntersections: null,
  runCncExport: null,
  // Absolutní world (x,y) → G-kód adresa (osy/jednotky dle machineType +
  // xDisplayMode) – sdílená s runCncExport(), aby se konvence os nerozjela
  // na dvou místech (viz numericalInput.js – ruční zápis G-kódu).
  formatAbsCoord: null,
  // World AABB obsahu G-kódu bez vedlejších účinků na plátno – použito
  // pro ⤢ v číselném zadání (js/dialogs/numericalInput.js), ať jde rámovat
  // ruční zápis i před jeho vykreslením přes 🔄.
  gcodeTextBounds: null,
  // Poslední bod (world x,y), kam text G-kódu dojíždí – použito v
  // numericalInput.js pro obnovení closure stavu po (znovu)otevření okna.
  gcodeTextLastPoint: null,
  renderCncCodeToCanvas: null,
  renderVkPreview: null,
  fitVkPreviewView: null,
  renderNumPreview: null,
  commitVkToDrawing: null,
  vkDrawPoint: null,
  vkDrawUndo: null,
  updateVkDrawButton: null,
  setTool: null,
  renderAll: null,
  resetHint: null,
  measureSelection: null,
  tangentFromSelection: null,
  offsetFromSelection: null,
  trimFromSelection: null,
  extendFromSelection: null,
  filletFromSelection: null,
  chamferFromSelection: null,
  threadFromSelection: null,
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
  // Zruší otevřený/skrytý dialog Polární/Úhel (viz polarDrawing.js) – volá
  // se ze setTool(), aby přepnutí na jiný kreslicí nástroj během klikání
  // v režimu „Tečnost" dialog spolehlivě ukončilo (jinak by zůstaly viset
  // posluchače kliků na plátně z opuštěné relace).
  cancelPolarPicking: null,
  saveProject: null,
  showFileDialog: null,
  showLibraryDialog: null,
  showProjectsDialog: null,
};

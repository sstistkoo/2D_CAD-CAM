// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Stav aplikace, Toast, Undo/Redo                   ║
// ╚══════════════════════════════════════════════════════════════╝

import { bridge } from './bridge.js';
import { COLORS } from './constants.js';

// ── Hook pro rozšíření pushUndo (autosave) ──
let _pushUndoHook = null;
/** @param {Function} fn */
export function setPushUndoHook(fn) { _pushUndoHook = fn; }

// ── Toast notifikace ──
/**
 * @param {string} msg
 * @param {number} [duration=2000]
 */
export function showToast(msg, duration = 2000) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), duration);
}

// ── Stav aplikace ──
/** @type {import('./types.js').AppState} */
export const state = {
  objects: [],
  selected: null,
  selectedSegment: null,
  _selectedSegmentObjIdx: null,
  multiSelectedSegments: new Map(),
  multiSelected: new Set(),
  selectedPoint: null,  // [{x, y}, ...] – vybrané průsečíky/body (pole)
  tool: "select",
  snapToPoints: true,
  snapToGrid: false,
  angleSnap: true,
  angleSnapStep: 15,
  angleSnapTolerance: 1,
  gridSize: 10,
  zoom: 1,
  panX: 0,
  panY: 0,
  drawing: false,
  tempPoints: [],
  mouse: { x: 0, y: 0, rawX: 0, rawY: 0, sx: 0, sy: 0, snapped: false, snapType: '' },
  intersections: [],
  nextId: 1,
  showDimensions: 'all',  // 'all' | 'intersections' | 'none'
  showObjectNumbers: false, // zobrazit čísla objektů na výkrese
  showIntersectionNumbers: false, // zobrazit čísla průsečíků na výkrese
  // Kotvení (anchor) – zafixované snap body
  anchors: [],  // [{x, y}, ...] – zakotvené body
  // Undo/Redo
  undoStack: [],
  redoStack: [],
  maxUndo: 50,
  // Move
  dragging: false,
  dragObjIdx: null,
  dragStartWorld: null,
  dragObjSnapshot: null,
  // Clipboard
  clipboard: null,
  // Numerical dialog chaining
  numDialogChain: { x: null, y: null },
  // Inkrementální souřadnice
  coordMode: 'abs',
  incReference: { x: 0, y: 0 },
  nullPointActive: false,
  nullPointAngle: 0,
  // Projekt
  projectName: 'Bez názvu',
  // Typ stroje: 'soustruh' = Z vodorovně, X svisle; 'karusel' = X vodorovně, Z svisle
  machineType: 'soustruh',
  // Zobrazení osy X: 'radius' = skutečná hodnota, 'diameter' = ×2 (průměr)
  xDisplayMode: 'radius',
  // Přesnost zobrazení souřadnic a kót (počet desetinných míst)
  displayDecimals: 3,
  // Motiv: 'dark' nebo 'light'
  theme: 'dark',
  // Snap body: quadranty kružnice a středy úseček
  snapQuadrants: false,
  snapMidpoints: false,
  // Vrstvy
  layers: [
    { id: 0, name: 'Kontura', color: COLORS.primary, visible: true, locked: false },
    { id: 1, name: 'Konstrukce', color: COLORS.construction, visible: true, locked: false },
    { id: 2, name: 'Kóty', color: COLORS.dimension, visible: true, locked: false },
  ],
  activeLayer: 0,
  nextLayerId: 3,
};

// ── Reset dočasného drawing stavu ──
/**
 * Vyčistí všechny dočasné vlastnosti používané při kreslení a tool operacích.
 * Volat při Escape, přepnutí nástroje a mobilním Cancel.
 */
export function resetDrawingState() {
  state.drawing = false;
  state.tempPoints = [];
  state._polylineBulges = [];
  state._profileTraceBulges = [];
  state._parallelRefIdx = null;
  state._parallelRefSeg = null;
  state._parallelClickX = undefined;
  state._parallelClickY = undefined;
  state._snapPointState = null;
  state._tangentMode = null;
  state._tangentFirstCircle = null;
  state._tangentFirstLine = null;
  state._selectedConstraint = null;
  state._trimLine = null;
  state._extendLine = null;
  state._filletFirstLine = null;
  state._dimFirstLine = null;
  state._chainDimCount = 0;
  // Generic tool cleanup (fillet/offset listeners etc.)
  if (state._toolCleanup) {
    state._toolCleanup();
    state._toolCleanup = null;
  }
  // Mirror – cleanup handler + state
  if (state._mirrorCleanup) {
    state._mirrorCleanup();
    state._mirrorCleanup = null;
  }
  state._mirrorObj = null;
  state._mirrorStep = null;
  state._mirrorAxisPoints = null;
  // CopyPlace cleanup
  state._copyPlaceObjects = null;
  state._copyPlaceRef = null;
  // Rotate cleanup
  state._rotateObjects = null;
  // multiSelected se čistí při resetu (setTool si jej uloží pro move)
  state.multiSelected.clear();
  state.selectedPoint = null;
  // Rect selection cleanup
  state._rectSelecting = false;
  state._rectStart = null;
}

// ── Undo / Redo ──
/** Uloží aktuální stav objektů na undo stack. */
export function pushUndo() {
  state.undoStack.push(JSON.stringify({ objects: state.objects, anchors: state.anchors }));
  if (state.undoStack.length > state.maxUndo) state.undoStack.shift();
  state.redoStack = [];
  updateUndoButtons();
  if (_pushUndoHook) _pushUndoHook();
}

/** Parsuje undo/redo záznam (kompatibilita se starým formátem). */
function _parseUndoData(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { objects: parsed, anchors: [] };
  return { objects: parsed.objects || [], anchors: parsed.anchors || [] };
}

/** Serializuje aktuální stav pro undo/redo. */
function _serializeState() {
  return JSON.stringify({ objects: state.objects, anchors: state.anchors });
}

/** Vrátí poslední změnu (undo). */
export function undo() {
  // Během kreslení kontury: vrátit poslední bod místo globálního undo
  if (state.drawing && state.tool === "polyline") {
    if (state.tempPoints.length > 1) {
      state.tempPoints.pop();
      if (state._polylineBulges && state._polylineBulges.length > 0) {
        state._polylineBulges.pop();
      }
      // Přesunout kurzor na nový poslední bod, aby preview čára nezobrazovala odebraný segment
      const lastPt = state.tempPoints[state.tempPoints.length - 1];
      state.mouse.x = lastPt.x;
      state.mouse.y = lastPt.y;
      showToast(`Poslední bod odebrán (zbývá ${state.tempPoints.length})`);
      if (bridge.renderAll) bridge.renderAll();
      return;
    }
    // Zbyl jen 1 bod – zrušit kreslení
    state.drawing = false;
    state.tempPoints = [];
    state._polylineBulges = [];
    if (bridge.resetHint) bridge.resetHint();
    if (bridge.renderAll) bridge.renderAll();
    return;
  }
  if (state.undoStack.length === 0) return;

  // Krokové undo pro právě vytvořenou konturu:
  // Pokud je poslední objekt polyline s >2 body a v předchozím stavu neexistuje,
  // odeber jen poslední bod místo smazání celé kontury.
  const lastObj = state.objects[state.objects.length - 1];
  if (lastObj && lastObj.type === 'polyline' && lastObj.vertices && lastObj.vertices.length > 2) {
    let undoTopObjs;
    try {
      const undoTop = _parseUndoData(state.undoStack[state.undoStack.length - 1]);
      undoTopObjs = undoTop.objects;
    } catch {
      state.undoStack = [];
      updateUndoButtons();
      showToast('Chyba: historie poškozena');
      return;
    }
    const polyInUndo = undoTopObjs.find(o => o.id === lastObj.id);
    if (!polyInUndo) {
      // Kontura neexistuje v předchozím stavu → byla právě vytvořena
      state.redoStack.push(_serializeState());
      if (lastObj.closed) {
        // Nejdřív otevřít uzavřenou konturu
        lastObj.closed = false;
        while (lastObj.bulges.length > lastObj.vertices.length - 1) lastObj.bulges.pop();
      } else {
        // Odebrat poslední bod
        lastObj.vertices.pop();
        while (lastObj.bulges.length > lastObj.vertices.length - 1) lastObj.bulges.pop();
      }
      state.selected = null;
      if (bridge.updateObjectList) bridge.updateObjectList();
      if (bridge.updateProperties) bridge.updateProperties();
      if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
      updateUndoButtons();
      showToast("Zpět (bod kontury)");
      return;
    }
  }

  state.redoStack.push(_serializeState());
  try {
    const undoData = _parseUndoData(state.undoStack.pop());
    state.objects = undoData.objects;
    state.anchors = undoData.anchors;
  } catch {
    state.undoStack = [];
    state.redoStack.pop();
    updateUndoButtons();
    showToast('Chyba: historie poškozena');
    return;
  }
  state.selected = null;
  state.multiSelected.clear();
  state.selectedPoint = null;
  if (bridge.updateObjectList) bridge.updateObjectList();
  if (bridge.updateProperties) bridge.updateProperties();
  if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
  updateUndoButtons();
  if (_pushUndoHook) _pushUndoHook();
  showToast("Zpět");
}

/** Zopakuje vrácenou změnu (redo). */
export function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(_serializeState());
  try {
    const redoData = _parseUndoData(state.redoStack.pop());
    state.objects = redoData.objects;
    state.anchors = redoData.anchors;
  } catch {
    state.redoStack = [];
    state.undoStack.pop();
    updateUndoButtons();
    showToast('Chyba: historie poškozena');
    return;
  }
  state.selected = null;
  state.multiSelected.clear();
  state.selectedPoint = null;
  if (bridge.updateObjectList) bridge.updateObjectList();
  if (bridge.updateProperties) bridge.updateProperties();
  if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
  updateUndoButtons();
  if (_pushUndoHook) _pushUndoHook();
  showToast("Vpřed");
}

/** Aktualizuje stav tlačítek undo/redo v toolbaru. */
export function updateUndoButtons() {
  document.getElementById("btnUndo").disabled =
    state.undoStack.length === 0;
  document.getElementById("btnRedo").disabled =
    state.redoStack.length === 0;
  document
    .getElementById("btnUndo")
    .classList.toggle("disabled", state.undoStack.length === 0);
  document
    .getElementById("btnRedo")
    .classList.toggle("disabled", state.redoStack.length === 0);
  if (bridge.updateMobileRedoBtn) bridge.updateMobileRedoBtn();
}

// ── Inkrementální souřadnice – pomocné funkce ──
/**
 * Převede world souřadnice na zobrazované (abs / inc).
 * @param {number} wx
 * @param {number} wy
 * @returns {{x: number, y: number}}
 */
export function toDisplayCoords(wx, wy) {
  if (state.coordMode === 'inc') {
    const dx = wx - state.incReference.x;
    const dy = wy - state.incReference.y;
    if (state.nullPointActive && state.nullPointAngle !== 0) {
      // Rotace souřadnic do lokálního systému natočeného nulového bodu
      const rad = -state.nullPointAngle * Math.PI / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      return { x: dx * c - dy * s, y: dx * s + dy * c };
    }
    return { x: dx, y: dy };
  }
  return { x: wx, y: wy };
}

/**
 * Převede absolutní úhel (stupně) na zobrazovaný relativní k natočení nulového bodu.
 * @param {number} angleDeg – úhel ve stupních (absolutní)
 * @returns {number} – úhel relativní k null point rotaci
 */
export function toDisplayAngle(angleDeg) {
  if (state.nullPointActive && state.nullPointAngle !== 0) {
    return angleDeg - state.nullPointAngle;
  }
  return angleDeg;
}

/**
 * Převede inkrementální souřadnice na absolutní.
 * @param {number} dx
 * @param {number} dy
 * @returns {{x: number, y: number}}
 */
export function fromIncToAbs(dx, dy) {
  if (state.nullPointActive && state.nullPointAngle !== 0) {
    // Inverzní rotace z lokálního systému do absolutního
    const rad = state.nullPointAngle * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    return {
      x: state.incReference.x + dx * c - dy * s,
      y: state.incReference.y + dx * s + dy * c
    };
  }
  return { x: state.incReference.x + dx, y: state.incReference.y + dy };
}

/**
 * Vrací popisky os podle typu stroje.
 * H = popisek vodorovné osy (wx), V = popisek svislé osy (wy).
 * @returns {[string, string]} [H, V]
 */
export function axisLabels() {
  return state.machineType === 'karusel' ? ['X', 'Z'] : ['Z', 'X'];
}

/**
 * Převede hodnotu osy X pro zobrazení (×2 v režimu průměr).
 * @param {number} val
 * @returns {number}
 */
export function displayX(val) {
  return state.xDisplayMode === 'diameter' ? val * 2 : val;
}

/**
 * Převede vstupní hodnotu osy X z režimu zobrazení na interní (÷2 v režimu průměr).
 * @param {number} val
 * @returns {number}
 */
export function inputX(val) {
  return state.xDisplayMode === 'diameter' ? val / 2 : val;
}

/**
 * Vrací prefix pro osu X ('⌀' v režimu průměr, '' v režimu poloměr).
 * @returns {string}
 */
export function xPrefix() {
  return state.xDisplayMode === 'diameter' ? '⌀' : '';
}

/**
 * Formátuje souřadnice pro status bar/coord display.
 * @param {number} wx - World X
 * @param {number} wy - World Y
 * @param {string} [extra] - Příp. extra text (distance, angle)
 * @returns {string}
 */
export function fmtStatusCoords(wx, wy, extra = '') {
  const d = toDisplayCoords(wx, wy);
  const prefix = state.coordMode === 'inc' ? 'Δ' : '';
  const isKarusel = state.machineType === 'karusel';
  const xp = xPrefix();
  const dec = state.displayDecimals;
  return isKarusel
    ? `${prefix}${xp}X: ${displayX(d.x).toFixed(dec)}   ${prefix}Z: ${d.y.toFixed(dec)}${extra}`
    : `${prefix}Z: ${d.x.toFixed(dec)}   ${prefix}${xp}X: ${displayX(d.y).toFixed(dec)}${extra}`;
}

/**
 * Formátuje souřadnice pro canvas popisky (kóty, průsečíky, snap body).
 * @param {number} wx - World X
 * @param {number} wy - World Y
 * @param {number} [decimals=3] - Počet desetinných míst
 * @returns {string}
 */
export function fmtCoordLabel(wx, wy, decimals) {
  const dec = decimals !== undefined ? decimals : state.displayDecimals;
  const d = toDisplayCoords(wx, wy);
  const pf = state.coordMode === 'inc' ? 'Δ' : '';
  const isK = state.machineType === 'karusel';
  const xp = xPrefix();
  return isK
    ? `${pf}${xp}X${displayX(d.x).toFixed(dec)} ${pf}Z${d.y.toFixed(dec)}`
    : `${pf}Z${d.x.toFixed(dec)} ${pf}${xp}X${displayX(d.y).toFixed(dec)}`;
}

/**
 * Vrací formátovací helpery pro souřadnice relativní k ose X.
 * @returns {{ xp: string, Hp: string, Vp: string, H: string, V: string, fH: (v: number) => number, fV: (v: number) => number }}
 */
export function coordHelpers() {
  const [H, V] = axisLabels();
  const isK = state.machineType === 'karusel';
  const xp = xPrefix();
  return {
    xp, H, V,
    Hp: isK ? xp : '',
    Vp: isK ? '' : xp,
    fH: v => isK ? displayX(v) : v,
    fV: v => isK ? v : displayX(v),
  };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dotyková podpora + mobilní ovládání               ║
// ╚══════════════════════════════════════════════════════════════╝

import { MOBILE_BREAKPOINT, LONG_PRESS_MS, CROSSHAIR_OFFSET_Y, ZOOM_MIN, ZOOM_MAX, VIBRATE_LONG_PRESS, TOUCH_MOVE_THRESHOLD, PAN_ACTIVATE_THRESHOLD } from './constants.js';
import { drawCanvas, screenToWorld, snapPt, autoCenterView, applyAngleSnap, safeVibrate } from './canvas.js';
import { state, undo, redo, showToast, toDisplayCoords, resetDrawingState, displayX, xPrefix, fmtStatusCoords } from './state.js';
import { renderAll } from './render.js';
import { moveObject, addObject, addPolylineAsSegments } from './objects.js';
import { handleCanvasClick, finishRectSelection } from './events.js';
import { setTool, resetHint, updateSnapPtsBtn } from './ui.js';
import { updateAssociativeDimensions } from './dialogs/dimension.js';
import { toolLabel } from './utils.js';
import { showNumericalInputDialog, showMobileEditDialog } from './dialogs.js';
import { measureSelection, finishProfileTrace, getTraceData, setTraceBulge } from './tools/index.js';
import { showBulgeDialog } from './dialogs/bulge.js';
import { findObjectAt } from './geometry.js';

import { bridge } from './bridge.js';

// ── Mobile: detekce ──
/** @returns {boolean} */
export const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

// ── Mobile: Toolbar toggle ──
const mobileToolbarToggle = document.getElementById("mobileToolbarToggle");
const topbar = document.getElementById("topbar");
mobileToolbarToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  topbar.classList.toggle("mobile-open");
  document.body.classList.toggle("toolbar-open", topbar.classList.contains("mobile-open"));
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
});
// Tool-btn click již nezavírá toolbar – uživatel zavírá ručně přes ✕

// ── Toolbar: rozbalovací sekce "Více nástrojů" ──
const btnToolbarMore = document.getElementById("btnToolbarMore");
const toolbarMore = document.getElementById("toolbarMore");
btnToolbarMore.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = toolbarMore.classList.toggle("open");
  btnToolbarMore.textContent = open ? "▴" : "▾";
});

// ── Toolbar: rozbalovací střední sekce (editace) ──
const btnToolbarMid = document.getElementById("btnToolbarMid");
const toolbarMid = document.getElementById("toolbarMid");
btnToolbarMid.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = toolbarMid.classList.toggle("open");
  btnToolbarMid.textContent = open ? "▴" : "▾";
});

// ── Mobile: Toolbar close button ──
document.getElementById("mobileToolbarClose").addEventListener("click", (e) => {
  e.stopPropagation();
  topbar.classList.remove("mobile-open");
  document.body.classList.remove("toolbar-open");
});

// ── Mobile: Sidebar toggle ──
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const mobileSidebarToggle = document.getElementById("mobileSidebarToggle");
mobileSidebarToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  sidebar.classList.toggle("mobile-open");
  sidebarOverlay.classList.toggle(
    "active",
    sidebar.classList.contains("mobile-open"),
  );
  topbar.classList.remove("mobile-open");
  document.body.classList.remove("toolbar-open");
  // Po otevření/zavření panelu vycentrovat pohled
  setTimeout(() => autoCenterView(), 260);
});
sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
  setTimeout(() => autoCenterView(), 260);
});

// ── Sidebar close button ──
document.getElementById("sidebarCloseBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
  setTimeout(() => autoCenterView(), 260);
});

// ── Klik na canvas zavře sidebar (toolbar se NEzavírá – jen přes ✕) ──
drawCanvas.addEventListener("pointerdown", () => {
  if (!isMobile()) return;
  if (sidebar.classList.contains("mobile-open")) {
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
  }
});

// ── Mobile: coord bar ──
const mobileCoordBar = document.getElementById("mobileCoordBar");

// Tap na coord bar (info pouze)
mobileCoordBar.addEventListener("click", (e) => {
  e.stopPropagation();
});

/**
 * Aktualizuje mobilní stavový řádek se souřadnicemi.
 * @param {number} wx
 * @param {number} wy
 * @param {string} [extra]
 */
export function updateMobileCoords(wx, wy, extra) {
  extra = extra || "";
  const coords = fmtStatusCoords(wx, wy, extra);
  // Desktop coord display – jen souřadnice
  document.getElementById("coordDisplay").textContent = coords;
  // Mobile coord bar – nástroj + mód + souřadnice + zoom
  const coordBarText = document.getElementById("coordBarText");
  if (isMobile()) {
    const zoomPct = (state.zoom * 100).toFixed(0);
    coordBarText.innerHTML = `${coords} &nbsp;|&nbsp; ${zoomPct}%`;
  } else {
    coordBarText.textContent = coords;
  }
  updateCoordBarIndicators();
}

/** Aktualizuje indikátory mřížky, úhlu a kót v coord baru. */
export function updateCoordBarIndicators() {
  const g = document.getElementById("indGrid");
  const a = document.getElementById("indAngle");
  const d = document.getElementById("indDims");
  if (g) g.classList.toggle("active", !!state.snapToGrid);
  if (a) a.classList.toggle("active", !!state.angleSnap);
  if (d) d.classList.toggle("active", state.showDimensions !== 'none');
}

// ── Mobile: Numerický vstup tlačítko ──
document
  .getElementById("mobileNumInput")
  .addEventListener("click", (e) => {
    e.stopPropagation();
    topbar.classList.remove("mobile-open");
    document.body.classList.remove("toolbar-open");
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
    showNumericalInputDialog();
  });

// ── Mobile: Měření tlačítko ──
const mobileMeasureBtn = document.getElementById("mobileMeasure");
mobileMeasureBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  topbar.classList.remove("mobile-open");
  document.body.classList.remove("toolbar-open");
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
  // Pokud je něco vybrané → okamžitě změřit
  if (measureSelection()) return;
  // Jinak toggle measure tool
  const newTool = state.tool === "measure" ? "select" : "measure";
  setTool(newTool);
  mobileMeasureBtn.classList.toggle("active", newTool === "measure");
});

// ── Mobile: Snap toggle tlačítko ──
const mobileSnapBtn = document.getElementById("mobileSnap");
function updateMobileSnapBtn() {
  mobileSnapBtn.classList.toggle("snap-active", state.snapToPoints);
}
updateMobileSnapBtn();
mobileSnapBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  state.snapToPoints = !state.snapToPoints;
  updateMobileSnapBtn();
  updateSnapPtsBtn();
  renderAll();
  showToast(state.snapToPoints ? "Přichycení: ON" : "Přichycení: OFF");
});

// ── Mobile: Auto-center tlačítko ──
document.getElementById("mobileAutoCenter").addEventListener("click", (e) => {
  e.stopPropagation();
  autoCenterView();
});

// ── Sidebar: Edit tlačítko ──
document.getElementById("sidebarEditBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  topbar.classList.remove("mobile-open");
  document.body.classList.remove("toolbar-open");
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
  showMobileEditDialog();
});

// ── Mobile: Cancel tlačítko ──
const mobileCancelBtn = document.getElementById("mobileCancel");
mobileCancelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.dragging) {
    if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
      for (const { idx, snapshot } of state._multiDragSnapshots) {
        const obj = state.objects[idx];
        if (obj) Object.assign(obj, JSON.parse(snapshot));
      }
      state._multiDragSnapshots = null;
    } else {
      const obj = state.objects[state.dragObjIdx];
      if (obj && state.dragObjSnapshot) {
        Object.assign(obj, JSON.parse(state.dragObjSnapshot));
      }
    }
    state.dragging = false;
    state.dragObjIdx = null;
  }
  resetDrawingState();
  // Odstranit dočasný měřicí bod
  const mTempIdx = state.objects.findIndex(o => o.isMeasureTemp);
  if (mTempIdx !== -1) state.objects.splice(mTempIdx, 1);
  hidePrecisionCrosshair();
  updateMobileCancelBtn();
  renderAll();
  resetHint();
  showToast("Zrušeno");
});

// Zobrazit/skrýt Cancel tlačítko podle stavu kreslení
/** Aktualizuje viditelnost mobilního Cancel tlačítka. */
export function updateMobileCancelBtn() {
  if (!isMobile()) return;
  const show = state.drawing || state.dragging;
  mobileCancelBtn.style.display = show ? "flex" : "none";
}

// ── Polyline: Dokončit / Uzavřít tlačítka ──
const polylineConfirmBtn = document.getElementById("polylineConfirm");
const polylineCloseBtn = document.getElementById("polylineClose");

/** Aktualizuje viditelnost tlačítek Dokončit/Uzavřít konturu. */
export function updatePolylineButtons() {
  const show = state.drawing && state.tool === 'polyline' && state.tempPoints.length >= 2;
  polylineConfirmBtn.style.display = show ? "flex" : "none";
  polylineCloseBtn.style.display = show ? "flex" : "none";
}

polylineConfirmBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!state.drawing || state.tool !== 'polyline' || state.tempPoints.length < 2) return;
  const bulges = state._polylineBulges || [];
  while (bulges.length < state.tempPoints.length - 1) bulges.push(0);
  addPolylineAsSegments(state.tempPoints.slice(), bulges.slice(0, state.tempPoints.length - 1), false);
  state.drawing = false;
  state.tempPoints = [];
  state._polylineBulges = [];
  resetHint();
  updatePolylineButtons();
  showToast('Kontura dokončena');
  renderAll();
});

polylineCloseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!state.drawing || state.tool !== 'polyline' || state.tempPoints.length < 2) return;
  const bulges = state._polylineBulges || [];
  while (bulges.length < state.tempPoints.length) bulges.push(0);
  addPolylineAsSegments(state.tempPoints.slice(), bulges.slice(0, state.tempPoints.length), true);
  state.drawing = false;
  state.tempPoints = [];
  state._polylineBulges = [];
  resetHint();
  updatePolylineButtons();
  showToast('Kontura uzavřena');
  renderAll();
});

// ── Mobile: Undo tlačítko ──
document.getElementById("mobileUndo").addEventListener("click", (e) => {
  e.stopPropagation();
  undo();
  updateMobileRedoBtn();
});

// ── Mobile: Redo tlačítko ──
const mobileRedoBtn = document.getElementById("mobileRedo");
if (mobileRedoBtn) {
  mobileRedoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    redo();
    updateMobileRedoBtn();
  });
}

/** Zobrazí/skryje mobileRedo tlačítko podle stavu redoStack. */
export function updateMobileRedoBtn() {
  if (!isMobile() || !mobileRedoBtn) return;
  mobileRedoBtn.style.display = state.redoStack.length > 0 ? 'flex' : 'none';
}
bridge.updateMobileRedoBtn = updateMobileRedoBtn;

// ── Touch state ──
let touchState = {
// ── Touch state ──
  lastTap: 0,
  lastTapX: 0,
  lastTapY: 0,
  touches: [],
  pinchStartDist: 0,
  pinchStartZoom: 1,
  pinchMidX: 0,
  pinchMidY: 0,
  panActive: false,
  wasMultiTouch: false,
  panStartX: 0,
  panStartY: 0,
  panStartPX: 0,
  panStartPY: 0,
  // Single-finger pan
  singleTouchStartX: 0,
  singleTouchStartY: 0,
  singleTouchStartPanX: 0,
  singleTouchStartPanY: 0,
  singlePanning: false,
  touchMoved: false,
  touchStartTime: 0,
  // Precision crosshair
  longPressTimer: null,
  precisionMode: false,
};

function getTouchPos(touch) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    sx: touch.clientX - rect.left,
    sy: touch.clientY - rect.top,
  };
}

// Detekce, zda je jednoprstý posun povolený (ne při kreslení/přetahování/precision)
function canSingleFingerPan() {
  return !state.drawing && !state.dragging && !touchState.precisionMode;
}

// ── Precision crosshair helpers ──
const precisionEl = document.getElementById("precisionCrosshair");
const precisionLabel = precisionEl.querySelector(".ch-label");

function showPrecisionCrosshair(touch) {
  const rect = drawCanvas.getBoundingClientRect();
  const chSx = touch.clientX - rect.left;
  const chSy = touch.clientY - rect.top + CROSSHAIR_OFFSET_Y;

  let [wx, wy] = screenToWorld(chSx, chSy);
  if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
  if (state.angleSnap && state.drawing && state.tempPoints.length > 0
      && ['line', 'constr', 'polyline', 'measure', 'dimension', 'chainDimension'].includes(state.tool)
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state.tempPoints[state.tempPoints.length - 1]);
  }
  if (state.angleSnap && state.tool === 'copyPlace' && state._copyPlaceRef
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state._copyPlaceRef);
  }
  if (state.angleSnap && state.tool === 'move' && state.dragging && state.dragStartWorld
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state.dragStartWorld);
  }
  state.mouse.x = wx;
  state.mouse.y = wy;
  state.mouse.sx = chSx;
  state.mouse.sy = chSy;

  precisionEl.style.left = touch.clientX + "px";
  precisionEl.style.top = touch.clientY + CROSSHAIR_OFFSET_Y + "px";
  const dp = toDisplayCoords(wx, wy);
  const pf = state.coordMode === 'inc' ? 'Δ' : '';
  precisionLabel.textContent = `${pf}X${dp.x.toFixed(state.displayDecimals)} ${pf}Z${dp.y.toFixed(state.displayDecimals)}`;
  precisionEl.style.display = "block";
  updateMobileCoords(wx, wy);
  renderAll();
}

function updatePrecisionCrosshair(touch) {
  const rect = drawCanvas.getBoundingClientRect();
  const chSx = touch.clientX - rect.left;
  const chSy = touch.clientY - rect.top + CROSSHAIR_OFFSET_Y;

  let [wx, wy] = screenToWorld(chSx, chSy);
  if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
  if (state.angleSnap && state.drawing && state.tempPoints.length > 0
      && ['line', 'constr', 'polyline', 'measure', 'dimension', 'chainDimension'].includes(state.tool)
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state.tempPoints[state.tempPoints.length - 1]);
  }
  if (state.angleSnap && state.tool === 'copyPlace' && state._copyPlaceRef
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state._copyPlaceRef);
  }
  if (state.angleSnap && state.tool === 'move' && state.dragging && state.dragStartWorld
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state.dragStartWorld);
  }
  state.mouse.x = wx;
  state.mouse.y = wy;
  state.mouse.sx = chSx;
  state.mouse.sy = chSy;

  precisionEl.style.left = touch.clientX + "px";
  precisionEl.style.top = touch.clientY + CROSSHAIR_OFFSET_Y + "px";
  const dp2 = toDisplayCoords(wx, wy);
  const pf2 = state.coordMode === 'inc' ? 'Δ' : '';
  precisionLabel.textContent = `${pf2}X${dp2.x.toFixed(state.displayDecimals)} ${pf2}Z${dp2.y.toFixed(state.displayDecimals)}`;

  let extra = "";
  if (state.drawing && state.tempPoints.length > 0) {
    const ref = state.tempPoints[state.tempPoints.length - 1];
    const ddx = wx - ref.x,
      ddy = wy - ref.y;
    const dist = Math.hypot(ddx, ddy);
    const rawAng = (Math.atan2(ddy, ddx) * 180) / Math.PI;
    const ang = (state.nullPointActive && state.nullPointAngle !== 0)
      ? rawAng - state.nullPointAngle : rawAng;
    extra = `  d=${dist.toFixed(1)} \u2220=${ang.toFixed(1)}\u00b0`;
  }
  updateMobileCoords(wx, wy, extra);

  // Přetahování objektu v precision mode
  if (state.dragging && state.dragObjIdx !== null) {
    const dx = wx - state.dragStartWorld.x;
    const dy = wy - state.dragStartWorld.y;
    if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
      for (const { idx, snapshot } of state._multiDragSnapshots) {
        const obj = state.objects[idx];
        if (obj) Object.assign(obj, JSON.parse(snapshot));
      }
      for (const { idx } of state._multiDragSnapshots) {
        const obj = state.objects[idx];
        if (!obj) continue;
        if (!obj.isDimension && !obj.isCoordLabel) {
          moveObject(obj, dx, dy);
        } else if (!obj.sourceObjId) {
          if (obj.type === 'point') { obj.x += dx; obj.y += dy; }
          else if (obj.type === 'line') {
            obj.x1 += dx; obj.y1 += dy;
            obj.x2 += dx; obj.y2 += dy;
            if (obj.dimSrcX1 != null) { obj.dimSrcX1 += dx; obj.dimSrcY1 += dy; }
            if (obj.dimSrcX2 != null) { obj.dimSrcX2 += dx; obj.dimSrcY2 += dy; }
            if (obj.dimCenterX != null) { obj.dimCenterX += dx; obj.dimCenterY += dy; }
          }
        }
      }
      updateAssociativeDimensions();
    } else if (state.objects[state.dragObjIdx]) {
      const obj = state.objects[state.dragObjIdx];
      if (state.dragObjSnapshot) {
        const snapShot = JSON.parse(state.dragObjSnapshot);
        Object.assign(obj, snapShot);
      }
      moveObject(obj, dx, dy);
    }
  }

  renderAll();
}

function hidePrecisionCrosshair() {
  precisionEl.style.display = "none";
  touchState.precisionMode = false;
  if (touchState.longPressTimer) {
    clearTimeout(touchState.longPressTimer);
    touchState.longPressTimer = null;
  }
}

// ── Touch start ──
drawCanvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 2) {
      // Pinch zoom / dvouprstý posun
      touchState.wasMultiTouch = true;
      touchState.singlePanning = false;
      if (!touchState.precisionMode) {
        hidePrecisionCrosshair();
        const t1 = getTouchPos(touches[0]);
        const t2 = getTouchPos(touches[1]);
        touchState.pinchStartDist = Math.hypot(
          t1.sx - t2.sx,
          t1.sy - t2.sy,
        );
        touchState.pinchStartZoom = state.zoom;
        touchState.pinchMidX = (t1.sx + t2.sx) / 2;
        touchState.pinchMidY = (t1.sy + t2.sy) / 2;
        touchState.panStartX =
          (touches[0].clientX + touches[1].clientX) / 2;
        touchState.panStartY =
          (touches[0].clientY + touches[1].clientY) / 2;
        touchState.panStartPX = state.panX;
        touchState.panStartPY = state.panY;
        touchState.panActive = true;
      }
      return;
    }

    if (touches.length === 1) {
      const tp = getTouchPos(touches[0]);
      state.mouse.sx = tp.sx;
      state.mouse.sy = tp.sy;
      let [wx, wy] = screenToWorld(tp.sx, tp.sy);
      if (state.snapToPoints)
        [wx, wy] = snapPt(wx, wy);
      state.mouse.x = wx;
      state.mouse.y = wy;
      updateMobileCoords(wx, wy);

      // Move tool: okamžitě uchopí objekt při touchstart,
      // aby touchmove mohl přetahovat (ne panovat)
      if (state.tool === 'move' && !state.dragging) {
        handleCanvasClick(wx, wy);
        // Pokud se nastavilo dragging, nepokračovat s long-press/panning
        if (state.dragging) {
          touchState.touchMoved = false;
          renderAll();
          return;
        }
      }

      // Zapamatovat start pro detekci tah vs. tap
      touchState.singleTouchStartX = touches[0].clientX;
      touchState.singleTouchStartY = touches[0].clientY;
      touchState.singleTouchStartPanX = state.panX;
      touchState.singleTouchStartPanY = state.panY;
      touchState.singlePanning = false;
      touchState.touchMoved = false;
      touchState.touchStartTime = Date.now();

      // Dvojtap na prázdné místo → obdélníkový výběr (detekce v touchstart, prst je ještě dole)
      const now = Date.now();
      const DOUBLE_TAP_MS = 400;
      const DOUBLE_TAP_DIST = 30; // px
      if (
        state.tool === 'select' && !state.drawing && !state.dragging &&
        now - touchState.lastTap < DOUBLE_TAP_MS &&
        Math.hypot(touches[0].clientX - touchState.lastTapX, touches[0].clientY - touchState.lastTapY) < DOUBLE_TAP_DIST
      ) {
        const hitObj = findObjectAt(wx, wy);
        if (hitObj === null) {
          touchState.lastTap = 0; // reset
          state._rectSelecting = true;
          state._rectStart = { x: wx, y: wy };
          showToast('Táhněte prstem pro výběr oblasti');
          renderAll();
          return; // neregistrovat long-press ani panning
        }
      }

      // Long-press timer pro precision crosshair
      if (touchState.longPressTimer) clearTimeout(touchState.longPressTimer);
      // Uložit touch coords – reference na Touch objekt může být invalidní po eventu
      const savedClientX = touches[0].clientX;
      const savedClientY = touches[0].clientY;
      touchState.longPressTimer = setTimeout(() => {
        if (
          !touchState.touchMoved &&
          !touchState.singlePanning &&
          !touchState.wasMultiTouch
        ) {
          touchState.precisionMode = true;
          try { safeVibrate(VIBRATE_LONG_PRESS); } catch (_) {}
          showPrecisionCrosshair({ clientX: savedClientX, clientY: savedClientY });
        }
      }, LONG_PRESS_MS);

      renderAll();
    }
  },
  { passive: false },
);

// ── Touch move ──
drawCanvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touches = e.touches;

    // Blokovat zoom/pan pokud je precision crosshair aktivní
    if (touchState.precisionMode) {
      if (touches.length === 1) {
        touchState.touchMoved = true;
        updatePrecisionCrosshair(touches[0]);
      }
      return;
    }

    if (touches.length === 2 && touchState.panActive) {
      // Pinch zoom
      const t1 = getTouchPos(touches[0]);
      const t2 = getTouchPos(touches[1]);
      const dist = Math.hypot(t1.sx - t2.sx, t1.sy - t2.sy);
      const factor = dist / touchState.pinchStartDist;
      const newZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, touchState.pinchStartZoom * factor),
      );

      // Zoom kolem středu pinche
      const midSX = touchState.pinchMidX;
      const midSY = touchState.pinchMidY;
      state.zoom = newZoom;
      state.panX =
        midSX -
        (midSX - touchState.panStartPX) *
          (newZoom / touchState.pinchStartZoom);
      state.panY =
        midSY -
        (midSY - touchState.panStartPY) *
          (newZoom / touchState.pinchStartZoom);

      // Dvouprstý posun
      const curMidX = (touches[0].clientX + touches[1].clientX) / 2;
      const curMidY = (touches[0].clientY + touches[1].clientY) / 2;
      state.panX += curMidX - touchState.panStartX;
      state.panY += curMidY - touchState.panStartY;
      touchState.panStartX = curMidX;
      touchState.panStartY = curMidY;

      document.getElementById("statusZoom").textContent =
        `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
      renderAll();
      return;
    }

    if (touches.length === 1) {
      const tp = getTouchPos(touches[0]);
      const moveDistPx = Math.hypot(
        touches[0].clientX - touchState.singleTouchStartX,
        touches[0].clientY - touchState.singleTouchStartY,
      );

      // Cancel long-press timer if moved before activation
      if (
        touchState.longPressTimer &&
        moveDistPx > TOUCH_MOVE_THRESHOLD
      ) {
        clearTimeout(touchState.longPressTimer);
        touchState.longPressTimer = null;
      }

      // Obdélníkový výběr – aktualizovat pozici myši pro kreslení obdélníku
      if (state._rectSelecting && state._rectStart) {
        state.mouse.sx = tp.sx;
        state.mouse.sy = tp.sy;
        let [rwx, rwy] = screenToWorld(tp.sx, tp.sy);
        state.mouse.x = rwx;
        state.mouse.y = rwy;
        touchState.touchMoved = true;
        updateMobileCoords(rwx, rwy);
        renderAll();
        return;
      }

      // Pokud můžeme panovat jedním prstem a pohyb překročí práh
      if (
        canSingleFingerPan() &&
        (touchState.singlePanning || moveDistPx > PAN_ACTIVATE_THRESHOLD)
      ) {
        touchState.singlePanning = true;
        touchState.touchMoved = true;
        state.panX =
          touchState.singleTouchStartPanX +
          (touches[0].clientX - touchState.singleTouchStartX);
        state.panY =
          touchState.singleTouchStartPanY +
          (touches[0].clientY - touchState.singleTouchStartY);
        renderAll();

        // Aktualizovat souřadnice pod prstem
        let [wx, wy] = screenToWorld(tp.sx, tp.sy);
        updateMobileCoords(wx, wy);
        return;
      }

      // Při kreslení/draggingu: aktualizovat pozici myši
      state.mouse.sx = tp.sx;
      state.mouse.sy = tp.sy;
      let [wx, wy] = screenToWorld(tp.sx, tp.sy);
      if (state.snapToPoints)
        [wx, wy] = snapPt(wx, wy);
      state.mouse.x = wx;
      state.mouse.y = wy;

      if (moveDistPx > TOUCH_MOVE_THRESHOLD) touchState.touchMoved = true;

      let extra = "";
      if (state.drawing && state.tempPoints.length > 0) {
        const ref = state.tempPoints[state.tempPoints.length - 1];
        const ddx = wx - ref.x,
          ddy = wy - ref.y;
        const dist = Math.hypot(ddx, ddy);
        const rawAng = (Math.atan2(ddy, ddx) * 180) / Math.PI;
        const ang = (state.nullPointActive && state.nullPointAngle !== 0)
          ? rawAng - state.nullPointAngle : rawAng;
        extra = `  d=${dist.toFixed(1)} ∠${ang.toFixed(1)}°`;
      }
      updateMobileCoords(wx, wy, extra);

      // Přetahování objektu
      if (state.dragging && state.dragObjIdx !== null) {
        const dx = wx - state.dragStartWorld.x;
        const dy = wy - state.dragStartWorld.y;
        if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
          for (const { idx, snapshot } of state._multiDragSnapshots) {
            const obj = state.objects[idx];
            if (obj) Object.assign(obj, JSON.parse(snapshot));
          }
          for (const { idx } of state._multiDragSnapshots) {
            const obj = state.objects[idx];
            if (!obj) continue;
            if (!obj.isDimension && !obj.isCoordLabel) {
              moveObject(obj, dx, dy);
            } else if (!obj.sourceObjId) {
              if (obj.type === 'point') { obj.x += dx; obj.y += dy; }
              else if (obj.type === 'line') {
                obj.x1 += dx; obj.y1 += dy;
                obj.x2 += dx; obj.y2 += dy;
                if (obj.dimSrcX1 != null) { obj.dimSrcX1 += dx; obj.dimSrcY1 += dy; }
                if (obj.dimSrcX2 != null) { obj.dimSrcX2 += dx; obj.dimSrcY2 += dy; }
                if (obj.dimCenterX != null) { obj.dimCenterX += dx; obj.dimCenterY += dy; }
              }
            }
          }
          updateAssociativeDimensions();
        } else if (state.objects[state.dragObjIdx]) {
          const obj = state.objects[state.dragObjIdx];
          if (state.dragObjSnapshot) {
            const snapShot = JSON.parse(state.dragObjSnapshot);
            // Smazat vlastnosti, které nejsou ve snapshotu (např. pathStart přidaný moveObject)
            for (const k of Object.keys(obj)) {
              if (!(k in snapShot)) delete obj[k];
            }
            Object.assign(obj, snapShot);
          }
          moveObject(obj, dx, dy);
        }
      }

      renderAll();
    }
  },
  { passive: false },
);

// ── Touch end ──
drawCanvas.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();

    // Clear long-press timer
    if (touchState.longPressTimer) {
      clearTimeout(touchState.longPressTimer);
      touchState.longPressTimer = null;
    }

    // Po pinch zoomu (2→1 prst nebo 2→0): neskákat, resetovat stav
    if (touchState.wasMultiTouch) {
      if (e.touches.length === 1) {
        // Zbyl jeden prst – přenastavit referenci aby nedošlo ke skoku
        touchState.singleTouchStartX = e.touches[0].clientX;
        touchState.singleTouchStartY = e.touches[0].clientY;
        touchState.singleTouchStartPanX = state.panX;
        touchState.singleTouchStartPanY = state.panY;
        touchState.singlePanning = false;
        touchState.touchMoved = true; // zabránit kliknutí
        touchState.panActive = false;
        return;
      }
      if (e.touches.length === 0) {
        touchState.panActive = false;
        touchState.wasMultiTouch = false;
        touchState.singlePanning = false;
        touchState.touchMoved = false;
        hidePrecisionCrosshair();
        return;
      }
    }

    if (e.touches.length === 0 && touchState.panActive) {
      touchState.panActive = false;
      hidePrecisionCrosshair();
      return;
    }

    // Precision crosshair – register click at crosshair position
    if (touchState.precisionMode && e.changedTouches.length === 1) {
      const wx = state.mouse.x;
      const wy = state.mouse.y;
      hidePrecisionCrosshair();
      handleCanvasClick(wx, wy);
      updateMobileCoords(wx, wy);
      touchState.touchMoved = false;
      touchState.singlePanning = false;
      if (e.touches.length === 0) touchState.wasMultiTouch = false;
      return;
    }

    // Dokončit obdélníkový výběr (touch)
    if (state._rectSelecting && state._rectStart && e.touches.length === 0) {
      if (e.changedTouches.length === 1) {
        const tp = getTouchPos(e.changedTouches[0]);
        let [rwx, rwy] = screenToWorld(tp.sx, tp.sy);
        state.mouse.x = rwx;
        state.mouse.y = rwy;
      }
      finishRectSelection();
      renderAll();
      touchState.touchMoved = false;
      touchState.singlePanning = false;
      touchState.wasMultiTouch = false;
      return;
    }

    // Pokud jsme panovali jedním prstem, nedělat klik
    if (touchState.singlePanning) {
      touchState.singlePanning = false;
      if (e.touches.length === 0) {
        touchState.wasMultiTouch = false;
      }
      return;
    }

    // Move tool: dokončit drag po tažení prstem (place object)
    if (state.tool === 'move' && state.dragging && touchState.touchMoved) {
      const tp = getTouchPos(e.changedTouches[0]);
      let [wx, wy] = screenToWorld(tp.sx, tp.sy);
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
      handleCanvasClick(wx, wy);
      touchState.touchMoved = false;
      touchState.singlePanning = false;
      if (e.touches.length === 0) touchState.wasMultiTouch = false;
      renderAll();
      return;
    }

    // Jednoprstový tap = klik (jen pokud nebylo panning dvěma prsty a nepohybovali jsme se)
    if (
      e.changedTouches.length === 1 &&
      !touchState.panActive &&
      !touchState.wasMultiTouch &&
      !touchState.touchMoved
    ) {
      const tp = getTouchPos(e.changedTouches[0]);
      state.mouse.sx = tp.sx;
      state.mouse.sy = tp.sy;
      let [wx, wy] = screenToWorld(tp.sx, tp.sy);
      if (state.snapToPoints)
        [wx, wy] = snapPt(wx, wy);
      state.mouse.x = wx;
      state.mouse.y = wy;

      // Zapamatovat tap pro detekci double-tap (samotná detekce je v touchstart)
      const now = Date.now();
      touchState.lastTap = now;
      touchState.lastTapX = e.changedTouches[0].clientX;
      touchState.lastTapY = e.changedTouches[0].clientY;

      // Simulovat mousedown logiku
      handleCanvasClick(wx, wy);
      updateMobileCoords(wx, wy);
    }

    if (e.touches.length < 2) {
      touchState.panActive = false;
    }
    if (e.touches.length === 0) {
      touchState.wasMultiTouch = false;
      touchState.singlePanning = false;
      touchState.touchMoved = false;
    }
  },
  { passive: false },
);

// Prevent default touch on body to avoid scroll/zoom
document.body.addEventListener(
  "touchmove",
  (e) => {
    if (e.target.closest("#canvasWrap")) {
      e.preventDefault();
    }
  },
  { passive: false },
);

// ── Profile Trace: Dokončit / Radius tlačítka ──
const traceConfirmBtn = document.getElementById("traceConfirm");
const traceRadiusBtn = document.getElementById("traceRadius");

/** Aktualizuje viditelnost tlačítek Dokončit/Radius pro trasování. */
export function updateTraceButtons() {
  const show = state.drawing && state.tool === 'profileTrace' && state.tempPoints.length >= 2;
  traceConfirmBtn.style.display = show ? 'flex' : 'none';
  traceRadiusBtn.style.display = show ? 'flex' : 'none';
}

traceConfirmBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!state.drawing || state.tool !== 'profileTrace') return;
  finishProfileTrace();
  updateTraceButtons();
});

traceRadiusBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const data = getTraceData();
  if (data.points.length < 2) return;
  const idx = data.points.length - 2;
  const p1 = data.points[idx];
  const p2 = data.points[idx + 1];
  showBulgeDialog(p1, p2, data.bulges[idx] || 0, (newBulge) => {
    setTraceBulge(idx, newBulge);
  });
});

// ── Bridge registrace pro cyklické závislosti ──
bridge.updateMobileCancelBtn = updateMobileCancelBtn;
bridge.updateMobileCoords = updateMobileCoords;
bridge.updatePolylineButtons = updatePolylineButtons;
bridge.updateTraceButtons = updateTraceButtons;

// ── Sidebar Precision Pointer (long-press pro přesné klikání v panelu) ──
{
  const spEl = document.getElementById("sidebarPrecisionPointer");
  const SIDEBAR_OFFSET_Y = -60; // pointer se ukáže NAD prstem
  let spTimer = null;
  let spActive = false;
  let spStartX = 0, spStartY = 0;
  let spHighlighted = null;

  function showSidebarPointer(clientX, clientY) {
    const pointerX = clientX;
    const pointerY = clientY + SIDEBAR_OFFSET_Y;
    spEl.style.left = pointerX + "px";
    spEl.style.top = pointerY + "px";
    spEl.style.display = "block";
    highlightElementAt(pointerX, pointerY);
  }

  function updateSidebarPointer(clientX, clientY) {
    const pointerX = clientX;
    const pointerY = clientY + SIDEBAR_OFFSET_Y;
    spEl.style.left = pointerX + "px";
    spEl.style.top = pointerY + "px";
    highlightElementAt(pointerX, pointerY);
  }

  const spLabel = spEl.querySelector(".sp-label");

  function highlightElementAt(x, y) {
    // Zrušit předchozí highlight
    if (spHighlighted) {
      spHighlighted.style.outline = "";
      spHighlighted.style.outlineOffset = "";
      spHighlighted = null;
    }
    spLabel.style.display = "none";
    // Najít element pod pointerem (skrýt pointer, aby nebyl v cestě)
    spEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    spEl.style.display = "block";
    if (el && sidebar.contains(el)) {
      const clickable = el.closest("button, input[type=checkbox], input[type=radio], a, label, li, select");
      if (clickable) {
        clickable.style.outline = "2px solid #f9e2af";
        clickable.style.outlineOffset = "1px";
        spHighlighted = clickable;
        // Zobrazit tooltip z title nebo aria-label
        const tip = clickable.getAttribute("title") || clickable.getAttribute("aria-label");
        if (tip) {
          spLabel.textContent = tip;
          spLabel.style.left = "14px";
          spLabel.style.right = "auto";
          spLabel.style.display = "block";
          // Pokud přetéká přes pravý okraj, přepnout na levou stranu
          const rect = spLabel.getBoundingClientRect();
          if (rect.right > window.innerWidth - 4) {
            spLabel.style.left = "auto";
            spLabel.style.right = "14px";
          }
        }
      }
    }
  }

  function hideSidebarPointer() {
    spEl.style.display = "none";
    spActive = false;
    if (spHighlighted) {
      spHighlighted.style.outline = "";
      spHighlighted.style.outlineOffset = "";
      spHighlighted = null;
    }
    if (spTimer) { clearTimeout(spTimer); spTimer = null; }
  }

  function clickElementAt(x, y) {
    spEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    spEl.style.display = "block";
    if (el && sidebar.contains(el)) {
      const clickable = el.closest("button, input[type=checkbox], input[type=radio], a, label, li");
      if (clickable) {
        if (clickable.tagName === "INPUT" && (clickable.type === "checkbox" || clickable.type === "radio")) {
          clickable.click();
        } else {
          clickable.click();
        }
      }
    }
  }

  sidebar.addEventListener("touchstart", (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    // Ignorovat pokud dotyk je na input polích kde se píše
    if (e.target.tagName === "INPUT" && e.target.type !== "checkbox" && e.target.type !== "radio") return;
    if (e.target.tagName === "SELECT") return;
    spStartX = t.clientX;
    spStartY = t.clientY;
    spActive = false;
    if (spTimer) clearTimeout(spTimer);
    spTimer = setTimeout(() => {
      spActive = true;
      try { safeVibrate(VIBRATE_LONG_PRESS); } catch (_) {}
      showSidebarPointer(t.clientX, t.clientY);
      e.preventDefault();
    }, LONG_PRESS_MS);
  }, { passive: false });

  sidebar.addEventListener("touchmove", (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dist = Math.hypot(t.clientX - spStartX, t.clientY - spStartY);
    if (!spActive && dist > TOUCH_MOVE_THRESHOLD) {
      if (spTimer) { clearTimeout(spTimer); spTimer = null; }
      return;
    }
    if (spActive) {
      e.preventDefault();
      updateSidebarPointer(t.clientX, t.clientY);
    }
  }, { passive: false });

  sidebar.addEventListener("touchend", (e) => {
    if (spTimer) { clearTimeout(spTimer); spTimer = null; }
    if (spActive) {
      e.preventDefault();
      const pointerX = (e.changedTouches[0]?.clientX || spStartX);
      const pointerY = (e.changedTouches[0]?.clientY || spStartY) + SIDEBAR_OFFSET_Y;
      clickElementAt(pointerX, pointerY);
      hideSidebarPointer();
    }
    spActive = false;
  }, { passive: false });

  sidebar.addEventListener("touchcancel", () => {
    hideSidebarPointer();
  });
}

// ── Topbar Precision Pointer (long-press pro přesné klikání v toolbaru) ──
{
  const tpEl = document.getElementById("topbarPrecisionPointer");
  const TOPBAR_OFFSET_Y = -60; // vizuální indikátor NAD prstem
  let tpTimer = null;
  let tpActive = false;
  let tpStartX = 0, tpStartY = 0;
  let tpHighlighted = null;
  const tpLabel = tpEl.querySelector(".sp-label");

  // Potlačit kontextové menu při long-press na toolbaru
  topbar.addEventListener("contextmenu", (e) => {
    if (tpActive) e.preventDefault();
  });

  function showTopbarPointer(clientX, clientY) {
    const px = clientX, py = clientY + TOPBAR_OFFSET_Y;
    tpEl.style.left = px + "px";
    tpEl.style.top = py + "px";
    tpEl.style.display = "block";
    highlightTopbarAt(px, py);
  }

  function updateTopbarPointer(clientX, clientY) {
    const px = clientX, py = clientY + TOPBAR_OFFSET_Y;
    tpEl.style.left = px + "px";
    tpEl.style.top = py + "px";
    highlightTopbarAt(px, py);
  }

  function highlightTopbarAt(x, y) {
    if (tpHighlighted) {
      tpHighlighted.style.outline = "";
      tpHighlighted.style.outlineOffset = "";
      tpHighlighted = null;
    }
    tpLabel.style.display = "none";
    tpEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    tpEl.style.display = "block";
    if (el && topbar.contains(el)) {
      const clickable = el.closest("button, a, label");
      if (clickable) {
        clickable.style.outline = "2px solid #f9e2af";
        clickable.style.outlineOffset = "1px";
        tpHighlighted = clickable;
        const tip = clickable.getAttribute("title") || clickable.getAttribute("aria-label");
        if (tip) {
          tpLabel.textContent = tip;
          tpLabel.style.left = "14px";
          tpLabel.style.right = "auto";
          tpLabel.style.display = "block";
          const rect = tpLabel.getBoundingClientRect();
          if (rect.right > window.innerWidth - 4) {
            tpLabel.style.left = "auto";
            tpLabel.style.right = "14px";
          }
        }
      }
    }
  }

  function hideTopbarPointer() {
    tpEl.style.display = "none";
    tpActive = false;
    if (tpHighlighted) {
      tpHighlighted.style.outline = "";
      tpHighlighted.style.outlineOffset = "";
      tpHighlighted = null;
    }
    if (tpTimer) { clearTimeout(tpTimer); tpTimer = null; }
  }

  function clickTopbarAt(x, y) {
    tpEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    tpEl.style.display = "block";
    if (el && topbar.contains(el)) {
      const clickable = el.closest("button, a, label");
      if (clickable) clickable.click();
    }
  }

  topbar.addEventListener("touchstart", (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    tpStartX = t.clientX;
    tpStartY = t.clientY;
    tpActive = false;
    if (tpTimer) clearTimeout(tpTimer);
    tpTimer = setTimeout(() => {
      tpActive = true;
      try { safeVibrate(VIBRATE_LONG_PRESS); } catch (_) {}
      showTopbarPointer(t.clientX, t.clientY);
    }, LONG_PRESS_MS);
  }, { passive: false });

  topbar.addEventListener("touchmove", (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dist = Math.hypot(t.clientX - tpStartX, t.clientY - tpStartY);
    if (!tpActive && dist > TOUCH_MOVE_THRESHOLD) {
      if (tpTimer) { clearTimeout(tpTimer); tpTimer = null; }
      return;
    }
    if (tpActive) {
      e.preventDefault();
      updateTopbarPointer(t.clientX, t.clientY);
    }
  }, { passive: false });

  topbar.addEventListener("touchend", (e) => {
    if (tpTimer) { clearTimeout(tpTimer); tpTimer = null; }
    if (tpActive) {
      e.preventDefault();
      // Klik na pozici kolečka (s offsetem)
      const px = (e.changedTouches[0]?.clientX || tpStartX);
      const py = (e.changedTouches[0]?.clientY || tpStartY) + TOPBAR_OFFSET_Y;
      clickTopbarAt(px, py);
      hideTopbarPointer();
    }
    tpActive = false;
  }, { passive: false });

  topbar.addEventListener("touchcancel", () => {
    hideTopbarPointer();
  });
}

// ── Overlay Precision Pointer (long-press v dialozích .calc-overlay / .input-overlay) ──
{
  const opEl = document.getElementById("overlayPrecisionPointer");
  const OVERLAY_OFFSET_Y = -60;
  let opTimer = null;
  let opActive = false;
  let opStartX = 0, opStartY = 0;
  let opHighlighted = null;
  let opContainer = null; // aktuální overlay kontejner
  const opLabel = opEl.querySelector(".sp-label");

  function getOverlayContainer(el) {
    return el && el.closest(".calc-overlay, .input-overlay");
  }

  function showOverlayPointer(clientX, clientY) {
    const px = clientX, py = clientY + OVERLAY_OFFSET_Y;
    opEl.style.left = px + "px";
    opEl.style.top = py + "px";
    opEl.style.display = "block";
    highlightOverlayAt(px, py);
  }

  function updateOverlayPointer(clientX, clientY) {
    const px = clientX, py = clientY + OVERLAY_OFFSET_Y;
    opEl.style.left = px + "px";
    opEl.style.top = py + "px";
    highlightOverlayAt(px, py);
  }

  function highlightOverlayAt(x, y) {
    if (opHighlighted) {
      opHighlighted.style.outline = "";
      opHighlighted.style.outlineOffset = "";
      opHighlighted = null;
    }
    opLabel.style.display = "none";
    opEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    opEl.style.display = "block";
    if (el && opContainer && opContainer.contains(el)) {
      const clickable = el.closest("button, input[type=checkbox], input[type=radio], a, label, li, select, .mc-row, .mc-card");
      if (clickable) {
        clickable.style.outline = "2px solid #f9e2af";
        clickable.style.outlineOffset = "1px";
        opHighlighted = clickable;
        const tip = clickable.getAttribute("title") || clickable.getAttribute("aria-label");
        if (tip) {
          opLabel.textContent = tip;
          opLabel.style.left = "14px";
          opLabel.style.right = "auto";
          opLabel.style.display = "block";
          const rect = opLabel.getBoundingClientRect();
          if (rect.right > window.innerWidth - 4) {
            opLabel.style.left = "auto";
            opLabel.style.right = "14px";
          }
        }
      }
    }
  }

  function hideOverlayPointer() {
    opEl.style.display = "none";
    opActive = false;
    opContainer = null;
    if (opHighlighted) {
      opHighlighted.style.outline = "";
      opHighlighted.style.outlineOffset = "";
      opHighlighted = null;
    }
    if (opTimer) { clearTimeout(opTimer); opTimer = null; }
  }

  function clickOverlayAt(x, y) {
    opEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    opEl.style.display = "block";
    if (el && opContainer && opContainer.contains(el)) {
      const clickable = el.closest("button, input[type=checkbox], input[type=radio], a, label, li");
      if (clickable) clickable.click();
    }
  }

  // Delegovaný listener na document – zachytí touch na jakémkoli overlay
  document.addEventListener("touchstart", (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    const container = getOverlayContainer(e.target);
    if (!container) return;
    const t = e.touches[0];
    if (e.target.tagName === "INPUT" && e.target.type !== "checkbox" && e.target.type !== "radio") return;
    if (e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    opStartX = t.clientX;
    opStartY = t.clientY;
    opActive = false;
    opContainer = container;
    if (opTimer) clearTimeout(opTimer);
    opTimer = setTimeout(() => {
      opActive = true;
      try { safeVibrate(VIBRATE_LONG_PRESS); } catch (_) {}
      showOverlayPointer(t.clientX, t.clientY);
    }, LONG_PRESS_MS);
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    if (!opActive && !opTimer) return;
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dist = Math.hypot(t.clientX - opStartX, t.clientY - opStartY);
    if (!opActive && dist > TOUCH_MOVE_THRESHOLD) {
      if (opTimer) { clearTimeout(opTimer); opTimer = null; }
      return;
    }
    if (opActive) {
      e.preventDefault();
      updateOverlayPointer(t.clientX, t.clientY);
    }
  }, { passive: false });

  document.addEventListener("touchend", (e) => {
    if (!opActive && !opTimer) return;
    if (opTimer) { clearTimeout(opTimer); opTimer = null; }
    if (opActive) {
      e.preventDefault();
      const px = (e.changedTouches[0]?.clientX || opStartX);
      const py = (e.changedTouches[0]?.clientY || opStartY) + OVERLAY_OFFSET_Y;
      clickOverlayAt(px, py);
      hideOverlayPointer();
    }
    opActive = false;
  }, { passive: false });

  document.addEventListener("touchcancel", () => {
    if (opActive || opTimer) hideOverlayPointer();
  });
}

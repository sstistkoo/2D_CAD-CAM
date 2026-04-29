// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Myš, klávesnice, kolečko                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { ZOOM_FACTOR, ZOOM_MIN, ZOOM_MAX, PASTE_OFFSET } from './constants.js';
import { drawCanvas, screenToWorld, snapPt, applyAngleSnap } from './canvas.js';
import { state, pushUndo, undo, redo, showToast, resetDrawingState, fmtStatusCoords } from './state.js';
import { renderAll, getObjectBounds, boundsOverlap } from './render.js';
import { moveObject, addObject, addPolylineAsSegments } from './objects.js';
import { setTool, resetHint, setHint, updateProperties, updateObjectList, updateSnapPtsBtn, updateDimsBtn, toggleCoordMode, updateCoordModeBtn, updateSnapGridBtn, updateAngleSnapBtn, showGridSizeDialog, showAngleSnapDialog, toggleHelp, updateNullPointUI } from './ui.js';
import { findObjectAt, selectObjectAt, calculateAllIntersections, mirrorObject, linearArray, circularArray, rotateObject, findSegmentAt, findConstraintAt } from './geometry.js';
import { showNumericalInputDialog, showPolarDrawingDialog, showCircleRadiusDialog, showBulgeDialog, showMirrorDialog, showLinearArrayDialog, showCircularArrayDialog, showRotateDialog } from './dialogs.js';
import { saveProject, showExportImageDialog, showProjectsDialog, showSaveAsDialog } from './storage.js';
import { autoDetectFeatures } from './dialogs/autoDetect.js';
import { bulgeToArc, deepClone } from './utils.js';
import { bridge } from './bridge.js';
import { updateAssociativeDimensions } from './dialogs/dimension.js';
import { handleTangentClick, tangentFromSelection, handleOffsetClick, offsetFromSelection, handleTrimClick, trimFromSelection, handleExtendClick, extendFromSelection, handleFilletClick, filletFromSelection, handleChamferClick, chamferFromSelection, handlePerpClick, perpFromSelection, handleHorizontalClick, horizontalFromSelection, handleParallelClick, parallelFromSelection, handleDimensionClick, dimensionFromSelection, handleSnapPointClick, handleMoveClick, handleLineClick, handleMeasureClick, handleCircleClick, handleArcClick, handleRectClick, handlePolylineClick, measureSelection, handleTextClick, handleGearClick, resetGearState, handleAnchorClick, removeAnchorsForObject, removeAnchorAt, hasAnchoredPoint, cleanupOrphanAnchors, handleBreakClick, handleCenterMarkClick, centerMarkFromSelection, handleScaleClick, scaleFromSelection, handleFilletChamferClick, filletChamferFromSelection, handleBooleanClick, resetBooleanState, handleCircularArrayClick, handleCopyPlaceClick, copyPlaceFromSelection, resetCopyPlaceState, handleProfileTraceClick, finishProfileTrace, cancelProfileTrace, resetProfileTraceState, setTraceBulge, getTraceData, handleChainDimensionClick, finishChainDimension, resetChainDimensionState } from './tools/index.js';
import { getLineSegment } from './tools/helpers.js';
import { showPostDrawPointDialog } from './dialogs/postDrawDialog.js';

// Registrace measureSelection na bridge (aby ui.js nemusel importovat přímo – kruhová závislost)
bridge.measureSelection = measureSelection;
bridge.dimensionFromSelection = dimensionFromSelection;
bridge.tangentFromSelection = tangentFromSelection;
bridge.offsetFromSelection = offsetFromSelection;
bridge.trimFromSelection = trimFromSelection;
bridge.extendFromSelection = extendFromSelection;
bridge.filletFromSelection = filletFromSelection;
bridge.chamferFromSelection = chamferFromSelection;
bridge.perpFromSelection = () => {
  const indices = _getMultiIndices();
  if (indices.length > 1) { perpMultiAlign(indices); return true; }
  return perpFromSelection();
};
bridge.horizontalFromSelection = () => {
  const indices = _getMultiIndices();
  if (indices.length > 1) { horizontalMultiAlign(indices); return true; }
  return horizontalFromSelection();
};
bridge.parallelFromSelection = () => {
  const indices = _getMultiIndices();
  if (indices.length > 1) { parallelMultiAlign(indices); return true; }
  return parallelFromSelection();
};
bridge.centerMarkFromSelection = centerMarkFromSelection;
bridge.scaleFromSelection = scaleFromSelection;
bridge.filletChamferFromSelection = filletChamferFromSelection;
bridge.mirrorFromSelection = () => {
  if (state.selected === null && state.multiSelected.size === 0) return false;
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : state.selected !== null ? [state.selected] : [];
  if (indices.length === 0) return false;

  // Najdi konstrukční čáru ve výběru → osa zrcadlení
  const constrIdx = indices.find(i => state.objects[i] && state.objects[i].type === 'constr');
  if (constrIdx !== undefined) {
    const axis = state.objects[constrIdx];
    const p1 = { x: axis.x1, y: axis.y1 };
    const p2 = { x: axis.x2, y: axis.y2 };
    const toMirror = indices.filter(i => i !== constrIdx).map(i => state.objects[i]);
    if (toMirror.length === 0) { showToast("Vyberte objekty k zrcadlení (kromě konstr. čáry)"); return true; }
    pushUndo();
    for (const o of toMirror) {
      const copy = mirrorObject(o, 'custom', p1, p2);
      addObject(copy);
    }
    calculateAllIntersections();
    renderAll();
    showToast(`${toMirror.length > 1 ? toMirror.length + ' objektů zrcadleno' : 'Objekt zrcadlen'} ✓`);
    return true;
  }

  // Bez konstr. čáry → klasický dialog
  startMirrorAction();
  return true;
};

bridge.rotateFromSelection = () => {
  if (state.selected === null && state.multiSelected.size === 0) {
    showToast("Nejdříve vyberte objekt");
    return true;
  }
  startRotateAction();
  return true;
};

bridge.linearArrayFromSelection = () => {
  if (state.selected === null && state.multiSelected.size === 0) {
    showToast("Nejdříve vyberte objekt");
    return true;
  }
  startLinearArrayAction();
  return true;
};

bridge.circularArrayFromSelection = () => {
  if (state.selected === null && state.multiSelected.size === 0) {
    showToast("Nejdříve vyberte objekt");
    return true;
  }
  startCircularArrayAction();
  return true;
};

bridge.copyPlaceFromSelection = () => {
  if (state.selected === null && state.multiSelected.size === 0) {
    showToast("Vyberte objekty ke kopírování");
    return true;
  }
  copyPlaceFromSelection();
  return true;
};

bridge.finishProfileTrace = finishProfileTrace;
bridge.finishChainDimension = finishChainDimension;
bridge.autoDetectFeatures = autoDetectFeatures;

let isPanning = false;
let panStartX, panStartY, panStartPX, panStartPY;
const _cursorCoordsEl = document.getElementById("cursorCoords");

// ── Pohyb myší ──
drawCanvas.addEventListener("mousemove", (e) => {
  const rect = drawCanvas.getBoundingClientRect();
  state.mouse.sx = e.clientX - rect.left;
  state.mouse.sy = e.clientY - rect.top;
  let [rawWx, rawWy] = screenToWorld(state.mouse.sx, state.mouse.sy);
  state.mouse.rawX = rawWx;
  state.mouse.rawY = rawWy;
  let [wx, wy] = [rawWx, rawWy];
  if (state.snapToPoints) [wx, wy] = snapPt(rawWx, rawWy);

  // Angle snap – jen při kreslení, a jen pokud object snap nezachytil bod
  if (state.angleSnap && state.drawing && state.tempPoints.length > 0
      && ['line', 'constr', 'polyline', 'measure', 'dimension', 'chainDimension'].includes(state.tool)) {
    if (state.mouse.snapType !== 'point') {
      const ref = state.tempPoints[state.tempPoints.length - 1];
      [wx, wy] = applyAngleSnap(wx, wy, ref);
    }
  }

  // Angle snap – copyPlace (referenční bod jako pivot)
  if (state.angleSnap && state.tool === 'copyPlace' && state._copyPlaceRef
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state._copyPlaceRef);
  }

  // Angle snap – move (dragStartWorld jako pivot)
  if (state.angleSnap && state.tool === 'move' && state.dragging && state.dragStartWorld
      && state.mouse.snapType !== 'point') {
    [wx, wy] = applyAngleSnap(wx, wy, state.dragStartWorld);
  }

  state.mouse.x = wx;
  state.mouse.y = wy;

  // Polar info z referenčního bodu
  let extra = "";
  if (state.drawing && state.tempPoints.length > 0) {
    const ref = state.tempPoints[state.tempPoints.length - 1];
    const ddx = wx - ref.x,
      ddy = wy - ref.y;
    const dist = Math.hypot(ddx, ddy);
    const rawAng = (Math.atan2(ddy, ddx) * 180) / Math.PI;
    const ang = (state.nullPointActive && state.nullPointAngle !== 0)
      ? rawAng - state.nullPointAngle : rawAng;
    extra = `   |   d=${dist.toFixed(2)}  ∠=${ang.toFixed(1)}°`;
  }

  if (bridge.updateMobileCoords) {
    bridge.updateMobileCoords(wx, wy, extra);
  } else {
    document.getElementById("coordDisplay").textContent = fmtStatusCoords(wx, wy, extra);
  }

  // Floating souřadnice u kurzoru (desktop)
  if (_cursorCoordsEl && window.innerWidth > 900) {
    _cursorCoordsEl.style.display = "block";
    _cursorCoordsEl.style.left = e.clientX + "px";
    _cursorCoordsEl.style.top = e.clientY + "px";
    _cursorCoordsEl.textContent = fmtStatusCoords(wx, wy, extra);
  }

  if (isPanning) {
    state.panX = panStartPX + (e.clientX - panStartX);
    state.panY = panStartPY + (e.clientY - panStartY);
  }

  // Přetahování objektu
  if (state.dragging && state.dragObjIdx !== null) {
    const dx = wx - state.dragStartWorld.x;
    const dy = wy - state.dragStartWorld.y;
    try {
      if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
        // Multi-drag: nejprve obnovit vše ze snapshot
        for (const { idx, snapshot } of state._multiDragSnapshots) {
          const obj = state.objects[idx];
          if (obj) Object.assign(obj, JSON.parse(snapshot));
        }
        // Přesunout ne-kótové objekty + nenavázané kóty (bez sourceObjId)
        for (const { idx } of state._multiDragSnapshots) {
          const obj = state.objects[idx];
          if (!obj) continue;
          if (!obj.isDimension && !obj.isCoordLabel) {
            // Běžný objekt → moveObject (aktualizuje i asociativní kóty)
            moveObject(obj, dx, dy);
          } else if (!obj.sourceObjId) {
            // Nenavázaná kóta → přesunout přímo (bez asociativní aktualizace)
            if (obj.type === 'point') { obj.x += dx; obj.y += dy; }
            else if (obj.type === 'line') {
              obj.x1 += dx; obj.y1 += dy;
              obj.x2 += dx; obj.y2 += dy;
              if (obj.dimSrcX1 != null) { obj.dimSrcX1 += dx; obj.dimSrcY1 += dy; }
              if (obj.dimSrcX2 != null) { obj.dimSrcX2 += dx; obj.dimSrcY2 += dy; }
              if (obj.dimCenterX != null) { obj.dimCenterX += dx; obj.dimCenterY += dy; }
            }
          }
          // Asociativní kóty (s sourceObjId) se aktualizují přes updateAssociativeDimensions
        }
        // Finální aktualizace asociativních kót
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
    } catch (e) {
      console.warn('Chyba při přetahování:', e);
      state.dragging = false;
      state.dragObjIdx = null;
    }
  }

  renderAll();
});

// ── Skrýt floating souřadnice při opuštění canvasu ──
drawCanvas.addEventListener("mouseleave", () => {
  if (_cursorCoordsEl) _cursorCoordsEl.style.display = "none";
});

// ── Klik myší ──
drawCanvas.addEventListener("mousedown", (e) => {
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPX = state.panX;
    panStartPY = state.panY;
    drawCanvas.style.cursor = "grabbing";
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;

  // Obdélníkový výběr: začít tažení z prázdného místa v select režimu
  if (state.tool === "select" && !state.drawing && !state.dragging) {
    const hitObj = findObjectAt(state.mouse.x, state.mouse.y);
    if (hitObj === null) {
      state._rectSelecting = true;
      state._rectStart = { x: state.mouse.x, y: state.mouse.y };
      return;
    }
  }

  // V deleteObj režimu použít raw (nesnapnuté) souřadnice,
  // aby snap nepřesouval bod k jinému objektu
  if (state.tool === 'deleteObj') {
    handleCanvasClick(state.mouse.rawX, state.mouse.rawY);
  } else {
    handleCanvasClick(state.mouse.x, state.mouse.y);
  }
});

drawCanvas.addEventListener("mouseup", (e) => {
  // Dokončit obdélníkový výběr
  if (state._rectSelecting && state._rectStart) {
    finishRectSelection();
    renderAll();
    return;
  }
  if (isPanning) {
    isPanning = false;
    drawCanvas.style.cursor = "crosshair";
  }
});

// ── Zoom kolečkem ──
drawCanvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const rect = drawCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    state.panX = mx - (mx - state.panX) * factor;
    state.panY = my - (my - state.panY) * factor;
    state.zoom *= factor;
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom));
    document.getElementById("statusZoom").textContent =
      `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
    renderAll();
  },
  { passive: false },
);

// ── Klávesnice ──
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Close topmost dialog overlay if open (highest z-index first)
    const allOverlays = document.querySelectorAll('.input-overlay, .calc-overlay');
    if (allOverlays.length) {
      let topOverlay = allOverlays[0];
      let topZ = parseInt(getComputedStyle(topOverlay).zIndex) || 0;
      allOverlays.forEach(o => {
        const z = parseInt(getComputedStyle(o).zIndex) || 0;
        if (z > topZ) { topOverlay = o; topZ = z; }
      });
      topOverlay.remove();
      return;
    }
    // Close help overlay if open
    const helpOverlay = document.getElementById('helpOverlay');
    if (helpOverlay && helpOverlay.classList.contains('visible')) {
      helpOverlay.classList.remove('visible');
      return;
    }
    // Exit segment editing mode first
    if (state.selectedSegment !== null || state.multiSelectedSegments.size > 0) {
      state.selectedSegment = null;
      state._selectedSegmentObjIdx = null;
      state.multiSelectedSegments.clear();
      updateProperties();
      renderAll();
      return;
    }
    // Cancel rectangle selection
    if (state._rectSelecting) {
      state._rectSelecting = false;
      state._rectStart = null;
      renderAll();
      return;
    }
    if (state.dragging) {
      if (state.dragObjIdx === -1 && state._multiDragSnapshots) {
        // Revert multi-drag
        try {
          for (const { idx, snapshot } of state._multiDragSnapshots) {
            const obj = state.objects[idx];
            if (obj) Object.assign(obj, JSON.parse(snapshot));
          }
        } catch (e) { console.warn('Revert multi-drag selhal:', e); }
        state._multiDragSnapshots = null;
      } else {
        const obj = state.objects[state.dragObjIdx];
        if (obj && state.dragObjSnapshot) {
          try { Object.assign(obj, JSON.parse(state.dragObjSnapshot)); } catch (e) { console.warn('Revert drag selhal:', e); }
        }
      }
      state.dragging = false;
      state.dragObjIdx = null;
      drawCanvas.style.cursor = "crosshair";
    }
    resetDrawingState();
    resetGearState();
    resetBooleanState();
    resetCopyPlaceState();
    resetProfileTraceState();
    resetChainDimensionState();
    // Odstranit dočasný měřicí bod
    const mTempIdx = state.objects.findIndex(o => o.isMeasureTemp);
    if (mTempIdx !== -1) state.objects.splice(mTempIdx, 1);
    state.selected = null;
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
    state.multiSelected.clear();
    state.multiSelectedSegments.clear();
    state.selectedPoint = null;
    // Escape z deleteObj/copyPlace módu → zpět na select
    if (state.tool === 'deleteObj' || state.tool === 'copyPlace') setTool('select');
    updateProperties();
    renderAll();
    resetHint();
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "y") {
    e.preventDefault();
    redo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
    e.preventDefault();
    showSaveAsDialog();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveProject();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "p") {
    e.preventDefault();
    showProjectsDialog();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "c") {
    if (state.multiSelected.size > 0) {
      state.clipboard = [...state.multiSelected].map(i => deepClone(state.objects[i]));
      showToast(`${state.multiSelected.size} objektů zkopírováno`);
    } else if (state.selected !== null) {
      state.clipboard = deepClone(state.objects[state.selected]);
      showToast("Objekt zkopírován");
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "v") {
    if (state.clipboard) {
      if (Array.isArray(state.clipboard)) {
        pushUndo();
        state.multiSelected.clear();
        for (const orig of state.clipboard) {
          const copy = deepClone(orig);
          copy.id = state.nextId;
          copy.name = (copy.name || copy.type) + " (kopie)";
          moveObject(copy, PASTE_OFFSET, PASTE_OFFSET);
          addObject(copy);
          state.multiSelected.add(state.objects.length - 1);
        }
        state.selected = state.objects.length - 1;
        updateObjectList();
        updateProperties();
        showToast(`${state.clipboard.length} objektů vloženo`);
      } else {
        const copy = deepClone(state.clipboard);
        copy.id = state.nextId;
        copy.name = (copy.name || copy.type) + " (kopie)";
        moveObject(copy, PASTE_OFFSET, PASTE_OFFSET);
        addObject(copy);
        state.selected = state.objects.length - 1;
        state.multiSelected.clear();
        updateObjectList();
        updateProperties();
        showToast("Objekt vložen");
      }
    }
    return;
  }

  if (e.key === "F1") {
    e.preventDefault();
    toggleHelp();
    return;
  }

  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")
    return;

  if (e.key === "?") {
    toggleHelp();
    return;
  }

  const shortcuts = {
    v: "select",
    w: "move",
    p: "point",
    l: "line",
    k: "constr",
    c: "circle",
    a: "arc",
    r: "rect",
    q: "polyline",
    m: "measure",
    t: "tangent",
    o: "offset",
    x: "trim",
    e: "extend",
    f: "filletChamfer",
    y: "filletChamfer",
    j: "perp",
    z: "horizontal",
    h: "parallel",
    u: "dimension",
    b: "snapPoint",
    i: "text",
  };
  // Shift+M = mirror, Shift+N = polar, Shift+G = angle snap – skip tool shortcuts
  // B is only snapPoint when not drawing polyline
  if (e.key.toLowerCase() === 'b' && state.drawing && state.tool === 'polyline') {
    // handled separately below for bulge
  } else if (!(e.shiftKey && ['m','n','g','a','c'].includes(e.key.toLowerCase())) && shortcuts[e.key.toLowerCase()]) {
    // M (measure): pokud je výběr → okamžitě změřit
    if (e.key.toLowerCase() === 'm' && !e.shiftKey && measureSelection()) {
      // měření provedeno přes výběr
    // U (dimension): pokud je výběr → okamžitě přidat kóty
    } else if (e.key.toLowerCase() === 'u' && !e.shiftKey && dimensionFromSelection()) {
      // kóty přidány přes výběr
    } else {
      setTool(shortcuts[e.key.toLowerCase()]);
    }
  }

  if (e.key.toLowerCase() === "s") {
    state.snapToPoints = !state.snapToPoints;
    updateSnapPtsBtn();
    renderAll();
    showToast(state.snapToPoints ? "Snap k bodům: ON" : "Snap k bodům: OFF");
  }
  if (e.key.toLowerCase() === "d") {
    const cycle = { all: 'intersections', intersections: 'none', none: 'all' };
    state.showDimensions = cycle[state.showDimensions] || 'all';
    updateDimsBtn();
    renderAll();
  }

  if (e.key.toLowerCase() === "i") {
    toggleCoordMode();
  }

  if (e.key.toLowerCase() === "n") {
    if (e.shiftKey) {
      showPolarDrawingDialog();
    } else {
      showNumericalInputDialog();
    }
  }
  if (e.key.toLowerCase() === "g") {
    if (e.shiftKey) {
      state.angleSnap = !state.angleSnap;
      updateAngleSnapBtn();
      renderAll();
      showToast(state.angleSnap ? `Úhlový snap: ON (${state.angleSnapStep}°)` : "Úhlový snap: OFF");
    } else {
      state.snapToGrid = !state.snapToGrid;
      updateSnapGridBtn();
      renderAll();
      showToast(state.snapToGrid ? `Snap na mřížku: ON (${state.gridSize})` : "Snap na mřížku: OFF");
    }
  }
  if (e.key === "Delete" && (state.selected !== null || state.multiSelected.size > 0)) {
    const obj = state.selected !== null ? state.objects[state.selected] : null;
    // Delete individual segment from polyline (only in single-select mode)
    if (state.multiSelected.size === 0 && obj && obj.type === 'polyline' && state.selectedSegment !== null) {
      e.preventDefault();
      deleteSelectedSegment();
      return;
    }
    deleteSelected();
  }

  // Shift+M: Zrcadlení vybraného objektu
  if (e.key === "M" && e.shiftKey && (state.selected !== null || state.multiSelected.size > 0)) {
    e.preventDefault();
    startMirrorAction();
  }
  // Shift+A: Kruhové pole
  if (e.key === "A" && e.shiftKey && (state.selected !== null || state.multiSelected.size > 0)) {
    e.preventDefault();
    startCircularArrayAction();
  }
  // Shift+C: Kopírovat & umístit
  if (e.key === "C" && e.shiftKey && !e.ctrlKey && !e.metaKey && (state.selected !== null || state.multiSelected.size > 0)) {
    e.preventDefault();
    copyPlaceFromSelection();
  }
  if (e.key === "Enter" && state.drawing && state.tool === "circle") {
    e.preventDefault();
    showCircleRadiusDialog();
  }
  // Profile trace: Enter = dokončit trasování
  if (e.key === "Enter" && state.drawing && state.tool === "profileTrace") {
    e.preventDefault();
    finishProfileTrace();
  }
  // Chain dimension: Enter = dokončit řetězcové kótování
  if (e.key === "Enter" && state.drawing && state.tool === "chainDimension") {
    e.preventDefault();
    finishChainDimension();
  }
  // Profile trace: R = radius dialog pro poslední segment
  if (e.key.toLowerCase() === "r" && state.drawing && state.tool === "profileTrace") {
    const data = getTraceData();
    if (data.points.length >= 2) {
      e.preventDefault();
      const idx = data.points.length - 2;
      const p1 = data.points[idx];
      const p2 = data.points[idx + 1];
      showBulgeDialog(p1, p2, data.bulges[idx] || 0, (newBulge) => {
        setTraceBulge(idx, newBulge);
      });
    }
  }
  // Polyline: Enter = ukončit (otevřená), Shift+Enter = uzavřít
  if (e.key === "Enter" && state.drawing && state.tool === "polyline") {
    e.preventDefault();
    if (state.tempPoints.length >= 2) {
      const closed = e.shiftKey;
      const bulges = state._polylineBulges || [];
      // Ensure bulges array matches segment count
      if (closed) {
        while (bulges.length < state.tempPoints.length) bulges.push(0);
      } else {
        while (bulges.length < state.tempPoints.length - 1) bulges.push(0);
      }
      addPolylineAsSegments(state.tempPoints.slice(), bulges.slice(0, closed ? state.tempPoints.length : state.tempPoints.length - 1), closed);
      state.drawing = false;
      state.tempPoints = [];
      state._polylineBulges = [];
      resetHint();
      showToast(closed ? 'Kontura uzavřena' : 'Kontura dokončena');
    }
  }
  // Polyline: B = bulge dialog pro poslední segment
  if (e.key.toLowerCase() === "b" && state.drawing && state.tool === "polyline") {
    if (state.tempPoints.length >= 2) {
      const idx = state.tempPoints.length - 2;
      const p1 = state.tempPoints[idx];
      const p2 = state.tempPoints[idx + 1];
      showBulgeDialog(p1, p2, state._polylineBulges[idx] || 0, (newBulge) => {
        if (!state._polylineBulges) state._polylineBulges = [];
        state._polylineBulges[idx] = newBulge;
        renderAll();
      });
    }
  }
  // B key in segment editing mode: bulge dialog for selected segment
  if (e.key.toLowerCase() === "b" && !state.drawing && state.selected !== null && state.selectedSegment !== null) {
    const obj = state.objects[state.selected];
    if (obj && obj.type === 'polyline') {
      const si = state.selectedSegment;
      const pn = obj.vertices.length;
      const p1 = obj.vertices[si];
      const p2 = obj.vertices[(si + 1) % pn];
      showBulgeDialog(p1, p2, obj.bulges[si] || 0, (newBulge) => {
        pushUndo();
        obj.bulges[si] = newBulge;
        updateProperties();
        renderAll();
      });
    }
  }
});

drawCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const rect = drawCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  let [wx, wy] = screenToWorld(sx, sy);
  if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);

  // Polyline: pravý klik = bulge dialog pro poslední segment
  if (state.drawing && state.tool === "polyline" && state.tempPoints.length >= 2) {
    const idx = state.tempPoints.length - 2;
    const p1 = state.tempPoints[idx];
    const p2 = state.tempPoints[idx + 1];
    showBulgeDialog(p1, p2, state._polylineBulges[idx] || 0, (newBulge) => {
      if (!state._polylineBulges) state._polylineBulges = [];
      state._polylineBulges[idx] = newBulge;
      renderAll();
    });
    return;
  }

  // Profile trace: pravý klik = bulge dialog pro poslední segment
  if (state.drawing && state.tool === "profileTrace") {
    const data = getTraceData();
    if (data.points.length >= 2) {
      const idx = data.points.length - 2;
      const p1 = data.points[idx];
      const p2 = data.points[idx + 1];
      showBulgeDialog(p1, p2, data.bulges[idx] || 0, (newBulge) => {
        setTraceBulge(idx, newBulge);
      });
      return;
    }
  }

  // Zobrazit kontextové menu pro nastavení reference
  const existing = document.querySelector('.skica-context-menu');
  if (existing) existing.remove();

  // Detekce objektu pod kurzorem pro kontextové akce
  const ctxIdx = findObjectAt(wx, wy);

  const menu = document.createElement('div');
  menu.className = 'skica-context-menu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  // Build context menu items safely (no innerHTML)
  const menuDef = [
    { label: '📍 Nastavit jako referenci (INC)', action: 'ref' },
  ];
  if (ctxIdx !== null) {
    state.selected = ctxIdx;
    state.multiSelected.clear();
    state.selectedPoint = null;
    updateObjectList();
    updateProperties();
    renderAll();
    menuDef.push({ sep: true });
    menuDef.push({ label: '🪞 Zrcadlit (Shift+M)', action: 'mirror' });
    menuDef.push({ label: '🔄 Otočit', action: 'rotate' });
    menuDef.push({ label: '📏 Lineární pole', action: 'array' });
    menuDef.push({ label: '🔄 Kruhové pole', action: 'circArray' });
    menuDef.push({ label: '📋 Kopírovat sem', action: 'copyPlace' });
    menuDef.push({ label: '⇔ Offset', action: 'offset' });
    if (state.objects[ctxIdx] && state.objects[ctxIdx].type === 'polyline') {
      menuDef.push({ label: '💥 Rozložit konturu', action: 'explode' });
    }
    menuDef.push({ sep: true });
    menuDef.push({ label: '🗑 Smazat', action: 'delete', cls: 'ctx-delete' });
  }
  for (const entry of menuDef) {
    if (entry.sep) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
    } else {
      const item = document.createElement('div');
      item.className = 'ctx-item' + (entry.cls ? ` ${entry.cls}` : '');
      item.dataset.action = entry.action;
      item.textContent = entry.label;
      menu.appendChild(item);
    }
  }
  document.body.appendChild(menu);

  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      menu.remove();
      if (action === 'ref') {
        state.incReference = { x: wx, y: wy };
        state.nullPointActive = true;
        if (state.coordMode !== 'inc') state.coordMode = 'inc';
        updateCoordModeBtn();
        updateNullPointUI();
        renderAll();
        showToast(`Nulový bod: ${state.machineType === 'karusel' ? 'X' : 'Z'}=${wx.toFixed(3)} ${state.machineType === 'karusel' ? 'Z' : 'X'}=${wy.toFixed(3)}`);
      } else if (action === 'mirror') {
        startMirrorAction();
      } else if (action === 'rotate') {
        startRotateAction();
      } else if (action === 'array') {
        startLinearArrayAction();
      } else if (action === 'circArray') {
        startCircularArrayAction();
      } else if (action === 'copyPlace') {
        copyPlaceFromSelection();
      } else if (action === 'offset') {
        if (ctxIdx !== null && state.objects[ctxIdx]) {
          handleOffsetClick(wx, wy);
        }
      } else if (action === 'explode') {
        explodeSelectedPolyline();
      } else if (action === 'delete') {
        deleteSelected();
      }
    });
  });

  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu, true); }
  };
  // Capture phase + timeout zajistí, že aktuální klik neuzavře menu okamžitě
  setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
});

// ── Obdélníkový výběr – dokončení ──
export function finishRectSelection() {
  if (!state._rectStart) { state._rectSelecting = false; return; }
  const sx = state._rectStart.x, sy = state._rectStart.y;
  const ex = state.mouse.x, ey = state.mouse.y;
  // Pokud byl pohyb minimální, zachovat se jako klik do prázdna (deselect)
  if (Math.hypot(ex - sx, ey - sy) < 0.5) {
    state._rectSelecting = false;
    state._rectStart = null;
    selectObjectAt(sx, sy);
    return;
  }
  const bbox = {
    minX: Math.min(sx, ex), minY: Math.min(sy, ey),
    maxX: Math.max(sx, ex), maxY: Math.max(sy, ey),
  };
  state.multiSelected.clear();
  state.selected = null;
  state.selectedPoint = null;
  let firstIdx = null;
  state.objects.forEach((obj, idx) => {
    if (obj.isDimension || obj.isCoordLabel) return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && (!layer.visible || layer.locked)) return;
    const ob = getObjectBounds(obj);
    if (ob && boundsOverlap(ob, bbox)) {
      state.multiSelected.add(idx);
      if (firstIdx === null) firstIdx = idx;
    }
  });
  if (state.multiSelected.size === 1) {
    state.selected = firstIdx;
    state.multiSelected.clear();
  }
  state._rectSelecting = false;
  state._rectStart = null;
  updateObjectList();
  updateProperties();
}

// ── Klik logika sdílená s touch ──
/**
 * Zpracování kliku na canvas (volané i z touch modulu).
 * @param {number} wx
 * @param {number} wy
 * @param {{ addToSelection?: boolean }} [opts]
 */
export function handleCanvasClick(wx, wy) {
  switch (state.tool) {
    case "select":
      selectObjectAt(wx, wy);
      break;

    case "move":
      handleMoveClick(wx, wy);
      break;

    case "point": {
      const ptObj = addObject({
        type: "point",
        x: wx,
        y: wy,
        name: `Bod ${state.nextId}`,
      });
      if (ptObj) showPostDrawPointDialog(ptObj);
      break;
    }

    case "line":
    case "constr":
      handleLineClick(wx, wy);
      break;

    case "measure":
      handleMeasureClick(wx, wy);
      break;

    case "circle":
      handleCircleClick(wx, wy);
      break;

    case "arc":
      handleArcClick(wx, wy);
      break;

    case "rect":
      handleRectClick(wx, wy);
      break;

    case "polyline":
      handlePolylineClick(wx, wy);
      break;

    case "tangent":
      handleTangentClick(wx, wy);
      break;

    case "offset":
      handleOffsetClick(wx, wy);
      break;

    case "trim":
      handleTrimClick(wx, wy);
      break;

    case "extend":
      handleExtendClick(wx, wy);
      break;

    case "fillet":
      handleFilletClick(wx, wy);
      break;

    case "chamfer":
      handleChamferClick(wx, wy);
      break;

    case "filletChamfer":
      handleFilletChamferClick(wx, wy);
      break;

    case "perp":
      handlePerpClick(wx, wy);
      break;

    case "horizontal":
      handleHorizontalClick(wx, wy);
      break;

    case "parallel":
      handleParallelClick(wx, wy);
      break;

    case "break":
      handleBreakClick(wx, wy);
      break;

    case "centerMark":
      handleCenterMarkClick(wx, wy);
      break;

    case "scale":
      handleScaleClick(wx, wy);
      break;

    case "dimension":
      handleDimensionClick(wx, wy);
      break;

    case "chainDimension":
      handleChainDimensionClick(wx, wy);
      break;

    case "snapPoint":
      handleSnapPointClick(wx, wy);
      break;

    case "text":
      handleTextClick(wx, wy);
      break;

    case "gear":
      handleGearClick(wx, wy);
      break;

    case "anchor":
      handleAnchorClick(wx, wy);
      break;

    case "boolean":
      handleBooleanClick(wx, wy);
      break;

    case "circularArray":
      handleCircularArrayClick(wx, wy);
      break;

    case "copyPlace":
      handleCopyPlaceClick(wx, wy);
      break;

    case "profileTrace":
      handleProfileTraceClick(wx, wy);
      break;

    case "rotate":
      handleRotateClick(wx, wy);
      break;

    case "deleteObj": {
      // Nejprve zkusit vazbu (constraint marker)
      const constr = findConstraintAt(wx, wy);
      if (constr) {
        pushUndo();
        const cObj = state.objects[constr.objIdx];
        if (cObj) removeConstraint(cObj, constr.segIdx);
        renderAll();
        showToast("Vazba odstraněna ✓");
        break;
      }
      // Pak objekt
      const idx = findObjectAt(wx, wy);
      if (idx !== null) {
        pushUndo();
        removeAnchorsForObject(state.objects[idx]);
        state.objects.splice(idx, 1);
        removeOrphanDimensions();
        updateObjectList();
        updateProperties();
        calculateAllIntersections();
        cleanupOrphanAnchors();
        renderAll();
        showToast("Objekt smazán ✓");
      } else {
        // Nakonec zkusit kotvu
        pushUndo();
        if (removeAnchorAt(wx, wy)) {
          renderAll();
          showToast("Kotva odstraněna ✓");
        } else {
          state.undoStack.pop();
        }
      }
      break;
    }
  }
}

// ── Multi-select: pomocné funkce pro skupinové natáčení ──

/** Vrátí indexy všech vybraných ne-kótových objektů. */
function _getMultiIndices() {
  const allIndices = new Set();
  if (state.selected !== null) allIndices.add(state.selected);
  for (const idx of state.multiSelected) allIndices.add(idx);
  return [...allIndices].filter(i => {
    const o = state.objects[i];
    return o && !o.isDimension && !o.isCoordLabel;
  });
}

/** Spočítá střed (centroid) jednoho objektu. */
function _objCenter(obj) {
  switch (obj.type) {
    case 'point': return { x: obj.x, y: obj.y };
    case 'line': case 'constr':
      return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 };
    case 'circle': case 'arc':
      return { x: obj.cx, y: obj.cy };
    case 'rect':
      return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 };
    case 'polyline': {
      const v = obj.vertices;
      return { x: v.reduce((s, p) => s + p.x, 0) / v.length, y: v.reduce((s, p) => s + p.y, 0) / v.length };
    }
    case 'text': return { x: obj.x, y: obj.y };
    default: return { x: 0, y: 0 };
  }
}

/** Spočítá těžiště skupiny objektů. */
function _groupCenter(indices) {
  let cx = 0, cy = 0, count = 0;
  for (const i of indices) {
    const o = state.objects[i];
    if (!o) continue;
    const c = _objCenter(o);
    cx += c.x; cy += c.y; count++;
  }
  if (count === 0) return { x: 0, y: 0 };
  return { x: cx / count, y: cy / count };
}

/** Získá world souřadnice z mouse/touch eventu. */
function _worldFromEvent(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const sx = (e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left;
  const sy = (e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top;
  let [wx, wy] = screenToWorld(sx, sy);
  if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
  return [wx, wy];
}

/** Multi-select: vodorovnost – vyzve ke kliknutí na referenční úsečku, pak otočí celou skupinu. */
function horizontalMultiAlign(indices) {
  setHint("Klikněte na úsečku, která se má vyrovnat vodorovně");

  function handleClick(e) {
    const [wx, wy] = _worldFromEvent(e);
    const idx = findObjectAt(wx, wy);
    if (idx === null) return;
    const obj = state.objects[idx];
    const ls = getLineSegment(obj, wx, wy);
    if (!ls) { showToast("Klikněte na úsečku"); return; }

    cleanup();

    const currentAngle = Math.atan2(ls.seg.y2 - ls.seg.y1, ls.seg.x2 - ls.seg.x1);
    const hAngle = (state.nullPointActive && state.nullPointAngle)
      ? (state.nullPointAngle * Math.PI / 180) : 0;

    // Vybrat nejmenší rotaci (0° i 180° jsou obě vodorovné)
    let rotAngle = hAngle - currentAngle;
    const alt = hAngle + Math.PI - currentAngle;
    if (Math.abs(alt) < Math.abs(rotAngle)) rotAngle = alt;

    const center = _groupCenter(indices);
    pushUndo();
    for (const i of indices) {
      const o = state.objects[i];
      if (o) rotateObject(o, center.x, center.y, rotAngle);
    }
    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
    resetHint();
    showToast("Skupina vyrovnána vodorovně ✓");
  }

  function handleTouch(e) {
    if (e.changedTouches.length === 1) { e.preventDefault(); handleClick(e); }
  }
  function cleanup() {
    drawCanvas.removeEventListener("click", handleClick);
    drawCanvas.removeEventListener("touchend", handleTouch);
    state._toolCleanup = null;
  }
  drawCanvas.addEventListener("click", handleClick);
  drawCanvas.addEventListener("touchend", handleTouch);
  state._toolCleanup = cleanup;
}

/** Multi-select: kolmost – vyzve ke kliknutí na referenční úsečku, pak otočí celou skupinu do svislé polohy. */
function perpMultiAlign(indices) {
  setHint("Klikněte na úsečku, která se má vyrovnat svisle");

  function handleClick(e) {
    const [wx, wy] = _worldFromEvent(e);
    const idx = findObjectAt(wx, wy);
    if (idx === null) return;
    const obj = state.objects[idx];
    const ls = getLineSegment(obj, wx, wy);
    if (!ls) { showToast("Klikněte na úsečku"); return; }

    cleanup();

    const currentAngle = Math.atan2(ls.seg.y2 - ls.seg.y1, ls.seg.x2 - ls.seg.x1);
    const vAngle = (state.nullPointActive && state.nullPointAngle)
      ? (state.nullPointAngle * Math.PI / 180 + Math.PI / 2) : (Math.PI / 2);

    let rotAngle = vAngle - currentAngle;
    const alt = vAngle + Math.PI - currentAngle;
    if (Math.abs(alt) < Math.abs(rotAngle)) rotAngle = alt;

    const center = _groupCenter(indices);
    pushUndo();
    for (const i of indices) {
      const o = state.objects[i];
      if (o) rotateObject(o, center.x, center.y, rotAngle);
    }
    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
    resetHint();
    showToast("Skupina vyrovnána svisle ✓");
  }

  function handleTouch(e) {
    if (e.changedTouches.length === 1) { e.preventDefault(); handleClick(e); }
  }
  function cleanup() {
    drawCanvas.removeEventListener("click", handleClick);
    drawCanvas.removeEventListener("touchend", handleTouch);
    state._toolCleanup = null;
  }
  drawCanvas.addEventListener("click", handleClick);
  drawCanvas.addEventListener("touchend", handleTouch);
  state._toolCleanup = cleanup;
}

/** Multi-select: rovnoběžnost – vyzve ke kliknutí na referenční úsečku a pak na cílovou, otočí celou skupinu. */
function parallelMultiAlign(indices) {
  let refAngle = null;
  setHint("Klikněte na úsečku v označených objektech (referenční směr)");

  function handleClick(e) {
    const [wx, wy] = _worldFromEvent(e);
    const idx = findObjectAt(wx, wy);
    if (idx === null) return;
    const obj = state.objects[idx];
    const ls = getLineSegment(obj, wx, wy);
    if (!ls) { showToast("Klikněte na úsečku"); return; }

    if (refAngle === null) {
      // První klik: reference segment
      refAngle = Math.atan2(ls.seg.y2 - ls.seg.y1, ls.seg.x2 - ls.seg.x1);
      setHint("Klikněte na cílovou úsečku pro rovnoběžnost");
    } else {
      // Druhý klik: cílový segment
      cleanup();

      const targetAngle = Math.atan2(ls.seg.y2 - ls.seg.y1, ls.seg.x2 - ls.seg.x1);
      // Vybrat nejmenší rotaci
      let rotAngle = targetAngle - refAngle;
      const alt = targetAngle + Math.PI - refAngle;
      if (Math.abs(alt) < Math.abs(rotAngle)) rotAngle = alt;

      const center = _groupCenter(indices);
      pushUndo();
      for (const i of indices) {
        const o = state.objects[i];
        if (o) rotateObject(o, center.x, center.y, rotAngle);
      }
      calculateAllIntersections();
      updateAssociativeDimensions();
      renderAll();
      resetHint();
      showToast("Skupina otočena do rovnoběžnosti ✓");
    }
  }

  function handleTouch(e) {
    if (e.changedTouches.length === 1) { e.preventDefault(); handleClick(e); }
  }
  function cleanup() {
    drawCanvas.removeEventListener("click", handleClick);
    drawCanvas.removeEventListener("touchend", handleTouch);
    state._toolCleanup = null;
  }
  drawCanvas.addEventListener("click", handleClick);
  drawCanvas.addEventListener("touchend", handleTouch);
  state._toolCleanup = cleanup;
}

// ── Vazby (constraints) – helper ──
/** Odstraní vazbu z objektu/segmentu. */
function removeConstraint(obj, segIdx) {
  if (segIdx !== null && segIdx !== undefined) {
    if (obj.segConstraints) {
      delete obj.segConstraints[segIdx];
      if (Object.keys(obj.segConstraints).length === 0) delete obj.segConstraints;
    }
  } else {
    delete obj.constraint;
  }
}

// ── Rotace akce ──
/** Spustí rotaci – přepne na nástroj rotate, kde uživatel klikne na referenční bod. */
function startRotateAction() {
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : state.selected !== null ? [state.selected] : [];
  if (indices.length === 0) { showToast("Nejdříve vyberte objekt"); return; }

  setTool('rotate');
  state._rotateObjects = indices;
  setHint("Klikněte na referenční bod otáčení");
  showToast("Klikněte na referenční bod otáčení", 3000);
}

/** Handler kliknutí pro nástroj rotate – klik = referenční bod → dialog pro úhel. */
function handleRotateClick(wx, wy) {
  if (!state._rotateObjects || state._rotateObjects.length === 0) {
    showToast("Nejdříve vyberte objekt");
    return;
  }

  const objs = state._rotateObjects.map(i => state.objects[i]).filter(o => o);
  if (objs.length === 0) { showToast("Žádný platný objekt k otočení"); return; }
  const refObj = objs[0];

  showRotateDialog(refObj, (deg) => {
    pushUndo();
    for (const obj of objs) {
      if (hasAnchoredPoint(obj)) {
        showToast("Zakotvené objekty nelze otáčet");
        continue;
      }
      rotateObject(obj, wx, wy, deg * Math.PI / 180);
    }
    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
    showToast(`Otočeno o ${deg}° ✓`);
    setTool('select');
  });
}

// ── Odstranění osiřelých kót (zdrojový objekt byl smazán) ──
function removeOrphanDimensions() {
  const existingIds = new Set(state.objects.map(o => o.id));
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];
    if (!obj.isDimension) continue;
    if (obj.sourceObjId && !existingIds.has(obj.sourceObjId)) {
      state.objects.splice(i, 1);
    } else if (obj.dimLine1Id && obj.dimLine2Id &&
               (!existingIds.has(obj.dimLine1Id) || !existingIds.has(obj.dimLine2Id))) {
      state.objects.splice(i, 1);
    }
  }
}

// ── Smazání vybraného objektu nebo vazby ──
function deleteSelected() {
  // Pokud je vybrána vazební značka, smazat jen vazbu
  if (state._selectedConstraint) {
    const c = state._selectedConstraint;
    const obj = state.objects[c.objIdx];
    if (obj) {
      pushUndo();
      removeConstraint(obj, c.segIdx);
      state._selectedConstraint = null;
      renderAll();
      showToast("Vazba odstraněna ✓");
    }
    return;
  }

  // Multi-select smazání
  if (state.multiSelected.size > 0) {
    pushUndo();
    const indices = [...state.multiSelected].sort((a, b) => b - a); // sestupně
    for (const idx of indices) {
      removeAnchorsForObject(state.objects[idx]);
      state.objects.splice(idx, 1);
    }
    // Smazat osiřelé kóty (jejich zdrojový objekt byl právě smazán)
    removeOrphanDimensions();
    state.selected = null;
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
    state.multiSelected.clear();
    state.multiSelectedSegments.clear();
    state.selectedPoint = null;
    updateObjectList();
    updateProperties();
    calculateAllIntersections();
    cleanupOrphanAnchors();
    renderAll();
    showToast(`Smazáno ${indices.length} objektů ✓`);
    return;
  }

  if (state.selected === null) { showToast("Nejdříve vyberte objekt"); return; }
  // Pokud je vybrán segment kontury, smazat jen segment (případně rozdělit konturu)
  const selObj = state.objects[state.selected];
  if (selObj && selObj.type === 'polyline' && state.selectedSegment !== null) {
    deleteSelectedSegment();
    return;
  }
  pushUndo();
  removeAnchorsForObject(state.objects[state.selected]);
  state.objects.splice(state.selected, 1);
  // Smazat osiřelé kóty (jejich zdrojový objekt byl právě smazán)
  removeOrphanDimensions();
  state.selected = null;
  state.selectedSegment = null;
  state._selectedSegmentObjIdx = null;
  state.multiSelectedSegments.clear();
  state.selectedPoint = null;
  updateObjectList();
  updateProperties();
  calculateAllIntersections();
  cleanupOrphanAnchors();
  renderAll();
  showToast("Objekt smazán ✓");
}

// ── Smazání vybraného segmentu kontury ──
function deleteSelectedSegment() {
  if (state.selected === null || state.selectedSegment === null) return;
  const obj = state.objects[state.selected];
  if (!obj || obj.type !== 'polyline') return;
  const segIdx = state.selectedSegment;
  const n = obj.vertices.length;
  const segCount = obj.closed ? n : n - 1;
  if (segIdx < 0 || segIdx >= segCount) return;

  if (hasAnchoredPoint(obj)) {
    showToast("Kontura je zakotvena – nelze smazat segment");
    return;
  }

  pushUndo();

  if (n <= 2) {
    // Only 2 vertices = 1 segment → delete the whole polyline
    removeAnchorsForObject(state.objects[state.selected]);
    state.objects.splice(state.selected, 1);
    state.selected = null;
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
    state.multiSelectedSegments.clear();
  } else if (obj.closed) {
    // Closed polyline: open by removing the segment at segIdx
    // Reorder so resulting open polyline starts at vertex after the deleted segment
    const startIdx = (segIdx + 1) % n;
    const newVerts = [];
    const newBulges = [];
    for (let i = 0; i < n; i++) {
      const vi = (startIdx + i) % n;
      newVerts.push(obj.vertices[vi]);
      if (i < n - 1) {
        newBulges.push(obj.bulges[vi]);
      }
    }
    obj.vertices = newVerts;
    obj.bulges = newBulges;
    obj.closed = false;
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
    state.multiSelectedSegments.clear();
  } else {
    // Open polyline: remove vertex to delete segment
    if (segIdx === 0) {
      // First segment → remove the first vertex
      obj.vertices.splice(0, 1);
      obj.bulges.splice(0, 1);
    } else if (segIdx === segCount - 1) {
      // Last segment → remove the last vertex
      obj.vertices.splice(n - 1, 1);
      obj.bulges.splice(segIdx, 1);
    } else {
      // Middle segment → split into two polylines
      const verts1 = obj.vertices.slice(0, segIdx + 1);
      const bulges1 = obj.bulges.slice(0, segIdx);
      const verts2 = obj.vertices.slice(segIdx + 1);
      const bulges2 = obj.bulges.slice(segIdx + 1);

      // Replace current object with first half
      obj.vertices = verts1;
      obj.bulges = bulges1;
      obj.closed = false;

      // Add second half as new object (without addObject to avoid double pushUndo)
      if (verts2.length >= 2) {
        const newObj = {
          type: 'polyline',
          vertices: verts2,
          bulges: bulges2,
          closed: false,
          name: `Kontura ${state.nextId++}`,
          layer: obj.layer,
          color: obj.color,
        };
        state.objects.push(newObj);
      }
    }
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
    state.multiSelectedSegments.clear();
  }

  updateObjectList();
  updateProperties();
  calculateAllIntersections();
  cleanupOrphanAnchors();
  renderAll();
  showToast("Segment smazán ✓");
}

// ── Rozložení kontury na segmenty ──
function explodeSelectedPolyline() {
  if (state.selected === null) return;
  const obj = state.objects[state.selected];
  if (!obj || obj.type !== 'polyline') { showToast("Vyberte konturu"); return; }

  const n = obj.vertices.length;
  const segCount = obj.closed ? n : n - 1;
  if (segCount < 1) return;

  pushUndo();

  const newObjects = [];
  for (let i = 0; i < segCount; i++) {
    const p1 = obj.vertices[i];
    const p2 = obj.vertices[(i + 1) % n];
    const b = obj.bulges[i] || 0;

    if (b === 0) {
      // Straight segment → line
      newObjects.push({
        type: 'line',
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        name: `Úsečka ${state.nextId + newObjects.length}`,
        layer: obj.layer,
        color: obj.color,
      });
    } else {
      // Arc segment → arc
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        newObjects.push({
          type: 'arc',
          cx: arc.cx, cy: arc.cy,
          r: arc.r,
          startAngle: arc.startAngle,
          endAngle: arc.endAngle,
          name: `Oblouk ${state.nextId + newObjects.length}`,
          layer: obj.layer,
          color: obj.color,
        });
      }
    }
  }

  // Remove the polyline
  state.objects.splice(state.selected, 1);
  state.selected = null;
  state.selectedSegment = null;
  state._selectedSegmentObjIdx = null;
  state.multiSelectedSegments.clear();

  // Add new individual objects (without pushUndo, already done)
  for (const no of newObjects) {
    no.id = state.nextId++;
    if (no.layer === undefined) no.layer = state.activeLayer;
    state.objects.push(no);
  }

  updateObjectList();
  updateProperties();
  calculateAllIntersections();
  renderAll();
  showToast(`Kontura rozložena na ${newObjects.length} segmentů ✓`);
}

// ── Zrcadlení akce ──
/** Spustí dialog pro zrcadlení vybraného objektu (podporuje multi-select). */
function startMirrorAction() {
  // Získat objekty pro zrcadlení
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : state.selected !== null ? [state.selected] : [];
  if (indices.length === 0) { showToast("Nejdříve vyberte objekt"); return; }
  const objs = indices.map(i => state.objects[i]);
  const refObj = objs[0]; // pro dialog

  showMirrorDialog(refObj, (axis) => {
    if (axis === 'custom') {
      showToast("Klepněte na první bod osy zrcadlení");
      setHint("Klepněte na první bod osy zrcadlení");
      state._mirrorObj = objs;
      state._mirrorStep = 'p1';
      state._mirrorAxisPoints = [];

      function handleMirrorClick(e) {
        const rect = drawCanvas.getBoundingClientRect();
        const sx = (e.clientX || e.changedTouches?.[0]?.clientX) - rect.left;
        const sy = (e.clientY || e.changedTouches?.[0]?.clientY) - rect.top;
        let [mwx, mwy] = screenToWorld(sx, sy);
        if (state.snapToPoints) [mwx, mwy] = snapPt(mwx, mwy);

        if (state._mirrorStep === 'p1') {
          state._mirrorAxisPoints.push({ x: mwx, y: mwy });
          state._mirrorStep = 'p2';
          setHint("Klepněte na druhý bod osy zrcadlení");
        } else {
          cleanupMirrorListeners();
          const p1 = state._mirrorAxisPoints[0];
          const p2 = { x: mwx, y: mwy };
          for (const o of state._mirrorObj) {
            const copy = mirrorObject(o, 'custom', p1, p2);
            addObject(copy);
          }
          showToast(`${state._mirrorObj.length > 1 ? state._mirrorObj.length + ' objektů zrcadleno' : 'Objekt zrcadlen'} ✓`);
          resetHint();
          state._mirrorObj = null;
          state._mirrorStep = null;
          state._mirrorAxisPoints = null;
          state._mirrorCleanup = null;
        }
      }

      function handleMirrorTouch(e) {
        if (e.changedTouches.length === 1) { e.preventDefault(); handleMirrorClick(e); }
      }

      function cleanupMirrorListeners() {
        drawCanvas.removeEventListener("click", handleMirrorClick);
        drawCanvas.removeEventListener("touchend", handleMirrorTouch);
      }

      drawCanvas.addEventListener("click", handleMirrorClick);
      drawCanvas.addEventListener("touchend", handleMirrorTouch);
      state._mirrorCleanup = cleanupMirrorListeners;
    } else {
      for (const o of objs) {
        const copy = mirrorObject(o, axis, null, null);
        addObject(copy);
      }
      showToast(`${objs.length > 1 ? objs.length + ' objektů zrcadleno' : 'Objekt zrcadlen'} podle osy ${axis === 'x' ? 'X' : 'Z'} ✓`);
    }
  });
}

// ── Lineární pole akce ──
/** Spustí dialog pro vytvoření lineárního pole (podporuje multi-select). */
function startLinearArrayAction() {
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : state.selected !== null ? [state.selected] : [];
  if (indices.length === 0) { showToast("Nejdříve vyberte objekt"); return; }
  const objs = indices.map(i => state.objects[i]);

  showLinearArrayDialog(objs[0], (dx, dz, count, dx2, dz2, count2) => {
    for (const obj of objs) {
      const copies = linearArray(obj, dx, dz, count, dx2, dz2, count2);
      for (const copy of copies) {
        addObject(copy);
      }
    }
    const total = count2 > 0 ? (count + 1) * count2 - 1 : count;
    showToast(`Vytvořeno ${total} kopií${objs.length > 1 ? ` z ${objs.length} objektů` : ''}`);
  });
}

// ── Kruhové pole akce ──
/** Spustí dialog pro vytvoření kruhového pole (podporuje multi-select). */
function startCircularArrayAction() {
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : state.selected !== null ? [state.selected] : [];
  if (indices.length === 0) { showToast("Nejdříve vyberte objekt"); return; }
  const objs = indices.map(i => state.objects[i]);

  showCircularArrayDialog(objs[0], (cx, cz, count, totalAngle, includeOriginal) => {
    pushUndo();
    let totalCopies = 0;
    for (const obj of objs) {
      const copies = circularArray(obj, cx, cz, count, totalAngle, includeOriginal);
      for (const copy of copies) {
        addObject(copy);
      }
      totalCopies += copies.length;
    }
    showToast(`Vytvořeno ${totalCopies} kopií${objs.length > 1 ? ` z ${objs.length} objektů` : ''}`);
  });
}

// Export pro ui.js context menu
export { startMirrorAction, startLinearArrayAction, startCircularArrayAction, startRotateAction, deleteSelected };

// ── Tlačítka Smazat a Otočit ──
document.getElementById("btnDelete").addEventListener("click", () => {
  // Pokud je něco vybrané, smazat rovnou
  if (state.selected !== null || state.multiSelected.size > 0 || state._selectedConstraint) {
    deleteSelected();
    return;
  }
  // Nic nevybráno → toggle deleteObj mód
  if (state.tool === 'deleteObj') {
    setTool('select');
  } else {
    setTool('deleteObj');
  }
});

// ── Double-click: dokončit konturu / vybrat segment ──
drawCanvas.addEventListener("dblclick", (e) => {
  if (state.drawing && state.tool === "polyline" && state.tempPoints.length >= 2) {
    e.preventDefault();
    // Remove the last point that was added by the second click of dblclick
    // (the first click of dblclick already added a point via mousedown)
    const bulges = state._polylineBulges || [];
    while (bulges.length < state.tempPoints.length - 1) bulges.push(0);
    addPolylineAsSegments(state.tempPoints.slice(), bulges.slice(0, state.tempPoints.length - 1), false);
    state.drawing = false;
    state.tempPoints = [];
    state._polylineBulges = [];
    resetHint();
    showToast('Kontura dokončena');
    return;
  }

  // Double-click on polyline: enter segment editing mode
  if (!state.drawing && state.tool === 'select') {
    const rect = drawCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let [wx, wy] = screenToWorld(sx, sy);
    if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
    const idx = findObjectAt(wx, wy);
    if (idx !== null && state.objects[idx].type === 'polyline') {
      state.selected = idx;
      state.multiSelected.clear();
      state.selectedPoint = null;
      state.selectedSegment = findSegmentAt(state.objects[idx], wx, wy);
      state._selectedSegmentObjIdx = idx;
      updateProperties();
      updateObjectList();
      renderAll();
      showToast(`Segment ${(state.selectedSegment || 0) + 1} vybrán`);
    }
  }
});

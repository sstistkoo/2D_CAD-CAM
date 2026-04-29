import { COLORS, SNAP_POINT_THRESHOLD } from '../constants.js';
import { state, showToast, toDisplayAngle } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { resetHint, setHint } from '../ui.js';
import { findObjectAt } from '../geometry.js';
import {
  showMeasureResult, showMeasureObjectInfo, showIntersectionInfo,
  showMeasureTwoPointsResult, showMeasureMultiPointResult,
  showMeasureTwoLinesResult, showMeasureTwoCirclesResult,
  showMeasurePointToLineResult, showMeasurePointToCircleResult,
  showMeasureTwoObjectsResult, showMeasureMultiObjectResult,
} from '../dialogs.js';

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handleMeasureClick(wx, wy) {
  // Pokud je výběr (objekty/body) → delegovat na measureSelection()
  if (!state.drawing && measureSelection()) return;

  if (!state.drawing) {
    const snapThreshold = SNAP_POINT_THRESHOLD / state.zoom;

    // 1) Textové objekty mají nejvyšší prioritu – otevři info dialog
    const bodyIdx = findObjectAt(wx, wy);
    if (bodyIdx !== null && state.objects[bodyIdx]?.type === 'text') {
      showMeasureObjectInfo(state.objects[bodyIdx], wx, wy, bodyIdx);
      return;
    }

    // 2) Průsečíky – měření od průsečíku
    let isOnIntersection = false;
    for (const pt of state.intersections) {
      if (Math.hypot(pt.x - wx, pt.y - wy) < snapThreshold) {
        isOnIntersection = true;
        break;
      }
    }

    // 3) Klik na tělo objektu → info dialog (pokud to není průsečík)
    if (!isOnIntersection && bodyIdx !== null) {
      showMeasureObjectInfo(state.objects[bodyIdx], wx, wy, bodyIdx);
      return;
    }
    // Přidá dočasný coord label na 1. bod měření
    addObject({
      type: "point",
      x: wx, y: wy,
      name: `Měření bod 1`,
      isDimension: true,
      isCoordLabel: true,
      isMeasureTemp: true,
      color: COLORS.textSecondary,
    });
    state.drawing = true;
    state.tempPoints = [{ x: wx, y: wy }];
    setHint("Klepněte na 2. bod pro měření");
    renderAll();
  } else {
    const tp = state.tempPoints[0];
    // Odstraní dočasný coord label z 1. bodu
    const tempIdx = state.objects.findIndex(o => o.isMeasureTemp);
    if (tempIdx !== -1) state.objects.splice(tempIdx, 1);

    const d = Math.hypot(wx - tp.x, wy - tp.y);
    const angle = toDisplayAngle((Math.atan2(wy - tp.y, wx - tp.x) * 180) / Math.PI);
    const p1 = tp;
    const p2 = { x: wx, y: wy };
    showMeasureResult(p1, p2, d, angle);
    state.drawing = false;
    state.tempPoints = [];
    resetHint();
  }
}

// ══════════════════════════════════════════════════════════════
// Měření vybraných objektů / snap bodů (bez klikání na canvas)
// ══════════════════════════════════════════════════════════════

function _clearSelection() {
  state.multiSelected.clear();
  state.selected = null;
  state.selectedPoint = null;
  renderAll();
}

function _isLine(o) { return o.type === 'line' || o.type === 'constr'; }
function _isCircle(o) { return o.type === 'circle' || o.type === 'arc'; }
function _isPoint(o) { return o.type === 'point'; }

/**
 * Změří aktuálně vybrané objekty / snap body.
 * @returns {boolean} true pokud měření provedeno, false pokud nic nebylo vybrané
 */
export function measureSelection() {
  const pts = state.selectedPoint ? state.selectedPoint.slice() : [];
  const objIndices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : (state.selected !== null ? [state.selected] : []);
  const objs = objIndices.map(i => state.objects[i]).filter(Boolean);

  // ── Nic nevybráno ──
  if (pts.length === 0 && objs.length === 0) return false;

  // ── 2+ snap body ──
  if (pts.length >= 2) {
    if (pts.length === 2) {
      showMeasureTwoPointsResult(pts[0], pts[1]);
    } else {
      showMeasureMultiPointResult(pts);
    }
    _clearSelection();
    return true;
  }

  // ── 1 snap bod + 1 objekt ──
  if (pts.length === 1 && objs.length === 1) {
    const pt = pts[0], obj = objs[0];
    if (_isLine(obj)) {
      showMeasurePointToLineResult(pt, obj, undefined, objIndices[0]);
    } else if (_isCircle(obj)) {
      showMeasurePointToCircleResult(pt, obj);
    } else if (_isPoint(obj)) {
      showMeasureTwoPointsResult(pt, { x: obj.x, y: obj.y });
    } else {
      // Rect / polyline → generický
      showMeasureTwoPointsResult(pt, _getCenter(obj));
    }
    _clearSelection();
    return true;
  }

  // ── 2 objekty ──
  if (objs.length === 2) {
    const [a, b] = objs;
    // 2 body
    if (_isPoint(a) && _isPoint(b)) {
      showMeasureTwoPointsResult({ x: a.x, y: a.y }, { x: b.x, y: b.y });
    }
    // 2 úsečky
    else if (_isLine(a) && _isLine(b)) {
      showMeasureTwoLinesResult(a, b, objIndices[0], objIndices[1]);
    }
    // 2 kružnice/oblouky
    else if (_isCircle(a) && _isCircle(b)) {
      showMeasureTwoCirclesResult(a, b, objIndices[0], objIndices[1]);
    }
    // úsečka + bod
    else if (_isLine(a) && _isPoint(b)) {
      showMeasurePointToLineResult({ x: b.x, y: b.y }, a, objIndices[1], objIndices[0]);
    } else if (_isPoint(a) && _isLine(b)) {
      showMeasurePointToLineResult({ x: a.x, y: a.y }, b, objIndices[0], objIndices[1]);
    }
    // kružnice + bod
    else if (_isCircle(a) && _isPoint(b)) {
      showMeasurePointToCircleResult({ x: b.x, y: b.y }, a);
    } else if (_isPoint(a) && _isCircle(b)) {
      showMeasurePointToCircleResult({ x: a.x, y: a.y }, b);
    }
    // úsečka + kružnice
    else if (_isLine(a) && _isCircle(b)) {
      showMeasurePointToLineResult({ x: b.cx, y: b.cy }, a, undefined, objIndices[0]);
    } else if (_isCircle(a) && _isLine(b)) {
      showMeasurePointToLineResult({ x: a.cx, y: a.cy }, b, undefined, objIndices[1]);
    }
    // generický fallback
    else {
      showMeasureTwoObjectsResult(a, b);
    }
    _clearSelection();
    return true;
  }

  // ── 1 objekt, žádné body ──
  if (objs.length === 1 && pts.length === 0) {
    showMeasureObjectInfo(objs[0], 0, 0, objIndices[0]);
    _clearSelection();
    return true;
  }

  // ── 1 snap bod, žádné objekty ──
  if (pts.length === 1 && objs.length === 0) {
    showIntersectionInfo(pts[0]);
    _clearSelection();
    return true;
  }

  // ── 3+ objekty ──
  if (objs.length >= 3) {
    showMeasureMultiObjectResult(objs, objIndices);
    _clearSelection();
    return true;
  }

  // ── Nepodporovaný mix ──
  showToast("Vyberte objekty nebo body pro měření");
  return false;
}

function _getCenter(o) {
  switch (o.type) {
    case 'point': return { x: o.x, y: o.y };
    case 'line': case 'constr': return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
    case 'circle': case 'arc': return { x: o.cx, y: o.cy };
    case 'rect': return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
    default: return { x: 0, y: 0 };
  }
}

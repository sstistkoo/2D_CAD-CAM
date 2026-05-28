// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Geometrie: vzdálenosti, průsečíky                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { state } from './state.js';
import { SNAP_POINT_THRESHOLD, SELECT_THRESHOLD, CONSTRAINT_OFFSET_PX, ARC_OUTSIDE_PENALTY } from './constants.js';
import { distPointToSegment, isAngleBetween, bulgeToArc, deepClone, getObjectSnapPoints, getRectCorners, getNearestPointOnObject } from './utils.js';
import { renderAll } from './render.js';
import { bridge } from './bridge.js';

// ── Hledání a výběr objektu ──

/**
 * Najde vazební značku na pozici [wx,wy].
 * Značky jsou odsazeny kolmo od segmentu (stejný offset jako v rendereru).
 * @returns {{ objIdx: number, segIdx: number|null }|null}
 */

function _constraintPos(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const off = CONSTRAINT_OFFSET_PX / state.zoom;
  return { x: mx + nx * off, y: my + ny * off };
}

export function findConstraintAt(wx, wy) {
  const threshold = SNAP_POINT_THRESHOLD / state.zoom;
  let best = null, bestDist = Infinity;

  state.objects.forEach((obj, idx) => {
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    // Úsečky s vazbou
    if (obj.constraint && (obj.type === 'line' || obj.type === 'constr')) {
      const pos = _constraintPos(obj.x1, obj.y1, obj.x2, obj.y2);
      const d = Math.hypot(wx - pos.x, wy - pos.y);
      if (d < threshold && d < bestDist) {
        bestDist = d;
        best = { objIdx: idx, segIdx: null };
      }
    }

    // Kontury se segmentovými vazbami
    if (obj.segConstraints && obj.type === 'polyline') {
      const n = obj.vertices.length;
      for (const [si, type] of Object.entries(obj.segConstraints)) {
        const i = parseInt(si);
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        if (!p1 || !p2) continue;
        const pos = _constraintPos(p1.x, p1.y, p2.x, p2.y);
        const d = Math.hypot(wx - pos.x, wy - pos.y);
        if (d < threshold && d < bestDist) {
          bestDist = d;
          best = { objIdx: idx, segIdx: i };
        }
      }
    }
  });
  return best;
}

/**
 * Najde index objektu nejblíž bodu [wx,wy].
 * @param {number} wx
 * @param {number} wy
 * @returns {number|null}
 */
export function findObjectAt(wx, wy) {
  let closest = null,
    closestDist = Infinity;
  state.objects.forEach((obj, idx) => {
    // Skip objects on locked or invisible layers
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && (layer.locked || !layer.visible)) return;
    // Skip hidden dimension objects
    if (state.showDimensions === 'none' && (obj.isDimension || obj.isCoordLabel)) return;
    if (state.showDimensions === 'intersections' && obj.isDimension) return;

    const d = distToObject(obj, wx, wy);
    if (d < closestDist) {
      closestDist = d;
      closest = idx;
    }
  });
  const threshold = SELECT_THRESHOLD / state.zoom;
  return closestDist < threshold ? closest : null;
}

/**
 * Najde průsečík nejblíž bodu [wx,wy].
 * @param {number} wx
 * @param {number} wy
 * @returns {{x: number, y: number}|null}
 */
export function findIntersectionAt(wx, wy) {
  const threshold = SELECT_THRESHOLD / state.zoom;
  let best = null, bestDist = Infinity;
  // Počátek (0,0)
  const dOrigin = Math.hypot(wx, wy);
  if (dOrigin < threshold) { bestDist = dOrigin; best = { x: 0, y: 0 }; }
  // Snap body všech objektů (koncové, středové, čtvrtinové…)
  const midThreshold = threshold * 0.3;  // Midpoints: snížený práh
  for (const obj of state.objects) {
    const layer = state.layers ? state.layers.find(l => l.id === obj.layer) : null;
    if (layer && (layer.locked || !layer.visible)) continue;
    if (state.showDimensions === 'none' && (obj.isDimension || obj.isCoordLabel)) continue;
    const pts = getObjectSnapPoints(obj);
    for (const p of pts) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      const t = p.mid ? midThreshold : threshold;
      if (d < t && d < bestDist) { bestDist = d; best = p; }
    }
  }
  // Průsečíky (bonus – při stejné vzdálenosti vyhrávají)
  if (state.showDimensions !== 'none') {
    for (const pt of state.intersections) {
      const d = Math.hypot(pt.x - wx, pt.y - wy);
      if (d <= bestDist) { bestDist = d; best = pt; }
    }
  }
  return bestDist < threshold ? { x: best.x, y: best.y } : null;
}

/**
 * Najde nejbližší snap bod objektu k pozici [wx,wy].
 */
function findNearestEndpoint(obj, wx, wy) {
  const pts = getObjectSnapPoints(obj);
  let best = null, bestDist = Infinity;
  for (const p of pts) {
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

const SEL_PT_TOL = 1e-4;

/** Najde nejbližší snap bod přímo na objektu, vrátí {x,y} nebo null. */
function _findObjVertexAt(obj, wx, wy, threshold) {
  const pts = getObjectSnapPoints(obj);
  let best = null, bestDist = Infinity;
  for (const p of pts) {
    const t = p.quarter ? threshold * 0.25 : (p.mid ? threshold * 0.5 : threshold);
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < t && d < bestDist) { bestDist = d; best = p; }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Přidá/odebere bod z pole selectedPoint. */
function _toggleSelectedPoint(pt) {
  if (!state.selectedPoint) state.selectedPoint = [];
  const idx = state.selectedPoint.findIndex(
    p => Math.hypot(p.x - pt.x, p.y - pt.y) < SEL_PT_TOL
  );
  if (idx >= 0) {
    state.selectedPoint.splice(idx, 1);
    if (state.selectedPoint.length === 0) state.selectedPoint = null;
  } else {
    state.selectedPoint.push({ x: pt.x, y: pt.y });
  }
}

/* ── Helpers pro Map<objIdx, Set<segIdx>> ─────────────────────────── */
function _addSegToMap(objIdx, segIdx) {
  let s = state.multiSelectedSegments.get(objIdx);
  if (!s) { s = new Set(); state.multiSelectedSegments.set(objIdx, s); }
  s.add(segIdx);
  state.selectedSegment = segIdx;
  state._selectedSegmentObjIdx = objIdx;
}

function _removeSegFromMap(objIdx, segIdx) {
  const s = state.multiSelectedSegments.get(objIdx);
  if (s) {
    s.delete(segIdx);
    if (s.size === 0) state.multiSelectedSegments.delete(objIdx);
  }
  if (state.multiSelectedSegments.size === 0) {
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
  } else {
    const lastKey = [...state.multiSelectedSegments.keys()].pop();
    const lastSet = state.multiSelectedSegments.get(lastKey);
    state.selectedSegment = [...lastSet].pop();
    state._selectedSegmentObjIdx = lastKey;
  }
}

function _toggleSegInMap(objIdx, segIdx) {
  const s = state.multiSelectedSegments.get(objIdx);
  if (s && s.has(segIdx)) {
    _removeSegFromMap(objIdx, segIdx);
  } else {
    _addSegToMap(objIdx, segIdx);
  }
}

/**
 * Vybere objekt na pozici [wx,wy].
 * Automaticky přidává do multi-selection při kliku na další objekt.
 * Opakovaný klik na vybraný objekt ho odebere z výběru.
 * @param {number} wx
 * @param {number} wy
 */
export function selectObjectAt(wx, wy) {
  // Nejdřív zkontrolovat, zda klik je na vazební značku
  const constr = findConstraintAt(wx, wy);
  if (constr) {
    state._selectedConstraint = constr;
    state.selected = constr.objIdx;
    state.selectedSegment = constr.segIdx;
    state._selectedSegmentObjIdx = constr.objIdx;
    state.multiSelected.clear();
    state.multiSelectedSegments.clear();
    state.selectedPoint = null;
    if (bridge.updateProperties) bridge.updateProperties();
    if (bridge.updateObjectList) bridge.updateObjectList();
    renderAll();
    return;
  }
  state._selectedConstraint = null;

  const snapPt = findIntersectionAt(wx, wy);
  const newSel = findObjectAt(wx, wy);
  const threshold = SELECT_THRESHOLD / state.zoom;

  // Pomocné funkce
  const isObjSelected = (idx) => idx === state.selected || state.multiSelected.has(idx);
  const _addObj = (idx) => {
    if (state.selected === null && state.multiSelected.size === 0) {
      state.selected = idx;
    } else {
      if (state.selected !== null && state.multiSelected.size === 0) {
        state.multiSelected.add(state.selected);
      }
      state.multiSelected.add(idx);
      state.selected = idx;
    }
  };
  const _removeObj = (idx) => {
    state.multiSelected.delete(idx);
    if (idx === state.selected) {
      if (state.multiSelected.size > 0) {
        state.selected = [...state.multiSelected].pop();
        if (state.multiSelected.size === 1) {
          state.selected = state.multiSelected.values().next().value;
          state.multiSelected.clear();
        }
      } else {
        state.selected = null;
      }
    }
  };
  const hasAnySelection = () =>
    state.selected !== null || state.multiSelected.size > 0
    || state.multiSelectedSegments.size > 0
    || (state.selectedPoint && state.selectedPoint.length > 0);

  // ───────────────────────────────────────────────────────────
  // 1) Klik do prázdna (žádný objekt)
  // ───────────────────────────────────────────────────────────
  if (newSel === null) {
    if (snapPt) {
      // Blízko snap bodu bez objektu → toggle bod
      _toggleSelectedPoint(snapPt);
    }
    // Prázdné místo → zachovat výběr objektů/bodů, ale vyčistit zombie segmenty
    if (state.multiSelectedSegments.size > 0) {
      state.selectedSegment = null;
      state._selectedSegmentObjIdx = null;
      state.multiSelectedSegments.clear();
    }
  }
  // ───────────────────────────────────────────────────────────
  // 2) Klik na objekt
  // ───────────────────────────────────────────────────────────
  else {
    const obj = state.objects[newSel];
    const isSegmentable = obj.type === 'polyline' || obj.type === 'rect';
    const objAlreadySelected = isObjSelected(newSel);
    const hasSegsForObj = state.multiSelectedSegments.has(newSel);

    if (isSegmentable && hasSegsForObj) {
      // ── Objekt už má segmenty ──
      // Blízko snap bodu → toggle bod místo segmentu
      const vertexPt = _findObjVertexAt(obj, wx, wy, threshold * 0.4);
      if (vertexPt) {
        _toggleSelectedPoint(vertexPt);
      } else {
        const clickedSeg = findSegmentAt(obj, wx, wy);
        _toggleSegInMap(newSel, clickedSeg);
      }
    } else if (isSegmentable && objAlreadySelected) {
      // ── Segmentovatelný objekt je vybrán celý, 2. klik ──
      // Blízko snap bodu → toggle bod
      const vertexPt = _findObjVertexAt(obj, wx, wy, threshold * 0.4);
      if (vertexPt) {
        _toggleSelectedPoint(vertexPt);
      } else {
        // Na těle segmentu → vstup do segment mode
        _removeObj(newSel);
        const clickedSeg = findSegmentAt(obj, wx, wy);
        _addSegToMap(newSel, clickedSeg);
      }
    } else if (objAlreadySelected) {
      // ── Non-segmentable objekt je vybrán, 2. klik ──
      // Blízko snap bodu → toggle bod
      const vertexPt = _findObjVertexAt(obj, wx, wy, threshold * 0.5);
      if (vertexPt) {
        _toggleSelectedPoint(vertexPt);
      } else {
        // Daleko → odebrat z výběru
        _removeObj(newSel);
      }
    } else {
      // ── Objekt není vybrán ──
      // Pokud klik je velmi přesně na koncovém snap bodu → vybrat bod přímo
      // (ne midpoint, ne quarter) – aby šlo vybírat koncové body na 1 klik
      if (snapPt) {
        const snapDist = Math.hypot(snapPt.x - wx, snapPt.y - wy);
        if (snapDist < threshold * 0.35) {
          // Zkontrolovat, jestli snap bod patří kliknutému objektu
          const objPts = getObjectSnapPoints(obj);
          const matchingPt = objPts.find(p => Math.hypot(p.x - snapPt.x, p.y - snapPt.y) < 1e-6);
          if (matchingPt && !matchingPt.mid && !matchingPt.quarter) {
            // Koncový bod objektu – vybrat bod přímo
            _toggleSelectedPoint(snapPt);
          } else if (matchingPt && matchingPt.quarter) {
            // Quadrant kružnice – vybrat bod jen při velmi přesném kliku
            if (snapDist < threshold * 0.15) {
              _toggleSelectedPoint(snapPt);
            } else {
              _addObj(newSel);
            }
          } else if (matchingPt) {
            // Midpoint/quarter – vybrat celý objekt
            _addObj(newSel);
          } else {
            // Snap bod nepatří tomuto objektu (průsečík apod.)
            _toggleSelectedPoint(snapPt);
          }
        } else {
          _addObj(newSel);
        }
      } else {
        _addObj(newSel);
      }
    }
  }

  if (bridge.updateProperties) bridge.updateProperties();
  if (bridge.updateObjectList) bridge.updateObjectList();
  renderAll();
}

/**
 * Najde index segmentu polyline nejblíž bodu [wx,wy].
 * @param {import('./types.js').PolylineObject} obj
 * @param {number} wx
 * @param {number} wy
 * @returns {number|null}
 */
export function findSegmentAt(obj, wx, wy) {
  if (obj.type === 'rect') {
    const rc = getRectCorners(obj);
    let minD = Infinity, bestIdx = null;
    for (let i = 0; i < 4; i++) {
      const d = distPointToSegment(wx, wy, rc[i].x, rc[i].y, rc[(i + 1) % 4].x, rc[(i + 1) % 4].y);
      if (d < minD) { minD = d; bestIdx = i; }
    }
    return bestIdx;
  }
  if (obj.type !== 'polyline') return null;
  const n = obj.vertices.length;
  if (n < 2) return null;
  const segCount = obj.closed ? n : n - 1;
  let minD = Infinity, bestIdx = null;
  for (let i = 0; i < segCount; i++) {
    const p1 = obj.vertices[i];
    const p2 = obj.vertices[(i + 1) % n];
    const b = obj.bulges[i] || 0;
    let d;
    if (b === 0) {
      d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
    } else {
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        const distToCircle = Math.abs(Math.hypot(wx - arc.cx, wy - arc.cy) - arc.r);
        const angle = Math.atan2(wy - arc.cy, wx - arc.cx);
        if (isAngleBetween(angle, arc.startAngle, arc.endAngle, arc.ccw)) {
          d = distToCircle;
        } else {
          d = Math.min(Math.hypot(wx - p1.x, wy - p1.y), Math.hypot(wx - p2.x, wy - p2.y));
        }
      } else {
        d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
      }
    }
    if (d < minD) { minD = d; bestIdx = i; }
  }
  return bestIdx;
}

/**
 * Vzdálenost bodu od objektu.
 * @param {import('./types.js').DrawObject} obj
 * @param {number} wx
 * @param {number} wy
 * @returns {number}
 */
export function distToObject(obj, wx, wy) {
  switch (obj.type) {
    case "point":
      // Coord label (kóta souřadnic) – hit-test zahrnuje leader čáru, shelf a text
      if (obj.isCoordLabel && obj.x != null && obj.y != null) {
        const leaderWorld = 30 / state.zoom;
        // Text "Z77.526 X139.359" je cca 120–170px → pokrýt dostatečně
        const textWorld = 130 / state.zoom;
        // Leader jde doprava a nahoru v world coords (screen: +X, -Y → world: +X, +Y)
        const ex = obj.x + leaderWorld;
        const ey = obj.y + leaderWorld;
        const dPoint = Math.hypot(wx - obj.x, wy - obj.y);
        const dLeader = distPointToSegment(wx, wy, obj.x, obj.y, ex, ey);
        // Shelf + text oblast jako jeden segment pokrývající celý text
        const dText = distPointToSegment(wx, wy, ex, ey, ex + textWorld, ey);
        // Text je těsně nad shelf čárou → tolerance výšky textu
        const textH = 20 / state.zoom;
        const dTextArea = (wx >= ex - 2 / state.zoom && wx <= ex + textWorld && Math.abs(wy - ey) < textH)
          ? 0 : Infinity;
        return Math.min(dPoint, dLeader, dText, dTextArea);
      }
      return Math.hypot(wx - obj.x, wy - obj.y);
    case "line":
    case "constr":
      // Úhlová kóta – hit-test na oblouk, referenční čáry a text
      if (obj.isDimension && obj.dimType === 'angular' && obj.dimCenterX != null && obj.dimCenterY != null) {
        const cx = obj.dimCenterX, cy = obj.dimCenterY;
        const r = (obj.dimRadius || 20) * 0.8;
        const dCenter = distPointToSegment(wx, wy, cx, cy, obj.x1, obj.y1);
        const dCenter2 = distPointToSegment(wx, wy, cx, cy, obj.x2, obj.y2);
        const dArc = Math.abs(Math.hypot(wx - cx, wy - cy) - r);
        // Text je na středu oblouku – přidat hit area kolem textu
        const ang1 = Math.atan2(obj.y1 - cy, obj.x1 - cx);
        const ang2 = Math.atan2(obj.y2 - cy, obj.x2 - cx);
        const midAng = (ang1 + ang2) / 2;
        const textX = cx + r * Math.cos(midAng);
        const textY = cy + r * Math.sin(midAng);
        const textR = 15 / state.zoom;
        const dText = Math.max(0, Math.hypot(wx - textX, wy - textY) - textR);
        return Math.min(dCenter, dCenter2, dArc, dText);
      }
      // Lineární kóta – hit-test na kótovací čáru, referenční čáry a text
      if (obj.isDimension && obj.dimSrcX1 != null && obj.dimSrcY1 != null && obj.dimSrcX2 != null && obj.dimSrcY2 != null) {
        const dMain = distPointToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);
        const dRef1 = distPointToSegment(wx, wy, obj.dimSrcX1, obj.dimSrcY1, obj.x1, obj.y1);
        const dRef2 = distPointToSegment(wx, wy, obj.dimSrcX2, obj.dimSrcY2, obj.x2, obj.y2);
        // Text je na středu kótovací čáry – rozšířit hit oblast o text
        const tmx = (obj.x1 + obj.x2) / 2;
        const tmy = (obj.y1 + obj.y2) / 2;
        const textR = 20 / state.zoom;
        const dText = Math.max(0, Math.hypot(wx - tmx, wy - tmy) - textR);
        return Math.min(dMain, dRef1, dRef2, dText);
      }
      // Průměrová/radiální kóta – hit-test na kótovací čáru a text
      if (obj.isDimension && (obj.dimType === 'diameter' || obj.dimType === 'radius')) {
        const dLine = distPointToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);
        const tmx = (obj.x1 + obj.x2) / 2;
        const tmy = (obj.y1 + obj.y2) / 2;
        const textR = 20 / state.zoom;
        const dText = Math.max(0, Math.hypot(wx - tmx, wy - tmy) - textR);
        return Math.min(dLine, dText);
      }
      return distPointToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);
    case "circle":
      return Math.abs(Math.hypot(wx - obj.cx, wy - obj.cy) - obj.r);
    case "arc": {
      const dist = Math.abs(
        Math.hypot(wx - obj.cx, wy - obj.cy) - obj.r,
      );
      const angle = Math.atan2(wy - obj.cy, wx - obj.cx);
      return isAngleBetween(angle, obj.startAngle, obj.endAngle, obj.ccw)
        ? dist
        : dist + ARC_OUTSIDE_PENALTY;
    }
    case "rect": {
      const rc = getRectCorners(obj);
      const d1 = distPointToSegment(wx, wy, rc[0].x, rc[0].y, rc[1].x, rc[1].y);
      const d2 = distPointToSegment(wx, wy, rc[1].x, rc[1].y, rc[2].x, rc[2].y);
      const d3 = distPointToSegment(wx, wy, rc[2].x, rc[2].y, rc[3].x, rc[3].y);
      const d4 = distPointToSegment(wx, wy, rc[3].x, rc[3].y, rc[0].x, rc[0].y);
      return Math.min(d1, d2, d3, d4);
    }
    case "polyline": {
      let minD = Infinity;
      const n = obj.vertices.length;
      const segCount = obj.closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        const b = obj.bulges[i] || 0;
        let d;
        if (b === 0) {
          d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
        } else {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            const distToCircle = Math.abs(Math.hypot(wx - arc.cx, wy - arc.cy) - arc.r);
            const angle = Math.atan2(wy - arc.cy, wx - arc.cx);
            if (isAngleBetween(angle, arc.startAngle, arc.endAngle, arc.ccw)) {
              d = distToCircle;
            } else {
              d = Math.min(Math.hypot(wx - p1.x, wy - p1.y), Math.hypot(wx - p2.x, wy - p2.y));
            }
          } else {
            d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
          }
        }
        if (d < minD) minD = d;
      }
      return minD;
    }
    case "text": {
      // Pokud text leží na cestě (pathMode), testuj vzdálenost k cestě
      // s mírnou prioritou (× 0.4) aby text vyhrál nad podkladovou linií/obloukem
      if (obj.pathMode && obj.pathMode !== 'none' && obj.pathObjectId != null) {
        const pathObj = state.objects[obj.pathObjectId];
        if (pathObj) {
          if (obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
            return distPointToSegment(wx, wy, pathObj.x1, pathObj.y1, pathObj.x2, pathObj.y2) * 0.4;
          }
          if (obj.pathMode === 'arc' && pathObj.type === 'arc') {
            const dx2 = wx - pathObj.cx, dy2 = wy - pathObj.cy;
            const distToCenter = Math.hypot(dx2, dy2);
            return Math.abs(distToCenter - pathObj.r) * 0.4;
          }
          if (obj.pathMode === 'circle' && pathObj.type === 'circle') {
            const dx2 = wx - pathObj.cx, dy2 = wy - pathObj.cy;
            const distToCenter = Math.hypot(dx2, dy2);
            return Math.abs(distToCenter - pathObj.r) * 0.4;
          }
        }
      }
      // Vzdálenost k bounding boxu textu
      const fSize = obj.fontSize || 14;
      const spacingFactor = 1 + (obj.letterSpacing || 0) / fSize * 0.5;
      const boldFactor = obj.bold ? 1.1 : 1;
      const tw = (obj.text || '').length * fSize * 0.6 * spacingFactor * boldFactor;
      const th = fSize * 1.2;
      const pad = fSize * 0.3;
      // World Y-up: textBaseline='bottom' → text jde nahoru od obj.y
      const bx1 = obj.x - pad, by1 = obj.y - pad, bx2 = obj.x + tw + pad, by2 = obj.y + th + pad;
      if (wx >= bx1 && wx <= bx2 && wy >= by1 && wy <= by2) return 0;
      // Vzdálenost k nejbližšímu bodu boxu
      const cx = Math.max(bx1, Math.min(wx, bx2));
      const cy = Math.max(by1, Math.min(wy, by2));
      return Math.hypot(wx - cx, wy - cy);
    }
    default:
      return Infinity;
  }
}

// ────────────────────────────────
// ── VÝPOČET PRŮSEČÍKŮ ──
// ────────────────────────────────

/**
 * Vrátí úsečkové segmenty objektu.
 * @param {import('./types.js').DrawObject} obj
 * @returns {import('./types.js').LineSeg[]}
 */
export function getLines(obj) {
  if (obj.type === "line" || obj.type === "constr")
    return [
      {
        x1: obj.x1,
        y1: obj.y1,
        x2: obj.x2,
        y2: obj.y2,
        isConstr: obj.type === "constr",
      },
    ];
  if (obj.type === "rect") {
    const rc = getRectCorners(obj);
    return [
      { x1: rc[0].x, y1: rc[0].y, x2: rc[1].x, y2: rc[1].y },
      { x1: rc[1].x, y1: rc[1].y, x2: rc[2].x, y2: rc[2].y },
      { x1: rc[2].x, y1: rc[2].y, x2: rc[3].x, y2: rc[3].y },
      { x1: rc[3].x, y1: rc[3].y, x2: rc[0].x, y2: rc[0].y },
    ];
  }
  if (obj.type === "polyline") {
    const lines = [];
    const n = obj.vertices.length;
    const segCount = obj.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      if ((obj.bulges[i] || 0) === 0) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
    }
    return lines;
  }
  return [];
}

/**
 * Vrátí kružnicové/obloukové segmenty objektu.
 * @param {import('./types.js').DrawObject} obj
 * @returns {import('./types.js').CircleSeg[]}
 */
export function getCircles(obj) {
  if (obj.type === "circle")
    return [{ cx: obj.cx, cy: obj.cy, r: obj.r }];
  if (obj.type === "arc")
    return [
      {
        cx: obj.cx,
        cy: obj.cy,
        r: obj.r,
        startAngle: obj.startAngle,
        endAngle: obj.endAngle,
        ccw: obj.ccw,
      },
    ];
  if (obj.type === "polyline") {
    const arcs = [];
    const n = obj.vertices.length;
    const segCount = obj.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const b = obj.bulges[i] || 0;
      if (b !== 0) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        const arc = bulgeToArc(p1, p2, b);
        if (arc) {
          arcs.push({
            cx: arc.cx,
            cy: arc.cy,
            r: arc.r,
            startAngle: arc.startAngle,
            endAngle: arc.endAngle,
            ccw: arc.ccw,
          });
        }
      }
    }
    return arcs;
  }
  return [];
}

/**
 * Průsečík dvou úseček / konstrukčních přímek.
 * @param {import('./types.js').LineSeg} l1
 * @param {import('./types.js').LineSeg} l2
 * @returns {import('./types.js').Point2D[]}
 */
export function intersectLineLine(l1, l2) {
  const { x1, y1, x2, y2 } = l1;
  const { x1: x3, y1: y3, x2: x4, y2: y4 } = l2;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return [];
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  const tOk = l1.isConstr ? true : t >= -1e-9 && t <= 1 + 1e-9;
  const uOk = l2.isConstr ? true : u >= -1e-9 && u <= 1 + 1e-9;
  if (tOk && uOk) {
    return [{ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) }];
  }
  return [];
}

/**
 * Průsečíky přímky a kružnice/oblouku.
 * @param {import('./types.js').LineSeg} line
 * @param {import('./types.js').CircleSeg} circle
 * @returns {import('./types.js').Point2D[]}
 */
export function intersectLineCircle(line, circle) {
  const { x1, y1, x2, y2 } = line;
  const { cx, cy, r } = circle;
  const dx = x2 - x1,
    dy = y2 - y1;
  const fx = x1 - cx,
    fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return []; // Degenerovaná úsečka (nulová délka)
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  // Tolerance pro tečné případy – diskriminant může být mírně záporný
  // kvůli floating-point nepřesnosti; škálujeme s velikostí dat
  const discTol = 1e-6 * Math.max(1, a);
  if (disc < -discTol) return [];
  if (disc < 0) disc = 0;
  disc = Math.sqrt(disc);
  const results = [];
  for (const sign of [-1, 1]) {
    const t = (-b + sign * disc) / (2 * a);
    const tOk = line.isConstr ? true : t >= -1e-9 && t <= 1 + 1e-9;
    if (tOk) {
      const pt = { x: x1 + t * dx, y: y1 + t * dy };
      if (circle.startAngle !== undefined) {
        const angle = Math.atan2(pt.y - cy, pt.x - cx);
        if (!isAngleBetween(angle, circle.startAngle, circle.endAngle, circle.ccw))
          continue;
      }
      results.push(pt);
    }
  }
  // Deduplikace tečných bodů – při tečnosti disc ≈ 0 vzniknou dva téměř totožné body
  if (results.length === 2 &&
      Math.hypot(results[0].x - results[1].x, results[0].y - results[1].y) < 1e-4) {
    results.pop();
  }
  return results;
}

/**
 * Průsečíky dvou kružnic/oblouků.
 * @param {import('./types.js').CircleSeg} c1
 * @param {import('./types.js').CircleSeg} c2
 * @returns {import('./types.js').Point2D[]}
 */
export function intersectCircleCircle(c1, c2) {
  const dx = c2.cx - c1.cx,
    dy = c2.cy - c1.cy;
  const d = Math.hypot(dx, dy);
  if (
    d > c1.r + c2.r + 1e-10 ||
    d < Math.abs(c1.r - c2.r) - 1e-10 ||
    d < 1e-10
  )
    return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const px = c1.cx + (a * dx) / d,
    py = c1.cy + (a * dy) / d;
  const results = [];
  for (const sign of [-1, 1]) {
    const pt = {
      x: px + (sign * h * dy) / d,
      y: py - (sign * h * dx) / d,
    };
    let ok = true;
    if (c1.startAngle !== undefined) {
      const ang = Math.atan2(pt.y - c1.cy, pt.x - c1.cx);
      if (!isAngleBetween(ang, c1.startAngle, c1.endAngle, c1.ccw)) ok = false;
    }
    if (c2.startAngle !== undefined) {
      const ang = Math.atan2(pt.y - c2.cy, pt.x - c2.cx);
      if (!isAngleBetween(ang, c2.startAngle, c2.endAngle, c2.ccw)) ok = false;
    }
    if (ok) results.push(pt);
  }
  if (
    results.length === 2 &&
    Math.hypot(results[0].x - results[1].x, results[0].y - results[1].y) <
      1e-4
  )
    results.pop();
  return results;
}

/** Koncové body objektu (pro filtrování napojení vs průsečíků). */
function getObjectEndpoints(obj) {
  switch (obj.type) {
    case 'line':
    case 'constr':
      return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    case 'arc':
      return [
        { x: obj.cx + obj.r * Math.cos(obj.startAngle), y: obj.cy + obj.r * Math.sin(obj.startAngle) },
        { x: obj.cx + obj.r * Math.cos(obj.endAngle), y: obj.cy + obj.r * Math.sin(obj.endAngle) },
      ];
    case 'rect':
      return [
        { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y1 },
        { x: obj.x2, y: obj.y2 }, { x: obj.x1, y: obj.y2 },
      ];
    case 'polyline':
      return obj.vertices.map(v => ({ x: v.x, y: v.y }));
    default:
      return [];
  }
}

/** Přepočítá všechny průsečíky mezi objekty. */
export function calculateAllIntersections() {
  const pts = [];
  const objs = state.objects;
  for (let i = 0; i < objs.length; i++) {
    if (objs[i].isDimension || objs[i].isCoordLabel || objs[i].skipIntersections) continue;
    for (let j = i + 1; j < objs.length; j++) {
      if (objs[j].isDimension || objs[j].isCoordLabel || objs[j].skipIntersections) continue;
      const lines1 = getLines(objs[i]),
        lines2 = getLines(objs[j]);
      const circs1 = getCircles(objs[i]),
        circs2 = getCircles(objs[j]);

      // Bod ležící na jiném objektu = průsečík (přesune bod přesně na objekt)
      const PT_TOL = 0.5;
      if (objs[i].type === 'point' && objs[j].type !== 'point') {
        const near = getNearestPointOnObject(objs[j], objs[i].x, objs[i].y);
        if (near && near.dist < PT_TOL) {
          objs[i].x = near.x;
          objs[i].y = near.y;
          pts.push({ x: near.x, y: near.y });
        }
        continue;
      }
      if (objs[j].type === 'point' && objs[i].type !== 'point') {
        const near = getNearestPointOnObject(objs[i], objs[j].x, objs[j].y);
        if (near && near.dist < PT_TOL) {
          objs[j].x = near.x;
          objs[j].y = near.y;
          pts.push({ x: near.x, y: near.y });
        }
        continue;
      }

      // Filtrování: bod na koncovém bodě obou objektů = napojení, ne průsečík
      const eps1 = getObjectEndpoints(objs[i]);
      const eps2 = getObjectEndpoints(objs[j]);
      const EP_TOL = 1e-4;
      const isSharedEndpoint = (pt) =>
        eps1.some(ep => Math.hypot(pt.x - ep.x, pt.y - ep.y) < EP_TOL)
        && eps2.some(ep => Math.hypot(pt.x - ep.x, pt.y - ep.y) < EP_TOL);

      for (const l1 of lines1)
        for (const l2 of lines2)
          for (const pt of intersectLineLine(l1, l2))
            if (!isSharedEndpoint(pt)) pts.push(pt);
      for (const l of lines1)
        for (const c of circs2)
          for (const pt of intersectLineCircle(l, c))
            if (!isSharedEndpoint(pt)) pts.push(pt);
      for (const l of lines2)
        for (const c of circs1)
          for (const pt of intersectLineCircle(l, c))
            if (!isSharedEndpoint(pt)) pts.push(pt);
      for (const c1 of circs1)
        for (const c2 of circs2)
          for (const pt of intersectCircleCircle(c1, c2))
            if (!isSharedEndpoint(pt)) pts.push(pt);
    }
  }
  const unique = [];
  for (const pt of pts) {
    if (!unique.some((u) => Math.hypot(u.x - pt.x, u.y - pt.y) < 1e-4))
      unique.push(pt);
  }
  state.intersections = unique;
  if (bridge.updateIntersectionList) bridge.updateIntersectionList();
  renderAll();
}

// ── Tečny z bodu ke kružnici ──
/**
 * @param {number} px
 * @param {number} py
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {import('./types.js').TangentLine[]}
 */
export function tangentsFromPointToCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d < r - 1e-9) return []; // bod uvnitř
  if (d < r + 1e-9) {
    // bod na kružnici – jedna tečna (kolmice)
    const nx = -dy / d, ny = dx / d;
    return [{ x1: px, y1: py, x2: px + nx * r, y2: py + ny * r }];
  }
  const L = Math.sqrt(d * d - r * r);
  const baseAngle = Math.atan2(dy, dx);
  const halfAngle = Math.acos(r / d);
  const results = [];
  for (const sign of [-1, 1]) {
    const a = baseAngle + sign * halfAngle;
    const tx = cx + r * Math.cos(a);
    const ty = cy + r * Math.sin(a);
    results.push({ x1: px, y1: py, x2: tx, y2: ty });
  }
  return results;
}

// ── Tečny dvou kružnic (vnější + vnitřní) ──
/**
 * @param {number} cx1
 * @param {number} cy1
 * @param {number} r1
 * @param {number} cx2
 * @param {number} cy2
 * @param {number} r2
 * @returns {import('./types.js').TangentLine[]}
 */
export function tangentsTwoCircles(cx1, cy1, r1, cx2, cy2, r2) {
  const results = [];
  const d = Math.hypot(cx2 - cx1, cy2 - cy1);
  if (d < 1e-9) return [];
  const angle = Math.atan2(cy2 - cy1, cx2 - cx1);

  // Vnější tečny
  if (d >= Math.abs(r1 - r2) - 1e-9) {
    const ratio = (r1 - r2) / d;
    const clampedRatio = Math.max(-1, Math.min(1, ratio));
    const alpha = Math.asin(clampedRatio);
    for (const sign of [-1, 1]) {
      const beta = angle + sign * (Math.PI / 2 - alpha);
      const tx1 = cx1 + r1 * Math.cos(beta);
      const ty1 = cy1 + r1 * Math.sin(beta);
      const tx2 = cx2 + r2 * Math.cos(beta);
      const ty2 = cy2 + r2 * Math.sin(beta);
      results.push({ x1: tx1, y1: ty1, x2: tx2, y2: ty2 });
    }
  }

  // Vnitřní tečny
  if (d >= r1 + r2 - 1e-9) {
    const ratio = (r1 + r2) / d;
    const clampedRatio = Math.max(-1, Math.min(1, ratio));
    const alpha = Math.asin(clampedRatio);
    for (const sign of [-1, 1]) {
      const beta = angle + sign * (Math.PI / 2 - alpha);
      const tx1 = cx1 + r1 * Math.cos(beta);
      const ty1 = cy1 + r1 * Math.sin(beta);
      const tx2 = cx2 - r2 * Math.cos(beta);
      const ty2 = cy2 - r2 * Math.sin(beta);
      results.push({ x1: tx1, y1: ty1, x2: tx2, y2: ty2 });
    }
  }

  return results;
}

// ── Offset objektu ──
/**
 * Vytvoří offsetovanou kopii objektu.
 * @param {import('./types.js').DrawObject} obj
 * @param {number} dist
 * @param {number} side  1 = vně/vpravo, -1 = uvnitř/vlevo
 * @returns {import('./types.js').DrawObject|null}
 */
// ── Pozice kružnice tečné k úsečce ──
export function circlePositionsTangentToLine(cx, cy, r, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return [];
  const nx = -dy / len, ny = dx / len;
  const t = ((cx - x1) * dx + (cy - y1) * dy) / (len * len);
  const footX = x1 + t * dx, footY = y1 + t * dy;
  // Filtrovat pozice kde tečný bod leží mimo konečnou úsečku
  if (t < -1e-9 || t > 1 + 1e-9) return [];
  return [
    { cx: footX + nx * r, cy: footY + ny * r },
    { cx: footX - nx * r, cy: footY - ny * r }
  ];
}

// ── Pozice kružnice tečné ke dvěma úsečkám ──
export function circlePositionsTangentToTwoLines(r, l1, l2) {
  const results = [];
  const offsets1 = lineOffsets(l1.x1, l1.y1, l1.x2, l1.y2, r);
  const offsets2 = lineOffsets(l2.x1, l2.y1, l2.x2, l2.y2, r);
  for (const o1 of offsets1) {
    for (const o2 of offsets2) {
      const pt = intersectInfiniteLines(o1, o2);
      if (pt) results.push({ cx: pt.x, cy: pt.y });
    }
  }
  // Filtrovat: tečný bod (projekce středu na úsečku) musí ležet na konečné úsečce
  return results.filter(p => {
    const t1 = projectionParam(p.cx, p.cy, l1.x1, l1.y1, l1.x2, l1.y2);
    const t2 = projectionParam(p.cx, p.cy, l2.x1, l2.y1, l2.x2, l2.y2);
    return t1 >= -1e-9 && t1 <= 1 + 1e-9 && t2 >= -1e-9 && t2 <= 1 + 1e-9;
  });
}

// ── Pozice kružnice tečné k úsečce A procházející bodem ──
/**
 * Najde středy kružnice s poloměrem r, která je tečná k přímce (x1,y1)-(x2,y2)
 * a zároveň prochází bodem (px,py).
 * Střed musí ležet ve vzdálenosti r od přímky A ve vzdálenosti r od bodu.
 * @returns {{cx: number, cy: number}[]}
 */
export function circlePositionsTangentToLineAndPoint(r, x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return [];
  const nx = -dy / len, ny = dx / len; // normála k přímce

  const results = [];
  // Dvě rovnoběžky s přímkou ve vzdálenosti r
  for (const sign of [1, -1]) {
    // Bod na rovnoběžce: (x1 + sign*nx*r, y1 + sign*ny*r) + t*(dx, dy)
    // Hledáme t tak, aby vzdálenost od (px, py) = r
    // Parametrický bod: Qx = x1 + sign*nx*r + t*dx, Qy = y1 + sign*ny*r + t*dy
    // (Qx - px)^2 + (Qy - py)^2 = r^2
    const ox = x1 + sign * nx * r - px;
    const oy = y1 + sign * ny * r - py;
    // (ox + t*dx)^2 + (oy + t*dy)^2 = r^2
    const a = dx * dx + dy * dy;
    const b = 2 * (ox * dx + oy * dy);
    const c = ox * ox + oy * oy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < -1e-9) continue;
    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    for (const s of [-1, 1]) {
      const t = (-b + s * sqrtDisc) / (2 * a);
      const cx = x1 + sign * nx * r + t * dx;
      const cy = y1 + sign * ny * r + t * dy;
      results.push({ cx, cy });
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce
  const filtered = results.filter(p => {
    const tp = projectionParam(p.cx, p.cy, x1, y1, x2, y2);
    return tp >= -1e-9 && tp <= 1 + 1e-9;
  });
  // Deduplikace tečných řešení (disc ≈ 0 → dva téměř totožné výsledky)
  const deduped = [];
  for (const p of filtered) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Kružnice procházející třemi body ──
/**
 * Najde kružnici procházející třemi body (opsaná kružnice).
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleThrough3Points(x1, y1, x2, y2, x3, y3) {
  const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(D) < 1e-10) return []; // kolineární body
  const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / D;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / D;
  const r = Math.hypot(cx - x1, cy - y1);
  return [{ cx, cy, r }];
}

// ── Kružnice tečná k úsečce a procházející dvěma body ──
/**
 * Najde kružnice, které jsou tečné k přímce a procházejí dvěma body.
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToLineAndTwoPoints(lx1, ly1, lx2, ly2, p1x, p1y, p2x, p2y) {
  const midX = (p1x + p2x) / 2, midY = (p1y + p2y) / 2;
  const dpx = p2x - p1x, dpy = p2y - p1y;
  const lenPP = Math.hypot(dpx, dpy);
  if (lenPP < 1e-10) return [];
  const perpDx = -dpy / lenPP, perpDy = dpx / lenPP;
  // Střed na osové souměrnosti P1P2: C(t) = (midX + t*perpDx, midY + t*perpDy)
  // r² = lenPP²/4 + t²
  const ldx = lx2 - lx1, ldy = ly2 - ly1;
  const lenL = Math.hypot(ldx, ldy);
  if (lenL < 1e-10) return [];
  const a = -ldy / lenL, b = ldx / lenL;
  const c = -(a * lx1 + b * ly1);
  // Vzdálenost středu od přímky: D(t) = D0 + t*D1
  const D0 = a * midX + b * midY + c;
  const D1 = a * perpDx + b * perpDy;
  // Podmínka: (D0 + t*D1)² = lenPP²/4 + t²
  const qa = D1 * D1 - 1;
  const qb = 2 * D0 * D1;
  const qc = D0 * D0 - lenPP * lenPP / 4;
  const results = [];
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) < 1e-10) return [];
    const t = -qc / qb;
    const cx = midX + t * perpDx, cy = midY + t * perpDy;
    const r = Math.sqrt(lenPP * lenPP / 4 + t * t);
    if (r > 1e-10) results.push({ cx, cy, r });
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < -1e-9) return [];
    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    for (const s of [-1, 1]) {
      const t = (-qb + s * sqrtDisc) / (2 * qa);
      const cx = midX + t * perpDx, cy = midY + t * perpDy;
      const r = Math.sqrt(lenPP * lenPP / 4 + t * t);
      if (r > 1e-10) results.push({ cx, cy, r });
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce
  const filtered = results.filter(p => {
    const tp = projectionParam(p.cx, p.cy, lx1, ly1, lx2, ly2);
    return tp >= -1e-9 && tp <= 1 + 1e-9;
  });
  // Deduplikace tečných řešení
  const deduped = [];
  for (const p of filtered) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Kružnice tečná ke dvěma úsečkám a procházející bodem ──
/**
 * Najde kružnice tečné ke dvěma přímkám a procházející bodem.
 * @param {{x1,y1,x2,y2}} l1
 * @param {{x1,y1,x2,y2}} l2
 * @param {number} px
 * @param {number} py
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToTwoLinesAndPoint(l1, l2, px, py) {
  const ldx1 = l1.x2 - l1.x1, ldy1 = l1.y2 - l1.y1;
  const len1 = Math.hypot(ldx1, ldy1);
  if (len1 < 1e-10) return [];
  const a1 = -ldy1 / len1, b1 = ldx1 / len1, c1 = -(a1 * l1.x1 + b1 * l1.y1);
  const ldx2 = l2.x2 - l2.x1, ldy2 = l2.y2 - l2.y1;
  const len2 = Math.hypot(ldx2, ldy2);
  if (len2 < 1e-10) return [];
  const a2 = -ldy2 / len2, b2 = ldx2 / len2, c2 = -(a2 * l2.x1 + b2 * l2.y1);
  const results = [];
  // Dvě osy úhlů: dist1 = ±dist2
  for (const sign of [1, -1]) {
    const ba = a1 - sign * a2, bb = b1 - sign * b2, bc = c1 - sign * c2;
    let bx0, by0, bdx, bdy;
    if (Math.abs(bb) > Math.abs(ba)) {
      bx0 = 0; by0 = -bc / bb; bdx = bb; bdy = -ba;
    } else if (Math.abs(ba) > 1e-10) {
      bx0 = -bc / ba; by0 = 0; bdx = bb; bdy = -ba;
    } else { continue; }
    // Střed na ose: (bx0 + t*bdx, by0 + t*bdy)
    // r = |a1*(bx0+t*bdx) + b1*(by0+t*bdy) + c1| = |E0 + t*E1|
    // r = dist(center, point)
    const E0 = a1 * bx0 + b1 * by0 + c1;
    const E1 = a1 * bdx + b1 * bdy;
    const ox = bx0 - px, oy = by0 - py;
    // (E0+t*E1)² = (ox+t*bdx)² + (oy+t*bdy)²
    const qa = E1 * E1 - (bdx * bdx + bdy * bdy);
    const qb = 2 * E0 * E1 - 2 * (ox * bdx + oy * bdy);
    const qc = E0 * E0 - (ox * ox + oy * oy);
    if (Math.abs(qa) < 1e-10) {
      if (Math.abs(qb) < 1e-10) continue;
      const t = -qc / qb;
      const cx = bx0 + t * bdx, cy = by0 + t * bdy;
      const r = Math.abs(E0 + t * E1);
      if (r > 1e-10) results.push({ cx, cy, r });
    } else {
      const disc = qb * qb - 4 * qa * qc;
      if (disc < -1e-9) continue;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      for (const s of [-1, 1]) {
        const t = (-qb + s * sqrtDisc) / (2 * qa);
        const cx = bx0 + t * bdx, cy = by0 + t * bdy;
        const r = Math.abs(E0 + t * E1);
        if (r > 1e-10) results.push({ cx, cy, r });
      }
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce u obou přímek
  const filtered = results.filter(p => {
    const t1 = projectionParam(p.cx, p.cy, l1.x1, l1.y1, l1.x2, l1.y2);
    const t2 = projectionParam(p.cx, p.cy, l2.x1, l2.y1, l2.x2, l2.y2);
    return t1 >= -1e-9 && t1 <= 1 + 1e-9 && t2 >= -1e-9 && t2 <= 1 + 1e-9;
  });
  // Deduplikace tečných řešení
  const deduped = [];
  for (const p of filtered) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Kružnice tečná ke třem úsečkám ──
/**
 * Najde kružnice tečné ke třem přímkám (vepsaná / připsané kružnice).
 * @param {{x1,y1,x2,y2}} l1
 * @param {{x1,y1,x2,y2}} l2
 * @param {{x1,y1,x2,y2}} l3
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToThreeLines(l1, l2, l3) {
  function lineNormal(l) {
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-10) return null;
    return { a: -dy / len, b: dx / len, c: -(-dy / len * l.x1 + dx / len * l.y1) };
  }
  const n1 = lineNormal(l1), n2 = lineNormal(l2), n3 = lineNormal(l3);
  if (!n1 || !n2 || !n3) return [];
  const results = [];
  for (const s2 of [1, -1]) {
    for (const s3 of [1, -1]) {
      // d1 = s2*d2, d1 = s3*d3 → lineární soustava pro (cx, cy)
      const eA1 = n1.a - s2 * n2.a, eB1 = n1.b - s2 * n2.b, eC1 = n1.c - s2 * n2.c;
      const eA2 = n1.a - s3 * n3.a, eB2 = n1.b - s3 * n3.b, eC2 = n1.c - s3 * n3.c;
      const det = eA1 * eB2 - eA2 * eB1;
      if (Math.abs(det) < 1e-10) continue;
      const cx = (-eC1 * eB2 + eC2 * eB1) / det;
      const cy = (-eA1 * eC2 + eA2 * eC1) / det;
      const r = Math.abs(n1.a * cx + n1.b * cy + n1.c);
      if (r > 1e-10) {
        const isDup = results.some(p => Math.hypot(p.cx - cx, p.cy - cy) < 1e-4);
        if (!isDup) results.push({ cx, cy, r });
      }
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce u všech tří přímek
  return results.filter(p => {
    const t1 = projectionParam(p.cx, p.cy, l1.x1, l1.y1, l1.x2, l1.y2);
    const t2 = projectionParam(p.cx, p.cy, l2.x1, l2.y1, l2.x2, l2.y2);
    const t3 = projectionParam(p.cx, p.cy, l3.x1, l3.y1, l3.x2, l3.y2);
    return t1 >= -1e-9 && t1 <= 1 + 1e-9 && t2 >= -1e-9 && t2 <= 1 + 1e-9 && t3 >= -1e-9 && t3 <= 1 + 1e-9;
  });
}

// ── Kružnice tečná k jiné kružnici a procházející dvěma body ──
/**
 * Najde kružnice tečné k dané kružnici a procházející dvěma body.
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToCircleAndTwoPoints(ccx, ccy, cR, p1x, p1y, p2x, p2y) {
  const midX = (p1x + p2x) / 2, midY = (p1y + p2y) / 2;
  const dpx = p2x - p1x, dpy = p2y - p1y;
  const lenPP = Math.hypot(dpx, dpy);
  if (lenPP < 1e-10) return [];
  const perpDx = -dpy / lenPP, perpDy = dpx / lenPP;
  const halfLenSq = lenPP * lenPP / 4;
  const ox = midX - ccx, oy = midY - ccy;
  const F0 = ox * ox + oy * oy;
  const F1 = 2 * (ox * perpDx + oy * perpDy);
  // (F1²-4R²)t² + 2GF1·t + G²-4R²·halfLenSq = 0, kde G = F0 - halfLenSq - R²
  const G = F0 - halfLenSq - cR * cR;
  const qa = F1 * F1 - 4 * cR * cR;
  const qb = 2 * G * F1;
  const qc = G * G - 4 * cR * cR * halfLenSq;
  const results = [];
  function tryT(t) {
    const cx = midX + t * perpDx, cy = midY + t * perpDy;
    const r = Math.sqrt(halfLenSq + t * t);
    if (r < 1e-10) return;
    const dist = Math.hypot(cx - ccx, cy - ccy);
    if (Math.abs(dist - r - cR) < 1e-4 || Math.abs(dist - Math.abs(r - cR)) < 1e-4) {
      results.push({ cx, cy, r });
    }
  }
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) > 1e-10) tryT(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= -1e-9) {
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      tryT((-qb + sqrtDisc) / (2 * qa));
      tryT((-qb - sqrtDisc) / (2 * qa));
    }
  }
  // Deduplikace tečných řešení
  const deduped = [];
  for (const p of results) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Extrakce úsečkových dat z polyline segmentu ──
/**
 * Vrátí úsečkové souřadnice pro daný segment polyline.
 * @param {import('./types.js').PolylineObject} obj
 * @param {number} segIdx
 * @returns {{x1: number, y1: number, x2: number, y2: number}|null}
 */
export function getPolylineSegmentAsLine(obj, segIdx) {
  if (!obj || obj.type !== 'polyline') return null;
  const n = obj.vertices.length;
  if (segIdx < 0 || segIdx >= (obj.closed ? n : n - 1)) return null;
  const p1 = obj.vertices[segIdx];
  const p2 = obj.vertices[(segIdx + 1) % n];
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

/** Parametr projekce bodu na přímku: 0 = začátek úsečky, 1 = konec. */
function projectionParam(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-20) return 0;
  return ((px - x1) * dx + (py - y1) * dy) / len2;
}

function lineOffsets(x1, y1, x2, y2, d) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return [];
  const nx = -dy / len * d, ny = dx / len * d;
  return [
    { x1: x1 + nx, y1: y1 + ny, x2: x2 + nx, y2: y2 + ny },
    { x1: x1 - nx, y1: y1 - ny, x2: x2 - nx, y2: y2 - ny }
  ];
}

export function intersectInfiniteLines(l1, l2) {
  const d1x = l1.x2 - l1.x1, d1y = l1.y2 - l1.y1;
  const d2x = l2.x2 - l2.x1, d2y = l2.y2 - l2.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((l2.x1 - l1.x1) * d2y - (l2.y1 - l1.y1) * d2x) / denom;
  return { x: l1.x1 + t * d1x, y: l1.y1 + t * d1y };
}

/**
 * Projekce bodu na přímku (pata kolmice).
 * @param {number} px
 * @param {number} py
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {{x: number, y: number}}
 */
export function projectPointToLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-20) return { x: x1, y: y1 };
  const t = ((px - x1) * dx + (py - y1) * dy) / len2;
  return { x: x1 + t * dx, y: y1 + t * dy };
}

/** Kolmá vzdálenost bodu od nekonečné přímky definované dvěma body. */
export function distPointToInfiniteLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-20) return Math.hypot(px - x1, py - y1);
  return Math.abs(dx * (y1 - py) - dy * (x1 - px)) / len;
}

/** Úhel mezi dvěma úsečkami (0–180°). */
export function angleBetweenLines(l1, l2) {
  const dx1 = l1.x2 - l1.x1, dy1 = l1.y2 - l1.y1;
  const dx2 = l2.x2 - l2.x1, dy2 = l2.y2 - l2.y1;
  const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
  if (len1 < 1e-10 || len2 < 1e-10) return 0;
  const dot = dx1 * dx2 + dy1 * dy2;
  const cos = Math.max(-1, Math.min(1, dot / (len1 * len2)));
  return Math.acos(cos) * 180 / Math.PI;
}

export function offsetObject(obj, dist, side) {
  // side: 1 = vně/vpravo, -1 = uvnitř/vlevo
  const d = dist * side;
  switch (obj.type) {
    case 'line':
    case 'constr': {
      const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-10) return null;
      const nx = -dy / len * d, ny = dx / len * d;
      return {
        type: obj.type,
        x1: obj.x1 + nx, y1: obj.y1 + ny,
        x2: obj.x2 + nx, y2: obj.y2 + ny,
        name: `${obj.name || obj.type} (offset)`,
        dashed: obj.dashed,
        color: obj.color,
      };
    }
    case 'circle': {
      const newR = obj.r + d;
      if (newR < 1e-10) return null;
      return {
        type: 'circle',
        cx: obj.cx, cy: obj.cy, r: newR,
        name: `${obj.name || 'Kružnice'} (offset)`,
        color: obj.color,
      };
    }
    case 'arc': {
      const newR = obj.r + d;
      if (newR < 1e-10) return null;
      return {
        type: 'arc',
        cx: obj.cx, cy: obj.cy, r: newR,
        startAngle: obj.startAngle, endAngle: obj.endAngle,
        name: `${obj.name || 'Oblouk'} (offset)`,
        color: obj.color,
      };
    }
    case 'rect': {
      const x1 = Math.min(obj.x1, obj.x2), y1 = Math.min(obj.y1, obj.y2);
      const x2 = Math.max(obj.x1, obj.x2), y2 = Math.max(obj.y1, obj.y2);
      const nx1 = x1 - d, ny1 = y1 - d;
      const nx2 = x2 + d, ny2 = y2 + d;
      if (nx2 <= nx1 || ny2 <= ny1) return null;
      return {
        type: 'rect',
        x1: nx1, y1: ny1, x2: nx2, y2: ny2,
        name: `${obj.name || 'Obdélník'} (offset)`,
        color: obj.color,
      };
    }
    case 'polyline': {
      const verts = obj.vertices;
      const n = verts.length;
      const segCount = obj.closed ? n : n - 1;
      // Offset each segment and compute new vertices
      const offsetLines = [];
      for (let i = 0; i < segCount; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % n];
        const sdx = p2.x - p1.x, sdy = p2.y - p1.y;
        const slen = Math.hypot(sdx, sdy);
        if (slen < 1e-10) { offsetLines.push(null); continue; }
        const nx = -sdy / slen * d, ny = sdx / slen * d;
        offsetLines.push({
          x1: p1.x + nx, y1: p1.y + ny,
          x2: p2.x + nx, y2: p2.y + ny,
        });
      }
      // Trim/extend at corners
      const newVerts = [];
      for (let i = 0; i < segCount; i++) {
        const curr = offsetLines[i];
        const prev = offsetLines[(i - 1 + segCount) % segCount];
        if (!curr) continue;
        if (obj.closed || i > 0) {
          if (prev) {
            const inter = lineLineIntersect(prev, curr);
            if (inter) { newVerts.push({ x: inter.x, y: inter.y }); continue; }
          }
        }
        newVerts.push({ x: curr.x1, y: curr.y1 });
      }
      // Přidat koncový bod
      if (!obj.closed && offsetLines.length > 0) {
        const last = offsetLines[offsetLines.length - 1];
        if (last) newVerts.push({ x: last.x2, y: last.y2 });
      }
      if (newVerts.length < 2) return null;
      return {
        type: 'polyline',
        vertices: newVerts,
        bulges: new Array(obj.closed ? newVerts.length : newVerts.length - 1).fill(0),
        closed: obj.closed,
        name: `${obj.name || 'Kontura'} (offset)`,
        color: obj.color,
      };
    }
    default:
      return null;
  }
}

function lineLineIntersect(l1, l2) {
  const dx1 = l1.x2 - l1.x1, dy1 = l1.y2 - l1.y1;
  const dx2 = l2.x2 - l2.x1, dy2 = l2.y2 - l2.y1;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((l2.x1 - l1.x1) * dy2 - (l2.y1 - l1.y1) * dx2) / denom;
  return { x: l1.x1 + t * dx1, y: l1.y1 + t * dy1 };
}

// ── Zrcadlení objektu ──
/**
 * @param {import('./types.js').DrawObject} obj
 * @param {'x'|'z'|'custom'} axis
 * @param {import('./types.js').Point2D} [p1]
 * @param {import('./types.js').Point2D} [p2]
 * @returns {import('./types.js').DrawObject}
 */
export function mirrorObject(obj, axis, p1, p2) {
  // axis: 'x' (vodorovná osa), 'z' (svislá osa), 'custom' (2 body p1,p2)
  const copy = deepClone(obj);
  delete copy.id;

  // Natočení nulového bodu
  const npAngle = (state.nullPointActive && state.nullPointAngle)
    ? (state.nullPointAngle * Math.PI / 180) : 0;

  function mirrorPoint(px, py) {
    if (axis === 'x') {
      // Zrcadlení přes vodorovnou osu (otočenou o npAngle)
      // Transformace: otočit do lokálního systému, zrcadlit Y, otočit zpět
      const cos = Math.cos(npAngle), sin = Math.sin(npAngle);
      const lx = px * cos + py * sin;
      const ly = -px * sin + py * cos;
      const my = -ly; // zrcadlení Y
      return { x: lx * cos - my * sin, y: lx * sin + my * cos };
    }
    if (axis === 'z') {
      // Zrcadlení přes svislou osu (otočenou o npAngle)
      const cos = Math.cos(npAngle), sin = Math.sin(npAngle);
      const lx = px * cos + py * sin;
      const ly = -px * sin + py * cos;
      const mx = -lx; // zrcadlení X
      return { x: mx * cos - ly * sin, y: mx * sin + ly * cos };
    }
    // Vlastní osa: reflexe přes přímku p1-p2
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return { x: px, y: py };
    const t = ((px - p1.x) * dx + (py - p1.y) * dy) / lenSq;
    const projX = p1.x + t * dx, projY = p1.y + t * dy;
    return { x: 2 * projX - px, y: 2 * projY - py };
  }

  switch (copy.type) {
    case 'point': {
      const m = mirrorPoint(copy.x, copy.y);
      copy.x = m.x; copy.y = m.y;
      break;
    }
    case 'line':
    case 'constr': {
      const m1 = mirrorPoint(copy.x1, copy.y1);
      const m2 = mirrorPoint(copy.x2, copy.y2);
      copy.x1 = m1.x; copy.y1 = m1.y;
      copy.x2 = m2.x; copy.y2 = m2.y;
      break;
    }
    case 'circle': {
      const m = mirrorPoint(copy.cx, copy.cy);
      copy.cx = m.x; copy.cy = m.y;
      break;
    }
    case 'arc': {
      const m = mirrorPoint(copy.cx, copy.cy);
      copy.cx = m.x; copy.cy = m.y;
      // Zrcadlení flipne direction – prohodíme start/end a obrátíme
      const sP = mirrorPoint(
        obj.cx + obj.r * Math.cos(obj.startAngle),
        obj.cy + obj.r * Math.sin(obj.startAngle)
      );
      const eP = mirrorPoint(
        obj.cx + obj.r * Math.cos(obj.endAngle),
        obj.cy + obj.r * Math.sin(obj.endAngle)
      );
      copy.startAngle = Math.atan2(eP.y - m.y, eP.x - m.x);
      copy.endAngle = Math.atan2(sP.y - m.y, sP.x - m.x);
      break;
    }
    case 'rect': {
      const m1 = mirrorPoint(copy.x1, copy.y1);
      const m2 = mirrorPoint(copy.x2, copy.y2);
      copy.x1 = m1.x; copy.y1 = m1.y;
      copy.x2 = m2.x; copy.y2 = m2.y;
      break;
    }
    case 'polyline': {
      copy.vertices = copy.vertices.map(v => {
        const m = mirrorPoint(v.x, v.y);
        return { x: m.x, y: m.y };
      });
      // Zrcadlení obrací bulge znaménka
      copy.bulges = copy.bulges.map(b => -b);
      break;
    }
  }
  copy.name = `${obj.name || obj.type} (zrcadlo)`;
  return copy;
}

// ── Lineární pole ──
/**
 * @param {import('./types.js').DrawObject} obj
 * @param {number} dx
 * @param {number} dy
 * @param {number} count
 * @param {number} [dx2=0]
 * @param {number} [dy2=0]
 * @param {number} [count2=0]
 * @returns {import('./types.js').DrawObject[]}
 */
export function linearArray(obj, dx, dy, count, dx2 = 0, dy2 = 0, count2 = 0) {
  const copies = [];
  const rows = count2 > 0 ? count2 : 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i <= count; i++) {
      if (i === 0 && j === 0) continue; // skip original
      const copy = deepClone(obj);
      delete copy.id;
      const ox = dx * i + dx2 * j;
      const oy = dy * i + dy2 * j;
      switch (copy.type) {
        case 'point':
          copy.x += ox; copy.y += oy; break;
        case 'line': case 'constr':
          copy.x1 += ox; copy.y1 += oy;
          copy.x2 += ox; copy.y2 += oy; break;
        case 'circle':
          copy.cx += ox; copy.cy += oy; break;
        case 'arc':
          copy.cx += ox; copy.cy += oy; break;
        case 'rect':
          copy.x1 += ox; copy.y1 += oy;
          copy.x2 += ox; copy.y2 += oy; break;
        case 'polyline':
          copy.vertices = copy.vertices.map(v => ({ x: v.x + ox, y: v.y + oy }));
          break;
      }
      const label = count2 > 0 ? `${j + 1},${i + 1}` : `${i + 1}`;
      copy.name = `${obj.name || obj.type} (pole ${label})`;
      copies.push(copy);
    }
  }
  return copies;
}

// ── Rotace objektu ──
/**
 * Otočí objekt kolem bodu [cx,cy] o úhel (radiány).
 * Modifikuje objekt in-place.
 * @param {import('./types.js').DrawObject} obj
 * @param {number} cx  střed rotace X
 * @param {number} cy  střed rotace Y
 * @param {number} angle  úhel v radiánech
 */
export function rotateObject(obj, cx, cy, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  function rp(px, py) {
    const dx = px - cx, dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }
  switch (obj.type) {
    case 'point': {
      const m = rp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y; break;
    }
    case 'line': case 'constr': {
      const m1 = rp(obj.x1, obj.y1), m2 = rp(obj.x2, obj.y2);
      obj.x1 = m1.x; obj.y1 = m1.y; obj.x2 = m2.x; obj.y2 = m2.y; break;
    }
    case 'circle': {
      const m = rp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y; break;
    }
    case 'arc': {
      const m = rp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y;
      obj.startAngle += angle; obj.endAngle += angle;
      break;
    }
    case 'rect': {
      const m1 = rp(obj.x1, obj.y1), m2 = rp(obj.x2, obj.y2);
      obj.x1 = m1.x; obj.y1 = m1.y; obj.x2 = m2.x; obj.y2 = m2.y; break;
    }
    case 'polyline': {
      obj.vertices = obj.vertices.map(v => rp(v.x, v.y));
      break;
    }
  }
}

// ── Kruhové pole ──
/**
 * Vytvoří kopie objektu rozmístěné po kruhu kolem středu [cx,cy].
 * @param {import('./types.js').DrawObject} obj  zdrojový objekt
 * @param {number} cx  střed rotace X
 * @param {number} cy  střed rotace Y
 * @param {number} count  počet kopií
 * @param {number} totalAngleDeg  celkový úhel ve stupních
 * @param {boolean} includeOriginal  zahrnout originál do počtu pozic
 * @returns {import('./types.js').DrawObject[]}
 */
export function circularArray(obj, cx, cy, count, totalAngleDeg, includeOriginal) {
  if (count < 1) return [];
  const copies = [];
  const stepDeg = totalAngleDeg / count;
  const numCopies = includeOriginal ? count - 1 : count;
  for (let i = 1; i <= numCopies; i++) {
    const copy = deepClone(obj);
    delete copy.id;
    const angleRad = (stepDeg * i) * Math.PI / 180;
    rotateObject(copy, cx, cy, angleRad);
    copy.name = `${obj.name || obj.type} (pole ${i})`;
    copies.push(copy);
  }
  return copies;
}

// ── Škálování objektu ──
/**
 * Škáluje objekt kolem bodu [cx,cy] o faktor.
 * Modifikuje objekt in-place.
 * @param {import('./types.js').DrawObject} obj
 * @param {number} cx  střed škálování X
 * @param {number} cy  střed škálování Y
 * @param {number} factor  měřítkový faktor
 */
export function scaleObject(obj, cx, cy, factor) {
  function sp(px, py) {
    return { x: cx + (px - cx) * factor, y: cy + (py - cy) * factor };
  }
  switch (obj.type) {
    case 'point': {
      const m = sp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y; break;
    }
    case 'line': case 'constr': {
      const m1 = sp(obj.x1, obj.y1), m2 = sp(obj.x2, obj.y2);
      obj.x1 = m1.x; obj.y1 = m1.y; obj.x2 = m2.x; obj.y2 = m2.y; break;
    }
    case 'circle': {
      const m = sp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y;
      obj.r *= Math.abs(factor);
      break;
    }
    case 'arc': {
      const m = sp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y;
      obj.r *= Math.abs(factor);
      break;
    }
    case 'rect': {
      const m1 = sp(obj.x1, obj.y1), m2 = sp(obj.x2, obj.y2);
      obj.x1 = m1.x; obj.y1 = m1.y; obj.x2 = m2.x; obj.y2 = m2.y; break;
    }
    case 'polyline': {
      obj.vertices = obj.vertices.map(v => sp(v.x, v.y));
      break;
    }
    case 'text': {
      const m = sp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y;
      if (obj.fontSize) obj.fontSize *= Math.abs(factor);
      break;
    }
  }
}

// ── Zaoblení dvou úseček ──
/**
 * Vytvoří zaoblení (fillet) mezi dvěma úsečkami.
 * Najde průsečík, ořízne obě úsečky a vrátí oblouk.
 * @param {import('./types.js').DrawObject} line1
 * @param {import('./types.js').DrawObject} line2
 * @param {number} radius
 * @returns {{ arc: import('./types.js').DrawObject, ok: boolean, msg?: string }}
 */
export function filletTwoLines(line1, line2, radius) {
  // Find intersection of infinite lines
  const d1x = line1.x2 - line1.x1, d1y = line1.y2 - line1.y1;
  const d2x = line2.x2 - line2.x1, d2y = line2.y2 - line2.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return { ok: false, msg: "Úsečky jsou rovnoběžné" };

  const t = ((line2.x1 - line1.x1) * d2y - (line2.y1 - line1.y1) * d2x) / denom;
  const ix = line1.x1 + t * d1x, iy = line1.y1 + t * d1y;

  // Determine directions: point AWAY from intersection along each line
  const d1a = Math.hypot(line1.x1 - ix, line1.y1 - iy);
  const d1b = Math.hypot(line1.x2 - ix, line1.y2 - iy);
  const dir1x = d1a > d1b ? (line1.x1 - ix) : (line1.x2 - ix);
  const dir1y = d1a > d1b ? (line1.y1 - iy) : (line1.y2 - iy);
  const dlen1 = Math.hypot(dir1x, dir1y);
  const n1x = dir1x / dlen1, n1y = dir1y / dlen1;

  const d2a = Math.hypot(line2.x1 - ix, line2.y1 - iy);
  const d2b = Math.hypot(line2.x2 - ix, line2.y2 - iy);
  const dir2x = d2a > d2b ? (line2.x1 - ix) : (line2.x2 - ix);
  const dir2y = d2a > d2b ? (line2.y1 - iy) : (line2.y2 - iy);
  const dlen2 = Math.hypot(dir2x, dir2y);
  const n2x = dir2x / dlen2, n2y = dir2y / dlen2;

  // Sector angle between directions away from intersection
  const cosAngle = Math.max(-1, Math.min(1, n1x * n2x + n1y * n2y));
  const sectorAngle = Math.acos(cosAngle);
  if (sectorAngle < 1e-9 || sectorAngle > Math.PI - 1e-9)
    return { ok: false, msg: "Úsečky jsou téměř rovnoběžné" };

  const tanHalf = Math.tan(sectorAngle / 2);
  const dist = radius / tanHalf; // distance from intersection to tangent point

  // Tangent points on each line
  const tp1x = ix + n1x * dist, tp1y = iy + n1y * dist;
  const tp2x = ix + n2x * dist, tp2y = iy + n2y * dist;

  // Arc center: offset from intersection along bisector
  const bx = n1x + n2x, by = n1y + n2y;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-10) return { ok: false, msg: "Nelze určit střed zaoblení" };
  const centerDist = Math.hypot(radius, dist);
  const cX = ix + (bx / blen) * centerDist;
  const cY = iy + (by / blen) * centerDist;

  // Start and end angles
  let startAngle = Math.atan2(tp1y - cY, tp1x - cX);
  let endAngle = Math.atan2(tp2y - cY, tp2x - cX);

  // Ensure CCW sweep from startAngle to endAngle is the minor arc (< π)
  const ccwSweep = ((endAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (ccwSweep > Math.PI) {
    [startAngle, endAngle] = [endAngle, startAngle];
  }

  // Trim lines: move the endpoint closer to intersection to the tangent point
  if (d1a < d1b) { line1.x1 = tp1x; line1.y1 = tp1y; }
  else { line1.x2 = tp1x; line1.y2 = tp1y; }

  if (d2a < d2b) { line2.x1 = tp2x; line2.y1 = tp2y; }
  else { line2.x2 = tp2x; line2.y2 = tp2y; }

  return {
    ok: true,
    arc: {
      type: 'arc',
      cx: cX, cy: cY,
      r: radius,
      startAngle, endAngle,
    }
  };
}

/**
 * Vytvoří zkosení (chamfer) mezi dvěma úsečkami.
 * Najde průsečík, ořízne obě úsečky a vrátí spojovací úsečku.
 * @param {{x1:number,y1:number,x2:number,y2:number}} line1
 * @param {{x1:number,y1:number,x2:number,y2:number}} line2
 * @param {number} dist1 – vzdálenost ořezu na první úsečce od průsečíku
 * @param {number} dist2 – vzdálenost ořezu na druhé úsečce od průsečíku
 * @returns {{ line: {type:string,x1:number,y1:number,x2:number,y2:number}, ok: boolean, msg?: string }}
 */
export function chamferTwoLines(line1, line2, dist1, dist2) {
  const d1x = line1.x2 - line1.x1, d1y = line1.y2 - line1.y1;
  const d2x = line2.x2 - line2.x1, d2y = line2.y2 - line2.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return { ok: false, msg: "Úsečky jsou rovnoběžné" };

  const t = ((line2.x1 - line1.x1) * d2y - (line2.y1 - line1.y1) * d2x) / denom;
  const ix = line1.x1 + t * d1x, iy = line1.y1 + t * d1y;

  // Directions pointing AWAY from intersection
  const d1a = Math.hypot(line1.x1 - ix, line1.y1 - iy);
  const d1b = Math.hypot(line1.x2 - ix, line1.y2 - iy);
  const dlen1 = d1a > d1b ? d1a : d1b;
  const dir1x = d1a > d1b ? (line1.x1 - ix) : (line1.x2 - ix);
  const dir1y = d1a > d1b ? (line1.y1 - iy) : (line1.y2 - iy);
  const n1x = dir1x / dlen1, n1y = dir1y / dlen1;

  const d2a = Math.hypot(line2.x1 - ix, line2.y1 - iy);
  const d2b = Math.hypot(line2.x2 - ix, line2.y2 - iy);
  const dlen2 = d2a > d2b ? d2a : d2b;
  const dir2x = d2a > d2b ? (line2.x1 - ix) : (line2.x2 - ix);
  const dir2y = d2a > d2b ? (line2.y1 - iy) : (line2.y2 - iy);
  const n2x = dir2x / dlen2, n2y = dir2y / dlen2;

  // Check distances fit on the lines
  const maxD1 = d1a > d1b ? d1a : d1b;
  const maxD2 = d2a > d2b ? d2a : d2b;
  if (dist1 > maxD1 + 1e-6) return { ok: false, msg: "Vzdálenost zkosení je větší než délka první úsečky" };
  if (dist2 > maxD2 + 1e-6) return { ok: false, msg: "Vzdálenost zkosení je větší než délka druhé úsečky" };

  // Cut points
  const cp1x = ix + n1x * dist1, cp1y = iy + n1y * dist1;
  const cp2x = ix + n2x * dist2, cp2y = iy + n2y * dist2;

  // Trim lines
  if (d1a < d1b) { line1.x1 = cp1x; line1.y1 = cp1y; }
  else { line1.x2 = cp1x; line1.y2 = cp1y; }

  if (d2a < d2b) { line2.x1 = cp2x; line2.y1 = cp2y; }
  else { line2.x2 = cp2x; line2.y2 = cp2y; }

  return {
    ok: true,
    line: {
      type: 'line',
      x1: cp1x, y1: cp1y,
      x2: cp2x, y2: cp2y,
    }
  };
}

// ── Bridge registrace ──
bridge.calculateAllIntersections = () => calculateAllIntersections();

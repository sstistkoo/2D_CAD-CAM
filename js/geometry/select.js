// SKICA – geometrie výkresu: Výběr objektu klikem: objekt, značka vazby, snap bod / průsečík, výběr bodů a segmentů (Shift/Ctrl).
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { state } from '../state.js';
import { SNAP_POINT_THRESHOLD, SELECT_THRESHOLD, CONSTRAINT_OFFSET_PX } from '../constants.js';
import { getObjectSnapPoints } from '../utils.js';
import { renderAll, findNumLabelAt } from '../render.js';
import { bridge } from '../bridge.js';
import { distToObject, findSegmentAt } from './hitDistance.js';

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
    // Zamčená vrstva blokuje snap; destička (isToolInsert) je výjimka (viz canvas.js snapPt).
    if (layer && (!layer.visible || (layer.locked && !obj.isToolInsert))) continue;
    if (state.showDimensions === 'none' && (obj.isDimension || obj.isCoordLabel)) continue;
    const pts = getObjectSnapPoints(obj);
    for (const p of pts) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      const t = p.mid ? midThreshold : threshold;
      if (d < t && d < bestDist) { bestDist = d; best = p; }
    }
  }
  // Průsečíky (bonus – při stejné vzdálenosti vyhrávají).
  // Snap funguje i v režimu 'dimensions' (průsečíky skryté, ale lze na ně kótovat).
  if (state.showDimensions !== 'none') {
    for (const pt of state.intersections) {
      const d = Math.hypot(pt.x - wx, pt.y - wy);
      if (d <= bestDist) { bestDist = d; best = pt; }
    }
  }
  return bestDist < threshold ? { x: best.x, y: best.y } : null;
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
  // Klik na číselný štítek (jen pokud je Číslovat zapnuto)
  if (state.showObjectNumbers) {
    const lbl = findNumLabelAt(wx, wy);
    if (lbl) {
      if (lbl.segIdx >= 0) {
        // Segment polyline — toggle v multiSelectedSegments
        state.selected = lbl.objIdx;
        state.multiSelected.clear();
        state._selectedSegmentObjIdx = lbl.objIdx;
        if (!state.multiSelectedSegments.has(lbl.objIdx)) {
          state.multiSelectedSegments.set(lbl.objIdx, new Set());
        }
        const segs = state.multiSelectedSegments.get(lbl.objIdx);
        if (segs.has(lbl.segIdx)) {
          segs.delete(lbl.segIdx);
          // Nastavit selectedSegment na poslední zbývající, nebo null
          state.selectedSegment = segs.size > 0 ? [...segs].pop() : null;
          if (segs.size === 0) state.multiSelectedSegments.delete(lbl.objIdx);
        } else {
          segs.add(lbl.segIdx);
          state.selectedSegment = lbl.segIdx;
        }
      } else {
        // Celý objekt — toggle v multiSelected
        const oi = lbl.objIdx;
        state.selectedSegment = null;
        state._selectedSegmentObjIdx = null;
        state.multiSelectedSegments.clear();
        if (state.multiSelected.has(oi) || state.selected === oi) {
          state.multiSelected.delete(oi);
          if (state.selected === oi) {
            state.selected = state.multiSelected.size > 0 ? [...state.multiSelected].pop() : null;
            if (state.multiSelected.size === 1) {
              state.selected = state.multiSelected.values().next().value;
              state.multiSelected.clear();
            }
          }
        } else {
          if (state.selected !== null) state.multiSelected.add(state.selected);
          state.multiSelected.add(oi);
          state.selected = oi;
        }
      }
      state.selectedPoint = null;
      if (bridge.updateProperties) bridge.updateProperties();
      if (bridge.updateObjectList) bridge.updateObjectList();
      renderAll();
      return;
    }
  }

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

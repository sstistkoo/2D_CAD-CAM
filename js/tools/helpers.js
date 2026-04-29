// ╔══════════════════════════════════════════════════════════════╗
// ║  Sdílené helpery pro tool handlery                         ║
// ╚══════════════════════════════════════════════════════════════╝

import { findSegmentAt, getPolylineSegmentAsLine } from '../geometry.js';
import { state } from '../state.js';
import { renderAll } from '../render.js';
import { resetHint, setHint } from '../ui.js';

// ── Drawing state helpers ──
/**
 * Začne kreslení – nastaví state.drawing a první bod.
 * @param {number} wx
 * @param {number} wy
 * @param {string} hint - text nápovědy
 */
export function startDrawing(wx, wy, hint) {
  state.drawing = true;
  state.tempPoints = [{ x: wx, y: wy }];
  setHint(hint);
  renderAll();
}

/**
 * Ukončí kreslení – resetuje stav.
 */
export function finishDrawing() {
  state.drawing = false;
  state.tempPoints = [];
  resetHint();
}

// ── Helper: get line-like segment from object (line, constr, or polyline segment) ──
/**
 * Vrátí segment (x1,y1,x2,y2) a setter funkce pro úpravy.
 * @returns {{ seg: {x1,y1,x2,y2}, setP1: function, setP2: function, segIdx: number|null } | null}
 */
export function getLineSegment(obj, wx, wy) {
  if (obj.type === 'line' || obj.type === 'constr') {
    return {
      seg: { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 },
      setP1: (x, y) => { obj.x1 = x; obj.y1 = y; },
      setP2: (x, y) => { obj.x2 = x; obj.y2 = y; },
      segIdx: null
    };
  }
  if (obj.type === 'polyline') {
    const si = findSegmentAt(obj, wx, wy);
    if (si === null) return null;
    const b = obj.bulges[si] || 0;
    if (b !== 0) return null; // arc segments not supported
    const n = obj.vertices.length;
    const p1 = obj.vertices[si];
    const p2 = obj.vertices[(si + 1) % n];
    return {
      seg: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
      setP1: (x, y) => { p1.x = x; p1.y = y; },
      setP2: (x, y) => { p2.x = x; p2.y = y; },
      segIdx: si
    };
  }
  return null;
}

// ── Vazby (constraints) – helper ──
/** Nastaví vazbu na objekt/segment.
 *  Pro úsečky: obj.constraint = type
 *  Pro kontury: obj.segConstraints = { segIdx: type, ... }
 */
export function setConstraint(obj, segIdx, type) {
  if (segIdx !== null && segIdx !== undefined) {
    if (!obj.segConstraints) obj.segConstraints = {};
    obj.segConstraints[segIdx] = type;
  } else {
    obj.constraint = type;
  }
}

/**
 * Po úpravě segmentu polyline propaguje vazby na sousední segmenty,
 * aby se zachovala konzistence (např. kolmost + vodorovnost vedle sebe).
 *
 * @param {object} obj      – polyline objekt
 * @param {number} segIdx   – index právě upraveného segmentu
 * @param {'p1'|'p2'} movedEnd – který konec segmentu se posunul
 */
export function propagateConstraints(obj, segIdx, movedEnd) {
  if (obj.type !== 'polyline' || !obj.segConstraints) return;
  const n = obj.vertices.length;
  const segCount = obj.closed ? n : n - 1;

  // Dopředná propagace: P2 se posunul → sousední segment vpravo sdílí ten vrchol
  if (movedEnd === 'p2') {
    for (let i = segIdx + 1; i < segCount; i++) {
      const type = obj.segConstraints[i];
      if (!type || type === 'parallel') break;
      const p1 = obj.vertices[i];
      const p2 = obj.vertices[(i + 1) % n];
      _enforceConstraint(p1, p2, type);
    }
  }

  // Zpětná propagace: P1 se posunul → sousední segment vlevo sdílí ten vrchol
  if (movedEnd === 'p1') {
    for (let i = segIdx - 1; i >= 0; i--) {
      const type = obj.segConstraints[i];
      if (!type || type === 'parallel') break;
      const p1 = obj.vertices[i];
      const p2 = obj.vertices[(i + 1) % n];
      // Kotva je P2 (sdílený s upraveným segmentem), P1 se přizpůsobí
      _enforceConstraintReverse(p1, p2, type);
    }
  }
}

/** Vrátí úhel vodorovné/svislé osy s ohledem na natočení nulového bodu. */
function _constraintAngle(type) {
  const offset = (state.nullPointActive && state.nullPointAngle)
    ? (state.nullPointAngle * Math.PI / 180) : 0;
  return type === 'horizontal' ? offset : offset + Math.PI / 2;
}

/** Vynucení vazby; P1 je kotva, P2 se přizpůsobí. */
function _enforceConstraint(anchor, target, type) {
  const len = Math.hypot(target.x - anchor.x, target.y - anchor.y);
  const angle = _constraintAngle(type);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const proj = (target.x - anchor.x) * cosA + (target.y - anchor.y) * sinA;
  const sign = proj >= 0 ? 1 : -1;
  target.x = anchor.x + sign * len * cosA;
  target.y = anchor.y + sign * len * sinA;
}

/** Vynucení vazby; P2 je kotva, P1 se přizpůsobí. */
function _enforceConstraintReverse(target, anchor, type) {
  const len = Math.hypot(target.x - anchor.x, target.y - anchor.y);
  const angle = _constraintAngle(type);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const proj = (target.x - anchor.x) * cosA + (target.y - anchor.y) * sinA;
  const sign = proj >= 0 ? 1 : -1;
  target.x = anchor.x + sign * len * cosA;
  target.y = anchor.y + sign * len * sinA;
}

// ── Sdílená analýza výběru pro *FromSelection funkce ──

/**
 * Analyzuje aktuální výběr (state.selected, state.multiSelected, state.selectedPoint)
 * a vrátí kategorizované objekty.
 * @returns {{ circles: Array, lines: Array, points: Array, allIndices: Set<number> }}
 */
export function analyzeSelection() {
  const circles = [];
  const lines = [];
  const points = state.selectedPoint ? [...state.selectedPoint] : [];

  const allIndices = new Set();
  if (state.selected !== null) allIndices.add(state.selected);
  for (const idx of state.multiSelected) allIndices.add(idx);

  for (const idx of allIndices) {
    const obj = state.objects[idx];
    if (!obj) continue;

    if (obj.type === 'circle' || obj.type === 'arc') {
      circles.push({ idx, cx: obj.cx, cy: obj.cy, r: obj.r });
    } else if (obj.type === 'line' || obj.type === 'constr') {
      lines.push({ idx, segIdx: null, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 });
    } else if (obj.type === 'polyline') {
      if (state.selectedSegment !== null && state._selectedSegmentObjIdx === idx) {
        const seg = getPolylineSegmentAsLine(obj, state.selectedSegment);
        if (seg) {
          lines.push({ idx, segIdx: state.selectedSegment, ...seg });
        }
      }
    }
  }

  return { circles, lines, points, allIndices };
}

/**
 * Zkontroluje, zda je libovolný objekt vybraný.
 */
export function hasSelection() {
  return state.selected !== null || state.multiSelected.size > 0 ||
    (state.selectedPoint && state.selectedPoint.length > 0);
}

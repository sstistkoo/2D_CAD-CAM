// ╔══════════════════════════════════════════════════════════════╗
// ║  Kotva – zakotvit/uvolnit snap body                       ║
// ╚══════════════════════════════════════════════════════════════╝

import { SNAP_POINT_THRESHOLD } from '../constants.js';
import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { getObjectSnapPoints } from '../utils.js';

const ANCHOR_TOL = 0.01;

/**
 * Najde nejbližší snap bod (objektů + průsečíků) k souřadnicím.
 * @param {number} wx
 * @param {number} wy
 * @returns {{x: number, y: number, dist: number}|null}
 */
function findNearestSnapPoint(wx, wy) {
  const threshold = SNAP_POINT_THRESHOLD / state.zoom;
  let best = null;

  // Snap body objektů
  for (const obj of state.objects) {
    if (obj.isDimension || obj.isCoordLabel) continue;
    const pts = getObjectSnapPoints(obj);
    for (const p of pts) {
      if (p.mid) continue; // midpointy nekotvíme
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < threshold && (!best || d < best.dist)) {
        best = { x: p.x, y: p.y, dist: d };
      }
    }
  }

  // Průsečíky
  for (const pt of state.intersections) {
    const d = Math.hypot(pt.x - wx, pt.y - wy);
    if (d < threshold && (!best || d <= best.dist)) {
      best = { x: pt.x, y: pt.y, dist: d };
    }
  }

  return best;
}

/**
 * Zjistí index existující kotvy na daných souřadnicích.
 * @param {number} x
 * @param {number} y
 * @returns {number} index v state.anchors, nebo -1
 */
function findAnchorAt(x, y) {
  return state.anchors.findIndex(
    a => Math.abs(a.x - x) < ANCHOR_TOL && Math.abs(a.y - y) < ANCHOR_TOL
  );
}

/**
 * Handler kliknutí pro nástroj Kotva.
 * První klik na snap bod → zakotvit, druhý klik na zakotvený bod → uvolnit.
 */
export function handleAnchorClick(wx, wy) {
  const snap = findNearestSnapPoint(wx, wy);
  if (!snap) {
    showToast("Klepněte na snap bod objektu nebo průsečík");
    return;
  }

  const idx = findAnchorAt(snap.x, snap.y);
  if (idx >= 0) {
    // Už zakotveno → uvolnit
    pushUndo();
    state.anchors.splice(idx, 1);
    showToast("Kotva uvolněna");
  } else {
    // Zakotvit
    pushUndo();
    state.anchors.push({ x: snap.x, y: snap.y });
    showToast("Bod zakotven ⚓");
  }
  renderAll();
}

/**
 * Zjistí, zda je bod zakotvený.
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isAnchored(x, y) {
  return state.anchors.some(
    a => Math.abs(a.x - x) < ANCHOR_TOL && Math.abs(a.y - y) < ANCHOR_TOL
  );
}

/**
 * Zjistí, zda objekt obsahuje zakotvený bod.
 * @param {object} obj
 * @returns {boolean}
 */
export function hasAnchoredPoint(obj) {
  const pts = getObjectSnapPoints(obj);
  return pts.some(p => !p.mid && isAnchored(p.x, p.y));
}

/**
 * Odstraní všechny kotvy náležící snap bodům daného objektu.
 * Volat při mazání objektu, aby nezůstaly osiřelé kotvy.
 * @param {object} obj
 */
export function removeAnchorsForObject(obj) {
  const pts = getObjectSnapPoints(obj);
  for (const p of pts) {
    if (p.mid) continue;
    const idx = findAnchorAt(p.x, p.y);
    if (idx >= 0) state.anchors.splice(idx, 1);
  }
}

/**
 * Odstraní osiřelé kotvy – kotvy, které neleží na žádném snap bodu
 * existujícího objektu ani na žádném aktuálním průsečíku.
 * Volat po smazání objektů a přepočtu průsečíků.
 */
export function cleanupOrphanAnchors() {
  if (state.anchors.length === 0) return;

  // Sesbírat všechny platné snap body
  const validPoints = [];
  for (const obj of state.objects) {
    if (obj.isDimension || obj.isCoordLabel) continue;
    const pts = getObjectSnapPoints(obj);
    for (const p of pts) {
      if (!p.mid) validPoints.push(p);
    }
  }
  // Přidat průsečíky
  for (const pt of state.intersections) {
    validPoints.push(pt);
  }

  // Filtrovat kotvy – ponechat jen ty, které leží na platném bodu
  state.anchors = state.anchors.filter(a =>
    validPoints.some(p => Math.abs(p.x - a.x) < ANCHOR_TOL && Math.abs(p.y - a.y) < ANCHOR_TOL)
  );
}

/**
 * Pokusí se odstranit kotvu poblíž daných souřadnic (pro Smaž obj na kotvu).
 * @param {number} wx
 * @param {number} wy
 * @returns {boolean} true pokud byla kotva odstraněna
 */
export function removeAnchorAt(wx, wy) {
  const threshold = SNAP_POINT_THRESHOLD / state.zoom;
  let bestIdx = -1, bestDist = Infinity;
  for (let i = 0; i < state.anchors.length; i++) {
    const a = state.anchors[i];
    const d = Math.hypot(a.x - wx, a.y - wy);
    if (d < threshold && d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    state.anchors.splice(bestIdx, 1);
    return true;
  }
  return false;
}

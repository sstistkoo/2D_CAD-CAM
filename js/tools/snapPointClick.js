// ╔══════════════════════════════════════════════════════════════╗
// ║  Přichytit bod – click logika                              ║
// ╚══════════════════════════════════════════════════════════════╝

import { SNAP_POINT_THRESHOLD } from '../constants.js';
import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { calculateAllIntersections } from '../geometry.js';
import { setHint, resetHint, updateProperties } from '../ui.js';
import { moveObject } from '../objects.js';
import { isAnchored } from './anchorClick.js';

/**
 * Najde nejbližší koncový/klíčový bod objektu k zadaným souřadnicím.
 * Vrátí { objIdx, propKey (nebo vertexIdx), x, y, dist }.
 */
function findNearestEndpoint(wx, wy) {
  const threshold = SNAP_POINT_THRESHOLD / state.zoom;
  let best = null;
  state.objects.forEach((obj, idx) => {
    const layer = state.layers ? state.layers.find(l => l.id === obj.layer) : null;
    if (layer && (layer.locked || !layer.visible)) return;
    const candidates = [];
    switch (obj.type) {
      case 'point':
        candidates.push({ key: 'xy', x: obj.x, y: obj.y });
        break;
      case 'line':
      case 'constr':
        candidates.push({ key: 'p1', x: obj.x1, y: obj.y1 });
        candidates.push({ key: 'p2', x: obj.x2, y: obj.y2 });
        break;
      case 'circle':
        candidates.push({ key: 'center', x: obj.cx, y: obj.cy });
        break;
      case 'arc':
        candidates.push({ key: 'center', x: obj.cx, y: obj.cy });
        break;
      case 'rect':
        candidates.push({ key: 'p1', x: obj.x1, y: obj.y1 });
        candidates.push({ key: 'p2', x: obj.x2, y: obj.y2 });
        break;
      case 'polyline':
        obj.vertices.forEach((v, vi) => {
          candidates.push({ key: 'v' + vi, x: v.x, y: v.y, vertexIdx: vi });
        });
        break;
    }
    for (const c of candidates) {
      const d = Math.hypot(c.x - wx, c.y - wy);
      if (d < threshold && (!best || d < best.dist)) {
        best = { objIdx: idx, key: c.key, x: c.x, y: c.y, dist: d, vertexIdx: c.vertexIdx };
      }
    }
  });
  return best;
}

/** Přesune koncový bod objektu na novou pozici. */
function moveEndpoint(objIdx, key, nx, ny) {
  const obj = state.objects[objIdx];
  switch (key) {
    case 'xy':
      obj.x = nx; obj.y = ny;
      break;
    case 'p1':
      obj.x1 = nx; obj.y1 = ny;
      break;
    case 'p2':
      obj.x2 = nx; obj.y2 = ny;
      break;
    case 'center':
      obj.cx = nx; obj.cy = ny;
      break;
    default:
      if (key.startsWith('v') && obj.type === 'polyline') {
        const vi = parseInt(key.substring(1), 10);
        if (obj.vertices[vi]) {
          obj.vertices[vi].x = nx;
          obj.vertices[vi].y = ny;
        }
      }
      break;
  }
}

export function handleSnapPointClick(wx, wy) {
  if (!state._snapPointState) {
    // Krok 1: vyber koncový bod
    const ep = findNearestEndpoint(wx, wy);
    if (!ep) {
      showToast("Klepněte blíž ke koncovému bodu objektu");
      return;
    }
    state._snapPointState = ep;
    // Kontrola kotvy – zakotvený bod nelze přesunout
    if (isAnchored(ep.x, ep.y)) {
      showToast("Tento bod je zakotven – nelze přesunout");
      state._snapPointState = null;
      return;
    }
    state.selected = ep.objIdx;
    updateProperties();
    setHint("Klepněte na cílový bod (snap) pro přichycení");
    showToast("Bod vybrán – klepněte na cílový bod");
    renderAll();
  } else {
    // Krok 2: přesuň na cílový bod
    pushUndo();
    const src = state._snapPointState;
    const srcObj = state.objects[src.objIdx];
    if (!srcObj) {
      showToast("Zdrojový objekt byl smazán");
      state._snapPointState = null;
      resetHint();
      return;
    }
    if (srcObj.type === 'polyline') {
      // Polyline: posunout celý objekt tak, aby vybraný bod dopadl na cíl
      const dx = wx - src.x;
      const dy = wy - src.y;
      moveObject(srcObj, dx, dy);
    } else {
      moveEndpoint(src.objIdx, src.key, wx, wy);
    }
    calculateAllIntersections();
    showToast("Bod přichycen");
    state._snapPointState = null;
    resetHint();
    renderAll();
  }
}

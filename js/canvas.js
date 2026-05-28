// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Canvas setup, souřadnicové transformace, snap      ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast } from './state.js';
import { getObjectSnapPoints, isAngleBetween, bulgeToArc, getNearestPointOnObject } from './utils.js';
import { renderAll } from './render.js';
import { SNAP_POINT_THRESHOLD, SNAP_EDGE_THRESHOLD, VIBRATE_SNAP_POINT, VIBRATE_SNAP_EDGE, AUTO_CENTER_PADDING, ZOOM_MIN, ZOOM_MAX } from './constants.js';

export const wrap = document.getElementById("canvasWrap");
export const drawCanvas = document.getElementById("drawCanvas");
export const ctx = drawCanvas.getContext("2d");

// Vibrace až po první interakci uživatele (Chrome blokuje vibrate před gestem)
let _userHasInteracted = false;
function onFirstInteraction() {
  _userHasInteracted = true;
  document.removeEventListener('click', onFirstInteraction, true);
  document.removeEventListener('touchend', onFirstInteraction, true);
  document.removeEventListener('keydown', onFirstInteraction, true);
}
document.addEventListener('click', onFirstInteraction, true);
document.addEventListener('touchend', onFirstInteraction, true);
document.addEventListener('keydown', onFirstInteraction, true);

export function safeVibrate(pattern) {
  if (!_userHasInteracted) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate(pattern); } catch (_) {}
}

/** Přizpůsobí canvas velikosti okna. */
export function resizeCanvases() {
  const w = wrap.clientWidth,
    h = wrap.clientHeight;
  drawCanvas.width = w;
  drawCanvas.height = h;
  if (state.panX === 0 && state.panY === 0) {
    state.panX = w / 2;
    state.panY = h / 2;
  }
  renderAll();
}

window.addEventListener("resize", resizeCanvases);

// ── Souřadnicové transformace ──
/**
 * @param {number} wx
 * @param {number} wy
 * @returns {[number, number]}
 */
export function worldToScreen(wx, wy) {
  return [wx * state.zoom + state.panX, -wy * state.zoom + state.panY];
}

/**
 * @param {number} sx
 * @param {number} sy
 * @returns {[number, number]}
 */
export function screenToWorld(sx, sy) {
  const z = state.zoom || 1;
  return [
    (sx - state.panX) / z,
    -(sy - state.panY) / z,
  ];
}

/**
 * Snap kurzoru k bodům objektů / mřížce.
 * @param {number} wx
 * @param {number} wy
 * @returns {[number, number]}
 */
export function snapPt(wx, wy) {
  let objX = null, objY = null, objD = Infinity;

  // Snap k bodům objektů a průsečíkům – větší poloměr zachycení
  if (state.snapToPoints) {
    const threshold = SNAP_POINT_THRESHOLD / state.zoom;

    // Snap k počátku (0,0)
    const dOrigin = Math.hypot(wx, wy);
    if (dOrigin < threshold) {
      objD = dOrigin;
      objX = 0;
      objY = 0;
    }

    // Snap k nulovému bodu (incReference) – pokud je aktivní a jinde než v počátku
    if (state.nullPointActive) {
      const dNP = Math.hypot(wx - state.incReference.x, wy - state.incReference.y);
      if (dNP < threshold && dNP < objD) {
        objD = dNP;
        objX = state.incReference.x;
        objY = state.incReference.y;
      }
    }

    const midThreshold = threshold * 0.3;  // Midpoints: ~30% of normal threshold
    for (const obj of state.objects) {
      if (obj.isDimension || obj.isCoordLabel) continue;
      const pts = getObjectSnapPoints(obj);
      for (const p of pts) {
        const d = Math.hypot(p.x - wx, p.y - wy);
        const t = p.mid ? midThreshold : threshold;
        if (d < t && d < objD) {
          objD = d;
          objX = p.x;
          objY = p.y;
        }
      }
    }
    // Snap k průsečíkům úhlových kót (prodloužené úsečky)
    for (const obj of state.objects) {
      if (obj.isDimension && obj.dimType === 'angular' && obj.dimCenterX != null && obj.dimCenterY != null) {
        const d = Math.hypot(obj.dimCenterX - wx, obj.dimCenterY - wy);
        if (d < threshold && d < objD) {
          objD = d;
          objX = obj.dimCenterX;
          objY = obj.dimCenterY;
        }
      }
    }
    // Snap k bodům právě kreslené kontury (tempPoints)
    if (state.drawing && state.tempPoints && state.tempPoints.length > 0) {
      for (const p of state.tempPoints) {
        const d = Math.hypot(p.x - wx, p.y - wy);
        if (d < threshold && d < objD) {
          objD = d;
          objX = p.x;
          objY = p.y;
        }
      }
    }
    // Průsečíky mají bonus – při stejné vzdálenosti vyhrávají
    for (const pt of state.intersections) {
      const d = Math.hypot(pt.x - wx, pt.y - wy);
      if (d < threshold && d <= objD) {
        objD = d;
        objX = pt.x;
        objY = pt.y;
      }
    }
  }

  // Body/průsečíky – snap k bodům objektů (nejvyšší priorita)
  if (objX !== null) {
    // Vibrace při snapnutí k bodu (jen pokud se snapType změnil)
    if (state.mouse.snapType !== 'point') {
      safeVibrate(VIBRATE_SNAP_POINT);
    }
    state.mouse.snapped = true;
    state.mouse.snapType = 'point';
    return [objX, objY];
  }

  // Snap k nejbližšímu bodu na hraně objektu (nižší priorita než snap body)
  if (state.snapToPoints) {
    const edgeThreshold = SNAP_EDGE_THRESHOLD / state.zoom;
    let edgeX = null, edgeY = null, edgeD = Infinity;
    for (const obj of state.objects) {
      if (obj.isDimension || obj.isCoordLabel) continue;
      const layer = state.layers ? state.layers.find(l => l.id === obj.layer) : null;
      if (layer && (layer.locked || !layer.visible)) continue;
      const np = getNearestPointOnObject(obj, wx, wy);
      if (np && np.dist < edgeThreshold && np.dist < edgeD) {
        edgeD = np.dist;
        edgeX = np.x;
        edgeY = np.y;
      }
    }
    if (edgeX !== null) {
      if (state.mouse.snapType !== 'edge') {
        safeVibrate(VIBRATE_SNAP_EDGE);
      }
      state.mouse.snapped = true;
      state.mouse.snapType = 'edge';
      return [edgeX, edgeY];
    }
  }

  // Grid snap (nižší priorita než object snap)
  if (state.snapToGrid) {
    const g = state.gridSize;
    let gx, gy;
    if (state.nullPointActive && state.nullPointAngle !== 0) {
      // Snap k rotované mřížce: transformovat do lokálního systému, snap, zpět
      const dx = wx - state.incReference.x;
      const dy = wy - state.incReference.y;
      const rad = -state.nullPointAngle * Math.PI / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      const slx = Math.round(lx / g) * g;
      const sly = Math.round(ly / g) * g;
      // Inverzní rotace zpět do světového systému (cos(-rad)=c, sin(-rad)=-s)
      gx = slx * c + sly * s + state.incReference.x;
      gy = -slx * s + sly * c + state.incReference.y;
    } else if (state.nullPointActive) {
      // Mřížka zarovnaná k nulovému bodu (bez rotace)
      const dx = wx - state.incReference.x;
      const dy = wy - state.incReference.y;
      gx = Math.round(dx / g) * g + state.incReference.x;
      gy = Math.round(dy / g) * g + state.incReference.y;
    } else {
      gx = Math.round(wx / g) * g;
      gy = Math.round(wy / g) * g;
    }
    state.mouse.snapped = true;
    state.mouse.snapType = 'grid';
    return [gx, gy];
  }

  state.mouse.snapped = false;
  state.mouse.snapType = '';
  return [wx, wy];
}

// ── Angle snap – zaokrouhlení úhlu na násobek angleSnapStep ──
/**
 * @param {number} wx
 * @param {number} wy
 * @param {import('./types.js').Point2D|null} refPoint
 * @returns {[number, number]}
 */
export function applyAngleSnap(wx, wy, refPoint) {
  if (!state.angleSnap || !refPoint) return [wx, wy];
  const dx = wx - refPoint.x;
  const dy = wy - refPoint.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return [wx, wy];
  const angle = Math.atan2(dy, dx);
  // Offset od natočeného nulového bodu
  const offsetRad = (state.nullPointActive && state.nullPointAngle) ? (state.nullPointAngle * Math.PI / 180) : 0;
  const stepRad = (state.angleSnapStep * Math.PI) / 180;
  // Snap relativně k offsetu
  const relAngle = angle - offsetRad;
  const snappedRel = Math.round(relAngle / stepRad) * stepRad;
  const snappedAngle = snappedRel + offsetRad;
  // Magnetický snap – přichytit jen když je úhel blízko přednastaveného
  const toleranceRad = (state.angleSnapTolerance * Math.PI) / 180;
  const diff = Math.abs(angle - snappedAngle);
  if (diff > toleranceRad) return [wx, wy];
  // Projekce kurzoru na přichycenou úhlovou linii (délka = kolmý průmět, ne vzdálenost)
  const dirX = Math.cos(snappedAngle);
  const dirY = Math.sin(snappedAngle);
  const projDist = dx * dirX + dy * dirY;
  if (projDist < 0) return [wx, wy];
  return [
    refPoint.x + projDist * dirX,
    refPoint.y + projDist * dirY,
  ];
}

// ── Auto-center: vycentrovat pohled na všechny objekty ──
/** Vycentruje pohled tak, aby byly vidět všechny objekty. */
export function autoCenterView() {
  if (state.objects.length === 0) {
    // Nic nakresleno – reset na výchozí pozici
    state.zoom = 1;
    state.panX = drawCanvas.width / 2;
    state.panY = drawCanvas.height / 2;
    renderAll();
    showToast("Pohled vycentrován (prázdný)");
    return;
  }

  // Najít bounding box všech objektů
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const obj of state.objects) {
    switch (obj.type) {
      case "point":
        minX = Math.min(minX, obj.x);
        maxX = Math.max(maxX, obj.x);
        minY = Math.min(minY, obj.y);
        maxY = Math.max(maxY, obj.y);
        break;
      case "line":
      case "constr":
      case "rect":
        minX = Math.min(minX, obj.x1, obj.x2);
        maxX = Math.max(maxX, obj.x1, obj.x2);
        minY = Math.min(minY, obj.y1, obj.y2);
        maxY = Math.max(maxY, obj.y1, obj.y2);
        break;
      case "circle":
        minX = Math.min(minX, obj.cx - obj.r);
        maxX = Math.max(maxX, obj.cx + obj.r);
        minY = Math.min(minY, obj.cy - obj.r);
        maxY = Math.max(maxY, obj.cy + obj.r);
        break;
      case "arc": {
        // Precise arc bounding box based on actual sweep
        const pts = [
          { x: obj.cx + obj.r * Math.cos(obj.startAngle), y: obj.cy + obj.r * Math.sin(obj.startAngle) },
          { x: obj.cx + obj.r * Math.cos(obj.endAngle),   y: obj.cy + obj.r * Math.sin(obj.endAngle) },
        ];
        // Check cardinal angles (0, 90, 180, 270) within sweep
        for (let ca = 0; ca < 4; ca++) {
          const ang = ca * Math.PI / 2;
          if (isAngleBetween(ang, obj.startAngle, obj.endAngle)) {
            pts.push({ x: obj.cx + obj.r * Math.cos(ang), y: obj.cy + obj.r * Math.sin(ang) });
          }
        }
        for (const p of pts) {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        break;
      }
      case "polyline": {
        for (const v of obj.vertices) {
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        }
        const n = obj.vertices.length;
        const segCount = obj.closed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
          const b = (obj.bulges && obj.bulges[i]) || 0;
          if (b !== 0) {
            const p1 = obj.vertices[i];
            const p2 = obj.vertices[(i + 1) % n];
            const arc = bulgeToArc(p1, p2, b);
            if (arc) {
              minX = Math.min(minX, arc.cx - arc.r); maxX = Math.max(maxX, arc.cx + arc.r);
              minY = Math.min(minY, arc.cy - arc.r); maxY = Math.max(maxY, arc.cy + arc.r);
            }
          }
        }
        break;
      }
    }
  }

  if (!isFinite(minX)) return;

  const bboxW = maxX - minX || 1;
  const bboxH = maxY - minY || 1;
  const canvasW = drawCanvas.width;
  const fullCanvasH = drawCanvas.height;

  // Při otevřeném toolbaru na mobilu zmenšit viditelnou výšku
  let visibleH = fullCanvasH;
  let topbarH = 0;
  const topbar = document.getElementById("topbar");
  if (topbar && topbar.classList.contains("mobile-open")) {
    topbarH = topbar.offsetHeight || 0;
    visibleH = fullCanvasH - topbarH;
  }

  const padding = AUTO_CENTER_PADDING;

  // Zoom aby se vše vešlo do viditelné oblasti
  const zoomX = (canvasW * (1 - 2 * padding)) / bboxW;
  const zoomY = (visibleH * (1 - 2 * padding)) / bboxH;
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));

  // Pan aby střed bboxu byl uprostřed viditelné části canvasu
  // Viditelný střed Y = (fullCanvasH - topbarH) / 2
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  state.panX = canvasW / 2 - centerX * state.zoom;
  state.panY = (fullCanvasH - topbarH) / 2 + centerY * state.zoom;

  document.getElementById("statusZoom").textContent =
    `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
  renderAll();
  showToast("Pohled vycentrován");
}

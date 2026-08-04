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
 * Vertikální směr svislé osy: -1 = X+ nahoru (výchozí), +1 = X+ dolů (otočeno).
 * @returns {number}
 */
export function vSign() {
  return state.flipX ? 1 : -1;
}

/**
 * Vodorovný směr osy Z: 1 = Z+ vpravo (výchozí), -1 = Z+ vlevo (otočeno).
 * @returns {number}
 */
export function hSign() {
  return state.flipZ ? -1 : 1;
}

/**
 * Převede world úhel na canvas úhel (canvas má Y dolů, proto v základu negace;
 * při otočení svislé osy se znaménko obrátí zpět; při otočení vodorovné osy
 * se navíc přidá posun o π, protože zrcadlení jedné osy obrací smysl úhlu).
 * @param {number} angle
 * @returns {number}
 */
export function screenAngle(angle) {
  const a = state.flipX ? angle : -angle;
  return state.flipZ ? -a + Math.PI : a;
}

/**
 * Převede příznak směru oblouku (anticlockwise) – zrcadlení libovolné jedné
 * osy (vertikální i vodorovné) mění smysl; zrcadlení obou os se vyruší.
 * @param {boolean} anticlockwise
 * @returns {boolean}
 */
export function screenCCW(anticlockwise) {
  return (state.flipX !== state.flipZ) ? !anticlockwise : anticlockwise;
}

/**
 * @param {number} wx
 * @param {number} wy
 * @returns {[number, number]}
 */
export function worldToScreen(wx, wy) {
  return [hSign() * wx * state.zoom + state.panX, vSign() * wy * state.zoom + state.panY];
}

/**
 * @param {number} sx
 * @param {number} sy
 * @returns {[number, number]}
 */
export function screenToWorld(sx, sy) {
  const z = state.zoom || 1;
  return [
    hSign() * (sx - state.panX) / z,
    vSign() * (sy - state.panY) / z,
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
  state.mouse.onZAxis = false;

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
      if (obj.isDimension || obj.isCoordLabel || obj.isCamPathNote) continue;
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
      // Zamčená vrstva blokuje snap, VÝJIMKA: destička (isToolInsert) v režimu
      // kreslení držáku má být snapovatelná, i když leží na zamčené vrstvě.
      if (layer && (!layer.visible || (layer.locked && !obj.isToolInsert))) continue;
      const np = getNearestPointOnObject(obj, wx, wy);
      if (np && np.dist < edgeThreshold && np.dist < edgeD) {
        edgeD = np.dist;
        edgeX = np.x;
        edgeY = np.y;
      }
    }
    // Snap k ose rotace soustruhu (Z-osa, Y=0) – čára je vizuální, ale snapuje jako hrana
    let snappedToAxis = false;
    if (state.machineType !== 'karusel') {
      const distToAxis = Math.abs(wy);
      if (distToAxis < edgeThreshold && distToAxis < edgeD) {
        edgeD = distToAxis;
        edgeX = wx;
        edgeY = 0;
        snappedToAxis = true;
      }
    }
    if (edgeX !== null) {
      if (state.mouse.snapType !== 'edge') {
        safeVibrate(VIBRATE_SNAP_EDGE);
      }
      state.mouse.snapped = true;
      state.mouse.snapType = 'edge';
      state.mouse.onZAxis = snappedToAxis;
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

// ── Viditelný výřez plátna ──
// Plátno zabírá celé okno, ale část ho na mobilu překrývají ukotvené panely
// (vysunutý #topbar dole, okno „Zadání objektu"). Centrovat doprostřed
// CELÉHO plátna by kresbu schovalo pod ně – proto se rámuje jen do toho,
// co je fakt vidět.
const VIEW_OBSTRUCTIONS = [
  '#topbar.mobile-open',
  '.calc-overlay-float .vk-combined-window',
];

/**
 * Viditelná část plátna v px (bez oblasti pod ukotvenými panely).
 * @returns {{width: number, top: number, height: number, centerY: number}}
 */
export function visibleCanvasRect() {
  const canvasRect = drawCanvas.getBoundingClientRect();
  let top = 0;
  let bottom = drawCanvas.height;

  // Tolerance k okrajům: okna mají vstupní animaci (scale), takže hrana
  // ukotveného panelu nemusí sedět na pixel.
  const EDGE_TOLERANCE = 24;

  for (const selector of VIEW_OBSTRUCTIONS) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // Výřez zmenšují jen panely přes (skoro) celou šířku plátna. Úzké
    // plovoucí okno u kraje (desktop) kresbu nezakrývá, takže se ignoruje.
    const overlap = Math.min(rect.right, canvasRect.right) - Math.max(rect.left, canvasRect.left);
    if (overlap < drawCanvas.width * 0.8) continue;
    const relTop = Math.max(0, rect.top - canvasRect.top);
    const relBottom = Math.min(drawCanvas.height, rect.bottom - canvasRect.top);
    if (relBottom >= bottom - EDGE_TOLERANCE) bottom = Math.min(bottom, relTop);
    else if (relTop <= top + EDGE_TOLERANCE) top = Math.max(top, relBottom);
  }

  const height = Math.max(80, bottom - top);
  return { width: drawCanvas.width, top, height, centerY: top + height / 2 };
}

/**
 * Nastaví zoom i pan tak, aby zadaný world AABB padl doprostřed viditelné
 * části plátna. `renderAll()` si volá volající – tahle funkce jen počítá.
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds
 * @param {{padding?: number, minExtent?: number}} [opts] `minExtent` = nejmenší
 *   rámovaná velikost v mm; bez ní by jediný bod (náhled s jedním prvkem)
 *   vyjel na ZOOM_MAX.
 */
export function fitViewToWorldBounds(bounds, { padding = AUTO_CENTER_PADDING, minExtent = 20 } = {}) {
  const view = visibleCanvasRect();
  const bboxW = Math.max(bounds.maxX - bounds.minX, minExtent);
  const bboxH = Math.max(bounds.maxY - bounds.minY, minExtent);
  const zoomX = (view.width * (1 - 2 * padding)) / bboxW;
  const zoomY = (view.height * (1 - 2 * padding)) / bboxH;
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));
  state.panX = view.width / 2 - hSign() * ((bounds.minX + bounds.maxX) / 2) * state.zoom;
  state.panY = view.centerY - vSign() * ((bounds.minY + bounds.maxY) / 2) * state.zoom;
  const zoomEl = document.getElementById("statusZoom");
  if (zoomEl) zoomEl.textContent = `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
}

// ── Auto-center: vycentrovat pohled na všechny objekty ──
/** Vycentruje pohled tak, aby byly vidět všechny objekty. */
export function autoCenterView() {
  if (state.objects.length === 0) {
    // Nic nakresleno – reset na výchozí pozici (střed viditelné části plátna)
    const view = visibleCanvasRect();
    state.zoom = 1;
    state.panX = view.width / 2;
    state.panY = view.centerY;
    const zoomEl = document.getElementById("statusZoom");
    if (zoomEl) zoomEl.textContent = `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
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

  fitViewToWorldBounds({ minX, maxX, minY, maxY });
  renderAll();
  showToast("Pohled vycentrován");
}

/**
 * Vycentruje pohled na světový bod (wx,wy) tak, aby `mmSpan` mm bylo vidět
 * v menším rozměru plátna. Používá CAM „Kreslit obrys držáku na CAD plátně",
 * aby se vodítko destičky (na počátku 0,0) vždy objevilo uprostřed a v
 * rozumné velikosti bez ohledu na to, kde leží existující výkres.
 */
export function centerViewOn(wx, wy, mmSpan) {
  const canvasW = drawCanvas.width;
  const canvasH = drawCanvas.height;
  const span = Math.max(mmSpan || 160, 1);
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(canvasW, canvasH) / span));
  state.zoom = z;
  state.panX = canvasW / 2 - hSign() * wx * z;
  state.panY = canvasH / 2 - vSign() * wy * z;
  const zoomEl = document.getElementById("statusZoom");
  if (zoomEl) zoomEl.textContent = `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
  renderAll();
}

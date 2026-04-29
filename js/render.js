// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Renderování (mřížka, objekty, kóty, snap)         ║
// ╚══════════════════════════════════════════════════════════════╝

import { drawCanvas, ctx, worldToScreen, screenToWorld } from './canvas.js';
import { state, toDisplayCoords, displayX, xPrefix, fmtCoordLabel } from './state.js';
import { bridge } from './bridge.js';
import { bulgeToArc, getRectCorners, deepClone } from './utils.js';
import { projectPointToLine } from './geometry.js';
import {
  COLORS, GRID_BASE_STEP, GRID_MIN_PX, LINE_WIDTH, LINE_WIDTH_SELECTED,
  CONSTRUCTION_DASH, PREVIEW_DASH, ARROW_LENGTH, ARROW_ANGLE
} from './constants.js';

const DIM_MATCH_TOL = 1e-4;
/** Zjistí, zda kóta (isDimension) vychází z některého vybraného bodu. */
function isDimConnectedToPoints(obj, pts) {
  if (!obj.isDimension || !pts || pts.length === 0) return false;
  const sx1 = obj.dimSrcX1 !== undefined ? obj.dimSrcX1 : obj.x1;
  const sy1 = obj.dimSrcY1 !== undefined ? obj.dimSrcY1 : obj.y1;
  const sx2 = obj.dimSrcX2 !== undefined ? obj.dimSrcX2 : obj.x2;
  const sy2 = obj.dimSrcY2 !== undefined ? obj.dimSrcY2 : obj.y2;
  return pts.some(pt =>
    Math.hypot(sx1 - pt.x, sy1 - pt.y) < DIM_MATCH_TOL
    || Math.hypot(sx2 - pt.x, sy2 - pt.y) < DIM_MATCH_TOL
  );
}

let _renderRAF = null;
// Kolekce umístěných popisků kót pro detekci kolizí
let _dimLabelRects = [];
/** Naplánuje překreslení celého canvasu (requestAnimationFrame). */
export function renderAll() {
  if (_renderRAF) return;
  _renderRAF = requestAnimationFrame(() => {
    _renderRAF = null;
    renderObjects();
    renderAxes();
    renderAngleSnapGuide();
    // Aktualizovat mobilní Cancel tlačítko
    if (bridge.updateMobileCancelBtn) bridge.updateMobileCancelBtn();
    // Aktualizovat tlačítka Dokončit/Uzavřít konturu
    if (bridge.updatePolylineButtons) bridge.updatePolylineButtons();
    // Aktualizovat tlačítka trasování profilu
    if (bridge.updateTraceButtons) bridge.updateTraceButtons();
  });
}

let _renderDebounceTimer = null;
/**
 * Debounced renderAll — pro rychlé UI změny (barva, vlastnosti).
 * Seskupí vícenásobná volání do jednoho renderAll po uplynutí delay.
 */
export function renderAllDebounced(delay = 32) {
  clearTimeout(_renderDebounceTimer);
  _renderDebounceTimer = setTimeout(() => {
    _renderDebounceTimer = null;
    renderAll();
  }, delay);
}

// ── Viewport Culling ──

/** Vrátí AABB objektu ve world souřadnicích, nebo null. */
export function getObjectBounds(obj) {
  switch (obj.type) {
    case 'point':
      return { minX: obj.x - 1, minY: obj.y - 1, maxX: obj.x + 1, maxY: obj.y + 1 };
    case 'line':
    case 'constr': {
      let lMinX = Math.min(obj.x1, obj.x2);
      let lMinY = Math.min(obj.y1, obj.y2);
      let lMaxX = Math.max(obj.x1, obj.x2);
      let lMaxY = Math.max(obj.y1, obj.y2);
      // Kóty mají zdrojové body pro odkazové čáry
      if (obj.isDimension && obj.dimSrcX1 !== undefined) {
        lMinX = Math.min(lMinX, obj.dimSrcX1, obj.dimSrcX2);
        lMinY = Math.min(lMinY, obj.dimSrcY1, obj.dimSrcY2);
        lMaxX = Math.max(lMaxX, obj.dimSrcX1, obj.dimSrcX2);
        lMaxY = Math.max(lMaxY, obj.dimSrcY1, obj.dimSrcY2);
      }
      return { minX: lMinX, minY: lMinY, maxX: lMaxX, maxY: lMaxY };
    }
    case 'circle':
      return {
        minX: obj.cx - obj.r, minY: obj.cy - obj.r,
        maxX: obj.cx + obj.r, maxY: obj.cy + obj.r,
      };
    case 'arc':
      return {
        minX: obj.cx - obj.r, minY: obj.cy - obj.r,
        maxX: obj.cx + obj.r, maxY: obj.cy + obj.r,
      };
    case 'rect':
      return {
        minX: Math.min(obj.x1, obj.x2), minY: Math.min(obj.y1, obj.y2),
        maxX: Math.max(obj.x1, obj.x2), maxY: Math.max(obj.y1, obj.y2),
      };
    case 'polyline': {
      if (!obj.vertices || obj.vertices.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const v of obj.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
      }
      if (obj.bulges) {
        const n = obj.vertices.length;
        const segCount = obj.closed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
          const b = obj.bulges[i] || 0;
          if (b !== 0) {
            const p1 = obj.vertices[i];
            const p2 = obj.vertices[(i + 1) % n];
            const arc = bulgeToArc(p1, p2, b);
            if (arc) {
              if (arc.cx - arc.r < minX) minX = arc.cx - arc.r;
              if (arc.cy - arc.r < minY) minY = arc.cy - arc.r;
              if (arc.cx + arc.r > maxX) maxX = arc.cx + arc.r;
              if (arc.cy + arc.r > maxY) maxY = arc.cy + arc.r;
            }
          }
        }
      }
      return { minX, minY, maxX, maxY };
    }
    case 'text': {
      // Text podél cesty – bounds z path objektu
      if (obj.pathMode && obj.pathMode !== 'none' && obj.pathObjectId != null) {
        const pathObj = state.objects[obj.pathObjectId];
        if (pathObj && pathObj.type !== 'text') {
          const pathBounds = getObjectBounds(pathObj);
          if (pathBounds) {
            const offset = Math.abs(obj.pathOffset || 0) + (obj.fontSize || 14);
            return {
              minX: pathBounds.minX - offset,
              minY: pathBounds.minY - offset,
              maxX: pathBounds.maxX + offset,
              maxY: pathBounds.maxY + offset,
            };
          }
        }
      }
      // Přibližné bounds textu (šířka závisí na délce textu a fontu)
      const fSize = obj.fontSize || 14;
      const spacingFactor = 1 + (obj.letterSpacing || 0) / fSize * 0.5;
      const boldFactor = obj.bold ? 1.1 : 1;
      const approxW = (obj.text || '').length * fSize * 0.6 * spacingFactor * boldFactor;
      const approxH = fSize;
      if (obj.rotation) {
        const cos = Math.abs(Math.cos(obj.rotation));
        const sin = Math.abs(Math.sin(obj.rotation));
        const rw = approxW * cos + approxH * sin;
        const rh = approxW * sin + approxH * cos;
        return {
          minX: obj.x - rw * 0.1, minY: obj.y - rh,
          maxX: obj.x + rw, maxY: obj.y + rh * 0.1,
        };
      }
      return {
        minX: obj.x, minY: obj.y - approxH,
        maxX: obj.x + approxW, maxY: obj.y,
      };
    }
    default:
      return null;
  }
}

/** Vrátí viewport bounds ve world souřadnicích s marginem pro hladký pohled. */
function getViewportBounds() {
  const [wx1, wy1] = screenToWorld(0, drawCanvas.height);
  const [wx2, wy2] = screenToWorld(drawCanvas.width, 0);
  const marginX = Math.abs(wx2 - wx1) * 0.05;
  const marginY = Math.abs(wy2 - wy1) * 0.05;
  return {
    minX: Math.min(wx1, wx2) - marginX,
    minY: Math.min(wy1, wy2) - marginY,
    maxX: Math.max(wx1, wx2) + marginX,
    maxY: Math.max(wy1, wy2) + marginY,
  };
}

/** Testuje překrytí dvou AABB. */
export function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
         a.minY <= b.maxY && a.maxY >= b.minY;
}

// ── Osy ──
function renderAxes() {
  const w = drawCanvas.width,
    h = drawCanvas.height;
  const g = ctx;

  // Adaptive step for axis labels
  const baseStep = GRID_BASE_STEP * state.zoom;
  let drawStep = baseStep,
    drawGridSize = GRID_BASE_STEP;
  while (drawStep < GRID_MIN_PX) {
    drawStep *= 2;
    drawGridSize *= 2;
  }

  // Osy – barvy podle typu stroje
  const isKarusel = state.machineType === 'karusel';
  const hColor = isKarusel ? COLORS.axisV : COLORS.axisH;
  const vColor = isKarusel ? COLORS.axisH : COLORS.axisV;
  const hLabel = isKarusel ? 'X' : 'Z';
  const vLabel = isKarusel ? 'Z' : 'X';

  g.lineWidth = LINE_WIDTH;
  g.strokeStyle = hColor + '55';
  g.beginPath();
  g.moveTo(0, state.panY);
  g.lineTo(w, state.panY);
  g.stroke();
  g.strokeStyle = vColor + '55';
  g.beginPath();
  g.moveTo(state.panX, 0);
  g.lineTo(state.panX, h);
  g.stroke();

  // Mřížka – zobrazit pokud je zapnutý snap na mřížku
  if (state.snapToGrid) {
    const gs = state.gridSize * state.zoom;         // velikost buňky v px
    if (gs >= 4) {                                    // kreslit jen pokud má smysl
      g.strokeStyle = COLORS.textMuted + '18';
      g.lineWidth = 0.5;

      if (state.nullPointActive && state.nullPointAngle !== 0) {
        // ── Rotovaná mřížka ──
        const [npSx, npSy] = worldToScreen(state.incReference.x, state.incReference.y);
        const angleRad = state.nullPointAngle * Math.PI / 180;
        g.save();
        g.translate(npSx, npSy);
        g.rotate(-angleRad);
        // Maximální potřebný rozsah mřížky = diagonála canvasu
        const maxR = Math.hypot(w, h);
        const count = Math.ceil(maxR / gs);
        g.beginPath();
        for (let i = -count; i <= count; i++) {
          const pos = i * gs;
          g.moveTo(pos, -maxR);
          g.lineTo(pos, maxR);
          g.moveTo(-maxR, pos);
          g.lineTo(maxR, pos);
        }
        g.stroke();
        g.restore();
      } else if (state.nullPointActive) {
        // ── Mřížka zarovnaná k nulovému bodu (bez rotace) ──
        const [npSx, npSy] = worldToScreen(state.incReference.x, state.incReference.y);
        const gStartX = npSx % gs;
        const gStartY = npSy % gs;
        g.beginPath();
        for (let x = gStartX; x < w; x += gs) {
          g.moveTo(x, 0);
          g.lineTo(x, h);
        }
        for (let y = gStartY; y < h; y += gs) {
          g.moveTo(0, y);
          g.lineTo(w, y);
        }
        g.stroke();
      } else {
        // ── Standardní mřížka ──
        const gStartX = state.panX % gs;
        const gStartY = state.panY % gs;
        g.beginPath();
        for (let x = gStartX; x < w; x += gs) {
          g.moveTo(x, 0);
          g.lineTo(x, h);
        }
        for (let y = gStartY; y < h; y += gs) {
          g.moveTo(0, y);
          g.lineTo(w, y);
        }
        g.stroke();
      }
    }
  }

  // Popisky os
  const startX = state.panX % drawStep,
    startY = state.panY % drawStep;
  g.font = "13px Consolas";
  g.fillStyle = COLORS.textMuted;
  const labelPad = 6; // min mezera mezi popisky
  let lastLabelEndX = -Infinity;
  for (let x = startX; x < w; x += drawStep) {
    const [wx] = screenToWorld(x, 0);
    const label = Math.round(wx / drawGridSize) * drawGridSize;
    if (label === 0) continue;
    const dispLabel = isKarusel ? displayX(label) : label;
    const txt = dispLabel.toString();
    const tw = g.measureText(txt).width;
    const drawX = x + 2;
    if (drawX < lastLabelEndX + labelPad) continue; // přeskočit – překrývalo by se
    g.fillText(txt, drawX, state.panY - 5);
    lastLabelEndX = drawX + tw;
  }
  let lastLabelEndY = -Infinity;
  for (let y = startY; y < h; y += drawStep) {
    const [, wy] = screenToWorld(0, y);
    const label = Math.round(wy / drawGridSize) * drawGridSize;
    if (label === 0) continue;
    const dispLabel = isKarusel ? label : displayX(label);
    const drawY = y - 3;
    if (drawY < lastLabelEndY + labelPad) continue; // přeskočit – překrývalo by se
    g.fillText(dispLabel.toString(), state.panX + 4, drawY);
    lastLabelEndY = drawY + 13; // přibližná výška fontu 13px
  }
  g.fillStyle = COLORS.selected;
  g.font = "14px Consolas";
  g.fillText("0", state.panX + 4, state.panY - 5);

  // Origin marker – terčík na 0,0
  g.strokeStyle = COLORS.selected + '88';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(state.panX, state.panY, 6, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(state.panX - 10, state.panY);
  g.lineTo(state.panX + 10, state.panY);
  g.moveTo(state.panX, state.panY - 10);
  g.lineTo(state.panX, state.panY + 10);
  g.stroke();

  // Popisky os X a Z
  g.font = "bold 14px Consolas";
  g.fillStyle = hColor;
  g.fillText(hLabel, w - 18, state.panY - 8);
  g.fillStyle = vColor;
  g.fillText(vLabel, state.panX + 8, 16);

  // ── Nulový bod – středový kříž v offsetové pozici ──
  if (state.nullPointActive) {
    const [npx, npy] = worldToScreen(state.incReference.x, state.incReference.y);
    const npColor = '#fab387'; // Oranžová – odlišná od hlavního kříže
    const angleRad = (state.nullPointAngle || 0) * Math.PI / 180;
    const hasAngle = state.nullPointAngle !== 0;

    // Čárkované osy přes celý canvas (rotované)
    g.strokeStyle = npColor + '44';
    g.lineWidth = 1;
    g.setLineDash([8, 6]);

    if (!hasAngle) {
      // Bez natočení – vodorovná a svislá čára
      g.beginPath();
      g.moveTo(0, npy);
      g.lineTo(w, npy);
      g.stroke();
      g.beginPath();
      g.moveTo(npx, 0);
      g.lineTo(npx, h);
      g.stroke();
    } else {
      // S natočením – rotované osy
      const maxLen = Math.hypot(w, h);
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      // Osa 1 (vodorovná rotovaná)
      g.beginPath();
      g.moveTo(npx - cosA * maxLen, npy + sinA * maxLen);
      g.lineTo(npx + cosA * maxLen, npy - sinA * maxLen);
      g.stroke();
      // Osa 2 (svislá rotovaná = +90°)
      g.beginPath();
      g.moveTo(npx - sinA * maxLen, npy - cosA * maxLen);
      g.lineTo(npx + sinA * maxLen, npy + cosA * maxLen);
      g.stroke();
    }
    g.setLineDash([]);

    // Terčík na nulový bod
    g.strokeStyle = npColor + 'cc';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(npx, npy, 8, 0, Math.PI * 2);
    g.stroke();

    // Malý kříž (rotovaný)
    g.beginPath();
    if (!hasAngle) {
      g.moveTo(npx - 13, npy);
      g.lineTo(npx + 13, npy);
      g.moveTo(npx, npy - 13);
      g.lineTo(npx, npy + 13);
    } else {
      const c13 = 13 * Math.cos(angleRad);
      const s13 = 13 * Math.sin(angleRad);
      g.moveTo(npx - c13, npy + s13);
      g.lineTo(npx + c13, npy - s13);
      g.moveTo(npx - s13, npy - c13);
      g.lineTo(npx + s13, npy + c13);
    }
    g.stroke();

    // Popisek "0'" + úhel
    g.font = "bold 12px Consolas";
    g.fillStyle = npColor;
    const angleLabel = hasAngle ? `0' ∠${state.nullPointAngle}°` : "0'";
    g.fillText(angleLabel, npx + 10, npy - 10);
  }
}

// ── Vykreslení objektů ──
function renderObjects() {
  const w = drawCanvas.width,
    h = drawCanvas.height;
  ctx.clearRect(0, 0, w, h);
  _dimLabelRects = []; // Reset kolizních obdélníků kót

  // Dynamická velikost písma podle zoomu
  const labelSize = Math.round(Math.min(22, Math.max(14, 10 + state.zoom * 6)));

  // Viewport culling – spočítat viditelnou oblast
  const vp = getViewportBounds();

  state.objects.forEach((obj, idx) => {
    // Skip objects on invisible layers
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    // Skrýt kótovací objekty podle režimu zobrazení kót
    if (state.showDimensions === 'none' && (obj.isDimension || obj.isCoordLabel)) return;
    if (state.showDimensions === 'intersections' && obj.isDimension) return;

    // Viewport culling – přeskočit objekty mimo viditelnou oblast
    // Konstrukční čáry (nekonečné) se nekullují
    if (obj.type !== 'constr') {
      const bounds = getObjectBounds(obj);
      if (bounds && !boundsOverlap(bounds, vp)) return;
    }

    const isSel = idx === state.selected || state.multiSelected.has(idx);
    // Zvýraznění kót navázaných na vybraný bod/průsečík
    const isConnectedDim = !isSel && obj.isDimension && state.selectedPoint != null
      && isDimConnectedToPoints(obj, state.selectedPoint);
    const isConstr = obj.type === "constr";
    const layerColor = layer ? layer.color : COLORS.primary;
    ctx.strokeStyle = (isSel || isConnectedDim)
      ? COLORS.selected
      : isConstr
        ? COLORS.construction
        : obj.color || layerColor;
    ctx.fillStyle = (isSel || isConnectedDim)
      ? COLORS.selected
      : isConstr
        ? COLORS.construction
        : obj.color || layerColor;
    ctx.lineWidth = (isSel || isConnectedDim) ? LINE_WIDTH_SELECTED : LINE_WIDTH;
    ctx.setLineDash(isConstr || obj.dashed ? CONSTRUCTION_DASH : []);

    switch (obj.type) {
      case "point":
        drawPoint(obj);
        break;
      case "line":
      case "constr":
        drawLine(obj);
        break;
      case "circle":
        drawCircle(obj);
        if (obj.showCenterMark) drawCenterMark(obj);
        break;
      case "arc":
        drawArc(obj);
        if (obj.showCenterMark) drawCenterMark(obj);
        break;
      case "rect":
        drawRect(obj, isSel, obj.color || layerColor, idx);
        break;
      case "polyline":
        drawPolyline(obj, isSel, obj.color || layerColor, idx);
        break;
      case "text":
        drawText(obj, isSel);
        break;
    }
    ctx.setLineDash([]);

    // Kóty – skrýt když jsou zapnutá čísla objektů
    if (state.showDimensions !== 'none' && !isConstr && !state.showObjectNumbers) drawDimension(obj);
  });

  // ── Čísla objektů na výkrese ──
  if (state.showObjectNumbers) {
    drawObjectNumbers();
  }

  // ── Čísla průsečíků na výkrese ──
  if (state.showIntersectionNumbers) {
    drawIntersectionNumbers();
  }

  // ── Vazební značky (constraints) ──
  drawConstraintMarkers();

  // Průsečíky (skrýt při číslování objektů)
  if (state.showDimensions !== 'none' && !state.showObjectNumbers) {
    state.intersections.forEach((pt) => {
      const [sx, sy] = worldToScreen(pt.x, pt.y);
      const isSelPt = state.selectedPoint != null
        && state.selectedPoint.some(sp => Math.hypot(pt.x - sp.x, pt.y - sp.y) < DIM_MATCH_TOL);
      const ptColor = isSelPt ? COLORS.selected : COLORS.dimension;
      ctx.fillStyle = ptColor;
      ctx.strokeStyle = ptColor;
      ctx.lineWidth = isSelPt ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
      const intSize = Math.round(Math.min(24, Math.max(11, 8 + state.zoom * 4.5)));
      ctx.font = intSize + 'px Consolas';
      const ptLabel = fmtCoordLabel(pt.x, pt.y);
      const labelW = ctx.measureText(ptLabel).width;
      const resolved = resolveDimLabelPos(sx + 8, sy - 8, labelW, intSize);
      if (resolved.collided) {
        ctx.strokeStyle = ptColor;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 8, resolved.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ptColor;
      }
      ctx.fillText(ptLabel, sx + 8, resolved.y);
    });
  }

  // Zakotvené body (červené kolečka)
  if (state.anchors && state.anchors.length > 0) {
    for (const a of state.anchors) {
      const [ax, ay] = worldToScreen(a.x, a.y);
      ctx.strokeStyle = COLORS.delete;  // červená
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.delete;
      ctx.fill();
    }
  }

  // ── Obdélníkový výběr ──
  if (state._rectSelecting && state._rectStart) {
    const [sx1, sy1] = worldToScreen(state._rectStart.x, state._rectStart.y);
    const [sx2, sy2] = worldToScreen(state.mouse.x, state.mouse.y);
    const rx = Math.min(sx1, sx2), ry = Math.min(sy1, sy2);
    const rw = Math.abs(sx2 - sx1), rh = Math.abs(sy2 - sy1);
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.7)';
    ctx.fillStyle = 'rgba(100, 180, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.stroke();
    ctx.fill();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Dočasné kreslení
  if (state.drawing && state.tempPoints.length > 0) {
    ctx.strokeStyle = COLORS.preview;
    ctx.fillStyle = COLORS.preview;
    ctx.lineWidth = 1;
    ctx.setLineDash(PREVIEW_DASH);
    const tp = state.tempPoints;
    const [mx, my] = [state.mouse.x, state.mouse.y];

    if (
      state.tool === "line" ||
      state.tool === "constr" ||
      state.tool === "measure"
    ) {
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      const [sx2, sy2] = worldToScreen(mx, my);
      // Počáteční bod – zvýrazněný
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.preview;
      ctx.beginPath();
      ctx.arc(sx1, sy1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 1;
      ctx.setLineDash(PREVIEW_DASH);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      const d = Math.hypot(mx - tp[0].x, my - tp[0].y);
      const angle =
        (Math.atan2(my - tp[0].y, mx - tp[0].x) * 180) / Math.PI;
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(
        `${d.toFixed(3)} mm  ${angle.toFixed(1)}°`,
        (sx1 + sx2) / 2 + 8,
        (sy1 + sy2) / 2 - 8,
      );
    }
    if (state.tool === "circle") {
      const [sx, sy] = worldToScreen(tp[0].x, tp[0].y);
      const rw = Math.hypot(mx - tp[0].x, my - tp[0].y);
      const r = rw * state.zoom;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(`R ${rw.toFixed(3)}`, sx + r + 6, sy);
    }
    if (state.tool === "rect") {
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      const [sx2, sy2] = worldToScreen(mx, my);
      ctx.beginPath();
      ctx.rect(
        Math.min(sx1, sx2),
        Math.min(sy1, sy2),
        Math.abs(sx2 - sx1),
        Math.abs(sy2 - sy1),
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(
        `${Math.abs(mx - tp[0].x).toFixed(1)} × ${Math.abs(my - tp[0].y).toFixed(1)}`,
        Math.max(sx1, sx2) + 6,
        Math.min(sy1, sy2) - 4,
      );
    }
    if (state.tool === "arc" && tp.length >= 2) {
      const cx = tp[0].x,
        cy = tp[0].y;
      const r = Math.hypot(tp[1].x - cx, tp[1].y - cy);
      const [scx, scy] = worldToScreen(cx, cy);
      const rr = r * state.zoom;
      const startAngle = -Math.atan2(tp[1].y - cy, tp[1].x - cx);
      const endAngle = -Math.atan2(my - cy, mx - cx);
      // Default direction: ccw=false → CW in math → anticlockwise=true in screen
      ctx.beginPath();
      ctx.arc(scx, scy, rr, startAngle, endAngle, true);
      ctx.stroke();
    }
    if (state.tool === "polyline" && tp.length >= 1) {
      // Draw already placed segments
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = LINE_WIDTH;
      ctx.setLineDash(PREVIEW_DASH);
      const tempBulges = state._polylineBulges || [];
      // Zvýrazněný startovací bod kontury
      const [sfx, sfy] = worldToScreen(tp[0].x, tp[0].y);
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.selected;
      ctx.beginPath();
      ctx.arc(sfx, sfy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash(PREVIEW_DASH);
      for (let i = 0; i < tp.length - 1; i++) {
        const p1 = tp[i], p2 = tp[i + 1];
        const b = tempBulges[i] || 0;
        const [sx1, sy1] = worldToScreen(p1.x, p1.y);
        const [sx2, sy2] = worldToScreen(p2.x, p2.y);
        if (b === 0) {
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        } else {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            const [scx, scy] = worldToScreen(arc.cx, arc.cy);
            const sr = arc.r * state.zoom;
            ctx.beginPath();
            ctx.arc(scx, scy, sr, -arc.endAngle, -arc.startAngle, b < 0);
            ctx.stroke();
          }
        }
        // Vertex dots
        ctx.fillStyle = COLORS.preview;
        ctx.beginPath();
        ctx.arc(sx1, sy1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Last placed vertex
      const lastPt = tp[tp.length - 1];
      const [slx, sly] = worldToScreen(lastPt.x, lastPt.y);
      ctx.fillStyle = COLORS.preview;
      ctx.beginPath();
      ctx.arc(slx, sly, 3, 0, Math.PI * 2);
      ctx.fill();
      // Preview line to cursor
      ctx.setLineDash(PREVIEW_DASH);
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 1;
      const [smx, smy] = worldToScreen(mx, my);
      ctx.beginPath();
      ctx.moveTo(slx, sly);
      ctx.lineTo(smx, smy);
      ctx.stroke();
      // Koncový bod preview – zvýrazněný
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.preview;
      ctx.beginPath();
      ctx.arc(smx, smy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Distance info
      const dd = Math.hypot(mx - lastPt.x, my - lastPt.y);
      const ang = (Math.atan2(my - lastPt.y, mx - lastPt.x) * 180) / Math.PI;
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.preview;
      ctx.fillText(
        `${dd.toFixed(3)} mm  ${ang.toFixed(1)}°  [${tp.length} bodů]`,
        (slx + smx) / 2 + 8,
        (sly + smy) / 2 - 8,
      );
    }
    if (state.tool === "tangent" && tp.length === 1) {
      // Preview: bod tečny – zobrazit bod
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      ctx.fillStyle = COLORS.snapPoint;
      ctx.beginPath();
      ctx.arc(sx1, sy1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText("Bod tečny", sx1 + 8, sy1 - 8);
    }
    // Preview: Rovnoběžka
    if (state.tool === "parallel" && state._parallelRefIdx != null) {
      const refSeg = state._parallelRefSeg;
      if (refSeg) {
        const dx = refSeg.seg.x2 - refSeg.seg.x1;
        const dy = refSeg.seg.y2 - refSeg.seg.y1;
        const px1 = mx - dx / 2, py1 = my - dy / 2;
        const px2 = mx + dx / 2, py2 = my + dy / 2;
        const [sx1, sy1] = worldToScreen(px1, py1);
        const [sx2, sy2] = worldToScreen(px2, py2);
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
        // Vzdálenost od referenční úsečky
        const foot = projectPointToLine(mx, my, refSeg.seg.x1, refSeg.seg.y1, refSeg.seg.x2, refSeg.seg.y2);
        const dist = Math.hypot(mx - foot.x, my - foot.y);
        ctx.setLineDash([]);
        ctx.font = `${labelSize}px Consolas`;
        ctx.fillStyle = COLORS.primary;
        ctx.fillText(`∥ d=${dist.toFixed(state.displayDecimals)}mm`, (sx1 + sx2) / 2 + 8, (sy1 + sy2) / 2 - 8);
      }
    }
    // Preview: Kóta (2 body)
    if (state.tool === "dimension" && tp.length === 1) {
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      const [sx2, sy2] = worldToScreen(mx, my);
      const d = Math.hypot(mx - tp[0].x, my - tp[0].y);
      ctx.strokeStyle = COLORS.textSecondary;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      // Šipky
      drawDimArrow(sx1, sy1, sx2, sy2);
      drawDimArrow(sx2, sy2, sx1, sy1);
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.textSecondary;
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      const nx = -Math.sin(angle) * 14, ny = Math.cos(angle) * 14;
      ctx.fillText(`${d.toFixed(state.displayDecimals)}mm`, (sx1 + sx2) / 2 + nx, (sy1 + sy2) / 2 + ny);
    }
    // Preview: Úhlová kóta – první úsečka vybrána, čeká se na druhou
    if (state.tool === "dimension" && state._dimFirstLine) {
      const fl = state._dimFirstLine;
      const [fsx1, fsy1] = worldToScreen(fl.x1, fl.y1);
      const [fsx2, fsy2] = worldToScreen(fl.x2, fl.y2);
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(fsx1, fsy1);
      ctx.lineTo(fsx2, fsy2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.selected;
      ctx.fillText('∠?', (fsx1 + fsx2) / 2 + 8, (fsy1 + fsy2) / 2 - 8);
    }
    // Preview: Řetězcové kótování – zobrazit čárkovanou kótu od posledního bodu k myši
    if (state.tool === "chainDimension" && tp.length >= 1) {
      const last = tp[tp.length - 1];
      const [sx1, sy1] = worldToScreen(last.x, last.y);
      const [sx2, sy2] = worldToScreen(mx, my);
      const d = Math.hypot(mx - last.x, my - last.y);
      // Odsazená kóta (preview)
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      const dimOff = 20 * state.zoom;
      const nx = -Math.sin(angle) * dimOff, ny = Math.cos(angle) * dimOff;
      ctx.strokeStyle = COLORS.textSecondary;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      // Odsazená kótovací čára
      ctx.beginPath();
      ctx.moveTo(sx1 + nx, sy1 + ny);
      ctx.lineTo(sx2 + nx, sy2 + ny);
      ctx.stroke();
      // Odkazové čáry
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx1 + nx, sy1 + ny);
      ctx.moveTo(sx2, sy2);
      ctx.lineTo(sx2 + nx, sy2 + ny);
      ctx.stroke();
      ctx.setLineDash([]);
      // Šipky
      drawDimArrow(sx1 + nx, sy1 + ny, sx2 + nx, sy2 + ny);
      drawDimArrow(sx2 + nx, sy2 + ny, sx1 + nx, sy1 + ny);
      // Text
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.textSecondary;
      const tmx = (sx1 + sx2) / 2 + nx, tmy = (sy1 + sy2) / 2 + ny;
      ctx.fillText(`${d.toFixed(state.displayDecimals)}mm`, tmx, tmy - 4);
      // Zelený bod na předchozích bodech řetězce
      ctx.fillStyle = COLORS.dimension || COLORS.textSecondary;
      for (const pt of tp) {
        const [px, py] = worldToScreen(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Preview: Trasování profilu
    if (state.tool === "profileTrace" && tp.length >= 1) {
      const traceBulges = state._profileTraceBulges || [];
      // Spojnice mezi body (rovné nebo oblouky)
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      for (let i = 0; i < tp.length - 1; i++) {
        const b = traceBulges[i] || 0;
        const [sx1, sy1] = worldToScreen(tp[i].x, tp[i].y);
        const [sx2, sy2] = worldToScreen(tp[i + 1].x, tp[i + 1].y);
        if (b === 0) {
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        } else {
          // Oblouk
          const arc = bulgeToArc(tp[i], tp[i + 1], b);
          if (arc) {
            const [scx, scy] = worldToScreen(arc.cx, arc.cy);
            const sr = arc.r * state.zoom;
            ctx.strokeStyle = COLORS.primary;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(scx, scy, sr, -arc.endAngle, -arc.startAngle, b < 0);
            ctx.stroke();
            ctx.strokeStyle = COLORS.selected;
            // Popisek R
            const midAngle = (-arc.startAngle + -arc.endAngle) / 2;
            const rx = scx + sr * Math.cos(midAngle);
            const ry = scy + sr * Math.sin(midAngle);
            ctx.setLineDash([]);
            ctx.font = `${labelSize}px Consolas`;
            ctx.fillStyle = COLORS.primary;
            ctx.fillText(`R${arc.r.toFixed(1)}`, rx + 6, ry - 6);
          }
        }
      }
      // Body s čísly
      for (let i = 0; i < tp.length; i++) {
        const [sx, sy] = worldToScreen(tp[i].x, tp[i].y);
        // Velký bod
        ctx.fillStyle = i === 0 ? COLORS.snapPoint : COLORS.selected;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        // Číslo bodu
        ctx.setLineDash([]);
        ctx.font = `bold ${labelSize}px Consolas`;
        ctx.fillStyle = COLORS.snapPoint;
        ctx.fillText(`${i + 1}`, sx + 8, sy - 8);
      }
      // Preview čára ke kurzoru
      const last = tp[tp.length - 1];
      const [slx, sly] = worldToScreen(last.x, last.y);
      const [smx, smy] = worldToScreen(mx, my);
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 1;
      ctx.setLineDash(PREVIEW_DASH);
      ctx.beginPath();
      ctx.moveTo(slx, sly);
      ctx.lineTo(smx, smy);
      ctx.stroke();
      // Info text
      const dd = Math.hypot(mx - last.x, my - last.y);
      const ang = (Math.atan2(my - last.y, mx - last.x) * 180) / Math.PI;
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.preview;
      ctx.fillText(
        `${dd.toFixed(3)} mm  ${ang.toFixed(1)}°  [${tp.length} bodů]`,
        (slx + smx) / 2 + 8,
        (sly + smy) / 2 - 8,
      );
    }
    ctx.setLineDash([]);
  }

  // Indikátor vybraného bodu (snapPoint nástroj)
  if (state._snapPointState) {
    const sp = state._snapPointState;
    const [spx, spy] = worldToScreen(sp.x, sp.y);
      ctx.strokeStyle = COLORS.snapPoint;
      ctx.lineWidth = LINE_WIDTH_SELECTED;
    ctx.beginPath();
    ctx.arc(spx, spy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(spx, spy, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.snapPoint;
    ctx.fill();
    // Vodící čára ke kurzoru
    const [mx, my] = worldToScreen(state.mouse.x, state.mouse.y);
    ctx.strokeStyle = "rgba(250, 179, 135, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(spx, spy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── CopyPlace preview (ghost kopií) ──
  if (state.tool === 'copyPlace' && state._copyPlaceRef && state._copyPlaceObjects) {
    const dx = state.mouse.x - state._copyPlaceRef.x;
    const dy = state.mouse.y - state._copyPlaceRef.y;
    const [refSx, refSy] = worldToScreen(state._copyPlaceRef.x, state._copyPlaceRef.y);
    const [curSx, curSy] = worldToScreen(state.mouse.x, state.mouse.y);

    // Vodící čára od ref bodu ke kurzoru
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 179, 135, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(refSx, refSy);
    ctx.lineTo(curSx, curSy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ref bod – kolečko
    ctx.fillStyle = COLORS.preview;
    ctx.beginPath();
    ctx.arc(refSx, refSy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Ghost kopie objektů
    ctx.strokeStyle = COLORS.preview;
    ctx.fillStyle = COLORS.preview;
    ctx.lineWidth = 1;
    ctx.setLineDash(PREVIEW_DASH);
    ctx.globalAlpha = 0.5;
    for (const idx of state._copyPlaceObjects) {
      const orig = state.objects[idx];
      if (!orig) continue;
      const ghost = deepClone(orig);
      // Posunout ghost o vektor
      switch (ghost.type) {
        case 'point':
          ghost.x += dx; ghost.y += dy; break;
        case 'line': case 'constr':
          ghost.x1 += dx; ghost.y1 += dy;
          ghost.x2 += dx; ghost.y2 += dy; break;
        case 'circle': case 'arc':
          ghost.cx += dx; ghost.cy += dy; break;
        case 'rect':
          ghost.x1 += dx; ghost.y1 += dy;
          ghost.x2 += dx; ghost.y2 += dy; break;
        case 'polyline':
          for (const v of ghost.vertices) { v.x += dx; v.y += dy; }
          break;
        case 'text':
          ghost.x += dx; ghost.y += dy; break;
      }
      // Potlačit kótové popisky pro preview
      ghost.isDimension = false;
      ghost.isCoordLabel = false;
      switch (ghost.type) {
        case 'point': drawPoint(ghost); break;
        case 'line': case 'constr': drawLine(ghost); break;
        case 'circle': drawCircle(ghost); break;
        case 'arc': drawArc(ghost); break;
        case 'rect': drawRect(ghost, false, COLORS.preview); break;
        case 'polyline': drawPolyline(ghost, false, COLORS.preview); break;
        case 'text': drawText(ghost, false); break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Snap indikátor
  drawSnapIndicator();

  // Indikátor vybraného bodu (pokud není průsečík)
  drawSelectedPointIndicator();

  // Počítadlo vybraných objektů
  drawSelectionCounter();
}

// ── Indikátor vybraného bodu ──
function drawSelectedPointIndicator() {
  if (!state.selectedPoint || state.selectedPoint.length === 0) return;
  for (const sp of state.selectedPoint) {
    // Zkontrolovat, jestli je to průsečík (ten má vlastní label)
    const isIntersection = state.intersections.some(
      pt => Math.hypot(pt.x - sp.x, pt.y - sp.y) < DIM_MATCH_TOL
    );
    if (isIntersection) continue;
    // Vykreslit kroužek + souřadnice
    const [sx, sy] = worldToScreen(sp.x, sp.y);
    ctx.strokeStyle = COLORS.selected;
    ctx.fillStyle = COLORS.selected;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
    const intSize = Math.round(Math.min(24, Math.max(11, 8 + state.zoom * 4.5)));
    ctx.font = intSize + 'px Consolas';
    const ptLabel = fmtCoordLabel(sp.x, sp.y);
    ctx.fillText(ptLabel, sx + 10, sy - 10);
  }
}

// ── Počítadlo výběru ──
function drawSelectionCounter() {
  const objCount = state.multiSelected.size > 0
    ? state.multiSelected.size
    : (state.selected !== null ? 1 : 0);
  const ptCount = state.selectedPoint ? state.selectedPoint.length : 0;
  let segCount = 0;
  for (const s of state.multiSelectedSegments.values()) segCount += s.size;

  if (objCount <= 0 && segCount <= 0 && ptCount <= 0) return;

  const parts = [];
  if (objCount > 0) parts.push(`${objCount} obj`);
  if (segCount > 0) parts.push(`${segCount} seg`);
  if (ptCount > 0) parts.push(`${ptCount} bod${ptCount > 1 ? 'y' : ''}`);
  const label = parts.join(' + ');
  const fontSize = 14;
  ctx.font = `bold ${fontSize}px Consolas`;
  const w = ctx.measureText(label).width + 16;
  const h = fontSize + 12;
  const x = (drawCanvas.width - w) / 2;
  const isMobile = window.innerWidth <= 900;
  const y = isMobile ? 90 : 50;
  ctx.fillStyle = 'rgba(30,30,46,0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = COLORS.selected;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ── Snap indikátor u kurzoru ──
function drawSnapIndicator() {
  if (!state.mouse.snapped) return;
  const [sx, sy] = worldToScreen(state.mouse.x, state.mouse.y);
  const snapLabelSize = Math.round(Math.min(22, Math.max(14, 10 + state.zoom * 6)));

  if (state.mouse.snapType === 'point') {
    // Snap k bodu – žlutý čtvereček
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(sx - 6, sy - 6, 12, 12);
    ctx.stroke();
    ctx.font = `${Math.max(9, snapLabelSize - 4)}px Consolas`;
    ctx.fillStyle = COLORS.selected;
    ctx.fillText("SNAP", sx + 9, sy - 3);
  } else if (state.mouse.snapType === 'grid') {
    // Snap na mřížku – menší indikátor, jiná barva
    ctx.strokeStyle = COLORS.label;
    ctx.lineWidth = LINE_WIDTH;
    ctx.beginPath();
    ctx.rect(sx - 4, sy - 4, 8, 8);
    ctx.stroke();
    ctx.font = `${Math.max(9, snapLabelSize - 4)}px Consolas`;
    ctx.fillStyle = COLORS.label;
    ctx.fillText("GRID", sx + 7, sy - 3);
  } else if (state.mouse.snapType === 'edge') {
    // Snap k hraně objektu – kolečko + souřadnice nad ním
    ctx.strokeStyle = COLORS.snapEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.stroke();
    const coordLabel = fmtCoordLabel(state.mouse.x, state.mouse.y);
    const fontSize = Math.max(9, snapLabelSize - 4);
    ctx.font = `${fontSize}px Consolas`;
    ctx.fillStyle = COLORS.snapEdge;
    const tw = ctx.measureText(coordLabel).width;
    ctx.fillText(coordLabel, sx - tw / 2, sy - 40);
  }

  // Vodící čára od raw pozice k snap pozici
  if (state.mouse.rawX !== undefined) {
    const [rawSx, rawSy] = worldToScreen(state.mouse.rawX, state.mouse.rawY);
    const dist = Math.hypot(rawSx - sx, rawSy - sy);
    if (dist > 3) {
      ctx.strokeStyle = "rgba(137, 180, 250, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(rawSx, rawSy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ── Šipka kóty ──
function drawDimArrow(fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const arrowLen = ARROW_LENGTH;
  const arrowAngle = ARROW_ANGLE;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(fromX + arrowLen * Math.cos(angle + arrowAngle), fromY + arrowLen * Math.sin(angle + arrowAngle));
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(fromX + arrowLen * Math.cos(angle - arrowAngle), fromY + arrowLen * Math.sin(angle - arrowAngle));
  ctx.stroke();
}

// ── Kolize kótových popisků ──
/**
 * Ověří, zda se obdélník [x,y,w,h] překrývá s dříve umístěnými popisky.
 * Pokud ano, vrátí odsazenou pozici s volným místem.
 * Registruje výsledný obdélník do _dimLabelRects.
 * @returns {{ x: number, y: number, collided: boolean }}
 */
function resolveDimLabelPos(x, y, textW, textH) {
  const pad = 4; // mezera kolem textu
  const rect = { x: x - pad, y: y - textH - pad, w: textW + pad * 2, h: textH + pad * 2 };

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  let collided = false;
  let offsetY = 0;
  const step = textH + pad * 2;
  let maxTries = 8;

  while (maxTries-- > 0) {
    const testRect = { x: rect.x, y: rect.y + offsetY, w: rect.w, h: rect.h };
    let hasCollision = false;
    for (const existing of _dimLabelRects) {
      if (overlaps(testRect, existing)) {
        hasCollision = true;
        collided = true;
        break;
      }
    }
    if (!hasCollision) break;
    // Zkusit posunout nahoru (záporný Y ve screen = nahoru)
    offsetY -= step;
  }

  const finalRect = { x: rect.x, y: rect.y + offsetY, w: rect.w, h: rect.h };
  _dimLabelRects.push(finalRect);
  return { x, y: y + offsetY, collided };
}

// ── Čísla objektů na výkrese ──
function drawObjectNumbers() {
  const fontSize = Math.round(Math.min(20, Math.max(13, 10 + state.zoom * 5)));
  ctx.font = `bold ${fontSize}px Consolas`;

  // Counter only for non-dimension objects (matches object list numbering)
  let num = 0;
  state.objects.forEach((obj, idx) => {
    if (obj.isDimension || obj.isCoordLabel) return;
    num++;

    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    // Compute center position of object
    let cx, cy;
    switch (obj.type) {
      case "point":
        cx = obj.x; cy = obj.y;
        break;
      case "line":
      case "constr":
        cx = (obj.x1 + obj.x2) / 2; cy = (obj.y1 + obj.y2) / 2;
        break;
      case "circle":
        cx = obj.cx; cy = obj.cy;
        break;
      case "arc":
        { const midAngle = (obj.startAngle + obj.endAngle) / 2;
          cx = obj.cx + obj.r * Math.cos(midAngle);
          cy = obj.cy + obj.r * Math.sin(midAngle); }
        break;
      case "rect":
        cx = (obj.x1 + obj.x2) / 2; cy = (obj.y1 + obj.y2) / 2;
        break;
      case "polyline":
        if (obj.vertices && obj.vertices.length > 0) {
          let sx = 0, sy = 0;
          obj.vertices.forEach(v => { sx += v.x; sy += v.y; });
          cx = sx / obj.vertices.length; cy = sy / obj.vertices.length;
        } else { return; }
        break;
      default:
        return;
    }

    const [scx, scy] = worldToScreen(cx, cy);
    const label = String(num);
    const tw = ctx.measureText(label).width;
    const pad = 4;
    const bw = tw + pad * 2;
    const bh = fontSize + pad * 2;

    // Background pill
    const isSel = idx === state.selected || state.multiSelected.has(idx);
    ctx.fillStyle = isSel ? COLORS.selected : COLORS.yellow;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const rx = scx - bw / 2, ry = scy - bh / 2;
    const r = 4;
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + bw - r, ry);
    ctx.arcTo(rx + bw, ry, rx + bw, ry + r, r);
    ctx.lineTo(rx + bw, ry + bh - r);
    ctx.arcTo(rx + bw, ry + bh, rx + bw - r, ry + bh, r);
    ctx.lineTo(rx + r, ry + bh);
    ctx.arcTo(rx, ry + bh, rx, ry + bh - r, r);
    ctx.lineTo(rx, ry + r);
    ctx.arcTo(rx, ry, rx + r, ry, r);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Number text
    ctx.fillStyle = COLORS.bgDark;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, scx, scy);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  });
}

/** Vykreslí čísla průsečíků (P1, P2, …) na výkrese. */
function drawIntersectionNumbers() {
  if (state.intersections.length === 0) return;
  const fontSize = Math.round(Math.min(20, Math.max(13, 10 + state.zoom * 5)));
  ctx.font = `bold ${fontSize}px Consolas`;

  state.intersections.forEach((pt, i) => {
    const [scx, scy] = worldToScreen(pt.x, pt.y);
    const label = `P${i + 1}`;
    const tw = ctx.measureText(label).width;
    const pad = 4;
    const bw = tw + pad * 2;
    const bh = fontSize + pad * 2;

    const isSelPt = state.selectedPoint != null
      && state.selectedPoint.some(sp => Math.hypot(pt.x - sp.x, pt.y - sp.y) < 1e-4);

    // Background pill
    ctx.fillStyle = isSelPt ? COLORS.selected : '#a6e3a1';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const rx = scx - bw / 2, ry = scy - bh - 6;
    const r = 4;
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + bw - r, ry);
    ctx.arcTo(rx + bw, ry, rx + bw, ry + r, r);
    ctx.lineTo(rx + bw, ry + bh - r);
    ctx.arcTo(rx + bw, ry + bh, rx + bw - r, ry + bh, r);
    ctx.lineTo(rx + r, ry + bh);
    ctx.arcTo(rx, ry + bh, rx, ry + bh - r, r);
    ctx.lineTo(rx, ry + r);
    ctx.arcTo(rx, ry, rx + r, ry, r);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Number text
    ctx.fillStyle = COLORS.bgDark;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, scx, ry + bh / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  });
}

// ── Kóty / rozměry ──
function drawDimension(obj) {
  const dimSize = Math.round(Math.min(18, Math.max(12, 8 + state.zoom * 4)));
  ctx.font = `${dimSize}px Consolas`;
  ctx.fillStyle = COLORS.textSecondary;
  const offset = 14;
  switch (obj.type) {
    case "line":
      // Délka úsečky se zobrazuje jen přes explicitní kótu (isDimension)
      break;
    case "circle": {
      const [sx, sy] = worldToScreen(obj.cx, obj.cy);
      const rText = `R${obj.r.toFixed(state.displayDecimals)}`;
      const dText = `⌀${(obj.r * 2).toFixed(state.displayDecimals)}`;
      const rW = ctx.measureText(rText).width;
      const dW = ctx.measureText(dText).width;
      const r1 = resolveDimLabelPos(sx + 6, sy - 6, rW, dimSize);
      ctx.fillText(rText, sx + 6, r1.y);
      if (r1.collided) { ctx.strokeStyle = COLORS.textSecondary; ctx.lineWidth = 0.5; ctx.setLineDash([2,2]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, r1.y); ctx.stroke(); ctx.setLineDash([]); }
      const d1 = resolveDimLabelPos(sx + 6, sy + 14, dW, dimSize);
      ctx.fillText(dText, sx + 6, d1.y);
      break;
    }
    case "arc": {
      const [sx, sy] = worldToScreen(obj.cx, obj.cy);
      const rText = `R${obj.r.toFixed(state.displayDecimals)}`;
      const rW = ctx.measureText(rText).width;
      const r1 = resolveDimLabelPos(sx + 6, sy - 6, rW, dimSize);
      ctx.fillText(rText, sx + 6, r1.y);
      if (r1.collided) { ctx.strokeStyle = COLORS.textSecondary; ctx.lineWidth = 0.5; ctx.setLineDash([2,2]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, r1.y); ctx.stroke(); ctx.setLineDash([]); }
      break;
    }
    case "rect": {
      const rc = getRectCorners(obj);
      const w = Math.abs(obj.x2 - obj.x1),
        h = Math.abs(obj.y2 - obj.y1);
      const [sx1r, sy1r] = worldToScreen(rc[0].x, rc[0].y);
      const [sx2r, sy2r] = worldToScreen(rc[1].x, rc[1].y);
      const [sx3r, sy3r] = worldToScreen(rc[2].x, rc[2].y);
      ctx.fillText(
        w.toFixed(state.displayDecimals),
        (sx1r + sx2r) / 2 - 15,
        Math.min(sy1r, sy2r) - 4,
      );
      ctx.fillText(
        h.toFixed(state.displayDecimals),
        Math.max(sx2r, sx3r) + 4,
        (sy2r + sy3r) / 2 + 4,
      );
      break;
    }
    case "polyline": {
      // Total length
      let totalLen = 0;
      const pn = obj.vertices.length;
      const pSegCount = obj.closed ? pn : pn - 1;
      for (let i = 0; i < pSegCount; i++) {
        const pp1 = obj.vertices[i];
        const pp2 = obj.vertices[(i + 1) % pn];
        const pb = obj.bulges[i] || 0;
        if (pb === 0) {
          totalLen += Math.hypot(pp2.x - pp1.x, pp2.y - pp1.y);
        } else {
          const parc = bulgeToArc(pp1, pp2, pb);
          if (parc) {
            const theta = 4 * Math.atan(Math.abs(pb));
            totalLen += parc.r * theta;
          }
        }
      }
      if (pn >= 1) {
        const [psx, psy] = worldToScreen(obj.vertices[0].x, obj.vertices[0].y);
        ctx.fillText(`L${totalLen.toFixed(state.displayDecimals)} [${pn}v]`, psx + 8, psy - 8);
      }
      break;
    }
  }
}

// ── Kreslicí primitiva ──
/** @param {import('./types.js').PointObject} obj */
export function drawPoint(obj) {
  const [sx, sy] = worldToScreen(obj.x, obj.y);

  if (obj.isCoordLabel) {
    // Odkazová čára (leader) se souřadnicemi
    const leaderLen = 30;
    const shelfLen = 40;
    const dimSize = Math.round(Math.min(21, Math.max(10, 7 + state.zoom * 4)));
    ctx.font = dimSize + 'px Consolas';
    const labelText = fmtCoordLabel(obj.x, obj.y);
    const labelW = ctx.measureText(labelText).width;
    const baseEx = sx + leaderLen;
    const baseEy = sy - leaderLen;
    // Detekce kolize – posune výš při překryvu
    const resolved = resolveDimLabelPos(baseEx + 2, baseEy - 3, labelW + shelfLen, dimSize);
    const ey = resolved.collided ? resolved.y + 3 : baseEy;
    const ex = baseEx;
    // Šikmá čára od bodu
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    // Vodorovná polička
    ctx.lineTo(ex + shelfLen, ey);
    ctx.stroke();
    // Kroužek na bodě
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.stroke();
    // Text souřadnic
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(labelText, ex + 2, ey - 3);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx - 6, sy);
  ctx.lineTo(sx + 6, sy);
  ctx.moveTo(sx, sy - 6);
  ctx.lineTo(sx, sy + 6);
  ctx.stroke();
}

/** @param {import('./types.js').LineObject} obj */
export function drawLine(obj) {
  const [sx1, sy1] = worldToScreen(obj.x1, obj.y1);
  const [sx2, sy2] = worldToScreen(obj.x2, obj.y2);

  if (obj.isDimension) {
    const dimType = obj.dimType || 'linear';
    const dimSize = Math.round(Math.min(24, Math.max(11, 8 + state.zoom * 4.5)));
    ctx.font = dimSize + 'px Consolas';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    if (dimType === 'angular') {
      // ── Úhlová kóta – oblouk s popiskem úhlu ──
      const cx = obj.dimCenterX, cy = obj.dimCenterY;
      const [scx, scy] = worldToScreen(cx, cy);
      const r = obj.dimRadius || 20;
      const sr = r * state.zoom;
      const startA = Math.atan2(obj.y1 - cy, obj.x1 - cx);
      const endA = Math.atan2(obj.y2 - cy, obj.x2 - cx);
      // Odkazové čáry od středu k oblouku
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(scx, scy);
      ctx.lineTo(sx1, sy1);
      ctx.moveTo(scx, scy);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      // Oblouk kóty – vždy kratší oblouk
      const aR = sr * 0.8;
      const screenStart = -startA;
      const screenEnd = -endA;
      let ccwSweep = screenStart - screenEnd;
      while (ccwSweep < 0) ccwSweep += 2 * Math.PI;
      while (ccwSweep >= 2 * Math.PI) ccwSweep -= 2 * Math.PI;
      const useCCW = ccwSweep <= Math.PI;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(scx, scy, aR, screenStart, screenEnd, useCCW);
      ctx.stroke();
      // Šipky na koncích oblouku
      const arrA1x = scx + aR * Math.cos(screenStart);
      const arrA1y = scy + aR * Math.sin(screenStart);
      const arrA2x = scx + aR * Math.cos(screenEnd);
      const arrA2y = scy + aR * Math.sin(screenEnd);
      drawDimArrow(arrA1x, arrA1y, scx, scy);
      drawDimArrow(arrA2x, arrA2y, scx, scy);
      // Text úhlu – uprostřed oblouku
      const actualSweep = useCCW ? ccwSweep : (2 * Math.PI - ccwSweep);
      const halfSweep = actualSweep / 2;
      const midScreen = useCCW ? screenStart - halfSweep : screenStart + halfSweep;
      const labelX = scx + aR * Math.cos(midScreen);
      const labelY = scy + aR * Math.sin(midScreen);
      let sweep = obj.dimAngle || actualSweep;
      if (sweep < 0) sweep += 2 * Math.PI;
      const labelText = `${(sweep * 180 / Math.PI).toFixed(1)}°`;
      ctx.fillText(labelText, labelX, labelY - 4);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      return;
    }

    if (dimType === 'diameter') {
      // ── Průměrová kóta – čára přes střed se symbolem ⌀ ──
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      // Šipky na obou koncích
      drawDimArrow(sx1, sy1, sx2, sy2);
      drawDimArrow(sx2, sy2, sx1, sy1);
      // Text ⌀ hodnota
      const diam = (obj.dimRadius || 0) * 2;
      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2;
      const labelText = `⌀${diam.toFixed(state.displayDecimals)}`;
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(textAngle);
      ctx.fillText(labelText, 0, -4);
      ctx.restore();
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      return;
    }

    if (dimType === 'radius') {
      // ── Radiální kóta – čára od středu k bodu s R ──
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      // Šipka pouze na vnějším konci (sx2, sy2)
      drawDimArrow(sx2, sy2, sx1, sy1);
      // Kroužek na středu
      ctx.beginPath();
      ctx.arc(sx1, sy1, 2.5, 0, Math.PI * 2);
      ctx.stroke();
      // Text R hodnota
      const radius = obj.dimRadius || Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2;
      const labelText = `R${radius.toFixed(state.displayDecimals)}`;
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(textAngle);
      ctx.fillText(labelText, 0, -4);
      ctx.restore();
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // ── Lineární kóta (výchozí) – odkazové čáry + odsazená kóta + šipky + text ──
    const hasSrc = obj.dimSrcX1 !== undefined;
    const ox1 = hasSrc ? obj.dimSrcX1 : obj.x1;
    const oy1 = hasSrc ? obj.dimSrcY1 : obj.y1;
    const ox2 = hasSrc ? obj.dimSrcX2 : obj.x2;
    const oy2 = hasSrc ? obj.dimSrcY2 : obj.y2;
    const [osx1, osy1] = worldToScreen(ox1, oy1);
    const [osx2, osy2] = worldToScreen(ox2, oy2);

    const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
    const extOver = 4;
    const enx = -Math.sin(angle) * extOver;
    const eny = Math.cos(angle) * extOver;

    // Odkazové čáry
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(osx1, osy1);
    ctx.lineTo(sx1 + enx, sy1 + eny);
    ctx.moveTo(osx2, osy2);
    ctx.lineTo(sx2 + enx, sy2 + eny);
    ctx.stroke();

    // Hlavní kótovací čára
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();

    // Šipky
    drawDimArrow(sx1, sy1, sx2, sy2);
    drawDimArrow(sx2, sy2, sx1, sy1);

    // Text délky – rotovaný rovnoběžně s kótou, s detekcí kolizí
    const len = Math.hypot(ox2 - ox1, oy2 - oy1);
    const mx = (sx1 + sx2) / 2;
    const my = (sy1 + sy2) / 2;
    const labelText = len.toFixed(state.displayDecimals);
    const textW = ctx.measureText(labelText).width;
    const textH = dimSize;

    const resolved = resolveDimLabelPos(mx - textW / 2, my - 4, textW, textH);
    const labelY = resolved.y;

    if (resolved.collided) {
      ctx.strokeStyle = COLORS.textSecondary;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx, labelY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    let textAngle = angle;
    if (textAngle > Math.PI / 2) textAngle -= Math.PI;
    if (textAngle < -Math.PI / 2) textAngle += Math.PI;
    ctx.save();
    if (resolved.collided) {
      ctx.translate(mx, labelY);
    } else {
      ctx.translate(mx, my);
      ctx.rotate(textAngle);
    }
    ctx.fillText(labelText, 0, -4);
    ctx.restore();
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  if (obj.type === "constr") {
    const dx = sx2 - sx1,
      dy = sy2 - sy1;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return;
    const scale = 5000 / len;
    ctx.beginPath();
    ctx.moveTo(sx1 - dx * scale, sy1 - dy * scale);
    ctx.lineTo(sx2 + dx * scale, sy2 + dy * scale);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(sx1, sy1, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx2, sy2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** @param {import('./types.js').CircleObject} obj */
export function drawCircle(obj) {
  const [sx, sy] = worldToScreen(obj.cx, obj.cy);
  const r = obj.r * state.zoom;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** @param {import('./types.js').ArcObject} obj */
export function drawArc(obj) {
  const [sx, sy] = worldToScreen(obj.cx, obj.cy);
  const r = obj.r * state.zoom;
  ctx.beginPath();
  // ccw in math → canvas anticlockwise=true; default (no ccw) = CCW for backward compat
  ctx.arc(sx, sy, r, -obj.startAngle, -obj.endAngle, obj.ccw !== false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Středová značka (křížek) pro kružnice a oblouky. */
function drawCenterMark(obj) {
  if (!obj.r || obj.r <= 0) return;
  const [sx, sy] = worldToScreen(obj.cx, obj.cy);
  const r = obj.r * state.zoom;
  const ext = Math.min(r * 0.15, 8); // přesah za kružnici
  const halfLen = r + ext;
  const savedStroke = ctx.strokeStyle;
  const savedWidth = ctx.lineWidth;
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - halfLen, sy);
  ctx.lineTo(sx + halfLen, sy);
  ctx.moveTo(sx, sy - halfLen);
  ctx.lineTo(sx, sy + halfLen);
  ctx.stroke();
  // Malé kolečko ve středu
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = savedStroke;
  ctx.lineWidth = savedWidth;
}

/** @param {import('./types.js').RectObject} obj */
export function drawRect(obj, isSel, normalColor, objIdx) {
  const c = getRectCorners(obj);
  const sc = c.map(p => worldToScreen(p.x, p.y));
  const objSegs = state.multiSelectedSegments.get(objIdx);
  const isSegMode = objSegs && objSegs.size > 0;
  const isSegSelected = (i) => isSegMode && objSegs.has(i);

  if (isSegMode) {
    const baseStroke = ctx.strokeStyle;
    const baseWidth = ctx.lineWidth;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (isSegSelected(i)) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = LINE_WIDTH_SELECTED;
      } else {
        ctx.strokeStyle = normalColor || COLORS.primary;
        ctx.lineWidth = LINE_WIDTH;
      }
      ctx.beginPath();
      ctx.moveTo(sc[i][0], sc[i][1]);
      ctx.lineTo(sc[j][0], sc[j][1]);
      ctx.stroke();
    }
    // Vertex dots
    for (let i = 0; i < 4; i++) {
      const isVtxSel = isSegSelected(i) || isSegSelected((i + 3) % 4);
      ctx.fillStyle = isVtxSel ? COLORS.selected : (normalColor || COLORS.primary);
      ctx.beginPath();
      ctx.arc(sc[i][0], sc[i][1], isVtxSel ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = baseWidth;
    ctx.fillStyle = baseStroke;
  } else {
    ctx.beginPath();
    ctx.moveTo(sc[0][0], sc[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(sc[i][0], sc[i][1]);
    ctx.closePath();
    ctx.stroke();
  }
}

/** @param {import('./types.js').PolylineObject} obj */
export function drawPolyline(obj, isSel, normalColor, objIdx) {
  const n = obj.vertices.length;
  if (n < 2) return;
  const segCount = obj.closed ? n : n - 1;
  const objSegs = state.multiSelectedSegments.get(objIdx);
  const isSegMode = objSegs && objSegs.size > 0;
  const isSegSelected = (i) => isSegMode && objSegs.has(i);

  // Save current styles
  const baseStroke = ctx.strokeStyle;
  const baseWidth = ctx.lineWidth;

  for (let i = 0; i < segCount; i++) {
    const p1 = obj.vertices[i];
    const p2 = obj.vertices[(i + 1) % n];
    const b = obj.bulges[i] || 0;
    const [sx1, sy1] = worldToScreen(p1.x, p1.y);
    const [sx2, sy2] = worldToScreen(p2.x, p2.y);

    // When a segment is selected: selected segment = white, rest = normal color
    if (isSegSelected(i)) {
      ctx.strokeStyle = COLORS.selected;  // White for selected segment
      ctx.lineWidth = LINE_WIDTH_SELECTED;
    } else if (isSegMode) {
      ctx.strokeStyle = normalColor || COLORS.primary;
      ctx.lineWidth = LINE_WIDTH;
    }

    if (b === 0) {
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    } else {
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        const [scx, scy] = worldToScreen(arc.cx, arc.cy);
        const sr = arc.r * state.zoom;
        ctx.beginPath();
        ctx.arc(scx, scy, sr, -arc.endAngle, -arc.startAngle, b < 0);
        ctx.stroke();
      }
    }
  }

  // Restore styles
  ctx.strokeStyle = baseStroke;
  ctx.lineWidth = baseWidth;

  // Vertex dots — skrýt u polylines s mnoha vertexy (boolean výsledky, kruhové aproximace)
  const showVertexDots = n <= 20 || isSel || isSegMode;
  if (showVertexDots) {
    for (let vi = 0; vi < n; vi++) {
      const v = obj.vertices[vi];
      const [sx, sy] = worldToScreen(v.x, v.y);
      // Highlight vertices of selected segments in white, others in normal color
      const isVtxSel = isSegMode && (isSegSelected(vi) || isSegSelected(((vi - 1) % n + n) % n));
      if (isSegMode) {
        ctx.fillStyle = isVtxSel ? COLORS.selected : (normalColor || COLORS.primary);
      } else {
        ctx.fillStyle = baseStroke;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, isVtxSel ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Restore fillStyle
  ctx.fillStyle = baseStroke;
}

/** @param {import('./types.js').TextObject} obj */
export function drawText(obj, isSel) {
  const [sx, sy] = worldToScreen(obj.x, obj.y);
  const fontSize = obj.fontSize || 14;
  const screenSize = Math.round(Math.max(1, fontSize * state.zoom));
  const fontFamily = obj.fontFamily || 'Consolas, monospace';
  const bold = obj.bold ? 'bold ' : '';
  const italic = obj.italic ? 'italic ' : '';

  // Omezení velikosti fontu – prohlížeče mohou přestat kreslit velký text
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  ctx.font = `${italic}${bold}${clampedSize}px ${fontFamily}`;
  ctx.fillStyle = isSel ? COLORS.selected : (obj.color || COLORS.text);
  const align = obj.textAlign || 'left';
  ctx.textAlign = align;
  ctx.textBaseline = 'bottom';
  const spacing = (obj.letterSpacing || 0) * state.zoom;
  const textStr = obj.text || '';

  // Text podél cesty (úsečka nebo oblouk)
  if (obj.pathMode && obj.pathMode !== 'none' && obj.pathObjectId != null) {
    const pathObj = state.objects[obj.pathObjectId];
    if (pathObj) {
      const pathOffset = (obj.pathOffset || 0) * state.zoom;
      const pathStart = (obj.pathStart || 0) * state.zoom;
      const fontStr = ctx.font;
      if (obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
        _drawTextAlongLine(textStr, pathObj, screenSize, spacing, pathOffset, pathStart, align, fontStr);
      } else if (obj.pathMode === 'arc' && pathObj.type === 'arc') {
        _drawTextAlongArc(textStr, pathObj, screenSize, spacing, pathOffset, obj.pathStart || 0, align, fontStr);
      } else if (obj.pathMode === 'circle' && pathObj.type === 'circle') {
        _drawTextAlongCircle(textStr, pathObj, screenSize, spacing, pathOffset, obj.pathStart || 0, align, fontStr);
      }
      // Viditelný marker (čtvereček) na začátku cesty, aby šel text snadno vybrat
      let msx, msy;
      if (obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
        [msx, msy] = worldToScreen(pathObj.x1, pathObj.y1);
      } else if (obj.pathMode === 'arc' && pathObj.type === 'arc') {
        [msx, msy] = worldToScreen(pathObj.cx + pathObj.r * Math.cos(pathObj.startAngle), pathObj.cy + pathObj.r * Math.sin(pathObj.startAngle));
      } else if (obj.pathMode === 'circle' && pathObj.type === 'circle') {
        [msx, msy] = worldToScreen(pathObj.cx, pathObj.cy - pathObj.r);
      } else {
        [msx, msy] = [sx, sy];
      }
      ctx.beginPath();
      const mSize = 4;
      ctx.rect(msx - mSize, msy - mSize, mSize * 2, mSize * 2);
      ctx.fillStyle = isSel ? COLORS.selected : (obj.color || COLORS.text);
      ctx.fill();
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      return;
    }
  }

  // Standardní text (s/bez rotace)
  const sSx = sx / fontScale, sSy = sy / fontScale;
  const sSpacing = spacing / fontScale;
  if (sSpacing && textStr.length > 1) {
    // Vykreslení po znacích s mezerou
    ctx.save();
    if (fontScale > 1) ctx.scale(fontScale, fontScale);
    ctx.translate(sSx, sSy);
    if (obj.rotation) ctx.rotate(-obj.rotation);
    ctx.textAlign = 'left';
    let offsetX = 0;
    if (align === 'center') {
      const totalW = _measureTextSpaced(textStr, sSpacing);
      offsetX = -totalW / 2;
    } else if (align === 'right') {
      const totalW = _measureTextSpaced(textStr, sSpacing);
      offsetX = -totalW;
    }
    for (let i = 0; i < textStr.length; i++) {
      ctx.fillText(textStr[i], offsetX, 0);
      offsetX += ctx.measureText(textStr[i]).width + sSpacing;
    }
    ctx.restore();
  } else if (obj.rotation) {
    ctx.save();
    if (fontScale > 1) ctx.scale(fontScale, fontScale);
    ctx.translate(sSx, sSy);
    ctx.rotate(-obj.rotation);
    ctx.fillText(textStr, 0, 0);
    ctx.restore();
  } else {
    ctx.save();
    if (fontScale > 1) ctx.scale(fontScale, fontScale);
    ctx.fillText(textStr, sSx, sSy);
    ctx.restore();
  }
  // Malý marker na kotevním bodě
  ctx.beginPath();
  ctx.arc(sx, sy, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/** Měří šířku textu s mezerou mezi znaky */
function _measureTextSpaced(text, spacing) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += ctx.measureText(text[i]).width;
    if (i < text.length - 1) w += spacing;
  }
  return w;
}

/** Vykreslí text podél úsečky */
function _drawTextAlongLine(text, lineObj, screenSize, spacing, pathOffset, pathStart, align, fontStr) {
  const [sx1, sy1] = worldToScreen(lineObj.x1, lineObj.y1);
  const [sx2, sy2] = worldToScreen(lineObj.x2, lineObj.y2);
  const dx = sx2 - sx1, dy = sy2 - sy1;
  const lineLen = Math.hypot(dx, dy);
  if (lineLen < 1) return;
  const angle = Math.atan2(dy, dx);
  const nx = dy / lineLen;
  const ny = -dx / lineLen;
  const off = pathOffset || 0;
  const startOff = pathStart || 0;

  // Omezení velikosti fontu – při velkém zoomu použij scale
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  ctx.save();
  if (fontStr && fontScale > 1) {
    ctx.font = fontStr.replace(/(\d+)px/, clampedSize + 'px');
  } else if (fontStr) {
    ctx.font = fontStr;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  if (fontScale > 1) ctx.scale(fontScale, fontScale);
  const sLineLen = lineLen / fontScale;
  const sOff = off / fontScale;
  const sSpacing = spacing / fontScale;
  const sSx1 = sx1 / fontScale, sSy1 = sy1 / fontScale;
  const sDx = dx / fontScale, sDy = dy / fontScale;
  const sStartOff = startOff / fontScale;

  // Vypočti celkovou šířku textu pro zarovnání
  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    totalW += ctx.measureText(text[i]).width;
    if (i < text.length - 1) totalW += sSpacing;
  }

  let offsetX = sStartOff;
  if (align === 'center') {
    offsetX += (sLineLen - totalW) / 2;
  } else if (align === 'right') {
    offsetX += sLineLen - totalW;
  }

  for (let i = 0; i < text.length; i++) {
    const charW = ctx.measureText(text[i]).width;
    if (offsetX + charW > sLineLen) break;
    if (offsetX < 0) { offsetX += charW + sSpacing; continue; }
    const px = sSx1 + sDx * (offsetX / sLineLen) + nx * sOff;
    const py = sSy1 + sDy * (offsetX / sLineLen) + ny * sOff;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillText(text[i], 0, -2);
    ctx.restore();
    offsetX += charW + sSpacing;
  }
  ctx.restore();
}

/** Vykreslí text podél oblouku */
function _drawTextAlongArc(text, arcObj, screenSize, spacing, pathOffset, pathStartAngle, align, fontStr) {
  const [scx, scy] = worldToScreen(arcObj.cx, arcObj.cy);
  const sr = arcObj.r * state.zoom;
  if (sr < 1) return;

  let startAngle = -arcObj.startAngle;
  let endAngle = -arcObj.endAngle;
  if (endAngle > startAngle) {
    const tmp = startAngle;
    startAngle = endAngle;
    endAngle = tmp;
  }

  // Omezení velikosti fontu – při velkém zoomu použij scale
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  ctx.save();
  if (fontStr && fontScale > 1) {
    ctx.font = fontStr.replace(/(\d+)px/, clampedSize + 'px');
  } else if (fontStr) {
    ctx.font = fontStr;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const scaledRadius = (sr + (pathOffset != null ? pathOffset : 4)) / fontScale;
  const scaledSpacing = spacing / fontScale;
  const scaledSCX = scx / fontScale;
  const scaledSCY = scy / fontScale;
  if (scaledRadius < 1) { ctx.restore(); return; }

  // Celkový úhel textu pro zarovnání
  let totalAngle = 0;
  for (let i = 0; i < text.length; i++) {
    totalAngle += ctx.measureText(text[i]).width / scaledRadius;
    if (i < text.length - 1) totalAngle += scaledSpacing / scaledRadius;
  }
  const arcSpan = startAngle - endAngle;

  let currentAngle = startAngle - (pathStartAngle || 0);
  if (align === 'center') {
    currentAngle -= (arcSpan - totalAngle) / 2;
  } else if (align === 'right') {
    currentAngle -= (arcSpan - totalAngle);
  }

  if (fontScale > 1) ctx.scale(fontScale, fontScale);

  for (let i = 0; i < text.length; i++) {
    const charW = ctx.measureText(text[i]).width;
    const charAngle = charW / scaledRadius;
    const halfChar = charAngle / 2;
    const drawAngle = currentAngle - halfChar;

    if (drawAngle < endAngle) break;

    const px = scaledSCX + scaledRadius * Math.cos(drawAngle);
    const py = scaledSCY + scaledRadius * Math.sin(drawAngle);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(drawAngle - Math.PI / 2);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();

    currentAngle -= charAngle + (scaledSpacing / scaledRadius);
  }
  ctx.restore();
}

/** Vykreslí text podél kružnice */
function _drawTextAlongCircle(text, circleObj, screenSize, spacing, pathOffset, pathStartAngle, align, fontStr) {
  const [scx, scy] = worldToScreen(circleObj.cx, circleObj.cy);
  const sr = circleObj.r * state.zoom;
  if (sr < 1) return;

  // Omezení velikosti fontu – při velkém zoomu použij scale
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  ctx.save();
  // Přepočti font s omezenou velikostí
  if (fontStr && fontScale > 1) {
    ctx.font = fontStr.replace(/(\d+)px/, clampedSize + 'px');
  } else if (fontStr) {
    ctx.font = fontStr;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  // Poloměr a odsazení – přepočítáno na scaled souřadnice
  const scaledRadius = (sr + (pathOffset != null ? pathOffset : 4)) / fontScale;
  const scaledSpacing = spacing / fontScale;
  const scaledSCX = scx / fontScale;
  const scaledSCY = scy / fontScale;
  if (scaledRadius < 1) { ctx.restore(); return; }

  // Celkový úhel textu pro zarovnání kolem kružnice
  let totalAngle = 0;
  for (let i = 0; i < text.length; i++) {
    totalAngle += ctx.measureText(text[i]).width / scaledRadius;
    if (i < text.length - 1) totalAngle += scaledSpacing / scaledRadius;
  }

  // Začátek nahoře (screen -π/2) + úhlový posun
  let currentAngle = -Math.PI / 2 - (pathStartAngle || 0);
  if (align === 'center') {
    currentAngle += totalAngle / 2;
  } else if (align === 'right') {
    currentAngle += totalAngle;
  }

  // Aplikuj scale pro velké fonty
  if (fontScale > 1) ctx.scale(fontScale, fontScale);

  for (let i = 0; i < text.length; i++) {
    const charW = ctx.measureText(text[i]).width;
    const charAngle = charW / scaledRadius;
    const halfChar = charAngle / 2;
    const drawAngle = currentAngle - halfChar;

    const px = scaledSCX + scaledRadius * Math.cos(drawAngle);
    const py = scaledSCY + scaledRadius * Math.sin(drawAngle);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(drawAngle + Math.PI / 2);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();

    currentAngle -= charAngle + (scaledSpacing / scaledRadius);
  }
  ctx.restore();
}

// ── Vazební značky (constraints) ──
/** Offset značky od segmentu (v pixelech na obrazovce). */
const CONSTRAINT_OFFSET_PX = 22;

/** Spočítá world-souřadnice značky vazby – kolmo od středu segmentu. */
function _constraintMarkerPos(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Normála (kolmice) – vždy směrem "nahoru" v screen (tj. kladné Y ve world)
  let nx = -dy / len, ny = dx / len;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const off = CONSTRAINT_OFFSET_PX / state.zoom;
  return { x: mx + nx * off, y: my + ny * off };
}

/** Vykreslí symboly vazeb (═ vodorovná, ║ svislá, ∥ rovnoběžná) u segmentů. */
function drawConstraintMarkers() {
  const markerSize = Math.max(10, Math.min(18, 8 + state.zoom * 4));
  const isSelConstr = state._selectedConstraint;

  state.objects.forEach((obj, idx) => {
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    // Úsečky s vazbou
    if (obj.constraint && (obj.type === 'line' || obj.type === 'constr')) {
      const pos = _constraintMarkerPos(obj.x1, obj.y1, obj.x2, obj.y2);
      const isSel = isSelConstr && isSelConstr.objIdx === idx && isSelConstr.segIdx === null;
      _drawConstraintIcon(pos.x, pos.y, obj.constraint, markerSize, isSel);
    }

    // Kontury se segmentovými vazbami
    if (obj.segConstraints && obj.type === 'polyline') {
      const n = obj.vertices.length;
      for (const [si, type] of Object.entries(obj.segConstraints)) {
        const i = parseInt(si);
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        if (!p1 || !p2) continue;
        const pos = _constraintMarkerPos(p1.x, p1.y, p2.x, p2.y);
        const isSel = isSelConstr && isSelConstr.objIdx === idx && isSelConstr.segIdx === i;
        _drawConstraintIcon(pos.x, pos.y, type, markerSize, isSel);
      }
    }
  });
}

/** Vykreslí ikonu vazby na daných world-souřadnicích (přímo, bez dalšího offsetu). */
function _drawConstraintIcon(wx, wy, type, size, isSelected) {
  const [sx, sy] = worldToScreen(wx, wy);

  ctx.save();
  const bw = size + 8, bh = size + 4;
  const rx = sx - bw / 2, ry = sy - bh / 2;

  // Pozadí značky
  ctx.fillStyle = isSelected ? COLORS.delete : 'rgba(30, 30, 46, 0.85)';
  ctx.fillRect(rx, ry, bw, bh);

  // Obrys
  ctx.strokeStyle = isSelected ? COLORS.delete : COLORS.text;
  ctx.lineWidth = 1;
  ctx.strokeRect(rx, ry, bw, bh);

  // Symbol
  ctx.fillStyle = isSelected ? COLORS.bgDark : COLORS.yellow;
  ctx.font = `bold ${size}px Consolas`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let symbol = '?';
  if (type === 'horizontal') symbol = (state.nullPointActive && state.nullPointAngle) ? '═∡' : '═';
  else if (type === 'vertical') symbol = (state.nullPointActive && state.nullPointAngle) ? '║∡' : '║';
  else if (type === 'parallel') symbol = '∥';
  ctx.fillText(symbol, sx, sy);
  ctx.restore();
}

// ── Vodící čára pro angle snap ──
function renderAngleSnapGuide() {
  if (!state.angleSnap) return;

  // Určit referenční bod – tempPoints (kreslení), _copyPlaceRef (kopírování), dragStartWorld (přesun)
  let ref;
  if (state.tool === 'copyPlace' && state._copyPlaceRef) {
    ref = state._copyPlaceRef;
  } else if (state.tool === 'move' && state.dragging && state.dragStartWorld) {
    ref = state.dragStartWorld;
  } else if (state.drawing && state.tempPoints.length > 0
      && ['line', 'constr', 'polyline', 'measure', 'dimension', 'chainDimension'].includes(state.tool)) {
    ref = state.tempPoints[state.tempPoints.length - 1];
  } else {
    return;
  }
  const mx = state.mouse.x, my = state.mouse.y;
  const dx = mx - ref.x, dy = my - ref.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return;

  const angle = Math.atan2(dy, dx);
  // Offset od natočeného nulového bodu
  const offsetRad = (state.nullPointActive && state.nullPointAngle) ? (state.nullPointAngle * Math.PI / 180) : 0;
  const stepRad = (state.angleSnapStep * Math.PI) / 180;
  const relAngle = angle - offsetRad;
  const snappedAngle = Math.round(relAngle / stepRad) * stepRad + offsetRad;

  // Zobrazit vodítko jen když je úhel v toleranci (magnetický snap)
  const toleranceRad = (state.angleSnapTolerance * Math.PI) / 180;
  const diff = Math.abs(angle - snappedAngle);
  if (diff > toleranceRad) return;

  // Vodící čára – tečkovaná zelená (jen po délku ke kurzoru, neprodlužovat)
  const gx = ref.x + dist * Math.cos(snappedAngle);
  const gy = ref.y + dist * Math.sin(snappedAngle);
  const [sx1, sy1] = worldToScreen(ref.x, ref.y);
  const [sx2, sy2] = worldToScreen(gx, gy);

  ctx.save();
  ctx.strokeStyle = COLORS.dimension;
  ctx.lineWidth = 1;
  ctx.setLineDash(CONSTRUCTION_DASH);
  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Koncový bod snap čáry – zvýrazněný
  ctx.fillStyle = COLORS.dimension;
  ctx.beginPath();
  ctx.arc(sx2, sy2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Label s úhlem (zobrazit relativní úhel vůči natočení, pokud je aktivní)
  const angleDeg = ((snappedAngle * 180) / Math.PI);
  const dispAngle = (state.nullPointActive && state.nullPointAngle)
    ? (angleDeg - state.nullPointAngle) : angleDeg;
  const labelSize = Math.round(Math.min(22, Math.max(14, 10 + state.zoom * 6)));
  ctx.font = `${Math.max(10, labelSize - 2)}px Consolas`;
  ctx.fillStyle = COLORS.dimension;
  const labelX = sx2 + 10;
  const labelY = sy2 - 10;
  ctx.fillText(`${dispAngle.toFixed(1)}°`, labelX, labelY);
  ctx.restore();
}

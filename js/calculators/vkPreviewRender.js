// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – VK náhled kreslený přímo na CAD plátno              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// VK (Volná kontura) mělo dřív vlastní mini-canvas ve svém okně s vlastním
// zoomem/panem. Teď se kreslí rovnou na hlavní CAD plátno, takže náhled
// sdílí měřítko a polohu s výkresem a jde ho porovnat s tím, co už je
// nakreslené.
//
// Modul je oddělený od vkContour.js schválně: importuje canvas.js, které
// si při načtení sahá na `#drawCanvas`. vkContour.js musí zůstat bez DOM
// závislostí, aby jeho čisté funkce (parser, řešič, buildVkPreviewData)
// šly testovat ve vitest `environment: 'node'`.
//
// Registrace do bridge je side-effect importu (stejně jako
// `bridge.runCncExport` ve storage/fileIO.js) – kreslení stejně hlídá
// `state.vkPreview.visible`, takže se nic neregistruje/odregistrovává
// při každém otevření okna.

import { state, showToast, inputX } from '../state.js';
import { bridge } from '../bridge.js';
import { drawCanvas, worldToScreen, screenAngle, screenCCW } from '../canvas.js';
import { COLORS, AUTO_CENTER_PADDING, ZOOM_MIN, ZOOM_MAX } from '../constants.js';

// ── Převod VK ↔ CAD ─────────────────────────────────────────────
// VK bod je { x, z } v ŘÍDICÍCH souřadnicích tak, jak jsou napsané
// v G-kódu, tj. X v zobrazovaných jednotkách (průměr/poloměr dle
// ☰ Nastavení → 📏 Zobrazení). CAD plátno má X vždy jako POLOMĚR
// a osy prohozené podle typu stroje (viz fmtCoordLabel v state.js):
//   soustruh – CNC Z = wx (vodorovně), CNC X = wy (svisle)
//   karusel  – CNC X = wx, CNC Z = wy
// Vlastní vzorec se sem nepíše, používají se kanonické displayX/inputX.

/**
 * @param {{x: number, z: number}} pt VK bod (CNC X v zobrazovaných jednotkách)
 * @returns {[number, number]} [wx, wy] CAD world souřadnice
 */
export function vkToWorld(pt) {
  const r = inputX(pt.x);
  return state.machineType === 'karusel' ? [r, pt.z] : [pt.z, r];
}

/**
 * Opačný směr – z CAD plátna do VK zápisu (pro 🎯 výběr bodu z plátna).
 * @param {number} wx
 * @param {number} wy
 * @returns {{x: number, z: number}}
 */
export function worldToVk(wx, wy) {
  const isK = state.machineType === 'karusel';
  const radius = isK ? wx : wy;
  return { x: state.xDisplayMode === 'diameter' ? radius * 2 : radius, z: isK ? wy : wx };
}

/**
 * Oblouk VK prvku ve WORLD souřadnicích. Záměrně se nepoužívá
 * `resolveVkArcGeometry` – ta počítá v rovině řešiče (X = průměr), kde by
 * oblouk po převodu na plátno vyšel jako elipsa. R je v G-kódu vždy
 * SKUTEČNÝ poloměr, takže se konstrukce dělá až ve world prostoru –
 * stejně jako v `parseGcodeToObjects()` (storage/fileIO.js), aby náhled
 * a naparsovaný G-kód dávaly tentýž oblouk.
 * @returns {{cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean}|null}
 */
function arcInWorld(start, end, radius, direction) {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const [x1, y1] = vkToWorld(start);
  const [x2, y2] = vkToWorld(end);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist2 = dx * dx + dy * dy;
  if (dist2 < 1e-8 || radius * radius < dist2 / 4 - 1e-6) return null;
  const dist = Math.sqrt(dist2);
  const h = Math.sqrt(Math.max(0, radius * radius - dist2 / 4));
  const nx = -dy / dist;
  const ny = dx / dist;
  const sign = direction === 'G2' ? -1 : 1;
  const cx = (x1 + x2) / 2 + sign * h * nx;
  const cy = (y1 + y2) / 2 + sign * h * ny;
  return {
    cx, cy, r: radius,
    startAngle: Math.atan2(y1 - cy, x1 - cx),
    endAngle: Math.atan2(y2 - cy, x2 - cx),
    ccw: direction === 'G3',
  };
}

const SOLUTION_COLORS = ['delete', 'primary', 'dimension', 'yellow'];

function strokeLine(ctx, start, end) {
  const [sx1, sy1] = worldToScreen(...vkToWorld(start));
  const [sx2, sy2] = worldToScreen(...vkToWorld(end));
  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.stroke();
}

function dot(ctx, pt, radiusPx, color) {
  const [sx, sy] = worldToScreen(...vkToWorld(pt));
  ctx.beginPath();
  ctx.arc(sx, sy, radiusPx, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Nakreslí konstrukční paprsek (G111/G0 s PA) – polopřímka přes celé plátno. */
function strokeRay(ctx, segment) {
  if (!Number.isFinite(segment.angle)) return;
  const rad = (segment.angle * Math.PI) / 180;
  // Dost dlouhá, aby při jakémkoli zoomu přesáhla plátno.
  const extent = (drawCanvas.width + drawCanvas.height) / Math.max(state.zoom, 1e-6);
  const far = {
    z: segment.start.z + Math.cos(rad) * extent,
    x: segment.start.x + Math.sin(rad) * extent,
  };
  ctx.strokeStyle = COLORS.snapPoint;
  ctx.setLineDash([6, 4]);
  strokeLine(ctx, segment.start, far);
  ctx.setLineDash([]);
}

/**
 * Vykreslí náhled VK kontury na CAD plátno. Volá se z `renderAll()` přes
 * `bridge.renderVkPreview`, aby render.js nemusel znát VK modul.
 * @param {CanvasRenderingContext2D} ctx
 */
export function renderVkPreviewOnCad(ctx) {
  const data = state.vkPreview?.data;
  if (!data) return;

  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Varianty řešení (dvojznačný průsečík) – vybraná plně, ostatní slabě.
  const solutions = data.ambiguousSolutions || [];
  const selected = data.selectedSolutionIndex || 0;
  solutions.forEach((entry, index) => {
    const isSelected = index === selected;
    ctx.strokeStyle = isSelected
      ? COLORS[SOLUTION_COLORS[index % SOLUTION_COLORS.length]]
      : COLORS.construction;
    ctx.lineWidth = isSelected ? 2.4 : 1.1;
    ctx.setLineDash(isSelected ? [] : [4, 3]);
    strokeLine(ctx, entry.start, entry.end);
  });
  ctx.setLineDash([]);
  ctx.lineWidth = 2.2;

  for (const segment of data.segments || []) {
    if (segment.type === 'ray') {
      strokeRay(ctx, segment);
      continue;
    }
    if (segment.isDraft) {
      ctx.strokeStyle = COLORS.preview;
      ctx.setLineDash([6, 4]);
    } else {
      ctx.strokeStyle = COLORS.primary;
      ctx.setLineDash([]);
    }
    const arc = segment.type === 'arc'
      ? arcInWorld(segment.start, segment.end, segment.radius, segment.direction)
      : null;
    if (arc) {
      const [sx, sy] = worldToScreen(arc.cx, arc.cy);
      ctx.beginPath();
      ctx.arc(sx, sy, arc.r * state.zoom, screenAngle(arc.startAngle), screenAngle(arc.endAngle), screenCCW(arc.ccw));
      ctx.stroke();
    } else {
      strokeLine(ctx, segment.start, segment.end);
    }
    ctx.setLineDash([]);
  }

  if (data.vpol) dot(ctx, data.vpol, 4.5, COLORS.snapPoint);
  if (data.startPoint) dot(ctx, data.startPoint, 3.5, COLORS.selected);

  ctx.restore();
}

/** World AABB náhledu, nebo null když není co ukazovat. */
function previewWorldBounds(data) {
  const pts = [];
  if (data?.vpol) pts.push(data.vpol);
  for (const segment of data?.segments || []) {
    // Konstrukční paprsek je nekonečný – do rámování se počítá jen jeho začátek.
    pts.push(segment.start, segment.end);
  }
  if (pts.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of pts) {
    const [wx, wy] = vkToWorld(pt);
    minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
    minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
  }
  return isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

/**
 * Přizpůsobí pohled CAD plátna náhledu VK (tlačítko ⤢ v záložce VK).
 * Nahrazuje dřívější `fitViewportToPreview()`, které rámovalo zrušený
 * vlastní VK canvas.
 */
export function fitCadViewToVkPreview() {
  const bounds = previewWorldBounds(state.vkPreview?.data);
  if (!bounds) { showToast('VK zatím nemá co zobrazit'); return; }
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const zoomX = (drawCanvas.width * (1 - 2 * AUTO_CENTER_PADDING)) / w;
  const zoomY = (drawCanvas.height * (1 - 2 * AUTO_CENTER_PADDING)) / h;
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));
  // Pan se dopočítá z worldToScreen, aby se tu nemusela duplikovat
  // znaménka flipX/flipZ (hSign/vSign jsou interní pro canvas.js).
  state.panX = 0;
  state.panY = 0;
  const [cxPx, cyPx] = worldToScreen((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  state.panX = drawCanvas.width / 2 - cxPx;
  state.panY = drawCanvas.height / 2 - cyPx;
  const zoomEl = document.getElementById('statusZoom');
  if (zoomEl) zoomEl.textContent = `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
  bridge.renderAll?.();
}

bridge.renderVkPreview = renderVkPreviewOnCad;
bridge.fitVkPreviewView = fitCadViewToVkPreview;

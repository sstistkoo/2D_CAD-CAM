// SKICA – render: Náhled zrcadlení a výplně
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { boundsOverlap, getObjectBounds } from './bounds.js';
import { ctx, worldToScreen } from '../canvas.js';
import { resolveObjectColor } from './common.js';
import { COLORS, LINE_WIDTH } from '../constants.js';
import { objDash, objWidthMul } from '../lineStyles.js';
import { drawArc, drawCircle, drawLine, drawPoint, drawPolyline, drawRect } from './primitives.js';
import { state } from '../state.js';
import { drawAxisEdges } from './mirrorEdges.js';
import { mirrorObjectAcrossY, mirrorable } from './mirrorSnap.js';

/**
 * Vykreslí zrcadlenou kopii kontury kolem osy y=0 (jen zobrazení, objekty
 * nevznikají). Čarou jako originál — dokreslená druhá polovina nárysu má být
 * jako na výkresu plná; tenká čárkovaná patří skrytým hranám, třeba dírám
 * čel (uživatel 20. 10. 2026).
 */
export function renderMirrorPreview(vp) {
  ctx.save();

  state.objects.forEach((obj, idx) => {
    // Bez kót, textů, kresby čel (bokorys) a skrytých vrstev (mirrorSnap.js).
    if (!mirrorable(obj)) return;
    const layer = state.layers.find(l => l.id === obj.layer);

    const mirrored = mirrorObjectAcrossY(obj);
    if (!mirrored) return;

    if (obj.type !== 'constr') {
      const bounds = getObjectBounds(mirrored);
      if (bounds && !boundsOverlap(bounds, vp)) return;
    }

    const baseColor = (obj.type === 'constr' && !obj.color) ? COLORS.construction : resolveObjectColor(obj);
    ctx.strokeStyle = baseColor;
    ctx.fillStyle = baseColor;
    ctx.lineWidth = (layer?.lineWidth ?? LINE_WIDTH) * objWidthMul(obj);
    ctx.setLineDash(objDash(obj));

    switch (mirrored.type) {
      case 'point':
        drawPoint(mirrored);
        break;
      case 'line':
      case 'constr':
        drawLine(mirrored);
        break;
      case 'circle':
        drawCircle(mirrored);
        break;
      case 'arc':
        drawArc(mirrored);
        break;
      case 'rect':
        drawRect(mirrored, false, baseColor, -1);
        break;
      case 'polyline':
        drawPolyline(mirrored, false, baseColor, -1);
        break;
    }
  });

  // Hrany a přechody přes osu — celý pohled jako na výkrese (mirrorEdges.js).
  drawAxisEdges(ctx, worldToScreen);
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Vykreslí 'fill' objekty (nástroj "Vybarvit") jako samostatnou vrstvu pod
 * obrysy. Každá smyčka (obj.loops) je subpath jednoho Path2D vykresleného
 * pravidlem 'evenodd' — dvě smyčky (kontura + polotovar) tak automaticky
 * vybarví jen mezikruží mezi nimi, jedna smyčka vybarví celou plochu.
 */
export function drawFills(vp) {
  state.objects.forEach((obj, idx) => {
    if (obj.type !== 'fill' || !obj.loops || obj.loops.length === 0) return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    const bounds = getObjectBounds(obj);
    if (bounds && !boundsOverlap(bounds, vp)) return;

    const path = new Path2D();
    for (const loop of obj.loops) {
      if (loop.length < 3) continue;
      const [sx0, sy0] = worldToScreen(loop[0].x, loop[0].y);
      path.moveTo(sx0, sy0);
      for (let i = 1; i < loop.length; i++) {
        const [sx, sy] = worldToScreen(loop[i].x, loop[i].y);
        path.lineTo(sx, sy);
      }
      path.closePath();
    }

    ctx.save();
    ctx.globalAlpha = obj.alpha ?? 0.35;
    ctx.fillStyle = obj.color || '#60a5fa';
    ctx.fill(path, 'evenodd');
    ctx.restore();

    const isSel = idx === state.selected || state.multiSelected.has(idx);
    if (isSel) {
      ctx.save();
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke(path);
      ctx.restore();
    }
  });
}

// SKICA – render: Náhled zrcadlení a výplně
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { boundsOverlap, getObjectBounds } from './bounds.js';
import { ctx, worldToScreen } from '../canvas.js';
import { resolveObjectColor } from './common.js';
import { COLORS, CONSTRUCTION_DASH, LINE_WIDTH } from '../constants.js';
import { drawArc, drawCircle, drawLine, drawPoint, drawPolyline, drawRect } from './primitives.js';
import { state } from '../state.js';

/**
 * Vrátí mělkou kopii geometrického objektu zrcadlenou podle osy y=0
 * (cad_y -> -cad_y). Oblouky/bulge mění směr (ccw flip), úhly se negují.
 * Vrátí null pro typy, které nedává smysl zrcadlit (text, kóty, ...).
 */
function mirrorObjectAcrossY(obj) {
  switch (obj.type) {
    case 'point':
      return { ...obj, y: -obj.y };
    case 'line':
    case 'constr':
      return { ...obj, y1: -obj.y1, y2: -obj.y2 };
    case 'circle':
      return { ...obj, cy: -obj.cy };
    case 'arc':
      return {
        ...obj,
        cy: -obj.cy,
        startAngle: -obj.startAngle,
        endAngle: -obj.endAngle,
        ccw: !(obj.ccw !== false),
      };
    case 'rect':
      return { ...obj, y1: -obj.y1, y2: -obj.y2 };
    case 'polyline':
      return {
        ...obj,
        vertices: obj.vertices.map(v => ({ x: v.x, y: -v.y })),
        bulges: (obj.bulges || []).map(b => -b),
      };
    default:
      return null;
  }
}

/** Vykreslí poloprůhlednou zrcadlenou kopii kontury kolem osy y=0 (jen náhled). */
export function renderMirrorPreview(vp) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.setLineDash(CONSTRUCTION_DASH);

  state.objects.forEach((obj, idx) => {
    if (obj.isDimension || obj.isCoordLabel || obj.type === 'text') return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    const mirrored = mirrorObjectAcrossY(obj);
    if (!mirrored) return;

    if (obj.type !== 'constr') {
      const bounds = getObjectBounds(mirrored);
      if (bounds && !boundsOverlap(bounds, vp)) return;
    }

    const baseColor = resolveObjectColor(obj);
    ctx.strokeStyle = baseColor;
    ctx.fillStyle = baseColor;
    ctx.lineWidth = LINE_WIDTH;

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

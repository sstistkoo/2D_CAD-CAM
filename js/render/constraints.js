// SKICA – render: Značky vazeb a vodítko úhlového snapu
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { ctx, worldToScreen } from '../canvas.js';
import { COLORS, CONSTRUCTION_DASH } from '../constants.js';
import { state } from '../state.js';

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
export function drawConstraintMarkers() {
  const markerSize = Math.max(10, Math.min(18, 8 + state.zoom * 4));
  const isSelConstr = state._selectedConstraint;

  state.objects.forEach((obj, idx) => {
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    // Vybraný objekt/segment se nepřetónovává – tón (alfa 0,55 přes celou šířku)
    // by přebil barvu výběru a vyrovnaná úsečka by vypadala nevybraná.
    const objSel = idx === state.selected || state.multiSelected.has(idx);

    // Úsečky s vazbou
    if (obj.constraint && (obj.type === 'line' || obj.type === 'constr')) {
      const isSel = isSelConstr && isSelConstr.objIdx === idx && isSelConstr.segIdx === null;
      if (!objSel) _tintConstrainedSegment(obj.x1, obj.y1, obj.x2, obj.y2, obj.constraint);
      if (isSel) {
        const pos = _constraintMarkerPos(obj.x1, obj.y1, obj.x2, obj.y2);
        _drawConstraintIcon(pos.x, pos.y, obj.constraint, markerSize, isSel);
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
        const isSel = isSelConstr && isSelConstr.objIdx === idx && isSelConstr.segIdx === i;
        const segSet = state.multiSelectedSegments.get(idx);
        const segSel = objSel && (segSet ? segSet.has(i)
          : (state.selectedSegment == null || (state._selectedSegmentObjIdx === idx && state.selectedSegment === i)));
        if (!segSel) _tintConstrainedSegment(p1.x, p1.y, p2.x, p2.y, type);
        if (isSel) {
          const pos = _constraintMarkerPos(p1.x, p1.y, p2.x, p2.y);
          _drawConstraintIcon(pos.x, pos.y, type, markerSize, isSel);
        }
      }
    }
  });
}

/** Vazba se místo ikony ukazuje jemným barevným přetónováním úsečky
 *  (zelená = vodorovná, fialová = svislá, žlutá = rovnoběžná). */
function _tintConstrainedSegment(x1, y1, x2, y2, type) {
  const color = type === 'horizontal' ? COLORS.axisH
    : type === 'vertical' ? COLORS.snapEdge
    : COLORS.yellow;
  const [ax, ay] = worldToScreen(x1, y1);
  const [bx, by] = worldToScreen(x2, y2);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
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
export function renderAngleSnapGuide() {
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

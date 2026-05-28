// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Kóty (addDimensionForObject)           ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { state, showToast, axisLabels } from '../state.js';
import { addObject } from '../objects.js';
import { bulgeToArc } from '../utils.js';

// ── Pomocná funkce: najde referenční body a úhel mezi dvěma úsečkami ──
function _computeLineAngle(line1, line2) {
  const d1x = line1.x2 - line1.x1, d1y = line1.y2 - line1.y1;
  const d2x = line2.x2 - line2.x1, d2y = line2.y2 - line2.y1;
  const len1 = Math.hypot(d1x, d1y), len2 = Math.hypot(d2x, d2y);
  if (len1 < 1e-10 || len2 < 1e-10) return null;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((line2.x1 - line1.x1) * d2y - (line2.y1 - line1.y1) * d2x) / denom;
  const cx = line1.x1 + t * d1x;
  const cy = line1.y1 + t * d1y;
  // Bod na každé úsečce nejvzdálenější od průsečíku
  const dist1a = Math.hypot(line1.x1 - cx, line1.y1 - cy);
  const dist1b = Math.hypot(line1.x2 - cx, line1.y2 - cy);
  const pt1 = dist1a >= dist1b ? { x: line1.x1, y: line1.y1 } : { x: line1.x2, y: line1.y2 };
  const dist2a = Math.hypot(line2.x1 - cx, line2.y1 - cy);
  const dist2b = Math.hypot(line2.x2 - cx, line2.y2 - cy);
  const pt2 = dist2a >= dist2b ? { x: line2.x1, y: line2.y1 } : { x: line2.x2, y: line2.y2 };
  // Úhel mezi směry od průsečíku ke skutečným koncovým bodům (0–180°)
  const v1x = pt1.x - cx, v1y = pt1.y - cy;
  const v2x = pt2.x - cx, v2y = pt2.y - cy;
  const vlen1 = Math.hypot(v1x, v1y), vlen2 = Math.hypot(v2x, v2y);
  if (vlen1 < 1e-10 || vlen2 < 1e-10) return null;
  const dotV = v1x * v2x + v1y * v2y;
  const cosA = Math.max(-1, Math.min(1, dotV / (vlen1 * vlen2)));
  const sweep = Math.acos(cosA);
  return { cx, cy, pt1, pt2, sweep, maxDist1: Math.max(dist1a, dist1b), maxDist2: Math.max(dist2a, dist2b) };
}

// ── Úhlová kóta mezi dvěma úsečkami ──
export function addAngleDimensionForLines(line1, line2) {
  const r = _computeLineAngle(line1, line2);
  if (!r) {
    const d1x = line1.x2 - line1.x1, d1y = line1.y2 - line1.y1;
    if (Math.hypot(d1x, d1y) < 1e-10 || Math.hypot(line2.x2 - line2.x1, line2.y2 - line2.y1) < 1e-10) {
      showToast("Úsečky jsou příliš krátké");
    } else {
      showToast("Úsečky jsou rovnoběžné – nelze kótovat úhel");
    }
    return;
  }
  const { cx, cy, pt1, pt2, sweep, maxDist1, maxDist2 } = r;
  const sweepDeg = sweep * 180 / Math.PI;
  const dimRadius = Math.min(40, maxDist1 * 0.5, maxDist2 * 0.5);
  const ang1 = Math.atan2(pt1.y - cy, pt1.x - cx);
  const ang2 = Math.atan2(pt2.y - cy, pt2.x - cx);
  const arcX1 = cx + dimRadius * Math.cos(ang1);
  const arcY1 = cy + dimRadius * Math.sin(ang1);
  const arcX2 = cx + dimRadius * Math.cos(ang2);
  const arcY2 = cy + dimRadius * Math.sin(ang2);

  addObject({
    type: "line",
    x1: arcX1,
    y1: arcY1,
    x2: arcX2,
    y2: arcY2,
    name: `Kóta ∠${sweepDeg.toFixed(1)}°`,
    isDimension: true,
    dimType: 'angular',
    dimLine1Id: line1.id || null,
    dimLine2Id: line2.id || null,
    dimAngle: sweep,
    dimCenterX: cx,
    dimCenterY: cy,
    dimRadius: dimRadius,
    dimSrcX1: arcX1,
    dimSrcY1: arcY1,
    dimSrcX2: arcX2,
    dimSrcY2: arcY2,
    color: COLORS.textSecondary,
  });
  showToast(`Kóta ∠${sweepDeg.toFixed(1)}° přidána`);
}

// ── Přidání kót k objektu ──
export function addDimensionForObject(obj) {
  switch (obj.type) {
    case "point": {
      // Kóta bodu: odkazová čára se souřadnicemi (leader)
      addObject({
        type: "point",
        x: obj.x,
        y: obj.y,
        name: `Kóta [${obj.x.toFixed(2)}, ${obj.y.toFixed(2)}]`,
        isDimension: true,
        isCoordLabel: true,
        dimType: 'coord',
        sourceObjId: obj.id || null,
        color: COLORS.textSecondary,
      });
      showToast(`Kóta ${axisLabels()[0]}${obj.x.toFixed(2)} ${axisLabels()[1]}${obj.y.toFixed(2)} přidána`);
      break;
    }
    case "line":
    case "constr": {
      const len = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
      // Offset kolmo k úsečce (ve world coords)
      const dimOffset = 20;
      const ang = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
      const nx = -Math.sin(ang) * dimOffset;
      const ny = Math.cos(ang) * dimOffset;
      addObject({
        type: "line",
        x1: obj.x1 + nx,
        y1: obj.y1 + ny,
        x2: obj.x2 + nx,
        y2: obj.y2 + ny,
        isDimension: true,
        dimType: 'linear',
        sourceObjId: obj.id || null,
        dimOffset: dimOffset,
        dimSrcX1: obj.x1,
        dimSrcY1: obj.y1,
        dimSrcX2: obj.x2,
        dimSrcY2: obj.y2,
        name: `Kóta ${len.toFixed(2)}mm`,
        color: COLORS.textSecondary,
      });
      showToast(`Kóta ${len.toFixed(2)}mm přidána`);
      break;
    }
    case "circle": {
      // Průměrová kóta (⌀) – vodorovná čára přes střed
      addObject({
        type: "line",
        x1: obj.cx - obj.r,
        y1: obj.cy,
        x2: obj.cx + obj.r,
        y2: obj.cy,
        name: `Kóta ⌀${(obj.r * 2).toFixed(2)}`,
        isDimension: true,
        dimType: 'diameter',
        sourceObjId: obj.id || null,
        dimRadius: obj.r,
        dimCenterX: obj.cx,
        dimCenterY: obj.cy,
        color: COLORS.textSecondary,
      });
      showToast(`Kóta ⌀${(obj.r * 2).toFixed(2)} přidána`);
      break;
    }
    case "arc": {
      // Radiální kóta (R) – čára od středu k oblouku
      const midAngle = (obj.startAngle + obj.endAngle) / 2;
      const mx = obj.cx + obj.r * Math.cos(midAngle);
      const my = obj.cy + obj.r * Math.sin(midAngle);
      addObject({
        type: "line",
        x1: obj.cx,
        y1: obj.cy,
        x2: mx,
        y2: my,
        name: `Kóta R${obj.r.toFixed(2)}`,
        isDimension: true,
        dimType: 'radius',
        sourceObjId: obj.id || null,
        dimRadius: obj.r,
        dimCenterX: obj.cx,
        dimCenterY: obj.cy,
        color: COLORS.textSecondary,
      });
      // Úhlová kóta oblouku
      let sweep = obj.endAngle - obj.startAngle;
      if (sweep < 0) sweep += 2 * Math.PI;
      const sweepDeg = (sweep * 180 / Math.PI);
      addObject({
        type: "line",
        x1: obj.cx + obj.r * Math.cos(obj.startAngle),
        y1: obj.cy + obj.r * Math.sin(obj.startAngle),
        x2: obj.cx + obj.r * Math.cos(obj.endAngle),
        y2: obj.cy + obj.r * Math.sin(obj.endAngle),
        name: `Kóta ∠${sweepDeg.toFixed(1)}°`,
        isDimension: true,
        dimType: 'angular',
        sourceObjId: obj.id || null,
        dimAngle: sweep,
        dimCenterX: obj.cx,
        dimCenterY: obj.cy,
        dimRadius: obj.r,
        dimSrcX1: obj.cx + obj.r * Math.cos(obj.startAngle),
        dimSrcY1: obj.cy + obj.r * Math.sin(obj.startAngle),
        dimSrcX2: obj.cx + obj.r * Math.cos(obj.endAngle),
        dimSrcY2: obj.cy + obj.r * Math.sin(obj.endAngle),
        color: COLORS.textSecondary,
      });
      showToast(`Kóty R${obj.r.toFixed(2)} a ∠${sweepDeg.toFixed(1)}° přidány`);
      break;
    }
    case "rect": {
      const w = Math.abs(obj.x2 - obj.x1);
      const h = Math.abs(obj.y2 - obj.y1);
      const minX = Math.min(obj.x1, obj.x2);
      const maxX = Math.max(obj.x1, obj.x2);
      const minY = Math.min(obj.y1, obj.y2);
      const maxY = Math.max(obj.y1, obj.y2);
      const dimOff = 15;
      // Šířka – horní hrana (odsazená)
      addObject({
        type: "line",
        x1: minX,
        y1: maxY + dimOff,
        x2: maxX,
        y2: maxY + dimOff,
        name: `Kóta ${w.toFixed(2)}mm`,
        isDimension: true,
        dimType: 'linear',
        sourceObjId: obj.id || null,
        dimOffset: dimOff,
        dimSrcX1: minX,
        dimSrcY1: maxY,
        dimSrcX2: maxX,
        dimSrcY2: maxY,
        color: COLORS.textSecondary,
      });
      // Výška – pravá hrana (odsazená)
      addObject({
        type: "line",
        x1: maxX + dimOff,
        y1: minY,
        x2: maxX + dimOff,
        y2: maxY,
        name: `Kóta ${h.toFixed(2)}mm`,
        isDimension: true,
        dimType: 'linear',
        sourceObjId: obj.id || null,
        dimOffset: dimOff,
        dimSrcX1: maxX,
        dimSrcY1: minY,
        dimSrcX2: maxX,
        dimSrcY2: maxY,
        color: COLORS.textSecondary,
      });
      showToast(`Kóty ${w.toFixed(2)} × ${h.toFixed(2)}mm přidány`);
      break;
    }
    case "polyline": {
      if (!obj.vertices || obj.vertices.length < 2) {
        showToast("Kontura nemá dostatek bodů");
        break;
      }
      const verts = obj.vertices;
      const n = verts.length;
      const segCount = obj.closed ? n : n - 1;
      let dimCount = 0;
      for (let i = 0; i < segCount; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % n];
        const b = (obj.bulges && obj.bulges[i]) || 0;
        if (Math.abs(b) > 1e-6) {
          // Obloukový segment – kóta poloměru
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            const midAngle = (arc.startAngle + arc.endAngle) / 2;
            const mx = arc.cx + arc.r * Math.cos(midAngle);
            const my = arc.cy + arc.r * Math.sin(midAngle);
            addObject({
              type: "line",
              x1: arc.cx, y1: arc.cy,
              x2: mx, y2: my,
              name: `Kóta R${arc.r.toFixed(2)}`,
              isDimension: true,
              dimType: 'radius',
              sourceObjId: obj.id || null,
              dimRadius: arc.r,
              dimCenterX: arc.cx,
              dimCenterY: arc.cy,
              color: COLORS.textSecondary,
            });
            dimCount++;
          }
        } else {
          // Přímý segment – kóta délky (odsazená)
          const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (len > 1e-6) {
            const dimOffset = 15;
            const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const nx = -Math.sin(ang) * dimOffset;
            const ny = Math.cos(ang) * dimOffset;
            addObject({
              type: "line",
              x1: p1.x + nx, y1: p1.y + ny,
              x2: p2.x + nx, y2: p2.y + ny,
              name: `Kóta ${len.toFixed(2)}mm`,
              isDimension: true,
              dimType: 'linear',
              sourceObjId: obj.id || null,
              dimOffset: dimOffset,
              dimSrcX1: p1.x, dimSrcY1: p1.y,
              dimSrcX2: p2.x, dimSrcY2: p2.y,
              color: COLORS.textSecondary,
            });
            dimCount++;
          }
        }
      }
      showToast(`${dimCount} kót přidáno ke kontuře`);
      break;
    }
    default:
      showToast("Pro tento typ objektu nelze přidat kótu");
      break;
  }
}

/**
 * Aktualizuje asociativní kóty – zavolat po přesunu/změně zdrojového objektu.
 * Projde všechny kóty s sourceObjId a aktualizuje jejich pozici.
 */
export function updateAssociativeDimensions() {
  for (const dim of state.objects) {
    if (!dim.isDimension) continue;

    // Úhlová kóta mezi dvěma úsečkami (dimLine1Id + dimLine2Id)
    if (dim.dimType === 'angular' && dim.dimLine1Id && dim.dimLine2Id) {
      const l1 = state.objects.find(o => o.id === dim.dimLine1Id);
      const l2 = state.objects.find(o => o.id === dim.dimLine2Id);
      if (!l1 || !l2) continue;
      const r = _computeLineAngle(l1, l2);
      if (!r) continue;
      const { cx, cy, pt1, pt2, sweep } = r;
      const dimR = dim.dimRadius || 30;
      const ang1 = Math.atan2(pt1.y - cy, pt1.x - cx);
      const ang2 = Math.atan2(pt2.y - cy, pt2.x - cx);
      dim.x1 = cx + dimR * Math.cos(ang1);
      dim.y1 = cy + dimR * Math.sin(ang1);
      dim.x2 = cx + dimR * Math.cos(ang2);
      dim.y2 = cy + dimR * Math.sin(ang2);
      dim.dimAngle = sweep;
      dim.dimCenterX = cx;
      dim.dimCenterY = cy;
      dim.dimSrcX1 = dim.x1;
      dim.dimSrcY1 = dim.y1;
      dim.dimSrcX2 = dim.x2;
      dim.dimSrcY2 = dim.y2;
      dim.name = `Kóta ∠${(sweep * 180 / Math.PI).toFixed(1)}°`;
      continue;
    }

    if (!dim.sourceObjId) continue;
    const src = state.objects.find(o => o.id === dim.sourceObjId);
    if (!src) continue;

    switch (dim.dimType) {
      case 'linear': {
        if (src.type === 'line' || src.type === 'constr') {
          const dimOffset = dim.dimOffset || 20;
          const ang = Math.atan2(src.y2 - src.y1, src.x2 - src.x1);
          const nx = -Math.sin(ang) * dimOffset;
          const ny = Math.cos(ang) * dimOffset;
          dim.x1 = src.x1 + nx;
          dim.y1 = src.y1 + ny;
          dim.x2 = src.x2 + nx;
          dim.y2 = src.y2 + ny;
          dim.dimSrcX1 = src.x1;
          dim.dimSrcY1 = src.y1;
          dim.dimSrcX2 = src.x2;
          dim.dimSrcY2 = src.y2;
          const len = Math.hypot(src.x2 - src.x1, src.y2 - src.y1);
          dim.name = `Kóta ${len.toFixed(2)}mm`;
        } else if (src.type === 'rect') {
          // Aktualizovat dle dimSrc bodů – zjistit, zda je to šířka nebo výška
          const isHoriz = Math.abs(dim.dimSrcY1 - dim.dimSrcY2) < 0.01;
          const minX = Math.min(src.x1, src.x2), maxX = Math.max(src.x1, src.x2);
          const minY = Math.min(src.y1, src.y2), maxY = Math.max(src.y1, src.y2);
          const dimOff = dim.dimOffset || 15;
          if (isHoriz) {
            dim.x1 = minX; dim.y1 = maxY + dimOff;
            dim.x2 = maxX; dim.y2 = maxY + dimOff;
            dim.dimSrcX1 = minX; dim.dimSrcY1 = maxY;
            dim.dimSrcX2 = maxX; dim.dimSrcY2 = maxY;
            dim.name = `Kóta ${(maxX - minX).toFixed(2)}mm`;
          } else {
            dim.x1 = maxX + dimOff; dim.y1 = minY;
            dim.x2 = maxX + dimOff; dim.y2 = maxY;
            dim.dimSrcX1 = maxX; dim.dimSrcY1 = minY;
            dim.dimSrcX2 = maxX; dim.dimSrcY2 = maxY;
            dim.name = `Kóta ${(maxY - minY).toFixed(2)}mm`;
          }
        }
        break;
      }
      case 'diameter': {
        if (src.type === 'circle') {
          dim.x1 = src.cx - src.r;
          dim.y1 = src.cy;
          dim.x2 = src.cx + src.r;
          dim.y2 = src.cy;
          dim.dimRadius = src.r;
          dim.dimCenterX = src.cx;
          dim.dimCenterY = src.cy;
          dim.name = `Kóta ⌀${(src.r * 2).toFixed(2)}`;
        }
        break;
      }
      case 'radius': {
        if (src.type === 'arc' || src.type === 'circle') {
          const angle = src.type === 'arc'
            ? (src.startAngle + src.endAngle) / 2
            : 0;
          dim.x1 = src.cx;
          dim.y1 = src.cy;
          dim.x2 = src.cx + src.r * Math.cos(angle);
          dim.y2 = src.cy + src.r * Math.sin(angle);
          dim.dimRadius = src.r;
          dim.dimCenterX = src.cx;
          dim.dimCenterY = src.cy;
          dim.name = `Kóta R${src.r.toFixed(2)}`;
        }
        break;
      }
      case 'angular': {
        if (src.type === 'arc') {
          let sweep = src.endAngle - src.startAngle;
          if (sweep < 0) sweep += 2 * Math.PI;
          dim.x1 = src.cx + src.r * Math.cos(src.startAngle);
          dim.y1 = src.cy + src.r * Math.sin(src.startAngle);
          dim.x2 = src.cx + src.r * Math.cos(src.endAngle);
          dim.y2 = src.cy + src.r * Math.sin(src.endAngle);
          dim.dimAngle = sweep;
          dim.dimCenterX = src.cx;
          dim.dimCenterY = src.cy;
          dim.dimRadius = src.r;
          dim.dimSrcX1 = dim.x1;
          dim.dimSrcY1 = dim.y1;
          dim.dimSrcX2 = dim.x2;
          dim.dimSrcY2 = dim.y2;
          dim.name = `Kóta ∠${(sweep * 180 / Math.PI).toFixed(1)}°`;
        }
        break;
      }
      case 'coord': {
        // Kóta bodu – souřadnicový label sleduje zdrojový bod
        if (src.type === 'point') {
          dim.x = src.x;
          dim.y = src.y;
          dim.name = `Kóta [${src.x.toFixed(2)}, ${src.y.toFixed(2)}]`;
        }
        break;
      }
    }
  }
}

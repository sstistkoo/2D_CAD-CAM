// SKICA – geometrie výkresu: Segment polyline pod kurzorem a vzdálenost bodu od objektu (hit-test výběru).
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { state } from '../state.js';
import { ARC_OUTSIDE_PENALTY } from '../constants.js';
import { distPointToSegment, isAngleBetween, bulgeToArc, getRectCorners, getTextPathObject } from '../utils.js';

/**
 * Najde index segmentu polyline nejblíž bodu [wx,wy].
 * @param {import('../types.js').PolylineObject} obj
 * @param {number} wx
 * @param {number} wy
 * @returns {number|null}
 */
export function findSegmentAt(obj, wx, wy) {
  if (obj.type === 'rect') {
    const rc = getRectCorners(obj);
    let minD = Infinity, bestIdx = null;
    for (let i = 0; i < 4; i++) {
      const d = distPointToSegment(wx, wy, rc[i].x, rc[i].y, rc[(i + 1) % 4].x, rc[(i + 1) % 4].y);
      if (d < minD) { minD = d; bestIdx = i; }
    }
    return bestIdx;
  }
  if (obj.type !== 'polyline') return null;
  const n = obj.vertices.length;
  if (n < 2) return null;
  const segCount = obj.closed ? n : n - 1;
  let minD = Infinity, bestIdx = null;
  for (let i = 0; i < segCount; i++) {
    const p1 = obj.vertices[i];
    const p2 = obj.vertices[(i + 1) % n];
    const b = obj.bulges[i] || 0;
    let d;
    if (b === 0) {
      d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
    } else {
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        const distToCircle = Math.abs(Math.hypot(wx - arc.cx, wy - arc.cy) - arc.r);
        const angle = Math.atan2(wy - arc.cy, wx - arc.cx);
        if (isAngleBetween(angle, arc.startAngle, arc.endAngle, arc.ccw)) {
          d = distToCircle;
        } else {
          d = Math.min(Math.hypot(wx - p1.x, wy - p1.y), Math.hypot(wx - p2.x, wy - p2.y));
        }
      } else {
        d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
      }
    }
    if (d < minD) { minD = d; bestIdx = i; }
  }
  return bestIdx;
}

/**
 * Vzdálenost bodu od objektu.
 * @param {import('../types.js').DrawObject} obj
 * @param {number} wx
 * @param {number} wy
 * @returns {number}
 */
export function distToObject(obj, wx, wy) {
  switch (obj.type) {
    case "point":
      // Coord label (kóta souřadnic) – hit-test zahrnuje leader čáru, shelf a text
      if (obj.isCoordLabel && obj.x != null && obj.y != null) {
        const leaderWorld = 30 / state.zoom;
        // Text "Z77.526 X139.359" je cca 120–170px → pokrýt dostatečně
        const textWorld = 130 / state.zoom;
        // Leader jde doprava a nahoru v world coords (screen: +X, -Y → world: +X, +Y)
        const ex = obj.x + leaderWorld;
        const ey = obj.y + leaderWorld;
        const dPoint = Math.hypot(wx - obj.x, wy - obj.y);
        const dLeader = distPointToSegment(wx, wy, obj.x, obj.y, ex, ey);
        // Shelf + text oblast jako jeden segment pokrývající celý text
        const dText = distPointToSegment(wx, wy, ex, ey, ex + textWorld, ey);
        // Text je těsně nad shelf čárou → tolerance výšky textu
        const textH = 20 / state.zoom;
        const dTextArea = (wx >= ex - 2 / state.zoom && wx <= ex + textWorld && Math.abs(wy - ey) < textH)
          ? 0 : Infinity;
        return Math.min(dPoint, dLeader, dText, dTextArea);
      }
      return Math.hypot(wx - obj.x, wy - obj.y);
    case "line":
    case "constr":
      // Úhlová kóta – hit-test na oblouk, referenční čáry a text
      if (obj.isDimension && obj.dimType === 'angular' && obj.dimCenterX != null && obj.dimCenterY != null) {
        const cx = obj.dimCenterX, cy = obj.dimCenterY;
        const r = (obj.dimRadius || 20) * 0.8;
        const dCenter = distPointToSegment(wx, wy, cx, cy, obj.x1, obj.y1);
        const dCenter2 = distPointToSegment(wx, wy, cx, cy, obj.x2, obj.y2);
        const dArc = Math.abs(Math.hypot(wx - cx, wy - cy) - r);
        // Text je na středu oblouku – přidat hit area kolem textu
        const ang1 = Math.atan2(obj.y1 - cy, obj.x1 - cx);
        const ang2 = Math.atan2(obj.y2 - cy, obj.x2 - cx);
        const midAng = (ang1 + ang2) / 2;
        const textX = cx + r * Math.cos(midAng);
        const textY = cy + r * Math.sin(midAng);
        const textR = 15 / state.zoom;
        const dText = Math.max(0, Math.hypot(wx - textX, wy - textY) - textR);
        return Math.min(dCenter, dCenter2, dArc, dText);
      }
      // Lineární kóta – hit-test na kótovací čáru, referenční čáry a text
      if (obj.isDimension && obj.dimSrcX1 != null && obj.dimSrcY1 != null && obj.dimSrcX2 != null && obj.dimSrcY2 != null) {
        const dMain = distPointToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);
        const dRef1 = distPointToSegment(wx, wy, obj.dimSrcX1, obj.dimSrcY1, obj.x1, obj.y1);
        const dRef2 = distPointToSegment(wx, wy, obj.dimSrcX2, obj.dimSrcY2, obj.x2, obj.y2);
        // Text je na středu kótovací čáry – rozšířit hit oblast o text
        const tmx = (obj.x1 + obj.x2) / 2;
        const tmy = (obj.y1 + obj.y2) / 2;
        const textR = 20 / state.zoom;
        const dText = Math.max(0, Math.hypot(wx - tmx, wy - tmy) - textR);
        return Math.min(dMain, dRef1, dRef2, dText);
      }
      // Průměrová/radiální kóta – hit-test na kótovací čáru a text
      if (obj.isDimension && (obj.dimType === 'diameter' || obj.dimType === 'radius')) {
        const dLine = distPointToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);
        const tmx = (obj.x1 + obj.x2) / 2;
        const tmy = (obj.y1 + obj.y2) / 2;
        const textR = 20 / state.zoom;
        const dText = Math.max(0, Math.hypot(wx - tmx, wy - tmy) - textR);
        return Math.min(dLine, dText);
      }
      return distPointToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);
    case "circle":
      return Math.abs(Math.hypot(wx - obj.cx, wy - obj.cy) - obj.r);
    case "arc": {
      const dist = Math.abs(
        Math.hypot(wx - obj.cx, wy - obj.cy) - obj.r,
      );
      const angle = Math.atan2(wy - obj.cy, wx - obj.cx);
      return isAngleBetween(angle, obj.startAngle, obj.endAngle, obj.ccw)
        ? dist
        : dist + ARC_OUTSIDE_PENALTY;
    }
    case "rect": {
      const rc = getRectCorners(obj);
      const d1 = distPointToSegment(wx, wy, rc[0].x, rc[0].y, rc[1].x, rc[1].y);
      const d2 = distPointToSegment(wx, wy, rc[1].x, rc[1].y, rc[2].x, rc[2].y);
      const d3 = distPointToSegment(wx, wy, rc[2].x, rc[2].y, rc[3].x, rc[3].y);
      const d4 = distPointToSegment(wx, wy, rc[3].x, rc[3].y, rc[0].x, rc[0].y);
      return Math.min(d1, d2, d3, d4);
    }
    case "polyline": {
      let minD = Infinity;
      const n = obj.vertices.length;
      const segCount = obj.closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        const b = obj.bulges[i] || 0;
        let d;
        if (b === 0) {
          d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
        } else {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            const distToCircle = Math.abs(Math.hypot(wx - arc.cx, wy - arc.cy) - arc.r);
            const angle = Math.atan2(wy - arc.cy, wx - arc.cx);
            if (isAngleBetween(angle, arc.startAngle, arc.endAngle, arc.ccw)) {
              d = distToCircle;
            } else {
              d = Math.min(Math.hypot(wx - p1.x, wy - p1.y), Math.hypot(wx - p2.x, wy - p2.y));
            }
          } else {
            d = distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
          }
        }
        if (d < minD) minD = d;
      }
      return minD;
    }
    case "text": {
      // Pokud text leží na cestě (pathMode), testuj vzdálenost k cestě
      // s mírnou prioritou (× 0.4) aby text vyhrál nad podkladovou linií/obloukem
      {
        const pathObj = getTextPathObject(obj);
        if (pathObj) {
          if (obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
            return distPointToSegment(wx, wy, pathObj.x1, pathObj.y1, pathObj.x2, pathObj.y2) * 0.4;
          }
          if (obj.pathMode === 'arc' && pathObj.type === 'arc') {
            const dx2 = wx - pathObj.cx, dy2 = wy - pathObj.cy;
            const distToCenter = Math.hypot(dx2, dy2);
            return Math.abs(distToCenter - pathObj.r) * 0.4;
          }
          if (obj.pathMode === 'circle' && pathObj.type === 'circle') {
            const dx2 = wx - pathObj.cx, dy2 = wy - pathObj.cy;
            const distToCenter = Math.hypot(dx2, dy2);
            return Math.abs(distToCenter - pathObj.r) * 0.4;
          }
        }
      }
      // Vzdálenost k bounding boxu textu
      const fSize = obj.fontSize || 14;
      const spacingFactor = 1 + (obj.letterSpacing || 0) / fSize * 0.5;
      const boldFactor = obj.bold ? 1.1 : 1;
      const tw = (obj.text || '').length * fSize * 0.6 * spacingFactor * boldFactor;
      const th = fSize * 1.2;
      const pad = fSize * 0.3;
      // World Y-up: textBaseline='bottom' → text jde nahoru od obj.y
      const bx1 = obj.x - pad, by1 = obj.y - pad, bx2 = obj.x + tw + pad, by2 = obj.y + th + pad;
      if (wx >= bx1 && wx <= bx2 && wy >= by1 && wy <= by2) return 0;
      // Vzdálenost k nejbližšímu bodu boxu
      const cx = Math.max(bx1, Math.min(wx, bx2));
      const cy = Math.max(by1, Math.min(wy, by2));
      return Math.hypot(wx - cx, wy - cy);
    }
    case "fill": {
      // Klik dovnitř vyplněné plochy ji vybere (aby šla smazat tlačítkem
      // Smaž) — evenodd přes všechny smyčky stejně jako při vykreslení
      // (drawFills), takže díra mezikruží se správně NEbere jako "uvnitř".
      if (!obj.loops || obj.loops.length === 0) return Infinity;
      let inside = false;
      for (const loop of obj.loops) {
        let loopInside = false;
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
          const xi = loop[i].x, yi = loop[i].y;
          const xj = loop[j].x, yj = loop[j].y;
          const hit = (yi > wy) !== (yj > wy) && wx < ((xj - xi) * (wy - yi)) / (yj - yi) + xi;
          if (hit) loopInside = !loopInside;
        }
        if (loopInside) inside = !inside;
      }
      return inside ? 0 : Infinity;
    }
    default:
      return Infinity;
  }
}

// SKICA – render: Ohraničení objektů a viewport culling
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { drawCanvas, screenToWorld } from '../canvas.js';
import { bulgeToArc, getTextPathObject } from '../utils.js';

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
      {
        const pathObj = getTextPathObject(obj);
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
    case 'fill': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const loop of obj.loops) {
        for (const p of loop) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
      return minX === Infinity ? null : { minX, minY, maxX, maxY };
    }
    default:
      return null;
  }
}

/** Vrátí viewport bounds ve world souřadnicích s marginem pro hladký pohled. */
export function getViewportBounds() {
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

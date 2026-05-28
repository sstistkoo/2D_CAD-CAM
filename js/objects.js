// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Správa objektů (přidání, přesun)                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from './state.js';
import { updateObjectList } from './ui.js';
import { calculateAllIntersections } from './geometry.js';
import { autoCenterView } from './canvas.js';
import { updateAssociativeDimensions } from './dialogs/dimension.js';
import { hasAnchoredPoint } from './tools/anchorClick.js';
import { bulgeToArc } from './utils.js';

/**
 * Přidá objekt do výkresu (push undo, přiřazení ID a vrstvy).
 * @param {import('./types.js').DrawObject} obj
 * @returns {import('./types.js').DrawObject}
 */
export function addObject(obj) {
  // Validate numeric coordinates are finite
  for (const key of ['x','y','x1','y1','x2','y2','cx','cy','r','startAngle','endAngle']) {
    if (key in obj && !isFinite(obj[key])) {
      console.warn(`addObject: neplatná hodnota ${key}=${obj[key]}, objekt nebyl přidán`);
      return null;
    }
  }
  pushUndo();
  obj.id = state.nextId++;
  // Assign layer: construction lines default to layer 1, others to active layer
  if (obj.layer === undefined) {
    obj.layer = (obj.type === 'constr') ? 1 : state.activeLayer;
  }
  state.objects.push(obj);
  updateObjectList();
  calculateAllIntersections(); // Auto-přepočet průsečíků (volá renderAll)
  // Auto-center jen při prvním objektu (na mobilu)
  if (window.innerWidth <= 900 && state.objects.length === 1) {
    autoCenterView();
  }
  return obj;
}

/**
 * Rozloží konturu (polyline) na nezávislé úsečky a oblouky.
 * Jedna operace undo pro všechny segmenty.
 */
export function addPolylineAsSegments(vertices, bulges, closed) {
  pushUndo();
  const segments = [];
  const count = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < count; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const b = (bulges && bulges[i]) || 0;

    let obj;
    if (b !== 0) {
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        const id = state.nextId++;
        obj = {
          type: 'arc',
          cx: arc.cx, cy: arc.cy,
          r: arc.r,
          startAngle: arc.startAngle,
          endAngle: arc.endAngle,
          name: `Oblouk ${id}`,
          id,
          layer: state.activeLayer,
        };
      }
    } else {
      const id = state.nextId++;
      obj = {
        type: 'line',
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        name: `Úsečka ${id}`,
        id,
        layer: state.activeLayer,
      };
    }

    if (obj) {
      state.objects.push(obj);
      segments.push(obj);
    }
  }
  updateObjectList();
  calculateAllIntersections();
  if (window.innerWidth <= 900 && state.objects.length === segments.length) {
    autoCenterView();
  }
  return segments;
}

/**
 * Rozloží obdélník na 4 nezávislé úsečky.
 * Jedna operace undo pro všechny 4 strany.
 */
export function addRectAsSegments(x1, y1, x2, y2) {
  pushUndo();
  const corners = [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    const id = state.nextId++;
    const obj = {
      type: 'line',
      x1: p1.x, y1: p1.y,
      x2: p2.x, y2: p2.y,
      name: `Úsečka ${id}`,
      id,
      layer: state.activeLayer,
    };
    state.objects.push(obj);
    lines.push(obj);
  }
  updateObjectList();
  calculateAllIntersections();
  if (window.innerWidth <= 900 && state.objects.length === 4) {
    autoCenterView();
  }
  return lines;
}

/**
 * Posune objekt o delta.
 * @param {import('./types.js').DrawObject} obj
 * @param {number} dx
 * @param {number} dy
 */
export function moveObject(obj, dx, dy) {
  // Zakotvené body blokují přesun celého objektu
  if (hasAnchoredPoint(obj)) {
    showToast("Objekt je zakotven – nelze přesunout");
    return false;
  }
  switch (obj.type) {
    case "point":
      obj.x += dx;
      obj.y += dy;
      break;
    case "line":
    case "constr":
      obj.x1 += dx;
      obj.y1 += dy;
      obj.x2 += dx;
      obj.y2 += dy;
      if (obj.dimSrcX1 != null) { obj.dimSrcX1 += dx; obj.dimSrcY1 += dy; }
      if (obj.dimSrcX2 != null) { obj.dimSrcX2 += dx; obj.dimSrcY2 += dy; }
      if (obj.dimCenterX != null) { obj.dimCenterX += dx; obj.dimCenterY += dy; }
      break;
    case "circle":
      obj.cx += dx;
      obj.cy += dy;
      break;
    case "arc":
      obj.cx += dx;
      obj.cy += dy;
      break;
    case "rect":
      obj.x1 += dx;
      obj.y1 += dy;
      obj.x2 += dx;
      obj.y2 += dy;
      break;
    case "polyline":
      for (const v of obj.vertices) {
        v.x += dx;
        v.y += dy;
      }
      break;
    case "text":
      // Pohyb textu na cestě → změna pathStart (podél) + pathOffset (kolmo)
      if (obj.pathMode && obj.pathMode !== 'none' && obj.pathObjectId != null) {
        const pathObj = state.objects[obj.pathObjectId];
        if (pathObj) {
          if (obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
            const ldx = pathObj.x2 - pathObj.x1;
            const ldy = pathObj.y2 - pathObj.y1;
            const len = Math.hypot(ldx, ldy);
            if (len > 1e-10) {
              const ux = ldx / len, uy = ldy / len;
              // Kolmý vektor (normála úsečky)
              const nx = -uy, ny = ux;
              // Rovnoběžná složka → pathStart (posun podél úsečky)
              const paraProj = dx * ux + dy * uy;
              obj.pathStart = (obj.pathStart || 0) + paraProj;
              // Kolmá složka → pathOffset
              const perpProj = dx * nx + dy * ny;
              obj.pathOffset = (obj.pathOffset || 0) + perpProj;
            }
            break;
          } else if (obj.pathMode === 'arc' && pathObj.type === 'arc') {
            // Úhlová složka → pathStart, radiální → pathOffset
            const acx = pathObj.cx, acy = pathObj.cy;
            const midAngle = (pathObj.startAngle + pathObj.endAngle) / 2;
            const rx = Math.cos(midAngle), ry = Math.sin(midAngle);
            const tx = -Math.sin(midAngle), ty = Math.cos(midAngle);
            const radialProj = dx * rx + dy * ry;
            const tangentProj = dx * tx + dy * ty;
            obj.pathOffset = (obj.pathOffset || 0) + radialProj;
            obj.pathStart = (obj.pathStart || 0) + tangentProj / pathObj.r;
            break;
          } else if (obj.pathMode === 'circle' && pathObj.type === 'circle') {
            // Tangenciální složka → pathStart (úhel), radiální → pathOffset
            const curAngle = Math.atan2(dy, dx);
            // Obecný tangent/radial rozklad kolem středu
            const fromCenter = Math.atan2(
              (obj.y || pathObj.cy) - pathObj.cy,
              (obj.x || pathObj.cx) - pathObj.cx
            );
            const rx = Math.cos(fromCenter), ry = Math.sin(fromCenter);
            const tx = -Math.sin(fromCenter), ty = Math.cos(fromCenter);
            const radialProj = dx * rx + dy * ry;
            const tangentProj = dx * tx + dy * ty;
            obj.pathOffset = (obj.pathOffset || 0) + radialProj;
            obj.pathStart = (obj.pathStart || 0) + tangentProj / pathObj.r;
            break;
          }
        }
      }
      obj.x += dx;
      obj.y += dy;
      break;
  }
  // Aktualizovat asociativní kóty navázané na přesunutý objekt
  updateAssociativeDimensions();
}

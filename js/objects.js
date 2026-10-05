// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Správa objektů (přidání, přesun)                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast, STOCK_LAYER_ID } from './state.js';
import { updateObjectList } from './ui.js';
import { calculateAllIntersections } from './geometry.js';
import { autoCenterView } from './canvas.js';
import { updateAssociativeDimensions } from './dialogs/dimension.js';
import { hasAnchoredPoint } from './tools/anchorClick.js';
import { bulgeToCcwArc, getTextPathObject } from './utils.js';
import { activeShapeStyleProps } from './lineStyles.js';
import { findDuplicateDimension } from './dimensionDedup.js';

/**
 * Přidá objekt do výkresu (push undo, přiřazení ID a vrstvy).
 * @param {import('./types.js').DrawObject} obj
 * Duplicitní kóta (měří totéž co kóta, která už ve výkresu je) se nepřidá
 * – vrací se null a zobrazí se upozornění.
 * @returns {import('./types.js').DrawObject|null}
 */
export function addObject(obj) {
  // Validate numeric coordinates are finite
  for (const key of ['x','y','x1','y1','x2','y2','cx','cy','r','startAngle','endAngle']) {
    if (key in obj && !isFinite(obj[key])) {
      console.warn(`addObject: neplatná hodnota ${key}=${obj[key]}, objekt nebyl přidán`);
      return null;
    }
  }
  if (obj.isDimension && findDuplicateDimension(state.objects, obj)) {
    showToast("Tato kóta už ve výkresu je – duplicitní kóta nepřidána");
    return null;
  }
  // Aktivní volba „Typ čáry" (viz lineStyleDialog.js) se přebírá i pro
  // ostatní nástroje (kružnice, oblouk...) – pokud si volající vlastnosti
  // čáry/barvy nenastavil už sám (např. úsečka kreslená přes activeLineProps()).
  if (state.lineStyleActive && obj.lineStyle === undefined && obj.dashed === undefined && obj.color === undefined) {
    Object.assign(obj, activeShapeStyleProps());
  }
  pushUndo();
  obj.id = state.nextId++;
  const hadExplicitLayer = obj.layer !== undefined;
  // Assign layer: construction lines default to layer 1, others to active layer
  if (!hadExplicitLayer) {
    obj.layer = (obj.type === 'constr') ? 1 : state.activeLayer;
  }
  // Režim kreslení polotovaru – nové geometrické objekty se značí isStock
  // a (pokud volající nezadal vrstvu výslovně) putují do vrstvy Polotovar.
  if (state.drawStockMode && !obj.isDimension && !obj.isCoordLabel
      && obj.type !== 'constr' && obj.type !== 'text') {
    obj.isStock = true;
    if (!hadExplicitLayer) obj.layer = STOCK_LAYER_ID;
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
 * Vlastnosti, které má převzít část objektu vzniklá jeho úpravou (rozdělení,
 * spojení, oříznutí, smazání segmentu): vrstva, vzhled čáry a příslušnost
 * k polotovaru. Bez nich by se např. půlka čáry polotovaru stala konturou.
 * @param {import('./types.js').DrawObject} obj
 * @returns {Record<string, any>}
 */
export function inheritedProps(obj) {
  const p = {};
  for (const k of ['layer', 'color', 'lineStyle', 'dashed', 'finite']) {
    if (obj[k] !== undefined) p[k] = obj[k];
  }
  if (obj.isStock) p.isStock = true;
  return p;
}

/**
 * Smaže kóty, jejichž zdrojový objekt už ve výkresu není.
 * @returns {number} počet smazaných kót
 */
export function removeOrphanDimensions() {
  const existingIds = new Set(state.objects.map(o => o.id));
  let removed = 0;
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const d = state.objects[i];
    if (!d.isDimension) continue;
    const orphan = (d.sourceObjId && !existingIds.has(d.sourceObjId))
      || (d.dimLine1Id && d.dimLine2Id &&
          (!existingIds.has(d.dimLine1Id) || !existingIds.has(d.dimLine2Id)));
    if (orphan) { state.objects.splice(i, 1); removed++; }
  }
  return removed;
}

/**
 * Smaže jeden segment kontury (polyline) na indexu `idx`. Volající si sám
 * zajistí pushUndo() a překreslení.
 *  • kontura s jediným segmentem → smaže se celá,
 *  • uzavřená kontura → otevře se v místě segmentu (nic dalšího nezmizí),
 *  • první/poslední segment otevřené → odebere se krajní vrchol,
 *  • prostřední segment otevřené → rozdělí se na dvě kontury (druhá dostane
 *    nové id a vloží se hned za původní).
 * @returns {'deleted'|'opened'|'trimmed'|'split'|null}
 */
export function deletePolylineSegment(idx, segIdx) {
  const obj = state.objects[idx];
  if (!obj || obj.type !== 'polyline') return null;
  const n = obj.vertices.length;
  const segCount = obj.closed ? n : n - 1;
  if (segIdx < 0 || segIdx >= segCount) return null;
  const bulges = obj.bulges || [];

  if (segCount <= 1) {
    state.objects.splice(idx, 1);
    return 'deleted';
  }
  if (obj.closed) {
    // Nová otevřená kontura začíná vrcholem ZA smazaným segmentem a končí
    // jeho počátečním vrcholem – zůstanou všechny ostatní segmenty.
    const start = (segIdx + 1) % n;
    const verts = [], bs = [];
    for (let i = 0; i < n; i++) {
      const vi = (start + i) % n;
      verts.push(obj.vertices[vi]);
      if (i < n - 1) bs.push(bulges[vi] || 0);
    }
    obj.vertices = verts;
    obj.bulges = bs;
    obj.closed = false;
    return 'opened';
  }
  if (segIdx === 0) {
    obj.vertices.splice(0, 1);
    obj.bulges = bulges.slice(1);
    return 'trimmed';
  }
  if (segIdx === segCount - 1) {
    obj.vertices.splice(n - 1, 1);
    obj.bulges = bulges.slice(0, segIdx);
    return 'trimmed';
  }
  const verts2 = obj.vertices.slice(segIdx + 1);
  const bulges2 = bulges.slice(segIdx + 1, n - 1);
  obj.vertices = obj.vertices.slice(0, segIdx + 1);
  obj.bulges = bulges.slice(0, segIdx);
  const id = state.nextId++;
  state.objects.splice(idx + 1, 0, {
    ...inheritedProps(obj),
    type: 'polyline',
    vertices: verts2,
    bulges: bulges2,
    closed: false,
    name: `Kontura ${id}`,
    id,
  });
  return 'split';
}

/**
 * Rozloží konturu (polyline) na nezávislé úsečky a oblouky.
 * Jedna operace undo pro všechny segmenty.
 */
export function addPolylineAsSegments(vertices, bulges, closed) {
  pushUndo();
  const segments = [];
  const count = closed ? vertices.length : vertices.length - 1;
  const stockTag = state.drawStockMode;
  const segLayer = stockTag ? STOCK_LAYER_ID : state.activeLayer;
  for (let i = 0; i < count; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const b = (bulges && bulges[i]) || 0;

    let obj;
    if (b !== 0) {
      // CCW normalizace: samostatný 'arc' objekt se kreslí proti směru hodin,
      // CW segment polyline (záporný bulge) by se jinak přetočil.
      const arc = bulgeToCcwArc(p1, p2, b);
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
          layer: segLayer,
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
        layer: segLayer,
      };
    }

    if (obj) {
      if (state.lineStyleActive) Object.assign(obj, activeShapeStyleProps());
      if (stockTag) obj.isStock = true;
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
  const stockTag = state.drawStockMode;
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
      layer: stockTag ? STOCK_LAYER_ID : state.activeLayer,
    };
    if (state.lineStyleActive) Object.assign(obj, activeShapeStyleProps());
    if (stockTag) obj.isStock = true;
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
      {
        const pathObj = getTextPathObject(obj);
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
            // Obecný tangent/radial rozklad kolem středu
            const fromCenter = Math.atan2(
              (obj.y ?? pathObj.cy) - pathObj.cy,
              (obj.x ?? pathObj.cx) - pathObj.cx
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
    case "fill":
      for (const loop of obj.loops) {
        for (const p of loop) { p.x += dx; p.y += dy; }
      }
      break;
  }
  // Aktualizovat asociativní kóty navázané na přesunutý objekt
  updateAssociativeDimensions();
}

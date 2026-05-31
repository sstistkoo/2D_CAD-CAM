// ╔══════════════════════════════════════════════════════════════╗
// ║  Sdílený bridge mezi Maker.js modely a SKICA polylines     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Veřejná API:
//   - makerModelToPolylines(mk, model, cx, cy) → SKICA polyline[]
//     najde v modelu uzavřené řetězce (findChains) a každý převede na
//     polylinu s bulges (chord-úsečky + tan(sweep/4) pro oblouky).
//   - chainToPolyline(chain) – low-level: jeden řetězec → polylina
//
// Výsledné polyliny se automaticky zjednoduší (kolineární vrcholy mezi
// dvěma úsečkami se odeberou) – konzistentní výstup pro boolean, gear,
// slot, polygon, star.
//
// Pozn. k ose Y: SKICA i Maker.js používají Y-nahoru, takže se nic neneguje.

import { simplifyPolyline } from '../utils.js';

/**
 * Převede Maker.js model na pole SKICA polylines (každý uzavřený chain → 1).
 * Posune výsledek o (cx, cy) v rovině Y-nahoru.
 *
 * @param {object} mk    Maker.js instance (window.makerjs)
 * @param {object} model Maker.js model (typicky z `new mk.models.{Slot|Polygon|Star|...}()`)
 * @param {number} cx    posun ve směru X
 * @param {number} cy    posun ve směru Y
 * @returns {Array<{vertices:{x:number,y:number}[], bulges:number[], closed:boolean}>}
 */
export function makerModelToPolylines(mk, model, cx = 0, cy = 0) {
  if (!mk || !model) return [];
  const out = [];

  mk.model.findChains(model, (chains /*, loose, layer */) => {
    if (!chains) return;
    for (const chain of chains) {
      const poly = chainToPolyline(chain);
      if (poly && poly.vertices.length >= 2) {
        // Posun na (cx, cy)
        for (const v of poly.vertices) { v.x += cx; v.y += cy; }
        out.push(poly);
      }
    }
  }, { byLayers: false });

  return out;
}

/**
 * Převede jeden Maker.js chain na vertex/bulge polylinu.
 * Veřejné kvůli reuse v booleanMaker.js.
 */
export function chainToPolyline(chain) {
  const links = chain.links || [];
  if (links.length === 0) return null;

  // Speciální případ: plná kružnice / 360° oblouk – endless chain s 1 linkem
  // bez endPoints. Rozdělíme na dva 180° bulge segmenty.
  if (links.length === 1 && chain.endless && (!links[0].endPoints)) {
    const path = links[0].walkedPath.pathContext;
    const offset = links[0].walkedPath.offset || [0, 0];
    if (path.type === 'circle' || path.type === 'arc') {
      const cx = path.origin[0] + offset[0];
      const cy = path.origin[1] + offset[1];
      const r = path.radius;
      return {
        vertices: [{ x: cx + r, y: cy }, { x: cx - r, y: cy }],
        bulges: [1, 1],
        closed: true,
      };
    }
    return null;
  }

  const vertices = [];
  const bulges = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const path = link.walkedPath.pathContext;
    const reversed = !!link.reversed;
    const ep = link.endPoints;
    if (!ep) return null;

    const startPt = ep[reversed ? 1 : 0];
    vertices.push({ x: startPt[0], y: startPt[1] });

    if (path.type === 'arc') {
      let sweepDeg = path.endAngle - path.startAngle;
      while (sweepDeg <= 0) sweepDeg += 360;
      while (sweepDeg > 360) sweepDeg -= 360;
      const sweepRad = sweepDeg * Math.PI / 180;
      let bulge = Math.tan(sweepRad / 4);
      if (reversed) bulge = -bulge;
      bulges.push(bulge);
    } else {
      bulges.push(0);
    }
  }

  return simplifyPolyline({ vertices, bulges, closed: !!chain.endless });
}

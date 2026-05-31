// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Boolean operace přes Maker.js (combineUnion atd.)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vstup: dva SKICA objekty (uzavřené kontury). Výstup: pole nových SKICA
// objektů – uzavřené polyliny s bulges pokrývající výsledek operace.
// Pokud combine vrátí více oddělených smyček (např. subtract s vnitřní
// dírou), vznikne odpovídající počet polylines.

import { getMaker, objToMakerModel } from '../dxf.js';

/**
 * Provede booleovskou operaci nad dvěma uzavřenými SKICA tvary.
 * @param {object} objA  první uzavřený tvar (circle | rect | polyline.closed)
 * @param {object} objB  druhý uzavřený tvar
 * @param {'union'|'subtract'|'intersect'} operation
 * @returns {object[]|null}  pole výsledných SKICA objektů, nebo null při selhání
 */
export function booleanCombine(objA, objB, operation) {
  const mk = getMaker();
  if (!mk) return null;

  const modelA = objToMakerModel(objA, mk);
  const modelB = objToMakerModel(objB, mk);
  if (!modelA || !modelB) return null;

  // Zabalit do plnohodnotných modelů (combine očekává `models.*` / `paths.*`)
  const wrapA = { models: { a: modelA } };
  const wrapB = { models: { b: modelB } };

  let result;
  try {
    switch (operation) {
      case 'union':     result = mk.model.combineUnion(wrapA, wrapB); break;
      case 'subtract':  result = mk.model.combineSubtraction(wrapA, wrapB); break;
      case 'intersect': result = mk.model.combineIntersection(wrapA, wrapB); break;
      default: return null;
    }
  } catch (err) {
    console.error('Maker.js combine selhal:', err);
    return null;
  }
  if (!result) return null;

  return chainsToSkicaObjects(mk, result, objA);
}

/**
 * Najde všechny řetězce v Maker.js modelu a převede je na SKICA polyliny
 * (uzavřené, s bulges). Otevřené řetězce se vrátí jako neuzavřené polyliny.
 *
 * @param {object} mk     Maker.js instance
 * @param {object} model  Maker.js model po combine
 * @param {object} ref    referenční SKICA objekt (pro dědění layer/color)
 */
function chainsToSkicaObjects(mk, model, ref) {
  const out = [];
  const base = {
    layer: ref.layer,
    ...(ref.color ? { color: ref.color } : {}),
  };

  mk.model.findChains(model, (chains /*, loose, layer */) => {
    if (!chains) return;
    for (const chain of chains) {
      const poly = chainToPolyline(chain);
      if (poly && poly.vertices.length >= 2) {
        out.push({ type: 'polyline', ...poly, ...base });
      }
    }
  }, { byLayers: false });

  return out;
}

/** Převede jeden Maker.js chain na vertex/bulge polylinu. */
function chainToPolyline(chain) {
  const links = chain.links || [];
  if (links.length === 0) return null;

  // Speciální případ: chain z plné kružnice / 360° oblouku – findChains ho
  // ohlásí jako jediný „endless" link bez endPoints. Rozdělíme ho na dva
  // půlkruhové bulge segmenty.
  if (links.length === 1 && chain.endless && (!links[0].endPoints)) {
    const path = links[0].walkedPath.pathContext;
    const offset = links[0].walkedPath.offset || [0, 0];
    if (path.type === 'circle' || path.type === 'arc') {
      const cx = path.origin[0] + offset[0];
      const cy = path.origin[1] + offset[1];
      const r = path.radius;
      return {
        vertices: [{ x: cx + r, y: cy }, { x: cx - r, y: cy }],
        bulges: [1, 1], // dva 180° oblouky (tan(180°/4)=1)
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
    if (!ep) return null; // ochrana – běžné chainy mají endPoints

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

  return { vertices, bulges, closed: !!chain.endless };
}

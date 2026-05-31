// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Boolean operace přes Maker.js (combineUnion atd.)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vstup: dva SKICA objekty (uzavřené kontury). Výstup: pole nových SKICA
// objektů – uzavřené polyliny s bulges pokrývající výsledek operace.
// Pokud combine vrátí více oddělených smyček (např. subtract s vnitřní
// dírou), vznikne odpovídající počet polylines.

import { getMaker, objToMakerModel } from '../dxf.js';
import { chainToPolyline } from '../lib/makerjsBridge.js';

/**
 * Provede booleovskou operaci nad dvěma uzavřenými SKICA tvary.
 * @param {object} objA  první uzavřený tvar (circle | rect | polyline.closed)
 * @param {object} objB  druhý uzavřený tvar
 * @param {'union'|'subtract'|'intersect'} operation
 * @returns {object[]|null}  pole výsledných SKICA objektů, [] pro identické
 *                            vstupy / prázdný výsledek, null při selhání Maker.js
 */
export function booleanCombine(objA, objB, operation) {
  // Defenziva: validní uzavřené tvary (degenerované polyliny zahazujeme)
  if (!isValidClosedShape(objA) || !isValidClosedShape(objB)) return [];

  // Geometricky identické tvary – combine v Maker.js si s nimi neporadí.
  // A − A = 0, A ∪ A = A, A ∩ A = A. První řeším explicitně.
  if (geometrySignature(objA) === geometrySignature(objB)) {
    if (operation === 'subtract') return [];
    // Pro union/intersect vrátím kopii vstupu se zděděnými vlajkami.
    return [{ ...cloneAsPolyline(objA), ...inheritFlags(objA, objB) }];
  }

  const mk = getMaker();
  if (!mk) return null;

  const modelA = objToMakerModel(objA, mk);
  const modelB = objToMakerModel(objB, mk);
  if (!modelA || !modelB) return null;

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

  return chainsToSkicaObjects(mk, result, objA, objB);
}

/** Zkontroluje, že tvar je uzavřený a má smysluplnou geometrii. */
function isValidClosedShape(obj) {
  if (!obj) return false;
  if (obj.type === 'circle') return obj.r > 0;
  if (obj.type === 'rect') return obj.x1 !== obj.x2 && obj.y1 !== obj.y2;
  if (obj.type === 'polyline') {
    return !!obj.closed && Array.isArray(obj.vertices) && obj.vertices.length >= 3;
  }
  return false;
}

/**
 * Spočítá deterministický řetězec popisující geometrii tvaru
 * (bez metadat jako id/name/layer). Identické tvary mají stejnou signaturu.
 */
function geometrySignature(obj) {
  const r = (n) => Number(n).toFixed(6);
  switch (obj.type) {
    case 'circle':
      return `c|${r(obj.cx)}|${r(obj.cy)}|${r(obj.r)}`;
    case 'rect': {
      const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
      const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
      return `r|${r(x1)}|${r(y1)}|${r(x2)}|${r(y2)}`;
    }
    case 'polyline': {
      const vs = obj.vertices.map(v => `${r(v.x)},${r(v.y)}`).join(';');
      const bs = (obj.bulges || []).map(b => r(b || 0)).join(';');
      return `p|${obj.closed ? 1 : 0}|${vs}|${bs}`;
    }
    default:
      return 't|' + obj.type;
  }
}

/** Vytvoří kopii vstupu jako uzavřenou polylinu (pro union/intersect identických). */
function cloneAsPolyline(obj) {
  if (obj.type === 'polyline') {
    return {
      type: 'polyline',
      vertices: obj.vertices.map(v => ({ x: v.x, y: v.y })),
      bulges: (obj.bulges || []).slice(),
      closed: true,
    };
  }
  if (obj.type === 'circle') {
    return {
      type: 'polyline',
      vertices: [{ x: obj.cx + obj.r, y: obj.cy }, { x: obj.cx - obj.r, y: obj.cy }],
      bulges: [1, 1],
      closed: true,
    };
  }
  if (obj.type === 'rect') {
    const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
    const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
    return {
      type: 'polyline',
      vertices: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }],
      bulges: [0, 0, 0, 0],
      closed: true,
    };
  }
  return null;
}

/**
 * Sestaví objekt s děděnými vlajkami: layer/color z A, isStock = A || B,
 * dashed/skipIntersections z A. Tím se zachová stock-flag při union dvou stocků
 * a vizuální atributy zůstanou od „hlavního" objektu.
 */
function inheritFlags(objA, objB) {
  const out = { layer: objA.layer };
  if (objA.color) out.color = objA.color;
  if (objA.dashed) out.dashed = true;
  if (objA.skipIntersections) out.skipIntersections = true;
  if (objA.isStock || objB.isStock) out.isStock = true;
  return out;
}

/**
 * Najde všechny řetězce v Maker.js modelu a převede je na SKICA polyliny.
 */
function chainsToSkicaObjects(mk, model, refA, refB) {
  const out = [];
  const base = inheritFlags(refA, refB);

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

// chainToPolyline je nyní v js/lib/makerjsBridge.js (sdíleno s novými nástroji).

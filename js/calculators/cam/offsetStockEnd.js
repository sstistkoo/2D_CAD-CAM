// ╔══════════════════════════════════════════════════════════════╗
// ║  KONEC KONTURY NA KONCI POLOTOVARU — offset hrubování dolů      ║
// ╚══════════════════════════════════════════════════════════════╝
// Kontura je soustružnický profil: za jejím koncem (nižší Z) díl pokračuje
// do sklíčidla. Hrubování ale plánuje proti siluetě polotovaru rozšířené
// o R nosu — ta přečnívá spodní konec polotovaru o R. Končí-li kontura
// PŘESNĚ na spodním konci polotovaru (karuselový díl postavený na stole:
// poslední bod X846 Z0, polotovar od Z0), offset dílu ten pruh pod dílem
// nezakryje a vrstvy pod ním jedou vzduchem — u cik caku 425 obrácených
// vrstev `G0 Z-6 / G1 Z0.5` pod celým dílem (uživatel 3. 11. 2026).
//
// Oprava: offset HRUBOVÁNÍ se z koncového bodu protáhne svisle (v Z) až pod
// rozšířený polotovar. Doslovné uzavření kontury k ose nejde — dokončování
// by pak jelo po spodním čele pod dílem (`G1 X0 Z-5`, do stolu).

import { segEndPoint as segEnd, segStartPoint as segStart } from './camMath.js';

const TOL = 0.05;

/**
 * @param {Array} offsetPath  offset hrubování (mění se na místě)
 * @param {Array} contourSegments
 * @param {Array} stockPathSegments
 * @param {number} reach  o kolik offset přečnívá konturu (R + přídavky)
 * @returns {boolean} zda se offset protáhl
 */
export function extendRoughOffsetBelowStockEnd(offsetPath, contourSegments, stockPathSegments, reach) {
  if (!offsetPath?.length || !contourSegments?.length || !stockPathSegments?.length || !(reach > 0)) return false;
  let stockMinZ = Infinity;
  for (const s of stockPathSegments) {
    stockMinZ = Math.min(stockMinZ, segStart(s).z, segEnd(s).z);
  }
  const cEnd = segEnd(contourSegments[contourSegments.length - 1]);
  if (!(cEnd.x > TOL) || Math.abs(cEnd.z - stockMinZ) > TOL) return false;
  const last = offsetPath[offsetPath.length - 1];
  const e = segEnd(last);
  const zTo = stockMinZ - reach - 1;
  if (!(e.z > zTo) || e.x < cEnd.x - TOL) return false;
  offsetPath.push({ type: 'line', p1: { x: e.x, z: e.z }, p2: { x: e.x, z: zTo }, stockEndExt: true });
  return true;
}

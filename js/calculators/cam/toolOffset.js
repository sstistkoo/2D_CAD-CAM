// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – offset kontury o rádius plátku (+ přídavky)             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// POZOR na záměnu: `js/calculators/contourOffset.js` je NĚCO JINÉHO — offset
// kontury pro „polotovar z kontury" na CAD straně (přídavek na plochu se
// sražením/zaoblením rohů). Tenhle modul řeší korekci na RÁDIUS PLÁTKU.
//
// „Syrový" (neořezaný) offset segmentů kontury na stranu vzduchu — kam dojede
// STŘED rádiusu plátku. Vytaženo z calculatePipeline.js, aby se dal spočítat
// VÍCKRÁT s různými přídavky:
//   • hrubovací offset  = R + Přídavek X/Z + Přídavek na hotovo  → dráhy,
//   • hotovní offset    = R (bez přídavků)                       → dokončování
//                                                                  a referenční
//                                                                  čára v náhledu.
//
// Výstup je pole segmentů PŘED ořezem — volající pouští `trimAndRemoveLoops`
// + `dropTinyArcs` (offset sousedních úseků se protíná / dělá smyčky).
//
// Souřadnice: CAM svět {x = poloměr, z = axiálně} v mm.

import { fitArcsToPolyline, getNormal } from './camMath.js';

/**
 * Offset segmentů kontury o (tipR + přídavek) na stranu vzduchu.
 *
 * Úsečky se posouvají PO OSÁCH (aX v X, aZ v Z), oblouky změnou poloměru:
 * konvexní (OUTER) ven, konkávní (INNER) dovnitř. Při různém přídavku v X a Z
 * z oblouku vznikne ELIPSA — navzorkuje se a proloží zpět oblouky/úsečkami
 * (`fitArcsToPolyline`), jinak by konce nesedly na offsety sousedních úseček
 * a trimmer by z krátkých zbytků dělal trojúhelníkové artefakty.
 *
 * @param {Array} contourSegments segmenty kontury ({type:'line'|'arc'})
 * @param {number} tipR rádius plátku
 * @param {number} aX přídavek v X
 * @param {number} aZ přídavek v Z
 * @param {number} fin přídavek na hotovo (přičítá se do obou os)
 * @returns {{ rawOffsets: Array, incompleteCount: number }} neořezané offsety
 *          a počet segmentů, které geometricky nešly odsadit (poloosa ≤ 0).
 */
export function buildRawOffsets(contourSegments, tipR, aX, aZ, fin) {
  const rawOffsets = [];
  let incompleteCount = 0;
  for (let i = 0; i < contourSegments.length; i++) {
    const seg = contourSegments[i];
    let offSeg = null;
    if (seg.type === 'line') {
      const n = getNormal(seg.p1, seg.p2);
      const tx = n.x * (tipR + aX + fin);
      const tz = n.z * (tipR + aZ + fin);
      offSeg = { type: 'line', p1: { x: seg.p1.x + tx, z: seg.p1.z + tz }, p2: { x: seg.p2.x + tx, z: seg.p2.z + tz } };
    } else if (seg.type === 'arc') {
      // Autodetekce směru z geometrie — nezávisle na G2/G3 z exportu.
      // Důvod: pokud byl arc nakreslen s "obrácenou" CW/CCW volbou
      // (canvas má flipnutou Y), export má prohozený G2/G3 a offset by
      // se pak posílal na špatnou stranu.
      // OUTER (konvexní): |center.x| < |chord_midpoint.x| → offset ven.
      // INNER (konkávní): |center.x| > |chord_midpoint.x| → offset dovnitř.
      const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
      const centerAbsX = Math.abs(seg.cx);
      const isOuter = centerAbsX < midAbsX;
      // Per-axis offset stejně jako u úseček: bod oblouku s normálou
      // (sin a, cos a) se posouvá o (R+aX) v X a (R+aZ) v Z → poloosy.
      const rx = isOuter ? seg.r + tipR + aX + fin : seg.r - (tipR + aX + fin);
      const rz = isOuter ? seg.r + tipR + aZ + fin : seg.r - (tipR + aZ + fin);
      // Pouze geometricky nemožné (poloosa <= 0) zahodíme. Malé ale kladné
      // je legitimní — nástroj sleduje miniaturní oblouk kolem rohu.
      if (Math.min(rx, rz) <= 0.05) { incompleteCount++; offSeg = null; }
      else if (Math.abs(rx - rz) < 1e-9) {
        const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
        const endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
        offSeg = { type: 'arc', cx: seg.cx, cz: seg.cz, r: rx, dir: seg.dir, refP1: seg.p1, refP2: seg.p2, startAngle, endAngle };
      } else {
        // Elipsu navzorkovat (hustě, chord error << tol) a proložit zpět
        // oblouky/úsečkami (tol 0,02) — G-kód zůstane kompaktní (G2/G3).
        let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
        let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        const rMax = Math.max(rx, rz);
        const dTheta = Math.sqrt(8 * 0.002 / rMax);
        const steps = Math.max(4, Math.min(256, Math.ceil(Math.abs(eA - sA) / dTheta)));
        const pts = [];
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          pts.push({ x: seg.cx + Math.sin(a) * rx, z: seg.cz + Math.cos(a) * rz });
        }
        const fitted = fitArcsToPolyline(pts, 0.02);
        fitted.forEach((fs, fi) => {
          if (fi === 0 && seg.chainBreak) fs.chainBreak = true;
          rawOffsets.push(fs);
        });
        offSeg = null;   // segmenty už jsou vložené
      }
    }
    if (offSeg) {
      if (seg.chainBreak) offSeg.chainBreak = true;
      rawOffsets.push(offSeg);
    }
  }
  return { rawOffsets, incompleteCount };
}

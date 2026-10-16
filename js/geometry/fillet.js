// SKICA – geometrie výkresu: Zaoblení a sražení dvou úseček a úsečky s obloukem.
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { isAngleBetween } from '../utils.js';
import { circlePositionsTangentToCircleAndLine } from './tangents.js';

// ── Zaoblení dvou úseček ──
/**
 * Vytvoří zaoblení (fillet) mezi dvěma úsečkami.
 * Najde průsečík, ořízne obě úsečky a vrátí oblouk.
 * @param {import('../types.js').DrawObject} line1
 * @param {import('../types.js').DrawObject} line2
 * @param {number} radius
 * @returns {{ arc: import('../types.js').DrawObject, ok: boolean, msg?: string }}
 */
export function filletTwoLines(line1, line2, radius) {
  // Find intersection of infinite lines
  const d1x = line1.x2 - line1.x1, d1y = line1.y2 - line1.y1;
  const d2x = line2.x2 - line2.x1, d2y = line2.y2 - line2.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return { ok: false, msg: "Úsečky jsou rovnoběžné" };

  const t = ((line2.x1 - line1.x1) * d2y - (line2.y1 - line1.y1) * d2x) / denom;
  const ix = line1.x1 + t * d1x, iy = line1.y1 + t * d1y;

  // Determine directions: point AWAY from intersection along each line
  const d1a = Math.hypot(line1.x1 - ix, line1.y1 - iy);
  const d1b = Math.hypot(line1.x2 - ix, line1.y2 - iy);
  const dir1x = d1a > d1b ? (line1.x1 - ix) : (line1.x2 - ix);
  const dir1y = d1a > d1b ? (line1.y1 - iy) : (line1.y2 - iy);
  const dlen1 = Math.hypot(dir1x, dir1y);
  const n1x = dir1x / dlen1, n1y = dir1y / dlen1;

  const d2a = Math.hypot(line2.x1 - ix, line2.y1 - iy);
  const d2b = Math.hypot(line2.x2 - ix, line2.y2 - iy);
  const dir2x = d2a > d2b ? (line2.x1 - ix) : (line2.x2 - ix);
  const dir2y = d2a > d2b ? (line2.y1 - iy) : (line2.y2 - iy);
  const dlen2 = Math.hypot(dir2x, dir2y);
  const n2x = dir2x / dlen2, n2y = dir2y / dlen2;

  // Sector angle between directions away from intersection
  const cosAngle = Math.max(-1, Math.min(1, n1x * n2x + n1y * n2y));
  const sectorAngle = Math.acos(cosAngle);
  if (sectorAngle < 1e-9 || sectorAngle > Math.PI - 1e-9)
    return { ok: false, msg: "Úsečky jsou téměř rovnoběžné" };

  const tanHalf = Math.tan(sectorAngle / 2);
  const dist = radius / tanHalf; // distance from intersection to tangent point
  // Tečný bod musí ležet mezi průsečíkem a vzdáleným koncem úsečky – jinak
  // by se úsečka „ořízla" za svůj konec a tiše se otočila.
  if (dist > Math.max(d1a, d1b) + 1e-6 || dist > Math.max(d2a, d2b) + 1e-6)
    return { ok: false, msg: "Poloměr zaoblení je na tyto úsečky příliš velký" };

  // Tangent points on each line
  const tp1x = ix + n1x * dist, tp1y = iy + n1y * dist;
  const tp2x = ix + n2x * dist, tp2y = iy + n2y * dist;

  // Arc center: offset from intersection along bisector
  const bx = n1x + n2x, by = n1y + n2y;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-10) return { ok: false, msg: "Nelze určit střed zaoblení" };
  const centerDist = Math.hypot(radius, dist);
  const cX = ix + (bx / blen) * centerDist;
  const cY = iy + (by / blen) * centerDist;

  // Start and end angles
  let startAngle = Math.atan2(tp1y - cY, tp1x - cX);
  let endAngle = Math.atan2(tp2y - cY, tp2x - cX);

  // Ensure CCW sweep from startAngle to endAngle is the minor arc (< π)
  const ccwSweep = ((endAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (ccwSweep > Math.PI) {
    [startAngle, endAngle] = [endAngle, startAngle];
  }

  // Trim lines: move the endpoint closer to intersection to the tangent point
  if (d1a < d1b) { line1.x1 = tp1x; line1.y1 = tp1y; }
  else { line1.x2 = tp1x; line1.y2 = tp1y; }

  if (d2a < d2b) { line2.x1 = tp2x; line2.y1 = tp2y; }
  else { line2.x2 = tp2x; line2.y2 = tp2y; }

  return {
    ok: true,
    arc: {
      type: 'arc',
      cx: cX, cy: cY,
      r: radius,
      startAngle, endAngle,
    }
  };
}

/**
 * Vytvoří zkosení (chamfer) mezi dvěma úsečkami.
 * Najde průsečík, ořízne obě úsečky a vrátí spojovací úsečku.
 * @param {{x1:number,y1:number,x2:number,y2:number}} line1
 * @param {{x1:number,y1:number,x2:number,y2:number}} line2
 * @param {number} dist1 – vzdálenost ořezu na první úsečce od průsečíku
 * @param {number} dist2 – vzdálenost ořezu na druhé úsečce od průsečíku
 * @returns {{ line: {type:string,x1:number,y1:number,x2:number,y2:number}, ok: boolean, msg?: string }}
 */
export function chamferTwoLines(line1, line2, dist1, dist2) {
  const d1x = line1.x2 - line1.x1, d1y = line1.y2 - line1.y1;
  const d2x = line2.x2 - line2.x1, d2y = line2.y2 - line2.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return { ok: false, msg: "Úsečky jsou rovnoběžné" };

  const t = ((line2.x1 - line1.x1) * d2y - (line2.y1 - line1.y1) * d2x) / denom;
  const ix = line1.x1 + t * d1x, iy = line1.y1 + t * d1y;

  // Directions pointing AWAY from intersection
  const d1a = Math.hypot(line1.x1 - ix, line1.y1 - iy);
  const d1b = Math.hypot(line1.x2 - ix, line1.y2 - iy);
  const dlen1 = d1a > d1b ? d1a : d1b;
  const dir1x = d1a > d1b ? (line1.x1 - ix) : (line1.x2 - ix);
  const dir1y = d1a > d1b ? (line1.y1 - iy) : (line1.y2 - iy);
  const n1x = dir1x / dlen1, n1y = dir1y / dlen1;

  const d2a = Math.hypot(line2.x1 - ix, line2.y1 - iy);
  const d2b = Math.hypot(line2.x2 - ix, line2.y2 - iy);
  const dlen2 = d2a > d2b ? d2a : d2b;
  const dir2x = d2a > d2b ? (line2.x1 - ix) : (line2.x2 - ix);
  const dir2y = d2a > d2b ? (line2.y1 - iy) : (line2.y2 - iy);
  const n2x = dir2x / dlen2, n2y = dir2y / dlen2;

  // Check distances fit on the lines
  const maxD1 = d1a > d1b ? d1a : d1b;
  const maxD2 = d2a > d2b ? d2a : d2b;
  if (dist1 > maxD1 + 1e-6) return { ok: false, msg: "Vzdálenost zkosení je větší než délka první úsečky" };
  if (dist2 > maxD2 + 1e-6) return { ok: false, msg: "Vzdálenost zkosení je větší než délka druhé úsečky" };

  // Cut points
  const cp1x = ix + n1x * dist1, cp1y = iy + n1y * dist1;
  const cp2x = ix + n2x * dist2, cp2y = iy + n2y * dist2;

  // Trim lines
  if (d1a < d1b) { line1.x1 = cp1x; line1.y1 = cp1y; }
  else { line1.x2 = cp1x; line1.y2 = cp1y; }

  if (d2a < d2b) { line2.x1 = cp2x; line2.y1 = cp2y; }
  else { line2.x2 = cp2x; line2.y2 = cp2y; }

  return {
    ok: true,
    line: {
      type: 'line',
      x1: cp1x, y1: cp1y,
      x2: cp2x, y2: cp2y,
    }
  };
}

/**
 * Zaoblení (fillet) mezi úsečkou a obloukem.
 * Používá circlePositionsTangentToCircleAndLine – hledá střed fillet kružnice tečné k oběma.
 * @param {{x1,y1,x2,y2}} line  – mutable proxy
 * @param {{cx,cy,r,startAngle,endAngle,ccw?}} arc  – mutable proxy
 * @param {number} radius
 * @returns {{ arc: object, ok: boolean, msg?: string }}
 */
export function filletLineAndArc(line, arc, radius) {
  const candidates = circlePositionsTangentToCircleAndLine(
    radius, arc.cx, arc.cy, arc.r,
    line.x1, line.y1, line.x2, line.y2
  );
  if (candidates.length === 0) return { ok: false, msg: "Nelze nalézt střed zaoblení" };

  const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { ok: false, msg: "Úsečka je příliš krátká" };

  // Referenční body konců oblouku pro rozhodnutí, který konec oříznout
  const arcStartPt = {
    x: arc.cx + arc.r * Math.cos(arc.startAngle),
    y: arc.cy + arc.r * Math.sin(arc.startAngle),
  };
  const arcEndPt = {
    x: arc.cx + arc.r * Math.cos(arc.endAngle),
    y: arc.cy + arc.r * Math.sin(arc.endAngle),
  };

  for (const cand of candidates) {
    const { cx: fcx, cy: fcy } = cand;

    // Tečný bod na úsečce = pata kolmice z fillet středu
    const t_line = ((fcx - line.x1) * dx + (fcy - line.y1) * dy) / lenSq;
    if (t_line < -1e-6 || t_line > 1 + 1e-6) continue;
    const tp_lx = line.x1 + t_line * dx;
    const tp_ly = line.y1 + t_line * dy;

    // Tečný bod na oblouku = bod na kružnici ve směru oblouk→fillet
    // Platí pro vnější i vnitřní tečnost: tp = střed_oblouku + r * směr_k_fillet_středu
    const D = Math.hypot(fcx - arc.cx, fcy - arc.cy);
    if (D < 1e-10) continue;
    const tp_ax = arc.cx + arc.r * (fcx - arc.cx) / D;
    const tp_ay = arc.cy + arc.r * (fcy - arc.cy) / D;

    // Tečný bod musí ležet v úhlovém rozsahu oblouku
    const tpAngle = Math.atan2(tp_ay - arc.cy, tp_ax - arc.cx);
    if (!isAngleBetween(tpAngle, arc.startAngle, arc.endAngle, arc.ccw)) continue;

    // Platný kandidát – provést ořez

    // Ořez úsečky: konec blíže k tečnému bodu se přesune
    const dla = Math.hypot(line.x1 - tp_lx, line.y1 - tp_ly);
    const dlb = Math.hypot(line.x2 - tp_lx, line.y2 - tp_ly);
    if (dla < dlb) { line.x1 = tp_lx; line.y1 = tp_ly; }
    else           { line.x2 = tp_lx; line.y2 = tp_ly; }

    // Ořez oblouku: konec oblouku blíže k tečnému bodu se přesune
    const dsa = Math.hypot(arcStartPt.x - tp_ax, arcStartPt.y - tp_ay);
    const dea = Math.hypot(arcEndPt.x  - tp_ax, arcEndPt.y  - tp_ay);
    if (dsa < dea) arc.startAngle = tpAngle;
    else           arc.endAngle   = tpAngle;

    // Fillet oblouk – CCW minor arc mezi tečnými body
    let fa_s = Math.atan2(tp_ly - fcy, tp_lx - fcx);
    let fa_e = Math.atan2(tp_ay - fcy, tp_ax - fcx);
    const ccwSweep = ((fa_e - fa_s) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    if (ccwSweep > Math.PI) [fa_s, fa_e] = [fa_e, fa_s];

    return {
      ok: true,
      arc: { type: 'arc', cx: fcx, cy: fcy, r: radius, startAngle: fa_s, endAngle: fa_e },
    };
  }

  return { ok: false, msg: "Zaoblení nelze vytvořit – tečné body leží mimo úsečku nebo oblouk" };
}

/**
 * Zkosení (chamfer) mezi úsečkou a obloukem.
 * Najde nejbližší pár (konec úsečky, konec oblouku), ořízne obě části, vrátí spojovací úsečku.
 * dist1 – vzdálenost ořezu na úsečce (mm), dist2 – délka ořezu na oblouku (délka oblouku, mm).
 * @param {{x1,y1,x2,y2}} line  – mutable proxy
 * @param {{cx,cy,r,startAngle,endAngle,ccw?}} arc  – mutable proxy
 * @param {number} dist1
 * @param {number} dist2
 * @returns {{ line: object, ok: boolean, msg?: string }}
 */
export function chamferLineAndArc(line, arc, dist1, dist2) {
  const arcStartPt = {
    x: arc.cx + arc.r * Math.cos(arc.startAngle),
    y: arc.cy + arc.r * Math.sin(arc.startAngle),
  };
  const arcEndPt = {
    x: arc.cx + arc.r * Math.cos(arc.endAngle),
    y: arc.cy + arc.r * Math.sin(arc.endAngle),
  };

  // Nejbližší pár (konec úsečky, konec oblouku) = roh
  const pairs = [
    { lp: { x: line.x1, y: line.y1 }, ap: arcStartPt, lEnd: 'p1', aEnd: 'start', aAngle: arc.startAngle },
    { lp: { x: line.x1, y: line.y1 }, ap: arcEndPt,   lEnd: 'p1', aEnd: 'end',   aAngle: arc.endAngle },
    { lp: { x: line.x2, y: line.y2 }, ap: arcStartPt, lEnd: 'p2', aEnd: 'start', aAngle: arc.startAngle },
    { lp: { x: line.x2, y: line.y2 }, ap: arcEndPt,   lEnd: 'p2', aEnd: 'end',   aAngle: arc.endAngle },
  ].map(p => ({ ...p, d: Math.hypot(p.lp.x - p.ap.x, p.lp.y - p.ap.y) }))
   .sort((a, b) => a.d - b.d);

  const best = pairs[0];

  // Směr od rohu pryč podél úsečky
  const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
  const lineLen = Math.hypot(dx, dy);
  if (lineLen < 1e-10) return { ok: false, msg: "Úsečka je příliš krátká" };
  if (dist1 > lineLen + 1e-6) return { ok: false, msg: "Vzdálenost zkosení přesahuje délku úsečky" };

  const sign = best.lEnd === 'p1' ? 1 : -1;
  const n1x = sign * dx / lineLen, n1y = sign * dy / lineLen;
  const cp1x = best.lp.x + n1x * dist1;
  const cp1y = best.lp.y + n1y * dist1;

  // Úhlová vzdálenost na oblouku odpovídající dist2
  const dAngle = dist2 / arc.r;
  const arcCCW = arc.ccw !== false;
  const arcSweep = arcCCW
    ? ((arc.endAngle - arc.startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
    : ((arc.startAngle - arc.endAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (dAngle > arcSweep + 1e-6) return { ok: false, msg: "Vzdálenost zkosení přesahuje délku oblouku" };
  let newArcAngle;
  if (best.aEnd === 'start') {
    // Roh je na začátku oblouku → jdeme DO oblouku
    newArcAngle = arcCCW ? best.aAngle + dAngle : best.aAngle - dAngle;
    arc.startAngle = newArcAngle;
  } else {
    // Roh je na konci oblouku → jdeme DO oblouku opačně
    newArcAngle = arcCCW ? best.aAngle - dAngle : best.aAngle + dAngle;
    arc.endAngle = newArcAngle;
  }
  const cp2x = arc.cx + arc.r * Math.cos(newArcAngle);
  const cp2y = arc.cy + arc.r * Math.sin(newArcAngle);

  // Ořez úsečky
  if (best.lEnd === 'p1') { line.x1 = cp1x; line.y1 = cp1y; }
  else                    { line.x2 = cp1x; line.y2 = cp1y; }

  return {
    ok: true,
    line: { type: 'line', x1: cp1x, y1: cp1y, x2: cp2x, y2: cp2y },
  };
}

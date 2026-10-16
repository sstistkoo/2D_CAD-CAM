// SKICA – geometrie výkresu: Tečny z bodu / dvou kružnic a polohy kružnice daného poloměru tečné k úsečce, kružnici, bodu.
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { intersectInfiniteLines, lineOffsets, projectionParam } from './linesOffset.js';

// ── Tečny z bodu ke kružnici ──
/**
 * @param {number} px
 * @param {number} py
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {import('../types.js').TangentLine[]}
 */
export function tangentsFromPointToCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d < r - 1e-9) return []; // bod uvnitř
  if (d < r + 1e-9) {
    // bod na kružnici – jedna tečna (kolmice)
    const nx = -dy / d, ny = dx / d;
    return [{ x1: px, y1: py, x2: px + nx * r, y2: py + ny * r }];
  }
  const L = Math.sqrt(d * d - r * r);
  const baseAngle = Math.atan2(dy, dx);
  const halfAngle = Math.acos(r / d);
  const results = [];
  for (const sign of [-1, 1]) {
    const a = baseAngle + sign * halfAngle;
    const tx = cx + r * Math.cos(a);
    const ty = cy + r * Math.sin(a);
    results.push({ x1: px, y1: py, x2: tx, y2: ty });
  }
  return results;
}

// ── Tečny dvou kružnic (vnější + vnitřní) ──
/**
 * @param {number} cx1
 * @param {number} cy1
 * @param {number} r1
 * @param {number} cx2
 * @param {number} cy2
 * @param {number} r2
 * @returns {import('../types.js').TangentLine[]}
 */
export function tangentsTwoCircles(cx1, cy1, r1, cx2, cy2, r2) {
  const results = [];
  const d = Math.hypot(cx2 - cx1, cy2 - cy1);
  if (d < 1e-9) return [];
  const angle = Math.atan2(cy2 - cy1, cx2 - cx1);

  // Vnější tečny
  if (d >= Math.abs(r1 - r2) - 1e-9) {
    const ratio = (r1 - r2) / d;
    const clampedRatio = Math.max(-1, Math.min(1, ratio));
    const alpha = Math.asin(clampedRatio);
    for (const sign of [-1, 1]) {
      const beta = angle + sign * (Math.PI / 2 - alpha);
      const tx1 = cx1 + r1 * Math.cos(beta);
      const ty1 = cy1 + r1 * Math.sin(beta);
      const tx2 = cx2 + r2 * Math.cos(beta);
      const ty2 = cy2 + r2 * Math.sin(beta);
      results.push({ x1: tx1, y1: ty1, x2: tx2, y2: ty2 });
    }
  }

  // Vnitřní tečny
  if (d >= r1 + r2 - 1e-9) {
    const ratio = (r1 + r2) / d;
    const clampedRatio = Math.max(-1, Math.min(1, ratio));
    const alpha = Math.asin(clampedRatio);
    for (const sign of [-1, 1]) {
      const beta = angle + sign * (Math.PI / 2 - alpha);
      const tx1 = cx1 + r1 * Math.cos(beta);
      const ty1 = cy1 + r1 * Math.sin(beta);
      const tx2 = cx2 - r2 * Math.cos(beta);
      const ty2 = cy2 - r2 * Math.sin(beta);
      results.push({ x1: tx1, y1: ty1, x2: tx2, y2: ty2 });
    }
  }

  return results;
}

// ── Offset objektu ──
/**
 * Vytvoří offsetovanou kopii objektu.
 * @param {import('../types.js').DrawObject} obj
 * @param {number} dist
 * @param {number} side  1 = vně/vpravo, -1 = uvnitř/vlevo
 * @returns {import('../types.js').DrawObject|null}
 */
// ── Pozice kružnice tečné k úsečce ──
export function circlePositionsTangentToLine(cx, cy, r, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return [];
  const nx = -dy / len, ny = dx / len;
  const t = ((cx - x1) * dx + (cy - y1) * dy) / (len * len);
  // Tečný bod = pata kolmice; musí ležet na KONEČNÉ úsečce (jako u
  // circlePositionsTangentToLineAndPoint). Mimo úsečku → žádné řešení.
  if (t < -1e-9 || t > 1 + 1e-9) return [];
  const footX = x1 + t * dx, footY = y1 + t * dy;
  return [
    { cx: footX + nx * r, cy: footY + ny * r },
    { cx: footX - nx * r, cy: footY - ny * r }
  ];
}

// ── Pozice NOVÉ kružnice (poloměr r) tečné k existující kružnici i k úsečce ──
export function circlePositionsTangentToCircleAndLine(r, cx1, cy1, r1, lx1, ly1, lx2, ly2) {
  const results = [];
  const dx = lx2 - lx1, dy = ly2 - ly1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return results;
  const nx = -dy / len, ny = dx / len;

  for (const lineSide of [1, -1]) {
    const ox = nx * r * lineSide;
    const oy = ny * r * lineSide;
    for (const circSide of [1, -1]) {
      const D = r1 + circSide * r;
      if (D < -1e-9) continue;
      const Dabs = Math.abs(D);
      const ax = lx1 + ox - cx1, ay = ly1 + oy - cy1;
      const a = dx * dx + dy * dy;
      const b = 2 * (ax * dx + ay * dy);
      const c = ax * ax + ay * ay - Dabs * Dabs;
      const disc = b * b - 4 * a * c;
      if (disc < -1e-9) continue;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      for (const s of [-1, 1]) {
        const t = (-b + s * sqrtDisc) / (2 * a);
        const ncx = lx1 + ox + t * dx;
        const ncy = ly1 + oy + t * dy;
        const isDup = results.some(p => Math.hypot(p.cx - ncx, p.cy - ncy) < 1e-4);
        if (!isDup) results.push({ cx: ncx, cy: ncy, r });
      }
    }
  }
  return results;
}

// ── Pozice kružnice tečné ke dvěma úsečkám ──
export function circlePositionsTangentToTwoLines(r, l1, l2) {
  const results = [];
  const offsets1 = lineOffsets(l1.x1, l1.y1, l1.x2, l1.y2, r);
  const offsets2 = lineOffsets(l2.x1, l2.y1, l2.x2, l2.y2, r);
  for (const o1 of offsets1) {
    for (const o2 of offsets2) {
      const pt = intersectInfiniteLines(o1, o2);
      if (pt) results.push({ cx: pt.x, cy: pt.y });
    }
  }
  // Tečné body (paty kolmic) musí ležet na OBOU konečných úsečkách – tím
  // odpadnou řešení mimo sevřený úhel / mimo rozsah úseček.
  const onSeg = (p, l) => {
    const tp = projectionParam(p.cx, p.cy, l.x1, l.y1, l.x2, l.y2);
    return tp >= -1e-9 && tp <= 1 + 1e-9;
  };
  return results.filter(p => onSeg(p, l1) && onSeg(p, l2));
}

// ── Pozice kružnice tečné k úsečce A procházející bodem ──
/**
 * Najde středy kružnice s poloměrem r, která je tečná k přímce (x1,y1)-(x2,y2)
 * a zároveň prochází bodem (px,py).
 * Střed musí ležet ve vzdálenosti r od přímky A ve vzdálenosti r od bodu.
 * @returns {{cx: number, cy: number}[]}
 */
export function circlePositionsTangentToLineAndPoint(r, x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return [];
  const nx = -dy / len, ny = dx / len; // normála k přímce

  const results = [];
  // Dvě rovnoběžky s přímkou ve vzdálenosti r
  for (const sign of [1, -1]) {
    // Bod na rovnoběžce: (x1 + sign*nx*r, y1 + sign*ny*r) + t*(dx, dy)
    // Hledáme t tak, aby vzdálenost od (px, py) = r
    // Parametrický bod: Qx = x1 + sign*nx*r + t*dx, Qy = y1 + sign*ny*r + t*dy
    // (Qx - px)^2 + (Qy - py)^2 = r^2
    const ox = x1 + sign * nx * r - px;
    const oy = y1 + sign * ny * r - py;
    // (ox + t*dx)^2 + (oy + t*dy)^2 = r^2
    const a = dx * dx + dy * dy;
    const b = 2 * (ox * dx + oy * dy);
    const c = ox * ox + oy * oy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < -1e-9) continue;
    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    for (const s of [-1, 1]) {
      const t = (-b + s * sqrtDisc) / (2 * a);
      const cx = x1 + sign * nx * r + t * dx;
      const cy = y1 + sign * ny * r + t * dy;
      results.push({ cx, cy });
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce
  const filtered = results.filter(p => {
    const tp = projectionParam(p.cx, p.cy, x1, y1, x2, y2);
    return tp >= -1e-9 && tp <= 1 + 1e-9;
  });
  // Deduplikace tečných řešení (disc ≈ 0 → dva téměř totožné výsledky)
  const deduped = [];
  for (const p of filtered) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Pozice kružnice (poloměr r) tečné k jiné kružnici a procházející bodem ──
/**
 * Střed nové kružnice musí být ve vzdálenosti (r ± rArc) od středu oblouku
 * a ve vzdálenosti r od bodu (kružnice jím prochází).
 * @returns {{cx: number, cy: number}[]}
 */
export function circlePositionsTangentToCircleAndPoint(r, cxArc, cyArc, rArc, px, py) {
  const results = [];
  for (const D of [r + rArc, Math.abs(r - rArc)]) {
    const dx = px - cxArc, dy = py - cyArc;
    const d = Math.hypot(dx, dy);
    if (d < 1e-10) continue;
    if (d > D + r + 1e-6 || d < Math.abs(D - r) - 1e-6) continue;
    const a = (D * D - r * r + d * d) / (2 * d);
    const h2 = D * D - a * a;
    if (h2 < -1e-9) continue;
    const h = Math.sqrt(Math.max(0, h2));
    const mx = cxArc + a * dx / d, my = cyArc + a * dy / d;
    results.push({ cx: mx + h * dy / d, cy: my - h * dx / d });
    if (h > 1e-6) results.push({ cx: mx - h * dy / d, cy: my + h * dx / d });
  }
  return results.filter((p, i) =>
    !results.slice(0, i).some(q => Math.hypot(p.cx - q.cx, p.cy - q.cy) < 1e-4)
  );
}

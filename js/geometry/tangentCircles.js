// SKICA – geometrie výkresu: Kružnice třemi body a kružnice tečné k úsečkám / kružnicím / bodům (vč. Apollonia).
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { circlePositionsTangentToCircleAndLine, circlePositionsTangentToTwoLines } from './tangents.js';
import { projectionParam } from './linesOffset.js';

// ── Kružnice procházející třemi body ──
/**
 * Najde kružnici procházející třemi body (opsaná kružnice).
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleThrough3Points(x1, y1, x2, y2, x3, y3) {
  const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(D) < 1e-10) return []; // kolineární body
  const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / D;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / D;
  const r = Math.hypot(cx - x1, cy - y1);
  return [{ cx, cy, r }];
}

// ── Kružnice tečná k úsečce a procházející dvěma body ──
/**
 * Najde kružnice, které jsou tečné k přímce a procházejí dvěma body.
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToLineAndTwoPoints(lx1, ly1, lx2, ly2, p1x, p1y, p2x, p2y) {
  const midX = (p1x + p2x) / 2, midY = (p1y + p2y) / 2;
  const dpx = p2x - p1x, dpy = p2y - p1y;
  const lenPP = Math.hypot(dpx, dpy);
  if (lenPP < 1e-10) return [];
  const perpDx = -dpy / lenPP, perpDy = dpx / lenPP;
  // Střed na osové souměrnosti P1P2: C(t) = (midX + t*perpDx, midY + t*perpDy)
  // r² = lenPP²/4 + t²
  const ldx = lx2 - lx1, ldy = ly2 - ly1;
  const lenL = Math.hypot(ldx, ldy);
  if (lenL < 1e-10) return [];
  const a = -ldy / lenL, b = ldx / lenL;
  const c = -(a * lx1 + b * ly1);
  // Vzdálenost středu od přímky: D(t) = D0 + t*D1
  const D0 = a * midX + b * midY + c;
  const D1 = a * perpDx + b * perpDy;
  // Podmínka: (D0 + t*D1)² = lenPP²/4 + t²
  const qa = D1 * D1 - 1;
  const qb = 2 * D0 * D1;
  const qc = D0 * D0 - lenPP * lenPP / 4;
  const results = [];
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) < 1e-10) return [];
    const t = -qc / qb;
    const cx = midX + t * perpDx, cy = midY + t * perpDy;
    const r = Math.sqrt(lenPP * lenPP / 4 + t * t);
    if (r > 1e-10) results.push({ cx, cy, r });
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < -1e-9) return [];
    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    for (const s of [-1, 1]) {
      const t = (-qb + s * sqrtDisc) / (2 * qa);
      const cx = midX + t * perpDx, cy = midY + t * perpDy;
      const r = Math.sqrt(lenPP * lenPP / 4 + t * t);
      if (r > 1e-10) results.push({ cx, cy, r });
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce
  const filtered = results.filter(p => {
    const tp = projectionParam(p.cx, p.cy, lx1, ly1, lx2, ly2);
    return tp >= -1e-9 && tp <= 1 + 1e-9;
  });
  // Deduplikace tečných řešení
  const deduped = [];
  for (const p of filtered) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Kružnice tečná ke dvěma úsečkám a procházející bodem ──
/**
 * Najde kružnice tečné ke dvěma přímkám a procházející bodem.
 * @param {{x1,y1,x2,y2}} l1
 * @param {{x1,y1,x2,y2}} l2
 * @param {number} px
 * @param {number} py
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToTwoLinesAndPoint(l1, l2, px, py) {
  const ldx1 = l1.x2 - l1.x1, ldy1 = l1.y2 - l1.y1;
  const len1 = Math.hypot(ldx1, ldy1);
  if (len1 < 1e-10) return [];
  const a1 = -ldy1 / len1, b1 = ldx1 / len1, c1 = -(a1 * l1.x1 + b1 * l1.y1);
  const ldx2 = l2.x2 - l2.x1, ldy2 = l2.y2 - l2.y1;
  const len2 = Math.hypot(ldx2, ldy2);
  if (len2 < 1e-10) return [];
  const a2 = -ldy2 / len2, b2 = ldx2 / len2, c2 = -(a2 * l2.x1 + b2 * l2.y1);
  const results = [];
  // Dvě osy úhlů: dist1 = ±dist2
  for (const sign of [1, -1]) {
    const ba = a1 - sign * a2, bb = b1 - sign * b2, bc = c1 - sign * c2;
    let bx0, by0, bdx, bdy;
    if (Math.abs(bb) > Math.abs(ba)) {
      bx0 = 0; by0 = -bc / bb; bdx = bb; bdy = -ba;
    } else if (Math.abs(ba) > 1e-10) {
      bx0 = -bc / ba; by0 = 0; bdx = bb; bdy = -ba;
    } else { continue; }
    // Střed na ose: (bx0 + t*bdx, by0 + t*bdy)
    // r = |a1*(bx0+t*bdx) + b1*(by0+t*bdy) + c1| = |E0 + t*E1|
    // r = dist(center, point)
    const E0 = a1 * bx0 + b1 * by0 + c1;
    const E1 = a1 * bdx + b1 * bdy;
    const ox = bx0 - px, oy = by0 - py;
    // (E0+t*E1)² = (ox+t*bdx)² + (oy+t*bdy)²
    const qa = E1 * E1 - (bdx * bdx + bdy * bdy);
    const qb = 2 * E0 * E1 - 2 * (ox * bdx + oy * bdy);
    const qc = E0 * E0 - (ox * ox + oy * oy);
    if (Math.abs(qa) < 1e-10) {
      if (Math.abs(qb) < 1e-10) continue;
      const t = -qc / qb;
      const cx = bx0 + t * bdx, cy = by0 + t * bdy;
      const r = Math.abs(E0 + t * E1);
      if (r > 1e-10) results.push({ cx, cy, r });
    } else {
      const disc = qb * qb - 4 * qa * qc;
      if (disc < -1e-9) continue;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      for (const s of [-1, 1]) {
        const t = (-qb + s * sqrtDisc) / (2 * qa);
        const cx = bx0 + t * bdx, cy = by0 + t * bdy;
        const r = Math.abs(E0 + t * E1);
        if (r > 1e-10) results.push({ cx, cy, r });
      }
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce u obou přímek
  const filtered = results.filter(p => {
    const t1 = projectionParam(p.cx, p.cy, l1.x1, l1.y1, l1.x2, l1.y2);
    const t2 = projectionParam(p.cx, p.cy, l2.x1, l2.y1, l2.x2, l2.y2);
    return t1 >= -1e-9 && t1 <= 1 + 1e-9 && t2 >= -1e-9 && t2 <= 1 + 1e-9;
  });
  // Deduplikace tečných řešení
  const deduped = [];
  for (const p of filtered) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Kružnice tečná ke třem úsečkám ──
/**
 * Najde kružnice tečné ke třem přímkám (vepsaná / připsané kružnice).
 * @param {{x1,y1,x2,y2}} l1
 * @param {{x1,y1,x2,y2}} l2
 * @param {{x1,y1,x2,y2}} l3
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToThreeLines(l1, l2, l3) {
  function lineNormal(l) {
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-10) return null;
    return { a: -dy / len, b: dx / len, c: -(-dy / len * l.x1 + dx / len * l.y1) };
  }
  const n1 = lineNormal(l1), n2 = lineNormal(l2), n3 = lineNormal(l3);
  if (!n1 || !n2 || !n3) return [];
  const results = [];
  for (const s2 of [1, -1]) {
    for (const s3 of [1, -1]) {
      // d1 = s2*d2, d1 = s3*d3 → lineární soustava pro (cx, cy)
      const eA1 = n1.a - s2 * n2.a, eB1 = n1.b - s2 * n2.b, eC1 = n1.c - s2 * n2.c;
      const eA2 = n1.a - s3 * n3.a, eB2 = n1.b - s3 * n3.b, eC2 = n1.c - s3 * n3.c;
      const det = eA1 * eB2 - eA2 * eB1;
      if (Math.abs(det) < 1e-10) continue;
      const cx = (-eC1 * eB2 + eC2 * eB1) / det;
      const cy = (-eA1 * eC2 + eA2 * eC1) / det;
      const r = Math.abs(n1.a * cx + n1.b * cy + n1.c);
      if (r > 1e-10) {
        const isDup = results.some(p => Math.hypot(p.cx - cx, p.cy - cy) < 1e-4);
        if (!isDup) results.push({ cx, cy, r });
      }
    }
  }
  // Filtrovat: tečný bod musí ležet na konečné úsečce u všech tří přímek
  return results.filter(p => {
    const t1 = projectionParam(p.cx, p.cy, l1.x1, l1.y1, l1.x2, l1.y2);
    const t2 = projectionParam(p.cx, p.cy, l2.x1, l2.y1, l2.x2, l2.y2);
    const t3 = projectionParam(p.cx, p.cy, l3.x1, l3.y1, l3.x2, l3.y2);
    return t1 >= -1e-9 && t1 <= 1 + 1e-9 && t2 >= -1e-9 && t2 <= 1 + 1e-9 && t3 >= -1e-9 && t3 <= 1 + 1e-9;
  });
}

// ── Kružnice tečná k jiné kružnici a procházející dvěma body ──
/**
 * Najde kružnice tečné k dané kružnici a procházející dvěma body.
 * @returns {{cx: number, cy: number, r: number}[]}
 */
export function circleTangentToCircleAndTwoPoints(ccx, ccy, cR, p1x, p1y, p2x, p2y) {
  const midX = (p1x + p2x) / 2, midY = (p1y + p2y) / 2;
  const dpx = p2x - p1x, dpy = p2y - p1y;
  const lenPP = Math.hypot(dpx, dpy);
  if (lenPP < 1e-10) return [];
  const perpDx = -dpy / lenPP, perpDy = dpx / lenPP;
  const halfLenSq = lenPP * lenPP / 4;
  const ox = midX - ccx, oy = midY - ccy;
  const F0 = ox * ox + oy * oy;
  const F1 = 2 * (ox * perpDx + oy * perpDy);
  // (F1²-4R²)t² + 2GF1·t + G²-4R²·halfLenSq = 0, kde G = F0 - halfLenSq - R²
  const G = F0 - halfLenSq - cR * cR;
  const qa = F1 * F1 - 4 * cR * cR;
  const qb = 2 * G * F1;
  const qc = G * G - 4 * cR * cR * halfLenSq;
  const results = [];
  function tryT(t) {
    const cx = midX + t * perpDx, cy = midY + t * perpDy;
    const r = Math.sqrt(halfLenSq + t * t);
    if (r < 1e-10) return;
    const dist = Math.hypot(cx - ccx, cy - ccy);
    if (Math.abs(dist - r - cR) < 1e-4 || Math.abs(dist - Math.abs(r - cR)) < 1e-4) {
      results.push({ cx, cy, r });
    }
  }
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) > 1e-10) tryT(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= -1e-9) {
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      tryT((-qb + sqrtDisc) / (2 * qa));
      tryT((-qb - sqrtDisc) / (2 * qa));
    }
  }
  // Deduplikace tečných řešení
  const deduped = [];
  for (const p of results) {
    if (!deduped.some(d => Math.hypot(d.cx - p.cx, d.cy - p.cy) < 1e-4))
      deduped.push(p);
  }
  return deduped;
}

// ── Pozice NOVÉ kružnice (poloměr r) tečné ke dvěma kružnicím/obloukům ──
export function circlePositionsTangentToTwoCircles(r, cx1, cy1, r1, cx2, cy2, r2) {
  const results = [];
  for (const s1 of [1, -1]) {
    const D1 = r + s1 * r1;
    if (D1 < -1e-9) continue;
    const aD1 = Math.abs(D1);
    for (const s2 of [1, -1]) {
      const D2 = r + s2 * r2;
      if (D2 < -1e-9) continue;
      const aD2 = Math.abs(D2);
      const d = Math.hypot(cx2 - cx1, cy2 - cy1);
      if (d < 1e-9 || aD1 + aD2 < d - 1e-9 || Math.abs(aD1 - aD2) > d + 1e-9) continue;
      const a = (aD1 * aD1 - aD2 * aD2 + d * d) / (2 * d);
      const h2 = aD1 * aD1 - a * a;
      if (h2 < -1e-9) continue;
      const h = Math.sqrt(Math.max(0, h2));
      const mx = cx1 + a * (cx2 - cx1) / d, my = cy1 + a * (cy2 - cy1) / d;
      const px = -(cy2 - cy1) / d, py = (cx2 - cx1) / d;
      for (const hs of (h < 1e-6 ? [0] : [h, -h])) {
        const ncx = mx + hs * px, ncy = my + hs * py;
        if (!results.some(p => Math.hypot(p.cx - ncx, p.cy - ncy) < 1e-4))
          results.push({ cx: ncx, cy: ncy, r });
      }
    }
  }
  return results;
}

// ── Dispatcher: pozice kružnice (poloměr r) tečné ke dvěma segmentům ──
// seg: {type:'line', x1,y1,x2,y2} nebo {type:'arc', cx,cy,r}
export function circlePositionsTangentToTwoSegments(r, seg1, seg2) {
  const l = s => s.type === 'line';
  if (l(seg1) && l(seg2))
    return circlePositionsTangentToTwoLines(r, seg1, seg2);
  if (l(seg1) && !l(seg2))
    return circlePositionsTangentToCircleAndLine(r, seg2.cx, seg2.cy, seg2.r, seg1.x1, seg1.y1, seg1.x2, seg1.y2);
  if (!l(seg1) && l(seg2))
    return circlePositionsTangentToCircleAndLine(r, seg1.cx, seg1.cy, seg1.r, seg2.x1, seg2.y1, seg2.x2, seg2.y2);
  return circlePositionsTangentToTwoCircles(r, seg1.cx, seg1.cy, seg1.r, seg2.cx, seg2.cy, seg2.r);
}

// ── Apollonius: kružnice tečná ke třem segmentům (poloměr se hledá) ──
// Hintové souřadnice pomáhají Newtonově metodě konvergovat k nejbližšímu řešení.
export function circleTangentToThreeSegments(seg1, seg2, seg3, hintCx, hintCy, hintR) {
  function rawDist(seg, cx, cy) {
    if (seg.type === 'line') {
      const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-10) return 0;
      return (-dy / len) * cx + (dx / len) * cy - ((-dy / len) * seg.x1 + (dx / len) * seg.y1);
    }
    return Math.hypot(cx - seg.cx, cy - seg.cy) - seg.r;
  }
  function rawGrad(seg, cx, cy) {
    if (seg.type === 'line') {
      const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-10) return [0, 0];
      return [-dy / len, dx / len];
    }
    const d = Math.hypot(cx - seg.cx, cy - seg.cy);
    if (d < 1e-10) return [0, 0];
    return [(cx - seg.cx) / d, (cy - seg.cy) / d];
  }
  function gaussSolve(A) {
    const m = A.map(r => [...r]);
    for (let c = 0; c < 3; c++) {
      let maxR = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[maxR][c])) maxR = r;
      [m[c], m[maxR]] = [m[maxR], m[c]];
      if (Math.abs(m[c][c]) < 1e-12) return null;
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let j = c; j < 4; j++) m[r][j] -= f * m[c][j];
      }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }

  const segs = [seg1, seg2, seg3];
  const results = [];

  for (const s1 of [1, -1]) for (const s2 of [1, -1]) for (const s3 of [1, -1]) {
    const signs = [s1, s2, s3];
    const starts = [
      [hintCx, hintCy, hintR],
      [hintCx, hintCy, hintR * 0.5],
      [hintCx, hintCy, hintR * 2],
      [hintCx + hintR, hintCy, hintR],
      [hintCx - hintR, hintCy, hintR],
      [hintCx, hintCy + hintR, hintR],
    ];
    for (const [sx, sy, sr] of starts) {
      let cx = sx, cy = sy, r = Math.max(0.01, sr);
      let ok = false;
      for (let iter = 0; iter < 60; iter++) {
        const f = segs.map((s, i) => signs[i] * rawDist(s, cx, cy) - r);
        const err = Math.max(...f.map(Math.abs));
        if (err < 1e-7) { ok = true; break; }
        const J = segs.map((s, i) => {
          const g = rawGrad(s, cx, cy);
          return [signs[i] * g[0], signs[i] * g[1], -1, -f[i]];
        });
        const sol = gaussSolve(J);
        if (!sol) break;
        const scale = Math.min(1, 5 / Math.max(...sol.map(Math.abs), 0.001));
        cx += sol[0] * scale;
        cy += sol[1] * scale;
        r = Math.max(0.001, r + sol[2] * scale);
      }
      if (!ok) {
        const f = segs.map((s, i) => signs[i] * rawDist(s, cx, cy) - r);
        ok = Math.max(...f.map(Math.abs)) < 1e-4;
      }
      if (ok && r > 1e-6) {
        const isDup = results.some(p => Math.hypot(p.cx - cx, p.cy - cy) < 0.01 && Math.abs(p.r - r) < 0.01);
        if (!isDup) results.push({ cx, cy, r });
      }
    }
  }
  return results;
}

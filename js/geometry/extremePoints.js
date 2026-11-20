// ╔══════════════════════════════════════════════════════════════╗
// ║  Geometrie – krajní body objektů (±vodorovně / ±svisle)        ║
// ╚══════════════════════════════════════════════════════════════╝
// Čistá matematika bez DOM; dialog je v dialogs/extremePoints.js.

import { bulgeToArc } from '../utils.js';

const TAU = Math.PI * 2;
export const EPS = 1e-9;

/** Normalizace úhlu do <0, 2π). */
function norm(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

/**
 * Leží úhel `a` na oblouku od `start` do `end` ve směru `ccw`?
 * @param {number} a
 * @param {number} start
 * @param {number} end
 * @param {boolean} ccw
 */
export function angleOnArc(a, start, end, ccw) {
  let sweep = ccw ? norm(end - start) : norm(start - end);
  if (sweep < EPS) sweep = TAU; // shodný start a konec = celý kruh
  const off = ccw ? norm(a - start) : norm(start - a);
  return off <= sweep + EPS;
}

/**
 * Kandidáti na krajní body oblouku: oba konce + kvadranty ležící na oblouku.
 * @returns {{x:number,y:number}[]}
 */
export function arcCandidates(cx, cy, r, start, end, ccw) {
  const pts = [
    { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) },
    { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) },
  ];
  for (const q of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) {
    if (angleOnArc(q, start, end, ccw)) {
      pts.push({ x: cx + r * Math.cos(q), y: cy + r * Math.sin(q) });
    }
  }
  return pts;
}

/**
 * Body, mezi kterými leží extrémy objektu (pro úsečky stačí konce).
 * @param {any} obj
 * @returns {{x:number,y:number}[]}
 */
export function extremeCandidates(obj) {
  switch (obj.type) {
    case 'point': return [{ x: obj.x, y: obj.y }];
    case 'line': case 'constr':
      return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    case 'rect':
      return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    case 'circle':
      return arcCandidates(obj.cx, obj.cy, obj.r, 0, 0, true);
    case 'arc':
      return arcCandidates(obj.cx, obj.cy, obj.r, obj.startAngle, obj.endAngle, obj.ccw !== false);
    case 'polyline': {
      const v = obj.vertices || [];
      const n = v.length;
      const out = v.map(p => ({ x: p.x, y: p.y }));
      const segs = obj.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const b = (obj.bulges && obj.bulges[i]) || 0;
        if (!b) continue;
        const a = bulgeToArc(v[i], v[(i + 1) % n], b);
        if (a) out.push(...arcCandidates(a.cx, a.cy, a.r, a.startAngle, a.endAngle, a.ccw));
      }
      return out;
    }
    default: return [];
  }
}

/**
 * Krajní body objektu (nebo více objektů – např. kontury z úseček
 * a oblouků) ve 4 směrech.
 * @param {any} obj  objekt nebo pole objektů
 * @returns {null | {maxX:{x:number,y:number}, minX:{x:number,y:number}, maxY:{x:number,y:number}, minY:{x:number,y:number}}}
 */
export function objectExtremes(obj) {
  const list = Array.isArray(obj) ? obj : [obj];
  const pts = list.filter(supportsExtremes).flatMap(extremeCandidates);
  if (!pts.length) return null;
  let maxX = pts[0], minX = pts[0], maxY = pts[0], minY = pts[0];
  for (const p of pts) {
    if (p.x > maxX.x) maxX = p;
    if (p.x < minX.x) minX = p;
    if (p.y > maxY.y) maxY = p;
    if (p.y < minY.y) minY = p;
  }
  return { maxX, minX, maxY, minY };
}

/** Má objekt smysl pro hledání krajních bodů? */
export function supportsExtremes(obj) {
  return !!obj && !obj.isDimension && !obj.isCoordLabel &&
    ['line', 'constr', 'circle', 'arc', 'rect', 'polyline'].includes(obj.type);
}


/**
 * Body přechodu R (oblouku) pro program, jako v kalkulačce Kužel – Přechod R:
 * tečné body seřazené od Z+ (karusel: shora, soustruh: zprava), střed a
 * ★ krajní Ø – kvadrant ve směru průměru UVNITŘ oblouku (místo pro posuvku,
 * když jsou hrany jen teoretické).
 * @param {{cx:number, cy:number, r:number, startAngle:number, endAngle:number, ccw?:boolean}} arc
 * @param {boolean} isK  karusel (průměr = vodorovná osa x), jinak soustruh (průměr = y)
 * @returns {{ start:{x:number,y:number}, end:{x:number,y:number}, center:{x:number,y:number},
 *   extremes: {x:number, y:number, kind:'max'|'min'}[] }}
 */
export function arcTransitionPoints(arc, isK) {
  const ccw = arc.ccw !== false;
  const P = a => ({ x: arc.cx + arc.r * Math.cos(a), y: arc.cy + arc.r * Math.sin(a) });
  let a = P(arc.startAngle), b = P(arc.endAngle);
  const z = p => (isK ? p.y : p.x);                    // osa Z
  const rad = p => Math.abs(isK ? p.x : p.y);          // vzdálenost od osy (poloměr)
  if (z(b) > z(a) + EPS) [a, b] = [b, a];
  const qs = isK ? [0, Math.PI] : [Math.PI / 2, 1.5 * Math.PI];
  const hi = Math.max(rad(a), rad(b)), lo = Math.min(rad(a), rad(b));
  /** @type {{x:number, y:number, kind:'max'|'min'}[]} */
  const extremes = [];
  for (const q of qs) {
    if (!angleOnArc(q, arc.startAngle, arc.endAngle, ccw)) continue;
    const p = P(q);
    if (Math.hypot(p.x - a.x, p.y - a.y) < 1e-7 || Math.hypot(p.x - b.x, p.y - b.y) < 1e-7) continue;
    if (rad(p) > hi + EPS) extremes.push({ ...p, kind: 'max' });
    else if (rad(p) < lo - EPS) extremes.push({ ...p, kind: 'min' });
  }
  return { start: a, end: b, center: { x: arc.cx, y: arc.cy }, extremes };
}

// SKICA – geometrie výkresu: Přímky (projekce, průsečík, vzdálenost, úhel) a offset objektu (Rovnoběžka).
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { bulgeToArc } from '../utils.js';
import { distToObject } from './hitDistance.js';
import { intersectCircleCircle, intersectLineCircle } from './intersections.js';

// ── Extrakce úsečkových dat z polyline segmentu ──
/**
 * Vrátí úsečkové souřadnice pro daný segment polyline.
 * @param {import('../types.js').PolylineObject} obj
 * @param {number} segIdx
 * @returns {{x1: number, y1: number, x2: number, y2: number}|null}
 */
export function getPolylineSegmentAsLine(obj, segIdx) {
  if (!obj || obj.type !== 'polyline') return null;
  const n = obj.vertices.length;
  if (segIdx < 0 || segIdx >= (obj.closed ? n : n - 1)) return null;
  const p1 = obj.vertices[segIdx];
  const p2 = obj.vertices[(segIdx + 1) % n];
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

/** Parametr projekce bodu na přímku: 0 = začátek úsečky, 1 = konec. */
export function projectionParam(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-20) return 0;
  return ((px - x1) * dx + (py - y1) * dy) / len2;
}

export function lineOffsets(x1, y1, x2, y2, d) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return [];
  const nx = -dy / len * d, ny = dx / len * d;
  return [
    { x1: x1 + nx, y1: y1 + ny, x2: x2 + nx, y2: y2 + ny },
    { x1: x1 - nx, y1: y1 - ny, x2: x2 - nx, y2: y2 - ny }
  ];
}

export function intersectInfiniteLines(l1, l2) {
  const d1x = l1.x2 - l1.x1, d1y = l1.y2 - l1.y1;
  const d2x = l2.x2 - l2.x1, d2y = l2.y2 - l2.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((l2.x1 - l1.x1) * d2y - (l2.y1 - l1.y1) * d2x) / denom;
  return { x: l1.x1 + t * d1x, y: l1.y1 + t * d1y };
}

/**
 * Projekce bodu na přímku (pata kolmice).
 * @param {number} px
 * @param {number} py
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {{x: number, y: number}}
 */
export function projectPointToLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-20) return { x: x1, y: y1 };
  const t = ((px - x1) * dx + (py - y1) * dy) / len2;
  return { x: x1 + t * dx, y: y1 + t * dy };
}

/** Kolmá vzdálenost bodu od nekonečné přímky definované dvěma body. */
export function distPointToInfiniteLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-20) return Math.hypot(px - x1, py - y1);
  return Math.abs(dx * (y1 - py) - dy * (x1 - px)) / len;
}

/** Úhel mezi dvěma úsečkami (0–180°). */
export function angleBetweenLines(l1, l2) {
  const dx1 = l1.x2 - l1.x1, dy1 = l1.y2 - l1.y1;
  const dx2 = l2.x2 - l2.x1, dy2 = l2.y2 - l2.y1;
  const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
  if (len1 < 1e-10 || len2 < 1e-10) return 0;
  const dot = dx1 * dx2 + dy1 * dy2;
  const cos = Math.max(-1, Math.min(1, dot / (len1 * len2)));
  return Math.acos(cos) * 180 / Math.PI;
}

export function offsetObject(obj, dist, side) {
  // side: 1 = vně/vpravo, -1 = uvnitř/vlevo
  const d = dist * side;
  switch (obj.type) {
    case 'line':
    case 'constr': {
      const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-10) return null;
      const nx = -dy / len * d, ny = dx / len * d;
      return {
        type: obj.type,
        x1: obj.x1 + nx, y1: obj.y1 + ny,
        x2: obj.x2 + nx, y2: obj.y2 + ny,
        name: `${obj.name || obj.type} (offset)`,
        dashed: obj.dashed,
        lineStyle: obj.lineStyle,
        finite: obj.finite,
        color: obj.color,
      };
    }
    case 'circle': {
      const newR = obj.r + d;
      if (newR < 1e-10) return null;
      return {
        type: 'circle',
        cx: obj.cx, cy: obj.cy, r: newR,
        name: `${obj.name || 'Kružnice'} (offset)`,
        color: obj.color,
      };
    }
    case 'arc': {
      const newR = obj.r + d;
      if (newR < 1e-10) return null;
      return {
        type: 'arc',
        cx: obj.cx, cy: obj.cy, r: newR,
        startAngle: obj.startAngle, endAngle: obj.endAngle,
        ccw: obj.ccw,
        name: `${obj.name || 'Oblouk'} (offset)`,
        color: obj.color,
      };
    }
    case 'rect': {
      const x1 = Math.min(obj.x1, obj.x2), y1 = Math.min(obj.y1, obj.y2);
      const x2 = Math.max(obj.x1, obj.x2), y2 = Math.max(obj.y1, obj.y2);
      const nx1 = x1 - d, ny1 = y1 - d;
      const nx2 = x2 + d, ny2 = y2 + d;
      if (nx2 <= nx1 || ny2 <= ny1) return null;
      return {
        type: 'rect',
        x1: nx1, y1: ny1, x2: nx2, y2: ny2,
        // x1..y2 je LOKÁLNÍ (nenatočený) box, natočení kolem vlastního
        // středu nese `rotation` – bez něj by z offsetu natočeného
        // obdélníku vypadl osově zarovnaný (viz getRectCorners).
        ...(obj.rotation ? { rotation: obj.rotation } : {}),
        name: `${obj.name || 'Obdélník'} (offset)`,
        color: obj.color,
      };
    }
    case 'polyline': {
      const verts = obj.vertices;
      const n = verts.length;
      const segCount = obj.closed ? n : n - 1;
      const bulgesIn = obj.bulges || [];
      // Každý segment se posune VLEVO od svého směru p1→p2 o `d`. Rovný
      // segment po normále; obloukový zůstává SOUSTŘEDNÝ a mění jen poloměr:
      // při jízdě CCW (bulge>0) je „vlevo" směrem ke středu (r−d), při CW
      // od něj (r+d). Bez toho se oblouk offsetoval tětivou, tedy zplošťoval.
      const elems = [];
      for (let i = 0; i < segCount; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % n];
        const b = bulgesIn[i] || 0;
        const sdx = p2.x - p1.x, sdy = p2.y - p1.y;
        const slen = Math.hypot(sdx, sdy);
        if (slen < 1e-10) { elems.push(null); continue; }
        const arc = b !== 0 ? bulgeToArc(p1, p2, b) : null;
        if (arc) {
          const newR = b > 0 ? arc.r - d : arc.r + d;
          // Offset „přejel" střed oblouku – segment zaniká
          if (newR < 1e-9) { elems.push(null); continue; }
          elems.push({
            kind: 'arc', bulge: b,
            cx: arc.cx, cy: arc.cy, r: newR,
            x1: arc.cx + newR * Math.cos(arc.startAngle),
            y1: arc.cy + newR * Math.sin(arc.startAngle),
            x2: arc.cx + newR * Math.cos(arc.endAngle),
            y2: arc.cy + newR * Math.sin(arc.endAngle),
          });
          continue;
        }
        const nx = -sdy / slen * d, ny = sdx / slen * d;
        elems.push({
          kind: 'line',
          x1: p1.x + nx, y1: p1.y + ny,
          x2: p2.x + nx, y2: p2.y + ny,
        });
      }
      // Trim/extend at corners
      const newVerts = [];
      const owner = []; // prvek, jehož ZAČÁTKEM daný vrchol je (−1 = koncový bod)
      for (let i = 0; i < segCount; i++) {
        const curr = elems[i];
        const prev = elems[(i - 1 + segCount) % segCount];
        if (!curr) continue;
        if (obj.closed || i > 0) {
          if (prev) {
            const inter = joinOffsetElems(prev, curr);
            if (inter) { newVerts.push({ x: inter.x, y: inter.y }); owner.push(i); continue; }
          }
        }
        newVerts.push({ x: curr.x1, y: curr.y1 });
        owner.push(i);
      }
      // Přidat koncový bod
      if (!obj.closed) {
        for (let i = segCount - 1; i >= 0; i--) {
          if (elems[i]) { newVerts.push({ x: elems[i].x2, y: elems[i].y2 }); owner.push(-1); break; }
        }
      }
      if (newVerts.length < 2) return null;
      // Bulge se dopočítá z OŘEZANÝCH konců (úhel kolem středu offsetnutého
      // oblouku) – roh mohl oblouk zkrátit i prodloužit, tětivový bulge
      // z originálu by pak neseděl.
      const normAng = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const bulgesOut = new Array(obj.closed ? newVerts.length : newVerts.length - 1).fill(0);
      for (let k = 0; k < bulgesOut.length; k++) {
        const el = elems[owner[k]];
        if (!el || el.kind !== 'arc') continue;
        const a = newVerts[k];
        const bpt = newVerts[(k + 1) % newVerts.length];
        const a1 = Math.atan2(a.y - el.cy, a.x - el.cx);
        const a2 = Math.atan2(bpt.y - el.cy, bpt.x - el.cx);
        const sweep = el.bulge > 0 ? normAng(a2 - a1) : normAng(a1 - a2);
        bulgesOut[k] = Math.tan(sweep / 4) * (el.bulge > 0 ? 1 : -1);
      }
      return {
        type: 'polyline',
        vertices: newVerts,
        bulges: bulgesOut,
        closed: obj.closed,
        name: `${obj.name || 'Kontura'} (offset)`,
        color: obj.color,
      };
    }
    default:
      return null;
  }
}

function lineLineIntersect(l1, l2) {
  const dx1 = l1.x2 - l1.x1, dy1 = l1.y2 - l1.y1;
  const dx2 = l2.x2 - l2.x1, dy2 = l2.y2 - l2.y1;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((l2.x1 - l1.x1) * dy2 - (l2.y1 - l1.y1) * dx2) / denom;
  return { x: l1.x1 + t * dx1, y: l1.y1 + t * dy1 };
}

/**
 * Vybere stranu offsetu (+1 / −1) podle toho, ke které z obou variant leží
 * kliknutý bod blíž. Díky tomu není potřeba řešit „vlevo/vpravo" zvlášť pro
 * úsečku, oblouk, obdélník i konturu – rozhoduje výsledek, ne typ.
 * @param {import('../types.js').DrawObject} obj
 * @param {number} dist  vzdálenost offsetu (kladná)
 * @param {number} wx    world X kliknutí
 * @param {number} wy    world Y kliknutí
 * @returns {1|-1|null}  null = offset nejde na žádnou stranu
 */
export function pickOffsetSide(obj, dist, wx, wy) {
  const plus = offsetObject(obj, dist, 1);
  const minus = offsetObject(obj, dist, -1);
  if (!plus && !minus) return null;
  if (!plus) return -1;
  if (!minus) return 1;
  return distToObject(plus, wx, wy) <= distToObject(minus, wx, wy) ? 1 : -1;
}

/**
 * Roh mezi dvěma sousedními offsetnutými prvky kontury (úsečka/oblouk
 * v libovolné kombinaci). Prvky se berou jako NEKONEČNÉ (přímka / celá
 * kružnice) – roh se offsetem může i prodlužovat, nejen ořezávat.
 * Z kandidátů vybere ten nejbližší naivnímu spoji (konec `prev` a začátek
 * `curr` jsou dva offsety TÉHOŽ původního vrcholu).
 * @returns {{x:number,y:number}|null}
 */
function joinOffsetElems(prev, curr) {
  if (prev.kind === 'line' && curr.kind === 'line') return lineLineIntersect(prev, curr);

  let cands;
  if (prev.kind === 'arc' && curr.kind === 'arc') {
    cands = intersectCircleCircle(
      { cx: prev.cx, cy: prev.cy, r: prev.r },
      { cx: curr.cx, cy: curr.cy, r: curr.r },
    );
  } else {
    const ln = prev.kind === 'line' ? prev : curr;
    const ar = prev.kind === 'arc' ? prev : curr;
    cands = intersectLineCircle(
      { x1: ln.x1, y1: ln.y1, x2: ln.x2, y2: ln.y2, isConstr: true },
      { cx: ar.cx, cy: ar.cy, r: ar.r },
    );
  }
  if (!cands || cands.length === 0) return null;

  const rx = (prev.x2 + curr.x1) / 2, ry = (prev.y2 + curr.y1) / 2;
  let best = null, bestD = Infinity;
  for (const c of cands) {
    const dd = (c.x - rx) * (c.x - rx) + (c.y - ry) * (c.y - ry);
    if (dd < bestD) { bestD = dd; best = c; }
  }
  return best;
}

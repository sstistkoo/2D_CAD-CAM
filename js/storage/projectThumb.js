// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Náhled výkresu (malý obrázek v seznamu výkresů)        ║
// ╚══════════════════════════════════════════════════════════════╝
// Jako miniatury ve Fusion 360: z uložených objektů se nakreslí malé SVG.
// Generuje se při zobrazení seznamu z uložených dat, takže náhled mají i výkresy
// uložené dřív. Kreslí se úsečky, oblouky, kružnice, kontury a obdélníky;
// kóty, texty, body a pomocné čáry ne. Polotovar (vrstva 3) slabší čarou.

import { bulgeToArc } from '../utils.js';

const SKIP = new Set(['text', 'point', 'constr', 'dimension']);

/** Body, kterými prochází objekt (pro ohraničení). */
function bboxPoints(o) {
  switch (o.type) {
    case 'line': return [[o.x1, o.y1], [o.x2, o.y2]];
    case 'rect': return [[o.x1, o.y1], [o.x2, o.y2]];
    case 'circle': case 'arc': return [[o.cx - o.r, o.cy - o.r], [o.cx + o.r, o.cy + o.r]];
    case 'polyline': return (o.vertices || []).map(v => [v.x, v.y]);
    default: return [];
  }
}

const drawable = o => o && !SKIP.has(o.type) && !o.isDimension && !o.isCoordLabel && !o.isAnchor;

/**
 * SVG náhled výkresu.
 * @param {{objects?: any[]}} data  uložená data výkresu
 * @param {{w?: number, h?: number}} [opt]
 * @returns {string} `<svg>…</svg>` (prázdný výkres = jen rámeček s „prázdné")
 */
export function thumbSVG(data, opt = {}) {
  const W = opt.w || 120, H = opt.h || 84, M = 6;
  const objs = (data && Array.isArray(data.objects) ? data.objects : []).filter(drawable);
  const pts = objs.flatMap(bboxPoints).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const head = `<svg class="proj-thumb" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
  if (!pts.length) return head + `<text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" class="proj-thumb-empty">prázdný</text></svg>`;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = Math.min((W - 2 * M) / Math.max(x1 - x0, 1e-6), (H - 2 * M) / Math.max(y1 - y0, 1e-6));
  const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const X = x => (ox + (x - x0) * s).toFixed(1);
  const Y = y => (H - oy - (y - y0) * s).toFixed(1);       // osa y výkresu jde nahoru
  const R = r => (r * s).toFixed(1);
  // oblouk: SVG má y dolů → směr proti hodinám ve výkresu = sweep 0
  const arcD = (cx, cy, r, a0, a1, ccw) => {
    let sweep = ccw ? a1 - a0 : a0 - a1;
    while (sweep <= 0) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    return `M${X(p0[0])} ${Y(p0[1])}A${R(r)} ${R(r)} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${X(p1[0])} ${Y(p1[1])}`;
  };
  let body = '';
  for (const o of objs) {
    let d = '';
    switch (o.type) {
      case 'line': d = `M${X(o.x1)} ${Y(o.y1)}L${X(o.x2)} ${Y(o.y2)}`; break;
      case 'rect': d = `M${X(o.x1)} ${Y(o.y1)}H${X(o.x2)}V${Y(o.y2)}H${X(o.x1)}Z`; break;
      case 'circle':
        body += `<circle cx="${X(o.cx)}" cy="${Y(o.cy)}" r="${R(o.r)}" class="${o.layer === 3 ? 'pt-stock' : 'pt-line'}"/>`;
        continue;
      case 'arc': d = arcD(o.cx, o.cy, o.r, o.startAngle, o.endAngle, o.ccw !== false); break;
      case 'polyline': {
        const v = o.vertices || [], n = v.length;
        if (n < 2) continue;
        d = `M${X(v[0].x)} ${Y(v[0].y)}`;
        const segs = o.closed ? n : n - 1;
        for (let i = 0; i < segs; i++) {
          const a = v[i], b = v[(i + 1) % n], bu = (o.bulges && o.bulges[i]) || 0;
          const arc = bu ? bulgeToArc(a, b, bu) : null;
          if (arc) {
            const sw = 4 * Math.atan(Math.abs(bu));
            d += `A${R(arc.r)} ${R(arc.r)} 0 ${sw > Math.PI ? 1 : 0} ${arc.ccw ? 0 : 1} ${X(b.x)} ${Y(b.y)}`;
          } else d += `L${X(b.x)} ${Y(b.y)}`;
        }
        break;
      }
      default: continue;
    }
    body += `<path d="${d}" class="${o.layer === 3 ? 'pt-stock' : 'pt-line'}"/>`;
  }
  return head + body + '</svg>';
}

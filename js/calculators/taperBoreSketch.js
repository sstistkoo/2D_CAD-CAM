// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel s tolerancí: klikací náčrt řezu               ║
// ╚══════════════════════════════════════════════════════════════╝
// Podélný řez díry (nebo čep), kuželovitost zveličená. Kóty jsou klikací
// (data-edit): D, tol, ref, L, C, swap, pt:<index měřicího místa>.
// Neznámé hodnoty se kreslí jako „?" – i prázdný náčrt jde vyplnit klikáním.

import { f3 } from './taperBoreMath.js';

const TOP = 60, BOT = 316, CX = 170, OUTER = 126, BASE = 58;

const ln = (x1, y1, x2, y2, cls) =>
  '<line class="' + cls + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
const txt = (x, y, s, cls, anchor = 'middle') =>
  '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' + s + '</text>';

const TIPS = {
  D: 'Zadaný průměr z výkresu', tol: 'Tolerance – ISO (H7, h6…) nebo úchylky +0.046 / 0',
  ref: 'Hloubka, ve které platí zadaný průměr (od spodu / od vrchu)', L: 'Celková délka kužele',
  C: 'Kuželovitost – 1:x, úhel α, 2α nebo C', swap: 'Prohodit, na které straně je větší průměr',
};

/** Klikací popisek; anchor 'start' nebo 'middle'; rot = otočení kolem (x, y). */
function lbl(x, y, s, key, cls, { anchor = 'middle', rot = 0 } = {}) {
  const w = Math.max(28, s.length * 6.8 + 10), h = 19;
  const rx = anchor === 'start' ? x - 4 : x - w / 2;
  const tr = rot ? ' transform="rotate(' + rot + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : '';
  const tip = TIPS[key] || (key.startsWith('pt:') ? 'Měřicí místo – upravit hloubku / stranu nebo smazat' : '');
  return '<g class="sk-edit" data-edit="' + key + '"' + tr + '>' + (tip ? '<title>' + tip + '</title>' : '') +
    '<rect class="sk-hit" x="' + rx.toFixed(1) + '" y="' + (y - 13.5).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="5"/>' +
    txt(x, y, s, cls, anchor) + '</g>';
}
const width = s => Math.max(28, s.length * 6.8 + 10);

function arrowV(x, ya, yb) {
  const k = ya < yb ? 1 : -1;
  return ln(x, ya, x, yb, 'cs-dim') +
    '<path class="cs-arrow-y" d="M' + x + ' ' + ya + ' l-3 ' + 7 * k + ' h6z"/>' +
    '<path class="cs-arrow-y" d="M' + x + ' ' + yb + ' l-3 ' + -7 * k + ' h6z"/>';
}

/**
 * @param {SVGElement} svg
 * @param {object} m  model z taperBore.js
 * @returns {{zFromY:(y:number)=>number|null, L:number}}
 */
export function drawBoreSketch(svg, m) {
  const L = m.L;
  const y = z => BOT - (z / L) * (BOT - TOP);
  const yA = y(0), yB = y(L);
  const dir = m.bigSide === 'A' ? -1 : 1;
  const slope = m.C === 0 ? 0 : 1;
  const hw = z => BASE + slope * dir * ((z - m.zRef) / L) * 22;
  const n = m.names;
  const shaft = m.shaft;

  let s = '<defs><pattern id="tbHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="7" class="tb-hatch"/></pattern></defs>';
  // Plocha pro klik „přidat měřicí místo" (uvnitř díry / na čepu)
  s += '<rect class="tb-add-zone" x="' + (CX - OUTER) + '" y="' + yB + '" width="' + 2 * OUTER + '" height="' + (yA - yB) + '"/>';
  if (shaft) {
    s += '<path class="tb-mat" d="M' + (CX - hw(0)) + ' ' + yA + ' L' + (CX - hw(L)) + ' ' + yB + ' L' + (CX + hw(L)) + ' ' + yB + ' L' + (CX + hw(0)) + ' ' + yA + 'Z"/>';
  } else {
    s += '<path class="tb-mat" d="M' + (CX - OUTER) + ' ' + yA + ' L' + (CX - hw(0)) + ' ' + yA + ' L' + (CX - hw(L)) + ' ' + yB + ' L' + (CX - OUTER) + ' ' + yB + 'Z"/>';
    s += '<path class="tb-mat" d="M' + (CX + OUTER) + ' ' + yA + ' L' + (CX + hw(0)) + ' ' + yA + ' L' + (CX + hw(L)) + ' ' + yB + ' L' + (CX + OUTER) + ' ' + yB + 'Z"/>';
  }
  s += ln(CX, yB - 8, CX, yA + 8, 'cs-axis');

  // Horní řádek: kuželovitost + prohození větší/menší
  s += lbl(110, 18, m.taperTxt, 'C', m.known.C ? 'sk-val' : 'sk-empty');
  s += lbl(272, 18, '⇅ větší ' + (m.bigSide === 'A' ? n.bigA : n.bigB), 'swap', 'sk-btn');
  // Strany + průměry na hranách
  s += txt(CX, yB - 10, n.B + (m.endB !== null ? ' Ø' + f3(m.endB) : ''), 'cs-txt-s');
  s += txt(CX, yA + 20, n.A + (m.endA !== null ? ' Ø' + f3(m.endA) : ''), 'cs-txt-s');

  // Délka (vpravo)
  const xL = shaft ? CX + BASE + 62 : CX + OUTER + 12;
  const wMax = Math.max(hw(0), hw(L));
  s += ln(CX + wMax + 2, yA, xL + 4, yA, 'cs-ext') + ln(CX + wMax + 2, yB, xL + 4, yB, 'cs-ext');
  s += arrowV(xL, yB, yA);
  s += lbl(xL + 12, (yA + yB) / 2, 'L ' + (m.known.L ? f3(L).replace(/\.?0+$/, '') : '?'), 'L', m.known.L ? 'sk-val' : 'sk-empty', { rot: -90 });

  // Hloubka zadaného průměru (vlevo)
  const zr = m.zRef, yr = y(zr);
  const xR = shaft ? CX - BASE - 52 : CX - OUTER - 12;
  const yEdge = m.refSide === 'A' ? yA : yB;
  s += ln(xR - 4, yr, CX - hw(zr), yr, 'cs-ext');
  if (Math.abs(yr - yEdge) > 6) s += arrowV(xR, yEdge, yr);
  const refMid = Math.abs(yr - yEdge) > 40 ? (yr + yEdge) / 2 : yEdge + (m.refSide === 'A' ? -22 : 22);
  s += lbl(xR - 12, refMid, 'hl. ' + (m.known.ref ? m.refDepth : '?'), 'ref', m.known.ref ? 'sk-val' : 'sk-empty', { rot: -90 });
  s += ln(CX - hw(zr), yr, CX + hw(zr), yr, 'tb-ref');

  // Popisky: zadaný Ø + měřicí místa, bez překryvu
  const items = m.rows.map(r => ({
    yy: y(r.z), z: r.z, key: 'pt:' + r.pt, cls: 'tb-pt-t',
    t: r.no + ') ' + (r.nom !== null ? 'Ø' + f3(r.nom) : 'Ø ?') + ' hl.' + r.depth + (r.side === 'A' ? '↑' : '↓'),
  }));
  items.push({ yy: yr, z: zr, ref: true });
  items.sort((a, b) => a.yy - b.yy);
  const gap = 19, yMin = yB + 18, yMax = yA - 6;
  let prev = -1e9;
  items.forEach(it => { it.ly = Math.max(it.yy + 5, prev + gap, yMin); prev = it.ly; });
  if (prev > yMax) {
    const over = prev - yMax;
    items.forEach(it => { it.ly -= over; });
    items.forEach((it, k) => { it.ly = Math.max(it.ly, yMin + k * gap); });
  }
  const lx = shaft ? CX - 40 : CX - Math.min(hw(0), hw(L)) + 14;
  items.forEach(it => {
    const w = hw(it.z);
    if (it.ref) {
      s += ln(CX - w + 2, it.yy, lx - 4, it.ly - 4, 'tb-ref-lead');
      const dTxt = m.known.D ? 'Ø' + f3(m.D).replace(/\.?0+$/, '') : 'Ø ?';
      s += lbl(lx, it.ly, dTxt, 'D', m.known.D ? 'tb-ref-t' : 'sk-empty', { anchor: 'start' });
      s += lbl(lx + width(dTxt) + 2, it.ly, m.tolTxt, 'tol', m.tolTxt === 'tol ?' ? 'sk-empty' : 'tb-ref-t', { anchor: 'start' });
    } else {
      s += ln(CX - w, it.yy, CX + w, it.yy, 'tb-pt-l');
      s += ln(CX - w + 2, it.yy, lx - 4, it.ly - 4, 'tb-pt-l');
      s += lbl(lx, it.ly, it.t, it.key, it.cls, { anchor: 'start' });
    }
  });

  // Vysvětlivky
  const lg = (yy, t) => '<text class="sk-legend" x="170" y="' + yy + '" text-anchor="middle">' + t + '</text>';
  s += lg(354, '<tspan class="sk-lk">\u00D8</tspan> zadaný průměr \u00B7 <tspan class="sk-lk">tol</tspan> jeho tolerance');
  s += lg(370, '<tspan class="sk-lk">hl.</tspan> hloubka zadaného \u00D8 \u00B7 <tspan class="sk-lk">L</tspan> délka kužele');
  s += lg(386, '<tspan class="sk-lk">1) 2)</tspan> měřicí místa: <tspan class="sk-lk">\u2193</tspan> ' + n.b + ', <tspan class="sk-lk">\u2191</tspan> ' + n.a);
  svg.innerHTML = s;
  return {
    L,
    zFromY: yy => (yy < yB - 2 || yy > yA + 2) ? null : Math.min(L, Math.max(0, (BOT - yy) / (BOT - TOP) * L)),
  };
}

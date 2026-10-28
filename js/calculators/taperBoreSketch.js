// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel: klikací náčrt řezu (díra i čep)              ║
// ╚══════════════════════════════════════════════════════════════╝
// Podélný řez, kuželovitost zveličená. Kóty jsou klikací (data-edit):
// D, d, L, C (1:x), Ca (úhel α), swap, refD, ref, refAdd, pt:<index měřicího místa>.
// Neznámé hodnoty se kreslí jako „?" – i prázdný náčrt jde vyplnit klikáním.

import { f3 } from './taperBoreMath.js';

const TOP = 84, BOT = 322, CX = 170, OUTER = 126, BASE = 58;

const TIPS = {
  D: 'D – velký průměr kužele (na hraně)', d: 'd – malý průměr kužele (na hraně)', L: 'Délka kužele',
  C: 'Kuželovitost 1:x – na x mm délky se Ø změní o 1 mm', Ca: 'Úhel α – sklon povrchu k ose (= náklon suportu)',
  swap: 'Prohodit, na které straně je větší průměr', refD: 'Průměr z výkresu, který platí v určité hloubce',
  ref: 'Hloubka zadaného průměru (od spodu / od vrchu)', refAdd: 'Výkres udává průměr v hloubce – zadat ho',
};

const ln = (x1, y1, x2, y2, cls) =>
  '<line class="' + cls + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
const txt = (x, y, s, cls, anchor = 'middle') =>
  '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' + s + '</text>';
const width = s => Math.max(28, s.length * 6.8 + 10);

/** Klikací popisek; anchor 'start' nebo 'middle'; rot = otočení kolem (x, y). */
function lbl(x, y, s, key, cls, { anchor = 'middle', rot = 0 } = {}) {
  const w = width(s), h = 19;
  const rx = anchor === 'start' ? x - 4 : anchor === 'end' ? x - w + 4 : x - w / 2;
  const tr = rot ? ' transform="rotate(' + rot + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : '';
  const tip = TIPS[key] || (key.startsWith('pt:') ? 'Měřicí místo – upravit hloubku / stranu nebo smazat' : '');
  return '<g class="sk-edit" data-edit="' + key + '"' + tr + '>' + (tip ? '<title>' + tip + '</title>' : '') +
    '<rect class="sk-hit" x="' + rx.toFixed(1) + '" y="' + (y - 13.5).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="5"/>' +
    txt(x, y, s, cls, anchor) + '</g>';
}

function arrowV(x, ya, yb) {
  const k = ya < yb ? 1 : -1;
  return ln(x, ya, x, yb, 'cs-dim') +
    '<path class="cs-arrow-y" d="M' + x + ' ' + ya + ' l-3 ' + 7 * k + ' h6z"/>' +
    '<path class="cs-arrow-y" d="M' + x + ' ' + yb + ' l-3 ' + -7 * k + ' h6z"/>';
}

const CLS = { val: 'sk-val', calc: 'sk-calc', empty: 'sk-empty' };

/**
 * @param {SVGElement} svg
 * @param {object} m  model z taperBore.js:
 *   L (kreslená délka), C, bigSide, names, shaft,
 *   v: {D, d, L} hodnoty, st: {D, d, L, C} stav 'val'|'calc'|'empty',
 *   taperTxt, tolTxt, tolEmpty, ref: null | {dia, depth, depthKnown, side, z}, rows
 * @returns {{zFromY:(y:number)=>number|null, L:number}}
 */
export function drawBoreSketch(svg, m) {
  const L = m.L;
  const y = z => BOT - (z / L) * (BOT - TOP);
  const yA = y(0), yB = y(L);
  const dir = m.bigSide === 'A' ? -1 : 1;               // Ø roste směrem k větší straně
  const slope = m.C === 0 ? 0 : 1;
  const hw = z => BASE + slope * dir * ((z - L / 2) / L) * 34;
  const n = m.names;
  const shaft = m.shaft;

  let s = '<defs><pattern id="tbHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="7" class="tb-hatch"/></pattern></defs>';
  s += '<rect class="tb-add-zone" x="' + (CX - OUTER) + '" y="' + yB + '" width="' + 2 * OUTER + '" height="' + (yA - yB) + '"/>';
  if (shaft) {
    s += '<path class="tb-mat" d="M' + (CX - hw(0)) + ' ' + yA + ' L' + (CX - hw(L)) + ' ' + yB + ' L' + (CX + hw(L)) + ' ' + yB + ' L' + (CX + hw(0)) + ' ' + yA + 'Z"/>';
  } else {
    s += '<path class="tb-mat" d="M' + (CX - OUTER) + ' ' + yA + ' L' + (CX - hw(0)) + ' ' + yA + ' L' + (CX - hw(L)) + ' ' + yB + ' L' + (CX - OUTER) + ' ' + yB + 'Z"/>';
    s += '<path class="tb-mat" d="M' + (CX + OUTER) + ' ' + yA + ' L' + (CX + hw(0)) + ' ' + yA + ' L' + (CX + hw(L)) + ' ' + yB + ' L' + (CX + OUTER) + ' ' + yB + 'Z"/>';
  }
  s += ln(CX, yB - 8, CX, yA + 8, 'cs-axis');

  // Horní řádky: kuželovitost, prohození, tolerance, „+ Ø v hloubce"
  s += lbl(92, 16, m.taperTxt, 'C', CLS[m.stForm('ratio')]);
  s += lbl(266, 16, '⇅ větší ' + (m.bigSide === 'A' ? n.bigA : n.bigB), 'swap', 'sk-btn');
  if (!m.ref) s += lbl(266, 42, '+ Ø v hloubce', 'refAdd', 'sk-btn');

  // Hrany: velký D a malý d
  const keyOf = side => side === m.bigSide ? 'D' : 'd';
  const edge = side => {
    const key = keyOf(side), v = m.v[key];
    return n[side] + ': ' + (key === 'D' ? 'D velký Ø ' : 'd malý Ø ') + (v !== null ? f3(v) : '?');
  };
  s += lbl(CX, yB - 12, edge('B'), keyOf('B'), CLS[m.st[keyOf('B')]]);
  s += lbl(CX, yA + 22, edge('A'), keyOf('A'), CLS[m.st[keyOf('A')]]);

  // Délka (vpravo)
  const xL = shaft ? CX + BASE + 62 : CX + OUTER + 12;
  const wMax = Math.max(hw(0), hw(L));
  s += ln(CX + wMax + 2, yA, xL + 4, yA, 'cs-ext') + ln(CX + wMax + 2, yB, xL + 4, yB, 'cs-ext');
  s += arrowV(xL, yB, yA);
  s += lbl(xL + 12, (yA + yB) / 2, 'délka L ' + (m.v.L !== null ? f3(m.v.L).replace(/\.?0+$/, '') : '?'), 'L', CLS[m.st.L], { rot: -90 });

  // Popisky v díře: zadaný Ø (je-li) + měřicí místa, bez překryvu
  const items = m.rows.map(r => ({
    yy: y(r.z), z: r.z, key: 'pt:' + r.pt, cls: 'tb-pt-t',
    t: r.no + ') ' + (r.nom !== null ? 'Ø' + f3(r.nom) : 'Ø ?') + ' hl.' + r.depth + (r.side === 'A' ? '↑' : '↓'),
  }));
  if (m.ref) {
    const zr = m.ref.z, yr = y(zr);
    const xR = shaft ? CX - BASE - 52 : CX - OUTER - 12;
    const yEdge = m.ref.side === 'A' ? yA : yB;
    s += ln(xR - 4, yr, CX - hw(zr), yr, 'cs-ext');
    if (Math.abs(yr - yEdge) > 6) s += arrowV(xR, yEdge, yr);
    const refMid = Math.abs(yr - yEdge) > 110 ? (yr + yEdge) / 2 : yEdge + (m.ref.side === 'A' ? -52 : 52);
    s += lbl(xR - 12, refMid, 'hloubka Ø ' + (m.ref.depthKnown ? m.ref.depth : '?'), 'ref', m.ref.depthKnown ? 'sk-val' : 'sk-empty', { rot: -90 });
    s += ln(CX - hw(zr), yr, CX + hw(zr), yr, 'tb-ref');
    items.push({ yy: yr, z: zr, ref: true });
  }
  items.sort((a, b) => a.yy - b.yy);
  const gap = 19, yMin = yB + 16, yMax = yA - 6;
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
      s += lbl(lx, it.ly, 'zadaný Ø' + f3(m.ref.dia).replace(/\.?0+$/, ''), 'refD', 'tb-ref-t', { anchor: 'start' });
    } else {
      s += ln(CX - w, it.yy, CX + w, it.yy, 'tb-pt-l');
      s += ln(CX - w + 2, it.yy, lx - 4, it.ly - 4, 'tb-pt-l');
      s += lbl(lx, it.ly, it.t, it.key, it.cls, { anchor: 'start' });
    }
  });

  // Úhel α: svislá pomocná čára a oblouk ke stěně (vpravo, mimo popisky)
  {
    // místo, kde nepřekáží popiskům měřicích míst a zadaného Ø
    const busy = items.flatMap(it => [it.ly, it.yy]);
    let zm = L * 0.5, best = -1;
    [0.5, 0.42, 0.58, 0.34, 0.66, 0.28].forEach(f => {
      const ly = y(L * f) - 60;
      const dmin = busy.length ? Math.min(...busy.map(b => Math.abs(b - ly))) : 999;
      if (dmin > best + 2) { best = dmin; zm = L * f; }
    });
    const Wx = CX + hw(zm), Wy = y(zm);
    const Ux = CX + hw(zm + L * 0.3), Uy = y(zm + L * 0.3);
    const R = 64, a1 = -Math.PI / 2, a2 = Math.atan2(Uy - Wy, Ux - Wx);
    s += ln(Wx, Wy, Wx, Wy - R - 14, 'cs-ext');
    if (slope) {
      s += '<path class="cs-arc tb-alpha-arc" d="M' + Wx.toFixed(1) + ' ' + (Wy - R).toFixed(1) + ' A' + R + ' ' + R + ' 0 0 ' + (a2 > a1 ? 1 : 0) + ' ' +
        (Wx + R * Math.cos(a2)).toFixed(1) + ' ' + (Wy + R * Math.sin(a2)).toFixed(1) + '"/>';
    }
    s += lbl(Wx - 10, Wy - R + 4, m.aTxt, 'Ca', CLS[m.stForm('half')], { anchor: 'end' });
  }

  const lg = (yy, t) => '<text class="sk-legend" x="170" y="' + yy + '" text-anchor="middle">' + t + '</text>';
  s += lg(366, 'bílá = zadáno · <tspan class="sk-lk-calc">žlutá = dopočítáno</tspan> · ? = chybí');
  s += lg(381, '<tspan class="sk-lk">1) 2)</tspan> měřicí místa: <tspan class="sk-lk">↓</tspan> ' + n.b + ', <tspan class="sk-lk">↑</tspan> ' + n.a);
  svg.innerHTML = s;
  return {
    L,
    zFromY: yy => (yy < yB - 2 || yy > yA + 2) ? null : Math.min(L, Math.max(0, (BOT - yy) / (BOT - TOP) * L)),
  };
}

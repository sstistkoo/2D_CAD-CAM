// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel: klikací náčrt (D, d, L, α, 1:x, 2α)          ║
// ╚══════════════════════════════════════════════════════════════╝
// Schematický náčrt komolého kužele. Každá kóta je klikací skupina
// s data-edit="<id pole>"; zadávání řeší svgInlineEdit.js.

/** Nápovědy ke kótám (tooltip). */
const TIPS = {
  D: 'D – velký průměr kužele', d: 'd – malý průměr kužele', L: 'L – délka kužele (mezi D a d)',
  a: 'α – polovrcholový úhel: sklon povrchu k ose (= náklon suportu)', K: '1 : x – kuželovitost: na x mm délky se Ø změní o 1 mm',
  a2: '2α – vrcholový úhel kužele (dvojnásobek α)',
};

/** Klikací popisek: průhledná plocha pro prst + text. */
export function editLabel(x, y, txt, key, cls, rot = 0) {
  const w = Math.max(30, txt.length * 7 + 12), h = 20;
  const tr = rot ? ' transform="rotate(' + rot + ' ' + x + ' ' + y + ')"' : '';
  return '<g class="sk-edit" data-edit="' + key + '"' + tr + '>' + (TIPS[key] ? '<title>' + TIPS[key] + ' – klepni a zadej</title>' : '') +
    '<rect class="sk-hit" x="' + (x - w / 2).toFixed(1) + '" y="' + (y - 14) + '" width="' + w + '" height="' + h + '" rx="5"/>' +
    '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle">' + txt + '</text></g>';
}

const ln = (x1, y1, x2, y2, cls) =>
  '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
const arrowsH = (x1, x2, y) => ln(x1, y, x2, y, 'cs-dim') +
  '<path class="cs-arrow-y" d="M' + x1 + ' ' + y + ' l7 -3 v6z"/><path class="cs-arrow-y" d="M' + x2 + ' ' + y + ' l-7 -3 v6z"/>';
const arrowsV = (x, y1, y2) => ln(x, y1, x, y2, 'cs-dim') +
  '<path class="cs-arrow-y" d="M' + x + ' ' + y1 + ' l-3 7 h6z"/><path class="cs-arrow-y" d="M' + x + ' ' + y2 + ' l-3 -7 h6z"/>';

/**
 * @param {SVGElement} svg
 * @param {Record<string, number|null>} v   hodnoty D, d, L, a, K, a2 (null = prázdné)
 * @param {Set<string>} edited  zadané ručně (ostatní jsou dopočítané)
 */
export function drawBasicTaper(svg, v, edited) {
  const fmt = (x, dec = 3) => parseFloat(x.toFixed(dec)).toString();
  const cls = id => v[id] === null || !Number.isFinite(v[id]) ? 'sk-empty' : edited.has(id) ? 'sk-val' : 'sk-calc';
  const val = (id, pre, unit = '', dec = 3) =>
    pre + (v[id] === null || !Number.isFinite(v[id]) ? '?' : fmt(v[id], dec) + unit);

  const cy = 104, x0 = 70, x1 = 262, hD = 58;
  let hd = 32;
  if (v.D > 0 && v.d >= 0 && v.d < v.D) hd = Math.max(16, Math.min(50, hD * v.d / v.D));
  else if (v.a > 0) hd = Math.max(16, hD - Math.min(42, 6 + v.a * 4));
  const yT = cy - hD, yB = cy + hD, yt = cy - hd, yb = cy + hd;

  let s = '<path class="cs-body" d="M' + x0 + ' ' + yT + ' L' + x1 + ' ' + yt + ' L' + x1 + ' ' + yb + ' L' + x0 + ' ' + yB + 'Z"/>';
  s += ln(x0 - 14, cy, x1 + 14, cy, 'cs-axis');

  // D (vlevo)
  s += ln(x0 - 30, yT, x0 - 2, yT, 'cs-ext') + ln(x0 - 30, yB, x0 - 2, yB, 'cs-ext');
  s += arrowsV(x0 - 24, yT, yB);
  s += editLabel(x0 - 38, cy, val('D', 'D '), 'D', cls('D'), -90);
  // d (vpravo)
  s += ln(x1 + 2, yt, x1 + 30, yt, 'cs-ext') + ln(x1 + 2, yb, x1 + 30, yb, 'cs-ext');
  s += arrowsV(x1 + 24, yt, yb);
  s += editLabel(x1 + 40, cy, val('d', 'd '), 'd', cls('d'), -90);
  // L (dole)
  s += ln(x0, yB + 2, x0, yB + 26, 'cs-ext') + ln(x1, yb + 2, x1, yB + 26, 'cs-ext');
  s += arrowsH(x0, x1, yB + 20);
  s += editLabel((x0 + x1) / 2, yB + 38, val('L', 'L '), 'L', cls('L'));
  // α u velkého průměru: vodorovná pomocná čára a oblouk ke sklonu
  const ang = Math.atan2(yt - yT, x1 - x0);
  const R = 46;
  s += ln(x0, yT, x0 + R + 26, yT, 'cs-ext');
  s += '<path class="cs-arc" d="M' + (x0 + R) + ' ' + yT + ' A' + R + ' ' + R + ' 0 0 1 ' +
    (x0 + R * Math.cos(ang)).toFixed(1) + ' ' + (yT + R * Math.sin(ang)).toFixed(1) + '"/>';
  s += editLabel(x0 + 98, yT - 10, val('a', 'α ', '°', 4), 'a', cls('a'));
  // 1:x a 2α (nahoře)
  s += editLabel(92, 18, val('K', '1 : ', '', 2), 'K', cls('K'));
  s += editLabel(240, 18, val('a2', '2α ', '°', 4), 'a2', cls('a2'));
  // Vysvětlivky
  s += '<text class="sk-legend" x="170" y="226" text-anchor="middle"><tspan class="sk-lk">D</tspan> velký \u00D8 \u00B7 <tspan class="sk-lk">d</tspan> malý \u00D8 \u00B7 <tspan class="sk-lk">L</tspan> délka kužele</text>';
  s += '<text class="sk-legend" x="170" y="242" text-anchor="middle"><tspan class="sk-lk">\u03B1</tspan> sklon k ose \u00B7 <tspan class="sk-lk">2\u03B1</tspan> vrchol. úhel \u00B7 <tspan class="sk-lk">1:x</tspan> kuželovitost</text>';
  s += '<text class="sk-legend sk-legend-k" x="170" y="258" text-anchor="middle">bílá = zadáno \u00B7 <tspan class="sk-lk-calc">žlutá = dopočítáno</tspan> \u00B7 ? = chybí</text>';
  svg.innerHTML = s;
}

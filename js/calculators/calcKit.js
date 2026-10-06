// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Společné pomůcky kalkulaček (pole, náčrt, výsledky) ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Používají Vrták, Korekce rε, Roztečná kružnice, Měření… Styly jsou
// v css/style.css pod „Kalkulačky: náčrt + výsledek" (.calc-out*, .calc-svg .cs-*).

import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Číslo na nejvýš `dec` desetinných míst bez koncových nul. */
export function fmt(x, dec = 3) {
  const s = parseFloat(x.toFixed(dec));
  return (Object.is(s, -0) ? 0 : s).toString();
}

/** Hodnota pole: null = prázdné, NaN = neplatný zápis, jinak číslo (i výraz, čárka). */
export function numVal(input) {
  if (input.value.trim() === '') return null;
  const x = safeEvalMath(input.value);
  return Number.isFinite(x) ? x : NaN;
}

/** HTML číselného pole (type=text kvůli výrazům a desetinné čárce). */
export function numField(id, label, unit, placeholder, extra = '') {
  return '<label class="cnc-field"><span>' + label + (unit ? ' <small>' + unit + '</small>' : '') + '</span>' +
    '<input type="text" inputmode="decimal" data-id="' + id + '" placeholder="' + placeholder + '"' + extra + '></label>';
}

/** HTML výběru v poli. options: [[value, text], …] */
export function selectField(id, label, options) {
  return '<label class="cnc-field"><span>' + label + '</span><select data-id="' + id + '">' +
    options.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select></label>';
}

/** HTML přepínače záložek. tabs: [[id, text], …], první je aktivní. */
export function tabsHtml(tabs) {
  return '<div class="calc-tabs" role="tablist">' + tabs.map(([id, t], i) =>
    '<button type="button" class="calc-tab' + (i === 0 ? ' calc-tab-active' : '') + '" data-tab="' + id + '">' + t + '</button>').join('') + '</div>';
}

/** Napojí záložky: přepne třídu a zavolá onChange(id). */
export function wireTabs(root, onChange) {
  const btns = root.querySelectorAll('.calc-tab');
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.toggle('calc-tab-active', x === b));
    onChange(b.dataset.tab);
  }));
}

/** Řádek tlačítek s rychlými hodnotami (např. rε). Klik zapíše hodnotu a pošle input. */
export function quickButtonsHtml(values, unit = '') {
  return '<div class="rough-radius-row">' + values.map(v =>
    '<button type="button" class="rough-r-btn tol-g-btn" data-v="' + v + '">' + v + unit + '</button>').join('') + '</div>';
}
export function wireQuickButtons(root, input) {
  const btns = root.querySelectorAll('.rough-r-btn');
  const mark = () => btns.forEach(b => b.classList.toggle('tol-g-active', b.dataset.v === input.value.trim()));
  btns.forEach(b => b.addEventListener('click', () => {
    input.value = b.dataset.v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }));
  input.addEventListener('input', mark);
  mark();
}

// ── Výsledek ──
export const outRow = (label, value) => '<div class="calc-out-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
export const outWarn = (msg) => '<div class="calc-out-warn">' + msg + '</div>';
export const outHint = (msg) => '<div class="calc-out-hint">' + msg + '</div>';
export const outMain = (main, sub) => '<div class="calc-out-main">' + main + '</div>' + (sub ? '<div class="calc-out-sub">' + sub + '</div>' : '');
export const outFormula = (txt) => '<div class="calc-out-formula">' + txt + '</div>';

/** Zkopíruje text do schránky s hláškou (i když schránka není dostupná). */
export function copyText(text) {
  if (!text) { showToast('Není co kopírovat'); return; }
  if (!navigator.clipboard?.writeText) { showToast('Schránka není v tomto prohlížeči dostupná'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('Zkopírováno'), () => showToast('Kopírování se nezdařilo'));
}

// ── SVG náčrt ──
export function svgEl(tag, attrs, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

export function svgClear(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

/**
 * Šipka kóty jako trojúhelník – marker s orient="auto-start-reverse" starší
 * Safari neumí (šipka na začátku by mířila opačně). Hrot v (x, y), směr (dx, dy).
 */
export function svgArrow(x, y, dx, dy, cls) {
  const bx = x - dx * 7, by = y - dy * 7;
  return svgEl('polygon', { points: x + ',' + y + ' ' + (bx - dy * 3) + ',' + (by + dx * 3) + ' ' + (bx + dy * 3) + ',' + (by - dx * 3), class: cls });
}

/** Vodorovná kóta x1→x2 ve výšce y; úzká kóta má popisek vpravo. */
export function svgDimH(g, x1, x2, y, label, cls = 'cs-dim', arrowCls = 'cs-arrow-y') {
  g.appendChild(svgEl('line', { x1, y1: y, x2, y2: y, class: cls }));
  g.appendChild(svgArrow(x1, y, -1, 0, arrowCls));
  g.appendChild(svgArrow(x2, y, 1, 0, arrowCls));
  const narrow = x2 - x1 < 70;
  g.appendChild(svgEl('text', {
    x: narrow ? x2 + 6 : (x1 + x2) / 2, y: narrow ? y + 4 : y - 4,
    class: 'cs-txt', 'text-anchor': narrow ? 'start' : 'middle',
  }, label));
}

/** Svislá kóta y1→y2 na x; popisek otočený vpravo od ní. */
export function svgDimV(g, x, y1, y2, label, cls = 'cs-dim', arrowCls = 'cs-arrow-y') {
  g.appendChild(svgEl('line', { x1: x, y1, x2: x, y2, class: cls }));
  g.appendChild(svgArrow(x, Math.min(y1, y2), 0, -1, arrowCls));
  g.appendChild(svgArrow(x, Math.max(y1, y2), 0, 1, arrowCls));
  const ty = (y1 + y2) / 2;
  g.appendChild(svgEl('text', { x: x + 16, y: ty, class: 'cs-txt', 'text-anchor': 'middle', transform: 'rotate(-90 ' + (x + 16) + ' ' + ty + ')' }, label));
}

/**
 * Měřítko „světových" bodů (u, v) do SVG: vejde se do rámečku s okrajem,
 * v roste nahoru. pts: [[u, v], …] – co musí být vidět.
 * @returns {(u:number, v:number) => [number, number]} + .scale
 */
export function fitView(pts, width, height, pad = 18) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [u, v] of pts) {
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  if (!Number.isFinite(u0)) { u0 = -1; u1 = 1; v0 = -1; v1 = 1; }
  const s = Math.min((width - 2 * pad) / Math.max(u1 - u0, 1e-9), (height - 2 * pad) / Math.max(v1 - v0, 1e-9));
  const ox = (width - s * (u1 - u0)) / 2 - s * u0;
  const oy = (height + s * (v1 - v0)) / 2 + s * v0;
  const map = (u, v) => [ox + s * u, oy - s * v];
  map.scale = s;
  return map;
}

/** SVG polyline/polygon body z bodů ve světových souřadnicích. */
export function svgPoints(map, pts) {
  return pts.map(([u, v]) => map(u, v).map(n => n.toFixed(2)).join(',')).join(' ');
}

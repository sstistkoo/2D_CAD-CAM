// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel: klikací detail tvarového přechodu R             ║
// ╚══════════════════════════════════════════════════════════════╝
// Detail jedné hrany (vrch / spodek) ve skutečných úhlech: površka kužele,
// rádius, čelo pod zadaným úhlem, teoretický průsečík. Klikací (data-edit):
// R, face (otočit R = směr čela), ang (úhel čela),
// corner (Ø průsečíku), start (Ø začátku R na čele), zTop (Z čela vrchu).
// Neznámé hodnoty jako „?" – detail jde vyplnit jen klikáním.

import { filletAt, coneDir, faceDir } from './taperFilletMath.js';
import { f3 } from './taperBoreMath.js';

const W = 340, H = 300;
const t3 = x => f3(x).replace(/\.?0+$/, '') || '0';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const TIPS = {
  R: 'Rádius přechodu', face: 'Otočit rádius na druhou stranu čela (čelo k ose ↔ k většímu Ø)',
  ang: 'Úhel čela od roviny kolmé k ose (0 = kolmo, + k vrchu, − ke spodku)',
  corner: 'Průsečík – ostrá hrana kužele s čelem (= Ø kužele na hraně)',
  start: 'Začátek rádiusu na čele – Ø, kde R z čela odbočí', zTop: 'Z čela vrchu – výsledky pak v souřadnicích Z',
};

const lw = s => Math.max(28, s.length * 6.8 + 10);
function lbl(x, y, s, key, cls, anchor = 'middle') {
  const w = lw(s), h = 19;
  // celý popisek uvnitř náčrtu (posunout kotvu, ne ořezat)
  let rx = anchor === 'start' ? x - 4 : anchor === 'end' ? x - w + 4 : x - w / 2;
  const dx = Math.max(4, Math.min(W - 4 - w, rx)) - rx;
  rx += dx; x += dx;
  const t = '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' + esc(s) + '</text>';
  if (!key) return t;
  return '<g class="sk-edit" data-edit="' + key + '">' + (TIPS[key] ? '<title>' + TIPS[key] + '</title>' : '') +
    '<rect class="sk-hit" x="' + rx.toFixed(1) + '" y="' + (y - 13.5).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="5"/>' + t + '</g>';
}
const ln = (a, b, cls) => '<line class="' + cls + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>';
const dot = (p, cls, r = 3) => '<circle class="' + cls + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '"/>';

/** Obsazená místa popisků u bodů (aby se nepřekrývaly). */
let placed = [];
const overlaps = (a) => placed.some(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);

/** Popisek u bodu, odsazený směrem `dir` (jednotkový v px); při překryvu posun o řádek. */
function near(p, dir, dist, s, key, cls) {
  const x = p.x + dir.x * dist, y0 = p.y + dir.y * dist + 4;
  const anchor = dir.x > 0.35 ? 'start' : dir.x < -0.35 ? 'end' : 'middle';
  const w = lw(s);
  const cl = v => Math.max(64, Math.min(H - 24, v));
  let y = cl(y0);
  for (const dy of [0, 21, -21, 42, -42, 63, -63]) {
    const yy = cl(cl(y0) + dy);
    let rx = anchor === 'start' ? x - 4 : anchor === 'end' ? x - w + 4 : x - w / 2;
    rx = Math.max(4, Math.min(W - 4 - w, rx));
    const r = { x: rx, y: yy - 14, w, h: 20 };
    if (!overlaps(r)) { placed.push(r); y = yy; break; }
  }
  return lbl(x, y, s, key, cls, anchor);
}

/**
 * @param {SVGElement} svg
 * @param {object} m
 * @param {'A'|'B'} m.side
 * @param {null|{R:number, face:'in'|'out', beta:number, given:'corner'|'start', dia:number|null}} m.input
 * @param {any} m.res          výsledek hrany z taperFillets (nebo null)
 * @param {number|null} m.C     kuželovitost (null = neznámá → schematicky 10°)
 * @param {'A'|'B'} m.bigSide
 * @param {number|null} m.coneDia  Ø kužele na této hraně
 * @param {'val'|'calc'|'empty'} m.coneSt
 * @param {number|null} m.zTop
 * @param {{face:string, ang:string}} m.raw  syrové hodnoty polí (pro stav popisků)
 */
export function drawFilletSketch(svg, m) {
  const inp = m.input || { R: 0, face: 'out', beta: 0, given: 'corner', dia: null };
  const C = Number.isFinite(m.C) ? m.C : 2 * Math.tan(10 * Math.PI / 180);
  const Rd = inp.R > 0 ? inp.R : 1;                     // schéma bez R: jednotkový
  const u1 = coneDir(m.side, C, m.bigSide), u2 = faceDir(inp.face, inp.beta);
  const f = filletAt({ r: 0, z: 0 }, u1, u2, Rd);
  placed = [];

  let s = '';
  // Záložky hran + Z vrchu
  // Hrana se přepíná záložkami nad detailem; tady jen název
  s += lbl(8, 18, m.side === 'B' ? '▲ Vrch' : '▼ Spodek', '', 'sk-val', 'start');
  s += lbl(W - 8, 18, 'Z vrchu ' + (Number.isFinite(m.zTop) ? t3(m.zTop) : '?'), 'zTop', Number.isFinite(m.zTop) ? 'sk-val' : 'sk-empty', 'end');

  if (!f) {
    s += lbl(W / 2, H / 2, 'Čelo je rovnoběžné s kuželem – změň úhel čela', 'ang', 'sk-empty');
    svg.innerHTML = s;
    return;
  }
  // Rozsah kresby: průsečík, tečné body, střed ± R, kus kužele a čela za R
  const ext = f.t + 1.6 * Rd;
  const P = { r: 0, z: 0 };
  const coneEnd = { r: u1.r * ext, z: u1.z * ext }, faceEnd = { r: u2.r * ext, z: u2.z * ext };
  const pts = [P, f.onCone, f.onFace, coneEnd, faceEnd,
    { r: f.center.r - Rd, z: f.center.z - Rd }, { r: f.center.r + Rd, z: f.center.z + Rd }];
  const r0 = Math.min(...pts.map(p => p.r)), r1 = Math.max(...pts.map(p => p.r));
  const z0 = Math.min(...pts.map(p => p.z)), z1 = Math.max(...pts.map(p => p.z));
  const X0 = 92, X1 = W - 92, Y0 = 84, Y1 = H - 66;
  const sc = Math.min((X1 - X0) / Math.max(r1 - r0, 1e-9), (Y1 - Y0) / Math.max(z1 - z0, 1e-9));
  const ox = (X0 + X1) / 2 - ((r0 + r1) / 2) * sc, oy = (Y0 + Y1) / 2 + ((z0 + z1) / 2) * sc;
  const T = p => ({ x: ox + p.r * sc, y: oy - p.z * sc });          // r doprava, z nahoru
  const tP = T(P), tC = T(f.onCone), tF = T(f.onFace), tM = T(f.center);
  const tCE = T(coneEnd), tFE = T(faceEnd);

  // Kužel, rádius, čelo (plně); teoretická ostrá hrana (čárkovaně)
  s += ln(tCE, tC, 'tb-sk-line') + ln(tF, tFE, 'tb-sk-line');
  const cross = (tF.x - tM.x) * (tC.y - tM.y) - (tF.y - tM.y) * (tC.x - tM.x);
  const Rpx = Rd * sc;
  s += '<path class="tb-fil" d="M' + tF.x.toFixed(1) + ' ' + tF.y.toFixed(1) + ' A' + Rpx.toFixed(1) + ' ' + Rpx.toFixed(1) +
    ' 0 0 ' + (cross > 0 ? 1 : 0) + ' ' + tC.x.toFixed(1) + ' ' + tC.y.toFixed(1) + '"/>';
  s += ln(tP, tC, 'tb-fil-face') + ln(tP, tF, 'tb-fil-face');
  s += ln(tM, tC, 'tb-sk-rad') + ln(tM, tF, 'tb-sk-rad');
  s += dot(tP, 'tb-sk-corner', 3) + dot(tF, 'tb-fil-pt') + dot(tC, 'tb-fil-pt') + dot(tM, 'tb-sk-center', 2.5);
  s += lbl(8, H - 8, '← k ose   ● tečné body R (Z v tabulce)', '', 'sk-legend', 'start');

  // Směry pro popisky (v px): od středu ven, od průsečíku pryč od rádiusu
  const unit = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
  const awayP = unit(tM, tP);
  const res = m.res && m.res.corner ? m.res : null;

  // R – na rádiusové čáře ze středu k půlce oblouku (jako na výkrese)
  const mid = unit(tM, { x: (tF.x + tC.x) / 2, y: (tF.y + tC.y) / 2 });
  const tR = { x: tM.x + mid.x * Rpx * 0.55, y: tM.y + mid.y * Rpx * 0.55 };
  s += ln(tM, { x: tM.x + mid.x * Rpx, y: tM.y + mid.y * Rpx }, 'tb-sk-rad');
  const rTxt = inp.R > 0 ? 'R' + t3(inp.R) : 'R ?';
  placed.push({ x: tR.x - lw(rTxt) / 2, y: tR.y - 10, w: lw(rTxt), h: 20 });
  s += lbl(tR.x, tR.y + 4, rTxt, 'R', inp.R > 0 ? 'sk-val' : 'sk-empty');

  // Průsečík
  const cornerSt = inp.given === 'start' ? (res ? 'sk-calc' : 'sk-empty') : (m.coneSt === 'val' ? 'sk-val' : m.coneSt === 'calc' ? 'sk-calc' : 'sk-empty');
  const cornerDia = res ? res.corner.dia : inp.given === 'corner' ? m.coneDia : null;
  s += near(tP, awayP, 16, 'průsečík Ø' + (Number.isFinite(cornerDia) ? t3(cornerDia) : '?'), 'corner', cornerSt);

  // Začátek R na čele (pod / nad čelem, mimo rádius)
  const nF = unit(tM, tF);
  const startTxt = inp.given === 'start' ? (inp.dia > 0 ? t3(inp.dia) : '?') : res ? t3(res.onFace.dia) : '?';
  s += near(tF, nF, 18, 'začátek Ø' + startTxt, 'start',
    inp.given === 'start' ? (inp.dia > 0 ? 'sk-val' : 'sk-empty') : res ? 'sk-calc' : 'sk-empty');

  // Konec R na kuželu
  const nC = unit(tM, tC);
  if (res) s += near(tC, nC, 18, 'konec Ø' + t3(res.onCone.dia), '', 'sk-calc');
  // ★ krajní Ø na oblouku
  for (const [k, sign] of [['maxDia', 1], ['minDia', -1]]) {
    const e = res && res[k];
    if (!e) continue;
    const q = T({ r: f.center.r + sign * Rd, z: f.center.z });
    s += dot(q, 'tb-sk-star', 3.5);
    s += near(q, { x: sign, y: 0.9 }, 14, '★ Ø' + t3(e.dia), '', 'tb-ref-t');
  }

  // Čelo: směr a úhel – pevně ve 2. řádku
  s += lbl(8, 46, '⇄ otočit R', 'face', 'sk-btn', 'start');
  s += lbl(W - 8, 46, '∠ čela ' + (m.raw.ang.trim() ? t3(inp.beta) : '0') + '°', 'ang', m.raw.ang.trim() ? 'sk-val' : 'sk-calc', 'end');
  // Kužel: sklon (jen pro orientaci)
  const nCone = unit(tP, tCE);
  const aDeg = Math.atan(C / 2) * 180 / Math.PI;
  s += near(tCE, nCone, 10, 'kužel α ' + (Number.isFinite(m.C) ? t3(aDeg) + '°' : '?'), '', Number.isFinite(m.C) ? 'sk-calc' : 'sk-empty');

  svg.innerHTML = s;
}

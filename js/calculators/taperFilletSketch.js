// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel: klikací profil s přechody R (vrch i spodek)     ║
// ╚══════════════════════════════════════════════════════════════╝
// Celý profil najednou ve skutečných úhlech: čelo nahoře → R → površka kužele
// → R → čelo dole, teoretické ostré hrany čárkovaně. Dlouhý kužel se v kresbě
// zkrátí (≈ přerušení), aby rádiusy byly vidět. Klikací (data-edit):
// R:A|B, face:A|B (otočit R), ang:A|B (úhel čela), corner:A|B (Ø průsečíku),
// start:A|B (Ø začátku R na čele), fend:A|B (konec čela), alpha (α kužele), L (délka), zTop.
// Neznámé hodnoty jako „?" – profil jde vyplnit jen klikáním.

import { filletAt, coneDir, faceDir } from './taperFilletMath.js';
import { f3 } from './taperBoreMath.js';

export const SK_W = 340, SK_H = 440;
const W = SK_W, H = SK_H;
const t3 = x => f3(x).replace(/\.?0+$/, '') || '0';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const TIPS = {
  R: 'Rádius přechodu', face: 'Otočit rádius na druhou stranu čela (čelo k ose ↔ k většímu Ø)',
  ang: 'Úhel čela od roviny kolmé k ose (0 = kolmo, + k vrchu, − ke spodku)',
  corner: 'Průsečík – ostrá hrana kužele s čelem (= Ø kužele na hraně)',
  start: 'Začátek rádiusu na čele – Ø, kde R z čela odbočí', zTop: 'Z čela vrchu – výsledky pak v souřadnicích Z',
  fend: 'Konec čela – Ø konce nebo délka čela (druhé se dopočítá, ohlídá se, že se R vejde)',
  alpha: 'Úhel α – sklon površky kužele k ose', L: 'Délka kužele L (mezi průsečíky, podél osy)',
};
const tipOf = key => TIPS[key.split(':')[0]] || '';

const lw = s => Math.max(28, s.length * 6.8 + 10);
function lbl(x, y, s, key, cls, anchor = 'middle') {
  const w = lw(s), h = 19;
  let rx = anchor === 'start' ? x - 4 : anchor === 'end' ? x - w + 4 : x - w / 2;
  const dx = Math.max(4, Math.min(W - 4 - w, rx)) - rx;
  rx += dx; x += dx;
  const t = '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' + esc(s) + '</text>';
  if (!key) return t;
  return '<g class="sk-edit" data-edit="' + key + '"><title>' + tipOf(key) + '</title>' +
    '<rect class="sk-hit" x="' + rx.toFixed(1) + '" y="' + (y - 13.5).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="5"/>' + t + '</g>';
}
const ln = (a, b, cls) => '<line class="' + cls + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>';
const dot = (p, cls, r = 3) => '<circle class="' + cls + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '"/>';
const unit = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };

// Popisky u bodů bez překryvu
let placed = [];
const TOP = 62, BOT = H - 58;
const overlaps = (a) => placed.some(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
function near(p, dir, dist, s, key, cls) {
  const w = lw(s);
  const cl = v => Math.max(TOP + 4, Math.min(BOT, v));
  // nejdřív zadanou stranou, když tam není místo, zrcadlově na druhou stranu bodu
  for (const d of [dir, { x: -dir.x, y: dir.y }]) {
    const x = p.x + d.x * dist, y0 = cl(p.y + d.y * dist + 4);
    const anchor = d.x > 0.35 ? 'start' : d.x < -0.35 ? 'end' : 'middle';
    for (const dy of [0, 21, -21, 42, -42, 63, -63, 84, -84]) {
      const yy = cl(y0 + dy);
      let rx = anchor === 'start' ? x - 4 : anchor === 'end' ? x - w + 4 : x - w / 2;
      rx = Math.max(4, Math.min(W - 4 - w, rx));
      const r = { x: rx, y: yy - 14, w, h: 20 };
      if (!overlaps(r)) { placed.push(r); return lbl(x, yy, s, key, cls, anchor); }
    }
  }
  const anchor = dir.x > 0.35 ? 'start' : dir.x < -0.35 ? 'end' : 'middle';
  return lbl(p.x + dir.x * dist, cl(p.y + dir.y * dist + 4), s, key, cls, anchor);
}

const stCls = st => st === 'val' ? 'sk-val' : st === 'calc' ? 'sk-calc' : 'sk-empty';

/**
 * @param {SVGElement} svg
 * @param {object} m
 * @param {number|null} m.C   kuželovitost (null = neznámá → schéma 10°)
 * @param {number|null} m.L   délka kužele
 * @param {'A'|'B'} m.bigSide
 * @param {Record<string, {R:number, face:'in'|'out', beta:number, given:string, dia:number|null, angRaw:string, faceLen?:number|null, faceMode?:string}>} m.inp
 * @param {Record<string, any>} m.res   výsledky hran (taperFillets) nebo null
 * @param {Record<string, number|null>} m.coneDia
 * @param {Record<string, string>} m.coneSt
 * @param {string} m.aSt   stav úhlu α ('val' | 'calc' | 'empty')
 * @param {string} m.LSt   stav délky
 * @param {number|null} m.zTop
 */
export function drawFilletProfile(svg, m) {
  placed = [];
  const C = Number.isFinite(m.C) ? m.C : 2 * Math.tan(10 * Math.PI / 180);
  const alpha = Math.atan(C / 2);
  const Rs = ['A', 'B'].map(s => m.inp[s].R).filter(r => r > 0);
  const Rm = Rs.length ? Math.max(...Rs) : 1;
  const slant = Number.isFinite(m.L) && m.L > 0 ? m.L / Math.cos(alpha) : null;
  const maxDraw = 9 * Rm;
  const Ld = slant !== null ? Math.min(slant, maxDraw) : 7 * Rm;
  const broken = slant !== null && slant > maxDraw + 1e-9;

  // Místní geometrie: průsečík vrchu v počátku, spodek po površce
  const u1B = coneDir('B', C, m.bigSide), u1A = { r: -u1B.r, z: -u1B.z };
  const P = { B: { r: 0, z: 0 }, A: { r: u1B.r * Ld, z: u1B.z * Ld } };
  const U1 = { B: u1B, A: u1A };
  /** @type {Record<string, any>} */
  const geo = {};
  for (const side of ['B', 'A']) {
    const e = m.inp[side];
    const u2 = faceDir(e.face, e.beta);
    const f = e.R > 0 ? filletAt(P[side], U1[side], u2, e.R) : null;
    // Čelo: skutečná délka, je-li známá (dlouhé zkrátit jako kužel), jinak kousek za R
    let ext = (f ? f.t : 0) + 1.8 * Rm, faceBroken = false;
    if (e.faceLen > 0) { ext = Math.min(e.faceLen, maxDraw); faceBroken = e.faceLen > maxDraw + 1e-9; }
    geo[side] = { u2, f, faceKnown: e.faceLen > 0, faceBroken, faceEnd: { r: P[side].r + u2.r * ext, z: P[side].z + u2.z * ext } };
  }
  const pts = [P.A, P.B, geo.A.faceEnd, geo.B.faceEnd];
  for (const side of ['A', 'B']) {
    const f = geo[side].f, R = m.inp[side].R;
    if (f) pts.push({ r: f.center.r - R, z: f.center.z - R }, { r: f.center.r + R, z: f.center.z + R });
  }
  const r0 = Math.min(...pts.map(p => p.r)), r1 = Math.max(...pts.map(p => p.r));
  const z0 = Math.min(...pts.map(p => p.z)), z1 = Math.max(...pts.map(p => p.z));
  const X0 = 60, X1 = W - 60, Y0 = TOP + 40, Y1 = BOT - 40;
  const sc = Math.min((X1 - X0) / Math.max(r1 - r0, 1e-9), (Y1 - Y0) / Math.max(z1 - z0, 1e-9));
  const ox = (X0 + X1) / 2 - ((r0 + r1) / 2) * sc, oy = (Y0 + Y1) / 2 + ((z0 + z1) / 2) * sc;
  const T = p => ({ x: ox + p.r * sc, y: oy - p.z * sc });

  let s = '';
  s += lbl(8, 18, 'Celý profil', '', 'sk-val', 'start');
  s += lbl(W - 8, 18, 'Z vrchu ' + (Number.isFinite(m.zTop) ? t3(m.zTop) : '?'), 'zTop', Number.isFinite(m.zTop) ? 'sk-val' : 'sk-empty', 'end');
  // Ovládání čel u své hrany: nahoře vrch, dole spodek
  const ctl = (side, y) => {
    const e = m.inp[side], mark = side === 'B' ? '▲ ' : '▼ ';
    const has = e.angRaw.trim() !== '';
    return lbl(8, y, mark + '⇄ otočit R', 'face:' + side, 'sk-btn', 'start') +
      lbl(W - 8, y, mark + '∠ čela ' + (has ? t3(e.beta) : '0') + '°', 'ang:' + side, has ? 'sk-val' : 'sk-calc', 'end');
  };
  s += ctl('B', 44) + ctl('A', H - 30);
  s += lbl(8, H - 8, '← k ose   ● tečné body R   ★ krajní Ø', '', 'sk-legend', 'start');

  // Čela, rádiusy, ostré hrany
  /** @type {Record<string, {x:number,y:number}>} */
  const ends = {};
  for (const side of ['B', 'A']) {
    const g = geo[side], e = m.inp[side], tP = T(P[side]), tFE = T(g.faceEnd);
    if (g.f) {
      const tF = T(g.f.onFace), tC = T(g.f.onCone), tM = T(g.f.center);
      s += ln(tFE, tF, 'tb-sk-line');
      const cross = (tF.x - tM.x) * (tC.y - tM.y) - (tF.y - tM.y) * (tC.x - tM.x);
      const Rpx = e.R * sc;
      s += '<path class="tb-fil" d="M' + tF.x.toFixed(1) + ' ' + tF.y.toFixed(1) + ' A' + Rpx.toFixed(1) + ' ' + Rpx.toFixed(1) +
        ' 0 0 ' + (cross > 0 ? 1 : 0) + ' ' + tC.x.toFixed(1) + ' ' + tC.y.toFixed(1) + '"/>';
      s += ln(tP, tC, 'tb-fil-face') + ln(tP, tF, 'tb-fil-face');
      s += ln(tM, tC, 'tb-sk-rad') + ln(tM, tF, 'tb-sk-rad');
      s += dot(tP, 'tb-sk-corner', 3) + dot(tF, 'tb-fil-pt') + dot(tC, 'tb-fil-pt') + dot(tM, 'tb-sk-center', 2.5);
      ends[side] = tC;
      g.t = { tP, tF, tC, tM, Rpx };
    } else {
      s += ln(tFE, tP, 'tb-sk-line') + dot(tP, 'tb-sk-corner', 3);
      ends[side] = tP;
      g.t = { tP };
    }
  }
  // Površka (u dlouhého kužele přerušená ≈)
  if (broken) {
    const a = ends.B, b = ends.A, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = unit(a, b);
    const g1 = { x: mx - d.x * 7, y: my - d.y * 7 }, g2 = { x: mx + d.x * 7, y: my + d.y * 7 };
    const n = { x: -d.y * 6, y: d.x * 6 };
    s += ln(a, g1, 'tb-sk-line') + ln(g2, b, 'tb-sk-line');
    s += ln({ x: g1.x - n.x, y: g1.y - n.y }, { x: g1.x + n.x, y: g1.y + n.y }, 'tb-sk-rad');
    s += ln({ x: g2.x - n.x, y: g2.y - n.y }, { x: g2.x + n.x, y: g2.y + n.y }, 'tb-sk-rad');
  } else s += ln(ends.B, ends.A, 'tb-sk-line');

  // R obou hran napřed – leží v kresbě, ostatní popisky se jim vyhnou
  for (const side of ['B', 'A']) {
    const { tF, tC, tM, Rpx } = geo[side].t;
    if (!tM) continue;
    const mid = unit(tM, { x: (tF.x + tC.x) / 2, y: (tF.y + tC.y) / 2 });
    const tR = { x: tM.x + mid.x * Rpx * 0.55, y: tM.y + mid.y * Rpx * 0.55 };
    s += ln(tM, { x: tM.x + mid.x * Rpx, y: tM.y + mid.y * Rpx }, 'tb-sk-rad');
    const rTxt = 'R' + t3(m.inp[side].R);
    placed.push({ x: tR.x - lw(rTxt) / 2, y: tR.y - 10, w: lw(rTxt), h: 20 });
    s += lbl(tR.x, tR.y + 4, rTxt, 'R:' + side, 'sk-val');
  }

  // Kužel: α a L u středu površky, na straně odvrácené od rádiusů
  {
    const a = T(P.B), b = T(P.A), d = unit(a, b);
    let n = { x: -d.y, y: d.x };
    const cM = geo.B.t.tM || geo.A.t.tM;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (cM && ((cM.x - mid.x) * n.x + (cM.y - mid.y) * n.y) > 0) n = { x: -n.x, y: -n.y };
    s += near({ x: mid.x, y: mid.y - 11 }, n, 20, 'α ' + (Number.isFinite(m.C) ? t3(alpha * 180 / Math.PI) + '°' : '?'), 'alpha', stCls(m.aSt));
    s += near({ x: mid.x, y: mid.y + 11 }, n, 20, 'L ' + (Number.isFinite(m.L) ? t3(m.L) : '?') + (broken ? ' ≈' : ''), 'L', stCls(m.LSt));
  }

  // Popisky hran
  for (const side of ['B', 'A']) {
    const g = geo[side], e = m.inp[side], res = m.res[side] && m.res[side].corner ? m.res[side] : null;
    const { tP, tF, tC, tM } = g.t;
    const away = tM ? unit(tM, tP) : { x: 0, y: side === 'B' ? -1 : 1 };
    if (!tM) s += near(tP, { x: -away.x * 0.3 + 0.9, y: -away.y }, 16, 'R ?', 'R:' + side, 'sk-empty');
    const cornerSt = e.given === 'start' ? (res ? 'sk-calc' : 'sk-empty') : stCls(m.coneSt[side]);
    const cornerDia = res ? res.corner.dia : e.given === 'corner' ? m.coneDia[side] : null;
    s += near(tP, away, 16, 'průsečík Ø' + (Number.isFinite(cornerDia) ? t3(cornerDia) : '?'), 'corner:' + side, cornerSt);
    // Konec čela
    const tFE = T(g.faceEnd), dFE = unit(tP, tFE);
    if (g.faceKnown) s += dot(tFE, 'tb-sk-corner', 3);
    const feTxt = res && res.faceEnd ? 'čelo Ø' + t3(res.faceEnd.dia) + (g.faceBroken ? ' ≈' : '') : 'čelo Ø?';
    s += near(tFE, { x: dFE.x * 0.3, y: side === 'B' ? -1 : 1 }, 14, feTxt, 'fend:' + side, res && res.faceEnd ? (e.faceMode === 'dia' ? 'sk-val' : 'sk-calc') : 'sk-empty');
    if (!tM) continue;
    const startTxt = e.given === 'start' ? (e.dia > 0 ? t3(e.dia) : '?') : res ? t3(res.onFace.dia) : '?';
    s += near(tF, unit(tM, tF), 18, 'začátek Ø' + startTxt, 'start:' + side,
      e.given === 'start' ? (e.dia > 0 ? 'sk-val' : 'sk-empty') : res ? 'sk-calc' : 'sk-empty');
    if (res) s += near(tC, unit(tM, tC), 18, 'konec Ø' + t3(res.onCone.dia), '', 'sk-calc');
    for (const [k, sign] of [['maxDia', 1], ['minDia', -1]]) {
      const x = res && res[k];
      if (!x) continue;
      const q = T({ r: g.f.center.r + sign * e.R, z: g.f.center.z });
      s += dot(q, 'tb-sk-star', 3.5);
      s += near(q, { x: sign, y: 0.6 }, 14, '★ Ø' + t3(x.dia), '', 'tb-ref-t');
    }
  }
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.innerHTML = s;
}

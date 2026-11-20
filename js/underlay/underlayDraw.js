// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Fotka výkresu jako podklad: stav, geometrie, kreslení  ║
// ╚══════════════════════════════════════════════════════════════╝
// Poloprůhledná fotka pod výkresem, podle které se obkresluje. Poloha je
// afinní: bod obrázku (u, v) v pixelech → svět P = O + u·U + v·V, kde U a V
// jsou vektory „mm na pixel" (měřítko + natočení + případné zrcadlení pohledu).
// Bez importů renderu (render/objects.js volá drawPhotoUnderlay) – UI a
// kalibrace jsou v underlayPanel.js. Uloženo v IndexedDB pro každý výkres
// (meta „photoUnderlay:<název>").

import { state } from '../state.js';
import { getMeta, setMeta } from '../idb.js';

/**
 * @typedef {{ src: string, w: number, h: number, ox: number, oy: number,
 *   ux: number, uy: number, vx: number, vy: number, opacity: number, visible: boolean }} Underlay
 */

/**
 * Stav podkladu. `marks` = klepnuté body při kalibraci (křížky), `onChange`
 * = překreslení po načtení fotky (nastaví underlayPanel.js – render se sem
 * neimportuje kvůli cyklu render → podklad → render).
 * @type {{ u: Underlay|null, img: HTMLImageElement|null, name: string|null, loading: boolean,
 *   marks: {x:number,y:number}[]|null, onChange: (() => void)|null, redraw: (() => void)|null }}
 */
export const UL = { u: null, img: null, name: null, loading: false, marks: null, onChange: null, redraw: null };
const changed = () => { const f = UL.onChange || UL.redraw; if (f) f(); };

const KEY = name => 'photoUnderlay:' + (name || 'Bez názvu');

/** Obrázek → svět. */
export function imgToWorld(u, px, py) {
  return { x: u.ox + px * u.ux + py * u.vx, y: u.oy + px * u.uy + py * u.vy };
}

/** Svět → obrázek (inverze afinního zobrazení). */
export function worldToImg(u, x, y) {
  const det = u.ux * u.vy - u.vx * u.uy;
  const dx = x - u.ox, dy = y - u.oy;
  return { px: (dx * u.vy - dy * u.vx) / det, py: (u.ux * dy - u.uy * dx) / det };
}

/**
 * Kalibrace měřítka dvěma body: vzdálenost p1–p2 bude `real` mm. Volitelně
 * natočí tak, aby úsečka p1–p2 byla vodorovná / svislá. Bod p1 zůstane na místě.
 * @param {Underlay} u
 * @param {{x:number,y:number}} p1  světové body (na fotce)
 * @param {{x:number,y:number}} p2
 * @param {number} real  skutečná vzdálenost [mm]
 * @param {'keep'|'auto'|'h'|'v'} align
 * @returns {Underlay}
 */
export function calibrate(u, p1, p2, real, align = 'keep') {
  const d0 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!(d0 > 1e-9) || !(real > 0)) return u;
  const k = real / d0;
  let rot = 0;
  if (align !== 'keep') {
    const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const q = Math.PI / 2;
    let target;
    if (align === 'h') target = Math.round(a / Math.PI) * Math.PI;
    else if (align === 'v') target = Math.round((a - q) / Math.PI) * Math.PI + q;
    else target = Math.round(a / q) * q;
    rot = target - a;
  }
  return transformAbout(u, p1, k, rot);
}

/** Zvětšení k a natočení rot [rad] kolem bodu c (světové souřadnice). */
export function transformAbout(u, c, k, rot) {
  const cs = Math.cos(rot) * k, sn = Math.sin(rot) * k;
  const R = (x, y) => ({ x: x * cs - y * sn, y: x * sn + y * cs });
  const o = R(u.ox - c.x, u.oy - c.y), U = R(u.ux, u.uy), V = R(u.vx, u.vy);
  return { ...u, ox: c.x + o.x, oy: c.y + o.y, ux: U.x, uy: U.y, vx: V.x, vy: V.y };
}

/** Posun tak, aby bod `from` (na fotce) byl v `to`. */
export function moveTo(u, from, to) {
  return { ...u, ox: u.ox + to.x - from.x, oy: u.oy + to.y - from.y };
}

/** Měřítko fotky v mm na pixel (délka vektoru U). */
export const mmPerPx = u => Math.hypot(u.ux, u.uy);

// ── Načtení / uložení ──
function setImage(u) {
  UL.u = u;
  UL.img = null;
  if (!u || typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => { if (UL.u === u) { UL.img = img; changed(); } };
  img.src = u.src;
}

/** Uloží podklad aktuálního výkresu (null = smazat). */
export async function saveUnderlay(u) {
  setImage(u);
  UL.name = state.projectName;
  try { await setMeta(KEY(state.projectName), u); } catch { /* plné úložiště – zůstane jen v paměti */ }
}

/** Jen změna polohy / průhlednosti (obrázek se nenačítá znovu). */
export async function updateUnderlay(u) {
  UL.u = u;
  try { await setMeta(KEY(state.projectName), u); } catch { /* ignorovat */ }
}

/**
 * Podklad patří výkresu: po přepnutí výkresu načíst jeho fotku. Výkres
 * „Bez názvu" uložený pod názvem si fotku vezme s sebou.
 */
function syncProject() {
  const name = state.projectName;
  if (UL.name === name || UL.loading) return;
  const prev = UL.name, prevU = UL.u;
  UL.loading = true;
  getMeta(KEY(name)).then(async (u) => {
    if (u && u.src) setImage(u);
    else if (prevU && prev === 'Bez názvu') { setImage(prevU); try { await setMeta(KEY(name), prevU); } catch { /* ignorovat */ } }
    else setImage(null);
  }).catch(() => setImage(null)).finally(() => {
    UL.name = name; UL.loading = false;
    changed();
  });
}

/**
 * Nakreslí podklad (volá render/objects.js úplně na začátku).
 * @param {CanvasRenderingContext2D} ctx
 * @param {(x:number, y:number) => [number, number]} w2s
 */
export function drawPhotoUnderlay(ctx, w2s) {
  if (typeof getMeta === 'function') syncProject();
  const u = UL.u, img = UL.img;
  if (u && img && u.visible) drawImage(ctx, w2s, u, img);
  // Klepnuté body kalibrace – červené křížky
  if (UL.marks && UL.marks.length) {
    ctx.save();
    ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 2;
    UL.marks.forEach((p, i) => {
      const [x, y] = w2s(p.x, p.y);
      ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke();
      ctx.fillStyle = '#f38ba8'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(String(i + 1), x + 6, y - 6);
    });
    ctx.restore();
  }
}

function drawImage(ctx, w2s, u, img) {
  const [ox, oy] = w2s(u.ox, u.oy);
  const [ax, ay] = w2s(u.ox + u.ux, u.oy + u.uy);
  const [bx, by] = w2s(u.ox + u.vx, u.oy + u.vy);
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, u.opacity ?? 0.5));
  ctx.transform(ax - ox, ay - oy, bx - ox, by - oy, ox, oy);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, u.w, u.h);
  ctx.restore();
}

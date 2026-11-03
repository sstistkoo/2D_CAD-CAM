// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Úpravy výkresu: výpočty (bez UI)                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 3. 11. 2026: obrobek se kreslí v jednom kvadrantu (zrcadlení
// kolem obou os) — tvar se má jedním klepnutím uzavřít:
//   • kontura  → po osách (konec na ose pokračuje po ose k druhému konci,
//                přes počátek, je-li druhý konec na druhé ose),
//   • polotovar → ke kontuře (konec na ose po ose k nejbližšímu bodu
//                kontury na téže ose).
// Dál: normalizace barev kontura/polotovar a rozbor vodorovných/svislých
// čar (render/straightCheck.js). Dialog s tlačítky: drawingEditsDialog.js.

import { EPS, workGroups, freeEnds, endsOf, isStockObj } from './fixShared.js';
import { isHelperObject } from '../helperLayer.js';

/** Do tolika mm od osy se konec bere jako „na ose". */
export const AXIS_SNAP = 0.01;
/** Skoro rovná čára: odchylka od vodorovné/svislé menší než tolik stupňů. */
export const NEAR_STRAIGHT_DEG = 3;
/** Přesně rovná: rozdíl souřadnic konců do tolika mm. */
export const STRAIGHT_EXACT = 1e-6;

const axisOf = (p) => {
  const v = Math.abs(p.x) < AXIS_SNAP, h = Math.abs(p.y) < AXIS_SNAP;
  return v && h ? 'o' : v ? 'v' : h ? 'h' : null;
};
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < EPS;

function _group(objects, layers, name) {
  return workGroups(objects, layers).find(g => g.name === name).work;
}

/**
 * Otevřený řetěz skupiny → jeho dva volné konce, jinak důvod, proč nejde.
 * @returns {{ends?: {o:object,i:number,x:number,y:number}[], why?: string}}
 */
function _twoEnds(work, label) {
  if (work.length === 0) return { why: `${label} ve výkresu není` };
  const ends = freeEnds(work);
  if (ends.length === 0) return { why: `${label} je už uzavřená` };
  if (ends.length !== 2) return { why: `${label} má ${ends.length} volných konců (mezery / víc kusů) — nejdřív Kontrola a oprava` };
  return { ends };
}

/** Body cesty po osách z `a` do `b` (bez `a`), konce mimo osu se spustí kolmo na bližší osu. */
function _axisPath(a, b) {
  const drop = (p) => {
    if (axisOf(p)) return { p, k: axisOf(p) };
    return Math.abs(p.x) <= Math.abs(p.y) ? { p: { x: 0, y: p.y }, k: 'v', moved: true } : { p: { x: p.x, y: 0 }, k: 'h', moved: true };
  };
  const A = drop(a), B = drop(b);
  const pts = [];
  if (A.moved) pts.push(A.p);
  const sameAxis = A.k === 'o' || B.k === 'o' || A.k === B.k;
  if (!sameAxis) pts.push({ x: 0, y: 0 });
  if (B.moved) pts.push(B.p);
  pts.push(b);
  return pts;
}

/**
 * Úsečky z lomené čáry [start, ...pts], bez nulových kusů. Úsečka ležící
 * celá NA OSE dostane `onAxis: true` — přidá se jako pomocná čára (do CAM
 * nejde): osa rotace ani rovina Z0 není plocha k obrábění, CAM s nimi
 * uzavřenou smyčku bral jako díl a hrubovací průchody jely přes celý kus
 * až za osu (karusel, uživatel 3. 11. 2026).
 */
function _segments(start, pts) {
  const out = [];
  let prev = start;
  for (const p of pts) {
    if (!same(prev, p)) {
      const k1 = axisOf(prev), k2 = axisOf(p);
      const onAxis = !!k1 && !!k2 && (k1 === 'o' || k2 === 'o' || k1 === k2);
      out.push({ x1: prev.x, y1: prev.y, x2: p.x, y2: p.y, onAxis });
    }
    prev = p;
  }
  return out;
}

/** Vynechá úsečky, které ve výkresu už jsou (úsečka / pomocná čára se stejnými konci). */
function _withoutExisting(lines, objects) {
  const has = (l) => objects.some(o => (o.type === 'line' || o.type === 'constr') && (
    (same({ x: o.x1, y: o.y1 }, { x: l.x1, y: l.y1 }) && same({ x: o.x2, y: o.y2 }, { x: l.x2, y: l.y2 }))
    || (same({ x: o.x1, y: o.y1 }, { x: l.x2, y: l.y2 }) && same({ x: o.x2, y: o.y2 }, { x: l.x1, y: l.y1 }))));
  return lines.filter(l => !has(l));
}

/**
 * Úsečky, které uzavřou konturu po osách X a Z (počátek 0,0).
 * @returns {{lines: {x1,y1,x2,y2}[], from?: object, why?: string}}
 *   `from` = objekt kontury, jehož vzhled nové úsečky převezmou
 */
export function closeContourToAxes(objects, layers) {
  const r = _twoEnds(_group(objects, layers, 'kontura'), 'Kontura');
  if (r.why) return { lines: [], why: r.why };
  const [a, b] = r.ends;
  const lines = _withoutExisting(_segments(a, _axisPath(a, b)), objects);
  if (lines.length === 0) return { lines, why: 'Kontura je už uzavřená' };
  return { lines, from: a.o._orig || a.o };
}

/**
 * Úsečky, které uzavřou polotovar ke kontuře: konec polotovaru na ose jde po
 * ose k nejbližšímu bodu kontury na téže ose, jinak rovně k nejbližšímu
 * volnému konci (případně bodu) kontury. Bez kontury se uzavře po osách.
 * @returns {{lines: {x1,y1,x2,y2}[], from?: object, why?: string}}
 */
export function closeStockToContour(objects, layers) {
  const r = _twoEnds(_group(objects, layers, 'polotovar'), 'Polotovar');
  if (r.why) return { lines: [], why: r.why };
  const contour = _group(objects, layers, 'kontura');
  const from = r.ends[0].o._orig || r.ends[0].o;
  if (contour.length === 0) {
    const [a, b] = r.ends;
    const lines = _withoutExisting(_segments(a, _axisPath(a, b)), objects);
    return lines.length ? { lines, from } : { lines, why: 'Polotovar je už uzavřený' };
  }
  const pts = contour.flatMap(o => endsOf(o));
  const free = freeEnds(contour).map(e => ({ x: e.x, y: e.y }));
  const used = [];
  const lines = [];
  for (const s of r.ends) {
    const k = axisOf(s);
    const onSameAxis = pts.filter(p => {
      const kp = axisOf(p);
      return kp && (k === 'o' || kp === 'o' || kp === k) && !used.some(u => same(u, p));
    });
    const pool = (k && onSameAxis.length) ? onSameAxis : (free.length ? free : pts);
    let best = null, bd = Infinity;
    for (const p of pool) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) continue;
    used.push(best);
    lines.push(..._withoutExisting(_segments(s, [best]), objects));
  }
  if (lines.length === 0) return { lines: [], why: 'Polotovar už na konturu navazuje' };
  return { lines, from };
}

/** Geometrie, které se týká barva kontury/polotovaru (ne kóty, texty, pomocné čáry). */
function _colorable(o, faceIds) {
  return o && !o.isDimension && !o.isCoordLabel && o.type !== 'constr' && o.type !== 'text'
    && o.type !== 'point' && !faceIds.has(o.layer) && !o.shellHole && !o.shellSlot && !isHelperObject(o);
}

/** Čára má jiný typ/tloušťku než `weight` ('thick' = souvislá tlustá, 'thin' = tenká bez typu čáry). */
function _offWeight(o, weight) {
  if (!weight) return false;
  if (o.dashed) return true;
  return weight === 'thick' ? o.lineStyle !== 'solidThick' : (o.lineStyle !== undefined && o.lineStyle !== 'solidThin');
}

/**
 * Plán normalizace barev: kontura i polotovar bez vlastní barvy (barva vrstvy),
 * kontura mimo vrstvu Polotovar, polotovar ve vrstvě Polotovar; vrstvám
 * Kontura (0) a Polotovar se vrátí výchozí barva. S `std.weight` sjednotí
 * i tloušťku/typ čáry (uživatel 3. 11. 2026: „kontura má dvě tloušťky čar").
 * @param {{contourLayer:number, stockLayer:number, contourColor:string, stockColor:string, weight?:'thin'|'thick'}} std
 * @returns {{objs: {obj:object, color?:boolean, layer?:number, weight?:string}[], layers: {layer:object, color:string}[]}}
 */
export function planColorNormalize(objects, layers, std) {
  const faceIds = new Set((layers || []).filter(l => l.isFace || l.isShell).map(l => l.id));
  const objs = [];
  for (const o of objects) {
    if (!_colorable(o, faceIds)) continue;
    const stock = isStockObj(o);
    let layer;
    if (stock && o.layer !== std.stockLayer) layer = std.stockLayer;
    if (!stock && o.layer === std.stockLayer) layer = std.contourLayer;
    const weight = _offWeight(o, std.weight) ? std.weight : undefined;
    if (o.color !== undefined || layer !== undefined || weight) objs.push({ obj: o, color: o.color !== undefined, layer, weight });
  }
  const lay = [];
  for (const [id, color] of [[std.contourLayer, std.contourColor], [std.stockLayer, std.stockColor]]) {
    const l = (layers || []).find(x => x.id === id);
    if (l && String(l.color).toLowerCase() !== color.toLowerCase()) lay.push({ layer: l, color });
  }
  return { objs, layers: lay };
}

/** Provede plán z planColorNormalize. */
export function applyColorNormalize(plan) {
  for (const it of plan.objs) {
    if (it.color) delete it.obj.color;
    if (it.layer !== undefined) it.obj.layer = it.layer;
    if (it.weight === 'thick') { it.obj.lineStyle = 'solidThick'; it.obj.dashed = false; }
    if (it.weight === 'thin') { delete it.obj.lineStyle; delete it.obj.dashed; }
  }
  for (const it of plan.layers) it.layer.color = it.color;
}

/**
 * Rozbor rovných čar: úsečka (i rovný kus polylinie) je
 *   'exact' — přesně vodorovná/svislá,
 *   'near'  — skoro (odchylka < NEAR_STRAIGHT_DEG), `off` = rozdíl souřadnic konců v mm,
 *   jinak se nevrací (šikmá čára je záměr).
 * @returns {{kind:'exact'|'near', dir:'h'|'v', x1:number, y1:number, x2:number, y2:number, off:number}[]}
 */
export function classifyStraightLines(objects, layers) {
  const faceIds = new Set((layers || []).filter(l => l.isFace || l.isShell).map(l => l.id));
  const out = [];
  const test = (x1, y1, x2, y2) => {
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    if (Math.hypot(dx, dy) < EPS) return;
    const dir = dx >= dy ? 'h' : 'v';
    const off = dir === 'h' ? dy : dx;
    const along = dir === 'h' ? dx : dy;
    if (off <= STRAIGHT_EXACT) out.push({ kind: 'exact', dir, x1, y1, x2, y2, off: 0 });
    else if (Math.atan2(off, along) * 180 / Math.PI < NEAR_STRAIGHT_DEG) out.push({ kind: 'near', dir, x1, y1, x2, y2, off });
  };
  for (const o of objects) {
    if (!_colorable(o, faceIds)) continue;
    if (o.type === 'line') test(o.x1, o.y1, o.x2, o.y2);
    else if (o.type === 'polyline' && Array.isArray(o.vertices)) {
      const vs = o.vertices, n = o.closed ? vs.length : vs.length - 1;
      for (let i = 0; i < n; i++) {
        if ((o.bulges || [])[i]) continue;
        const v1 = vs[i], v2 = vs[(i + 1) % vs.length];
        test(v1.x, v1.y, v2.x, v2.y);
      }
    }
  }
  return out;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Oprava mezer, kvůli kterým část kontury nejde do CAM   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 2. 11. 2026: „mám tam nespojené části v kontuře, kontrola mě před
// přechodem do CAM upozornila, ale automatická oprava se nenabídla — jen ať se
// vrátím a opravím je v kreslení". Kontrola výkresu (drawingFixes.js) spojuje
// jen mezery do 0,5 mm mezi úsečkami — na tu je oprava jednoznačná i bez
// kontextu. Tady kontext je: přenos do CAM ví, které čáry NENAVAZUJÍ na hlavní
// profil (fileIO runCncExport forCam → leftovers), takže mezera mezi nimi
// a zbytkem kontury je skoro jistě chyba. Hledá se proto dál (do MAX_GAP)
// a i mezi oblouky / polyline:
//
//   úsečka + úsečka  → prodloužit / zkrátit obě do průsečíku (roh), když
//                      je blízko; jinak spojit uprostřed (mezera do JOIN_TOL)
//   úsečka + oblouk  → konec úsečky na konec oblouku (do JOIN_TOL)
//   jinak            → doplnit spojovací úsečku (oblouk / polyline se nemění)
//
// Páruje se volný konec čáry „mimo profil" s nejbližším volným koncem jiné
// souvislé části kontury (nejbližší páry napřed, každá část se s jinou spojí
// jen jednou — žádné smyčky). Konce oba na ose nespojuje (osa je uzavírá).

import { state } from '../state.js';
import { EPS, ON_AXIS, fmt, workGroups, endsOf, freeEnds, moveEnd, placeLabel } from './fixShared.js';

/** Nejdelší mezera (mm), kterou oprava ještě nabídne. */
export const MAX_GAP = 5;
/** Do této mezery se konce posunou k sobě; nad ní se doplní spojovací úsečka. */
export const JOIN_TOL = 1;

/** Průsečík přímek a1→a2 a b1→b2 (null = rovnoběžné). */
function _cross(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y, d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
  if (l1 < 1e-9 || l2 < 1e-9 || Math.abs(den) < 1e-6 * l1 * l2) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** Souvislé části (union-find přes shodné konce). */
function _components(list) {
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ends = list.map(endsOf);
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    if (ends[a].some(p => ends[b].some(q => Math.hypot(p.x - q.x, p.y - q.y) < EPS))) parent[find(a)] = find(b);
  }
  const comp = new Map();
  list.forEach((o, i) => comp.set(o, find(i)));
  return { comp, find, parent, index: new Map(list.map((o, i) => [o, i])) };
}

/**
 * Opravy mezer mezi čarami „mimo profil" a zbytkem kontury.
 * @param {object[]} leftovers objekty výkresu mimo hlavní profil (buildCamTransfer)
 * @returns {object[]} opravy { kind: 'join'|'bridge', label, at, amount, objs, sets, dels, adds }
 */
export function findLeftoverFixes(leftovers, objects = state.objects, { layers = state.layers, machineType = state.machineType } = {}) {
  if (!leftovers || leftovers.length === 0) return [];
  const R = machineType === 'karusel' ? 'x' : 'y';
  const left = new Set(leftovers);
  const grp = workGroups(objects, layers).find(g => g.name === 'kontura');
  const work = grp ? grp.work : [];
  const orig = (o) => o._orig || o;
  if (!work.some(o => left.has(orig(o)))) return [];
  const { comp, find, parent, index } = _components(work);
  const free = freeEnds(work);
  const pairs = [];
  for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) {
    const A = free[a], B = free[b];
    if (!left.has(orig(A.o)) && !left.has(orig(B.o))) continue;   // aspoň jeden konec mimo profil
    if (comp.get(A.o) === comp.get(B.o)) continue;                 // stejná část → smyčka
    if (Math.abs(A[R]) < ON_AXIS && Math.abs(B[R]) < ON_AXIS) continue;
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    if (d > EPS && d <= MAX_GAP) pairs.push({ A, B, d });
  }
  pairs.sort((p, q) => p.d - q.d);
  const used = new Set();
  const items = [];
  for (const { A, B, d } of pairs) {
    if (used.has(A) || used.has(B)) continue;
    const ra = find(index.get(A.o)), rb = find(index.get(B.o));
    if (ra === rb) continue;   // už spojené přes jinou opravu
    const la = A.o.type === 'line', lb = B.o.type === 'line';
    const item = { kind: 'join', group: 'kontura', amount: d, objs: [], sets: [], dels: [], adds: [] };
    let P = null;
    if (la && lb) {
      const other = (e) => endsOf(e.o)[1 - e.i];
      const X = _cross(other(A), A, other(B), B);
      // Roh: průsečík blízko obou konců (posun nejvýš 2× mezera, aspoň JOIN_TOL)
      // a žádná úsečka se tím neotočí (průsečík nesmí ležet za jejím druhým koncem).
      const lim = Math.max(2 * d, JOIN_TOL);
      const keeps = (e) => {
        const o = other(e);
        return (X.x - o.x) * (e.x - o.x) + (X.y - o.y) * (e.y - o.y) > EPS;
      };
      if (X && Math.hypot(X.x - A.x, X.y - A.y) <= lim && Math.hypot(X.x - B.x, X.y - B.y) <= lim && keeps(A) && keeps(B)) P = X;
      else if (d <= JOIN_TOL) P = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    } else if ((la || lb) && d <= JOIN_TOL) {
      P = la ? { x: B.x, y: B.y } : { x: A.x, y: A.y };   // oblouk / polyline se nemění
    }
    if (P) {
      if (la) moveEnd(item, A.o, A.i, P.x, P.y); else item.objs.push(orig(A.o));
      if (lb) moveEnd(item, B.o, B.i, P.x, P.y); else item.objs.push(orig(B.o));
      item.at = placeLabel(P.x, P.y, machineType);
      item.label = `Kontura: mezera ${fmt(d)} mm → spojit (${item.at})`;
    } else {
      // Spojovací úsečka: převezme vrstvu a vzhled čáry „mimo profil".
      const src = orig(left.has(orig(A.o)) ? A.o : B.o);
      const props = {};
      for (const k of ['layer', 'color', 'lineStyle', 'dashed']) if (src[k] !== undefined) props[k] = src[k];
      item.kind = 'bridge';
      item.adds.push({ type: 'line', x1: A.x, y1: A.y, x2: B.x, y2: B.y, ...props });
      item.objs.push(orig(A.o), orig(B.o));
      item.at = placeLabel((A.x + B.x) / 2, (A.y + B.y) / 2, machineType);
      item.label = `Kontura: mezera ${fmt(d)} mm → doplnit spojovací čáru (${item.at})`;
    }
    used.add(A); used.add(B);
    parent[ra] = rb;
    items.push(item);
  }
  return items;
}

/** Nejmenší mezera mezi čarou mimo profil a zbytkem kontury (pro hlášku), nebo null. */
export function nearestLeftoverGap(leftovers, objects = state.objects, { layers = state.layers } = {}) {
  const left = new Set(leftovers || []);
  const grp = workGroups(objects, layers).find(g => g.name === 'kontura');
  if (!grp) return null;
  const orig = (o) => o._orig || o;
  const ends = grp.work.flatMap(o => endsOf(o).map(p => ({ o, ...p })));
  let best = null;
  for (const a of ends) {
    if (!left.has(orig(a.o))) continue;
    for (const b of ends) {
      if (left.has(orig(b.o))) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kontrola výkresu: drobné chyby, které rozbijí CAM      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 2. 11. 2026: „tuning proti chybám s automatickou opravou … ať
// vyskočí okno s upozorněním, co se opravuje, s možností to zaškrtnout".
// Na mobilu prst netrefí bod přesně a vzniknou chyby, které na plátně vidět
// nejsou, ale CAM z nich postaví nesmysl. Hledá se jen to, co má JEDNOZNAČNOU
// opravu; kontura a polotovar zvlášť, upravují se jen úsečky:
//
//   osa      konec do 2 mm od osy, pahýl, přesah za roh       (axisFix.js)
//   mezera   dva volné konce do GAP_TOL od sebe → spojit do průsečíku
//            prodloužených úseček (u oblouku na konec oblouku)
//   k čáře   volný konec úsečky do TEE_TOL od jiné úsečky → prodloužit /
//            zkrátit k ní (po své ose, jinak kolmo)
//   rovnat   úsečka skoro vodorovná / svislá (odchylka do STRAIGHT_TOL,
//            délka aspoň STRAIGHT_MIN_LEN) → narovnat; navazující úsečky
//            se v tom konci posunou s ní
//
// Pořadí je pevné; konec, který už oprava jedné kontroly použila, další
// kontrola nepoužije (opravy pak jdou provést v libovolném výběru).
// Dialog se zaškrtávátky: contourCheck.js offerDrawingFixes.

import { state } from '../state.js';
import { EPS, ON_AXIS, fmt, workGroups, endsOf, freeEnds, joinedAt, moveEnd, placeLabel } from './fixShared.js';
import { detectAxis } from './axisFix.js';

/** Tolerance (mm) — na jednom místě */
export const GAP_TOL = 0.5;
export const TEE_TOL = 0.5;
export const STRAIGHT_TOL = 0.05;
export const STRAIGHT_MIN_LEN = 2;

const G = (g) => (g === 'kontura' ? 'Kontura' : 'Polotovar');

function _claims(ctx) {
  return {
    claim: (o, i) => { if (!ctx.claimed.has(o)) ctx.claimed.set(o, new Set()); ctx.claimed.get(o).add(i); },
    isClaimed: (o, i) => ctx.claimed.has(o) && ctx.claimed.get(o).has(i),
  };
}

/** Průsečík přímek a1→a2 a b1→b2 (null = rovnoběžné). */
function _cross(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y, d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
  if (l1 < 1e-9 || l2 < 1e-9 || Math.abs(den) < 1e-6 * l1 * l2) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

// ── Mezera mezi dvěma volnými konci ──
function detectGaps(grp, ctx) {
  const { claim, isClaimed } = _claims(ctx);
  const live = grp.work.filter(o => !ctx.gone.has(o));
  const free = freeEnds(live).filter(e => !isClaimed(e.o, e.i));
  const pairs = [];
  for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) {
    const A = free[a], B = free[b];
    if (A.o === B.o) continue;
    if (Math.abs(A[ctx.R]) < ON_AXIS && Math.abs(B[ctx.R]) < ON_AXIS) continue;   // osa uzavírá sama
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    if (d > EPS && d <= GAP_TOL) pairs.push({ A, B, d });
  }
  pairs.sort((p, q) => p.d - q.d);
  const used = new Set();
  for (const { A, B, d } of pairs) {
    if (used.has(A) || used.has(B)) continue;
    const la = A.o.type === 'line', lb = B.o.type === 'line';
    if (!la && !lb) continue;
    let P;
    if (la && lb) {
      const other = (e) => endsOf(e.o)[1 - e.i];
      const X = _cross(other(A), A, other(B), B);
      P = X && Math.hypot(X.x - A.x, X.y - A.y) <= 2 * GAP_TOL && Math.hypot(X.x - B.x, X.y - B.y) <= 2 * GAP_TOL
        ? X : { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    } else P = la ? { x: B.x, y: B.y } : { x: A.x, y: A.y };   // oblouk se nemění
    const item = { kind: 'gap', group: grp.name, amount: d, objs: [], sets: [], dels: [] };
    if (la) moveEnd(item, A.o, A.i, P.x, P.y); else item.objs.push(A.o);
    if (lb) moveEnd(item, B.o, B.i, P.x, P.y); else item.objs.push(B.o);
    claim(A.o, A.i); claim(B.o, B.i); used.add(A); used.add(B);
    item.at = placeLabel(P.x, P.y, ctx.machineType);
    item.label = `${G(grp.name)}: mezera ${fmt(d)} mm mezi čarami → spojit (${item.at})`;
    ctx.items.push(item);
  }
}

// ── Volný konec úsečky těsně u jiné úsečky (T) ──
function detectTee(grp, ctx) {
  const { claim, isClaimed } = _claims(ctx);
  const live = grp.work.filter(o => !ctx.gone.has(o));
  for (const e of freeEnds(live)) {
    const L = e.o;
    if (L.type !== 'line' || isClaimed(L, e.i)) continue;
    const other = endsOf(L)[1 - e.i];
    let best = null;
    for (const M of live) {
      if (M === L || M.type !== 'line') continue;
      const dx = M.x2 - M.x1, dy = M.y2 - M.y1, L2 = dx * dx + dy * dy, len = Math.sqrt(L2);
      if (len < EPS) continue;
      const t = ((e.x - M.x1) * dx + (e.y - M.y1) * dy) / L2;
      const foot = { x: M.x1 + t * dx, y: M.y1 + t * dy };
      const d = Math.hypot(e.x - foot.x, e.y - foot.y);
      if (d <= EPS || d > TEE_TOL || t * len < EPS || (1 - t) * len < EPS) continue;
      // Po ose úsečky L, když to k M není daleko a průsečík leží na M; jinak kolmo.
      const X = _cross(other, e, { x: M.x1, y: M.y1 }, { x: M.x2, y: M.y2 });
      let P = foot;
      if (X && Math.hypot(X.x - e.x, X.y - e.y) <= 3 * TEE_TOL) {
        const tx = ((X.x - M.x1) * dx + (X.y - M.y1) * dy) / L2;
        if (tx * len > EPS && (1 - tx) * len > EPS) P = X;
      }
      if (!best || d < best.d) best = { d, P };
    }
    if (!best) continue;
    // Prodloužit (P dál od druhého konce než volný konec) / zkrátit.
    const longer = Math.hypot(best.P.x - other.x, best.P.y - other.y) > Math.hypot(e.x - other.x, e.y - other.y);
    const item = { kind: longer ? 'extend' : 'trimTee', group: grp.name, amount: best.d, objs: [], sets: [], dels: [] };
    moveEnd(item, L, e.i, best.P.x, best.P.y); claim(L, e.i);
    item.at = placeLabel(best.P.x, best.P.y, ctx.machineType);
    item.label = longer
      ? `${G(grp.name)}: konec ${fmt(best.d)} mm před čarou → prodloužit (${item.at})`
      : `${G(grp.name)}: konec ${fmt(best.d)} mm přes čáru → zkrátit (${item.at})`;
    ctx.items.push(item);
  }
}

// Počet desetinných míst, kolik hodnota potřebuje (0…4, jinak 5).
function _decimals(v) {
  for (let d = 0; d <= 4; d++) { const p = 10 ** d; if (Math.abs(v - Math.round(v * p) / p) < 1e-7) return d; }
  return 5;
}

// ── Skoro vodorovná / svislá úsečka ──
function detectStraighten(grp, ctx) {
  const { claim, isClaimed } = _claims(ctx);
  const live = grp.work.filter(o => !ctx.gone.has(o));
  for (const L of live) {
    if (L.type !== 'line') continue;
    const len = Math.hypot(L.x2 - L.x1, L.y2 - L.y1);
    if (len < STRAIGHT_MIN_LEN) continue;
    for (const axis of ['y', 'x']) {   // y stejné = vodorovná, x stejné = svislá
      const k1 = axis + '1', k2 = axis + '2';
      const dev = Math.abs(L[k1] - L[k2]);
      if (dev < 1e-6 || dev > STRAIGHT_TOL) continue;
      // Který konec posunout: ten, kde nenavazuje oblouk a hodnota je „méně kulatá".
      const ends = [0, 1].map(i => {
        const p = endsOf(L)[i];
        const joined = joinedAt(live, L, p.x, p.y);
        const ok = !isClaimed(L, i) && joined.every(j => j.o.type === 'line' && !isClaimed(j.o, j.i));
        return { i, p, joined, ok, dec: _decimals(L[axis + (i + 1)]) };
      });
      // Posouvá se konec s víc desetinnými místy; při shodě druhý (konec úsečky).
      const order = ends[0].dec > ends[1].dec ? [0, 1] : [1, 0];
      const mv = ends[order[0]].ok ? ends[order[0]] : (ends[order[1]].ok ? ends[order[1]] : null);
      if (!mv) continue;
      const target = L[axis + (2 - mv.i)];   // hodnota druhého konce
      const item = { kind: 'straighten', group: grp.name, amount: dev, objs: [], sets: [], dels: [] };
      const at = (p) => (axis === 'y' ? { x: p.x, y: target } : { x: target, y: p.y });
      // Posunutý konec vezme navazující úsečky; ty, které by tím samy zešikmily o pár
      // mikronů (dosud přesně rovné), se srovnají taky svým druhým koncem — jinak by
      // se odchylka jen přesunula o úsečku dál. Oblouk řetěz zastaví.
      const seen = new Set([L]);
      const shift = (o, i) => {
        const joined = joinedAt(live, o, endsOf(o)[i].x, endsOf(o)[i].y);
        const P = at(endsOf(o)[i]);
        moveEnd(item, o, i, P.x, P.y); claim(o, i);
        for (const j of joined) {
          const Pj = at(endsOf(j.o)[j.i]);
          moveEnd(item, j.o, j.i, Pj.x, Pj.y); claim(j.o, j.i);
          if (seen.has(j.o) || j.o.type !== 'line') continue;
          seen.add(j.o);
          const oi = 1 - j.i, q = endsOf(j.o)[oi];
          const d = Math.abs(q[axis] - target);
          if (d < 1e-6 || d > STRAIGHT_TOL || Math.hypot(j.o.x2 - j.o.x1, j.o.y2 - j.o.y1) < STRAIGHT_MIN_LEN) continue;
          const far = joinedAt(live, j.o, q.x, q.y);
          if (isClaimed(j.o, oi) || !far.every(f => f.o.type === 'line' && !isClaimed(f.o, f.i))) continue;
          shift(j.o, oi);
        }
      };
      shift(L, mv.i);
      const P = at(mv.p);
      // Popis podle plátna: osa soustruhu leží vodorovně, karuselu svisle.
      const inX = (axis === 'y') === (ctx.machineType !== 'karusel');
      item.at = placeLabel(P.x, P.y, ctx.machineType, 3);   // odchylka je v tisícinách, tak i cíl
      item.label = `${G(grp.name)}: skoro ${axis === 'y' ? 'vodorovná' : 'svislá'} čára (odchylka ${fmt(dev)} mm${inX ? ' v X' : ' v Z'}) → narovnat (${item.at})`;
      ctx.items.push(item);
      break;
    }
  }
}

/**
 * Všechny opravy výkresu (nic nemění — provede je fixShared.applyFixItems).
 * @returns {object[]} opravy { kind, group, label, at, amount, objs, sets, dels }
 */
export function findDrawingFixes(objects = state.objects, { layers = state.layers, machineType = state.machineType } = {}) {
  const ctx = { R: machineType === 'karusel' ? 'x' : 'y', machineType, claimed: new Map(), items: [], gone: new Set() };
  for (const grp of workGroups(objects, layers)) {
    detectAxis(grp, ctx);
    detectGaps(grp, ctx);
    detectTee(grp, ctx);
    detectStraighten(grp, ctx);
  }
  return ctx.items;
}

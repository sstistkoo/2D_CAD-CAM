// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Oprava u osy: konce těsně vedle osy, pahýly, přesahy  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nález uživatele 2. 11. 2026 (skica_projekt_1): čelo kontury začínalo na
// X −0,301 (kousek POD osou), čelo polotovaru končilo na X 0,786 (nad osou),
// osa polotovaru přesahovala za čelo do Z 268,76 a tam z ní trčel pahýl
// 1,153 mm. Na plátně to není vidět, ale CAM pak dostal otevřený polotovar
// a čelo bez začátku.
//
// Detektor pro „Kontrolu výkresu" (drawingFixes.js), pro konturu a polotovar zvlášť:
//   1. VOLNÝ konec úsečky do AXIS_TOL od osy (ne přesně na ní) → na osu.
//      Vodorovná úsečka u osy jde na osu celá i s čarami, které na ni navazují.
//   2. Úsečka, která tím zkrátí na nulu (pahýl) → smazat.
//   3. Přesah: volný konec úsečky trčí za volný konec jiné čáry, který leží
//      na ní (přesah za roh, třeba osa polotovaru delší než jeho čelo) → zkrátit.
// Upravují se jen úsečky (oblouky a polylinie se jen počítají do napojení).

import { state } from '../state.js';
import { EPS, ON_AXIS, fmt, workGroups, endsOf, freeEnds, joinedAt, endKeys, moveEnd, placeLabel } from './fixShared.js';

/** Do kolika mm od osy se volný konec považuje za „měl být na ose" */
export const AXIS_TOL = 2.0;

const _len = (o) => Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
const G = (g) => (g === 'kontura' ? 'Kontura' : 'Polotovar');

/**
 * @param {{name: string, work: object[]}} grp pracovní skupina (fixShared.workGroups)
 * @param {{R: 'x'|'y', machineType: string, claimed: Map, items: object[], gone: Set}} ctx
 */
export function detectAxis(grp, ctx) {
  const { R, machineType, claimed, items, gone } = ctx;
  const live = () => grp.work.filter(o => !gone.has(o));
  const claim = (o, i) => { if (!claimed.has(o)) claimed.set(o, new Set()); claimed.get(o).add(i); };
  const isClaimed = (o, i) => claimed.has(o) && claimed.get(o).has(i);
  const mine = [];

  // 1. Volné konce u osy → na osu.
  for (const e of freeEnds(live())) {
    if (e.o.type !== 'line' || isClaimed(e.o, e.i)) continue;
    const r = e[R];
    if (!(Math.abs(r) > ON_AXIS && Math.abs(r) <= AXIS_TOL)) continue;
    const oi = 1 - e.i;
    const rKey = (i) => R + (i === 0 ? '1' : '2');
    const horiz = Math.abs(e.o[rKey(e.i)] - e.o[rKey(oi)]) < 1e-6;
    const item = { kind: 'snap', group: grp.name, amount: r, objs: [], sets: [], dels: [] };
    if (horiz) {
      // Na druhý konec navazující čáry jdou na osu s ní; oblouk tam = neopravovat.
      const [kx, ky] = endKeys(oi);
      const joined = joinedAt(live(), e.o, e.o[kx], e.o[ky]);
      if (joined.some(j => j.o.type !== 'line' || isClaimed(j.o, j.i))) continue;
      for (const j of joined) {
        const p = endsOf(j.o)[j.i];
        moveEnd(item, j.o, j.i, R === 'x' ? 0 : p.x, R === 'y' ? 0 : p.y); claim(j.o, j.i);
      }
      const p = endsOf(e.o)[oi];
      moveEnd(item, e.o, oi, R === 'x' ? 0 : p.x, R === 'y' ? 0 : p.y); claim(e.o, oi);
    }
    moveEnd(item, e.o, e.i, R === 'x' ? 0 : e.x, R === 'y' ? 0 : e.y); claim(e.o, e.i);
    item.at = placeLabel(e.x, e.y, machineType);
    item.label = `${G(grp.name)}: konec čáry ${fmt(Math.abs(r))} mm ${r < 0 ? 'pod osou' : 'nad osou'} → na osu (${item.at})`;
    items.push(item); mine.push({ item, o: e.o });
  }
  // 2. Pahýl zkrácený na nulu → smazat (místo přitažení).
  for (const m of mine) {
    if (_len(m.o) >= EPS) continue;
    gone.add(m.o);
    Object.assign(m.item, {
      kind: 'stub', amount: Math.abs(m.item.amount), sets: [], dels: [m.o._orig], objs: [m.o._orig],
      label: `${G(grp.name)}: pahýl ${fmt(Math.abs(m.item.amount))} mm u osy → smazat (${m.item.at})`,
    });
  }
  // 3. Přesah za volný konec jiné čáry, který leží na úsečce → zkrátit.
  const free = freeEnds(live());
  for (const e of free) {
    const L = e.o;
    if (L.type !== 'line' || isClaimed(L, e.i)) continue;
    const dx = L.x2 - L.x1, dy = L.y2 - L.y1, L2 = dx * dx + dy * dy, len = Math.sqrt(L2);
    if (len < EPS) continue;
    let best = null;
    for (const g of free) {
      if (g.o === L) continue;
      const t = ((g.x - L.x1) * dx + (g.y - L.y1) * dy) / L2;
      const d = Math.hypot(g.x - (L.x1 + t * dx), g.y - (L.y1 + t * dy));
      if (d >= EPS || t * len < EPS || (1 - t) * len < EPS) continue;   // ne uvnitř úsečky
      const dist = Math.hypot(g.x - e.x, g.y - e.y);
      if (!best || dist < best.dist) best = { g, dist };
    }
    if (!best) continue;
    const item = { kind: 'trim', group: grp.name, amount: best.dist, objs: [], sets: [], dels: [] };
    moveEnd(item, L, e.i, best.g.x, best.g.y); claim(L, e.i); claim(best.g.o, best.g.i);
    item.at = placeLabel(best.g.x, best.g.y, machineType);
    item.label = `${G(grp.name)}: přesah ${fmt(best.dist)} mm za roh → zkrátit (${item.at})`;
    items.push(item);
    e.x = best.g.x; e.y = best.g.y;   // tenhle konec už není volný přesah
  }
}

/** Jen opravy u osy (testy; aplikace volá findDrawingFixes). */
export function findAxisFixes(objects = state.objects, { layers = state.layers, machineType = state.machineType } = {}) {
  const ctx = { R: machineType === 'karusel' ? 'x' : 'y', machineType, claimed: new Map(), items: [], gone: new Set() };
  for (const grp of workGroups(objects, layers)) detectAxis(grp, ctx);
  return ctx.items;
}

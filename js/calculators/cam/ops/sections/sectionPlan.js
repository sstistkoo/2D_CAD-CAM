// ╔══════════════════════════════════════════════════════════════╗
// ║  PLÁN ÚSEKŮ — pravidlo 1 (hranice) + pravidlo 8 (pořadí)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// První krok nového generátoru po úsecích (zadání uživatele 25. 9. 2026):
// „napřed to rozkouskuješ na úseky, jeden úsek se udělají dráhy, pak další".
// Tenhle modul dráhy NEDĚLÁ — jen řekne, kde díl končí a začíná úsek a v jakém
// pořadí se úseky pojedou. Simulátor to kreslí jako čáry na díle, aby uživatel
// dělení zkontroloval dřív, než se nad ním postaví dráhy.
//
// Hranice = `sectionEdges` (ops/long/sectionFeet.js) — TÁŽ funkce, podle
// které měří `scripts/cam_rules_check.mjs`.
//
// Pracuje v už zrcadleném světě (hrubování zleva = zrcadlo, u = z, vyšší z =
// blíž začátku obrábění); zpátky překlápí `mirrorCalcZ` (zMirror.js).

import { pointInLoop } from '../../../../geom/geomCore.js';
import { topXOnLoop } from '../../camMath.js';
import { buildStockLoopRaw } from '../../materialRemoval.js';
import { getInsert } from '../../inserts/index.js';
import { sectionEdges } from '../long/sectionFeet.js';

const DZ = 0.5;   // krok vzorkování vrchu polotovaru v úseku [mm]
const NEAR = 2;   // okolí hranice pro vrch její čáry [mm]

/**
 * @returns `{ edges, sections, steps }` nebo null (není co dělit)
 *   edges    – hranice `{ z, xFoot, xTop, kind }` (kind 'zanoreni' | 'stena')
 *   sections – úseky `{ id, zHi, zLo, top }` zprava doleva, top = vrch polotovaru
 *   steps    – pořadí obrábění `{ id, xFrom, xTo }` (pravidlo 8): úsek `id`
 *              se hrubuje po vrstvách od X `xFrom` do `xTo` (−∞ = až na dno)
 */
export function planSections({ prms, interferenceGuides, stockPathSegments, offsetXAt, worldPoints }) {
  const stockLoop = buildStockLoopRaw(prms, stockPathSegments);
  if (!stockLoop || !Array.isArray(worldPoints) || worldPoints.length < 2) return null;

  // Z-rozsah dílu (+ přídavek Z — offsetová čára končí o něj za konturou).
  let zLo = Infinity, zHi = -Infinity;
  for (const p of worldPoints) {
    if (!Number.isFinite(p.zReal)) continue;
    zLo = Math.min(zLo, p.zReal); zHi = Math.max(zHi, p.zReal);
  }
  if (!(zHi > zLo)) return null;
  const pad = Math.max(+prms.allowanceZ || 0, 0) + 1e-6;
  zLo -= pad; zHi += pad;

  const inStock = (p) => { try { return pointInLoop(p, stockLoop) !== 'outside'; } catch { return true; } };
  const isParting = !!getInsert(prms).cutsFullWidth;
  const raw = sectionEdges({
    guides: interferenceGuides,
    isOutside: (p) => !inStock(p),
    parting: isParting ? { offsetXAt, uLo: zLo, uHi: zHi } : null,
  }).filter(e => e.u > zLo + 1e-6 && e.u < zHi - 1e-6);

  // Pata na kontuře: u čáry zanoření její spodní bod, u stěny offset.
  const footOf = (u) => {
    for (const g of interferenceGuides || []) {
      if (!g || g.kind !== 'zanoreni') continue;
      const lo = g.x1 <= g.x2 ? { x: g.x1, z: g.z1 } : { x: g.x2, z: g.z2 };
      if (Math.abs(lo.z - u) < 1e-6) return lo.x;
    }
    return offsetXAt(u);
  };
  const stockTop = (z) => topXOnLoop(stockLoop, z);
  // Vrch čáry = nejvyšší polotovar KOLEM hranice: pata leží u stěny a čelo
  // odlitku bývá kousek vedle (díl uživatele 24. 9.: pata Z 195,3, čelo
  // Z 196,3 — přímo nad patou je už údolí X 16,7).
  const stockTopNear = (z) => {
    let top = null;
    for (let d = -NEAR; d <= NEAR + 1e-9; d += DZ / 2) {
      const t = stockTop(z + d);
      if (t !== null && (top === null || t > top)) top = t;
    }
    return top;
  };
  const edges = raw.map(e => {
    const sTop = stockTopNear(e.u);
    const xTop = Number.isFinite(e.top) ? (sTop === null ? e.top : Math.min(e.top, sTop)) : sTop;
    return { z: e.u, xFoot: footOf(e.u), xTop, kind: Number.isFinite(e.top) ? 'stena' : 'zanoreni' };
  });

  // Úseky zprava doleva (vyšší z = blíž začátku obrábění).
  const cuts = [zHi, ...raw.map(e => e.u).sort((a, b) => b - a), zLo];
  const sections = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    let top = -Infinity;
    for (let z = cuts[k]; z >= cuts[k + 1]; z -= DZ) {
      const t = stockTop(z);
      if (t !== null && t > top) top = t;
    }
    sections.push({ id: sections.length + 1, zHi: cuts[k], zLo: cuts[k + 1], top });
  }

  return { edges, sections, steps: orderSteps(sections) };
}

/**
 * Pravidlo 8: začne se u největšího průměru a jede se po vrstvách; když
 * vrstvy dojdou na vrch největšího NEhotového úseku vpravo, přejde se na něj
 * a dodělá se (s tímtéž pravidlem pro jeho pravou stranu). Pak se vrátí
 * a pokračuje. Úseky vlevo počkají, až bude hotové všechno vpravo.
 * Při shodě průměrů má přednost pravá strana.
 */
export function orderSteps(sections) {
  const steps = [];
  const done = new Set();
  const live = sections.filter(s => Number.isFinite(s.top));
  const pickMax = (list) => list.reduce((b, s) => (!b || s.top > b.top + 1e-9
    || (Math.abs(s.top - b.top) <= 1e-9 && s.zHi > b.zHi) ? s : b), null);
  const run = (S, xFrom) => {
    done.add(S);
    let x = xFrom;
    for (;;) {
      const R = pickMax(live.filter(s => !done.has(s) && s.zLo >= S.zHi - 1e-6));
      if (!R) { steps.push({ id: S.id, xFrom: x, xTo: -Infinity }); return; }
      if (R.top < x - 1e-9) { steps.push({ id: S.id, xFrom: x, xTo: R.top }); x = R.top; }
      run(R, R.top);
    }
  };
  for (let S = pickMax(live); S; S = pickMax(live.filter(s => !done.has(s)))) run(S, S.top);
  return steps;
}

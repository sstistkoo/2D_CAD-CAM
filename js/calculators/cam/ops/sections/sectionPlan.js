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
// Hranice = čára zanoření, která vede od kontury šikmo dolů a VYJEDE na
// offsetovou čáru polotovaru (Přídavek X/Z polo.) — tam úsek končí. Čára,
// která skončí na kontuře (v materiálu), nedělí. Simulátor hranici kreslí
// jako svislici z bodu výjezdu nad polotovar (drawSections.js). Čáry dodá sectionGuides.js
// (upichovák 45°). Upřesnění uživatele 25. 9. 2026.
//
// Pracuje v už zrcadleném světě (hrubování zleva = zrcadlo, u = z, vyšší z =
// blíž začátku obrábění); zpátky překlápí `mirrorCalcZ` (zMirror.js).

import { pointInLoop } from '../../../../geom/geomCore.js';
import { topXOnLoop } from '../../camMath.js';
import { buildStockLoopRaw } from '../../materialRemoval.js';

const DZ = 0.5;   // krok vzorkování vrchu polotovaru v úseku [mm]

/**
 * @param guides     dělicí čáry (sectionGuides.js)
 * @param planLoop   offsetová čára polotovaru (stockPlanLoop), null = syrový
 * @returns `{ edges, sections, steps }` nebo null (není co dělit)
 *   edges    – hranice `{ z, x, line }`: (x, z) = kde čára zanoření vyjede
 *              na offset polotovaru, line = ta čára,
 *              end = true u krajní čáry (konec prvního/posledního úseku)
 *   sections – úseky `{ id, zHi, zLo, top }` zprava doleva, top = vrch polotovaru
 *   steps    – pořadí obrábění `{ id, xFrom, xTo }` (pravidlo 8): úsek `id`
 *              se hrubuje po vrstvách od X `xFrom` do `xTo` (−∞ = až na dno)
 */
export function planSections({ prms, guides, stockPathSegments, planLoop, worldPoints }) {
  const stockLoop = buildStockLoopRaw(prms, stockPathSegments);
  if (!stockLoop || !Array.isArray(worldPoints) || worldPoints.length < 2) return null;
  const loop = planLoop && planLoop.length > 2 ? planLoop : stockLoop;

  // Z-rozsah dílu (+ přídavek Z — offsetová čára končí o něj za konturou).
  let zLo = Infinity, zHi = -Infinity;
  for (const p of worldPoints) {
    if (!Number.isFinite(p.zReal)) continue;
    zLo = Math.min(zLo, p.zReal); zHi = Math.max(zHi, p.zReal);
  }
  if (!(zHi > zLo)) return null;
  const pad = Math.max(+prms.allowanceZ || 0, 0) + 1e-6;
  zLo -= pad; zHi += pad;

  // Konec čáry na offsetu polotovaru (ne uvnitř) = vyjede z materiálu.
  const onEdge = (p) => { try { return pointInLoop(p, loop) !== 'inside'; } catch { return false; } };
  const edges = [];
  for (const g of guides || []) {
    const a = { x: g.x1, z: g.z1 }, b = { x: g.x2, z: g.z2 };
    const out = onEdge(a) ? a : onEdge(b) ? b : null;
    if (!out) continue;
    const inn = out === a ? b : a;
    edges.push({ z: out.z, x: out.x, line: { x1: inn.x, z1: inn.z, x2: out.x, z2: out.z } });
  }
  edges.sort((p, q) => p.z - q.z);
  // Čára, která vyjede až ZA koncem dílu, nedělí — ale ukazuje, kde končí
  // krajní úsek (uživatel: „dodělej čáru i na konci vlevo, ať vím, kde to
  // končí poslední úsek"). Bere se nejbližší za každým koncem.
  const endLo = edges.filter(e => e.z <= zLo + 1e-6).pop();
  const endHi = edges.find(e => e.z >= zHi - 1e-6);
  if (endLo) { zLo = endLo.z; endLo.end = true; }
  if (endHi) { zHi = endHi.z; endHi.end = true; }
  const inner = edges.filter(e => e.z > zLo + 1e-6 && e.z < zHi - 1e-6);
  const merged = inner.filter((e, k) => k === 0 || e.z - inner[k - 1].z > 1);

  // Úseky zprava doleva (vyšší z = blíž začátku obrábění).
  const stockTop = (z) => topXOnLoop(stockLoop, z);
  const cuts = [zHi, ...merged.map(e => e.z).reverse(), zLo];
  const sections = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    let top = -Infinity;
    for (let z = cuts[k]; z >= cuts[k + 1]; z -= DZ) {
      const t = stockTop(z);
      if (t !== null && t > top) top = t;
    }
    sections.push({ id: sections.length + 1, zHi: cuts[k], zLo: cuts[k + 1], top });
  }

  const drawn = [...(endLo ? [endLo] : []), ...merged, ...(endHi ? [endHi] : [])];
  return { edges: drawn, sections, steps: orderSteps(sections) };
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

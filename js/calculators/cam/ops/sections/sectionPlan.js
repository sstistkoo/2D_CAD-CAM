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
  // Konec čáry na offsetu polotovaru — test bod/mnohoúhelník NESTAČÍ: konec
  // leží PŘESNĚ na hraně a numericky vyjde jednou „na hraně", jednou „uvnitř"
  // (zleva tak chyběla hranice u Z 265,4 i krajní čára vpravo; 25. 9. 2026).
  const EDGE_TOL = 0.05;
  const distToLoop = (p) => {
    let d = Infinity;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
      d = Math.min(d, Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z));
    }
    return d;
  };
  const onEdge = (p) => {
    try { if (pointInLoop(p, loop) !== 'inside') return true; } catch { return false; }
    return distToLoop(p) <= EDGE_TOL;
  };
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
 * Pravidlo 8 (změněno uživatelem 25. 9. 2026): úseky se obrábějí PO ŘADĚ od
 * strany, odkud se obrábí (Ú1, Ú2, …), každý CELÝ najednou — žádné
 * přerušování na průměru sousedního úseku („mám 4 úseky, mají být 4 části").
 * `sections` jsou už seřazené od strany obrábění (id 1 = první).
 */
export function orderSteps(sections) {
  return sections
    .filter(s => Number.isFinite(s.top))
    .map(s => ({ id: s.id, xFrom: s.top, xTo: -Infinity }));
}

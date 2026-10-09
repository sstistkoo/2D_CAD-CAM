// ╔══════════════════════════════════════════════════════════════╗
// ║  KONTROLA POČÁTEČNÍHO BODU — nástroj nesmí začínat v materiálu ║
// ╚══════════════════════════════════════════════════════════════╝
// Uživatel 9. 10. 2026 (vrták, Bp X150 Z5 u dílu ⌀290): „pokud by byl nástroj
// v materiálu, ať vyskočí okno s informací a s rychlým odkazem na nastavení
// počátečního bodu". Počáteční bod = první bod dráhy (Bezpečná poloha).
// Validátor kolizí (collisionValidator.js) jede po blocích od prvního pohybu,
// takže nástroj STOJÍCÍ v materiálu hned na startu nikdy nenahlásí — a u odlitku
// nakresleného jen čárou (bez plochy) nevidí materiál vůbec. Proto se tu proti
// obrysu polotovaru bere i NAKRESLENÝ DÍL (kontura): ten je materiál vždy.

import { buildStockLoopRaw, toolFootprintVisual } from './materialRemoval.js';
import { holderWorldLoop } from './collisionValidator.js';
import { polyIntersect, polyOffset, polyArea } from '../../geom/geomCore.js';

/** Nejmenší průnik, který se hlásí [mm²] — jako tolerance validátoru. */
const TOL = 0.5;
/** Zmenšení obrysů proti falešným dotykům [mm] — jako validátor. */
const SHRINK = 0.05;

/** Obrys dílu z kontury (světové souřadnice x = poloměr, z); oblouky tětivou. */
function partLoop(calc) {
  const pts = ((calc && calc.worldPoints) || [])
    .map(p => ({ x: p.xReal, z: p.zReal }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
  return pts.length >= 3 ? pts : null;
}

/**
 * Je nástroj v počátečním bodě dráhy v materiálu?
 * @param prms  parametry (tvar nástroje, držák)
 * @param calc  výsledek calculate() — simPath, worldPoints, stockPathSegments
 * @returns {{x:number, z:number, area:number, what:string}|null}
 */
export function startInMaterial(prms, calc, { backside = false } = {}) {
  const p0 = calc && calc.simPath && calc.simPath[0];
  if (!p0 || !Number.isFinite(p0.x) || !Number.isFinite(p0.z)) return null;
  const shift = (loop) => loop.map(q => ({ x: q.x + p0.x, z: q.z + p0.z }));
  const shrink = (loop) => {
    try { return polyOffset([loop], -SHRINK)[0] || loop; } catch { return loop; }
  };
  const tools = [];
  const foot = toolFootprintVisual(prms);
  if (foot && foot.length >= 3) tools.push({ what: 'nástroj', loop: shrink(shift(foot)) });
  const holder = holderWorldLoop(prms, backside);
  if (holder && holder.length >= 3) tools.push({ what: 'držák', loop: shrink(shift(holder)) });
  const mats = [];
  let stock = null;
  try { stock = buildStockLoopRaw(prms, calc.stockPathSegments); } catch { stock = null; }
  if (stock && stock.length >= 3) mats.push({ what: 'polotovaru', loop: stock });
  const part = partLoop(calc);
  if (part) mats.push({ what: 'dílu', loop: part });
  let worst = null;
  for (const t of tools) {
    for (const m of mats) {
      let area = 0;
      try { area = Math.abs(polyArea(polyIntersect([t.loop], [m.loop]))); } catch { area = 0; }
      if (area > TOL && (!worst || area > worst.area)) worst = { x: p0.x, z: p0.z, area, what: `${t.what} v ${m.what}` };
    }
  }
  return worst;
}

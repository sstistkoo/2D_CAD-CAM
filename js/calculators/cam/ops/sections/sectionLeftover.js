// ╔══════════════════════════════════════════════════════════════╗
// ║  ZBYTEK MATERIÁLU PO ÚSECÍCH — co po drahách zůstalo stát       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 25. 9. 2026: „ještě by to chtělo, abychom věděli, kolik materiálu
// zůstane z předchozího úseku kvůli kolizi držáku". První krok: z HOTOVÝCH
// drah (simPath) se skutečným modelem úběru (`MaterialRemoval`, týž, podle
// kterého měří `cam_rules_check`) spočítá, co po celém programu stojí nad
// hotovní konturou + přídavkem, a rozdělí se to po úsecích plánu.
//
// Porovnává se se SKUTEČNOU nakreslenou konturou (`calc.partSegments`), ne
// s obrobitelnou: polygon do ní čáru zanoření přemostí, a klín pod čarou by
// se pak tvářil jako díl. Klín pod čarou zanoření je taky „nedojeto" —
// materiál tam stojí (uživatel 25. 9. 2026).
//
// Nic tu dráhy nemění — jen měří a simulátor to ukáže (šrafa + číslo).
// Pracuje v REÁLNÉM světě (simPath i plán úseků už jsou zpátky ze zrcadla).

import { MaterialRemoval } from '../../materialRemoval.js';
import { offsetSilhouetteLoop } from '../../toolEnvelope.js';
import { polyArea, polyDifference, polyIntersect, polyOffset } from '../../../../geom/geomCore.js';

// Tloušťka, pod kterou zbytek není „materiál", ale numerika a vrchlíky po
// kulatém nosu [mm] — přičte se k přídavku.
const SLIVER = 0.1;
// Menší kus se nekreslí ani nepočítá [mm²].
const MIN_PIECE = 0.5;

/**
 * @param prms, calc  parametry a výsledek výpočtu (calc.simPath, calc.sectionPlan,
 *                    calc.partSegments, calc.stockPathSegments)
 * @returns `{ perSection: Map<id, { area, pieces }>, total, remaining }` nebo
 *          null; kus = `{ loop, area }`, remaining = smyčky polotovaru, který
 *          po celém programu zbyl (obrys se kreslí, ať je vidět vrstva přídavku)
 */
export function sectionLeftover(prms, calc) {
  const plan = calc && calc.sectionPlan;
  const sp = calc && calc.simPath;
  if (!plan || !plan.sections.length || !Array.isArray(sp) || sp.length < 2) return null;
  const rm = new MaterialRemoval(prms, calc.stockPathSegments);
  if (!rm.valid) return null;
  rm.advanceTo(sp, sp.length - 1);
  const part = offsetSilhouetteLoop(dropRepeats(calc.partSegments || calc.contourSegments));
  if (!part || !rm.model) return null;

  const allow = Math.max(parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0) + SLIVER;
  let keep = [part];
  try { const o = polyOffset([part], allow); if (o && o.length) keep = o; } catch { /* bez offsetu */ }
  let rest;
  try { rest = polyDifference(rm.model.loops, keep); } catch { return null; }

  let xMax = 0;
  for (const l of rest) for (const p of l) if (p.x > xMax) xMax = p.x;
  const perSection = new Map();
  let total = 0;
  // Krajní úseky sahají až na konec POLOTOVARU, ne jen dílu — materiál za
  // koncem kontury (čelo, přesah odlitku) patří prvnímu/poslednímu úseku.
  // Bez toho chyběl zbytek za čelem, když se úsek 1 neobráběl (uživatel
  // 25. 9. 2026: „pravá strana u S2 je udělaná jako obrobená").
  let zMin = Infinity, zMax = -Infinity;
  for (const l of rest) for (const p of l) { if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z; }
  // Krajní podle Z, ne podle pořadí — zleva je plán zrcadlený.
  const topZ = Math.max(...plan.sections.map(q => q.zHi));
  const botZ = Math.min(...plan.sections.map(q => q.zLo));
  for (const s of plan.sections) {
    const hi = s.zHi === topZ ? Math.max(s.zHi, zMax + 1) : s.zHi;
    const lo = s.zLo === botZ ? Math.min(s.zLo, zMin - 1) : s.zLo;
    const band = [{ x: -1, z: lo }, { x: xMax + 1, z: lo }, { x: xMax + 1, z: hi }, { x: -1, z: hi }];
    let loops = [];
    try { loops = polyIntersect(rest, [band]); } catch { loops = []; }
    const pieces = [];
    for (const l of loops) {
      const a = Math.abs(polyArea([l]));
      if (a >= MIN_PIECE) pieces.push({ loop: l, area: a });
    }
    const area = pieces.reduce((t, q) => t + q.area, 0);
    perSection.set(s.id, { area, pieces });
    total += area;
  }
  return { perSection, total, remaining: rm.model.loops };
}

// Nakreslená kontura smí úsek zopakovat (uživatelův díl: na konci znovu
// `G0 X9.117 Z243.123 → G1 X50.081 Z234.99`). Obrys dílu by se tím zkřížil
// a materiál u osy by vypadal jako zbytek — opakovaný úsek se vynechá.
function dropRepeats(segs) {
  const key = (a, b) => `${a.x.toFixed(3)},${a.z.toFixed(3)}|${b.x.toFixed(3)},${b.z.toFixed(3)}`;
  const seen = new Set();
  return (segs || []).filter(sg => {
    if (!sg || !sg.p1 || !sg.p2) return true;
    const k1 = key(sg.p1, sg.p2), k2 = key(sg.p2, sg.p1);
    if (seen.has(k1) || seen.has(k2)) return false;
    seen.add(k1);
    return true;
  });
}

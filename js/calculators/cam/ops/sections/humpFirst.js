// ╔══════════════════════════════════════════════════════════════╗
// ║  „Nepřejíždět mezi hrby" — pořadí ✂ Po úsecích u údolí polotovaru ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 12. 11. 2026 (soustruh zleva, odlitek se dvěma hrby nad údolím
// polotovaru S8 X126 Z459): vrstvy podélného hrubování jely přes oba hrby
// a mezi nimi přejížděly rychloposuvem (`G0 Z585.810`). Přání: *„bral by se
// napřed ten první hrb a zanořovalo se až do hloubky [dna údolí]. Pak by se
// dodělal ten druhý hrb a teprve pak by se dodělalo to zanořování od toho
// bodu, ať to tam ten druhý hrb nepřeruší, a to zanoření může jít až úplně
// dolů."*
//
// Plán úseků s volbou dostane i hranici na dně údolí polotovaru
// (stockValleys.js, jako karusel a Cik cak) a kroky se přeskládají:
//   1. úsek před údolím jen do dna údolí (xTo = F),
//   2. úsek za údolím jen do dna údolí (xTo = F),
//   3. oba úseky vcelku pod dnem údolí (`depthCap` = F: vrstvy jen do F,
//      polotovar zůstává celý — rychloposuvy dál vidí i zbytky nad F),
//   4. další úseky beze změny.
// Jen podélné hrubování na soustruhu (karusel a Cik cak mají vlastní pořadí
// údolí — `valleyFloor`, zigzagRough.js), a jen se zapnutou volbou: o tom
// rozhoduje volající (sim/humpFirstOption.js, v cam/ jen calculatePipeline.js).

const near = (a, b) => Math.abs(a - b) < 0.01;

/**
 * Přeskládá kroky ze `sectionRanges` podle hranic na údolí polotovaru.
 * @param on     platí volba (sim/humpFirstOption.js `humpFirstOn`)
 * @param plan   `calc.sectionPlan` (hrany `edges` se `stockValley`, x = dno údolí)
 * @param steps  kroky `sectionRanges` v pořadí obrábění
 * @returns nové kroky (beze změny, když volba neplatí nebo údolí není)
 */
export function humpFirstSteps(on, plan, steps) {
  if (!on || !Array.isArray(steps) || steps.length < 2) return steps;
  const valleys = (plan && Array.isArray(plan.edges) ? plan.edges : [])
    .filter((e) => e && e.stockValley && Number.isFinite(e.z) && Number.isFinite(e.x));
  if (valleys.length === 0) return steps;
  const out = [];
  const shared = (a, b) => (near(a.zLo, b.zHi) ? a.zLo : near(a.zHi, b.zLo) ? a.zHi : null);
  const clean = (st) => { const s = { ...st }; delete s.valleyFloor; delete s.valleyStart; return s; };
  for (let i = 0; i < steps.length; i++) {
    const a = steps[i], b = steps[i + 1];
    const z = b ? shared(a, b) : null;
    const v = z === null ? null : valleys.find((e) => near(e.z, z));
    if (!v) { out.push(clean(a)); continue; }
    // Ø jako v sectionRanges.js (název kroku); mřížka hloubek = vrch obou úseků,
    // aby kroky pokračovaly v téže mřížce jako úsek bez rozdělení (jinak na
    // osazení S13–S15 zůstaly 2 mm: vrstva X191,2 místo X190).
    const F = v.x, d = (2 * F).toFixed(1);
    const tops = (plan.sections || []).filter((s) => s.id === a.id || s.id === b.id).map((s) => s.top).filter(Number.isFinite);
    const gridTop = tops.length ? Math.max(...tops) : undefined;
    const floorOf = (st) => (Number.isFinite(st.xTo) ? Math.max(st.xTo, F) : F);
    out.push({ ...clean(a), xTo: floorOf(a), gridTop, name: `Úsek ${a.id} (do Ø${d})` });
    out.push({ ...clean(b), xTo: floorOf(b), gridTop, name: `Úsek ${b.id} (do Ø${d})` });
    const zLo = Math.min(a.zLo, b.zLo), zHi = Math.max(a.zHi, b.zHi);
    const lo = [a.xTo, b.xTo].filter(Number.isFinite);
    out.push({
      id: a.id, zLo, zHi, xTo: lo.length ? Math.min(...lo) : null, depthCap: F, gridTop,
      name: `Úsek ${a.id}+${b.id} (pod Ø${d})`,
    });
    i++;   // b je zpracovaný
  }
  return out.map((s, k) => (k > 0 ? { ...s, afterPrev: true } : s));
}

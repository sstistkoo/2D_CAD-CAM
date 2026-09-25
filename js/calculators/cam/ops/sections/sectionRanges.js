// ╔══════════════════════════════════════════════════════════════╗
// ║  „DRÁHY PO ÚSECÍCH" — rozsah 📐 pro každý krok plánu            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Generátor po úsecích = to, co uživatel 25. 9. 2026 udělal ručně přes
// „➕ Operace": pro každý úsek nastavit rozsah obrábění na jeho hranice,
// vygenerovat dráhy stávajícím hrubováním a obrobený polotovar předat dalšímu
// úseku. Tady se jen spočítá, JAKÉ rozsahy a v jakém pořadí (pravidlo 8);
// samotnou smyčku drží simulátor (camSimulator.js → handleSectionPaths).
//
// Vše v REÁLNÉM světě (plán úseků už je zpátky ze zrcadla), stejně jako
// `S.zLimits`.

const MARGIN = 5;   // krajní úsek: o kolik mm za konec polotovaru sahá rozsah

/**
 * @param plan       `calc.sectionPlan`
 * @param stockZ     `{ lo, hi }` rozsah polotovaru v Z
 * @param userRange  `{ zLo, zHi }` uživatelův rozsah 📐, nebo null
 * @returns kroky `{ id, name, zLo, zHi, xTo }` v pořadí obrábění; xTo = do
 *          jakého X (poloměr) se v kroku jede, null = až na dno
 */
export function sectionRanges(plan, stockZ, userRange = null) {
  if (!plan || !Array.isArray(plan.sections) || plan.sections.length === 0) return [];
  const topZ = Math.max(...plan.sections.map(s => s.zHi));
  const botZ = Math.min(...plan.sections.map(s => s.zLo));
  const byId = new Map(plan.sections.map(s => [s.id, s]));
  const out = [];
  for (const st of plan.steps || []) {
    const s = byId.get(st.id);
    if (!s) continue;
    // Krajní úsek sahá až za konec polotovaru — materiál za koncem dílu
    // (čelo, přesah odlitku) patří jemu.
    let zHi = s.zHi === topZ ? Math.max(s.zHi, stockZ.hi + MARGIN) : s.zHi;
    let zLo = s.zLo === botZ ? Math.min(s.zLo, stockZ.lo - MARGIN) : s.zLo;
    if (userRange) {
      zHi = Math.min(zHi, userRange.zHi);
      zLo = Math.max(zLo, userRange.zLo);
    }
    if (!(zHi - zLo > 0.5)) continue;          // úsek je celý mimo rozsah
    const xTo = Number.isFinite(st.xTo) ? st.xTo : null;
    const name = `Úsek ${s.id}` + (xTo !== null ? ` (do Ø${(2 * xTo).toFixed(1)})` : '');
    out.push({ id: s.id, name, zLo: round(zLo), zHi: round(zHi), xTo });
  }
  return out;
}

const round = (v) => Math.round(v * 1000) / 1000;

// Vyložení tyče v díře (doplnění pravidla 13, schválil uživatel 22. 10. 2026,
// JEN HLÁŠENÍ): leží-li špička hlouběji od ústí než 4 × ⌀ ocelové tyče, dráha
// se vydá a ⚠ upozorní na chvění. Platí pro vyvrtávání, zápich v díře
// i vnitřní závit. ⌀ tyče = šířka držáku vnitřního nože (📚 katalog ji tam
// ukládá, viz isoInternalTools.js); vlastní nůž bez příznaku vnitřního se nehlídá.

/** Ocelová tyč snese vyložení asi 4 × ⌀ (tvrdokovová 6 ×). */
export const STEEL_BAR_OVERHANG = 4;

const cz = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

/**
 * @param prms   parametry CAM (toolInternal, holderWidth = ⌀ tyče)
 * @param depth  jak hluboko od ústí díry leží špička nejdál [mm]
 * @returns text hlášení, nebo null
 */
export function barOverhangNote(prms, depth) {
  if (!prms || prms.toolInternal !== true) return null;
  const d = parseFloat(prms.holderWidth);
  if (!(d > 0) || !(depth > 0)) return null;
  const max = STEEL_BAR_OVERHANG * d;
  if (depth <= max + 1e-6) return null;
  return `Vyložení tyče: špička jde ${cz(depth)} mm hluboko do díry, ocelová tyč ⌀${cz(d)} snese asi ${cz(max)} mm (4 × ⌀) — hrozí chvění. Zvol tlustší nebo tvrdokovovou tyč, případně zmenši posuv a záběr.`;
}

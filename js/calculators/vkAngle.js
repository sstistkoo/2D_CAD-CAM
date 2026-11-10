// SKICA – VK: převod polárního úhlu PA mezi zápisem uživatele a řešičem
//
// Řešič (vkSolver.js) a polarDelta() měří úhel ve strojové rovině od osy +Z směrem k +X
// (Z = cos, X = sin). Na soustruhu je Z vodorovně doprava, takže PA 0° = doprava a úhel
// roste proti směru hodin – a tak ho i zapisuje uživatel.
//
// Na karuselu je Z svisle (nahoru) a X vodorovně, takže stejné měření dávalo 0° = nahoru
// a smysl po směru hodin. Uživatel tam zadává jako všude jinde v appce: od vodorovné
// osy → proti směru hodin (90° = nahoru). Mezi oběma zápisy je zrcadlení přes úhlopříčku:
// θ = 90° − A. Je to involuce, takže jeden převod slouží oběma směry.
//
// Vnitřně (parseVkLine, el.pa, solver, náhled) je vždy úhel řešiče; převádí se jen na
// hranici s textem programu a s políčky formuláře. Zrcadlení os (flipX/flipZ) se tu
// neuplatňuje: VK počítá ve strojové rovině, ne na obrazovce.

import { state } from '../state.js';

const r9 = v => Math.round(v * 1e9) / 1e9;

/** Úhel v zápisu uživatele ↔ úhel řešiče (stejná funkce pro oba směry). */
export function vkAngleSwap(a, karusel = state.machineType === 'karusel') {
  if (!karusel || a == null || !Number.isFinite(a)) return a;
  return r9(90 - a);
}

/** Popisek reference úhlu PA pro nápovědu u pole. */
export function vkAngleHint(karusel = state.machineType === 'karusel') {
  return karusel ? 'od vodorovné osy →, proti směru hodin; 90 = nahoru (+Z)' : 'od osy +Z (vodorovně →), proti směru hodin';
}

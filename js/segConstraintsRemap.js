// Přečíslování vazeb segmentů kontury (segConstraints) po změně jejích
// vrcholů. Vazba (vodorovně / svisle / rovnoběžně) je uložená pod indexem
// segmentu; když rozdělení, ořez nebo smazání segmentu konturu přečísluje,
// musí vazba zůstat u svého segmentu – jinak se ukazuje na jiném místě a
// propagateConstraints() pak „vyrovná" úplně jiný segment.

/**
 * @param {Record<number,string>|null|undefined} oldSC původní vazby
 * @param {number[]} oldIdxOfNew  pro každý nový segment j index původního segmentu
 * @returns {Record<number,string>|null}
 */
export function remapSegConstraints(oldSC, oldIdxOfNew) {
  if (!oldSC) return null;
  const sc = {};
  oldIdxOfNew.forEach((oi, j) => { if (oi != null && oldSC[oi]) sc[j] = oldSC[oi]; });
  return Object.keys(sc).length ? sc : null;
}

/** Zapíše přečíslované vazby do objektu (prázdné = vlastnost smaže). */
export function setSegConstraints(target, sc) {
  if (sc) target.segConstraints = sc;
  else delete target.segConstraints;
}

/** Indexy a, a+1, …, b-1. */
export const idxRange = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

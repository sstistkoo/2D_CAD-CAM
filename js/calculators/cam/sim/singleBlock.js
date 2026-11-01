// SINGLE BLOCK (SBL): kam až přehrávání smí dojet — konec DALŠÍHO bloku
// G-kódu od aktuální pozice. Vyňato z camSimulator.js (obří soubor), ať ho
// může volat i přepnutí SBL za běhu (uživatel 1. 11. 2026: „když zapnu SBL,
// když mi jede program, tak se nezastaví po dokončeném řádku").

/**
 * @param simPath  dráha simulace (body s `originalLineIdx`)
 * @param progress aktuální pozice 0…1
 * @returns cílová pozice 0…1 (konec bloku, který právě běží)
 */
export function nextBlockTarget(simPath, progress) {
  const total = simPath.length - 1;
  if (total <= 0) return 1;
  const currentSimIdx = Math.floor(progress * total);
  const currentLineIdx = simPath[currentSimIdx]?.originalLineIdx ?? -1;
  for (let i = currentSimIdx + 1; i <= total; i++) {
    const li = simPath[i].originalLineIdx;
    if (li != null && li > currentLineIdx) return i / total;
  }
  return 1;
}

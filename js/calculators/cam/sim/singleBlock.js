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
  // Tolerance: po SBL stojí přehrávání PŘESNĚ na i/total, jenže
  // floor(i/total·total) vyjde u části i jako i − 1 (plovoucí čárka; 48 z 8000).
  // Pak se brala za aktuální předchozí řádek, cíl vyšel na místě a ▶ „nereagoval"
  // (uživatel 1. 11. 2026: N1160, N1340, N230, N360, N620…).
  const currentSimIdx = Math.min(total, Math.floor(progress * total + 1e-7));
  const currentLineIdx = simPath[currentSimIdx]?.originalLineIdx ?? -1;
  for (let i = currentSimIdx + 1; i <= total; i++) {
    const li = simPath[i].originalLineIdx;
    if (li != null && li > currentLineIdx) return i / total;
  }
  return 1;
}

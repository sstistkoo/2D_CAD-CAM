// ČELNĚ: dojezd „bez schodků“ nesmí jet do MEZERY po vyhozeném průchodu.
//
// Dojezd (`contourLeadOut`) se počítá při vzniku průchodu a sloupává schod, který
// po sobě nechala PŘEDCHOZÍ vrstva (z + krok). Hlídání plátku/držáku ale může
// předchozí vrstvu potom vyhodit (plátek se do stěny nevejde). Schod tam pak
// nevznikl — dojezd by jel po obrysu do neobrobeného polotovaru, tedy plnou
// šířkou nosu a o celý krok (díl uživatele 12. 10. 2026, `N2410 G1 X18.943
// Z168.168`: první průchod za přírubou a krčkem zajel 7,8 mm do plného materiálu
// a pak „dobíral schodek, který tam není“).
//
// Použití: před hlídáním `before = faceZs(passes)`, po něm
// `dropLeadOutOverGap({ passes, before, faceLeft, step })`.

/** Z všech čelních průchodů (snímek před hlídáním). */
export function faceZs(passes) {
  return passes.filter(p => p.type === 'face').map(p => p.z);
}

/**
 * Smaže dojezd průchodu, jehož předchozí vrstva (do `step` od něj, směrem
 * k obrobené straně) byla hlídáním vyhozena. Vrací počet smazaných dojezdů.
 */
export function dropLeadOutOverGap({ passes, before, faceLeft, step }) {
  const dir = faceLeft ? -1 : 1;   // směr k obrobené straně (zprava +Z)
  const now = faceZs(passes);
  const gone = before.filter(z => !now.some(q => Math.abs(q - z) < 0.02));
  if (gone.length === 0) return 0;
  let n = 0;
  for (const p of passes) {
    if (p.type !== 'face' || !p.contourLeadOut) continue;
    const over = gone.some(z => dir * (z - p.z) > 0.02 && dir * (z - p.z) <= step + 0.02);
    if (over) { delete p.contourLeadOut; n++; }
  }
  return n;
}

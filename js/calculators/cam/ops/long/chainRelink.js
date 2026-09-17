// ╔══════════════════════════════════════════════════════════════╗
// ║  OSIŘELÝ KROK ZANOŘOVACÍHO ŘETĚZU → SAMOSTATNÝ VJEZD          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// PROBLÉM (nález uživatele 17. 9. 2026): `N850 G1 X40.545 Z196.820 F0.25
// ; Zanoření 45.0°` sjede POSUVEM o 21 mm hloubky naráz a odebere při tom
// 269 mm² — tedy osminásobek Hloubky záběru (ap 2,5) v jediné třísce.
// *„Tady mně to zanořuje naráz a sjede celé zanoření po pár vrstvách naráz,
// taky chybí dodržení ap."*
//
// PROČ K TOMU DOJDE. Průchod označený `pocketReposition` NENÍ samostatný
// nájezd — je to POKRAČOVÁNÍ zanořovacího řetězu. Emise ho proto vydá jako
// přesun na `rampFeedFrom` v aktuální hloubce, protože předpokládá, že tam
// nástroj po předchozím kroku téhož řetězu STOJÍ. Když předchůdce v poli
// `passes` není, je ten předpoklad lež: přesun vede plným materiálem a
// `emitFeedToDepth` z něj udělá jednu dlouhou rampu.
//
// Řetěz se přitom staví SPRÁVNĚ — změřeno na dílu uživatele: osm kroků po
// 2,5 mm (55,545 → 53,045 → … → 40,545 → 38,984). Do výsledných `passes` se
// ale dostane jen ten poslední — ostatní cestou vypadnou (viz níž).
// Dokud se ta příčina nespraví, nesmí osiřelý krok aspoň LHÁT emisi.
//
// KDO ŘETĚZ ROZTRHNE: měřeno na dílu uživatele — ořez podle Z-LIMITŮ
// (čelisti/koník) v `calculatePipeline.js`. Ten vyhodí průchody mimo zónu
// (na tom dílu 7) a mezi nimi i kroky řetězu. Proto tenhle modul běží AŽ ZA
// ním; dřív v pipeline hlásí nula osiřelých, protože tam řetěz ještě celý je.
//
// CO TENHLE MODUL DĚLÁ — dvě větve podle toho, jestli kroku zbyl vlastní řez:
//   • `zStart ≈ zEnd` (jen nájezd, nic neobrábí) → krok se ZAHODÍ. Poslat
//     nástroj na hloubku kvůli nulovému řezu stálo na dílu uživatele 189 mm²
//     vnoření DRŽÁKU (náhradní obdélník) — změřeno, proto ta větev.
//   • jinak → přepíše se na SAMOSTATNÝ vjezd, týmž způsobem jako PRVNÍ krok
//     řetězu (`roughLong.js`, větev `first`): rampa začne na povrchu offsetové
//     čáry polotovaru, nejvýš však o JEDNU Hloubku záběru výš.
//
// Hlídá to `tests/cam-ramp-chain` — týž invariant („`pocketReposition` má
// předchůdce"), jen se teď dá splnit i zahozením/přepsáním kroku.

/** Tolerance, se kterou se kotva řetězu porovnává s předchůdcem (mm). */
const LINK_TOL = 0.01;
/** Pod tímhle už krok nic neobrábí (mm). */
const CUT_EPS = 0.05;

/**
 * Sedí krok `p` na konci předchozího kroku téhož řetězu?
 * Kotva `rampFeedFrom` se kopíruje z (x, zStart) předchůdce, takže se
 * porovnává přesně — tolerance je jen na zaokrouhlení.
 */
function linkedToPrev(p, prev, isParting) {
  if (!prev || !p.rampFeedFrom) return false;
  if (Math.abs(prev.x - p.rampFeedFrom.x) > LINK_TOL) return false;
  // Upichovák řetězí jinak: přesun jde v úrovni předchozího dna rovnou na
  // NOVÉ zápichové Z (viz `roughingStrategies.js`, větev `isParting`).
  if (isParting && Math.abs(p.zStart - p.rampFeedFrom.z) <= LINK_TOL) return true;
  return Math.abs(prev.zStart - p.rampFeedFrom.z) <= LINK_TOL;
}

/**
 * Přepíše osiřelé kroky řetězu na samostatné vjezdy s rampou nejvýš `step`.
 *
 * @param {Array} passes    průchody (mění se na místě)
 * @param {object} o
 * @param {number} o.step             Hloubka záběru (ap)
 * @param {number} o.plungeTan        tangens úhlu zanoření
 * @param {(z:number)=>number|null} o.surfaceXAtZ  povrch offsetové čáry polotovaru
 * @param {boolean} [o.isParting]     upichovák řetězí jinak
 * @returns {number} kolik kroků se přepsalo
 */
export function relinkOrphanChainSteps(passes, { step, plungeTan, surfaceXAtZ, isParting = false }) {
  if (!Array.isArray(passes) || !(step > 0) || !(plungeTan > 1e-9)) return 0;
  let fixed = 0;
  for (let i = 0; i < passes.length; i++) {
    const p = passes[i];
    if (!p || !p.pocketReposition || !p.rampFeedFrom) continue;
    if (linkedToPrev(p, passes[i - 1], isParting)) continue;
    // OSIŘELÝ BEZ VLASTNÍHO ŘEZU → PRYČ. Krok řetězu, kterému zbyl jen
    // nájezd (`zStart ≈ zEnd`), po ztrátě předchůdců nic neobrábí — existuje
    // jen proto, aby se po rampě navázalo. Přepsat ho na samostatný vjezd
    // znamená poslat nástroj na hloubku kvůli nulovému řezu, a na dílu
    // uživatele to změřeně stálo 189 mm² vnoření DRŽÁKU (náhradní obdélník).
    // Zahodit ho je levnější i bezpečnější; materiál pod ním dobere sousední
    // vrstva nebo jiná operace.
    if (Math.abs(p.zStart - p.zEnd) < CUT_EPS) {
      passes.splice(i, 1);
      i--; fixed++;
      continue;
    }
    // OSIŘELÝ SE ŘEZEM. Ze samostatného vjezdu smí rampa začít nejvýš o `step` výš —
    // nad tím materiál sebrala předchozí vrstva, takže by rampa jela dávno
    // vyčištěným prostorem (týž strop jako u prvního kroku řetězu).
    const surf = surfaceXAtZ ? surfaceXAtZ(p.zStart) : null;
    const x0 = (surf !== null && surf > p.x + 0.05)
      ? Math.min(surf, p.x + step)
      : p.x;
    p.ramp = (x0 > p.x + 0.05)
      ? { x0, z0: p.zStart + (x0 - p.x) / plungeTan }
      : { x0: p.x, z0: p.zStart };
    delete p.pocketReposition;
    delete p.rampFeedFrom;
    fixed++;
  }
  return fixed;
}

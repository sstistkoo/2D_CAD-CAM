// ╔════════════════════════════════════════════════════════════╗
// ║  UZAVÍRACÍ RAMPA NEJEDE PO UŽ VYŘÍZNUTÉ PŘÍMCE                ║
// ╚════════════════════════════════════════════════════════════╝
// První krok dobíracího řetězu ramp (`rampCompletion`, roughLong.js) má
// kotvu v materiálu a jeho rampa se proto prodlužuje po TÉŽE přímce
// zanoření nahoru — nejvýš o Hloubku záběru (ap), a to podle povrchu
// polotovaru PŘED úsekem (`offsetStockTopXAtZ`). Ten ale neví, že mělčí
// vrstva po té přímce už sjela: ořízlá rampa v openPass končí PŘESNĚ na
// kotvě řetězu. Rampa pak jela celou ap posuvem po vyříznuté dráze
// (pravidlo 5) místo aby začala tam, kde skončilo předchozí zanoření
// (pravidlo 10.3).
//
// Nález uživatele 30. 9. 2026 (`projekt_2026-09-30.camprog`, úsek 2,
// polygon 15°): `N2870 G1 X41.730` na Z 124,404 a `N2880 G1 X37.197
// Z107.486 ; Rampa 15.0°`, přitom „Průchod 4" tutéž přímku sjel až na
// X 39,23 Z 115,074. *„Proč mi tady dráha nezačíná tam, kde skončilo
// předchozí zanořování, ale bere to zvrchu?"*
//
// PROČ AŽ NAKONEC: podlaha se staví z průchodů, které se provedou PŘED
// rampou, a to v KONEČNÉ podobě. Za plánováním řetězu ještě hlídání
// destičky (`insertFlankGuard.js`) posouvá kotvy ramp kapes doleva —
// na úseku 1 téhož dílu o 0,075 mm, takže nad přímkou řetězu zůstal
// proužek 0,02 mm. Podlaha z okamžiku plánování ho neviděla a nástroj by
// ke kotvě sjel kolmo skrz něj (P6). Totéž přeskládání přes hrb.
//
// Rampa začne nad nejvyšším sloupcem, kde nad přímkou ještě stojí materiál.
// Je-li vyříznutá celá (i sloupec kotvy), začne přímo na kotvě a nástroj
// k ní sjede vyčištěným sloupcem. Níž než na kotvu se nikdy nejde.

const CUT_TOL = 0.01;   // mm nad přímkou, co se ještě bere jako materiál

/**
 * Zkrátí prodloužené rampy prvních kroků řetězu (značka `__rampAnchor`
 * = kotva {x, z}) na zbývající materiál. Značku smaže u všech průchodů.
 * Mění `passes` na místě; vrací počet zkrácených ramp.
 *
 * @param {Array} passes           hotové průchody v pořadí obrábění
 * @param {object} o
 * @param {object} o.T             výškové tabulky z `makeDepthTabs()`
 * @param {number} o.noseLiftX     o kolik leží povrch pod dráhou (kulatá R)
 * @param {number} o.plungeTan     tangens úhlu zanoření
 * @param {(z:number)=>number|null} o.stockTopAt  offsetová čára polotovaru
 */
export function trimChainRampsOverCut(passes, { T, noseLiftX, plungeTan, stockTopAt }) {
  let tab = null, synced = 0, trimmed = 0;
  for (let i = 0; i < passes.length; i++) {
    const p = passes[i];
    const a = p && p.__rampAnchor;
    if (!a) continue;
    delete p.__rampAnchor;
    if (!p.ramp || p.pocketReposition || !(p.ramp.x0 > a.x + 0.05) || !(plungeTan > 1e-9)) continue;
    if (!tab) tab = T.newFloorTab();
    if (!tab) continue;
    for (; synced < i; synced++) T.notePassInto(tab, passes[synced]);
    // Stojí v sloupci i nad přímkou (výška lx) materiál?
    const standsAbove = (k, lx) => {
      if (k < 0 || k >= tab.length) return false;
      const st = stockTopAt(T.capZ0 + k * T.DZ_CAP);
      return st !== null && Math.min(st, tab[k] - noseLiftX) > lx + CUT_TOL;
    };
    const kAnchor = Math.floor((a.z - T.capZ0) / T.DZ_CAP);
    if (standsAbove(kAnchor, a.x)) continue;
    const kTop = Math.floor((p.ramp.z0 - T.capZ0) / T.DZ_CAP);
    let x0 = a.x;
    for (let k = kAnchor + 1; k <= kTop; k++) {
      const lx = a.x + (T.capZ0 + k * T.DZ_CAP - a.z) * plungeTan;
      if (standsAbove(k, lx)) x0 = Math.min(p.ramp.x0, lx + T.DZ_CAP * plungeTan);
    }
    if (x0 > p.ramp.x0 - 1e-6) continue;
    p.ramp = x0 > a.x + 0.05
      ? { x0, z0: a.z + (x0 - a.x) / plungeTan }
      : { x0: a.x, z0: a.z };
    trimmed++;
  }
  return trimmed;
}

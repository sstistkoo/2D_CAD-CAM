// ╔═════════════════════════════════════════════════╗
// ║  Kde smí ZAČÍT a kam smí DOJET zanořovací rampa               ║
// ╚═════════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.
//
// Pět dotazů kolem KOTVY zanoření:
//   • `holderEntryCapZ`    — nejpravější Z, kde se rampa vejde a držák taky,
//   • `holderEntryReachZ`  — kam až se kotva smí posunout ZA hranici úseku,
//   • `stockEntryRamp`     — kotva zvednutá po přímce zanoření na plánovací
//                            obrys (vjezd začíná na tečkované hranici),
//   • `findRampOutTarget`  — zrcadlo: kam rampa DOJEDE, než opustí siluetu,
//   • `findSteepCorner`    — roh, kde sklon obrysu dosáhne úhlu zanoření.
//
// `blockedAt` přichází z `runScan.js`, který se staví DŘÍV (závisí jen na
// offsetu kontury a siluetě polotovaru). Pořadí továren v generátoru proto
// není libovolné: runScan → depthTabs → residualGuard → holderFit →
// entryRamp → intervalScan.

import { pointInLoop } from '../../../../geom/geomCore.js';

/**
 * @param T                  výškové tabulky z `makeDepthTabs()`
 * @param holderFitsAt       test „vejde se držák?" z `makeHolderFit()`
 * @param stockLoopOffsetL   vůlí-posunutá silueta polotovaru (v rozsahu 📐)
 * @param plungeDirL         směr přímky zanoření + krok skenu
 * @param effPlungeTanL      tangenta efektivního úhlu zanoření
 * @param rangeZLoL          dolní mez rozsahu obrábění 📐
 * @param offsetXAt          hloubka offsetu kontury na Z
 * @param blockedAt          (x, z) => je tam překážka? — viz hlavička
 */
export function makeEntryRamp({
  T, holderFitsAt, stockLoopOffsetL, plungeDirL, effPlungeTanL, rangeZLoL,
  offsetXAt, blockedAt,
}) {
  const { DZ_CAP, capTab, stockTopTab } = T;
  const holderEntryCapZ = (X, zHi, zFloor) => {
    if (!capTab || zHi - zFloor < 0.1) return -Infinity;
    for (let z = zHi; z > zFloor; z -= DZ_CAP) {
      const top = stockTopTab(z);
      if (top === null || top <= X + 0.05) continue;              // vzduch / už pod hloubkou
      if (z - (top - X) / effPlungeTanL <= zFloor + 0.05) continue;   // (a) rampa se nevejde
      // (b) vejde se DRŽÁK — a to V HLOUBCE, na kterou rampa dosedne.
      // Rampa se tu ZÁMĚRNĚ nepočítá jako vlastní řez (na rozdíl od kapsy):
      // vykope si jen svou čáru, kdežto držák je v ose Z 20 mm široký, takže
      // odečíst mu celý pás je moc velkorysé — zkoušeno a zamítnuto, pustilo
      // to kotvy, na kterých holder-region-roughing, part-15-finish-zprava
      // a range-end-leadout vyrobily 4–6 nových kolizí (až 87,9 mm²).
      if (holderFitsAt(z, top)) return z;                          // (b) držák se vejde
    }
    return -Infinity;
  };
  // Protipól `holderEntryCapZ`: kam až se kotva zanoření smí posunout ZA
  // hranici úseku, aby sebrala co nejvíc materiálu.
  //
  // Hranice úseku leží ve STŘEDU dna údolí, takže kotva na ní vjíždí
  // doprostřed volného prostoru a půlka údolí zůstane stát — opakovaný nález
  // uživatele („bere to od prostředka"). Posunout SAMOTNOU HRANICI se dvakrát
  // nepovedlo (viz „ZBÝVÁ — hranice úseku" v docs/geometry-libs-migration.md):
  // hranice určuje, komu materiál PATŘÍ, a její posun rozbíjel pokrytí jinde.
  // Tohle vlastnictví nemění — posouvá jen KOTVU RAMPY. Je to bezpečné, protože
  // úseky jdou po řadě odshora: materiál za hranicí (větší z) UŽ JE OBROBENÝ,
  // takže rampa tudy jede vzduchem a do vrstvy vjede od kraje údolí místo
  // z jeho středu.
  const holderEntryReachZ = (X, zFrom, zCeil, zFloor) => {
    if (!capTab || !(zCeil > zFrom)) return zFrom;
    let best = zFrom;
    for (let z = zFrom + DZ_CAP; z <= zCeil + 1e-9; z += DZ_CAP) {
      const top = stockTopTab(z);
      if (top === null || top <= X + 0.05) break;      // vzduch / pod hloubkou → dál nemá smysl
      if (z - (top - X) / effPlungeTanL <= zFloor + 0.05) break;   // rampa by se nevešla
      if (!holderFitsAt(z, top)) break;                // dál už na držák není místo
      best = z;
    }
    return best;
  };

  // Rampa od hranice polotovaru: když vstup průchodu leží v KŮŘE odlitku,
  // kotva se zvedne po přímce zanoření až NA PLÁNOVACÍ OBRYS (vůlí-posunutou
  // siluetu) — posuv začíná na tečkované hranici a kůra se řeže pod úhlem
  // zanoření (žádný kolmý sjezd doprostřed kůry). Null = vstup je ve vzduchu.
  //
  // Testuje se přímo proti OFFSETOVÉ smyčce, žádné ruční přičtení vůle na
  // konci nalezené přímky: to na diagonále není totéž co posun KOLMO
  // k hranici (přesně stejná oprava jako u zrcadlového findRampOutTarget
  // níž). Konec se dopřesní půlením, ať kotva sedne PŘESNĚ na čáru, ne
  // o krok skenu (0,5 mm) dál.
  //
  // ── KOTVA PATŘÍ NA POVRCH ZBYTKU, NE NA SYROVÝ ODLITEK (1. 9. 2026) ─────
  // Silueta odlitku neví nic o POŘADÍ: nad vrstvou, kterou právě plánujeme,
  // je po mělčích průchodech vzduch, ale `stockLoopOffsetL` tam pořád hlásí
  // plný materiál. Kotva se proto šplhala až na povrch surového odlitku a
  // rampa odtud vyšla desítky mm dlouhá — celá vzduchem, pracovním posuvem.
  // Reálný nález uživatele 1. 9. 2026: `N450 G1 X49.545 Z214.472 ; Rampa
  // 15.0°` začínal na Z 258,4 (44 mm), `N2860 G1 X31.545 Z−1.009` na Z 19,1
  // (20 mm) — „rampy jedou odzhora, což je blbost".
  //
  // `residTopSafe` = povrch ZBÝVAJÍCÍHO materiálu: nižší z offsetové čáry
  // polotovaru a už vyříznuté podlahy (`cutFloorTab`, tentýž líný prefix
  // `passes`, jaký používá hlídání držáku). Ze dvou sousedních vzorků se bere
  // VYŠŠÍ hodnota podlahy — kotva tak radši vyjede o kus výš, než aby sedla
  // POD povrch, kam pak nesmí rychloposuv (opačné zaokrouhlení než
  // `residTopAt` v holderFit.js, kde je bezpečná strana ta druhá).
  const residTopSafe = (z) => {
    const t = stockTopTab(z);
    if (t === null) return null;
    if (!T.activeFloorTab) T.syncCutFloor();
    const tab = T.activeFloorTab || T.cutFloorTab;
    if (!tab) return t;
    const fi = (z - T.capZ0) / DZ_CAP;
    let cut = -Infinity;
    for (const i of [Math.floor(fi), Math.floor(fi) + 1]) {
      if (i < 0 || i >= tab.length) continue;
      if (tab[i] > cut) cut = tab[i];
    }
    return cut === -Infinity ? t : Math.min(t, cut);
  };
  const atResidTop = (q) => {
    const top = residTopSafe(q.z);
    return top !== null && q.x >= top - 0.02;
  };
  // ── VZOREK ZE STRANY, ODKUD RAMPA PŘILÉTÁ (4. 9. 2026) ─────────────────
  // `residTopSafe` bere z dvojice sousedních vzorků VYŠŠÍ hodnotu. Pro dotaz
  // „smí sem rychloposuv?" je to správně, pro STOUPAJÍCÍ RAMPU ne: povrch
  // zbytku nad vrstvou tvoří dojezd předchozí vrstvy po kontuře a ten klesá
  // PŘESNĚ pod úhlem zanoření (mezní čára „stínu" břitu se konstruuje pod
  // týmž úhlem — viz `findSteepCorner` níž). Rampa je s ním rovnoběžná a drží
  // se ho přesně, jenže hlášená podlaha je proti ní posunutá o
  // (vzorek − z)·sklon, tedy až `DZ_CAP · tan(úhel)` = 0,067 mm při 15°.
  // Dotyk se pak nevyhodnotí NIKDY a kotva šplhá dál, dokud povrch nezploští.
  //
  // Změřeno na dílu uživatele (rozsah Z 283–458, polygon 15°): kotva vyšla
  // [10,267; −345,766] místo rohu [6,80; −358,69] — o 13 mm dál a 3,5 mm výš,
  // rampa 21,9 mm místo 9,0 mm. A protože o tom rozhodovala jen FÁZE
  // vzorkování, výsledek přeskakoval: ze 24 zkoušených hloubek jich 5 kotvu
  // trefilo a 19 minulo.
  //
  // Vzorek POD bodem je proti stoupající rampě správná strana i u SCHODU:
  // kotva dosedne na nižší podlahu PŘED schodem, kudy rychloposuv opravdu
  // projde, kdežto vyšší vzorek ji pošle až za něj. Práh 0,02 se NEMĚNÍ —
  // povolit rampě 0,087 mm pod hlášenou podlahou (varianta se stejným
  // účinkem) posadí kotvu POD skutečný povrch a hne 11 fixtures místo 5.
  const residTopFrom = (z) => {
    const t = stockTopTab(z);
    if (t === null) return null;
    if (!T.activeFloorTab) T.syncCutFloor();
    const tab = T.activeFloorTab || T.cutFloorTab;
    if (!tab) return t;
    const i = Math.floor((z - T.capZ0) / DZ_CAP);
    const cut = (i >= 0 && i < tab.length) ? tab[i] : -Infinity;
    return cut === -Infinity ? t : Math.min(t, cut);
  };
  const atResidTopRamp = (q) => {
    const top = residTopFrom(q.z);
    return top !== null && q.x >= top - 0.02;
  };
  const stockEntryRamp = (X, zEntry) => {
    if (!stockLoopOffsetL) return null;
    if (pointInLoop({ x: X + 0.05, z: zEntry - 0.05 }, stockLoopOffsetL) !== 'inside') return null;
    // Vstup leží NAD zbytkem (mělčí vrstvy ho odebraly) → žádná kůra k
    // prorampování není; volající si najede po kontuře jako jindy.
    if (atResidTop({ x: X + 0.05, z: zEntry - 0.05 })) return null;
    const at = (t) => ({ x: X + t * plungeDirL.ux, z: zEntry + t * plungeDirL.uz });
    let t = 0;
    for (let i = 0; i < 300; i++) {
      const tPrev = t;
      t += plungeDirL.step;
      const p = at(t);
      // HRANICÍ JE I HOTOVNÍ KONTURA (stejně jako u findRampOutTarget níž):
      // stoupá-li přímka zanoření do materiálu, který po hrubování ZŮSTÁVÁ
      // (boss mezi vstupem a povrchem), vedla by rampa skrz díl. Dřív se
      // testovala jen silueta polotovaru — u kapsy za bossem to dalo rampu
      // zajíždějící 15 mm pod konturu (pocket-wall-at-plunge-angle).
      // Taková rampa neexistuje: null, ať volající zvolí jinou cestu.
      if (blockedAt(p.x, p.z)) return null;
      if (pointInLoop(p, stockLoopOffsetL) === 'outside' || atResidTopRamp(p)) {
        let lo = tPrev, hi = t;
        for (let k = 0; k < 24; k++) {
          const m = (lo + hi) / 2;
          const q = at(m);
          if (pointInLoop(q, stockLoopOffsetL) === 'outside' || atResidTopRamp(q)) hi = m; else lo = m;
        }
        const q = at(hi);
        return { x0: q.x, z0: q.z };
      }
    }
    return null;
  };
  // Zrcadlo stockEntryRamp: z rohu (kde sklon obrysu dosáhl úhlu zanoření,
  // viz findSteepCorner níže) se pokračuje DOLŮ/DOVNITŘ přímkou pod úhlem
  // zanoření, dokud neopustí VŮLÍ-POSUNUTOU siluetu odlitku (stockLoopOffsetL
  // — stejnou offsetovou čáru jako v náhledu/simulátoru, viz
  // planTopXAtZ v gcodeEmit.js). Používá se pro dojezd „bez
  // schodků" u strmé stěny, kde by sledování PŘESNÉHO obrysu
  // (traceOffsetPath) muselo kopírovat celou výšku stěny (reálný nález na
  // díle uživatele — stěna skoro svislá desítky mm, teprve při dně strmě
  // padá). Testuje se přímo proti OFFSETOVÉ siluetě (žádné ruční odečítání
  // vůle na konci) — dřívější verze počítala proti syrové siluetě a na
  // konci odečetla skalární vůli, což na diagonále není totéž co posun
  // KOLMO k hranici → systematicky minula offsetovou čáru.
  // HRANICÍ RAMPY JE I HOTOVNÍ KONTURA: dřív se testovala JEN silueta
  // polotovaru, takže na dílu, kde za údolím kontura zase stoupá, rampa
  // (a navazující dokončovací kroky) vedla přímkou SKRZ díl — reálný nález na
  // díle uživatele: zajezd až 18 mm pod offsetovou čáru hotovní kontury.
  // Latentní od zavedení dojezdu rampou; naplno se projeví, až když rampa může
  // přejet celé údolí (sloučené regiony). Konec se dopřesní půlením, ať rampa
  // dosedne PŘESNĚ na konturu, ne o krok skenu dřív.
  const findRampOutTarget = (cx, cz) => {
    if (!stockLoopOffsetL) return null;
    if (pointInLoop({ x: cx - 0.05, z: cz - 0.05 }, stockLoopOffsetL) !== 'inside') return null;
    const at = (t) => ({ x: cx - t * plungeDirL.ux, z: cz - t * plungeDirL.uz });
    // Konec rozsahu obrábění 📐 je stejná zeď jako kontura: rampa se na něm
    // zastaví (a dál pokračuje leda rovný úsek uvnitř rozsahu), místo aby ho
    // přejela.
    // Svíslý zápich (90°) se v Z nehne — na konec rozsahu nikdy nedojede.
    const tMax = plungeDirL.uz > 1e-9 ? (cz - rangeZLoL) / plungeDirL.uz : Infinity;
    let t = 0;
    for (let i = 0; i < 300; i++) {
      const tPrev = t;
      t += plungeDirL.step;
      if (t >= tMax) return tMax > 1e-6 ? at(tMax) : null;
      const p = at(t);
      if (blockedAt(p.x, p.z)) {
        let lo = tPrev, hi = t;
        for (let k = 0; k < 24; k++) {
          const m = (lo + hi) / 2;
          const q = at(m);
          if (blockedAt(q.x, q.z)) hi = m; else lo = m;
        }
        return lo > 1e-6 ? at(lo) : null;
      }
      if (pointInLoop(p, stockLoopOffsetL) === 'outside') return p;
    }
    return null;
  };
  // Bod, kde sklon OBRYSU (ne naivní sken po 0,05 mm — viz komentář u volání)
  // dosáhne úhlu zanoření a VYDRŽÍ (min. 1 mm), ne jen okrajový hrot na
  // vstupu (napojení currentX → offset kontury bývá krátký a strmý samo o
  // sobě — zaoblení/přechod).
  // Mez sklonu se porovnává s malou tolerancí, a to NENÍ kosmetika: stěna
  // vzniklá GEOMETRIÍ PLÁTKU (mezní čára „stínu" břitu, kterou vkládá
  // buildMachinableContour místo nedosažitelného oblouku) klesá PŘESNĚ pod
  // úhlem zanoření — u automatického úhlu je totiž effPlungeDeg = |Natočení|
  // plátku (getEffectivePlungeAngle), tedy TÝŽ úhel, pod kterým se mezní čára
  // konstruuje. Ostré porovnání (>=) na ní kvůli zaokrouhlení dopadalo o ~1e-5
  // relativně POD mez, takže se roh nenašel NIKDY a dojezd „bez schodků" sjel
  // celou stěnu jedním nekontrolovaným úsekem místo rampy ořízlé na Hloubku
  // (ap) — reálný nález na díle uživatele: zajezd 4,5 mm v X pod hloubku
  // vrstvy a záběr proti polotovaru přes ap. Tolerance 0,1 % tangenty ≈ 0,06°
  // při 15°, tj. fyzikálně nic, ale okrajový případ spolehlivě chytí.
  const steepTanTol = effPlungeTanL * 1e-3;
  const findSteepCorner = (zFrom, zStop) => {
    const h = 0.05, minRun = 20; // 20×0,05 = 1 mm trvalého sklonu
    let runLen = 0, runX = null, runZ = null;
    for (let z = zFrom; z > zStop + h; z -= h) {
      const xa = offsetXAt(z), xb = offsetXAt(z - h);
      if (xa === null || xb === null) { runLen = 0; continue; }
      if ((xa - xb) / h >= effPlungeTanL - steepTanTol) {
        if (runLen === 0) { runX = xa; runZ = z; }
        if (++runLen >= minRun) return { x: runX, z: runZ };
      } else {
        runLen = 0;
      }
    }
    return null;
  };

  return { holderEntryCapZ, holderEntryReachZ, stockEntryRamp, findRampOutTarget,
    findSteepCorner };
}

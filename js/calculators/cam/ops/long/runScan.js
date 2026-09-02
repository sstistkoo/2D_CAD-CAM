// ╔════════════════════════════════════════════╗
// ║  Sken překážek a konce rovných úseků                     ║
// ╚════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.
//
// Nejnižší patro dotazů nad geometrií: „stojí tam překážka?" a „kam až se
// dá jet rovně?". Nezávisí na držáku ani na zbytku materiálu, jen na
// offsetu kontury a siluetě polotovaru — proto se staví jako PRVNÍ
// a `entryRamp`/`intervalScan` ho dostanou hotový.

import { topXOnLoop } from '../../camMath.js';

/**
 * @param offsetXAt            hloubka offsetu kontury na Z
 * @param stockLoopOffsetFullL vůlí-posunutá silueta CELÉHO polotovaru
 */
export function makeRunScan({ offsetXAt, stockLoopOffsetFullL }) {
  // Bez „dobrat najednou": sdílená rampa z rohu kapsy nemusí dosáhnout dál
  // (strmá stěna z hlídání držáku, úzké dno) — hlubší vrstvy by pak emitovaly
  // STEJNÝ zákrok znovu a znovu (nulový progres). Pamatuj si nejlepší
  // dosaženou hloubku na roh a duplicitní zákroky potlač.
  const pocketBestX = new Map();
  const dzScan = 0.2;
  const blockedAt = (X, z) => {
    const offX = offsetXAt(z);
    return offX !== null && offX > X + 0.01;
  };
  // Mezi otevřeným krokem (offset ≤ X) a zablokovaným (offset > X) najdi
  // PŘESNÉ Z dotyku kontury (offset = X), aby průchod skončil rovnou na
  // kontuře a nemusel pak zajíždět pod průměr ("dip") před navazujícím
  // obloukem.
  const refineEngageZ = (X, zOpen, zBlocked) => {
    let hi = zOpen, lo = zBlocked;
    for (let k = 0; k < 24; k++) {
      const m = (hi + lo) / 2;
      const x = offsetXAt(m);
      // null = vzduch (nad čelní stěnou) → patří na otevřenou stranu (hi),
      // aby dotyk konvergoval na první Z, kde kontura skutečně začíná.
      if (x === null) { hi = m; continue; }
      if (x > X + 1e-6) lo = m; else hi = m;
    }
    return hi;
  };
  // Kam až smí jet ROVNĚ (na hloubce X) směrem doleva z bodu zFrom: po první
  // stěnu kontury, jinak na dno okna (zFloor). Stejná sémantika jako konec
  // běžného průchodu ve scanIntervals, jen z jiného výchozího Z — používá
  // dojezd „bez schodků" po dosednutí rampy.
  const straightRunEndZ = (X, zFrom, zFloor) => {
    let z = zFrom;
    while (z > zFloor + dzScan) {
      const zn = z - dzScan;
      if (blockedAt(X, zn)) return refineEngageZ(X, z, zn);
      z = zn;
    }
    // NIKDY ZPÁTKY: dno okna může ležet ZA výchozím bodem (rampa dosedne až
    // za koncem polotovaru — na dílu uživatele dosedla na Z−8,473, zatímco
    // dno okna je Z−8,000). Bez clampu vrátí funkce dno a volající z toho
    // postaví rovný úsek PROTI směru řezu: `G1 Z−8.473` a hned zpátky
    // `G1 Z−8.000`. Řež jede zprava doleva, takže konec nesmí být výš než
    // začátek; když už není kam pokračovat, vrátí se výchozí bod (nulová
    // délka) a volající takový úsek zahodí.
    return Math.min(zFloor, zFrom);
  };
  const stockRunEndZ = (X, zFrom, zFloor) => {
    const solid = (z) => { const t = topXOnLoop(stockLoopOffsetFullL, z); return t !== null && t > X; };
    if (!stockLoopOffsetFullL) return zFloor;
    let prev = zFrom;
    for (let z = zFrom - dzScan; z > zFloor + dzScan; z -= dzScan) {
      if (!solid(z)) {
        let lo = z, hi = prev;                       // lo = vzduch, hi = materiál
        for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (solid(m)) hi = m; else lo = m; }
        return hi;
      }
      prev = z;
    }
    return zFloor;
  };

  // Konec POSLEDNÍHO souvislého materiálu PŘED `zStop` (jede se od `zFrom`
  // dolů a za `zStop` už je hotovo). Zrcadlo `stockRunEndZ`: ten hledá PRVNÍ
  // mezeru, tenhle POSLEDNÍ hranu materiálu — a to je čára, u které má doběh
  // skončit, když za ní pokračovat nemá smysl.
  //
  // PROČ NE `stockRunEndZ`: mezery se přeletět MAJÍ (rozhodnutí 1. 9. 2026,
  // +153,6 mm²) — zastavit na první z nich vrátí vrstvu na Z 31,96, přestože
  // materiál drží až do Z 80,57. Zastavit se má až na TÉ POSLEDNÍ hraně.
  const stockRunBackZ = (X, zFrom, zStop) => {
    if (!stockLoopOffsetFullL) return zStop;
    const solid = (z) => { const t = topXOnLoop(stockLoopOffsetFullL, z); return t !== null && t > X; };
    // U stopky materiál ZPRAVIDLA JE — je to sousední úsek dílu, jen už
    // obrobený, a silueta polotovaru o tom neví. Ten pruh se proto přeskočí
    // a hledá se hrana až ZA první mezerou; bez toho by test „stojí tam
    // materiál?" hned na stopce uspěl a doběh by k ní dojel jako dřív.
    let air = null;
    for (let z = zStop; z <= zFrom + 1e-9; z += dzScan) {
      if (!solid(z)) { air = z; continue; }
      if (air === null) continue;                // ještě pruh u stopky
      let a = air, b = z;                        // a = vzduch, b = materiál
      for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (solid(m)) b = m; else a = m; }
      return b;
    }
    return zStop;                                // souvisle až ke stopce
  };

  return { pocketBestX, dzScan, blockedAt, refineEngageZ, straightRunEndZ, stockRunEndZ, stockRunBackZ };
}

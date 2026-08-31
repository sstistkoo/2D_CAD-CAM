// ╔═════════════════════════════════════════════════════════╗
// ║  Výškové tabulky vzorkované podél Z (podelné hrubovani)          ║
// ╚═════════════════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.
//
// Tři tabulky vzorkované po `DZ_CAP` (0,25 mm), aby se sken okna držáku
// neptal geometrie statisíckrát:
//   • `stockTopTab`   — výška offsetové čáry polotovaru na Z,
//   • `holderBottomAt`— spodní hrana obrysu držáku v odstupu dz od špičky,
//   • `cutFloorTab`   — podlaha už vyříznutá průchody (línný prefix `passes`).
//
// MUTOVANÉ ČLENY (`cutFloorTab`, `cutFloorSynced`, `activeFloorTab`) žijí NA
// vráceném objektu, ne jako lokální `let` — generátor je přepisuje zvenku
// (odložené vjezdy na konci regionu si podstrčí vlastní podlahu). Proto se
// Čtou jako `T.activeFloorTab`, NE destrukturací.

import { topXOnLoop } from '../../camMath.js';
import { holderWorldLoop } from '../../collisionValidator.js';
import { HOLDER_STOCK_GAP } from '../shared.js';

/**
 * @param prms                 parametry CAM
 * @param stockLoopOffsetFullL vůlí-posunutá silueta CELÉHO polotovaru
 * @param passes               živé pole průchodů (líný prefix `syncCutFloor`)
 */
export function makeDepthTabs({ prms, stockLoopOffsetFullL, passes }) {
  const holderLoopL = (prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__)
    ? holderWorldLoop(prms, false) : null;
  const DZ_CAP = 0.25;
  // Axiální dosah držáku od špičky + volný prostor; DZ_CAP navíc kryje
  // zaokrouhlení skenu (hranu hrbu vzorky můžou minout o krok).
  const holderZLoL = holderLoopL ? Math.min(...holderLoopL.map(p => p.z)) - HOLDER_STOCK_GAP - DZ_CAP : 0;
  const holderZHiL = holderLoopL ? Math.max(...holderLoopL.map(p => p.z)) + HOLDER_STOCK_GAP + DZ_CAP : 0;
  // Tabulka výšky offsetové čáry (lookup — sken okna držáku by jinak volal
  // offsetStockTopXAtZ statisíckrát).
  // Tabulka se staví nad CELÝM polotovarem (stockLoopOffsetFullL) — držák
  // narazí i do materiálu za hranicí rozsahu 📐, ten se jen neobrábí.
  let capZ0 = 0, capTab = null;
  if (holderLoopL && stockLoopOffsetFullL && holderZHiL - holderZLoL > 0.05) {
    let tLo = Infinity, tHi = -Infinity;
    for (const p of stockLoopOffsetFullL) { if (p.z < tLo) tLo = p.z; if (p.z > tHi) tHi = p.z; }
    const n = Math.ceil((tHi - tLo) / DZ_CAP) + 1;
    if (n > 1 && n < 40000) {
      capZ0 = tLo;
      capTab = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const t = topXOnLoop(stockLoopOffsetFullL, tLo + i * DZ_CAP);
        capTab[i] = (t === null) ? -Infinity : t;
      }
    }
  }
  // Výška offsetové čáry z tabulky; null = mimo polotovar (vzduch).
  // Bere se VYŠŠÍ z obou sousedních vzorků, ne `Math.round`. Tabulka je po
  // DZ_CAP (0,25 mm) a SVISLÉ ČELO ležící mezi vzorky se zaokrouhlením
  // přichytilo k tomu PRÁZDNÉMU: na part-15 leží plánovací čelo příruby na
  // Z 195,28, vzorek 195,25 hlásí povrch 17,74 — a hlídání držáku tak pustilo
  // vzdálený konec držáku do proužku Z 195,28–195,53, kde plánovací obrys sahá
  // až na X(r) 65,0 (změřeno 10,3 mm² vnoření). Zaokrouhlení „nahoru" nikdy
  // nejde blíž k materiálu, takže je to bezpečná strana.
  const stockTopTab = (z) => {
    if (!capTab) return null;
    const f = (z - capZ0) / DZ_CAP;
    const i0 = Math.floor(f), i1 = i0 + 1;
    let top = null;
    for (const i of [i0, i1]) {
      if (i < 0 || i >= capTab.length || capTab[i] === -Infinity) continue;
      if (top === null || capTab[i] > top) top = capTab[i];
    }
    return top;
  };
  // Spodní hrana obrysu DRŽÁKU v axiální vzdálenosti `dz` od špičky
  // (relativně k hrotu, tedy 0 u špičky a rostoucí dozadu). Tabulka, protože
  // sken okna držáku ji volá statisíckrát.
  let holderBotTab = null;
  if (holderLoopL) {
    const n = Math.ceil((holderZHiL - holderZLoL) / DZ_CAP) + 1;
    if (n > 1 && n < 40000) {
      holderBotTab = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const zz = holderZLoL + i * DZ_CAP;
        let bot = Infinity;
        for (let k = 0; k < holderLoopL.length; k++) {
          const a = holderLoopL[k], b = holderLoopL[(k + 1) % holderLoopL.length];
          if ((a.z <= zz && b.z > zz) || (b.z <= zz && a.z > zz)) {
            const x = a.x + (b.x - a.x) * ((zz - a.z) / (b.z - a.z));
            if (x < bot) bot = x;
          }
        }
        holderBotTab[i] = (bot === Infinity) ? Infinity : bot;
      }
    }
  }
  const holderBottomAt = (dz) => {
    if (!holderBotTab) return 0;
    const i = Math.round((dz - holderZLoL) / DZ_CAP);
    if (i < 0 || i >= holderBotTab.length) return Infinity;   // mimo držák = volno
    return holderBotTab[i];
  };
  // Vejde se držák, když špička stojí na (X_tip = `top`) v axiální poloze `z`?
  //
  // Dřív se držák modeloval PLOCHÝM blokem v úrovni špičky (`t > top + 0,05`
  // blokovalo) — jenže reálný obrys stoupá (u tohoto držáku z 0 na 20 mm už
  // po 6,5 mm dozadu), takže se plochý model bránil i tam, kde by držák
  // pohodlně přeletěl. Teď se bere SKUTEČNÁ spodní hrana obrysu a od ní se
  // ubere `HOLDER_ENTRY_STOCK_GAP` jako bezpečnostní odstup od offsetové
  // čáry polotovaru (přání uživatele: „ať je držák tak 2 mm od té čáry").
  // U špičky (spodní hrana ≈ 0) zůstává původní práh 0,05 mm — tam se
  // nástroj materiálu dotýká z podstaty.
  // Zbytkový povrch v ose Z: dokud tudy nikdo neřezal, stojí syrový obrys;
  // jakmile tudy projel průchod, leží povrch na jeho hloubce.
  //
  // DVA REŽIMY, protože průchody se NEPROVÁDÍ v pořadí, v jakém se plánují:
  //   • běžně = LÍNĚ dosynchrovaný prefix `passes` (jediné napojení, žádné
  //     zásahy do desítek míst, kde se průchod pushuje),
  //   • `activeFloorTab` = explicitně podstrčená podlaha. Používá ji kontrola
  //     ODLOŽENÝCH vjezdů na konci regionu (`__deferEntry` je posouvá až za
  //     všechny ostatní průchody regionu), kde je prefix z okamžiku plánování
  //     řádově pozadu za skutečností — na range-end-leadout hlásil 119 mm²
  //     vnoření proti materiálu, který v době provedení dávno nestojí
  //     (zapsaných 7 průchodů proti celému hotovému regionu).
  const newFloorTab = () => (capTab ? new Float64Array(capTab.length).fill(Infinity) : null);
  // Úsečka (z1,x1)→(z2,x2): podél ní nástroj řeže PŘESNĚ na svou x v daném z,
  // takže se podlaha sráží lineární interpolací, ne obdélníkem.
  const noteSegInto = (tab, z1, x1, z2, x2) => {
    if (!tab || ![z1, x1, z2, x2].every(Number.isFinite)) return;
    const iA = Math.max(0, Math.floor((Math.min(z1, z2) - capZ0) / DZ_CAP));
    const iB = Math.min(tab.length - 1, Math.ceil((Math.max(z1, z2) - capZ0) / DZ_CAP));
    const dz = z2 - z1;
    for (let i = iA; i <= iB; i++) {
      const z = capZ0 + i * DZ_CAP;
      const t = Math.abs(dz) < 1e-9 ? 0 : Math.min(1, Math.max(0, (z - z1) / dz));
      const x = x1 + (x2 - x1) * t;
      if (x < tab[i]) tab[i] = x;
    }
  };
  const notePassInto = (tab, p) => {
    if (!tab || !p || p.type !== 'long' || !Number.isFinite(p.x)) return;
    // PRŮCHOD S NULOVÝM DNEM (zStart == zEnd) NEMÁ CO PŘEDPOVÍDAT — táž
    // výjimka, jakou má `noteCutPass` v gcodeEmit.js, a ze stejného důvodu.
    // Degenerovaný průchod (dno nulové šířky; vzniká dobráním zbytku menšího
    // než ap) žádné dno nemá a EMISE k němu najíždí úplně jinudy, než kudy
    // vede plánovaná rampa. Model tím „odebere" klín, který ve skutečnosti
    // stojí — a protože podle NĚJ se pouští zanoření a odložené zákroky, je
    // to nebezpečný směr.
    //
    // Změřeno na part-8 (`tests/cam-strategy-residual`): rampa zanoření #27
    // (dno 184,37 = 184,37) srazila model na r 17,99 v pásu Z 117,5–192,5,
    // kde dráha nechala stát až r 30,78 — tedy až 12,8 mm pod realitou.
    // Emise tutéž vadu měla a byla opravena 12. 8. 2026 (6,13 mm na Z 189).
    //
    // Nic se tím neztrácí: co si takový průchod opravdu vykope, zapíšou jeho
    // vlastní nájezd/dojezd po kontuře níž.
    const noFloor = Number.isFinite(p.zStart) && Number.isFinite(p.zEnd)
      && Math.abs(p.zStart - p.zEnd) < 1e-6;
    if (!noFloor && Number.isFinite(p.zStart) && Number.isFinite(p.zEnd))
      noteSegInto(tab, p.zStart, p.x, p.zEnd, p.x);
    // RAMPA a SLEDOVÁNÍ KONTURY řežou taky — bez nich model tvrdí, že materiál
    // pořád stojí, a hlídání pak zamítá vjezdy do prostoru, který je dávno
    // vykopaný (na part-13-zleva-flange to stálo 29 % úběru).
    if (!noFloor && p.ramp && Number.isFinite(p.ramp.x0)) noteSegInto(tab, p.ramp.z0, p.ramp.x0, p.zStart, p.x);
    for (const key of ['contourLeadIn', 'contourLeadOut']) {
      for (const sg of (p[key] || [])) noteSegInto(tab, sg.z1, sg.x1, sg.z2, sg.x2);
    }
  };
  const syncCutFloor = () => {
    if (!capTab) return;
    if (!T.cutFloorTab) { T.cutFloorTab = newFloorTab(); T.cutFloorSynced = 0; }
    for (; T.cutFloorSynced < passes.length; T.cutFloorSynced++) notePassInto(T.cutFloorTab, passes[T.cutFloorSynced]);
  };

  const T = {
    DZ_CAP, holderLoopL, holderZLoL, holderZHiL, capZ0, capTab,
    stockTopTab, holderBottomAt, newFloorTab, notePassInto,
    // přepisuje se zvenku — viz hlavička
    cutFloorTab: null, cutFloorSynced: 0, activeFloorTab: null,
    syncCutFloor,
  };
  return T;
}

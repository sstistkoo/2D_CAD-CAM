// ╔════════════════════════════════╗
// ║  OTEVŘENÝ vjezd zprava (první interval)      ║
// ╚════════════════════════════════╝
// Vyňato z hloubkové smyčky `ops/roughLong.js` (plán §3.A). První ze dvou
// větví `intervals.forEach` — klasický průchod od pravé hrany polotovaru,
// bez zanořování.
//
// `rampSt` nese stav kotvy rampy PŘES intervaly i hloubky (`anchor`,
// `closed`) — je to objekt, protože tělo má `return;` uprostřed.

import { isFaceLeadOut, traceIfContinuous } from './segUtils.js';
import { ENTRY_FIT_TOL, HOLDER_FIT_TOL, clipLeadOutToDepth } from '../shared.js';
import { stockClearanceIsZero, stockClearances } from '../../camMath.js';

export function emitOpenInterval(D) {
  const {
    prms, passes, step, dzScan, DZ_CAP, capTab, currentX, iv, intervals,
    entryZ, entryCapped, entryRampIsPlunge, effZMin, effPlungeTanL,
    traceFloorL, depthIdx, depths, _region, chainTipIs, findLeadOutEndZ,
    findRampOutTarget, findSteepCorner, holderClampZEnd, holderEntryReachZ,
    holderFitArea, holderFitAreaAlong, holderTrimLeadOut, offsetStockTopXAtZ,
    pendingRampCompletions, plungeHolderFitsAt, pocketDoneRanges,
    rampedOutCorners, residEntryArea, skipCounters, stockEntryRamp, stockTopTab,
    straightRunEndZ, traceOffsetPath, rampSt, noseLiftX, anchorLiftX = noseLiftX,
  } = D;
  // Otevřený vjezd zprava přes hranu polotovaru.
  const passObj = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
  // ── Vjezd na hranici rozsahu Z rampou (Fáze 4) ──────
  // Když rozsah obrábění začíná UVNITŘ polotovaru (napravo od
  // hranice ještě stojí materiál), kolmý zápich na hloubku
  // nahrazuje rampa pod úhlem zanoření na OFFSETOVOU čáru
  // (offsetStockTopXAtZ — vůlí-posunutá silueta, stejná jako
  // planTopXAtZ v gcodeEmit.js). Kotva rampy se ŘETĚZÍ mezi
  // hloubkami (rampSt.anchor) — první hloubka najede z povrchu,
  // každá další jen odskočí a napojí se na konec rampy PŘEDCHOZÍ
  // hloubky (pocketReposition, stejný vzor jako dojezd strmé stěny
  // výš) — ne restart od povrchu pokaždé znovu (reálný nález na
  // díle uživatele: to zbytečně přejíždělo/dobíralo už hotovou
  // horní část rampy a po pár hloubkách se úplně vzdalo, zbytek
  // Z-rozsahu zůstal bez jakéhokoli dojezdu).
  // ORDER-AWARE svislé zanoření (docs/cam-order-aware-holder.md).
  // Upichovák zapichuje KOLMO — to je jeho normální provoz, ne vada
  // (rozhodnutí uživatele 26. 8. 2026). Zakázat mu to na každé umělé
  // hranici plošně je moc hrubé: nebezpečné je jen tam, kde do stojícího
  // materiálu vjede DRŽÁK. Statická obálka (`holderFitsAt`, výškové pole)
  // na to nestačí — neumí tunel a její tolerance 2 mm² je kompenzace
  // vlastní hrubosti. Ptáme se proto POLYGONOVÉHO zbytku, který zná
  // pořadí obrábění: kde držák podél svislého sjezdu projde, vjezd se
  // povolí a rampa není potřeba; kde ne, platí dál „rampa, nebo vrstvu
  // vynechat" (viz !rampOk níž).
  const plungeEntryOk = entryRampIsPlunge && plungeHolderFitsAt(currentX, iv.zStart, iv.zEnd);
  // ── VJEZD POSUNUTÝ OBÁLKOU DRŽÁKU MÁ TAKY DOSTAT RAMPU ────────────────
  // Brána bloku pod tímhle (`iv.zStart >= entryZ`) říká „vjezd sedí přesně
  // na umělé hranici". Jenže hlídání držáku posune `intervals[0].zStart`
  // DOLEVA (`iv0.zStart = zTry` v roughLong.js) ještě před `intervals
  // .forEach`, takže brána propadne — a průchod se zanoří KOLMO (90°),
  // přestože je Zanořování zapnuté a úhel je třeba 15°. Nález uživatele
  // 1. 9. 2026: `N3190 G0 X20.550 / N3200 G1 X13.545 F0.25` = 3 mm
  // radiálního zápichu polygonem natočeným o 15°.
  //
  // Kotva se hledá `stockEntryRamp` (přímka zanoření SKRZ skutečný vjezd),
  // ne `offsetStockTopXAtZ(entryZ)` jako v bloku níž: ta by mířila zpátky na
  // PŮVODNÍ hranici, tedy tam, odkud hlídání držáku vjezd právě odsunulo.
  // Protože kotva leží na téže přímce, `zStart` se nemění vůbec — mění se
  // jen JAK se na hloubku dojede.
  //
  // DVĚ VĚCI, KTERÉ SE TU DĚLAT NESMÍ (obě změřené 1. 9. 2026):
  //  1. Sáhnout na ŘETĚZ `rampSt`. Kotva odtud je čistě LOKÁLNÍ; puštěná do
  //     řetězu shodí hlubší (už neposunuté) vrstvy, které na ní ztroskotají
  //     — na sadě −255 až −291 mm² (`part-10-zapich` 38 → 35 průchodů).
  //  2. Vydat rampu bez kontroly DRŽÁKU PODÉL NÍ. Vjezd byl posunutý právě
  //     kvůli držáku, takže rampa míří do místa, které mu bylo zakázáno —
  //     bez ní to na `pocket-wall-at-plunge-angle` udělalo 4 nové nálezy
  //     (1,0–2,3 mm²) a přes odložené vjezdy sebralo další průchody. Bodový
  //     test nestačí: držák je v ose Z 20 mm dlouhý.
  //
  // Ptají se OBA modely, každý na svou polovinu:
  //   • `holderFitAreaAlong` = výškové pole (funguje i bez order-aware),
  //   • `residEntryArea` = POLYGONOVÝ zbytek se znalostí pořadí, TÝMŽ prahem
  //     `ENTRY_FIT_TOL`, jakým se posuzoval ten posun vjezdu. Výškové pole
  //     samo nestačí — o tunelech neví a na `pocket-wall-at-plunge-angle`
  //     rampu pustilo, načež ji validátor v OFFSETOVÉM standardu nahlásil
  //     (1,9 / 2,3 mm²). Rampa je vjezd, takže má projít testem vjezdu.
  //
  // NEPLATÍ PRO SVISLÉ ZANOŘENÍ (90°). Tam žádná rampa neexistuje — `plungeDirL`
  // má `uz = 0`, takže by `stockEntryRamp` vydal svislici označenou „Rampa" —
  // a hlavně: upichováku je kolmý zápich vlastní (rozhodnutí uživatele
  // 26. 8. 2026, viz `plungeEntryOk` výš). Ten se tedy řídí dál `plungeHolderFitsAt`.
  // POSUNUTÝ VJEZD VE VZDUCHU rampu nepotřebuje: nad břitem nic nestojí,
  // svislý sjezd není zanoření. Bez toho se zahodily celé vrstvy X 29,4…17,4
  // nad bossem part-17 (vjezd posunutý držákem na Z 194 nad krkem, polotovar
  // tam X 16,7) a hlubší vrstva pak vjela pod bok bossu — tříska 17,8 mm.
  const shiftedSurf = iv.entryShifted ? offsetStockTopXAtZ(iv.zStart) : null;
  const shiftedInAir = iv.entryShifted && shiftedSurf !== null
    && shiftedSurf + (anchorLiftX || 0) <= currentX + 0.05;
  if (entryCapped && !plungeEntryOk && !entryRampIsPlunge && !shiftedInAir
      && iv.entryShifted && iv.zStart < entryZ - 1e-6) {
    const er = stockEntryRamp(currentX, iv.zStart);
    const cand = { x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, ramp: er };
    // RAMPA, KTERÁ NA POSUNUTÉM VJEZDU ZAČÍNÁ (24. 9. 2026). Rampa výš na
    // posunutém vjezdu KONČÍ, takže začíná o (povrch − X)/tan(úhel) víc
    // vpravo — tedy zpátky tam, odkud držák vjezd právě odsunul, a držák ji
    // tam znovu zamítne. Druhá možnost je sjet z povrchu NAD posunutým
    // vjezdem doleva: držák stojí na místě, které hlídání už pustilo, a
    // klesá od něj. Nález uživatele 24. 9. 2026 (polygon, úsek Z 107,2…195,3
    // podle pravidla 1): kapsa u krku Z 146…175 vypadla celá (4 vrstvy
    // jako kolmý vjezd), protože vjezd posunutý na Z 175,3 od zbytku za
    // hrbem dostal rampu začínající na Z 178,4.
    const surfS0 = offsetStockTopXAtZ(iv.zStart);
    // Spodek NOSU na offsetové čáře polotovaru, ne střed (`anchorLiftX` =
    // rádius nosu; uživatel 25. 9. 2026: „špička spodku rádiusu by měla dojet
    // k offsetové čáře, kde je začátek polotovaru, a tady se začít zanořovat").
    const surfS = surfS0 === null ? null : surfS0 + (anchorLiftX || 0);
    const zS = surfS === null ? NaN : iv.zStart - (surfS - currentX) / effPlungeTanL;
    // Rampa nesmí vzít víc než jednu vrstvu (pravidlo 3): z povrchu výš než
    // o ap by ubrala víc (part-17: 7,8 mm naráz při ap 3 a držák v materiálu).
    // Měří se MATERIÁL (offsetová čára + noseLiftX), ne výška středu nosu —
    // kus rampy nad čarou jede vzduchem (25. 9. 2026).
    const candS = surfS !== null && surfS > currentX + 0.05
      && surfS0 + (noseLiftX || 0) - currentX <= step + 0.05
      && zS > iv.zEnd + 0.05
      ? { x: currentX, zStart: zS, zEnd: iv.zEnd, ramp: { x0: surfS, z0: iv.zStart } } : null;
    // NAVÁZÁNÍ NA KONEC RAMPY PŘEDCHOZÍ VRSTVY (25. 9. 2026). Posunutý vjezd
    // (hlídání držáku podle pořadí) leží tam, kde nad vrstvou stojí celý
    // polotovar — rampa z povrchu by vzala víc vrstev naráz. Mělčí vrstva ale
    // v témž intervalu sjela rampou níž doleva a její konec je místo, odkud
    // tahle vrstva může pokračovat o jednu vrstvu níž (týž řetěz, jaký dělá
    // vjezd bez posunu). Bez toho se vrstva zahodila jako „kolmé zanoření":
    // údolí úseku 2 (polygon, Z 146…176) nedojelo dno — X 11,73 a 11,09 chyběly.
    let candC = null;
    for (const q of passes) {
      if (!q || q.type !== 'long' || !q.ramp) continue;
      if (!(q.x > currentX + 0.05 && q.x - currentX <= step + 0.05)) continue;
      if (!(q.zStart <= iv.zStart + 1e-6 && q.zStart > iv.zEnd + 0.05)) continue;
      const zC = q.zStart - (q.x - currentX) / effPlungeTanL;
      if (!(zC > iv.zEnd + 0.05)) continue;
      if (!candC || q.x < candC.ramp.x0) candC = { x: currentX, zStart: zC, zEnd: iv.zEnd, ramp: { x0: q.x, z0: q.zStart } };
    }
    if (er && er.x0 > currentX + 0.05 && (er.surfX ?? er.x0) - currentX <= step + 0.05
        && holderFitAreaAlong(cand) <= HOLDER_FIT_TOL
        && residEntryArea(cand, [], ENTRY_FIT_TOL) <= ENTRY_FIT_TOL) {
      passObj.ramp = { x0: er.x0, z0: er.z0 };
      passObj.entryRangeRamp = true;
    } else if (candS
        && holderFitAreaAlong(candS) <= HOLDER_FIT_TOL
        && residEntryArea(candS, [], ENTRY_FIT_TOL) <= ENTRY_FIT_TOL) {
      passObj.ramp = { ...candS.ramp };
      passObj.zStart = zS;
      passObj.entryRangeRamp = true;
      // Řetěz pokračuje z KONCE této rampy. Stará kotva leží v klínu, který
      // tahle rampa nechala stát, a hlubší vrstva by k ní sjela kolmo
      // (part-11-zleva: `G1 X15.545` 90°).
      rampSt.anchor = { x: currentX, z: zS, first: false };
      rampSt.closed = false;
    } else if (candC
        && holderFitAreaAlong(candC) <= HOLDER_FIT_TOL
        && residEntryArea(candC, [], ENTRY_FIT_TOL) <= ENTRY_FIT_TOL) {
      passObj.ramp = { ...candC.ramp };
      passObj.zStart = candC.zStart;
      passObj.entryRangeRamp = true;
      rampSt.anchor = { x: currentX, z: candC.zStart, first: false };
      rampSt.closed = false;
    } else {
      // KOLMÉ ZANOŘENÍ JE PRO TENHLE PLÁTEK ZAKÁZANÉ — vrstva se VYNECHÁ.
      // Vjezd je `entryCapped`, takže napravo od něj materiál stojí; bez
      // rampy by se na hloubku sjelo radiálně, tedy „jako upichovákem".
      // U plátku, jehož úhel zanoření je < 90° (`entryRampIsPlunge` false),
      // to zakázal uživatel 1. 9. 2026: *„ať to nezajíždí kolmo, to je
      // zakázané při takovém plátku; když tak ať to vynechá tu dráhu"* —
      // reálně `N3210 G1 X13.545 F0.25`, 3 mm radiálního záběru polygonem
      // natočeným o 15°.
      //
      // Je to TÁŽ větev, jakou má vjezd na hranici rozsahu níž
      // (`if (!rampOk) … return;`) — jen se dosud nevztahovala na vjezd
      // posunutý obálkou držáku, protože ten se do bloku vůbec nedostal.
      // CENA JE ZNÁMÁ a uživatel ji zvolil vědomě: co se nedá vzít rampou,
      // zůstane stát pro dokončování — na sadě **−183,8 / −200,5 mm²** úběru
      // (0,2 %) při NEZMĚNĚNÝCH kolizích (0/0 v obou standardech).
      //
      // A MUSÍ TO BÝT VIDĚT. Tiché zahazování průchodů je v tomhle generátoru
      // opakovaná past (`holderClampZEnd`: na `part-13-zleva-flange` takhle
      // zmizelo 17 průchodů celé pravé strany a v ⚠ panelu nebylo ani slovo,
      // takže to vypadalo jako chyba geometrie). Vrstva, která zmizí kvůli
      // pravidlu, se proto počítá a hlásí.
      skipCounters.plungeForbidden++;
      return;
    }
  }
  if (entryCapped && !plungeEntryOk
      && iv.zStart >= entryZ - 1e-6) {
    // Kotva rampy = povrch nad vjezdem. Ještě NEPOUŽITÁ kotva (first)
    // z jiného Z se přepíše: vjezd se mezitím mohl posunout doleva na
    // místo, kde zanořování opravdu začíná (entryZ výš).
    // Kotva se při svislém zanoření (90°) NEZAKLÁDÁ vůbec — jinak by z ní
    // stavěly „rampu" i navazující kroky řetězu (dokončení zbytku pod
    // Hloubku ap bisekcí níž), a ta by byla zase jen zápich na hranici.
    if (!entryRampIsPlunge
        && (!rampSt.anchor
          || (rampSt.anchor.first && Math.abs(rampSt.anchor.z - entryZ) > 1e-6))) {
      // Kotvu posuň ZA hranici úseku, kam až pustí držák — jinak rampa
      // vjede doprostřed údolí a jeho druhá půlka zůstane stát
      // (holderEntryReachZ výš; strop = vzdálenější ústí údolí).
      const anchorZ = (_region.zHiValleyTop !== undefined && Math.abs(entryZ - _region.zHi) < 1e-6)
        ? holderEntryReachZ(currentX, entryZ, _region.zHiValleyTop, iv.zEnd)
        : entryZ;
      // ── KOTVA JE V SOUŘADNICÍCH DRÁHY, NE POVRCHU (17. 9. 2026) ───────
      // `offsetStockTopXAtZ` vrací POVRCH offsetové čáry, `currentX` je
      // poloha DRÁHY (střed nosu) — u kulaté destičky se liší o `noseLiftX`
      // (rádius nosu). Bez toho test `surfX > currentX` zamítl kotvu
      // pokaždé, když povrch ležel MEZI břitem a středem nosu: nástroj do
      // materiálu sjíždí o R níž, takže rampovat JE do čeho.
      //
      // Reálný nález na díle uživatele 17. 9. 2026 (kulatá R 10, odlitek):
      // v úseku Z 127,6…172,5 skončil žebřík na X 49,118 (`N1930 G1
      // Z137.603`) a hloubky 26,618 / 24,118 / 21,618 se tiše zahodily
      // (`if (!rampOk) return` níž) — pod nimi zůstal stát celý průměr
      // Ø33,5. Práh se lámal přesně tam, kde povrch (17,743) míjel hloubku,
      // tedy o `noseLiftX` vedle. Viz docs/cam-pravidla-drah.md §3.1.
      const surfX0 = offsetStockTopXAtZ(anchorZ);
      const surfX = surfX0 === null ? null : surfX0 + (anchorLiftX || 0);
      if (surfX !== null && surfX > currentX + 0.05) {
        rampSt.anchor = { x: surfX, z: anchorZ, first: true };
        // Jiné Z = jiný řetěz zanořování: uzavření toho předchozího
        // (dokončený zbytek pod Hloubku ap) se na nový nevztahuje.
        rampSt.closed = false;
      }
    }
    let rampOk = false;
    // Nový řetěz z POVRCHU smí vzít nejvýš jednu vrstvu (pravidlo 3). Když
    // mělčí vrstvy tady nejely (vypadly), rampa z povrchu by brala naráz
    // víc — part-17: X 17,7 → 9,9 při ap 3 a držák v materiálu. Vrstva se
    // pak vynechá jako každá, kam rampa nedosáhne.
    const freshTooDeep = rampSt.anchor && rampSt.anchor.first && rampSt.anchor.x - currentX > step + 0.05;
    if (rampSt.anchor && rampSt.anchor.x > currentX + 0.05 && !freshTooDeep) {
      const zS = rampSt.anchor.z - (rampSt.anchor.x - currentX) / effPlungeTanL;
      if (zS > iv.zEnd + 0.05) {
        passObj.ramp = { x0: rampSt.anchor.x, z0: rampSt.anchor.z };
        passObj.entryRangeRamp = true;
        if (!rampSt.anchor.first && chainTipIs(rampSt.anchor)) {
          passObj.pocketReposition = true;
          passObj.rampFeedFrom = { x: rampSt.anchor.x, z: rampSt.anchor.z };
        }
        passObj.zStart = zS;
        rampSt.anchor = { x: currentX, z: zS, first: false };
        rampOk = true;
      }
    }
    if (!rampOk) {
      // Rampa (ani zřetězená, ani nová) se sem nevejde nebo se
      // nenašla — NEPOKRAČOVAT běžným vjezdem: ten by hledal
      // skutečnou hranu polotovaru napříč celou siluetou odlitku
      // (Standardní podélné hrubování v gcodeEmit.js), a ta u
      // odlitku s bosem/hrbolem sahá výš než Start rozsahu Z — vjezd
      // by tak řezal materiál NAD (mimo) aktivní rozsah, kudy
      // nástroj/držák nepočítá s kolizí (reálný nález na díle
      // uživatele: oranžová kolize držáku v polotovaru). Tahle
      // hloubka se raději úplně vynechá — dál se zanořuje jen po
      // vrstvách, kam rampa doopravdy dosáhne. Zbytek pod Hloubku
      // (ap) dokončí zákrok po skončení celého scanu níž (viz
      // rampSt.closed).
      return;
    }
  }
  // Otevřený řez VŽDY dojíždí svůj vlastní schod po obrysu (níž), i
  // když za bossem případně navazuje kapsa, kterou zvlášť dokope blok
  // „dobrat najednou" — otevřený řez se na to nespoléhá (nedetekuje,
  // co je za bossem, ani se tam nesnaží dojet předem) a nic tam
  // nepředstírá. Riziko doslovného duplicitního úseku G-kódu (kdyby
  // otevřený řez i navazující kapsa sešly stejnou rampou stejného
  // rohu) hlídá cornerAlreadyRampedOut (níž) — ten teď navíc ověřuje
  // dosaženou hloubku (reachedX), takže potlačí kapsu jen když ji
  // ramp opravdu vyřešil celou.
  if (prms.noStepRoughing && iv.blocked) {
    // Bez schodků: místo odskoku se dál sleduje kontura (G1/G2/G3),
    // aby se obrobil schod vůči sousedním zaberum a nezůstal materiál.
    // iv.holderClamped (konec zkrácen obálkou držáku, ne skutečnou
    // stěnou) NEBLOKUJE celý dojezd — holderTrimLeadOut níž trasu
    // stejně ořízne na to, kam držák smí, takže dřívější plošné
    // potlačení jen zbytečně mazalo i bezpečnou část dojezdu.
    const nextX = (depthIdx + 1 < depths.length) ? depths[depthIdx + 1] : -Infinity;
    const prevX = depthIdx > 0 ? depths[depthIdx - 1] : null;
    // Dojezd je vždy KRÁTKÝ a LOKÁLNÍ: sleduje obrys jen do sousední
    // hloubky (nextX, dolů) nebo zpátky na vršek schodu (prevX,
    // nahoru) — nikdy nezajíždí hloub jen proto, že za stěnou čeká
    // kapsa (o tu se stará samostatně blok „dobrat najednou" níž).
    let zEndOut = findLeadOutEndZ(iv.zEnd, prevX, nextX, traceFloorL);
    // Nezávislé na pořadí zpracování kapes (na rozdíl od zEndOut níž) —
    // jen z prevX/nextX/obrysu, stejné ve scan i booleovské cestě.
    // Používá se pro spouštěcí podmínku a mez hledání rohu rampy, ať
    // stejná strmá stěna nespustí rampu v jednom režimu a v druhém ne
    // (rozjelo by materiál-paritu mezi režimy — ověřeno testem).
    const zEndOutRaw = zEndOut;
    // Dobrat kapsu najednou: neořezávat schod DO už vykopané kapsy —
    // zastav sledování na vršku potlačené zóny.
    for (const r of pocketDoneRanges) {
      if (r.zHi <= iv.zEnd + 1e-6 && r.zHi > zEndOut) zEndOut = r.zHi;
    }
    // Strmá skoro svislá stěna (bos): sledování PŘESNÉHO obrysu k
    // zEndOut by muselo kopírovat celou výšku stěny, než by X kleslo
    // na nextX (reálný nález na díle uživatele: schod jen pár mm v X,
    // ale zEndOut vyjde desítky mm hluboko). To se stává jen PRVNÍMU
    // (nejmělčímu) průchodu, který na stěnu narazí — jeho prevX leží
    // NAD stěnou (žádný mělčí soused ji ještě neuřízl), takže sken
    // nezastaví „vršek schodu" a musí čekat na pád k nextX. Hlubší
    // sousední průchody mají prevX už u/ve stěně → zEndOut vyjde
    // krátce, beze změny (viz podmínka níže). V tom vzácném případě
    // se místo dojezdu po obrysu jede od rohu (findSteepCorner) rampou
    // pod úhlem zanoření — stejný vzor jako kapsa za bossem — až tam,
    // kde ramp opustí vůlí-posunutou siluetu odlitku (findRampOutTarget
    // — offsetová čára, stejná jako v náhledu/simulátoru).
    const rampSpan = 2 * step + 10;
    const corner = (iv.zEnd - zEndOutRaw > rampSpan) ? findSteepCorner(iv.zEnd, zEndOutRaw) : null;
    const rampTargetRaw = corner ? findRampOutTarget(corner.x, corner.z) : null;
    // Rampa nesmí sjet POD aktuální hloubku průchodu (currentX) — víc
    // materiálu, než odpovídá nastavené Hloubce (ap), by se odebralo
    // po úhlu zanoření v jednom záběru (reálný nález na díle
    // uživatele). Ořízni cíl na TÉŽE přímce zanoření přesně na
    // X=currentX a odtud pokračuj ROVNĚ (jako běžný řez vrstvy) až
    // tam, kam původně mířila celá rampa (rampTargetRaw.z) — dojezd
    // tak pokryje STEJNÝ Z-rozsah (žádný schod), jen ho pod currentX
    // dohoní až následující (hlubší) průchod svým vlastním dojezdem.
    const rampTarget = (rampTargetRaw && rampTargetRaw.x < currentX)
      ? { x: currentX, z: corner.z - (corner.x - currentX) / effPlungeTanL }
      : rampTargetRaw;
    // Rovné pokračování na hloubce currentX vede až tam, kde vrstvu
    // zastaví STĚNA KONTURY (nebo dno okna) — ne jen k Z, kam mířila
    // rampa. Rampa je jen VJEZD do vrstvy; po dosednutí má dojezd dobrat
    // schodek přes celé údolí na druhou stranu a teprve pak odjet
    // (reálný nález na díle uživatele: dojezd končil hned po dosednutí
    // rampy a materiál za údolím zůstal stát).
    const straightContinueZ = (rampTarget && rampTarget !== rampTargetRaw)
      ? straightRunEndZ(currentX, rampTarget.z, effZMin)
      : null;
    if (rampTarget) rampedOutCorners.push({ x: corner.x, z: corner.z, reachedX: rampTarget.x });
    // Ořízlá rampa nechala pod currentX klín materiálu, který žádná
    // hlubší vrstva sama nenajde (leží mimo její vlastní Z-interval) —
    // dokončí se až po skončení hloubkové smyčky tohoto regionu.
    if (straightContinueZ !== null) {
      pendingRampCompletions.push({ resumeX: rampTarget.x, resumeZ: rampTarget.z, targetX: rampTargetRaw.x, targetZ: rampTargetRaw.z });
    }
    // Konec rovného pokračování je STEJNÁ situace jako konec běžného
    // zablokovaného průchodu: vrstva dosedla na stěnu kontury a schod
    // vůči MĚLČÍMU sousedovi se dobírá sledováním obrysu. Bez tohohle
    // dojezdu končila vrstva v údolí nasucho a mezi ní a hotovní konturou
    // zůstal stát klín (reálný nález na díle uživatele — dvě vrstvy
    // v údolí „nedojeté").
    const tailTrace = (straightContinueZ !== null && straightContinueZ > effZMin + 1e-6)
      ? traceIfContinuous(
          traceOffsetPath(straightContinueZ,
            findLeadOutEndZ(straightContinueZ, prevX, nextX, traceFloorL)),
          rampTarget.x, straightContinueZ)
      : [];
    const leadOut = rampTarget
      ? holderTrimLeadOut(traceOffsetPath(iv.zEnd, corner.z)
          .filter(s => s.type !== 'line' || Math.abs(s.z1 - s.z2) > 1e-6)
          .concat([{ type: 'line', x1: corner.x, z1: corner.z, x2: rampTarget.x, z2: rampTarget.z }])
          .concat(straightContinueZ !== null && rampTarget.z - straightContinueZ > 1e-6
            ? [{ type: 'line', x1: rampTarget.x, z1: rampTarget.z, x2: rampTarget.x, z2: straightContinueZ }]
            : [])
          .concat(tailTrace), true)
      : holderTrimLeadOut(traceOffsetPath(iv.zEnd, zEndOut), true);
    // Zahoď úvodní úseky pod aktuální hloubkou: kvůli diskretizaci /
    // zaoblenému rohu může trasa hned na začátku klesnout pod
    // currentX (krátký "dip"). Průchod nesmí řezat pod svou hloubku —
    // sledování kontury začne až tam, kde se zvedne na currentX.
    while (leadOut.length > 0 && leadOut[0].x2 <= currentX + 0.02) leadOut.shift();
    // „Bez schodků" smí obrobit schod jen k SOUSEDNÍ (mělčí) hloubce
    // (prevX) — dál (X > prevX) je materiál už obroben mělčím průchodem.
    // U šikmé kontury to řeší findLeadOutEndZ (v ose Z), ale VODOROVNÉ
    // čelo (konstantní Z) vydá traceOffsetPath celé až k bossu → oříznout
    // na prevX (jinak dojezd zbytečně přejede celé čelo ven až na buben).
    if (prevX !== null && Number.isFinite(prevX)) clipLeadOutToDepth(leadOut, prevX);
    // „i u čelního" (viz isFaceLeadOut výš): bez zaškrtnutí se dojezd
    // po čelní/radiální stěně vynechá — průchod skončí u stěny a
    // odskočí, schod dobere čelní operace.
    if (!prms.noStepRoughingFace && isFaceLeadOut(leadOut)) leadOut.length = 0;
    // ── DODĚLAT VRSTVU (zadání uživatele 21. 8. 2026) ──────────────────
    // `findLeadOutEndZ` zastaví dojezd, jakmile offset klesne na hloubku
    // DALŠÍHO průchodu — s tím, že ten si zbytek vezme. Na STRMÉM BOKU
    // ale offset propadne pod `nextX` hned na prvním milimetru a žádná
    // hlubší vrstva se tam nedostane: kapsová větev ten interval zahodí,
    // protože na jeho ZAČÁTKU (těsně za hrbem) se držák nevejde, a
    // `holderClampZEnd` umí zkrátit jen KONEC, ne posunout začátek.
    // Vrstva pak končí uprostřed úseku materiálu (na dílu uživatele
    // 7,5 mm z 11,8 mm dlouhého úseku).
    //
    // Tohle není nový vjezd — nástroj na hloubce UŽ JE a stojí za hrbem,
    // takže se jen dojede ROVNĚ doleva, dokud na téhle hloubce materiál
    // sahá. Právě proto je to bezpečné tam, kde posouvání vjezdu není
    // (to se 10. 8. 2026 třikrát nepovedlo, viz holderClampZEnd níž).
    if (leadOut.length > 0 && capTab) {
      const last = leadOut[leadOut.length - 1];
      const xT = last.x2, zT = last.z2;
      // Vrstva se dobírá na HLOUBCE VRSTVY, ne na X, kde zrovna skončilo
      // sledování kontury. Dojezd sjede po obrysu klidně pod currentX
      // (tady 37,5 proti vrstvě 40,5) a jet doleva tam dole by znamenalo
      // brát dvojnásobný záběr — a hlavně by se tam nevešel držák
      // (změřeno: na 37,5 drhne o hrb 0,5 mm, na 40,5 je čistý).
      const xRun = Math.max(xT, currentX);
      if (Number.isFinite(xT) && Number.isFinite(zT)) {
        // Dobrat se smí jen ÚSEK, do kterého dojezd zajel — ne celá
        // hloubka napříč dílem. Bez tohohle omezení dojezd na X 25,5
        // dojel až na Z −9 (přes celý díl) a bral práci jiným vrstvám
        // i regionům: dojezdy narostly z 1–3 na 10–13 segmentů.
        const ivTail = intervals.find(q => q !== iv
          && zT <= q.zStart + 1e-6 && zT >= q.zEnd - 1e-6);
        // Kam až v tom úseku na téhle hloubce materiál sahá. Měří se
        // proti PLÁNOVACÍMU obrysu (offsetová čára) jako všechno
        // ostatní — co z toho je vzduch, rozdělí až emise
        // (airSplitAxial).
        const zStop = ivTail ? Math.max(ivTail.zEnd, effZMin) : zT;
        let zTo = zT;
        for (let z = zT - DZ_CAP; z > zStop - 1e-9; z -= DZ_CAP) {
          const t = stockTopTab(z);
          if (t === null || t <= xRun + 0.05) break;
          zTo = z;
        }
        if (ivTail && zTo - DZ_CAP <= zStop && (stockTopTab(zStop) ?? -Infinity) > xRun + 0.05) zTo = zStop;
        if (zT - zTo >= dzScan) {
          // Vejde se držák po CELÉ té jízdě? Vlastním řezem je tělo
          // průchodu, celý dojezd a ta část jízdy, kterou má nástroj
          // v daném bodě za sebou — destička si cestu řeže sama.
          const own = [{ z1: passObj.zStart, x1: currentX, z2: passObj.zEnd, x2: currentX }]
            .concat(leadOut.map(s => ({ z1: s.z1, x1: s.x1, z2: s.z2, x2: s.x2 })));
          let ok = true;
          const n = Math.max(1, Math.min(64, Math.ceil(zT - zTo)));
          for (let k = 1; k <= n && ok; k++) {
            const z = zT + (zTo - zT) * (k / n);
            if (holderFitArea(z, xRun, 0, own.concat([{ z1: zT, x1: xRun, z2: z, x2: xRun }])) > HOLDER_FIT_TOL) ok = false;
          }
          if (ok) {
            if (xRun > xT + 1e-6) leadOut.push({ type: 'line', x1: xT, z1: zT, x2: xRun, z2: zT });
            leadOut.push({ type: 'line', x1: xRun, z1: zT, x2: xRun, z2: zTo });
          }
        }
      }
    }
    // ── CO DOJEZD UŽ DOBRAL, SE NEVYDÁ PODRUHÉ ────────────────────────────
    // Dojezd „bez schodků" nekončí na `iv.zEnd`: dorampování strmé stěny
    // (`straightContinueZ`) i „dodělat vrstvu" (`ivTail` výš) ho vědomě
    // protáhnou ROVNĚ na hloubce vrstvy dál doleva — tedy skrz NÁSLEDUJÍCÍ
    // interval téže hloubky. Ten se ale o pár řádků dál (`intervals.forEach`)
    // vydal ještě jednou jako vlastní průchod: doslovná kopie právě
    // provedeného řezu. A protože takový interval končí ve vzduchu
    // (`blocked === false`), sháněl si vjezd přes `stockEntryRamp`, tedy
    // rampu kotvenou na SYROVÉ siluetě odlitku desítky mm nad vrstvou, kterou
    // mělčí průchody dávno odebraly.
    //
    // Reálný nález uživatele 1. 9. 2026 — tři případy na jednom díle:
    //   „Průchod 7"  X49,545 Z214,472→196,278 = konec dojezdu „Průchodu 6",
    //                najížděný 44mm rampou pod 15° z Z258,4,
    //   „Průchod 31" X40,545 Z121,117→110,790 = konec dojezdu „Průchodu 30",
    //   „Průchod 49" X31,545 Z−1,009→−8,000  = konec dojezdu „Průchodu 48".
    // Odebráno tím 3 průchody a úběr se NEHNUL ani o setinu mm² (7 645,6).
    //
    // Ořezává se jen podle KONCOVÝCH úseků dojezdu na hloubce vrstvy
    // (`currentX`): co dojezd projel po kontuře výš, vrstvu nedobralo a
    // interval si to má vzít sám.
    //
    // DOBRANÉ JE I TO, KUDY DOJEZD PROJEL POD HLOUBKOU VRSTVY (2. 9. 2026).
    // Původně se braly jen segmenty PŘESNĚ na `currentX` a chůze zpět se
    // zastavila na prvním, který na ní neležel. Dojezd ale běžně sjede po
    // obrysu do prohlubně POD hloubku vrstvy a zase vyleze (`humpMerge`) —
    // materiál vrstvy tam odebral, jen ne na kótě `currentX`. Guard takový
    // úsek přehlédl a interval, který v prohlubni začínal, vydal celý znovu.
    //
    // Reálný nález uživatele 2. 9. 2026, hloubka r 40,545:
    //   dojezd  …41,32/−128,98 → 39,74/−137,81 → 39,73/−137,85
    //           → 40,55/−134,82 → 40,55/−172,50
    //   cover   [−172,50 … −134,815]   (jen poslední rovný úsek)
    //   iv2     zS −133,314 → −172,50  ⇒ −133,314 > −134,815+0,2 ⇒ NEOŘEZÁN
    // Přitom dojezd protne hloubku vrstvy přesně na −133,314 (hranice
    // intervalu JE místo, kde offset kříží `currentX`), takže interval
    // dobral celý. Vydal se podruhé jako „Průchod 27" — 24,9 mm posuvu
    // po vlastní čerstvé dráze.
    //
    // Zpětná chůze proto pokračuje přes VŠECHNY segmenty na hloubce vrstvy
    // nebo pod ní a končí až na tom, který stoupl nad ni; ten se započítá
    // jen po průsečík s `currentX`.
    // Z, ve kterém segment protne hloubku vrstvy `X`. U OBLOUKU se hledá
    // půlením PO ÚHLU, ne přes průsečík kružnice s vodorovnou čarou: kružnice
    // má na jedné hloubce dvě řešení a obě můžou padnout do Z-rozsahu výseku
    // (oblouk delší než čtvrtkruh). Vzít „první v rozsahu" znamená u poloviny
    // takových oblouků vzít TU DRUHOU STRANU a nahlásit pokrytí, které tam
    // není — a to je směr, který stojí materiál. Segment sem chodí jen
    // PŘEKLENUJÍCÍ (jeden konec nad hloubkou, druhý pod), takže půlení je
    // jednoznačné.
    const zAtDepth = (s, X) => {
      const zLo = Math.min(s.z1, s.z2), zHi = Math.max(s.z1, s.z2);
      const clamp = (z) => Math.max(zLo, Math.min(zHi, z));
      if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
        const at = (t) => {
          const a = s.startAngle + (s.endAngle - s.startAngle) * t;
          return { x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r };
        };
        let lo = 0, hi = 1;
        const above0 = at(0).x > X;
        if (above0 === (at(1).x > X)) return null;      // neprotíná
        for (let i = 0; i < 32; i++) {
          const m = (lo + hi) / 2;
          if ((at(m).x > X) === above0) lo = m; else hi = m;
        }
        return clamp(at((lo + hi) / 2).z);
      }
      const dx = s.x2 - s.x1;
      if (Math.abs(dx) < 1e-9) return null;
      return clamp(s.z1 + (X - s.x1) / dx * (s.z2 - s.z1));
    };
    let coverLo = null, coverHi = null;
    for (let k = leadOut.length - 1; k >= 0; k--) {
      const s = leadOut[k];
      const above1 = s.x1 > currentX + 0.02, above2 = s.x2 > currentX + 0.02;
      if (above1 && above2) break;                 // celý nad vrstvou — nic nedobral
      let lo, hi;
      if (!above1 && !above2) {
        lo = Math.min(s.z1, s.z2); hi = Math.max(s.z1, s.z2);
      } else {
        const zc = zAtDepth(s, currentX);
        if (zc === null) break;
        const zIn = above1 ? s.z2 : s.z1;          // konec, který leží na hloubce/pod ní
        lo = Math.min(zc, zIn); hi = Math.max(zc, zIn);
      }
      coverLo = coverLo === null ? lo : Math.min(coverLo, lo);
      coverHi = coverHi === null ? hi : Math.max(coverHi, hi);
      if (above1 || above2) break;                 // za průsečíkem už dojezd vrstvu nedobral
    }
    if (coverLo !== null) {
      for (const q of intervals) {
        // Tolerance je `dzScan`, ne epsilon: začátek intervalu a konec rampy
        // dojezdu vznikají KAŽDÝ JINOU cestou (sken × `findRampOutTarget`,
        // v booleovské větvi navíc z polygonu zbytku), takže na téže hraně
        // sedí o mikrometry vedle — na `part-8` o 1,2 µm, a scan-line větev
        // duplicitu zahodila, kdežto booleovská ne. Zbytek nad dojezdem je
        // kratší než krok skenu, takže by stejně nikdy nebyl vlastním
        // intervalem; dobere ho dojezd hlubší vrstvy jako každý jiný schod.
        if (q === iv || q.zStart > coverHi + dzScan || q.zStart <= coverLo + 1e-6) continue;
        // Zbytek pod dojezdem zůstává intervalu; dobraný celý → `zStart`
        // dosedne na `zEnd` a smyčka ho vynechá (filtr `< dzScan`).
        q.zStart = coverLo <= q.zEnd + dzScan ? q.zEnd : coverLo;
        // ZAČÁTEK UŽ NELEŽÍ NA KONTUŘE. Posunul ho DOJEZD, ne geometrie —
        // kontura v novém `zStart` může být dávno POD hloubkou vrstvy
        // (tady byla o 4,3 mm). Nájezd po kontuře do takového bodu vede pod
        // vrstvu a `clipLeadInToDepth` z něj nenechá nic; značka dovolí
        // `pocketPass.js` zkrátit trasu tam, kde kontura hloubku opouští,
        // místo aby se vrstva zahodila (viz tam).
        q.leadOutCoveredTo = coverLo;
      }
    }
    if (leadOut.length > 0) passObj.contourLeadOut = leadOut;
  }
  // ── SVISLÝ SJEZD ZE VZDUCHU: ZASTAVIT VYSOKO, PAK RAMPA (25. 9. 2026) ─────
  // Vjezd bez rampy i bez nájezdu po kontuře sjíždí na hloubku SVISLE. Pravidla
  // uživatele: offsetová čára polotovaru JE začátek polotovaru (spodek nosu
  // pod ni svisle nesmí) a držák nesmí vjet do polotovaru ANI O KOUSEK —
  // `ENTRY_FIT_TOL` (0,5 mm²) tu pouštěl 0,36 mm² do šikminy vpravo (úsek 3,
  // `G1 X17.166`, v simulaci červeně). Sjezd se proto zastaví tam, kde je držák
  // volný a spodek nosu nad čarou, a na hloubku se jde rampou pod úhlem
  // zanoření doleva. Nevejde-li se (víc než vrstva, stěna, držák na rampě),
  // vrstva se vynechá — menší úběr je v pořádku, kolize ne.
  if (!passObj.ramp && !passObj.contourLeadIn && !entryRampIsPlunge) {
    const STRICT = 0.01;
    // Sjíždí se o NÁJEZD vpravo od začátku průchodu (Vůle Z + R, viz
    // rapidStopZ v gcodeEmit.js) a k materiálu se přijede posuvem — tam
    // stojí držák, tam se tedy hlídá.
    const approachDz = (stockClearanceIsZero(prms) ? 0 : stockClearances(prms).z) + (parseFloat(prms.toolRadius) || 0);
    const z0 = passObj.zStart + approachDz, R = anchorLiftX || 0;
    const top = offsetStockTopXAtZ(z0 + 0.01);
    const bandTop = top !== null ? top + R : -Infinity;
    const areaAt = (x) => residEntryArea({ x, zStart: z0, zEnd: z0, ramp: { x0: x, z0 } }, [], Infinity);
    const inBand = bandTop > currentX + 0.01;
    const holderHit = areaAt(currentX) > STRICT;
    if (inBand || holderHit) {
      let xFree = currentX;
      if (holderHit) {
        let lo = currentX, hi = currentX + step;
        if (areaAt(hi) > STRICT) { skipCounters.plungeForbidden++; return; }
        for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (areaAt(m) > STRICT) lo = m; else hi = m; }
        xFree = hi;
      }
      const x0 = Math.max(xFree, bandTop);
      const zS = z0 - (x0 - currentX) / effPlungeTanL;
      const cand = { x: currentX, zStart: zS, zEnd: passObj.zEnd, ramp: { x0, z0 } };
      const matTop = top !== null ? top + (noseLiftX || 0) : x0;   // materiál, ne vzduch nad ním
      if (matTop - currentX > step + 0.05 || !(zS > passObj.zEnd + 0.05)
          || residEntryArea(cand, [], Infinity) > STRICT
          || holderFitAreaAlong(cand) > HOLDER_FIT_TOL) {
        skipCounters.plungeForbidden++;
        return;
      }
      passObj.ramp = { x0, z0 };
      passObj.zStart = zS;
      passObj.entryRangeRamp = true;
      passObj.rampAllFeed = true;
    }
  }
  passes.push(passObj);
  // Schodová evidence (Fáze 3a): JEN ZKRÁCENÉ konce. Nezkrácený
  // průchod končí na stěně offsetu — ta už je v siluetě zakázané
  // oblasti a evidovat ji znovu by přes bbox držáku falešně škrtala
  // vzdálené intervaly (např. pásy u čela). Zkrácený konec ale nechal
  // stát materiál NAD siluetou — hlubší průchody podle něj drží
  // levou hranu držáku před schodem.
  if (holderClampZEnd && holderClampZEnd.noteMainEnd && iv.holderClamped) {
    holderClampZEnd.noteMainEnd(currentX, currentX + step, iv.zEnd);
  }
  return;
}

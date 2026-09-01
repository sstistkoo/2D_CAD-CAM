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
import { HOLDER_FIT_TOL, clipLeadOutToDepth } from '../shared.js';

export function emitOpenInterval(D) {
  const {
    prms, passes, step, dzScan, DZ_CAP, capTab, currentX, iv, intervals,
    entryZ, entryCapped, entryRampIsPlunge, effZMin, effPlungeTanL,
    traceFloorL, depthIdx, depths, _region, chainTipIs, findLeadOutEndZ,
    findRampOutTarget, findSteepCorner, holderClampZEnd, holderEntryReachZ,
    holderFitArea, holderTrimLeadOut, offsetStockTopXAtZ,
    pendingRampCompletions, plungeHolderFitsAt, pocketDoneRanges,
    rampedOutCorners, stockTopTab, straightRunEndZ, traceOffsetPath, rampSt,
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
      const surfX = offsetStockTopXAtZ(anchorZ);
      if (surfX !== null && surfX > currentX + 0.05) {
        rampSt.anchor = { x: surfX, z: anchorZ, first: true };
        // Jiné Z = jiný řetěz zanořování: uzavření toho předchozího
        // (dokončený zbytek pod Hloubku ap) se na nový nevztahuje.
        rampSt.closed = false;
      }
    }
    let rampOk = false;
    if (rampSt.anchor && rampSt.anchor.x > currentX + 0.05) {
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
    let coverLo = null, coverHi = null;
    for (let k = leadOut.length - 1; k >= 0; k--) {
      const s = leadOut[k];
      if (Math.abs(s.x1 - currentX) > 0.02 || Math.abs(s.x2 - currentX) > 0.02) break;
      const lo = Math.min(s.z1, s.z2), hi = Math.max(s.z1, s.z2);
      coverLo = coverLo === null ? lo : Math.min(coverLo, lo);
      coverHi = coverHi === null ? hi : Math.max(coverHi, hi);
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
      }
    }
    if (leadOut.length > 0) passObj.contourLeadOut = leadOut;
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

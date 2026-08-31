// PODÉLNÉ HRUBOVÁNÍ (osa Z) — generátor průchodů. Zleva = totéž zrcadleně (zMirror).

import { getInsert } from '../inserts/index.js';
import { mergeLayersOverHump } from './long/humpMerge.js';
import { envelopePartingLeads } from './long/partingEnvelope.js';
import { makeRegions } from './long/regions.js';
import { guardInsertFlankLong } from './long/insertFlankGuard.js';
import { topXOnLoop, getEffectivePlungeAngle, isAngleBetween, samplePartingEnvelope, fitArcsToPolyline, stockClearances, stockClearanceIsZero, stockOuterXAtZ } from '../camMath.js';
import { buildStockLoopRaw, offsetStockLoop, toolFootprint } from '../materialRemoval.js';
import { ResidualTracker } from '../residualTracker.js';
import { RESIDUAL_FIT_TOL } from '../residualHolder.js';
import { sampleOffsetRegion, buildResidual, layerZIntervalsAtX, computeResidualRegions } from '../booleanRoughing.js';
import { pointInLoop, polyIntersect } from '../../../geom/geomCore.js';
import { HOLDER_CLAMP_MARGIN, insertReachZ } from '../toolEnvelope.js';
import { HOLDER_ENTRY_STOCK_GAP, HOLDER_FIT_TOL, ENTRY_SHIFT_MAX, ENTRY_FIT_TOL, SKIM_MIN_LAYER, clipLeadOutToDepth } from './shared.js';
import { depthKey, subdivideLineSegs, mergeCollinearSegs, traceIfContinuous, isFaceLeadOut } from './long/segUtils.js';
import { makeDepthTabs } from './long/depthTabs.js';
import { makeResidualGuard } from './long/residualGuard.js';
import { makeHolderFit } from './long/holderFit.js';
import { makeEntryRamp } from './long/entryRamp.js';
import { makeIntervalScan } from './long/intervalScan.js';
import { makeRunScan } from './long/runScan.js';
import { makeHolderTrim } from './long/holderTrim.js';
import { makePlungeLines } from './long/plungeLines.js';

export function genLongPasses(ctx) {
  // Pravidla PLÁTKU — viz cam/inserts/index.js.
  const ins = getInsert(ctx.prms);
  const { prms, sRad, stockFace, step, offsetPath, stockWorldPoints, stockPathSegments, passes, foundErrors, offsetXAt, traceOffsetPath, findPocketExitZ, findLeadOutEndZ, hIntersect, machiningRange, machiningRangeX, holderClampZEnd, interferenceGuides } = ctx;
  // ── PODÉLNÉ HRUBOVÁNÍ (RIGHT → LEFT, standard soustružení) ─────
  // Pro každou hloubku currentX od (maxStockX − step) po minPartX:
  //   1. Najdi všechny Z-hranice na této hloubce (krajní stocku +
  //      průsečíky offsetu s horizontálou v currentX).
  //   2. Mezi každými dvěma sousedními hranicemi vzorkuj midpoint:
  //        — Je nad námi polotovar?  (stockOuter(zMid) >= currentX)
  //        — Je pod námi offset?      (offset(zMid) <= currentX nebo není)
  //      Když obojí → cut zone v tomto Z-intervalu.
  //   3. Sloučit sousední intervaly. Pas má zStart > zEnd
  //      (zStart = pravá hrana = max Z, typicky stockFace;
  //       zEnd = levá hrana = kde kontura zvedá offset nad currentX,
  //              nebo levý okraj polotovaru).
  //
  // Nájezd je rampovaný (G1 pod prms.entryAngle), ne svislý G0 plunge.
  // Pro monotonní tvar (kužel + rovný úsek) vyjde 1 průjezd na hloubku.

  // LEVÝ KONEC POLOTOVARU — dno pro sledování obrysu (dojezdy schodů, výjezdy
  // z kapes, cíle ramp). U válce je to −Délka.
  //
  // `|| 100` TU BÝT NESMÍ. Nula je u obou rozměrů polotovaru legitimní volba
  // (Čelo v Z 0 je nejběžnější) a `||` ji spolkne stejně jako prázdné pole,
  // které UI ukládá právě jako nulu (`applyParamChange` v camSimulator.js).
  // Hrubování zleva navíc Čelo a Délku PROHODÍ (`mirrorParamsZ`), takže Čelo 0
  // se v zrcadle stane Délkou 0 → dno spadlo na −100 a dráhy se plánovaly
  // 100 mm za koncem materiálu. Změřeno na válci Ø60 × 60, Čelo 0, zleva:
  // 7 průchodů a G-kód až na Z 100, proti 3 průchodům a Z 0,01 při Čele 0,01.
  //
  // U ODLITKU rozměry válce neříkají nic — autorita je silueta. Když Délka
  // chybí, vezme se proto její nejlevější Z, ne konstanta.
  const cylStockZ = (() => {
    const len = parseFloat(prms.stockLength);
    if (Number.isFinite(len) && len !== 0) return -len;
    if (prms.stockMode === 'casting') {
      let zMin = Infinity;
      for (const p of stockWorldPoints || []) {
        if (Number.isFinite(p.zReal)) zMin = Math.min(zMin, p.zReal);
      }
      if (Number.isFinite(zMin)) return zMin;
    }
    return 0;
  })();
  // Konec rozsahu obrábění 📐 je TVRDÉ dno pro KAŽDÝ řezný pohyb, ne jen pro
  // samotný řez vrstvy. Ten drží effZMin (viz níž), ale sledování obrysu
  // (findLeadOutEndZ) i cíl rampy (findRampOutTarget) si za dno braly polotovar
  // / siluetu odlitku — dojezd schodu a dokončení rampy pak rozsah přejely
  // o desítky mm (reálný nález na díle uživatele: dojezd na Z42 a rampa až na
  // Z21 při konci rozsahu Z61,1).
  const rangeZLoL = machiningRange ? machiningRange.zLo : -Infinity;
  const traceFloorL = Math.max(cylStockZ, rangeZLoL);

  // X-bounds offsetu
  let minPartX = 9999, maxPartX = -9999;
  offsetPath.forEach(os => {
    if (os.isDegenerate) return;
    if (os.type === 'line') {
      minPartX = Math.min(minPartX, os.p1.x, os.p2.x);
      maxPartX = Math.max(maxPartX, os.p1.x, os.p2.x);
    } else {
      minPartX = Math.min(minPartX, os.cx - os.r);
      maxPartX = Math.max(maxPartX, os.cx + os.r);
    }
  });

  // ── Rozsah obrábění 📐 ořezává i GEOMETRII, ze které se plánuje ────────
  // Díl se obrábí po ÚSECÍCH: co je mimo rozsah, se v téhle operaci neobrábí,
  // a nesmí proto ani ovlivňovat plánování drah. Bez ořezu odlitkový hrb ZA
  // hranicí rozsahu protahoval hloubkovou posloupnost (`maxStockX`) a vjezdy
  // mířily na povrch, který v rozsahu vůbec není — reálný nález na díle
  // uživatele: rozsah Z 108–195,6 (polotovar tam sahá do X≈48) vygeneroval
  // průchody na X≈65 a X≈59, tedy řez vzduchem.
  //
  // Kolize se dál hlídají proti CELÉMU polotovaru: obálka držáku se staví
  // v calculatePipeline.js z neořezaných `stockPathSegments`, stejně tak
  // validátor kolizí a model úběru. Ořez je JEN o tom, co se plánuje.
  const rangeClipZ = machiningRange
    ? { zLo: machiningRange.zLo, zHi: machiningRange.zHi } : null;
  // Vrch polotovaru v X — jen z části, která leží v rozsahu.
  let maxStockX = sRad;
  if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
    maxStockX = -9999;
    stockWorldPoints.forEach(p => {
      if (rangeClipZ && (p.zReal < rangeClipZ.zLo - 0.01 || p.zReal > rangeClipZ.zHi + 0.01)) return;
      if (p.xReal > maxStockX) maxStockX = p.xReal;
    });
    // Body obrysu můžou být řídké (dlouhý segment přes celý rozsah): dobrat
    // ještě průsečíky obrysu s oběma hranicemi rozsahu.
    if (rangeClipZ) {
      for (const zB of [rangeClipZ.zLo, rangeClipZ.zHi]) {
        const xB = stockOuterXAtZ(prms, sRad, stockPathSegments, zB);
        if (xB !== null && xB > maxStockX) maxStockX = xB;
      }
    }
    if (maxStockX < 0) maxStockX = sRad;    // v rozsahu není polotovar vůbec
  }
  // VRCH PLÁNOVACÍ (vůlí-posunuté) siluety — polotovar končí až na offsetové
  // čáře, takže tam sahá i materiál, se kterým se musí počítat.
  // Přičtení Vůle X je tu EXAKTNÍ (jinde by šlo o antivzor — viz
  // offsetStockLoop): offset je Minkowského součet s elipsou o poloose `clrX`
  // v X, takže GLOBÁLNÍ maximum v X roste přesně o `clrX` bez ohledu na tvar
  // hranice. Platí i po ořezu rozsahem 📐 (offsetuje se až ořezaná smyčka).
  const clrXPlanL = stockClearanceIsZero(prms) ? 0 : stockClearances(prms).x;
  const planTopX = maxStockX + clrXPlanL;

  // ── UZAVŘENÁ SILUETA: záloha pro `stockZRangeAt` níž ───────────────────
  // Bodový sken v `stockZRangeAt` čte OTEVŘENÝ řetěz siluety a jeho konce
  // započítá, jen když samy leží NAD hloubkou X. Odlitek nakreslený jako
  // UZAVŘENÁ smyčka (poslední bod dosedne na osu) tím o svou levou hranici
  // přijde — a protože se pak vrátí `null`, hloubka se přeskočí CELÁ.
  //
  // Změřeno na `part-8` (silueta se v krčku propadá na r 17,9): pro hloubky
  // 16,978 … 1,978 vyšlo jediné Z (pravé čelo, r 39,94), ačkoli v pásu
  // Z 258–266 stojí materiál od osy až na r 39,94. Sedm vynechaných hloubek
  // pak vzal jediný vynucený průchod na `minPartX` — 21,98 mm jedním záběrem
  // při ap 2,5 — a držák skončil 121,8 mm² v materiálu.
  let _stockLoopSpanMemo;
  const stockLoopForSpan = () => {
    if (_stockLoopSpanMemo === undefined) {
      try { _stockLoopSpanMemo = buildStockLoopRaw(prms, stockPathSegments); }
      catch { _stockLoopSpanMemo = null; }
    }
    return _stockLoopSpanMemo;
  };
  // VŠECHNY průchody uzavřené siluety hloubkou X — táž věc, jakou pro otevřený
  // řetěz vrací `hIntersect`, jen nad smyčkou (a tedy i přes uzavírací hrany).
  // KRAJNÍ Z BY NESTAČILA: u siluety, která hloubky X dosáhne ve dvou
  // oddělených místech, by pás `[zHi, zLo]` přemostil mezeru mezi nimi.
  const stockCrossingsFromLoop = (X) => {
    const loop = stockLoopForSpan();
    if (!loop || loop.length < 3) return null;
    const zs = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      if ((a.x - X) * (b.x - X) < 0) {
        zs.push(a.z + (b.z - a.z) * ((X - a.x) / (b.x - a.x)));
      }
    }
    return zs.length >= 2 ? zs : null;
  };

  // Z-rozsah polotovaru na zadané hloubce X (ořezaný rozsahem 📐 — viz výš).
  // Pro casting: rightmost/leftmost intersection řetězce + otevřené konce,
  // a když z toho nevyjde použitelný pás, uzavřená smyčka (viz výš).
  // Pro válec: [cylStockZ, stockFace].
  // Vrací { zMax, zMin, all } nebo null pokud na této X polotovar není.
  const stockZRangeAt = (X) => {
    if (prms.stockMode === 'casting') {
      let zs = hIntersect(stockPathSegments, X, false);
      const startP = stockWorldPoints[0];
      const endP = stockWorldPoints[stockWorldPoints.length - 1];
      if (startP && startP.xReal > X + 0.01) zs.push(startP.zReal);
      if (endP && endP.xReal > X + 0.01) zs.push(endP.zReal);
      if (zs.length < 2) zs = stockCrossingsFromLoop(X) || zs;
      if (zs.length < 2) return null;
      zs.sort((a, b) => b - a);
      if (!rangeClipZ) return { zMax: zs[0], zMin: zs[zs.length - 1], all: zs };
      // Ořez na rozsah: hranice se přidají jako průsečíky tam, kde přes ně
      // materiál pokračuje, aby parita v passEntryZ zůstala konzistentní.
      const inR = zs.filter(z => z >= rangeClipZ.zLo - 1e-9 && z <= rangeClipZ.zHi + 1e-9);
      for (const zB of [rangeClipZ.zHi, rangeClipZ.zLo]) {
        const xB = stockOuterXAtZ(prms, sRad, stockPathSegments, zB);
        if (xB !== null && xB > X + 0.01) inR.push(zB);
      }
      if (inR.length < 2) return null;      // v rozsahu na téhle hloubce nic není
      inR.sort((a, b) => b - a);
      return { zMax: inR[0], zMin: inR[inR.length - 1], all: inR };
    }
    if (X > sRad + 0.01) return null;
    return { zMax: stockFace, zMin: cylStockZ, all: [stockFace, cylStockZ] };
  };

  // Posloupnost hloubek: maxStockX−step, …, ≥ minPartX, vždy s vynuceným
  // posledním průjezdem PŘESNĚ na minPartX (nedořezaný hřebínek).
  const depths = [];
  // SKIM VRSTVY NAD NAKRESLENÝM VRCHOLEM. Posloupnost je kotvená na siluetě
  // odlitku, jenže materiál může sahat až na offsetovou čáru — první průchod
  // proto ukousl `ap + VůleX` (změřeno na 17 fixtures přesně o Vůli X víc,
  // tj. 20–50 % přetížení podle `ap`: part-11 ap 5 → tříska 6,0; pocket-wall
  // ap 2 → 3,0). Sílu první třísky emise dorovnat neumí — tohle je jediné
  // místo, kde to jde opravit.
  //
  // Vrstvy se PŘIDÁVAJÍ nad stávající mřížku, mřížka se NEPOSOUVÁ. Posunutí
  // celé posloupnosti o Vůli X (první pokus, změřeno a zahozeno) je totiž
  // čistá ztráta: každá hloubka padne jinam vůči schodům a údolím a
  // `part-8` kvůli tomu přišel o 5 průchodů a 337 mm² úběru, `part-17`
  // dostal 2 tvrdé kolize proti nakreslenému odlitku. Takhle zůstanou
  // všechny dosavadní hloubky bitově stejné a přibude jen skim.
  // Skim se ROZDĚLÍ ROVNOMĚRNĚ tak, aby dosedl PŘESNĚ na první hloubku hlavní
  // mřížky. Dokud šel po `ap` od `planTopX`, obě mřížky se o Vůli X rozešly a
  // na jejich styku zbyla tenká vrstva: na dílu uživatele 65,545 → 62,545 (3,0
  // = ap) → 61,545 (jen 1,0), pak už zase 3,0 (nález 21. 8. 2026 „jedna vrstva
  // zvrchu nedodržuje ap"). Rovnoměrné dělení dá 2 × 2,0 mm — každá vrstva je
  // ≤ ap a hlavní mřížka zůstává bitově stejná (kotvená dál na `maxStockX`),
  // což je podmínka z odstavce výš.
  const firstMainX = maxStockX - step;
  if (planTopX > firstMainX + SKIM_MIN_LAYER * step && firstMainX > minPartX + 0.005) {
    const nSkim = Math.max(1, Math.ceil((planTopX - firstMainX) / step - 1e-9));
    const hSkim = (planTopX - firstMainX) / nSkim;
    for (let k = 1; k < nSkim; k++) {
      const d = planTopX - k * hSkim;
      if (d > minPartX + 0.005) depths.push(d);
    }
  }
  for (let d = maxStockX - step; d > minPartX + 0.005; d -= step) depths.push(d);
  if (depths.length === 0 || Math.abs(depths[depths.length - 1] - minPartX) > 0.005) {
    depths.push(minPartX);
  }
  // X-rozsah obrábění (📐): omezit hloubky průchodů na daný interval poloměrů.
  if (machiningRangeX) {
    const filtered = depths.filter(d => d >= machiningRangeX.xLo - 0.005 && d <= machiningRangeX.xHi + 0.005);
    if (filtered.length === 0 && depths.length > 0)
      foundErrors.push({ type: 'warning', msg: `X-rozsah obrábění (${machiningRangeX.xLo}–${machiningRangeX.xHi} mm): žádné hloubky průchodů neleží v zadaném intervalu — dráhy nebyly generovány.` });
    // DNO PÁSU. Mřížka hloubek je kotvená na povrchu polotovaru, takže na
    // dolní mezi pásu nesedí — pod poslední hloubkou zůstával neobrobený
    // prstenec až `ap` silný (part-1, pás X 20…40: hloubky končí na r21,98).
    // Přidá se proto průchod PŘESNĚ na `xLo`, ale jen když mřížka pod mez
    // opravdu pokračovala (materiál tam tedy je) — pás, který díl celý
    // obsáhne, tím pádem nemění nic. Je to táž výjimka z kroku `ap`, jakou
    // dělá vynucený poslední průchod na `minPartX` výš.
    //
    // Horní mez se takhle dorovnat nedá ani nemusí: hloubka nad `xHi` se
    // v tomhle úseku neobrábí (patří sousednímu úseku, jehož dno je právě
    // `xHi`) a průchod na `xHi` by z ní nic neubral.
    if (filtered.length > 0) {
      const deepest = filtered[filtered.length - 1];
      const below = depths.some(d => d < machiningRangeX.xLo - 1e-6);
      if (below && deepest - machiningRangeX.xLo > Math.max(0.02, step * 0.02))
        filtered.push(machiningRangeX.xLo);
    }
    depths.splice(0, depths.length, ...filtered);
  }

  const effPlungeDegL = getEffectivePlungeAngle(prms);
  const effPlungeTanL = Math.tan(effPlungeDegL * Math.PI / 180);
  // Směr přímky zanoření jako JEDNOTKOVÝ vektor (ux v X, uz v Z) + krok skenu
  // podle DOMINANTNÍ osy. U mělkých úhlů (≤ 45°) vyjde krok přesně 0,5 mm
  // v Z, tedy bod po bodu totéž co dřívější parametrizace přes Δz; u strmých
  // se skenuje po 0,5 mm v X. Bez toho se při úhlu 90° (upichovák, Auto)
  // parametrizace přes Δz rozpadla: `t * tan(90°)` = 0,5 × 1,6e16, takže kotva
  // rampy vyšla na X 486 708 909 a přesně to se vydalo do G-kódu
  // (nález uživatele 27. 8. 2026: `N560 G0 X486708909.740`).
  const plungeDirL = (() => {
    const a = effPlungeDegL * Math.PI / 180;
    const ux = Math.abs(Math.sin(a)), uz = Math.abs(Math.cos(a));
    return { ux, uz, step: 0.5 / Math.max(ux, uz, 1e-9) };
  })();
  // Vjezd na UMĚLÉ hranici (rozsah 📐 / hranice regionu) se dělá RAMPOU právě
  // proto, že napravo od ní materiál dál STOJÍ — kolmý zápich by do něj sjel
  // i s držákem. Při úhlu zanoření 90° ale rampa na kolmý zápich degeneruje:
  // tan(90°) je 1,6e16, posun v Z vyjde nula a vydá se `G1 X… Z<hranice>`
  // označené „Rampa 90.0°“, které na hranici jen zapíchne. Guard tak byl
  // sám proti sobě.
  // Reálný nález na díle uživatele 26. 8. 2026 (upichovák, Auto = 90°):
  // 8 nálezů držáku / 393 mm² přesně na Startu rozsahu Z=333,06; s úhlem 45°
  // ten shluk zmizel úplně. Svislý vjezd na umělou hranici proto neplatí za
  // rampu a hloubka se řeší jako „rampa se sem nevejde“ (viz !rampOk níž).
  const entryRampIsPlunge = effPlungeDegL >= 89.5;

  // Uzavřená smyčka polotovaru (odlitek) — zvedání rampových kotev kapes
  // na hranici materiálu + vůli X; null = válec (rampy kotví postaru).
  // `stockLoopFullL` = CELÝ polotovar (hlídání kolizí držáku, viz
  // holderEntryCapZ níž), `stockLoopL` = ořezaný rozsahem 📐 (plánování drah,
  // viz rangeClipZ výš).
  const stockLoopFullL = prms.stockMode === 'casting' ? buildStockLoopRaw(prms, stockPathSegments) : null;
  // Ořez smyčky Z-pásem rozsahu (Clipper). Víc komponent = polotovar je
  // v pásu přerušený; bere se ta s největším rozpětím X (hlavní kus).
  const clipLoopToRange = (loop) => {
    if (!loop || !rangeClipZ) return loop;
    let xTop = -Infinity;
    for (const p of loop) if (p.x > xTop) xTop = p.x;
    const band = [
      { x: -10, z: rangeClipZ.zLo }, { x: xTop + 10, z: rangeClipZ.zLo },
      { x: xTop + 10, z: rangeClipZ.zHi }, { x: -10, z: rangeClipZ.zHi },
    ];
    let parts = [];
    try { parts = polyIntersect([loop], [band]); } catch { return loop; }
    if (parts.length === 0) return null;
    let best = null, bestSpan = -Infinity;
    for (const pt of parts) {
      let lo = Infinity, hi = -Infinity;
      for (const p of pt) { if (p.x < lo) lo = p.x; if (p.x > hi) hi = p.x; }
      if (hi - lo > bestSpan) { bestSpan = hi - lo; best = pt; }
    }
    return best;
  };
  const stockLoopL = clipLoopToRange(stockLoopFullL);
  // PLÁNOVACÍ (vůlí-posunutá) silueta odlitku — „tečkovaná" offsetová čára
  // z náhledu. Sdílená implementace: offsetStockLoop v materialRemoval.js
  // (tam i důvod, proč se posouvá přes polyOffset a ne ad-hoc odečtením
  // vůle na konci zjištěné přímky — na diagonále to není totéž co posun
  // KOLMO k hranici; reálný nález na díle uživatele: dojezd „bez schodků"
  // u strmé stěny systematicky minul offsetovou čáru).
  const offsetLoopOf = (loop) => offsetStockLoop(loop, prms);
  const stockLoopOffsetL = offsetLoopOf(stockLoopL);
  // Táž čára nad CELÝM polotovarem (bez ořezu rozsahem) — hlídání kolize
  // držáku musí vidět i materiál za hranicí rozsahu (holderEntryCapZ níž).
  const stockLoopOffsetFullL = (stockLoopFullL === stockLoopL)
    ? stockLoopOffsetL : offsetLoopOf(stockLoopFullL);
  // Max X vůlí-posunuté siluety na dané Z (stejný vzor jako
  // planTopXAtZ v gcodeEmit.js, nad stockLoopOffsetL místo
  // stockLoop0OffsetRef) — offsetová čára pro vjezd na hranici rozsahu Z.
  const offsetStockTopXAtZ = (z) => topXOnLoop(stockLoopOffsetL, z);

  // Sken překážek a konce rovných úseků — viz ops/long/runScan.js.
  const { pocketBestX, dzScan, blockedAt, refineEngageZ, straightRunEndZ, stockRunEndZ } =
    makeRunScan({ offsetXAt, stockLoopOffsetFullL });

  // ── Kde smí ZAČÍT zanořovací rampa (strop podle držáku) ───────────────
  // Vjezd průchodu se dosud řídil jen tím, kde na dané hloubce začíná
  // polotovar (passEntryZ), plus ručním „Startem rozsahu Z" (📐). U odlitku,
  // kde NAPRAVO od obráběné zóny stojí hrb (velký průměr), byla kotva rampy
  // na povrchu TOHO hrbu — rampa odtud na hloubku vyšla desítky mm dlouhá,
  // nevešla se do intervalu a celý průchod se zahodil. Menší průměry pak
  // zůstaly nehrubované a obejít se to dalo jen ručním posunutím Startu
  // rozsahu Z doleva, až za hrb (reálný nález na díle uživatele).
  //
  // Tenhle helper takové místo najde sám: nejpravější Z, kde
  //   (a) nástroj stojí na povrchu (vůlí-posunutá silueta = „tečkovaná"
  //       offsetová čára, Přídavek X/Z polotovaru) a rampa odtud na hloubku
  //       ještě dosáhne nad dno intervalu,
  //   (b) vedle se vejde DRŽÁK — v celém svém axiálním dosahu od špičky
  //       (+ HOLDER_STOCK_GAP volného prostoru) nestojí materiál VYŠŠÍ, než
  //       je povrch v místě vjezdu.
  // Výsledek se pak zanořuje rampou úplně stejně jako vjezd na hranici
  // rozsahu Z — sdílí s ním i celý řetěz kotev (entryRampAnchor níž).
  const T = makeDepthTabs({ prms, stockLoopOffsetFullL, passes });
  const { DZ_CAP, holderLoopL, holderZLoL, holderZHiL, capZ0, capTab,
    stockTopTab, holderBottomAt, newFloorTab, notePassInto, syncCutFloor } = T;
  // Polygonový model zbytku pro hlídání držáku — viz ops/long/residualGuard.js.
  const { orderAware, residHolderL, residEntryArea, plungeHolderFitsAt, entryHolderArea } =
    makeResidualGuard({ prms, stockPathSegments, stockLoopOffsetFullL, holderLoopL, passes,
      offsetStockTopXAtZ, step });
  // Vejde se držák? — viz ops/long/holderFit.js.
  const { residTopAt, holderNearDz, holderFitArea, ownCutOf, holderFitAreaAlong,
    holderFitsAt } = makeHolderFit({ T, prms });
  // Kotva vjezdu a rampa — viz ops/long/entryRamp.js.
  const { holderEntryCapZ, holderEntryReachZ, stockEntryRamp, findRampOutTarget,
    findSteepCorner } = makeEntryRamp({ T, holderFitsAt, stockLoopOffsetL, plungeDirL,
      effPlungeTanL, rangeZLoL, offsetXAt, blockedAt });

  // Ořez sledování kontury obálkou držáku — viz ops/long/holderTrim.js.
  const { holderTrimLeadIn, holderTrimLeadOut } = makeHolderTrim({ holderClampZEnd });
  let plungeShallowed = 0;
  let deferredHolderSkips = 0;

  // ── Upichovák (parting) v podélném hrubování ──
  // Zanoření je svislé a tělo plátku (šířka wIns) zasahuje od programovaného
  // bodu (střed rádiusu levého rohu) DOPRAVA. Roh kapsy se neurčuje sklonem
  // kontury (findPlungeCorner s tan90° nikdy nenajde), ale pravým okrajem
  // kapsy posunutým o (w−2r) — druhý rádius plátku pak přesně lícuje pravou
  // stěnu. Sjezdy/dojezdy po kontuře jedou po OBÁLCE (viz post-process níže).
  const isParting = ins.cutsFullWidth;
  const wInsL = isParting ? ins.widthZ : 0;
  const rInsL = isParting ? ins.cornerR : 0;
  const w2RL = isParting ? ins.flatSpanZ : 0;
  // Bez „Hrub. bez schodků": upichovák bere jen jednou stranou — žádné
  // sledování kontury (leadIn/leadOut/dokončení kapsy), jen svislé zápichy
  // a jízda v Z; schodky zůstávají.
  const partingNoDress = isParting && !prms.noStepRoughing;
  let partingNarrowPockets = 0;
  // Kapsy, jejichž DNO leží v tvrdé obálce držáku (dobrání se vynechá).
  let pocketHolderSkips = 0;
  // Kapsy, do kterých se mezi stěny nevejde DRŽÁK (clamp.span) — vynechané.
  // Hloubky, na kterých obálka DRŽÁKU něco zastavila. Tiché zahození je
  // horší než samo vynechání: uživatel nepozná, jestli jde o fyzikální mez
  // (držák se prostě nevejde), nebo o chybu — a hledá to v geometrii
  // (reálný nález: pravá strana part-13-zleva-flange, 17 průchodů pryč bez
  // jediného hlášení; jeden z counterů se dokonce plnil, ale nikdo ho
  // nehlásil — osiřel).
  //
  // Počítají se HLOUBKY, ne pokusy: zastavený interval ještě neznamená
  // ztrátu — táž hloubka bývá obsloužena jiným intervalem nebo přeskenováním
  // (na range-end-leadout dělalo počítání pokusů 17 „vynechaných průchodů",
  // ačkoli reálně chyběly 4). Ztráta = hloubka, na které nakonec NEVZNIKL
  // žádný průchod; vyhodnotí se až po smyčce proti skutečně vydaným
  // průchodům, takže na tom nezávisí, kolika `continue` se tam došlo.
  const holderBlockedDepths = new Set();
  // Z-ZÓNY, které obálka držáku zahodila celé. Počítání po HLOUBKÁCH
  // (holderBlockedDepths výš) tuhle ztrátu neuvidí: stačí, aby táž hloubka
  // vydala průchod někde jinde, a zóna zmizí bez jediného slova — přesně tak
  // se u dílu uživatele potichu vypařila CELÁ pravá strana (Z 265→367,
  // 101 mm), protože držák by musel přes klín, na který nedosáhne destička.
  // Vyhodnotí se až proti skutečně vydaným průchodům (níž), aby zóny
  // dobrané dojezdem („bez schodků" sledování obrysu) nehlásily falešně.
  const holderDroppedZones = [];

  // Navázání: předchozí průchod končí přesně v bodě, odkud začíná leadIn
  // dalšího → nesmí odskočit (žádný zbytečný trojúhelník odskok+návrat),
  // plynule pokračuje po kontuře. Sdíleno kapsovou větví i fallbacky.
  const linkToPrev = (leadIn) => {
    const prevPass = passes[passes.length - 1];
    if (prevPass && prevPass.type === 'long' && !prevPass.contourLeadOut && leadIn.length > 0
        && Math.abs(prevPass.zEnd - leadIn[0].z1) < 0.05
        && Math.abs(prevPass.x - leadIn[0].x1) < step + 0.1) {
      prevPass.noRetract = true;
    }
  };

  // Najde bod na offsetPath, kde sklon dX/dZ ve směru jízdy (klesající Z)
  // dosáhne úhlu zanoření effPlungeDegL — odtud se opouští kontura a
  // jede se rampou na currentX. Skenuje od zFrom dolů k zStop. Vrací
  // {x,z}, nebo null, pokud sklon prahu nikdy nedosáhne.
  const findPlungeCorner = (zFrom, zStop) => {
    const h = 0.05;
    for (let z = zFrom; z > zStop + h; z -= h) {
      const xa = offsetXAt(z), xb = offsetXAt(z - h);
      if (xa === null || xb === null) continue;
      const slope = (xa - xb) / h;
      if (slope >= effPlungeTanL) return { x: xa, z };
    }
    return null;
  };

  // ── Dobírání kapsy „najednou" (pocketFinishAtOnce) ──
  // Když je zapnuté, kapsa se vykope celá hned (viz blok níže), a její
  // Z-zóna se zapíše sem. Hlavní smyčka hloubek X pak tutéž kapsu už
  // nezpracovává (přeskočí pocket-interval, jehož střed leží v zóně) a
  // otevřené průchody do ní nezajíždějí (leadOut se ořízne na vršek zóny).
  // DŮLEŽITÉ: blockedAt() je VŽDY čistá geometrie (žádné „potlačení"
  // uvnitř) — jinak by se kapsa jevila jako otevřená a otevřený řez by ji
  // pohltil do jednoho dlouhého průjezdu skrz materiál.
  const pocketDoneRanges = [];
  // Rohy strmé stěny, které už dojezd „bez schodků" (otevřený vjezd, idx===0)
  // sám sešel rampou dolů (viz findSteepCorner/findRampOutTarget níž). Kapsa
  // za bossem na HLUBŠÍ hloubce narazí na TENTÝŽ roh znovu (roh je vlastnost
  // obrysu, nezávislá na currentX) — bez téhle evidence by ho sledovala
  // (contourLeadIn) a rampovala odznova, i když tu stěnu už jednou prošel
  // jiný průchod (reálný nález na díle uživatele — doslovný duplicitní
  // úsek G-kódu). Tolerance 2 mm (roh se s hloubkou nepatrně posouvá).
  const rampedOutCorners = [];
  // reachedX = hloubka (X), na kterou ramp-out od tohoto rohu skutečně
  // sjel (rampTarget.x). Suppress smí platit jen když ramp POKRYL i
  // hloubku AKTUÁLNĚ zpracovávaného průchodu (reachedX <= depthX) — jinak
  // by se roh mylně považoval za "hotový" i po velkém skoku hloubek
  // (několik depthIdx bez viditelné kapsy za bossem), kde ramp sjel jen o
  // kousek (typicky jeden krok) a zbytek stěny až k aktuální hloubce
  // zůstal neobrobený (reálný nález na díle uživatele: schod bez dojezdu —
  // kapsa se kvůli téhle shodě celá potlačila, i leadOut otevřeného řezu
  // ustoupil ve prospěch téže — potlačené — kapsy).
  const cornerAlreadyRampedOut = (cx, cz, depthX) =>
    rampedOutCorners.some(c => Math.abs(c.x - cx) < 2 && Math.abs(c.z - cz) < 2 && c.reachedX <= depthX + 0.5);

  // Hledání intervalů na hloubce — viz ops/long/intervalScan.js.
  const { stockCrossingsAt, passEntryZ, scanIntervals, scan,
    counters: scanCounters } = makeIntervalScan({
      prms, offsetXAt, holderClampZEnd, stockLoopL, stockLoopOffsetL, planTopX,
      isParting, wInsL, rInsL, dzScan,
      blockedAt, refineEngageZ,
      holderBlockedDepths });

  // ── VEJDE SE DRŽÁK ZA HRANICI ÚSEKU? (27. 8. 2026) ──────────────────
  // Rozdělením na úseky se každý obrobí jen do SVÉ vlastní hloubky — vedle
  // pak zůstane stát stěna až do své hotovní kontury. Když nástroj pracuje
  // těsně u hranice na své největší hloubce, držák přes tu stěnu přejíždí —
  // a právě tam vznikaly nálezy (změřeno: 7 fixtures, 5,8–43,6 mm², vždy na
  // zanoření do kapsy). Tenhle test se ptá na FINÁLNÍ stav sousedního úseku
  // (kontura), ne na živý model zbytku — ten při rozhodování o zlomu ještě
  // není naplněný.
  const holderFitsOverContour = (z, tipX) => {
    if (!holderLoopL) return true;
    let area = 0;
    for (let q = z + holderZLoL; q <= z + holderZHiL + 1e-9; q += DZ_CAP) {
      if (q - z < holderNearDz - 1e-9) continue;
      const t = offsetXAt(q);
      if (t === null) continue;
      const room = Math.max(holderBottomAt(q - z) - HOLDER_ENTRY_STOCK_GAP, 0.05);
      const d = t - (tipX + room);
      if (d > 0) area += d * DZ_CAP;
    }
    return area <= HOLDER_FIT_TOL;
  };

  // Regiony (kde se díl trhá na úseky a v jakém pořadí jedou) — ops/long/regions.js.
  const { FULL_REGION, computeRegions } = makeRegions({
    prms, depths, dzScan, offsetXAt, machiningRange, interferenceGuides,
    stockWorldPoints, stockLoopFullL, stockCrossingsAt, stockZRangeAt,
    passEntryZ, scan, stockLoopL, holderEntryReachZ, step, holderFitsOverContour,
  });
  const _regions = computeRegions();
  // Pipeline pak změří, jestli se dělení podle hrbu vyplatilo (holderCheck.js).
  const _peakZs = [];
  for (const q of _regions) {
    if (q.zHiKind === 'peak' && Number.isFinite(q.zHi)) _peakZs.push(q.zHi);
    if (q.zLoKind === 'peak' && Number.isFinite(q.zLo)) _peakZs.push(q.zLo);
  }
  if (_peakZs.length > 0) { ctx.usedPeakSplit = true; ctx.peakSplitZs = _peakZs; }

  for (const _region of _regions) {
  // Schodová evidence obálky držáku platí v rámci jednoho regionu —
  // jiný region hrubuje jinou stěnu, jeho schody sem nepatří.
  if (holderClampZEnd && holderClampZEnd.resetStair) holderClampZEnd.resetStair();
  // Strmé stěny, kde rampa (viz níž) byla oříznuta na currentX (Hloubka
  // ap) — po skončení hloubkové smyčky TOHOTO regionu se sem doplní
  // dokončovací zákrok, který strmou stěnu dorampuje na její původní
  // (neořízlý) cíl, než se přejede na další region (reálný nález na díle
  // uživatele: bez toho zůstal klín materiálu pod ořízlou rampou navždy
  // neobrobený — nic dalšího už tam nezajíždí).
  const pendingRampCompletions = [];
  // Paměť přímek zanoření — viz ops/long/plungeLines.js.
  const { plungeLineRuns, notePlungeRun, plungeRunCovers } =
    makePlungeLines({ effPlungeTanL });
  // Začátek průchodů TOHOTO regionu — odložené zanoření se řadí na konec
  // svého regionu, ne až za celý program (viz konec smyčky regionů).
  const regionMark = passes.length;
  // Vjezd na hranici rozsahu Z (machiningRange.zHi): kotva rampy se
  // ŘETĚZÍ mezi hloubkami (viz níž), ne restartuje pokaždé od povrchu —
  // jinak by každá hlubší vrstva znovu rampovala i tu ČÁST, kterou už
  // vyřízla vrstva PŘEDCHOZÍ (reálný nález na díle uživatele — druhá
  // rampa mířila zpátky nad povrch místo napojení na konec první).
  let entryRampAnchor = null;
  // Jakmile řetěz narazí na hranici (kontura/blokace), zbytek MÉNĚ než
  // Hloubka (ap) do skutečné cílové kontury se dořeže jedním kratším
  // krokem (níž), ne zahodí — pak se řetěz uzavře (nezkoušet znovu na
  // každé další, ještě hlubší vrstvě).
  let entryRampClosed = false;
  // Stojí nástroj OPRAVDU na kotvě řetězu? `pocketReposition` emituje přesun
  // z AKTUÁLNÍ polohy uvnitř kapsy (odskok → G0 Z → sjezd), ne nájezd zvenčí —
  // je bezpečný jen tehdy, když je kotva koncem PRÁVĚ VYDANÉHO průchodu.
  // Řetěz vjezdové rampy běží napříč hloubkami, takže se mezi jeho kroky může
  // vklínit průchod odjinud (typicky zanoření do kapsy na téže hloubce). Pak
  // kotva osiří a týž rychloposuv vede skrz stojící materiál — v takovém
  // případě se krok vydá jako normální vjezd (rampa od kotvy zůstává, jen se
  // k ní najede zvenčí). Hlídá tests/cam-ramp-chain.test.js.
  const chainTipIs = (anchor) => {
    const last = passes[passes.length - 1];
    return !!last && last.zStart !== undefined
      && Math.abs(last.x - anchor.x) < 0.01 && Math.abs(last.zStart - anchor.z) < 0.01;
  };
  // ── Obálka DRŽÁKU pro kapsový SPAN (Fáze 3b) ───────────────────────────────
  // Scan intervaly kapes vědomě neořezává (`holderClampZEnd` platí pro
  // jednostranně otevřený řez), takže by se do kapsy mezi dvě stěny pustil celý
  // interval a držák by se opřel o stěnu nad sebou. `clamp.span` vrací okno,
  // kam se držák mezi stěny opravdu vejde; null = kapsa je pro něj moc úzká
  // (patří jinému nástroji, ne podélnému hrubování).
  // MUSÍ se volat na KAŽDÉM místě, kde se kapsový interval bere ze `scan()` —
  // tedy i uvnitř bursteu „dobrat kapsu najednou", který si intervaly na každé
  // nové hloubce skenuje ZNOVU. Bez toho burst sjížděl ap po ap do kapsy širší
  // než držák a opíral se o stěnu (naměřeno na tests/cam-holder: 7 kolizí,
  // 12–32 mm² každá).
  const holderSpanClamp = (X, iv) => {
    if (!iv || !iv.blocked || !holderClampZEnd || !holderClampZEnd.span) return iv;
    const sp = holderClampZEnd.span(X, iv.zStart, iv.zEnd);
    if (!sp) return null;
    const out = { ...iv, zStart: Math.min(iv.zStart, sp.zStart), zEnd: Math.max(iv.zEnd, sp.zEnd) };
    return (out.zStart - out.zEnd < dzScan) ? null : out;
  };
  // Nejmělčí… vlastně naposledy ÚSPĚŠNÁ hloubka tohohle regionu — proti ní se
  // pozná, že posloupnost přestřelila nedosažitelnou hranici (viz uzavírací
  // vrstva na konci hloubkové smyčky).
  let lastDepthWithPasses = null;
  for (let depthIdx = 0; depthIdx < depths.length; depthIdx++) {
    const currentX = depths[depthIdx];
    const sz = stockZRangeAt(currentX);
    if (!sz) continue;

    // Rozsah obrábění (📐): ořízne Z-zónu na uživatelem zadaný interval;
    // + Z-okno regionu (region roughing).
    // Hranice regionu platí jen NAD povrchem svého údolí (zHiSurf/zLoSurf):
    // v hloubce kůry dna se sousední regiony spojí — průchod jede přes celé
    // údolí od skutečného kraje materiálu (žádné kolmé sjezdy doprostřed kůry).
    // Po rozpuštění HORNÍ hranice patří hloubka regionu NAD ní (ten už ji
    // vzal se svou rozpuštěnou dolní hranicí) — jinak duplicitní průchody.
    // Rozpouštění hranice platí jen BEZ zanořování: kolmo do kůry dna se sjet
    // nedá, takže hloubku přebere region NAD ní — jenže ten na ni dosáhne jen
    // svým prvním intervalem a materiál za hranicí (dno vybrání) zůstane stát
    // (reálný nález na díle uživatele: pod vrstvou Ø19,5 se ve vybrání už nic
    // nevzalo). Se zapnutým Zanořováním hranice DRŽÍ a vjezd na ni se řeší
    // RAMPOU pod úhlem zanoření (entryCapped níž) — přesně jako na hranici
    // rozsahu 📐, kterou si uživatel dosud musel nastavovat ručně.
    //
    // ZKOUŠENO A ZAMÍTNUTO (10. 8. 2026) — posunout hranici na ÚSTÍ údolí
    // (`zHiMouth`/`zLoMouth`, dnes jen v diagnostickém logu) tam, kde je nad
    // dnem uvnitř údolí vzduch, a střed dna nechat jen pro kůru. Vypadá to
    // jako správné rozdělení dvou rolí, ale měření to nepotvrdilo — detaily
    // a čísla v docs/geometry-libs-migration.md, sekce „ZBÝVÁ — hranice úseku
    // leží ve STŘEDU údolí". Krátce: symptom uživatele („bere to od
    // prostředka") je u hloubek POD dnem, kam tahle změna nesahá, a vjezd na
    // ústí se bez capu držáku stane nehlídaným → nové kolize držáku na
    // 5 fixtures. NEZKOUŠET ZNOVU BEZ ŘEŠENÍ VLASTNICTVÍ ÚDOLÍ.
    const dissolveEdge = !prms.plungeRoughing;
    if (dissolveEdge && _region.zHi !== Infinity && _region.zHiSurf !== undefined && currentX <= _region.zHiSurf + 0.01) continue;
    const regZHi = (!dissolveEdge || _region.zHiSurf === undefined || currentX > _region.zHiSurf + 0.01) ? _region.zHi : Infinity;
    const regZLo = (!dissolveEdge || _region.zLoSurf === undefined || currentX > _region.zLoSurf + 0.01) ? _region.zLo : -Infinity;
    const effZMin = Math.max(machiningRange ? Math.max(sz.zMin, machiningRange.zLo) : sz.zMin, regZLo);
    // Vjezd patří tam, kde v tomto Z-okně SKUTEČNĚ začíná polotovar
    // (passEntryZ výš) — okno regionu i rozsah 📐 můžou začínat ve vzduchu.
    // Null = na téhle hloubce v okně žádný materiál není.
    const effZMax = passEntryZ(
      Math.min(machiningRange ? Math.min(sz.zMax, machiningRange.zHi) : sz.zMax, regZHi), effZMin, sz, currentX);
    if (effZMax === null || effZMax - effZMin < 0.1) continue;
    // Skenem zprava doleva najdeme všechny volné intervaly (offset
    // nepřekračuje currentX). První interval (od pravé hrany
    // polotovaru) = klasický otevřený vjezd. Každý další interval je
    // kapsa za "bossem" kontury — vede se k ní sledováním kontury
    // (G1/G2/G3) a rampou pod úhlem zanoření, jen se zapnutým
    // zanořováním.
    //
    // Stock outline NEPROFILUJE řez (i kdyby měl casting přerušení /
    // dolíky uprostřed) — fyzický nástroj projíždí mezerou ve vzduchu
    // bez problému. Stopuje JEN kontura.
    const passMark = passes.length;
    let entryZ = effZMax;
    let { intervals, firstOpen } = scan(currentX, entryZ, effZMin, true);
    // ── Zanořování (📥 „Zanořování"): najdi, KDE se dá začít ──────────────
    // Na tuhle hloubku se nedá vjet zprava — vjezd zahodila obálka DRŽÁKU
    // (napravo stojí materiál, do kterého by narazil) nebo se do okna
    // nevejde rampa od povrchu nad vjezdem (odlitkový hrb NAPRAVO od
    // obráběné zóny; rampa by vyšla delší než celé Z-okno). Vjezd se proto
    // posune doleva na nejpravější místo, kde zanoření opravdu MŮŽE začít:
    // nástroj tam stojí na offsetové čáře polotovaru, rampa odtud dosáhne a
    // vedle se vejde držák (holderEntryCapZ výš). Bez toho taková hloubka
    // vypadla celá a materiál zůstal stát — obejít se to dalo jen ručním
    // posunutím Startu rozsahu Z (reálný nález na díle uživatele).
    // Geometrie DESTIČKY je v tom už zahrnutá: mezní čáry hlídání jsou
    // zapracované do obrobitelné kontury, kterou sken respektuje.
    // Vjezd na hranici REGIONU je pro držák stejně nebezpečný jako posunutý
    // start zanoření: hranice leží UPROSTŘED materiálu (napravo od ní stojí
    // sousední region), takže se tam rampa musí posunout tam, kam držák pustí
    // — jinak vjede bokem do neobrobeného odlitku (reálný nález na díle
    // uživatele: oranžová kolize držáku uprostřed vybrání).
    // POZOR, ten holder cap NENÍ jen opatrnost: pokus vyjmout z něj hranici
    // ležící na ústí údolí (10. 8. 2026, „za ústím je přece vzduch") vyrobil
    // NOVÉ kolize držáku na 5 fixtures — držák je široký a dosáhne přes údolí
    // na protilehlý hrb, i když přímo za hranicí vzduch je.
    const regionCappedRaw = regZHi !== Infinity && Math.abs(effZMax - regZHi) < 1e-6;
    if (prms.plungeRoughing) {
      const surf0 = offsetStockTopXAtZ(entryZ);
      const rampReach = surf0 !== null ? entryZ - (surf0 - currentX) / effPlungeTanL : Infinity;
      if (!firstOpen || intervals.length === 0 || rampReach <= effZMin + 0.05 || regionCappedRaw) {
        const zCap = holderEntryCapZ(currentX, entryZ, effZMin);
        // Zanoření na hranici REGIONU smí vzniknout jen tam, kde se vedle
        // vjezdu vejde DRŽÁK. Hranice leží uprostřed materiálu (napravo od ní
        // stojí sousední region), takže bez takového místa by rampa vjela
        // bokem do neobrobeného odlitku — reálný nález na díle uživatele:
        // zanoření uprostřed vybrání mezi dvěma hrby, oranžová kolize držáku
        // 87 mm². Tam se hloubka v tomhle regionu radši vynechá (jako před
        // zavedením zanořování na hranici); zanoření zůstane jen tam, kde je
        // pro držák prokazatelně místo.
        if (regionCappedRaw && !isFinite(zCap)) { holderBlockedDepths.add(depthKey(currentX)); continue; }
        if (isFinite(zCap) && zCap < entryZ - 1e-6) {
          const reScan = scan(currentX, zCap, effZMin, true);
          if (reScan.firstOpen && reScan.intervals.length > 0) {
            entryZ = zCap; intervals = reScan.intervals; firstOpen = reScan.firstOpen;
          }
        }
      }
    }
    // Vjezd stojí na UMĚLÉ hranici — rozsah 📐 nebo posunutý start zanoření —
    // takže napravo od něj materiál dál stojí a kolmý zápich by do něj sjel;
    // zanořuje se rampou (níž).
    // Hranice REGIONU je umělá stejně jako hranice rozsahu 📐: napravo od ní
    // materiál dál stojí (patří sousednímu regionu), takže se na ni nesmí
    // kolmo zapíchnout — vjezd tam patří rampě.
    const regionCapped = regionCappedRaw;
    const entryCapped = (entryZ !== effZMax)
      || (machiningRange && Math.abs(effZMax - machiningRange.zHi) < 1e-6)
      || regionCapped;
    // ── DRŽÁK NA NÁJEZDU PRŮCHODU (order-aware) ──────────────────────────
    // Poloha, ze které průchod sjíždí na hloubku, se proti držáku nekontroluje
    // vůbec — `holderEntryCapZ` běží jen v zanořovací větvi. I „normální" vjezd
    // do ÚDOLÍ má ale 20 mm držáku nad sebou v +Z a tam může stoupat kůra
    // odlitku (nález uživatele 26. 8. 2026: oranžová stopa 0,42 mm² na Z≈105
    // od sjezdu na Z≈84). Kolizní je SAMA POLOHA, ne cesta k ní — zdvih nad
    // konturu ji změřeně nechal beze změny, takže to nejde spravit přejezdem.
    //
    // Kontroluje se poloha NÁJEZDU (`zStart + Vůle Z + R`, viz rapidStopZ
    // v gcodeEmit.js), protože tam držák dosahuje nejdál v +Z. Vjezd se posune
    // doleva po `DZ_CAP`, dokud držák neprojde; když se nenajde nic, interval
    // se zahodí. Se STATICKOU obálkou tohle stálo −3 948 mm² úběru a vyrobilo
    // nové kolize (změřeno) — proto jen s order-aware modelem.
    if (orderAware && residHolderL && intervals.length > 0) {
      const approachDz = (stockClearanceIsZero(prms) ? 0 : stockClearances(prms).z)
        + (parseFloat(prms.toolRadius) || 0);
      const iv0 = intervals[0];
      // Posun je OMEZENÝ: dál než pár milimetrů se vjezd stěhovat nesmí, jinak
      // se změní i to, KUDY se k němu přijíždí — na `range-end-leadout` daleký
      // posun vyrobil sedm nových průchodů na Z≈173 a s nimi zdvih skrz kůru
      // (1 100 mm² kolizí, které tam předtím nebyly). Kde se v tom okně místo
      // nenajde, vjezd zůstane, jak byl.
      const zFloorEntry = Math.max(iv0.zEnd + dzScan, iv0.zStart - ENTRY_SHIFT_MAX);
      // HRUBĚ A PAK DOJEMNA. Dotaz na držák proti zbytku stojí polygonové
      // operace a tahle smyčka ho volá až 12× na každý interval a hloubku —
      // v profilu 27. 8. 2026 je to přes polovinu času plánování. Nejdřív se
      // proto skáče po 1 mm a teprve poslední krok se dojemní po DZ_CAP,
      // takže vyjde TÁŽ hodnota za zlomek dotazů (ověřeno otiskem 26 fixtures).
      const COARSE = Math.max(DZ_CAP * 4, 1);
      let zTry = iv0.zStart;
      while (zTry > zFloorEntry && entryHolderArea(currentX, zTry + approachDz) > ENTRY_FIT_TOL) {
        zTry -= COARSE;
      }
      // Zpátky nahoru po jemném kroku: hledá se PRVNÍ z shora, kde se držák vejde.
      if (zTry < iv0.zStart - 1e-9) {
        let zFine = Math.min(iv0.zStart, zTry + COARSE - DZ_CAP);
        while (zFine > zTry && entryHolderArea(currentX, zFine + approachDz) > ENTRY_FIT_TOL) {
          zFine -= DZ_CAP;
        }
        if (zFine > zTry) zTry = zFine;
      }
      // Nenašlo se v okně nic → vjezd zůstane, jak byl. Zahodit interval (natož
      // celou hloubku) se ZMĚŘENĚ nevyplácí: shodit `firstOpen` přeznačí zbytek
      // na KAPSU a spustí jinou větev — na `range-end-leadout` to samo o sobě
      // stálo dalších 340 mm² úběru.
      if (zTry > zFloorEntry && zTry < iv0.zStart - 1e-9) iv0.zStart = zTry;
    }
    intervals.forEach((iv, idx) => {
      // Vynech triviálně krátké průchody (nic neuříznou).
      if (iv.zStart - iv.zEnd < dzScan) return;
      if (idx === 0 && firstOpen) {
        // Otevřený vjezd zprava přes hranu polotovaru.
        const passObj = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
        // ── Vjezd na hranici rozsahu Z rampou (Fáze 4) ──────
        // Když rozsah obrábění začíná UVNITŘ polotovaru (napravo od
        // hranice ještě stojí materiál), kolmý zápich na hloubku
        // nahrazuje rampa pod úhlem zanoření na OFFSETOVOU čáru
        // (offsetStockTopXAtZ — vůlí-posunutá silueta, stejná jako
        // planTopXAtZ v gcodeEmit.js). Kotva rampy se ŘETĚZÍ mezi
        // hloubkami (entryRampAnchor) — první hloubka najede z povrchu,
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
              && (!entryRampAnchor
                || (entryRampAnchor.first && Math.abs(entryRampAnchor.z - entryZ) > 1e-6))) {
            // Kotvu posuň ZA hranici úseku, kam až pustí držák — jinak rampa
            // vjede doprostřed údolí a jeho druhá půlka zůstane stát
            // (holderEntryReachZ výš; strop = vzdálenější ústí údolí).
            const anchorZ = (_region.zHiValleyTop !== undefined && Math.abs(entryZ - _region.zHi) < 1e-6)
              ? holderEntryReachZ(currentX, entryZ, _region.zHiValleyTop, iv.zEnd)
              : entryZ;
            const surfX = offsetStockTopXAtZ(anchorZ);
            if (surfX !== null && surfX > currentX + 0.05) {
              entryRampAnchor = { x: surfX, z: anchorZ, first: true };
              // Jiné Z = jiný řetěz zanořování: uzavření toho předchozího
              // (dokončený zbytek pod Hloubku ap) se na nový nevztahuje.
              entryRampClosed = false;
            }
          }
          let rampOk = false;
          if (entryRampAnchor && entryRampAnchor.x > currentX + 0.05) {
            const zS = entryRampAnchor.z - (entryRampAnchor.x - currentX) / effPlungeTanL;
            if (zS > iv.zEnd + 0.05) {
              passObj.ramp = { x0: entryRampAnchor.x, z0: entryRampAnchor.z };
              passObj.entryRangeRamp = true;
              if (!entryRampAnchor.first && chainTipIs(entryRampAnchor)) {
                passObj.pocketReposition = true;
                passObj.rampFeedFrom = { x: entryRampAnchor.x, z: entryRampAnchor.z };
              }
              passObj.zStart = zS;
              entryRampAnchor = { x: currentX, z: zS, first: false };
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
            // entryRampClosed).
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
      // Kapsa za bossem kontury — sledování kontury (G1/G2/G3) a rampa pod
      // úhlem zanoření. Kapsa se bez rampy vjet nedá (kolmý zápich do plného
      // materiálu), takže celá tahle větev patří pod „Zanořování".
      //
      // Sem chodí i PRVNÍ interval, když je blokovaný (idx===0, !firstOpen):
      // typicky hrubování ZLEVA za přírubou u čela — vjezd zprava neexistuje,
      // materiál v údolí za ní ale ano (reálný nález na díle uživatele:
      // příruba Ø170 na Z 0–38 zahodila všechny hloubky pod ní).
      if (!prms.plungeRoughing) return;
      // Když je úplně první interval blokovaný (idx===0, !firstOpen),
      // neexistuje předchozí interval → horní hranice mezery = okraj
      // polotovaru (sz.zMax). Bez fallbacku by intervals[-1] spadlo.
      const zGapHi = idx > 0 ? intervals[idx - 1].zEnd : entryZ;
      // Dobrat kapsu najednou: tuhle kapsu už vykopal dřívější blok →
      // hlavní smyčka ji na hlubších hloubkách znovu nezpracovává.
      if (iv.blocked && prms.pocketFinishAtOnce) {
        const midZ = (iv.zStart + iv.zEnd) / 2;
        if (pocketDoneRanges.some(r => midZ <= r.zHi + 0.1 && midZ >= r.zLo - 0.1)) return;
      }
      // Víc oddělených kapes za sebou na TÉŽE hloubce (idx>1): dobrání
      // najednou pro tu DRUHOU (a další) je order-dependent kolize držáku —
      // boss NAD ní ještě není doobrobený (na to dojde až hlavní smyčka
      // hloubek, pokračující po tomhle bloku), takže se tam držák při
      // zanoření do hloubky opře o materiál, který teprve zmizí. Ověřeno
      // validátorem kolizí na reálném díle (holder-kolize přesně v místě
      // dojezdu druhé kapsy). První (idx===1) kapsa dobrání najednou
      // bezpečně snese (leží hned za právě dokončeným bossem). Zbytek
      // (další kapsy) zůstává pro pozdější restrukturalizaci pořadí
      // (dokončit celý boss/čelo, teprve pak kapsy) — POTLAČIT jen EMISI
      // (passes.push níž), ne celý blok: pocketDoneRanges se MUSÍ
      // zaregistrovat i tak (níž, beze změny), jinak by tuhle „nedobranou"
      // kapsu hlavní smyčka na KAŽDÉ další (mělčí) hloubce zkoušela znovu
      // — a kolidovala by tam taky (ověřeno: bez téhle poznámky se kolize
      // jen přesunula o pár hloubek dál, misto aby zmizela).
      let skipRiskyPocketEmit = iv.blocked && prms.pocketFinishAtOnce && idx > 1;
      // Obálka držáku pro kapsový span (viz holderSpanClamp výš). Bez tohohle
      // ořezu dělá zapnutá kapsová větev na range-chain fixtures 11 kolizí
      // držáku / 500–670 mm² tam, kde bylo čisto.
      if (iv.blocked) {
        const clamped = holderSpanClamp(currentX, iv);
        if (!clamped) {
          holderBlockedDepths.add(depthKey(currentX));
          holderDroppedZones.push({ zHi: iv.zStart, zLo: iv.zEnd, x: currentX });
          return;
        }
        iv = clamped;
      }
      if (!iv.blocked) {
        // Poslední interval bez protistěny (konec polotovaru) — žádná
        // kapsa s druhou stěnou, takže žádná rampa. Jen se sleduje
        // kontura z konce předchozího průchodu na currentX.
        // Obálka držáku (Fáze 3a): tenhle interval je OTEVŘENÝ pokračující
        // řez (jednostranně, bez protistěny) — stejná situace jako hlavní
        // vjezd (idx===0), ale scanIntervals ho neořezává (komentář výše
        // „KAPSY obálka NEOŘEZÁVÁ" platí pro SPAN mezi dvěma stěnami u
        // kapes, ne pro jednostranně otevřené pokračování). Bez ořezu tu
        // rovný záběr může projet držákem mimo dosah tipu, typicky dlouhý
        // přejezd v ose Z hlouběji v odlitku (reálný nález: kolize držáku
        // u „kapsa po kontuře" mezi regiony, dosud nekryté).
        let zEndEff = iv.zEnd;
        if (holderClampZEnd) {
          const nz = holderClampZEnd(currentX, iv.zStart, iv.zEnd, {});
          // Celý interval zakázaný. POČÍTAT: tohle byl hlavní zdroj TICHÉHO
          // zahazování — na `part-13-zleva-flange` tudy zmizelo 17 průchodů
          // celé pravé strany (držák 20 mm radiálně by musel přes přírubu
          // Ø199,7) a v ⚠ panelu nebylo ani slovo, takže to vypadalo jako
          // chyba geometrie.
          // POZOR: „posunout vjezd dál do úseku, kde už držák místo má" se
          // 10. 8. 2026 zkoušelo TŘEMI způsoby; nejlépe vypadající varianta
          // (nechat interval propadnout do KAPSOVÉ větve) dělá na dílu
          // uživatele 0 → 10 kolizí držáku / 1034 mm² — měřeno
          // `validateToolpath` se SPRÁVNÝM příznakem `backside`. Kapsová větev
          // totiž předpokládá kapsu mezi DVĚMA stěnami. NEZKOUŠET znovu bez
          // toho, že (a) vjezd i celá jeho rampa se prověří tou samou
          // Minkowského obálkou, kterou počítá validátor, a (b) kapsová větev
          // umí jednostranně otevřený interval.
          if (nz === null) {
            holderBlockedDepths.add(depthKey(currentX));
            holderDroppedZones.push({ zHi: iv.zStart, zLo: iv.zEnd, x: currentX });
            return;
          }
          if (nz > iv.zEnd + 1e-9) zEndEff = nz;
        }
        if (iv.zStart - zEndEff < dzScan) {
          // obálka ho zkrátila až pod řezný krok
          if (zEndEff > iv.zEnd + 1e-9) holderBlockedDepths.add(depthKey(currentX));
          holderDroppedZones.push({ zHi: iv.zStart, zLo: iv.zEnd, x: currentX });
          return;
        }
        const holderClampedOpen = zEndEff > iv.zEnd + 1e-9;
        const passOpen = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: zEndEff, blocked: iv.blocked };
        if (holderClampedOpen) passOpen.holderClamped = true;
        const erOpen = stockEntryRamp(currentX, iv.zStart);
        if (erOpen) {
          // Vstup leží v kůře odlitku → rampa od tečkované hranice
          // (sledování kontury by vedlo kůrou — vynechá se).
          passOpen.ramp = erOpen;
        } else if (!partingNoDress) {
          const liOpen = holderTrimLeadIn(traceOffsetPath(zGapHi, iv.zStart));
          linkToPrev(liOpen);   // bez zbytečného odskoku+návratu (všechny tvary)
          passOpen.contourLeadIn = liOpen;
        }
        passes.push(passOpen);
        if (holderClampZEnd && holderClampZEnd.noteMainEnd && holderClampedOpen) {
          holderClampZEnd.noteMainEnd(currentX, currentX + step, zEndEff);
        }
        return;
      }
      // Upichovák: svislý zápich — roh = pravý okraj kapsy − (w−2r), druhý
      // rádius plátku lícuje pravou stěnu. Užší kapsa než plátek se přeskočí.
      let corner;
      if (isParting) {
        const cz = iv.zStart - w2RL;
        if (cz <= iv.zEnd + 0.05) { partingNarrowPockets++; return; }
        corner = { x: Math.min(maxStockX, currentX + step), z: cz };
      } else {
        corner = findPlungeCorner(zGapHi, iv.zStart);
      }
      // Tenhle roh (strmá stěna) už jednou sešel rampou dolů dojezd „bez
      // schodků" otevřeného vjezdu na MĚLČÍ hloubce (viz rampedOutCorners
      // výš) — kapsa za bossem by ho sledováním kontury (leadIn) i rampou
      // jen zopakovala, doslovně stejný úsek G-kódu podruhé (reálný nález
      // na díle uživatele). Emisi potlačit stejně jako u druhé+ kapsy
      // (skipRiskyPocketEmit) — pocketDoneRanges se zaregistruje dál beze
      // změny, aby to hlubší hloubky nezkoušely znovu.
      if (!isParting && corner && cornerAlreadyRampedOut(corner.x, corner.z, currentX)) skipRiskyPocketEmit = true;
      if (!corner) {
        // Sklon kontury nikdy nedosáhne úhlu zanoření — celá mezera se
        // projede po kontuře na currentX, žádná rampa.
        const passFlat = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
        const erFlat = stockEntryRamp(currentX, iv.zStart);
        if (erFlat) {
          // Vstup leží v kůře odlitku → rampa od tečkované hranice.
          passFlat.ramp = erFlat;
        } else if (!partingNoDress) {
          const liFlat = holderTrimLeadIn(traceOffsetPath(zGapHi, iv.zStart));
          linkToPrev(liFlat);   // bez zbytečného odskoku+návratu (všechny tvary)
          passFlat.contourLeadIn = liFlat;
        }
        passes.push(passFlat);
        return;
      }
      // Sledování kontury (G1/G2/G3) z (currentX, zGapHi) do "rohu"
      // (corner) a odtud rampa pod úhlem zanoření na currentX. Pokud se
      // rampa do plné cílové hloubky nevejde do dostupné šířky kapsy,
      // sjede aspoň tak hluboko, jak to jde (částečně), a zbytek
      // dorampuje až příští hloubka (nebo, s pocketFinishAtOnce, hned v
      // dalším kroku bursteu níže).
      // withLeadIn: false vynechá sledování kontury od gapHi (kus stěny
      // PŘED kapsou, např. kužel) — používá se pro druhý a další zákrok
      // bursteu (dobrat kapsu najednou), kde tahle stěna je už hotová z
      // prvního zákroku a opakovat ji znovu by bylo zbytečné jezdění po
      // už obrobeném povrchu. withLeadOut: false vynechá sledování druhé
      // stěny kapsy ven (findPocketExitZ) — dráha tak zůstane omezená
      // jen na samotnou kapsu, místo aby zajížděla za ni do navazujícího
      // úseku kontury.
      const buildPocketPass = (X, gapHi, ivLocal, cornerLocal, withLeadIn, withLeadOut) => {
        const leadIn = withLeadIn ? holderTrimLeadIn(traceOffsetPath(gapHi, cornerLocal.z)) : [];
        const dzRampFull = (cornerLocal.x - X) / effPlungeTanL;
        const availWidth = cornerLocal.z - ivLocal.zEnd;
        const dzRamp = Math.min(dzRampFull, availWidth);
        const xReached = cornerLocal.x - dzRamp * effPlungeTanL;
        if (xReached > X + 0.001) plungeShallowed++;
        // Rampa nesmí přejet hranici kapsy na dosažené hloubce: u KONKÁVNÍ
        // stěny (údolí), která se pod rohem pokládá pod úhel zanoření, by
        // sdílená přímka rampy podjela offset a dno by řezalo skrz stěnu.
        //
        // KOLIK se přímka pod plným úhlem zanoření smí dostat pod offsetovou
        // (hrubovací) čáru: offset = hotovní kontura + PŘÍDAVEK, takže mělké
        // zajetí do přídavku dílu NEUBLÍŽÍ — zůstane tam jen o něco tenčí
        // slupka pro dokončování. Práh je proto POLOVINA přídavku (na hotovní
        // konturu se tím nedá dojet), ne pevných 0,05 mm.
        // PROČ: leží-li stěna údolí sama TĚSNĚ pod úhlem zanoření (na dílu
        // uživatele 14,6° proti nastaveným 15°), zajede přímka pod offset
        // o ~0,12 mm — s pevnou tolerancí se rampa zploštila na začátek vrstvy
        // a jela 13,6° místo 15°. S nulovým přídavkem vyjde práh 0,05 → jako
        // dřív.
        const rampDipTol = Math.max(0.05, 0.5 * Math.min(
          parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0));
        // Max zajetí tětivy (roh → dosažená hloubka) pod offset.
        const rampDip = (zCand) => {
          let worst = 0;
          for (let t = 0.1; t < 0.999; t += 0.09) {
            const z = cornerLocal.z + (zCand - cornerLocal.z) * t;
            const xl = cornerLocal.x + (xReached - cornerLocal.x) * t;
            const off = offsetXAt(z);
            if (off !== null && off - xl > worst) worst = off - xl;
          }
          return worst;
        };
        let zS = cornerLocal.z - dzRamp;
        // Zploštit (protáhnout na začátek vrstvy) JEN když plný úhel opravdu
        // zajede do přídavku hlouběji, než je bezpečné.
        if (zS > ivLocal.zStart + 1e-6 && rampDip(zS) > rampDipTol) zS = ivLocal.zStart;
        // Tětiva rampy (roh → začátek dna) proti offsetu: když i tak někde
        // podjede (konvexní vyboulení stěny), rampa se nahradí sledováním
        // kontury po stěně dolů — přesné, bez zajetí.
        const rampPierces = rampDip(zS) > rampDipTol;
        const pocketPass = {
          type: 'long', x: xReached,
          zStart: zS, zEnd: ivLocal.zEnd, blocked: ivLocal.blocked,
        };
        let leadInFinal = leadIn;
        if (rampPierces) {
          const wallTrace = traceOffsetPath(cornerLocal.z, zS);
          leadInFinal = holderTrimLeadIn(leadIn.concat(wallTrace));
          if (leadInFinal.length === 0) {
            // Sledování stěny padlo celé za ořez (držák/kůra) → vstup by
            // zůstal holý kolmý sjezd. Vstup v kůře odlitku dostane rampu
            // od tečkované hranice polotovaru (táž přímka zanoření).
            const erP = stockEntryRamp(X, zS);
            if (erP) pocketPass.ramp = erP;
          }
        } else {
          // Vjezd rampou od hranice polotovaru (odlitek): roh kotví na
          // kontuře POD kůrou — kotva se zvedne po TÉŽE rampové přímce nad
          // polotovar + vůli X, takže posuv začíná na tečkované hranici a
          // kůra se řeže pod úhlem zanoření (ne kolmým vjezdem).
          // stockEntryRamp zvedání zastaví i na HOTOVNÍ KONTUŘE: u kapsy za
          // bossem vede přímka zanoření od rohu k povrchu skrz ten boss
          // (reálný nález: zajezd 15,3 mm pod konturu). Nejde-li to, kotva
          // zůstane v rohu a hloubku dobere až řetěz vrstev.
          const anchorUp = stockEntryRamp(cornerLocal.x, cornerLocal.z);
          pocketPass.ramp = anchorUp || { x0: cornerLocal.x, z0: cornerLocal.z };
        }
        // Jeden průchod nesmí sebrat víc než Hloubka (ap). Kotva zvednutá až
        // na kůru polotovaru leží u kapsy za bossem klidně 2× ap nad dosaženou
        // hloubkou (roh kotví hluboko pod povrchem) — rampa by pak jedním
        // záběrem projela celý ten rozdíl (naměřeno 9,8 mm při ap 5 na
        // range-chain-insert-shadow). Kotva se proto po TÉŽE rampové přímce
        // spustí zpátky na ap nad dno průchodu; materiál nad ní vzala mělčí
        // vrstva (hloubková smyčka jde odshora dolů) nebo ho vezme další krok
        // řetězu. Hlídá tests/cam-leadout-step.test.js.
        if (pocketPass.ramp && pocketPass.ramp.x0 > pocketPass.x + step + 1e-6) {
          const dx = pocketPass.ramp.x0 - (pocketPass.x + step);
          pocketPass.ramp = { x0: pocketPass.x + step, z0: pocketPass.ramp.z0 - dx / effPlungeTanL };
        }
        // Kapsový roh se zanořoval BEZ hlídání držáku — `holderFitsAt` se ptaly
        // jen kotvy řetězu (holderEntryCapZ / holderEntryReachZ). Rampa proto
        // sjela na hloubku, vedle které stojí materiál vyšší, než kam sahá
        // spodní hrana držáku. Naměřeno na dílu uživatele: zanoření na
        // Z 41,218 → X 25,545 dalo 9,3 mm² vnoření. Ptát se musí na CÍL rampy,
        // ne na roh — mezi nimi je právě ta vrstva, kvůli které se to stane.
        // BEZ bezpečnostní vůle (gap 0): tohle není výběr z více kotev, ale
        // TVRDÉ zamítnutí, které kapsu zahodí celou. Vůle 2 mm (přání
        // uživatele „ať je držák tak 2 mm od té čáry") je preference pro
        // volbu vjezdu — jako důvod k zahození materiálu je moc přísná:
        // na part-13-zleva-flange padly na 0,63 mm průniku (méně než ta vůle)
        // dva zákroky a s nimi 29 % úběru, přitom přesný polygonový model
        // (HolderGouge) tam nehlásí ANI mm² vnoření.
        // Kritérium je PLOCHA, ne hloubka. Sken po DZ_CAP umí vyrobit tenký
        // proužek hned za koncem destičky (spodní hrana držáku tam ještě
        // nestihla vystoupat) — na part-13-zleva-flange 0,63 mm hluboký, ale
        // tak úzký, že přesný polygonový model (HolderGouge) v něm nenajde
        // ANI mm². Zahodit kvůli němu kapsu stálo 29 % úběru. Práh 0,5 mm² je
        // týž, jaký používá validátor i `rapidHitsStock`/`holderHitsStock`.
        // Bez bezpečnostní vůle (gap 0): tohle není výběr z více kotev, ale
        // tvrdé zamítnutí, které kapsu zahodí celou.
        {
          const _a = holderFitArea(pocketPass.zStart, pocketPass.x, 0, ownCutOf(pocketPass, leadInFinal));
          if (_a > HOLDER_FIT_TOL) pocketPass.holderUnsafe = true;
          // ORDER-AWARE (příznak): TÝŽ dotaz, ale polygonově proti ZBYTKU
          // a podél CELÉHO vjezdu, ne jen v cíli rampy. Sken výš čte výškové
          // pole, které neumí tunel — a přesně tudy dnes prochází zbylá
          // vada na `part-8` (#23, `pocketEntry`, r 17,65, rampa na Z 184,5):
          // sken ji pustí, polygonový zbytek v ní najde 30,1 mm² vnoření
          // držáku. Práh je `RESIDUAL_FIT_TOL` (0,5 mm²) jako u validátoru —
          // `HOLDER_FIT_TOL` (2,0) je kompenzace hrubosti TOHO skenu, ne
          // vlastnost jevu.
          if (!pocketPass.holderUnsafe
              && residEntryArea(pocketPass, leadInFinal, RESIDUAL_FIT_TOL) > RESIDUAL_FIT_TOL) {
            pocketPass.holderUnsafe = true;
          }
        }
        if (leadInFinal.length > 0) pocketPass.contourLeadIn = leadInFinal;
        if (withLeadOut && prms.noStepRoughing && !ivLocal.holderClamped) {
          // Bez schodků: po dně kapsy se dál sleduje kontura (G1/G2/G3)
          // až na hloubku dalšího průchodu (nebo až na konec kontury)
          // místo okamžitého odskoku — druhá stěna kapsy se obrobí přímo.
          // (holderClamped: konec zkrácen obálkou držáku — pokračovat po
          // stěně by znamenalo vjet držákem do materiálu.)
          const zExitOut = findPocketExitZ(ivLocal.zEnd, X, traceFloorL);
          const leadOut = holderTrimLeadOut(traceOffsetPath(ivLocal.zEnd, zExitOut), true);
          if (leadOut.length > 0) pocketPass.contourLeadOut = leadOut;
        }
        return { pocketPass, leadIn };
      };
      if (!prms.pocketFinishAtOnce) {
        const { pocketPass, leadIn } = buildPocketPass(currentX, zGapHi, iv, corner, !partingNoDress, true);
        // Nulový progres proti dřívější vrstvě u TÉHOŽ rohu → duplicitní
        // zákrok po stejné rampě, nic neodebere — vynech.
        if (pocketPass.holderUnsafe) {
          holderBlockedDepths.add(depthKey(currentX));
          holderDroppedZones.push({ zHi: iv.zStart, zLo: iv.zEnd, x: currentX });
          return;
        }
        const pbKey = `${corner.x.toFixed(1)},${corner.z.toFixed(1)}`;
        const pbBest = pocketBestX.get(pbKey);
        if (pbBest !== undefined && pocketPass.x >= pbBest - 0.05) return;
        pocketBestX.set(pbKey, pocketPass.x);
        linkToPrev(leadIn);   // navázání nezávisí na „bez schodků"
        passes.push(pocketPass);
        if (pocketPass.ramp) notePlungeRun(corner.x, corner.z, pocketPass.ramp.x0, pocketPass.x);
        return;
      }

      // ── Dobrat kapsu najednou ──
      // Kapsa se vykope CELÁ hned, ve dvou fázích:
      //   1) Rampované zanořovací zákroky (odběr bulku) — krok po kroku
      //      ap. První zákrok najede po kontuře (leadIn, navázaný na
      //      předchozí otevřený řez). Další zákroky se jen ODSKOČÍ a
      //      PŘEJEDOU V KAPSE na pozici dalšího zanoření (žádný výjezd nad
      //      polotovar) a zarampují hlouběji. Každý zákrok = rampa + dno,
      //      bez sledování kontury kolem (to dělá až fáze 2).
      //   2) Dokončovací průchod po kontuře — objede schodky obou stěn a
      //      dojede až NA DNO (sleduje offset, takže dosáhne i tam, kam se
      //      rampa pod úhlem zanoření kvůli šířce nedostala) a vyjede ven
      //      druhou stěnou (G2/G3 → úsečka).
      // Celá Z-zóna kapsy se zapíše do pocketDoneRanges — hlavní smyčka ji
      // na dalších hloubkách X přeskočí (a otevřené řezy do ní nezajedou).

      // Dno kapsy = minimum offsetu uvnitř Z-rozsahu kapsy.
      let pocketBottomX = Infinity, pocketBottomZ = (iv.zStart + iv.zEnd) / 2;
      for (let z = zGapHi; z >= iv.zEnd - 0.3; z -= 0.1) {
        const ox = offsetXAt(z);
        if (ox !== null && ox < pocketBottomX) { pocketBottomX = ox; pocketBottomZ = z; }
      }

      // Fáze 1 — rampované zanořovací zákroky.
      let localX = currentX, curGapHi = zGapHi, curIv = iv, curCorner = corner;
      let firstPlunge = true, bestX = Infinity, safety = 0;
      let prevRampEnd = null;   // konec rampy předchozího zákroku (na sdílené přímce rampy)
      const CORNER_TOL = 1.5;
      while (safety++ < 500) {
        // withLeadOut: dřív `false` — dojezd měla obstarat až fáze 2. Jenže ta
        // jede JEDINOU trasou po nejhlubší stěně, takže konce jednotlivých
        // kroků (druhá stěna kapsy, každý o ap jinde) zůstávaly nedojeté a
        // mezi nimi stály schodky (reálný nález na díle uživatele: `N420
        // G1 Z262.425` a další konce bez dojezdu). Se zapnutým „Hrub. bez
        // schodků" proto každý krok dojede svůj schod po kontuře sám —
        // stejně jako to dělá otevřený průchod.
        const { pocketPass, leadIn } = buildPocketPass(localX, curGapHi, curIv, curCorner, firstPlunge && !partingNoDress, true);
        // Monotonní progres: u zakřivené (zužující se) stěny dává rampa na
        // hlubší cíl s posunutým rohem někdy MĚLČÍ dosah — takový zákrok
        // zahoď a ukonči bulk, zbytek dna dořeže fáze 2 (sledování kontury).
        if (!firstPlunge && pocketPass.x >= bestX - 0.05) break;
        // Držák se do téhle hloubky nevejde — hlubší zákroky by na tom byly
        // hůř, takže bulk končí tady (stejné vyústění jako holderSpanClamp).
        if (pocketPass.holderUnsafe) {
          holderBlockedDepths.add(depthKey(localX));
          holderDroppedZones.push({ zHi: curIv.zStart, zLo: curIv.zEnd, x: localX });
          break;
        }
        // Zanořovací zákroky se NEODSKAKUJÍ 45° — řetězí se: nástroj zůstane
        // na dně zápichu a další zákrok ho rychloposuvem zvedne NAHORU PO
        // ZÁPICHU (po ose Z, ve vyříznutém vzduchu) ke konci rampy
        // předchozího zákroku a odtud ramuje jen nový úsek. Žádný výjezd nad
        // kapsu/roh (ten by jel skrz boss nad zápichem).
        pocketPass.noRetract = true;
        if (firstPlunge) { pocketPass.pocketEntry = true; linkToPrev(leadIn); }
        else {
          pocketPass.pocketReposition = true;
          // rampFeedFrom = vršek zápichu předchozího zákroku (konec jeho
          // rampy) na sdílené přímce rampy — sem se zvedne rychloposuvem.
          // Upichovák: přesun jde v úrovni PŘEDCHOZÍHO dna (vzduch vykopaný
          // minulým zákrokem) na NOVÉ zápichové Z a odtud svisle dolů — šikmý
          // přejezd po sdílené rampě by tělem hoblovat pravou stěnu.
          if (prevRampEnd && pocketPass.ramp && prevRampEnd.x > pocketPass.x + 0.01) {
            pocketPass.rampFeedFrom = isParting
              ? { x: prevRampEnd.x, z: pocketPass.zStart }
              : prevRampEnd;
          }
        }
        if (!skipRiskyPocketEmit) {
          passes.push(pocketPass);
          // Tenhle zákrok sjel po přímce zanoření od své KOTVY (ne od rohu —
          // kotva bývá o Hloubku ap níž) na pocketPass.x; dokončení ořízlé
          // rampy po témž ÚSEKU už tudy nemusí jezdit znovu (plungeLineRuns).
          if (pocketPass.ramp) notePlungeRun(curCorner.x, curCorner.z, pocketPass.ramp.x0, pocketPass.x);
        }
        prevRampEnd = { x: pocketPass.x, z: pocketPass.zStart };
        bestX = pocketPass.x;
        firstPlunge = false;

        if (pocketPass.x <= pocketBottomX + 0.1) break;   // dno (skoro) dosaženo

        localX = Math.max(pocketBottomX, localX - step);
        // Najdi tutéž kapsu na nové hloubce (roh se s hloubkou mírně posouvá).
        const rescan = scan(localX, entryZ, effZMin);
        let found = null;
        // Kapsa může být i PRVNÍ interval (`firstOpen === false`) — to je právě
        // hrubování zleva za přírubou u čela, kde vjezd zprava neexistuje.
        // Sken od j=1 takovou kapsu na nové hloubce NENAŠEL, burst hned skončil
        // a zbytek kapsy zůstal na jediném dokončovacím průchodu, který ji
        // projel diagonálou přes celé údolí (reálný nález na díle uživatele:
        // jeden `G1 X50.9 Z171.5` ze Ø171 dolů = 985 mm² kolize držáku).
        // S otevřeným vjezdem je interval 0 ten otevřený řez, ne kapsa → j=1.
        for (let j = rescan.firstOpen ? 1 : 0; j < rescan.intervals.length; j++) {
          // Obálka držáku i tady (viz holderSpanClamp): burst si intervaly na
          // každé hloubce skenuje znovu, takže by jinak sjel ap po ap do kapsy,
          // do které se držák mezi stěny už nevejde.
          const cIv = holderSpanClamp(localX, rescan.intervals[j]);
          if (!cIv || !cIv.blocked) continue;
          const cGapHi = j > 0 ? rescan.intervals[j - 1].zEnd : entryZ;
          // Upichovák: roh = pravý okraj − (w−2r); s hloubkou se posouvá po
          // pravé stěně, tolerance shody proto v Z povolí až step + 2 (šikmá
          // stěna posune okraj o step/tg(sklonu) na vrstvu), X se nesrovnává.
          //
          // Roh hledáme jen do curCorner.z + CORNER_TOL (ne od celého cGapHi):
          // je-li stěna kapsy přesně pod úhlem zanoření (typicky navazovací
          // čára z hlídání destičky), sken od vysokého cGapHi by chytil PRVNÍ
          // strmou stěnu nad kapsou (jiný útvar) a roh by „uskočil" o desítky
          // mm → shoda selže a burst skončí předčasně (zbytek klínu pak dobere
          // jeden hluboký nájezd). Omezení na okolí známého rohu drží sken na
          // TÉŽE stěně, takže rampované zákroky dojdou ap po ap až na dno.
          const cCorner = isParting
            ? (cIv.zStart - w2RL > cIv.zEnd + 0.05 ? { x: localX + step, z: cIv.zStart - w2RL } : null)
            : findPlungeCorner(Math.min(cGapHi, curCorner.z + CORNER_TOL), cIv.zStart);
          const zTol = isParting ? step + 2 : CORNER_TOL;
          if (cCorner && (isParting || Math.abs(cCorner.x - curCorner.x) < CORNER_TOL) && Math.abs(cCorner.z - curCorner.z) < zTol) {
            found = { iv: cIv, gapHi: cGapHi, corner: cCorner }; break;
          }
        }
        if (!found) break;
        curIv = found.iv; curGapHi = found.gapHi; curCorner = found.corner;
      }

      // Fáze 2 — dokončovací průchod po kontuře (objede schodky + dojede na
      // dno + ven druhou stěnou). leadIn = blízká stěna z rohu DOLŮ na dno;
      // leadOut = druhá stěna ze dna VEN (G2/G3 → úsečka) — sleduje konturu,
      // dokud se po druhé stěně nevrátí na vstupní hloubku (u kapsy
      // uprostřed), případně až ke konci kontury (u kapsy na konci dílu).
      const exitZ = findPocketExitZ(pocketBottomZ, currentX, traceFloorL);
      // Zahoď degenerované mikro-úseky (< 0,05 mm) — vznikají na švu
      // můstku a oblouku machinable kontury; jinak by se v G-kódu objevil
      // nulový oblouk (např. CR=8.5 přes 0,02 mm) a simulace by na něm
      // „zamrzla".
      const dropMicro = (segs) => segs.filter(s => Math.hypot(s.x2 - s.x1, s.z2 - s.z1) > 0.05);
      // Horní část blízké stěny už obrobily zanořovací rampy (jedou po ní pod
      // úhlem zanoření). Dokončovací průchod proto NEmusí sledovat stěnu od
      // rohu (corner.z) — začne až tam, kam dosáhla poslední rampa
      // (prevRampEnd), jen ODSKOČÍ ode dna a přisune se k tomu bodu, místo
      // výjezdu nad boss a přejezdu přes už obrobenou stěnu. POJISTKA: jen
      // když poslední rampa opravdu dosedla na stěnu (offset v tom Z ≈ dosažené
      // X) — jinak by nad ní zůstal materiál a čistí se celá stěna od rohu.
      // Bez „Hrub. bez schodků": žádné dokončení kapsy — zůstávají schodky
      // (dojíždění tvaru patří jen k „bez schodků"; platí pro všechny tvary).
      let cleanStartZ = corner.z;
      let cleanApproach = null;
      // Vede přisunutí UVNITŘ kapsy (odskok 45° → přejezd v Z → sjezd) celou
      // dobu vzduchem? Přejezd jde v úrovni ODSKOKU nad koncem posledního
      // průchodu, takže kdekoli mezi ním a bodem přisunutí smí offset sahat
      // nejvýš tam. V údolí s vyšší protistěnou (u dílu uživatele kontura Ø27
      // na Z 55–68 proti přejezdu na Ø26,5) by rychloposuv projel HOTOVNÍ
      // KONTUROU — v takovém případě se přisunutí nepoužije a dokončení kapsy
      // najede klasicky výjezdem nad konturu.
      const approachTraverseFree = (zTo) => {
        const lastP = passes[passes.length - 1];
        if (!lastP || lastP.zEnd === undefined) return false;
        let endX = lastP.x, endZ = lastP.zEnd;
        const lo = lastP.contourLeadOut;
        if (lo && lo.length) { endX = lo[lo.length - 1].x2; endZ = lo[lo.length - 1].z2; }
        const travX = endX + (parseFloat(prms.retractDistance) || 0);
        const zA = Math.min(endZ, zTo), zB = Math.max(endZ, zTo);
        for (let z = zA; z <= zB + 1e-9; z += dzScan) {
          const o = offsetXAt(z);
          if (o !== null && o > travX - 0.05) return false;
        }
        return true;
      };
      if (prms.noStepRoughing && prevRampEnd && prevRampEnd.z < corner.z - 0.05 && prevRampEnd.z >= pocketBottomZ - 0.05) {
        // POZOR (změřeno 8. 8. 2026): zkoušelo se tuhle pevnou toleranci
        // nahradit kritériem „projely rampy celou stěnu?" (offset nikde
        // neklesne pod přímku rampového řetězu), aby dokončovací průchod
        // nezačínal od rohu a neopakoval už projetou stěnu. Na díle uživatele
        // to sice ubralo 0,6 mm² kolize a jeden dlouhý pohyb, ale NECHALO
        // STÁT 64 mm² materiálu navíc — ten dlouhý `G1` po stěně tedy NENÍ
        // duplicita, je to dokončovací řez, který bere ~0,5 mm, co po sobě
        // nechaly rampy krokované po ap. Vráceno; nesnažit se to „optimalizovat"
        // bez měření odebraného materiálu.
        const wallXThere = offsetXAt(prevRampEnd.z);
        const startCand = Math.max(prevRampEnd.z, pocketBottomZ);
        if (wallXThere !== null && Math.abs(wallXThere - prevRampEnd.x) < 0.2
            && approachTraverseFree(startCand)) {
          // Rampy dojely na stěnu — dokončení začne až u posledního zákroku
          // (nebo rovnou na dně, když ho poslední rampa dosáhla) a navazuje
          // odskokem, ne výjezdem nad boss.
          cleanStartZ = startCand;
          cleanApproach = { x: prevRampEnd.x, z: cleanStartZ };
        }
      }
      // POZOR NA POJMENOVÁNÍ (uživatel 8. 8.: „nemám danou dokončovací
      // operaci, tohle by dělat nemělo"): `pocketClean` NENÍ dokončování.
      // Visí na „Hrub. bez schodků" (`noStepRoughing` níž), ne na
      // `doFinishing`, a to správně — změřeno, že jeho vypnutí nechá stát
      // 64 mm², protože dobírá ~0,5 mm hřebínky, které po sobě nechaly rampy
      // krokované po ap. Je to tedy HRUBOVACÍ dobrání schodku. Matoucí byl
      // jen popisek v G-kódu („dokončení kapsy“) — přejmenován na „kapsa bez
      // schodků“, ať je z výstupu poznat, ke kterému přepínači patří.
      //
      // Fáze 3b: dočišťovací trasy ořezat na OKNO kapsového intervalu —
      // scanIntervals ho už zúžil komponentovým spanem obálky держáku
      // (curIv.zStart/zEnd = kam se держák mezi stěny vejde). Úseky mimo
      // okno (konce dna u stěn, kam держák nesmí) se vypustí; úzká kapsa
      // bez okna nemá interval vůbec (burst sem ani nevejde).
      const clipToHolderWindow = (segs) => {
        if (!holderClampZEnd || !curIv || !curIv.holderClamped) return segs;
        const zHi = curIv.zStart + 0.05, zLo = curIv.zEnd - 0.05;
        return segs.filter(s => Math.max(s.z1, s.z2) <= zHi && Math.min(s.z1, s.z2) >= zLo);
      };
      // Obálka držáku (měkká — dočišťovací trasa dna smí těsně drhnout o
      // přídavkovou slupku, viz holderTrimLeadIn/Out výše): clipToHolderWindow
      // ořízne jen na komponentové okno span (u kapes mezi dvěma stěnami,
      // curIv.holderClamped), holderTrim navíc useřízne konec/začátek, kde by
      // trasa dna sama vjela do zakázané oblasti (curIv bez span okna —
      // typicky kapsa s jednou otevřenou stranou — by jinak zůstala bez
      // jakékoli ochrany držáku).
      // holderTrimLeadIn/Out ořezává po CELÝCH segmentech — dno kapsy je ale
      // jedna dlouhá úsečka (od čisté oblasti u dna po zablokovanou stěnu),
      // kterou by zahodilo celou. Před ořezem ji jemně rozdělíme (~0,4 mm),
      // po ořezu kolineární kousky zase slijeme (jinak sekaný G-kód).
      const _rawLeadIn = prms.noStepRoughing ? clipToHolderWindow(dropMicro(traceOffsetPath(cleanStartZ, pocketBottomZ))) : [];
      const _rawLeadOut = prms.noStepRoughing ? clipToHolderWindow(dropMicro(traceOffsetPath(pocketBottomZ, exitZ))) : [];
      const cleanLeadIn = mergeCollinearSegs(holderTrimLeadIn(subdivideLineSegs(_rawLeadIn), true));
      const cleanLeadOut = mergeCollinearSegs(holderTrimLeadOut(subdivideLineSegs(_rawLeadOut), true));
      // ── DNO kapsy vs. TVRDÁ obálka držáku ──────────────────────────
      // Trasy výš hlídá jen MĚKKÁ oblast (držák smí drhnout o přídavkovou
      // slupku podél stěn — jinak by se dno široké kapsy stalo
      // nedosažitelným). Samotné DNO je ale jiná otázka: leží-li ve TVRDÉ
      // oblasti, nůž se do té prohlubně reálně nevejde a dokončování ji
      // stejně přeskočí (`finishUnreachablePath` → přemostí ji rovným
      // průměrem). Hrubovací dobrání tam pak jen zaveze držák do materiálu,
      // aniž by na tom kdokoli vydělal.
      // Reálný nález (díl uživatele, upichovák š. 3): vyduté údolí R24,5
      // hluboké 8 mm — dobrání sjelo na dno (X20,43 = kontura + přídavek,
      // tedy „správně"), ale držák drhnul o přídavek na protilehlé stěně,
      // 40 mm² oranžové / 3 nálezy validátoru; dokončování tu prohlubeň
      // přemosťovalo rovným průměrem X27,85.
      if (!skipRiskyPocketEmit && holderClampZEnd?.isForbidden?.(pocketBottomX, pocketBottomZ)) {
        skipRiskyPocketEmit = true;
        pocketHolderSkips++;
      }
      if (cleanLeadIn.length > 0 || cleanLeadOut.length > 0) {
        const cleanPass = {
          type: 'long', pocketClean: true,
          x: pocketBottomX, zStart: pocketBottomZ, zEnd: pocketBottomZ, blocked: true,
        };
        if (cleanLeadIn.length > 0) cleanPass.contourLeadIn = cleanLeadIn;
        if (cleanLeadOut.length > 0) cleanPass.contourLeadOut = cleanLeadOut;
        if (cleanApproach) cleanPass.cleanApproach = cleanApproach;
        if (!skipRiskyPocketEmit) {
          passes.push(cleanPass);
          // Dobrání schodku dojede po kontuře od konce POSLEDNÍ rampy až na
          // DNO kapsy — ten úsek přímky zanoření je tím pádem venku a
          // dokončení ořízlé rampy ho nemá opakovat (plungeLineRuns).
          if (prevRampEnd) notePlungeRun(corner.x, corner.z, prevRampEnd.x, pocketBottomX);
        }
      }

      // Potlačení: celou Z-zónu kapsy hlavní smyčka znovu nezpracuje.
      pocketDoneRanges.push({ zHi: corner.z, zLo: exitZ });
      return;
    });
    // Pokud je Z-rozsah aktivní a jeho horní hrana je uvnitř polotovaru
    // (scanIntervals nevrátí žádné intervaly), vygenerujte rampový
    // vjezd od hranice rozsahu z povrchu polotovaru.
    // `entryRampIsPlunge`: při 90° by i tahle rampa byla kolmý zápich přesně
    // na hranici — viz komentář u jeho definice (nález 26. 8. 2026).
    if (entryCapped && !entryRampIsPlunge
        && intervals.length === 0 && !entryRampAnchor) {
      // Válcová obdoba offsetové čáry (bez smyčky není co offsetovat).
      // Přídavky (polo.) = 0 → povrchem je přímo poloměr polotovaru.
      const stockSurfX = sRad + (stockClearanceIsZero(prms) ? 0 : stockClearances(prms).x);
      // Kotvu posuň ZA hranici úseku, kam až pustí držák (holderEntryReachZ) —
      // jinak rampa vjíždí doprostřed údolí a jeho druhá půlka zůstane stát.
      // Strop je ÚSTÍ údolí (`zHiMouth`): dál už údolí není, tam by se kotva
      // šplhala na sousední hrb. Bez ústí (rozsah 📐, ne region) se nikam
      // neposouvá — hranici zvolil uživatel a ta má platit.
      const anchorZ = (_region.zHiValleyTop !== undefined && Math.abs(entryZ - _region.zHi) < 1e-6)
        ? holderEntryReachZ(currentX, entryZ, _region.zHiValleyTop, effZMin)
        : entryZ;
      const surfX = stockLoopL ? offsetStockTopXAtZ(anchorZ) : stockSurfX;
      if (surfX !== null && surfX > currentX + 0.05) {
        entryRampAnchor = { x: surfX, z: anchorZ, first: true };
        const zS = entryRampAnchor.z - (entryRampAnchor.x - currentX) / effPlungeTanL;
        // DNO PRŮCHODU MUSÍ ZASTAVIT KONTURA, ne dno okna. Dokud se sem chodilo
        // jen tehdy, když pod vjezdem opravdu bylo volno až na `effZMin`,
        // `zEnd: effZMin` sedělo. Jenže `intervals.length === 0` znamená i
        // „jediný interval zahodila obálka držáku" — a tam pod rampou kontura
        // stoupá. Změřeno na part-1 (regionRoughing, hloubka 15,978): rampa
        // dosedla na Z 194,83 a dno jelo až na Z −10, přestože offset je od
        // Z 183,98 dolů nad 43 → zajezd 27,2 mm pod hotovní konturu
        // (`tests/cam-gouge-invariants`; stejná vada na part-2/4/6/9).
        // Hledá se týmž krokem a týmž `blockedAt`/`refineEngageZ` jako
        // v `scanIntervals`, takže konec sedí na kontuře přesně jako u
        // běžného průchodu.
        let zEndRamp = effZMin;
        if (!blockedAt(currentX, zS)) {
          for (let zw = zS - dzScan; zw > effZMin; zw -= dzScan) {
            if (blockedAt(currentX, zw)) { zEndRamp = refineEngageZ(currentX, zw + dzScan, zw); break; }
          }
        } else zEndRamp = zS;   // rampa dosedla rovnou na konturu → žádné dno
        if (zS > effZMin - 0.05 && zS - zEndRamp > 0.05) {
          const passObj = { type: 'long', x: currentX, zStart: zS, zEnd: zEndRamp, blocked: true };
          passObj.ramp = { x0: entryRampAnchor.x, z0: entryRampAnchor.z };
          passObj.entryRangeRamp = true;
          passObj.zStart = zS;
          entryRampAnchor = { x: currentX, z: zS, first: false };
          passes.push(passObj);
        }
      }
    }
    // Zbytek MÉNĚ než Hloubka (ap): řetěz (entryRampAnchor) se na tomhle
    // kroku dál neposunul (currentX ho zablokovala kontura, obálka držáku
    // — firstOpen false — nebo ramp na téhle hloubce už nedosáhne
    // interval.zEnd) — ale řetěz ještě neskončil PŘESNĚ na dosažitelné
    // hranici. Místo úplného zahození najdi bisekcí největší X mezi
    // currentX (nejde) a posledním úspěšným krokem (jde), kde scan() (TÝŽ
    // helper co hlavní smyčka — kontura i obálka držáku) ještě pustí, a
    // dokonči tam poslední, kratší úsek — reálný nález na díle uživatele:
    // zbytek pod Hloubku (ap) po posledním úspěšném kroku řetězu zůstal
    // neobrobený.
    if (entryCapped
        && entryRampAnchor && !entryRampClosed && entryRampAnchor.x - currentX > 0.05) {
      entryRampClosed = true;
      // Bisekce hledá NEJMENŠÍ (nejhlubší) X mezi currentX (selže) a
      // entryRampAnchor.x (poslední úspěšný krok, triviálně projde) —
      // udržuje invariant loX=selže, hiX=projde a sbíhá k hranici odshora.
      let loX = currentX, hiX = entryRampAnchor.x;
      let bestCiv = null, bestX = null;
      for (let k = 0; k < 20; k++) {
        const mid = (loX + hiX) / 2;
        const midScan = scan(mid, entryZ, effZMin, true);
        const midIv = (midScan.firstOpen && midScan.intervals.length > 0) ? midScan.intervals[0] : null;
        const zSmid = midIv ? entryRampAnchor.z - (entryRampAnchor.x - mid) / effPlungeTanL : null;
        if (midIv && zSmid > midIv.zEnd + 0.05) {
          bestCiv = midIv; bestX = mid; hiX = mid;
        } else {
          loX = mid;
        }
      }
      if (bestCiv && entryRampAnchor.x - bestX > 0.05) {
        const zS2 = entryRampAnchor.z - (entryRampAnchor.x - bestX) / effPlungeTanL;
        const finalPass = { type: 'long', x: bestX, zStart: zS2, zEnd: bestCiv.zEnd, blocked: true };
        finalPass.ramp = { x0: entryRampAnchor.x, z0: entryRampAnchor.z };
        finalPass.entryRangeRamp = true;
        // Uzavírací krok řetězu přichází až PO celé hloubkové smyčce, takže se
        // mezi něj a kotvu mohlo vklínit zanoření do kapsy z některé hloubky —
        // pak nástroj na kotvě nestojí a přesun uvnitř kapsy by vedl skrz
        // materiál (viz chainTipIs výš).
        if (!entryRampAnchor.first && chainTipIs(entryRampAnchor)) {
          finalPass.pocketReposition = true;
          finalPass.rampFeedFrom = { x: entryRampAnchor.x, z: entryRampAnchor.z };
        }
        // Poslední (kratší než Hloubka ap) krok řetězu dosedl na konturu —
        // schod vůči kroku NAD ním se dobere sledováním obrysu, stejně jako
        // u běžného průchodu „bez schodků" a u dokončení ořízlé rampy níž.
        // Bez toho průchod končil nasucho a hned odskočil (reálný nález na
        // díle uživatele: poslední schod na kuželu u čela zůstal nedojetý).
        // Napojení se NEtestuje přes traceIfContinuous (jako u dokončení
        // ořízlé rampy níž): konec tohohle průchodu bere booleovská větev ze
        // VZORKOVANÉ geometrie, takže na STRMÉ stěně leží o desetinu mm v Z
        // jinam než analytický dotyk offsetu — a desetina v Z je na stěně se
        // sklonem ~3,7 skoro půl mm v X, tedy nad pevnou tolerancí 0,1 mm.
        // Dojezd se pak zahodil celý a schod zůstal stát (reálný nález na díle
        // uživatele: „dojelo to přímo pod zanořováním k čelu a odskok").
        // Proti nebezpečnému případu (jiná větev kontury u zápichu, part-10:
        // sjezd 6 mm pod hotovní konturu) chrání shift níž — emise stejně jede
        // jen KONCOVÉ body segmentů, takže rozhoduje první koncový bod, a ten
        // musí ležet NAD hloubkou průchodu.
        if (prms.noStepRoughing) {
          const lo = holderTrimLeadOut(
            traceOffsetPath(bestCiv.zEnd, findLeadOutEndZ(bestCiv.zEnd, entryRampAnchor.x, -Infinity, traceFloorL)), true);
          while (lo.length > 0 && lo[0].x2 <= bestX + 0.02) lo.shift();
          clipLeadOutToDepth(lo, entryRampAnchor.x);
          if (lo.length > 0) finalPass.contourLeadOut = lo;
        }
        passes.push(finalPass);
      }
    }
    // ── Poslední (kratší) vrstva před nedosažitelnou hranicí ───────────────
    // Hloubková posloupnost jde po celé Hloubce (ap) od povrchu, takže
    // poslední krok obvykle PŘESTŘELÍ hranici, za kterou už geometrie
    // nepustí. Typicky schodiště u čela: čelní hrana destičky se s hloubkou
    // vzdaluje od zdi (mezní čára „dojezd"), až okno vyjde nulové — hloubka
    // pak nevydá NIC a mezi poslední vrstvou a skutečnou hranicí zůstane
    // stát celý schod ap (reálný nález na díle uživatele: „chybí mi tam
    // jedna vrstva" pod poslední vrstvou u čela).
    // Bisekce najde nejhlubší X, kde sken ještě pustí použitelný vjezd, a
    // vrstvu tam dokončí — týž princip jako uzavření řetězu rampy výš, jen
    // pro obyčejný otevřený vjezd (tam žádný řetěz neběží).
    // JEN u nezakrytého vjezdu zprava (`!entryCapped`): stojí-li vjezd na
    // umělé hranici (rozsah 📐 / hranice úseku / posunutý start zanoření),
    // patří tam RAMPA a uzavření řetězu si řeší entryRampClosed výš — obyčejná
    // vrstva by se do neobrobeného materiálu zapíchla svisle.
    if (passes.length === passMark && !entryCapped && lastDepthWithPasses !== null
        && lastDepthWithPasses - currentX > 0.1) {
      let loX = currentX, hiX = lastDepthWithPasses;   // loX = nepustí, hiX = pustí
      let bestIv = null, bestX = null;
      for (let k = 0; k < 20; k++) {
        const mid = (loX + hiX) / 2;
        const ms = scan(mid, entryZ, effZMin, true);
        const iv0 = (ms.firstOpen && ms.intervals.length > 0) ? ms.intervals[0] : null;
        if (iv0 && iv0.zStart - iv0.zEnd >= dzScan) { bestIv = iv0; bestX = mid; hiX = mid; }
        else loX = mid;
      }
      if (bestIv && lastDepthWithPasses - bestX > 0.1) {
        const closePass = { type: 'long', x: bestX, zStart: bestIv.zStart, zEnd: bestIv.zEnd, blocked: bestIv.blocked };
        if (prms.noStepRoughing && bestIv.blocked) {
          // Schod vůči vrstvě NAD ní se dobere sledováním obrysu, stejně
          // jako u běžného průchodu „bez schodků".
          const lo = holderTrimLeadOut(
            traceOffsetPath(bestIv.zEnd, findLeadOutEndZ(bestIv.zEnd, lastDepthWithPasses, -Infinity, traceFloorL)), true);
          while (lo.length > 0 && lo[0].x2 <= bestX + 0.02) lo.shift();
          clipLeadOutToDepth(lo, lastDepthWithPasses);
          if (!prms.noStepRoughingFace && isFaceLeadOut(lo)) lo.length = 0;
          if (lo.length > 0) closePass.contourLeadOut = lo;
        }
        passes.push(closePass);
      }
    }
    if (passes.length > passMark) lastDepthWithPasses = currentX;
    // Zanoření se stropem držáku (entryZ posunutý doleva, viz výš) bere
    // MENŠÍ průměr, než na jaký v tomhle Z-okně dosáhly ostatní regiony —
    // v pořadí se proto odloží až za ně, ať hrubování jde odshora dolů
    // a nezačíná zanořením (reálný požadavek uživatele).
    // Zanoření na hranici REGIONU se odkládá stejně jako posunutý vjezd:
    // „co je nahoře, má přednost" — nejdřív se odeberou všechny větší průměry
    // a teprve pak se rampou sjede pod hranicí do menšího (jinak by nad
    // zanořeným nástrojem stál materiál, který se teprve bude brát).
    if (entryZ !== effZMax || regionCapped) {
      for (let i = passMark; i < passes.length; i++) passes[i].__deferEntry = true;
    }
  }
  // Dokončení ořízlých ramp (viz pendingRampCompletions výš) — teprve TEĎ,
  // po celé hloubkové smyčce tohoto regionu, je jisté, že žádná další
  // (hlubší) vrstva ten klín materiálu sama nenajde. Rozděleno na kroky
  // ≤ Hloubka (ap) — jeden souvislý záběr přes celou rampu by zase sebral
  // víc materiálu, než odpovídá nastavené hloubce (reálný nález na díle
  // uživatele). První krok najede bezpečně nad konturou (`pass.ramp` →
  // safeRapidTo), další kroky se jen ODSKOČÍ (`pocketReposition`,
  // stejný vzor jako „dobrat kapsu najednou") a rychloposuvem se vrátí na
  // konec předchozího kroku — odtud pracovní rampa řeže jen nový úsek.
  // Kam až sahá SOUVISLÝ materiál na hloubce X směrem doleva od zFrom: doběh
  // končí tam, kde vůlí-posunutá silueta polotovaru klesne pod hloubku kroku.
  // Za takovou mezerou je jiné místo dílu — vcelku se bere jen materiál, který
  // je V KUSE (stejné pravidlo jako u hranic úseků; reálný nález na díle
  // uživatele: doběh přeletěl celé údolí a dodělával vrstvu na druhé straně).
  //
  // Měří se na CELÉ vůlí-posunuté siluetě (`stockLoopOffsetFullL`, bez ořezu
  // rozsahem 📐): jestli je materiál v kuse, je vlastnost DÍLU, ne zvoleného
  // úseku obrábění. Hranice se dopočítá PŮLENÍM, ne po krocích vzorkování:
  // konec doběhu musí sednout PŘESNĚ na offsetovou čáru. O krok vzorkování
  // vedle by ho emise (`airSplitAxial`) už nesměla dotáhnout — prodloužení
  // výjezdu nesmí přejet konec průchodu — a řez by skončil o vůli dřív
  // (hlídá tests/cam-leadout-step na range-chain-insert-shadow).

  for (const rc of pendingRampCompletions) {
    let curX = rc.resumeX, curZ = rc.resumeZ, first = true;
    const rcSteps = [];
    while (curX > rc.targetX + 1e-6) {
      const stepX = Math.max(rc.targetX, curX - step);
      const stepZ = curZ - (curX - stepX) / effPlungeTanL;
      const isLastStep = stepX <= rc.targetX + 1e-6;
      // Tenhle úsek přímky zanoření už jednou sjela kapsa za bossem z hlubší
      // vrstvy (plungeLineRuns výš) — roh strmé stěny je pro obě týž bod.
      // Bez tohohle testu se týž klín vyřízl DVAKRÁT: „Průchod 9/10" byl
      // doslovná kopie „Průchodu 4/5" a začínal znovu od vršku zanoření
      // (reálný nález na díle uživatele).
      if (plungeRunCovers(rc.resumeX, rc.resumeZ, stepX, curX)) {
        curX = stepX; curZ = stepZ;   // posuň se po přímce dál (kdyby hlubší krok ještě chyběl)
        continue;
      }
      // Meziкrok nekončí hned po rampě — pokračuje ROVNĚ (jako běžná
      // vrstva) až na společný cíl rc.targetZ (konec polotovaru v tomhle
      // regionu), stejně jako u prvního (nerozděleného) dojezdu. Poslední
      // krok už tam doletí přímo rampou (stepZ === rc.targetZ), navíc
      // rovný úsek nepotřebuje.
      // Rovný úsek mezikroku končí na STĚNĚ KONTURY (straightRunEndZ) — na
      // téhle (mělčí) hloubce může kontura stoupnout dřív než na cílové, tam
      // musí zastavit, aby nepodjel hotovní konturu. Doběh se ale NEomezuje
      // společným cílem rc.targetZ: leží-li stěna až ZA ním, mezikrok tam
      // dojede a schod dobere svým dojezdem (níž). Se stropem na rc.targetZ
      // končil nasucho uprostřed materiálu, přestože vrstva nad ním
      // (o Hloubku ap mělčí) byla obrobená až daleko za tím bodem — reálný
      // nález na díle uživatele.
      // Doběh končí tím, co přijde DŘÍV: stěna hotovní kontury (straightRunEndZ),
      // nebo konec souvislého materiálu (stockRunEndZ výš).
      const stepEndZ = isLastStep ? stepZ : Math.max(
        straightRunEndZ(stepX, stepZ, traceFloorL),
        stockRunEndZ(stepX, stepZ, traceFloorL));
      const stepPass = { type: 'long', x: stepX, zStart: stepZ, zEnd: stepEndZ, blocked: true };
      // Řetěz dorampování strmé stěny — stejná povaha jako entryRangeRamp:
      // kroky leží NAD SEBOU podél TÉŽE stěny, nejsou to nezávislé bossy.
      // Značka je vyloučí z heuristiky „pravých stěn kapes" níž (viz tam).
      stepPass.rampCompletion = true;
      if (first) {
        stepPass.ramp = { x0: curX, z0: curZ };
        first = false;
      } else {
        stepPass.ramp = { x0: curX, z0: curZ };
        stepPass.pocketReposition = true;
        stepPass.rampFeedFrom = { x: curX, z: curZ };
      }
      // Poslední krok smí normálně odjet (retrakt); mezikroky se ŘETĚZÍ
      // beze změny polohy (noRetract) — návaznost řeší odskok+reposition
      // NÁSLEDUJÍCÍHO kroku (pocketReposition výš), ne odjezd tohoto.
      if (stepX > rc.targetX + 1e-6) stepPass.noRetract = true;
      if (prms.noStepRoughing) {
        // Krok dosedl na konturu — schod vůči kroku NAD ním se dobere
        // sledováním obrysu, stejně jako u běžného průchodu „bez schodků"
        // (jinak zůstane mezi rampou a hotovní konturou klín; reálný nález
        // na díle uživatele v údolí). Platí i pro MEZIKROKY řetězu: každý
        // z nich je plnohodnotná vrstva na své hloubce a schod vůči vrstvě
        // nad sebou si dobírá sám (dřív dojížděl jen poslední krok, takže
        // mezikrok skončil nasucho na stěně — reálný nález na díle
        // uživatele). Návaznost řetězu to nerozbíjí: následující krok se
        // stejně odskočí a rychloposuvem vrátí na konec rampy toho
        // předchozího (`pocketReposition`/`rampFeedFrom` výš).
        const lo = holderTrimLeadOut(traceIfContinuous(
          traceOffsetPath(stepEndZ, findLeadOutEndZ(stepEndZ, curX, -Infinity, traceFloorL)),
          stepX, stepEndZ), true);
        while (lo.length > 0 && lo[0].x2 <= stepX + 0.02) lo.shift();
        clipLeadOutToDepth(lo, curX);
        if (lo.length > 0) stepPass.contourLeadOut = lo;
      }
      rcSteps.push(stepPass);
      curX = stepX; curZ = stepZ;
    }
    if (rcSteps.length === 0) continue;
    // ── Kam v pořadí ten dobírací řetěz patří ─────────────────────────────
    // Rozhodnout SE MUSÍ až tady (dřív není jisté, že klín nevezme některá
    // hlubší vrstva sama), ale VYDAT se nemusí až tady. Přišitý na konec
    // regionu skočil mělký dobírák (např. Ø44,5) až za nejhlubší vrstvy
    // (Ø19,5) — program pak „dodělával nakonec" místo aby šel po vrstvách
    // dolů (reálná stížnost uživatele). Blok se proto vloží hned za poslední
    // průchod, který je ještě stejně hluboký nebo mělčí; hloubková
    // posloupnost tak zůstane monotónní.
    const deepestStepX = rcSteps[rcSteps.length - 1].x;
    let at = passes.length;
    while (at > regionMark && passes[at - 1].x < deepestStepX - 1e-6) at--;
    // Řetěz se nesmí rozříznout: `pocketReposition`/`noRetract` počítají
    // s tím, že nástroj stojí na konci PŘEDCHOZÍHO průchodu. Vložit blok mezi
    // ně by ten rychloposuv poslal skrz materiál — v takovém případě zůstane
    // dobírák na konci regionu (bezpečné, jen dřívější pořadí).
    if (at < passes.length
        && (passes[at].pocketReposition || passes[at].cleanApproach
            || (at > regionMark && passes[at - 1].noRetract))) at = passes.length;
    passes.splice(at, 0, ...rcSteps);
  }
  // Přesun odloženého zanoření na konec TOHOTO REGIONU (stabilně, pořadí
  // uvnitř skupin zůstává) — „co je nahoře, má přednost". Region je vlastní
  // Z-zóna dílu: odsouvat zanoření až za VŠECHNY ostatní regiony nemá důvod
  // (materiál nad ním vzaly vrstvy tohohle regionu) a jen to zbytečně tříští
  // pořadí — zanoření patří hned za poslední vrstvu svého místa (reálný nález
  // na díle uživatele: zanoření se dělalo úplně nakonec programu).
  if (passes.length > regionMark) {
    const head = [], tail = [];
    for (let i = regionMark; i < passes.length; i++) {
      const p = passes[i];
      (p.__deferEntry ? tail : head).push(p);
      delete p.__deferEntry;
    }
    // ── DRŽÁK U ODLOŽENÝCH VJEZDŮ ────────────────────────────────────────
    // Odložené zanoření se provede až ZA celým regionem, takže se musí
    // posuzovat proti tomu, co po regionu ZBUDE — ne proti stavu v okamžiku
    // plánování. Hlídat to už při hledání kotvy nejde: tam je zapsaná jen
    // hrstka průchodů a model pak zamítá vjezdy do prostoru, který v době
    // provedení dávno nestojí (na range-end-leadout 119 mm² „vnoření" proti
    // materiálu, který tam není — stálo to 21 % úběru).
    //
    // Zahazuje se od PRVNÍHO nevyhovujícího dál: řada jde po klesajících
    // průměrech, takže hlubší zákroky jsou na tom vždycky hůř, a useknutí
    // konce nepřetrhne řetěz uprostřed (`noRetract`/`rampFeedFrom` míří
    // dopředu, poslední průchod žádného následníka nepotřebuje).
    if (tail.length > 0 && capTab) {
      const floor = newFloorTab();
      for (let i = 0; i < regionMark; i++) notePassInto(floor, passes[i]);
      for (const p of head) notePassInto(floor, p);
      T.activeFloorTab = floor;
      let dropFrom = -1;
      for (let i = 0; i < tail.length; i++) {
        const p = tail[i];
        if (!p || p.type !== 'long' || !Number.isFinite(p.x) || !Number.isFinite(p.zStart)) continue;
        if (holderFitAreaAlong(p) > HOLDER_FIT_TOL) { dropFrom = i; break; }
        notePassInto(floor, p);   // co projde, samo řeže pro ty za sebou
      }
      T.activeFloorTab = null;
      if (dropFrom >= 0) {
        deferredHolderSkips += tail.length - dropFrom;
        tail.length = dropFrom;
        // Líný prefixový model by si jinak nadál připisoval řezy zahozených
        // průchodů — postavit ho znovu.
        T.cutFloorTab = null; T.cutFloorSynced = 0;
      }
    }
    passes.length = regionMark;
    for (const p of head) passes.push(p);
    for (const p of tail) passes.push(p);
  }
  } // konec smyčky regionů

  if (deferredHolderSkips > 0)
    foundErrors.push({ type: 'warning', msg: `Hlídání držáku: ${deferredHolderSkips} odložené zanoření vynecháno — po obrobení zbytku úseku by se do něj držák už nevešel.` });
  if (plungeShallowed > 0)
    foundErrors.push({ type: 'warning', msg: `POZNÁMKA: Zanořování — ${plungeShallowed} průchodů do kapsy nedosáhlo plné cílové hloubky v jednom kroku (rampa pod ${effPlungeDegL.toFixed(1)}° pokračuje dalším krokem).` });
  if (scanCounters.partingWallDropped > 0)
    foundErrors.push({ type: 'warning', msg: `Upichovák: ${scanCounters.partingWallDropped} vrstva/vrstev u stěny vynechána — široký plátek (${wInsL} mm) by do ní zajel tělem.` });
  if (partingNarrowPockets > 0)
    foundErrors.push({ type: 'warning', msg: `Upichovák: ${partingNarrowPockets} kapsa/kapes užších než plátek (${wInsL} mm) vynechána — plátek se do nich nevejde.` });
  if (pocketHolderSkips > 0)
    foundErrors.push({ type: 'warning', msg: `Hlídání držáku: ${pocketHolderSkips} prohlubeň/prohlubní se nedobírá až na dno — držák se tam nevejde. Dokončování je ze stejného důvodu přemostí rovným průměrem; dno patří jinému nástroji.` });
  // Ztracené hloubky = ty, kde obálka držáku něco zastavila a nakonec z nich
  // NEVZNIKL žádný průchod. Vyhodnocuje se až tady, proti skutečně vydaným
  // průchodům — počítat pokusy uvnitř smyčky nafukuje číslo (viz komentář
  // u holderBlockedDepths).
  if (holderBlockedDepths.size > 0) {
    const machined = new Set();
    for (const p of passes) if (p.type === 'long') machined.add(depthKey(p.x));
    const lost = [...holderBlockedDepths].filter(k => !machined.has(k)).length;
    if (lost > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání geometrie (držák): ${lost} hloubka/hloubek se nedá obrobit — držák by narazil do materiálu (čelo u osy, úzká kapsa, prostor za přírubou). Zbytek obrobte jiným nástrojem/upnutím.` });
  }
  // Zóny zahozené obálkou držáku, kam nakonec NIC nezajelo (viz
  // holderDroppedZones výš). Pokrytí se bere z vydaných průchodů VČETNĚ
  // sledování obrysu (leadIn/leadOut) — právě tím se většina zahozených
  // intervalů dobere (dojezd „bez schodků" projede celé údolí za bossem),
  // takže bez téhle kontroly by hlášení křičelo skoro vždy.
  if (holderDroppedZones.length > 0) {
    const spans = [];
    for (const p of passes) {
      if (p.type !== 'long') continue;
      let lo = Math.min(p.zStart, p.zEnd), hi = Math.max(p.zStart, p.zEnd);
      for (const key of ['contourLeadIn', 'contourLeadOut']) {
        for (const s of p[key] || []) {
          lo = Math.min(lo, s.z1, s.z2); hi = Math.max(hi, s.z1, s.z2);
        }
      }
      spans.push({ lo, hi });
    }
    const uncovered = (z) => !spans.some(s => z >= s.lo - 0.2 && z <= s.hi + 0.2);
    // Zóna se pokládá za neobrobenou, když je bez pokrytí většina její délky
    // (vzorkuje se v pětinách) — okrajové překryvy dojezdů nic nezachrání.
    let worst = 0, cnt = 0;
    for (const zn of holderDroppedZones) {
      const len = Math.abs(zn.zHi - zn.zLo);
      if (len < 1) continue;
      let miss = 0;
      for (let i = 1; i <= 5; i++) if (uncovered(zn.zLo + (zn.zHi - zn.zLo) * i / 6)) miss++;
      if (miss >= 3) { cnt++; if (len > worst) worst = len; }
    }
    if (cnt > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání geometrie (držák): ${cnt} úsek(ů) polotovaru zůstalo NEOBROBENO (nejdelší ${worst.toFixed(0)} mm) — držák se k nim nedostane (klín za bossem/přírubou, na který nedosáhne destička). Obrobte je z druhé strany (Hrubování zprava/zleva) nebo jiným nástrojem.` });
  }

  // Sjezdy/dojezdy upichováku po OBÁLCE — viz ops/long/partingEnvelope.js.
  if (ins.envelopeAlongContour) envelopePartingLeads(passes, offsetXAt, w2RL);

  // ── Doběh přes KONEC PROFILU do konce polotovaru ───────────────────
  // Kontura končí čelem (poslední prvek profilu), takže offsetová čára
  // skončí v jeho rohu — jenže polotovar tam ještě pokračuje (odřezek
  // ve sklíčidle). Průchod, který na ten roh dojel, tam nechá stát
  // prstenec: reálný nález uživatele — dráhy končily na Z−1,3, zatímco
  // sousední (ničím nezablokované) průchody jedou přes celý zbytek na
  // Z−9. Prstenec pak navíc drží i DOKONČOVÁNÍ, protože jeho doběh
  // (`finRunOut` v gcodeEmit) couvne, když nad hotovní čarou stojí víc
  // než jedna tříska.
  //
  // Doběh se přidá jen tam, kde profil OPRAVDU končí (dál v Z už žádná
  // offsetová čára není) a v té hloubce ještě stojí materiál. Konec
  // určuje `stockRunEndZ` — táž funkce, jakou používá doběh mezikroků
  // rampy, takže se skončí na vůlí-posunuté siluetě polotovaru.
  {
    const zFloorEnd = Math.max(
      stockLoopOffsetFullL ? Math.min(...stockLoopOffsetFullL.map(p => p.z)) - 1 : -1e4,
      rangeZLoL);
    for (const p of passes) {
      if (p.type !== 'long' || p.noRetract) continue;
      const lo = p.contourLeadOut;
      const end = (lo && lo.length > 0)
        ? { x: lo[lo.length - 1].x2, z: lo[lo.length - 1].z2 }
        : (Number.isFinite(p.x) && Number.isFinite(p.zEnd) ? { x: p.x, z: p.zEnd } : null);
      if (!end || !Number.isFinite(end.x) || !Number.isFinite(end.z)) continue;
      if (end.z <= zFloorEnd + 0.05) continue;              // už je na dně okna
      if (offsetXAt(end.z - 0.2) !== null) continue;        // profil pokračuje dál
      const zRun = stockRunEndZ(end.x, end.z, zFloorEnd);
      if (!(end.z - zRun > 0.2)) continue;                  // za koncem už není materiál
      const seg = { type: 'line', x1: end.x, z1: end.z, x2: end.x, z2: zRun };
      if (lo && lo.length > 0) lo.push(seg); else p.contourLeadOut = [seg];
    }
  }

  // Hlídání geometrie destičky — viz ops/long/insertFlankGuard.js.
  if (prms.respectInsertGeometry && ins.hasFlankGeometry) {
    const adjusted = guardInsertFlankLong(passes, prms, offsetPath);
    if (adjusted > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání destičky: ${adjusted} hrubovacích průchodů zkráceno, aby boční ostří nezajelo do kontury.` });
  }

  // Diagnostický seam (v produkci no-op, vzor `__RAPID_STOCK_DUMP__`
  // v gcodeEmit.js): MODEL ZBYTKU, podle kterého strategie rozhoduje
  // o vjezdech, zanořeních a odložených zákrocích (`residTopAt`). Test
  // `cam-strategy-residual` ho porovnává s reálně projetou dráhou —
  // rozejít se smějí jen tam, kde je to změřené a přišpendlené.
  //
  // Staví se ZNOVU z hotového `passes`, ne z běhového `cutFloorTab`: ten je
  // líný prefix (`syncCutFloor`) a `passes` se za jeho značkou ještě mění —
  // dobírací řetězy se vkládají `splice` doprostřed a konec regionu pořadí
  // přeskládá. Dump je proto stav „po všech průchodech", což je přesně to,
  // co má smysl porovnávat s dojetým programem.
  if (globalThis.__FLOOR_TAB_DUMP__ && capTab) {
    const tab = newFloorTab();
    for (const p of passes) notePassInto(tab, p);
    globalThis.__FLOOR_TAB_DUMP__.push({
      z0: capZ0, dz: DZ_CAP, stock: Array.from(capTab), floor: Array.from(tab),
    });
  }

  // ── POLYGONOVÝ model zbytku (docs/cam-order-aware-holder.md, krok 1) ────
  // Výškové pole výš neumí TUNEL: když zanoření nebo dojezd po kontuře
  // podjede pod stojícím materiálem, srazí celý sloupec na hloubku tunelu.
  // Změřeno na part-8 (11,2 mm) a holder-casting-slanted-face (13,6 mm) —
  // právě na těch dvou dílech, kde zůstávají doložené kolize držáku.
  //
  // Plní se AŽ TADY, z hotového `passes`: pole se za běhu ještě mění
  // (dobírací řetězy se vkládají `splice` doprostřed, konec regionu pořadí
  // přeskládá), takže „pořadí obrábění" je až tenhle finální stav. Krok 2,
  // který se bude ptát UPROSTŘED plánování, si bude muset vzít prefix —
  // a tenhle rozdíl je potřeba mít na paměti.
  //
  // POUZE PRO SEAM. Hlídání běží nad `residTracker` výš, který se plní líně
  // za jízdy; tenhle blok staví model ZNOVU a celý, což má smysl jen pro
  // měření (test potřebuje stav „po všech průchodech"). V produkci by to byla
  // druhá, zahozená stavba téhož — a od zapnutí `orderAwareHolder` výchozí
  // by běžela při každém přepočtu.

  // Vrstva pokračuje přes nízký hrb — viz ops/long/humpMerge.js.
  const hummockMerges = mergeLayersOverHump(passes, ins, offsetXAt, dzScan, DZ_CAP);

  if (globalThis.__RESIDUAL_TRACKER_DUMP__) {
    const tracker = new ResidualTracker(prms, stockPathSegments, {
      seedLoop: stockLoopOffsetFullL || undefined,
      footprint: toolFootprint(prms),
    });
    tracker.noteAll(passes);
    globalThis.__RESIDUAL_TRACKER_DUMP__.push({
      loops: tracker.loops.map(l => l.map(q => ({ x: q.x, z: q.z }))),
      seed: tracker.seedLoop ? tracker.seedLoop.map(q => ({ x: q.x, z: q.z })) : null,
      count: tracker.count,
    });
  }
}

// Registr strategií hrubování. Klíč = prms.roughingStrategy.

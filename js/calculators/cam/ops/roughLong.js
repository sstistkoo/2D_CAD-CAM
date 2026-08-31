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
import { emitOpenInterval } from './long/openPass.js';
import { emitPocketInterval } from './long/pocketPass.js';

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
  // Silueta polotovaru se staví i pro VÁLEC (obdélník) — pravidlo „dojet vrstvu,
  // pak celou jednu stranu“ (docs/cam-pravidla-drah.md §6.0) musí platit vždy, ne jen
  // u odlitku. buildStockLoopRaw pro 'cylinder' vrací obdélník sRad × (Celo…−Delka).
  const stockLoopFullL = buildStockLoopRaw(prms, stockPathSegments);
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
    stockWorldPoints, stockLoopFullL, stockZRangeAt,
    passEntryZ, scan, stockLoopL, step, holderFitsOverContour,
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
        // Otevřený vjezd zprava — viz ops/long/openPass.js.
        const rampSt = { anchor: entryRampAnchor, closed: entryRampClosed };
        emitOpenInterval({
          prms, passes, step, dzScan, DZ_CAP, capTab, currentX, iv, intervals,
          entryZ, entryCapped, entryRampIsPlunge, effZMin, effPlungeTanL,
          traceFloorL, depthIdx, depths, _region, chainTipIs, findLeadOutEndZ,
          findRampOutTarget, findSteepCorner, holderClampZEnd, holderEntryReachZ,
          holderFitArea, holderTrimLeadOut, offsetStockTopXAtZ,
          pendingRampCompletions, plungeHolderFitsAt, pocketDoneRanges,
          rampedOutCorners, stockTopTab, straightRunEndZ, traceOffsetPath, rampSt,
        });
        entryRampAnchor = rampSt.anchor; entryRampClosed = rampSt.closed;
        return;
      }
      // Kapsa za bossem kontury — viz ops/long/pocketPass.js.
      const cnt = { partingNarrowPockets, plungeShallowed, pocketHolderSkips };
      emitPocketInterval({
        prms, passes, step, dzScan, currentX, idx, intervals, effZMin,
        effPlungeTanL, traceFloorL, maxStockX, isParting, partingNoDress, w2RL,
        cornerAlreadyRampedOut, findPlungeCorner, findPocketExitZ,
        holderBlockedDepths, holderClampZEnd, holderDroppedZones, holderFitArea,
        holderSpanClamp, holderTrimLeadIn, holderTrimLeadOut, linkToPrev,
        notePlungeRun, offsetXAt, ownCutOf, pocketBestX, pocketDoneRanges,
        residEntryArea, scan, stockEntryRamp, traceOffsetPath, cnt, entryZ, iv,
      });
      ({ partingNarrowPockets, plungeShallowed, pocketHolderSkips } = cnt);
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

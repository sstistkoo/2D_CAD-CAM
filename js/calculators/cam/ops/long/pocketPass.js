// ╔════════════════════════════════════╗
// ║  KAPSA za bossem kontury — zanoření rampou      ║
// ╚════════════════════════════════════╝
// Vyňato z hloubkové smyčky `ops/roughLong.js` (plán §3.A). Druhá ze dvou
// větví `intervals.forEach` — ta pro interval, do kterého se zprava vjet
// NEDÁ (stojí před ním boss kontury). Vede se k němu sledováním kontury
// a rampou pod úhlem zanoření; bez zapnutého „Zanořování" se vynechá.
//
// POČÍTADLA jdou dovnitř v objektu `cnt` (`partingNarrowPockets`,
// `plungeShallowed`, `pocketHolderSkips`) — tělo obsahuje dvanáct `return;`,
// takže vracet je návratovou hodnotou by znamenalo ošetřit dvanáct míst.

import { depthKey, mergeCollinearSegs, subdivideLineSegs } from './segUtils.js';
import { HOLDER_FIT_TOL } from '../shared.js';
import { RESIDUAL_FIT_TOL } from '../../residualHolder.js';

export function emitPocketInterval(D) {
  const {
    prms, passes, step, dzScan, currentX, idx, intervals, effZMin,
    effPlungeTanL, traceFloorL, maxStockX, isParting, partingNoDress, w2RL,
    cornerAlreadyRampedOut, findPlungeCorner, findPocketExitZ,
    holderBlockedDepths, holderClampZEnd, holderDroppedZones, holderFitArea,
    holderSpanClamp, holderTrimLeadIn, holderTrimLeadOut, linkToPrev,
    notePlungeRun, offsetXAt, ownCutOf, pocketBestX, pocketDoneRanges,
    residEntryArea, scan, stockEntryRamp, traceOffsetPath, cnt, entryZ,
  } = D;
  // `iv` se v těle PŘEPISUJE (postup do další kapsy) — proto let, ne const.
  let iv = D.iv;
  // Nájezd po kontuře se OŘEŽE na to, co neleží pod hloubkou průchodu.
  //
  // `traceOffsetPath` vrací větev kontury mezi dvěma Z — u kapsy/zápichu jich
  // ale na tomtéž Z leží víc a trasa může skočit na jinou. Na `part-9` z toho
  // vznikl nájezd, který od r 27,98 sjel PŘÍMO NA OSU (`G1 X0.000`) a hned
  // zpátky na r 32,14; validátor to hlásil jako pět kolizí držáku na Z 258,2.
  //
  // OŘEZÁVÁ SE, NEZAHAZUJE. Pravidlo „celý, nebo vůbec“ patří DOKONČOVÁNÍ
  // (rozhodnutí uživatele 11. 8. 2026, viz ops/finish.js) — tam by zkrácený
  // úsek nechal schod uprostřed hotové plochy. U hrubování takový důvod není:
  // co se nedojede tady, vezme jiná vrstva.
  //
  // Bere se POSLEDNÍ souvislý úsek trasy — nájezd musí končit v rohu, odkud
  // se rampuje. Prefix, který se propadl pod hloubku, se zahodí a nástroj
  // najede rychloposuvem rovnou na začátek toho zbytku.
  const clipLeadInToDepth = (segs, X) => {
    let k = segs.length;
    while (k > 0 && Math.min(segs[k - 1].x1, segs[k - 1].x2) >= X - 0.02) k--;
    return k === 0 ? segs : segs.slice(k);
  };
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
    const liOpen = clipLeadInToDepth(holderTrimLeadIn(traceOffsetPath(zGapHi, iv.zStart)), currentX);
    linkToPrev(liOpen);   // bez zbytečného odskoku+návratu (všechny tvary)
    // PRÁZDNÝ NÁJEZD NENÍ NÁJEZD — podrobně u `passFlat` níž.
    if (liOpen.length === 0) { cnt.noEntrySkips++; return; }
    passOpen.contourLeadIn = liOpen;
  }
  // TUHLE PŘÍMKU ZANOŘENÍ UŽ NIKDO SJÍŽDĚT NEMUSÍ. Otevřené pokračování
  // s rampou sjíždí TÝŽ klín jako dokončení ořízlé rampy
  // (`pendingRampCompletions` v roughLong.js) — roh strmé stěny je pro obě
  // týž bod. Zapsané kapsy to hlásily odjakživa (`notePlungeRun` níž), tahle
  // větev ne, takže se týž řez vydal DVAKRÁT: „Průchod 8" (rampa do údolí)
  // a hned za ním „Průchod 9" se stejným cílem (nález uživatele 1. 9. 2026).
  if (passOpen.ramp) notePlungeRun(passOpen.ramp.x0, passOpen.ramp.z0, passOpen.ramp.x0, passOpen.x);
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
  if (cz <= iv.zEnd + 0.05) { cnt.partingNarrowPockets++; return; }
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
    const liFlat = clipLeadInToDepth(holderTrimLeadIn(traceOffsetPath(zGapHi, iv.zStart)), currentX);
    linkToPrev(liFlat);   // bez zbytečného odskoku+návratu (všechny tvary)
    // ── PRÁZDNÝ NÁJEZD NENÍ NÁJEZD ────────────────────────────────────────
    // `traceOffsetPath` (nebo ořez držákem) může vrátit PRÁZDNÉ pole. Dosud
    // se přiřadilo stejně — a `[]` je v JS pravdivé, takže průchod dál
    // vypadal jako „kapsa po kontuře": emise vzala větev s nájezdem, ta
    // nenašla žádný segment, spadla na `{ x: pass.x, z: pass.zStart }`
    // a sjela na hloubku RADIÁLNĚ. Vznikl tak průchod bez rampy i bez
    // nájezdu — přesně to, co je u plátku s úhlem < 90° zakázané.
    //
    // Nález uživatele 1. 9. 2026 (podélně zleva): `N2020 G1 X31.545 F0.25`
    // (6,4 mm radiálně, aby se uříznul pás 1,45 mm) a `N3010 G1 X19.545
    // F0.25` (4,2 mm radiálně na pás 0,66 mm) — *„ty dráhy tu vůbec nemají
    // co dělat, jsou to chyby"*. Obě navíc odskokem zajížděly pod konturu,
    // dokud to nezachytil `retractHitsContour` (ops/roughEmit.js).
    //
    // Vrstva se proto vynechá — táž volba jako u vjezdu bez rampy
    // (docs/cam-pravidla-drah.md §3.1) — a nahlásí se.
    if (liFlat.length === 0) { cnt.noEntrySkips++; return; }
    passFlat.contourLeadIn = liFlat;
  }
  // Táž evidence jako u `passOpen` výš — přímka je sjetá, ať ji sjel
  // kterýkoli z těch dvou vjezdů.
  if (passFlat.ramp) notePlungeRun(passFlat.ramp.x0, passFlat.ramp.z0, passFlat.ramp.x0, passFlat.x);
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
  const leadIn = withLeadIn
    ? clipLeadInToDepth(holderTrimLeadIn(traceOffsetPath(gapHi, cornerLocal.z)), X) : [];
  const dzRampFull = (cornerLocal.x - X) / effPlungeTanL;
  const availWidth = cornerLocal.z - ivLocal.zEnd;
  const dzRamp = Math.min(dzRampFull, availWidth);
  const xReached = cornerLocal.x - dzRamp * effPlungeTanL;
  if (xReached > X + 0.001) cnt.plungeShallowed++;
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
  cnt.pocketHolderSkips++;
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
}

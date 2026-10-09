// ╔════════════════════════════════════════════════════════╗
// ║  KULATÁ DESTIČKA — pravidla pro generátor drah              ║
// ╚════════════════════════════════════════════════════════╝
//
// Celý břit je AKTIVNÍ NOS: kruh R kolem programovaného bodu. Nemá bok,
// který by mohl narazit stranou, ani natočení, které by naklonilo spodní
// hranu — všechno vychází z R.
//
// Dvě věci z toho plynou a obě se dřív ztrácely v podmínkách `!== 'polygon'`
// jinde v generátoru:
//   • hlídat se dá jen ZANOŘENÍ (`plungeGuide`), ne čelní hrana,
//   • programovaný bod leží o R nad řezaným povrchem (`noseLiftX`), takže
//     hloubková posloupnost kotvená na povrchu polotovaru brala první třísku
//     `ap + R`.
export function roundInsert(prms) {
  const R = Math.max(parseFloat(prms.toolRadius) || 0, 0);
  return {
    shape: 'round',
    // Řeže jen nos, ne celá šířka — tělo nemá boční dosah v ose Z.
    cutsFullWidth: false,
    widthZ: 0,
    cornerR: R,
    flatSpanZ: 0,
    // Rozpětí těla v ose Z od špičky (pro obálky a hlídání). U nosu nula.
    bodyZ: { lo: 0, hi: 0 },
    // Kolik Z zabere stopa při čelním hrubování: u nosu jeho průměr.
    faceCoverZ: (rTip) => 2 * rTip,
    // Nakloněný bok, který by šel o kontuu — kulatá destička nemá.
    // Má BOK A HŘBET, jejichž sklon se musí hlídat proti kontuře: hlídaní
    // uvnitř si pak samo řeší znaménko natočení (záporné = čelní hrana,
    // kladné = hrana hřbetu u pravých stěn kapes).
    hasFlankGeometry: false,
    tiltedFlank: false,
    // Mezní čáru vydává, ale JINOU než polygon: nemá čelní hranu, takže
    // hlídat „dojezd" není co (uživatel 7. 9. 2026: *„hlídání přední strany
    // od plátku je zbytečné, protože se jedná o kulatý plátek"*). Zůstává
    // hranice ZANOŘENÍ — pod jaký sklon se stihne nástroj sjet do materiálu.
    // Úhel není vlastnost destičky, ale pole „Úhel zanoření (°)"
    // (getEffectivePlungeAngle → auto 45°, nebo ručně zadaná hodnota).
    guideKinds: ['zanoreni'],
    plungeGuide: true,
    // ŘEŽE MEZNÍ ČÁRA ZANOŘENÍ KONTURU? U kulaté NE — a je to VĚDOMÉ
    // rozhodnutí, ne nedodělek. Čáry se do `buildMachinableContour`
    // NEPOSÍLAJÍ (`bridgePlungeGuidesIntoContour` je proto dnes bez
    // odběratele).
    //
    // POZOR, NEPLETY SI TO S DĚLENÍM ÚSEKŮ: tam se čára kulaté destičky
    // POČÍTÁ jako u každého jiného plátku (`guideStaysInStock`,
    // `ops/long/regions.js`) — pravidlo „dělí jen čára, co VYJEDE
    // z polotovaru" je jedno pro všechny (uživatel 8. 9. 2026,
    // `docs/cam-pravidla-drah.md` §3.2a). „Neposílá se do kontury"
    // a „nepočítá se na úseky" jsou DVĚ RŮZNÉ věci; platí jen to první.
    //
    // Důvod: u polygonu most nahrazuje úsek, kam se HROT vůbec nedostane,
    // kdežto kulatý nos se na tutéž stěnu dostane — jen se k ní nesjede
    // rampou. Přemostit ji by tedy umazalo materiál, který nástroj vzít umí.
    // (Jednodenní pokus 9. 9. 2026 opačným směrem — „udělej z té čáry
    // konturu materiálu" — se vrátil zpět.) Zapnout to je změna chování,
    // ne oprava; chce vlastní měření úběru.
    //
    // JE TO KLÍČ PLÁTKU, NE GLOBÁLNÍ PŘEPÍNAČ. Mezní čáru zanoření vydává
    // i polygon a ten ji jako konturu NECHCE — jeho dráhy jsou na dnešní
    // chování odladěné. Bez tohohle klíče stačilo, aby se podmínka opřela
    // o `plungeClearance` (tu má i polygon), a zásah pro kulatou by mu
    // přepsal dráhy.
    plungeGuideCutsContour: false,
    // NAPOJUJE SE OFFSETOVÁ ČÁRA NA MEZNÍ ČÁRU ZANOŘENÍ? U kulaté ANO.
    // Konturu ta čára neřeže (klíč výš), ale DRÁHA ji respektovat musí:
    // pod daným úhlem zanoření plátek strmější stěnu nesjede, takže offset
    // u ní nesmí kopírovat povrch — ořízne se offsetem mezní čáry a napojí
    // na sousední offsetové čáry (pravidlo uživatele 17. 9. 2026, detaily
    // v `guideOffsetJoin.js`). Polygonu se to netýká: jeho mezní čáry
    // konturu mostí, takže jejich offset vzniká napojený už z kontury.
    plungeGuideJoinsOffset: true,
    // O KOLIK LEŽÍ PROGRAMOVANÝ BOD NAD ŘEZANÝM POVRCHEM (v ose X).
    // Dráha je STŘED nosu, takže na válcové ploše řeže o R níž, než kam
    // se programuje. Hloubková posloupnost je přitom kotvená na POVRCHU
    // polotovaru — bez tohohle členu by první průchod bral `ap + R`.
    // U kulaté destičky je to celý rádius (R 8–12 běžně), takže nález
    // uživatele 7. 9. 2026: ap 2,5 a R10 → první tříska 10,75 mm.
    noseLiftX: R,
    // SJEZD NA HLOUBKU JDE POD ÚHLEM ZANOŘENÍ, NE KOLMO. Poslední kousek
    // příjezdu se dosud dojížděl radiálně o `Vůle + R` — u kulaté R 5 tedy
    // 6 mm svisle, u R 10 rovných 11. To je zápich, a ten tenhle plátek
    // dělat nemá (opakovaný nález uživatele). Ostatní tvary si drží dnešní
    // chování, dokud pro ně nebude vlastní měření — u nich je ten kousek
    // 1,8 mm a dráhy jsou na něj odladěné.
    rampedApproach: true,
    // Sjezdy/dojezdy po OBÁLCE plátku (široký bok) — jen upichovák.
    envelopeAlongContour: false,
    // Sloučení vrstvy přes nízký hrb — změřeno zatím jen u upichováku.
    mergesOverHump: true,
    // ── ROZHODNUTÍ, KTERÁ DŘÍV ŽILA MIMO (audit 10. 9. 2026) ─────────────
    // Devět míst v generátoru se ptalo přímo `prms.toolShape === '…'`, takže
    // zásah pro jeden tvar sahal na ostatní (dvakrát se to letos stalo).
    // Teď jsou to klíče tady; sdílený kód se ptá jen jich.
    //   footprintIsNoseOnly     — stopa pro model úběru je JEN nos, ne tělo
    //   bodyInCollisionEnvelope — tělo plátku se počítá do kolizní oblasti
    //   faceBodyZFromWidth      — čelně: dosah těla v +Z ze ŠÍŘKY, ne z ap
    //   plungeAngleMaxDeg       — strop úhlu zanoření
    //   autoPlungeAngleDeg      — auto úhel (null = spočítá se z tvaru)
    //   canPartOff              — umí upíchnout (zápich po svislé úsečce)
    //   hasGrooveProfile        — má vůbec definovaný zápichový profil
    //   partOffCornerR          — pracovní rádius při upichování
    //   finishAlongEnvelope     — dokončování po obálce plátku, ne po offsetu
    footprintIsNoseOnly: true,
    //   footprintChordTol — největší průhyb tětivy [mm] kružnice nosu v MODELU
    //                  ÚBĚRU (`toolFootprintVisual`: simulace, validátor,
    //                  obrobený polotovar pro „➕ Operace"). Pevných 12 úseček
    //                  na půlkruh (po 15°) dělá u R 10 tětivy 2,6 mm s průhybem
    //                  0,085 mm — zbytek po kulatém nosu pak nebyl oblouk, ale
    //                  lomená čára, a proložení obrobeného polotovaru (tol. 0,05)
    //                  ji nechalo jako řadu úseček (nález uživatele 30. 9. 2026).
    //                  Plánovací `toolFootprint` zůstává na 12 — dráhy se nehnou.
    footprintChordTol: 0.02,
    bodyInCollisionEnvelope: false,
    faceBodyZFromWidth: false,
    plungeAngleMaxDeg: 89,
    // Ruční úhel zanoření platí (viz parting.js).
    plungeFixed: false,
    // Smí hrubovat podélně (u upichováku ne, viz parting.js).
    longRoughing: true,
    autoPlungeAngleDeg: 45,
    canPartOff: true,
    hasGrooveProfile: true,
    partOffCornerR: R,
    finishAlongEnvelope: false,
    // ── OPRAVY Z 23. 9. 2026, JEN PRO TENHLE PLÁTEK ─────────────────────
    // Uživatel 23. 9. 2026: *„plátky by měly mít svůj soubor — jestli oprava
    // pohne i polygonálním plátkem, refaktoruj to, aby to nemělo nic
    // společného"*. Každá oprava konce dílu u kulaté R 10 proto visí na
    // klíči; ostatní plátky mají tentýž klíč VYPNUTÝ a jejich dráhy se
    // nehnou (ověřeno otiskem 29 fixtures). Popis v docs/cam-pravidla-drah.md
    // §6.0 „Kulatá destička: hrb u čela…".
    //   skipPocketsCuttingNothing — „kapsa po kontuře", co nic nového
    //                              neuřízne, se nevydá
    //   leadInRapidOverCut       — nájezd po už projeté dráze rychloposuvem
    skipPocketsCuttingNothing: true,
    leadInRapidOverCut: true,
    //   pocketLeadOutNoStep      — kapsový průchod dojede schod po obrysu
    //                              k předchozí vrstvě (jako otevřený)
    pocketLeadOutNoStep: true,
    //   pocketRampAlongWall      — zanoření v kapse (další krok řetězu) po
    //                              KONKÁVNÍ stěně jede po offsetu (G1/G3), ne
    //                              tětivou nad ní, a dobrání dna kapsy na
    //                              konec té rampy naváže i uprostřed oblouku
    //                              (28. 9. 2026, kruhové vybrání R 24,5:
    //                              tětiva 38,7° nechala 0,18 mm a dobrání
    //                              pak jelo tentýž kus stěny podruhé)
    pocketRampAlongWall: true,
    //   leadInTailBelowPrev      — „kapsa po kontuře" jede nájezdem jen od
    //                              mělčí vrstvy (x + ap) dolů, když kus nad ní
    //                              jede vzduchem (28. 9. 2026, poslední
    //                              vrstva u osy objížděla celý díl)
    leadInTailBelowPrev: true,
    //   airSplitFullNose         — rychloposuv „vzduchem" uvnitř řezu jen tam,
    //                              kde je volná celá kružnice nosu (±R v Z),
    //                              ne jen bod pod středem (28. 9. 2026, G0
    //                              0,7 mm² do kůry u stěny)
    airSplitFullNose: true,
    //   leadInStartNoPlunge      — nájezd po kontuře, jehož začátek je zasypaný
    //                              materiálem (pod řetězem ramp), se nahradí
    //                              vjezdem řetězem / rampou z povrchu, když
    //                              existuje (28. 9. 2026, kolmo `G1 X19.243`)
    leadInStartNoPlunge: true,
    //   leadInSteepToChain       — nájezd po kontuře, který by sjel do
    //                              materiálu strměji než úhel zanoření (84°
    //                              po čele) nebo k jehož začátku se musí
    //                              zapíchnout, se nahradí rampou navázanou na
    //                              začátek vrstvy o ap výš — řetěz ramp
    //                              (29. 9. 2026, úsek 2: nájezd přes celý díl
    //                              s `G1 X19.243` kolmo, sjezdy 84° po čele)
    leadInSteepToChain: true,
    //   approachFromNoseContact  — nájezd posuvem před materiálem se měří od
    //                              místa, kde se KRUŽNICE nosu dotkne offsetové
    //                              čáry polotovaru, a je jen Vůle Z (ne Vůle Z
    //                              + R — začátky vrstev kulaté už R obsahují).
    //                              Týž odstup i u rychloposuvu uvnitř řezu
    //                              (29. 9. 2026: 11 mm posuvem vzduchem před
    //                              vrstvou, uvnitř řezu 0 mm; kvůli R navíc
    //                              vypadla i vrstva X 29,118 u stěny údolí)
    approachFromNoseContact: true,
    //   rule7Layers              — vrstvy úseku staví jeden postup podle pravidla 7
    //                              (ops/long/rule7Layers.js) místo hloubkové smyčky
    //                              a dodatečných úprav pořadí (29. 9. 2026)
    rule7Layers: true,
    //   realStockLayers          — viz polygon.js; kulatá měří skutečný polotovar
    //                              v rule7Layers.js, starý cyklus nepouští
    realStockLayers: false,
    leadOutPastRampWall: false,
    closingLayerTracesFloor: false,
    finishRampFromContact: false,
    //   leadOutTrimNoseCircle    — dojezd „bez schodků" se na hranu materiálu
    //                              ořezává podle KRUŽNICE nosu, ne sloupce pod
    //                              středem: nos R 10 bere bokem polotovar až R
    //                              od středu (30. 9. 2026, díl (10): zahlazení
    //                              schodku na stěně Z 205 se nevydalo vůbec)
    leadOutTrimNoseCircle: true,
    // ── DŘÍV SDÍLENÝ KÓD, TEĎ VLASTNÍ HODNOTA PLÁTKU (audit 23. 9. 2026) ──
    //   holderSeatZ  — o kolik nad destičkou sedí spodní hrana NÁHRADNÍHO
    //                  držáku (obdélník, když není nakreslený obrys). Dřív
    //                  jeden vzorec v collisionValidator.js a insertPreview.js
    //                  pro VŠECHNY tvary z `toolLength` — tedy z délky hrany
    //                  polygonu / šířky upichováku i u kulaté. Hodnota je zatím
    //                  všude tatáž, ale změnit ji jde už jen pro jeden plátek.
    //   guideRotDeg, guideTipDeg — úhly hran pro mezní čáry
    //                  (interferenceGuides.js). Čte je jen plátek, který čáry
    //                  z vlastních hran vydává (polygon); ostatní mají
    //                  neutrální 0 / 90 a jejich čáry z nich nevznikají.
    holderSeatZ: Math.max(Math.max(parseFloat(prms.toolLength) || 10, 1), Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1), 4),
    guideRotDeg: 0,
    guideTipDeg: 90,
    // ── VRTÁK (7. 10. 2026) — klíče, které zapíná jen inserts/drill.js ──
    //   footprintIsOutline — stopa pro úběr i test dotyku = PŘESNÝ obrys
    //                  nástroje (bez stadionu kolem nosu a bez zametení těla
    //                  v X — vrták v ose by jinak „vyvrtal" díru o ≥3 mm větší)
    //   holderAxial  — náhradní držák (obdélník) sedí ZA nástrojem v ose Z
    //                  (sklíčidlo/pouzdro vrtáku), ne nad ním v X
    //   canDrill     — umí operaci Vrtání (ops/drill.js)
    //   canBore      — smí vyvrtávat (ops/bore.js, pravidlo 13: vnitřní = zrcadlo vnějšího)
    //   pointLengthZ — osová délka špičky (hloubka „na plný ⌀" = + tahle délka)
    footprintIsOutline: false,
    holderAxial: false,
    canDrill: false,
    canBore: true,
    pointLengthZ: 0,
  };
}

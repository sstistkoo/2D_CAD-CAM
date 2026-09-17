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
    bodyInCollisionEnvelope: false,
    faceBodyZFromWidth: false,
    plungeAngleMaxDeg: 89,
    autoPlungeAngleDeg: 45,
    canPartOff: true,
    hasGrooveProfile: true,
    partOffCornerR: R,
    finishAlongEnvelope: false,
  };
}

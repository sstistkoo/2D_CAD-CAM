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
  };
}

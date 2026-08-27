// ╔════════════════════════════════════════════════════════╗
// ║  KULATÁ DESTIČKA — pravidla pro generátor drah              ║
// ╚════════════════════════════════════════════════════════╝
//
// Celý břit je AKTIVNÍ NOS: kruh R kolem programovaného bodu. Nemá bok,
// který by mohl narazit stranou, ani natočení, které by naklonilo spodní
// hranu — proto tu žádné zvláštní hlídání není a všechno vychází z R.
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
    // Sjezdy/dojezdy po OBÁLCE plátku (široký bok) — jen upichovák.
    envelopeAlongContour: false,
    // Sloučení vrstvy přes nízký hrb — změřeno zatím jen u upichováku.
    mergesOverHump: false,
  };
}

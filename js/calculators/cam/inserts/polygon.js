// ╔════════════════════════════════════════════════════════╗
// ║  ČTYŘSTRANNÁ (POLYGON) DESTIČKA — pravidla pro generátor drah  ║
// ╚════════════════════════════════════════════════════════╝
//
// Řeže nosem (rádius R), ale má NAKLONĚNÝ BOK: při záporném natočení se
// čelní hrana zvedá od špičky, a tam, kam už nedosáhne, se čelní průchody
// musí zkrátit. Zadní hrany má uvolněné úlevem, takže se do kolizní obálky
// (na rozdíl od upichováku) NEZAPOČÍTÁVAJÍ — nakreslený klín úlev nemodeluje
// a složení celého těla by falešně ubíralo legitimní průchody.
export function polygonInsert(prms) {
  const R = Math.max(parseFloat(prms.toolRadius) || 0, 0);
  // Natočení: záporné = čelní hrana stoupá od špičky (odtud to hlídání).
  const tiltDeg = -(parseFloat(prms.toolAngle) || 0);
  return {
    shape: 'polygon',
    cutsFullWidth: false,
    widthZ: 0,
    cornerR: R,
    flatSpanZ: 0,
    bodyZ: { lo: 0, hi: 0 },
    faceCoverZ: (rTip) => 2 * rTip,
    tiltDeg,
    // Má BOK A HŘBET, jejichž sklon se musí hlídat proti kontuře: hlídaní
    // uvnitř si pak samo řeší znaménko natočení (záporné = čelní hrana,
    // kladné = hrana hřbetu u pravých stěn kapes).
    hasFlankGeometry: true,
    tiltedFlank: tiltDeg > 0.01,
    envelopeAlongContour: false,
    mergesOverHump: true,
  };
}

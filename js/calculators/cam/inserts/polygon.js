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
    // Obě mezní čáry: čelní hrana ('dojezd', natočení + vrchol) i spodní
    // ('zanoreni', natočení). Beze změny — tady je hlídání hotové.
    guideKinds: ['dojezd', 'zanoreni'],
    plungeGuide: false,
    // Mezní čára zanoření je u tohohle tvaru jen HRANICE, ne kontura
    // materiálu — dráhy jsou na to odladěné (viz round.js).
    plungeGuideCutsContour: false,
    // Zvednutí programovaného bodu nad řezaný povrch (viz round.js): rádius
    // nosu je tu 0,4–1,2 mm, tedy pod rozlišením, na kterém jsou dráhy
    // těchto plátků odladěné. Ponecháno na 0, aby se hloubková
    // posloupnost nepohnula — posun celé mřížky je měřeně ztrátový
    // (viz komentář u `depths` v ops/roughLong.js).
    noseLiftX: 0,
    // Poslední kousek na hloubku (`Vůle X + R`) jde ŠIKMO pod úhlem zanoření,
    // ne radiálně — viz `emitFeedToDepth` v gcodeEmit.js.
    //
    // Do 10. 9. 2026 to měla zapnuté jen kulatá a u polygonu se sjíždělo
    // KOLMO. Není to detail: délka toho kousku je `Vůle X + R`, takže při
    // R 0,8 je to 1,80 mm a při R 1,3 už 2,30 mm — u nastaveného úhlu 10°
    // je 90° sjezd hrubé porušení. Nález uživatele 10. 9. 2026 na jeho dílu
    // (`N2550 G1 X49.525`, `N2390 G1 X17.045`, …).
    //
    // ZMĚŘENO na obou jeho souborech (polygon, ap 2,5, úhel 10°):
    //   R 0,8: řezy strmější než 10° 8 → 4, svislé 7 → 3
    //   R 1,3: řezy strmější než 10° 9 → 5, svislé 9 → 5
    // Úběr, největší tříska, třísky nad ap, duplicity i kolize (syrové
    // i offsetové) BEZE ZMĚNY. Zbylé svislé sjezdy jsou ty, kde couvnutí
    // v Z neprojde testem proti materiálu/držáku — tam zůstává radiální
    // sjezd, protože couvnout se nedá (viz komentář u emitFeedToDepth).
    rampedApproach: true,
    envelopeAlongContour: false,
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
    footprintIsNoseOnly: false,
    bodyInCollisionEnvelope: false,
    faceBodyZFromWidth: false,
    plungeAngleMaxDeg: 89,
    autoPlungeAngleDeg: null,
    canPartOff: false,
    hasGrooveProfile: false,
    partOffCornerR: R,
    finishAlongEnvelope: false,
  };
}

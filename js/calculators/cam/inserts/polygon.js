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
    // `tiltDeg` se dřív vydával jako klíč, ale nikdo ho nečetl — jen tady
    // slouží k `tiltedFlank`. Odebráno 23. 9. 2026 (sada klíčů musí být
    // u všech plátků stejná, tests/cam-insert-isolation.test.js).
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
    // Offset na mezní čáru zanoření se nenapojuje — viz round.js.
    plungeGuideJoinsOffset: false,
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
    // Auto úhel zanoření = úhel spodní hrany destičky (podélně natočení,
    // čelně natočení + ε − 90), shora omezený úhlem hřbetu α. Dřív se to
    // počítalo v camMath.js pod `autoPlungeAngleDeg === null` — vzorec
    // polygonu tak žil ve sdíleném souboru (audit 23. 9. 2026).
    autoPlungeAngleDeg: (() => {
      const rot = parseFloat(prms.toolAngle) || 0;
      const tip = parseFloat(prms.toolTipAngle) || 90;
      const clearDeg = parseFloat(prms.toolClearanceAngle) || 0;
      const rawAngle = prms.roughingStrategy === 'face' ? Math.abs(rot + tip - 90) : Math.abs(rot);
      const a = clearDeg > 0 ? Math.min(rawAngle, clearDeg) : rawAngle;
      return Math.max(0.5, Math.min(89, a));
    })(),
    canPartOff: false,
    hasGrooveProfile: false,
    partOffCornerR: R,
    finishAlongEnvelope: false,
    // ── OPRAVY Z 23. 9. 2026 PRO KULATOU — TADY VYPNUTÉ ──────────────────
    // Klíče existují u každého plátku (hlídá tests/cam-insert-keys.test.js),
    // aby se žádné rozhodnutí nedalo zdědit ze sdíleného kódu. Význam viz
    // round.js; zapnout je pro tenhle plátek je změna chování, která chce
    // vlastní měření na jeho fixtures.
    skipPocketsCuttingNothing: false,
    leadInRapidOverCut: false,
    pocketLeadOutNoStep: false,
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
    guideRotDeg: parseFloat(prms.toolAngle) || 0,
    guideTipDeg: parseFloat(prms.toolTipAngle) || 90,
  };
}

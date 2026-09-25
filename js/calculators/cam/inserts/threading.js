// ╔════════════════════════════════════════════════════════╗
// ║  ZÁVITOVÝ PLÁTEK — pravidla pro generátor drah                 ║
// ╚════════════════════════════════════════════════════════╝
//
// Lichoбěžníková špička s rovnou spodní stranou (šířka `toolTipFlat`);
// rádius se u něj nepoužívá. Hrubovací strategie ho neobsluhují — závit má
// vlastní průchody — a do kolizní obálky se V-profil nezapočítává.
export function threadingInsert(prms) {
  const flat = Math.max(parseFloat(prms.toolTipFlat) || 0, 0);
  return {
    shape: 'threading',
    cutsFullWidth: false,
    widthZ: flat,
    cornerR: 0,
    flatSpanZ: flat,
    bodyZ: { lo: 0, hi: 0 },
    faceCoverZ: (rTip) => 2 * rTip,
    // Má BOK A HŘBET, jejichž sklon se musí hlídat proti kontuře: hlídaní
    // uvnitř si pak samo řeší znaménko natočení (záporné = čelní hrana,
    // kladné = hrana hřbetu u pravých stěn kapes).
    hasFlankGeometry: false,
    tiltedFlank: false,
    // Hlídání geometrie destičky se pro tenhle tvar nepočítá (getToolClearanceRange
    // ani getPlungeGuardRange ho nevydají) — klíč je tu jen pro úplnost.
    guideKinds: [], plungeGuide: false,
    // Mezní čáru zanoření nevydává, takže konturu řezat nemá čím.
    plungeGuideCutsContour: false,
    // Offset na mezní čáru zanoření se nenapojuje — viz round.js.
    plungeGuideJoinsOffset: false,
    // Zvednutí programovaného bodu nad řezaný povrch (viz round.js): rádius
    // nosu je tu 0,4–1,2 mm, tedy pod rozlišením, na kterém jsou dráhy
    // těchto plátků odladěné. Ponecháno na 0, aby se hloubková
    // posloupnost nepohnula — posun celé mřížky je měřeně ztrátový
    // (viz komentář u `depths` v ops/roughLong.js).
    noseLiftX: 0,
    // Sjezd na hloubku zůstává radiální (viz `rampedApproach` v round.js).
    rampedApproach: false,
    envelopeAlongContour: false,
    mergesOverHump: false,
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
    // Ruční úhel zanoření platí (viz parting.js).
    plungeFixed: false,
    // Smí hrubovat podélně (u upichováku ne, viz parting.js).
    longRoughing: true,
    autoPlungeAngleDeg: 45,
    canPartOff: false,
    hasGrooveProfile: true,
    partOffCornerR: Math.max(parseFloat(prms.toolRadius) || 0, 0),
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
    guideRotDeg: 0,
    guideTipDeg: 90,
  };
}

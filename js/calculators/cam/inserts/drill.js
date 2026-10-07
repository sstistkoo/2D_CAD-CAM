// ╔════════════════════════════════════════════════════════╗
// ║  VRTÁK — pravidla pro generátor drah                           ║
// ╚════════════════════════════════════════════════════════╝
//
// Šroubovitý vrták v ose soustruhu (X0). Rozměry jsou ve stávajících polích
// nástroje, ať je nese zásobník, knihovna i export bez nového formátu:
//   toolRadius   = ⌀/2 vrtáku
//   toolTipAngle = vrcholový úhel špičky σ (HSS 118°, tvrdokov 140°)
//   toolLength   = vyložení — délka od špičky k sklíčidlu/pouzdru
// Profil {x,z} jako u ostatních plátků (insertPreview.js): 0,0 = špička,
// x = podél osy vrtáku (ve světě osa Z), z = napříč (ve světě poloměr X).
//
// Soustružit neumí — hrubovací strategie ho neobsluhují, jeho operace je
// Vrtání (ops/drill.js). Klíče tvarů plátků jsou proto vesměs vypnuté jako
// u závitového; zapnuté jsou jen ty „vrtací" (footprintIsOutline,
// holderAxial, canDrill, pointLengthZ).

/** Rozměry vrtáku z parametrů — sdílí pravidla i kreslení (insertPreview.js). */
export function drillDims(prms) {
  const r = Math.max(parseFloat(prms.toolRadius) || 0, 0.05);
  const sigma = Math.min(Math.max(parseFloat(prms.toolTipAngle) || 118, 60), 180);
  const point = sigma >= 179.9 ? 0 : r / Math.tan((sigma / 2) * Math.PI / 180);
  const L = Math.max(parseFloat(prms.toolLength) || 0, point + 1);
  return { r, sigma, point, L };
}

export function drillInsert(prms) {
  const { r, point, L } = drillDims(prms);
  return {
    shape: 'drill',
    cutsFullWidth: false,
    widthZ: 2 * r,
    cornerR: 0,
    flatSpanZ: 0,
    bodyZ: { lo: 0, hi: 0 },
    faceCoverZ: (rTip) => 2 * rTip,
    hasFlankGeometry: false,
    tiltedFlank: false,
    guideKinds: [], plungeGuide: false,
    plungeGuideCutsContour: false,
    plungeGuideJoinsOffset: false,
    noseLiftX: 0,
    rampedApproach: false,
    envelopeAlongContour: false,
    mergesOverHump: false,
    footprintIsNoseOnly: false,
    bodyInCollisionEnvelope: false,
    faceBodyZFromWidth: false,
    plungeAngleMaxDeg: 89,
    plungeFixed: false,
    // Podélně ani čelně nesoustruží — `longRoughing: false` by ho ale
    // přepnulo na čelní hrubování (enforceInsertStrategy), což nedává smysl
    // o nic víc. Hrubování s vrtákem UI hlásí jako chybu (záložka Vrtání).
    longRoughing: true,
    autoPlungeAngleDeg: 45,
    canPartOff: false,
    hasGrooveProfile: false,
    partOffCornerR: 0,
    finishAlongEnvelope: false,
    skipPocketsCuttingNothing: false,
    leadInRapidOverCut: false,
    pocketLeadOutNoStep: false,
    pocketRampAlongWall: false,
    leadInTailBelowPrev: false,
    airSplitFullNose: false,
    leadInStartNoPlunge: false,
    leadInSteepToChain: false,
    approachFromNoseContact: false,
    rule7Layers: false,
    realStockLayers: false,
    leadOutTrimNoseCircle: false,
    footprintChordTol: 0,
    // Náhradní držák (sklíčidlo) začíná na konci vyložení.
    holderSeatZ: L,
    guideRotDeg: 0,
    guideTipDeg: 90,
    footprintIsOutline: true,
    holderAxial: true,
    canDrill: true,
    canBore: false,
    pointLengthZ: point,
  };
}

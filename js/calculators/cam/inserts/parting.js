// ╔════════════════════════════════════════════════════════╗
// ║  UPICHOVACÍ / ZAPICHOVACÍ PLÁTEK — pravidla pro generátor drah  ║
// ╚════════════════════════════════════════════════════════╝
//
// JEDINÝ tvar, který řeže CELOU spodní hranou šířky b — a jediný, jehož
// BOK reálně naráží, takže se tělo započítává do kolizní obálky.
// Z toho plyne všechno ostatní:
//
//  • Obrys sahá od −R za špičkou po (b − R) před ní — to je `bodyZ`. Kdykoli
//    se počítá obálka nebo se někam ZAPICHUJE, musí se brát maximum předlohy
//    přes celé to okno, ne jen bod špičky.
//  • Kapsa užší než b se přeskočí — plátek se do ní nevejde.
//  • Sjezdy a dojezdy jedou po OBÁLCE, ne po holem offsetu.
//  • Úhel zanoření je 90°: spodní hrana JE obráběcí hrana (rozhodnutí
//    uživatele 26. 8. 2026).
export function partingInsert(prms) {
  const b = Math.max(parseFloat(prms.toolLength) || 0, 0);
  const R = Math.max(parseFloat(prms.toolRadius) || 0, 0);
  const r = b > 0 ? Math.min(R, b / 2) : R;
  return {
    shape: 'parting',
    cutsFullWidth: b > 0.01,
    widthZ: b,
    cornerR: r,
    // Rovná část spodního ostří mezi oběma rádiusy.
    flatSpanZ: Math.max(0, b - 2 * r),
    // Rozpětí těla v ose Z od špičky — táž čísla jako obrys v insertPreview.
    bodyZ: { lo: -r, hi: Math.max(0, b - r) },
    // Čelně se plátek opře celým záběrem, ne jen nosem.
    faceCoverZ: (rTip) => Math.max(b, 2 * rTip),
    // Má BOK A HŘBET, jejichž sklon se musí hlídat proti kontuře: hlídaní
    // uvnitř si pak samo řeší znaménko natočení (záporné = čelní hrana,
    // kladné = hrana hřbetu u pravých stěn kapes).
    hasFlankGeometry: false,
    tiltedFlank: false,
    envelopeAlongContour: true,
    // Sloučení vrstvy přes nízký hrb (27. 8. 2026). U ostatních tvarů zatím
    // vypnuté: spouštělo se na drobných rozdílech hranic intervalů a rozvedlo
    // booleovskou a scan-line větev (na `part-1` o 22 mm² úběru).
    mergesOverHump: true,
  };
}

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
    envelopeAlongContour: false,
    mergesOverHump: false,
  };
}

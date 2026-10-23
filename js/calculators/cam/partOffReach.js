// ╔══════════════════════════════════════════════════════════════╗
// ║  UPICHNUTÍ: dosah čepele držáku                              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Upichovací čepel je užší než hlava držáku. Zapíchne-li se hlouběji, než
// čepel sahá, zavadí o polotovar celá hlava (viz partingHolder v
// isoToolCatalog.js: čepel o 0,1 mm/stranu užší než plátek do `tmax`,
// pak se rozšiřuje k dříku). Dosah se bere z OBRYSU držáku — není na to
// nový klíč nástroje, takže platí i pro ručně nakreslený držák. Obrys bez
// rozšíření (obdélník široký jako plátek) dosah neomezuje.
//
// Souřadnice obrysu jako všude (insertPreview.js): 0,0 = střed rádiusu
// špičky, x napříč (podél osy Z obrobku), +z od špičky k držáku; spodní
// hrana plátku leží na z = −R.
import { getInsert } from './inserts/index.js';

const BAND_MARGIN = 0.15;   // čepel je o 0,1 mm/stranu užší než plátek; sem se vejde i nepřesně nakreslená

/**
 * Hloubka [mm] od spodní hrany plátku, do které čepel sahá, než se držák
 * rozšíří; null = obrys držáku to neomezuje (chybí, nebo se nerozšiřuje).
 */
export function partOffReachDepth(prms) {
  const ins = getInsert(prms);
  if (!ins.canPartOff || !(ins.widthZ > 0)) return null;
  const loop = prms.holderProfile && prms.holderProfile.sideA;
  if (!Array.isArray(loop) || loop.length < 4) return null;
  const r = ins.cornerR || 0;
  const lo = -r - BAND_MARGIN, hi = ins.widthZ - r + BAND_MARGIN;
  const outside = (x) => x < lo || x > hi;
  let best = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const ax = Number(a.x), az = Number(a.z), bx = Number(b.x), bz = Number(b.z);
    if (outside(ax)) best = Math.min(best, az);
    // Hrana, která pásmo opouští: z v místě překročení hranice pásma.
    if (outside(ax) !== outside(bx) && Math.abs(bx - ax) > 1e-9) {
      const edge = outside(bx) ? (bx > hi ? hi : lo) : (ax > hi ? hi : lo);
      const t = (edge - ax) / (bx - ax);
      best = Math.min(best, az + t * (bz - az));
    }
  }
  return Number.isFinite(best) ? Math.max(0, best + r) : null;
}

/**
 * Varování pro upichnutí, na které čepel nedosáhne (jinak null).
 * @param {Object} prms  parametry CAM
 * @param {number} xStockTop  poloměr polotovaru v místě upichnutí
 */
export function partOffReachWarning(prms, xStockTop) {
  if (!(prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ)))) return null;
  // Zápich v díře (Upich + ◎ Vnitřní) hlídá dosah sám (ops/grooveInner.js).
  if (prms.partOffInner || prms.partOffFace) return null;   // čelní zápich hlídá dosah čepele sám
  const reach = partOffReachDepth(prms);
  if (reach === null) return null;
  const need = xStockTop - (parseFloat(prms.allowanceX) || 0);
  if (!(need > reach + 0.5)) return null;
  return `Upichnutí: čepel nástroje sahá jen ${reach.toFixed(1)} mm od špičky, polotovar je ale hluboký ${need.toFixed(1)} mm `
    + '— v té hloubce by o polotovar zavadila hlava držáku. Zvol upichovací lištu s větším dosahem (🧰 Knihovna → 📚 Katalog → Zapichovací → lišta s dlouhým dosahem).';
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kde leží tělo upichovacího plátku kolem špičky (v Z)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Upichovák řeže celou spodní hranou šířky b; obrys sahá od špičky o
// `bodyZ.lo` (−R) po `bodyZ.hi` (b − R) — jen na jednu stranu. Ve světě je
// tělo od `z − zDir·lo` po `z − zDir·hi` (zDir −1 zprava, +1 backside/zleva;
// týž klíč jako odstup v ops/roughEmit.js). Zleva je zrcadlo zprava, takže
// parita zrcadlení drží.
//
// Bez známého směru (zDir 0, např. dokončování) se bere souměrně ±max(|lo|, |hi|)
// — tak to dělalo zastavení rychloposuvu (`rapidStopXAt`, gcodeEmit.js) dřív
// vždycky. Pak ale zastavovalo nad dnem na straně, kde plátek není
// (parting-finish-envelope-edge `N8010`: stop X12,924 nad dnem X10,117 vedle,
// materiál pod plátkem až od ~X6,4 — 6,5 mm posuvem vzduchem; audit CAM
// 27. 11. 2026).

/**
 * Posuny v Z od špičky (po 0,5 mm), ve kterých stojí tělo upichováku.
 * Pro jiné plátky (necutsFullWidth) prázdné pole.
 * @param {{cutsFullWidth?: boolean, bodyZ?: {lo: number, hi: number}}} ins
 * @param {number} zDir  −1 / +1 směr řezu průchodu, 0 = neznámý (souměrně)
 * @returns {number[]}
 */
export function partingBodyOffsets(ins, zDir) {
  if (!ins || !ins.cutsFullWidth || !ins.bodyZ) return [];
  const { lo, hi } = ins.bodyZ;
  const span = Math.max(Math.abs(lo), Math.abs(hi));
  if (!(span > 0)) return [];
  const out = [];
  if (zDir) {
    for (let d = lo; d <= hi + 1e-9; d += 0.5) out.push(-zDir * d);
  } else {
    for (let d = -span; d <= span + 1e-9; d += 0.5) out.push(d);
  }
  return out;
}

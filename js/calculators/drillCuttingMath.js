// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Řezné podmínky vrtání (čistý výpočet, bez DOM)      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vzorce (Sandvik Coromant, šroubovitý vrták):
//   n  = 1000·vc / (π·D)                  [min⁻¹]
//   vf = f·n                              [mm/min]
//   Pc = f·vc·D·kc / 240 000              [kW]
//   Mc = f·D²·kc / 8 000                  [N·m]   (= Pc·30 000 / (π·n))
//   Ff ≈ 0,5·kc·(D/2)·f·sin(σ/2)          [N]     osová (posuvová) síla
// Hodnoty v tabulce jsou ORIENTAČNÍ – rozhoduje katalog výrobce nástroje.

/**
 * vc – řezná rychlost [m/min] pro HSS a SK (tvrdokovový) vrták,
 * kf – součinitel doporučeného posuvu f = kf·D^0,6 [mm/ot] (D v mm),
 * kc – měrná řezná síla při vrtání [N/mm²].
 */
export const DRILL_CUT_MATERIALS = [
  { name: 'Ocel konstrukční (S235, C45)', vcHSS: 25, vcSK: 90,  kfHSS: 0.040, kfSK: 0.060, kc: 2000 },
  { name: 'Ocel legovaná (42CrMo4)',      vcHSS: 18, vcSK: 70,  kfHSS: 0.032, kfSK: 0.050, kc: 2300 },
  { name: 'Nerez (X5CrNi18-10)',          vcHSS: 10, vcSK: 50,  kfHSS: 0.026, kfSK: 0.040, kc: 2500 },
  { name: 'Litina šedá (GG25)',           vcHSS: 25, vcSK: 90,  kfHSS: 0.050, kfSK: 0.075, kc: 1200 },
  { name: 'Hliník a slitiny Al',          vcHSS: 60, vcSK: 200, kfHSS: 0.052, kfSK: 0.075, kc: 800 },
  { name: 'Mosaz (CuZn39Pb3)',            vcHSS: 50, vcSK: 150, kfHSS: 0.048, kfSK: 0.070, kc: 800 },
  { name: 'Měď (Cu-ETP)',                 vcHSS: 35, vcSK: 120, kfHSS: 0.040, kfSK: 0.060, kc: 1000 },
  { name: 'Plasty (PA, POM)',             vcHSS: 40, vcSK: 120, kfHSS: 0.050, kfSK: 0.075, kc: 300 },
];

/** Doporučená řezná rychlost [m/min]. tool: 'hss' | 'sk' */
export function recommendedVc(mat, tool) {
  return tool === 'sk' ? mat.vcSK : mat.vcHSS;
}

/** Doporučený posuv [mm/ot] – pod lineární růst s průměrem (tabulkové hodnoty). */
export function recommendedFeed(mat, tool, D) {
  if (!(D > 0)) return NaN;
  return (tool === 'sk' ? mat.kfSK : mat.kfHSS) * Math.pow(D, 0.6);
}

/**
 * Řezné podmínky a zatížení vrtání.
 * @param {{D:number, vc:number, f:number, kc:number, sigma?:number,
 *   depth?:number|null, tipLen?:number, approach?:number, overrun?:number}} p
 *   depth – hloubka plného Ø (null = bez strojního času), tipLen – délka špičky L,
 *   approach – nájezd, overrun – přejezd (průchozí díra)
 * @returns {{n, vf, Pc, Mc, Ff, path:number|null, t:number|null}|null}
 */
export function drillCutting({ D, vc, f, kc, sigma = 118, depth = null, tipLen = 0, approach = 0, overrun = 0 }) {
  if (!(D > 0) || !(vc > 0) || !(f > 0) || !(kc > 0)) return null;
  const n = 1000 * vc / (Math.PI * D);
  const vf = f * n;
  const Pc = f * vc * D * kc / 240000;
  const Mc = f * D * D * kc / 8000;
  const Ff = 0.5 * kc * (D / 2) * f * Math.sin(Math.min(sigma, 180) * Math.PI / 360);
  let path = null, t = null;
  if (depth != null && depth >= 0) {
    path = (approach || 0) + depth + (tipLen || 0) + (overrun || 0);
    t = path / vf;
  }
  return { n, vf, Pc, Mc, Ff, path, t };
}

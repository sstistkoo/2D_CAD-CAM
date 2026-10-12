// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Tepelná roztažnost (čistý výpočet)                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Lineární model: L(T) = L₀·(1 + α·(T − T₀)), α [10⁻⁶ /K], T₀ = 20 °C (ISO 1).
// Hodnoty α jsou ORIENTAČNÍ střed rozsahu pro 20–100 °C; přesná hodnota závisí
// na slitině a tepelném zpracování (u přesných dílů vzít z materiálového listu).

/** [klíč, název, α v 10⁻⁶/K] */
export const THERMAL_MATERIALS = [
  ['steel',    'Ocel konstrukční / uhlíková', 11.5],
  ['tool',     'Ocel nástrojová (kalená)', 11],
  ['inox',     'Nerez austenitická (1.4301)', 16.5],
  ['inoxM',    'Nerez martenzitická (1.4021)', 10.5],
  ['castGrey', 'Litina šedá', 10.5],
  ['castDuct', 'Litina tvárná', 11],
  ['alu',      'Hliníkové slitiny', 23],
  ['copper',   'Měď', 16.5],
  ['brass',    'Mosaz', 19],
  ['bronze',   'Bronz', 17.5],
  ['titan',    'Titan Ti6Al4V', 8.6],
  ['carbide',  'Slinutý karbid (WC-Co)', 5.5],
  ['pom',      'POM', 110],
  ['pa6',      'PA6', 90],
];

export const REF_TEMP = 20;

/** Rozměr po změně teploty z T0 na T. @param {number} alpha 10⁻⁶/K */
export function sizeAtTemp(L0, alpha, T, T0 = REF_TEMP) {
  return L0 * (1 + alpha * 1e-6 * (T - T0));
}

/** Rozměr při T0 (20 °C) z hodnoty naměřené při teplotě T. */
export function sizeAtRef(Lmeasured, alpha, T, T0 = REF_TEMP) {
  return Lmeasured / (1 + alpha * 1e-6 * (T - T0));
}

/**
 * Teplota pro nalisování za tepla (ohřev díry) nebo za studena (chlazení hřídele).
 * Potřebná změna průměru = přesah + montážní vůle.
 * @param {{d:number, interference:number, clearance?:number, alpha:number, T0?:number}} p
 *   d [mm], přesah a vůle [mm]
 * @returns {{dT:number, dD:number, heated:number, cooled:number}|null}
 *   heated – teplota ohřívané součásti, cooled – teplota chlazené součásti
 */
export function shrinkFit({ d, interference, clearance = 0, alpha, T0 = 20 }) {
  if (!(d > 0) || !(alpha > 0) || !(interference >= 0) || !(clearance >= 0)) return null;
  const dD = interference + clearance;
  const dT = dD / (alpha * 1e-6 * d);
  return { dT, dD, heated: T0 + dT, cooled: T0 - dT };
}

/**
 * Změna vůle spoje hřídel/otvor při změně teploty z T0 na T.
 * Kladné = vůle roste (otvor roste víc než hřídel).
 * @returns {number} změna průměrové vůle [mm]
 */
export function gapChange({ d, alphaHole, alphaShaft, T, T0 = REF_TEMP }) {
  return d * (alphaHole - alphaShaft) * 1e-6 * (T - T0);
}

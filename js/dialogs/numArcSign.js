// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Numerický vstup / znaménko R oblouku                ║
// ╚══════════════════════════════════════════════════════════════╝
//
// G-kód (ISO / Fanuc / Sinumerik CR=) zapisuje oblouk delší než 180° se
// ZÁPORNÝM R – stejně ho čte parseGcodeToObjects (storage/fileIO.js) i export
// výkresu. Číselné zadání dřív psalo vždy kladné R, takže oblouk „Střed +
// úhly" přes 180° se po 🔄 (vykreslit zapsaný G-kód) vrátil jako ten krátký.

const TWO_PI = Math.PI * 2;

/**
 * Rozvin oblouku ve směru jeho otáčení, 0 … 2π.
 * @param {number} sa počáteční úhel [rad]
 * @param {number} ea koncový úhel [rad]
 * @param {boolean} ccw
 */
export function arcSweep(sa, ea, ccw) {
  const s = ccw ? ea - sa : sa - ea;
  return ((s % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * R pro zápis do G-kódu: záporné u oblouku delšího než 180°.
 * @param {{r: number, sa: number, ea: number, ccw: boolean}} g
 */
export function signedArcRadius(g) {
  return arcSweep(g.sa, g.ea, g.ccw) > Math.PI + 1e-9 ? -g.r : g.r;
}

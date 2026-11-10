// SKICA – úhel šipky kompasu (✛) v CAD: směr NA OBRAZOVCE → úhel ve světových souřadnicích.
//
// CAD měří polární úhel ve světě (wx →, wy ↑; 0° = vodorovně doprava, proti směru hodin),
// což na soustruhu i karuselu bez zrcadlení odpovídá obrazovce. Při zrcadlení os
// (flipZ = vodorovná, flipX = svislá) je ale svět zrcadlený oproti obrazovce, takže šipka
// ↗ by bez převodu nakreslila úsečku jinam, než šipka ukazuje.

/**
 * @param {number} screenDeg úhel šipky na obrazovce (0 = →, 90 = ↑, proti směru hodin)
 * @param {{flipX?: boolean, flipZ?: boolean, nullAngle?: number}} [view]
 *   nullAngle = natočení nulového bodu ve stupních (dialog ho k zadanému úhlu přičítá)
 * @returns {number} úhel pro pole dialogu, 0 až < 360 (zaokrouhleno na 1e-6)
 */
export function screenToWorldAngle(screenDeg, { flipX = false, flipZ = false, nullAngle = 0 } = {}) {
  const r = screenDeg * Math.PI / 180;
  const ex = Math.cos(r), ey = Math.sin(r);
  const wx = flipZ ? -ex : ex, wy = flipX ? -ey : ey;
  let a = Math.atan2(wy, wx) * 180 / Math.PI - nullAngle;
  a = Math.round(a * 1e6) / 1e6 % 360;
  if (a < 0) a += 360;
  return a >= 360 ? 0 : a;
}

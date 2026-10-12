// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Oblouk: tětiva/výška, tři body, start+konec+R       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čistý výpočet v rovině (z, x): z = osa, x = POLOMĚR (Ø/2) – délky a úhly
// jsou skutečné. „ccw" = proti směru hodin v rovině Z (vpravo) – X (nahoru);
// G2/G3 se z něj odvozují až v okně (podle typu stroje, jako CNC export).

const DEG = 180 / Math.PI;

/**
 * Oblouk z libovolných dvou ze tří veličin: tětiva c, výška oblouku h, rádius R.
 * @returns {{c:number, h:number, R:number, angle:number, length:number}|null}
 *   angle – středový úhel [°] (nad 180° při h > R), length – délka oblouku
 */
export function arcFromTwo({ c = null, h = null, R = null }) {
  const has = (v) => v !== null && Number.isFinite(v);
  const n = [c, h, R].filter(has).length;
  if (n < 2) return null;
  if ([c, h, R].some(v => has(v) && !(v > 0))) return null;
  if (has(c) && has(h)) R = (c * c / 4 + h * h) / (2 * h);
  else if (has(c) && has(R)) {
    if (c > 2 * R + 1e-9) return null;
    h = R - Math.sqrt(Math.max(R * R - c * c / 4, 0));          // menší oblouk (≤ 180°)
  } else {
    if (h > 2 * R + 1e-9) return null;
    c = 2 * Math.sqrt(Math.max(h * (2 * R - h), 0));
  }
  const angle = 2 * Math.atan2(c / 2, R - h) * DEG;
  return { c, h, R, angle, length: R * angle / DEG };
}

/** Přepočet: z tětivy+R je druhé řešení „přes půlkruh" (h' = 2R − h). */
export function arcLargeVariant(r) {
  return arcFromTwo({ R: r.R, h: 2 * r.R - r.h });
}

/**
 * Kružnice a oblouk P1 → P2 → P3 (oblouk prochází středním bodem).
 * @returns {{O:{z,x}, R:number, ccw:boolean, sweep:number, length:number}|null}
 *   null = body leží na přímce (nebo splývají)
 */
export function arcFrom3Points(P1, P2, P3) {
  // počítá se vůči P1 (jinak by u malého oblouku daleko od počátku ubývala přesnost)
  const ax = 0, ay = 0, bx = P2.z - P1.z, by = P2.x - P1.x, cx = P3.z - P1.z, cy = P3.x - P1.x;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const scale = Math.max(Math.abs(ax), Math.abs(bx), Math.abs(cx), Math.abs(ay), Math.abs(by), Math.abs(cy), 1);
  if (Math.abs(d) < 1e-9 * scale * scale) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const O = {
    z: P1.z + (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d,
    x: P1.x + (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d,
  };
  const R = Math.hypot(P1.z - O.z, P1.x - O.x);
  const cross = bx * (cy - by) - by * (cx - bx);
  const ccw = cross > 0;
  const sweep = sweepDeg(O, P1, P3, ccw);
  return { O, R, ccw, sweep, length: R * sweep / DEG };
}

/** Úhel, který oblouk S → E opíše kolem středu O v daném smyslu [°] (0–360). */
function sweepDeg(O, S, E, ccw) {
  const a1 = Math.atan2(S.x - O.x, S.z - O.z), a2 = Math.atan2(E.x - O.x, E.z - O.z);
  let s = (ccw ? a2 - a1 : a1 - a2) * DEG;
  s = ((s % 360) + 360) % 360;
  return s;
}

/**
 * Střed oblouku ze startu S, konce E, rádiusu R, smyslu a velikosti oblouku.
 * @param {boolean} ccw  proti směru hodin v rovině Z–X
 * @param {boolean} large  oblouk přes 180° (v G-kódu záporné R)
 * @returns {{O:{z,x}, I:number, K:number, sweep:number, length:number, chord:number}|null}
 *   I – přírůstek středu ve směru X (poloměr), K – ve směru Z (od startu)
 *   null = R je menší než polovina tětivy, nebo S = E
 */
export function arcFromEndsRadius(S, E, R, ccw, large) {
  const dz = E.z - S.z, dx = E.x - S.x;
  const chord = Math.hypot(dz, dx);
  if (!(chord > 1e-9) || !(R > 0)) return null;
  if (chord > 2 * R * (1 + 1e-9)) return null;
  const h = Math.sqrt(Math.max(R * R - chord * chord / 4, 0));
  const nz = -dx / chord, nx = dz / chord;                          // levá normála S → E
  const side = (ccw ? 1 : -1) * (large ? -1 : 1);
  const O = { z: (S.z + E.z) / 2 + nz * h * side, x: (S.x + E.x) / 2 + nx * h * side };
  const sweep = sweepDeg(O, S, E, ccw);
  return { O, I: O.x - S.x, K: O.z - S.z, sweep, length: R * sweep / DEG, chord };
}

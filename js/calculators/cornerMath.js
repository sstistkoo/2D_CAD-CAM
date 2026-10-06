// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Zaoblení a sražení obecného rohu (čistý výpočet)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Roh C mezi úsekem P1 → C a C → P2 (libovolné úhly – kužel/válec/čelo).
// Body {z, x}: z = osa, x = POLOMĚR (Ø/2) – úhly a rádius jsou skutečné.
//   δ = úhel otočení směru (0 = rovně), vnitřní úhel rohu = 180° − δ
//   rádius R: tečné body ve vzdálenosti t = R·tan(δ/2) od rohu, střed na
//             normále k 1. úseku ve vzdálenosti R (na vnitřní straně otočení)
//   sražení c: body ve vzdálenosti c od rohu po obou úsecích (stejné odvěsny)

const sub = (a, b) => ({ z: a.z - b.z, x: a.x - b.x });
const len = (v) => Math.hypot(v.z, v.x);

/** Směry obou úseků a otočení. @returns {{d1, d2, turn:number, left:boolean, L1:number, L2:number}|null} */
export function cornerDirections(P1, C, P2) {
  const v1 = sub(C, P1), v2 = sub(P2, C);
  const L1 = len(v1), L2 = len(v2);
  if (!(L1 > 1e-9) || !(L2 > 1e-9)) return null;
  const d1 = { z: v1.z / L1, x: v1.x / L1 }, d2 = { z: v2.z / L2, x: v2.x / L2 };
  const cross = d1.z * d2.x - d1.x * d2.z, dot = d1.z * d2.z + d1.x * d2.x;
  const turn = Math.atan2(Math.abs(cross), dot);
  if (turn < 1e-6 || turn > Math.PI - 1e-6) return null;     // rovně nebo obrat zpět – není roh
  return { d1, d2, turn, left: cross > 0, L1, L2 };
}

/**
 * Zaoblení rohu rádiusem R.
 * @returns {{T1, T2, O, t:number, inner:number, ccw:boolean, fits1:boolean, fits2:boolean}|null}
 *   T1/T2 – tečné body na 1./2. úseku, O – střed, t – vzdálenost tečných bodů
 *   od rohu, inner – vnitřní úhel rohu [°], ccw – oblouk proti směru hodin v rovině Z–X
 */
export function cornerFillet(P1, C, P2, R) {
  const k = cornerDirections(P1, C, P2);
  if (!k || !(R > 0)) return null;
  const t = R * Math.tan(k.turn / 2);
  const T1 = { z: C.z - k.d1.z * t, x: C.x - k.d1.x * t };
  const T2 = { z: C.z + k.d2.z * t, x: C.x + k.d2.x * t };
  const n = k.left ? { z: -k.d1.x, x: k.d1.z } : { z: k.d1.x, x: -k.d1.z };
  const O = { z: T1.z + n.z * R, x: T1.x + n.x * R };
  return {
    T1, T2, O, t,
    inner: 180 - k.turn * 180 / Math.PI,
    ccw: k.left,
    fits1: t <= k.L1 + 1e-9, fits2: t <= k.L2 + 1e-9,
  };
}

/**
 * Sražení rohu se stejnými odvěsnami c (podél obou úseků).
 * @returns {{A, B, width:number, inner:number, fits1:boolean, fits2:boolean}|null}
 *   width – délka sražení (spojnice A–B)
 */
export function cornerChamfer(P1, C, P2, c) {
  const k = cornerDirections(P1, C, P2);
  if (!k || !(c > 0)) return null;
  const A = { z: C.z - k.d1.z * c, x: C.x - k.d1.x * c };
  const B = { z: C.z + k.d2.z * c, x: C.x + k.d2.x * c };
  return {
    A, B, width: len(sub(B, A)),
    inner: 180 - k.turn * 180 / Math.PI,
    fits1: c <= k.L1 + 1e-9, fits2: c <= k.L2 + 1e-9,
  };
}

/** Bod ve vzdálenosti L ve směru úhlu φ [°] (0 = +Z, 90 = +X). */
export function pointAtAngle(C, phiDeg, L) {
  const a = phiDeg * Math.PI / 180;
  return { z: C.z + L * Math.cos(a), x: C.x + L * Math.sin(a) };
}

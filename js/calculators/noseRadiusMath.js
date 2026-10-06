// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Korekce na rádius špičky nože (bez G41/G42)         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Bez korekce rádiusu řídicí systém vede TEORETICKOU ŠPIČKU P – průsečík
// tečen k rádiusu rε rovnoběžných s osami. Na válci a čele to nevadí, na
// sražení, kuželu a rádiusu ale nůž obrys podřízne nebo nechá materiál.
//
// Souřadnice (z, x): z = osa vřetene, x = POLOMĚR (průměr = 2x). Nůž obrábí
// ke sklíčidlu (−Z): P = střed rádiusu + rε·q, q = (−1, −1) vnější nůž,
// q = (−1, +1) vnitřní (vyvrtávací) nůž. n = jednotková normála obrysu
// směrem od materiálu; správná dráha P je obrys posunutý o δ·n, kde
// δ = rε·(1 + q·n). δ < 0 → bez korekce zůstane materiál, δ > 0 → podřízne.

function toolQ(internal) { return { z: -1, x: internal ? 1 : -1 }; }

/**
 * Korekce přímého úseku (sražení, kužel) skloněného o α od osy Z.
 * reverse = false: sklon, který nůž bere špičkou – vnější: Ø roste ke
 *   sklíčidlu (sražení na konci hřídele); vnitřní: Ø klesá ke sklíčidlu
 *   (sražení na vstupu díry).
 * reverse = true: opačný sklon (zpětný kužel).
 * @param {number} r - rádius špičky rε [mm]
 * @param {number} alphaDeg - úhel od osy Z, (0, 90)
 * @returns {{dz:number, dx:number, delta:number, n:{z:number,x:number}}|null}
 *   dz – posun bodů ležících na válci v ose Z; dx – posun bodů ležících na
 *   čele v ose X (POLOMĚR, na průměr 2·dx); delta – kolmá odchylka dráhy P.
 */
export function lineCorrection(r, alphaDeg, { internal = false, reverse = false } = {}) {
  if (!(r >= 0) || !(alphaDeg > 0 && alphaDeg < 90)) return null;
  const a = alphaDeg * Math.PI / 180;
  const n = { z: (reverse ? -1 : 1) * Math.sin(a), x: (internal ? -1 : 1) * Math.cos(a) };
  const q = toolQ(internal);
  const delta = r * (1 + q.z * n.z + q.x * n.x);
  return { dz: delta / n.z, dx: delta / n.x, delta, n };
}

/**
 * Programované body sražení hrany (vnější: konec hřídele Ø D, vnitřní: vstup díry Ø D).
 * @param {number} c - délka sražení v ose Z
 * @param {number} zFace - Z čela
 * @returns {{contour, prog, corr}|null} body {z, d} – d je PRŮMĚR; a = na čele, b = na válci
 */
export function chamferPoints(r, alphaDeg, D, c, zFace = 0, internal = false) {
  const corr = lineCorrection(r, alphaDeg, { internal });
  if (!corr || !(D > 0) || !(c > 0)) return null;
  const sx = internal ? -1 : 1;
  const dA = D - sx * 2 * c * Math.tan(alphaDeg * Math.PI / 180);
  if (!(dA >= 0)) return null;                       // sražení větší než poloměr
  return {
    corr,
    contour: { a: { z: zFace, d: dA }, b: { z: zFace - c, d: D } },
    prog: { a: { z: zFace, d: dA + 2 * corr.dx }, b: { z: zFace - c + corr.dz, d: D } },
  };
}

/**
 * Rádius 90° mezi čelem (kolmo na osu) a válcem.
 * concave = false: vypouklý – zaoblení hrany čela a válce Ø D (z0 = Z čela).
 * concave = true: vydutý – rádius v osazení; Ø D = válec (díra) u osazení,
 *   z0 = Z čela osazení, které je obrácené k +Z.
 * Programovaný rádius: vypouklý R + rε, vydutý R − rε (vydutý vyžaduje R ≥ rε).
 * @returns {{Rp:number, contour, prog}|null} body {z, d} (d = PRŮMĚR), center {z, d}
 */
export function arcCorrection(r, R, D, z0 = 0, { internal = false, concave = false } = {}) {
  if (!(r >= 0) || !(R > 0) || !(D > 0)) return null;
  const sx = internal ? -1 : 1;
  if (!concave) {
    const Rp = R + r;
    return {
      Rp,
      contour: { face: { z: z0, d: D - sx * 2 * R }, cyl: { z: z0 - R, d: D }, center: { z: z0 - R, d: D - sx * 2 * R } },
      prog: { face: { z: z0, d: D - sx * 2 * Rp }, cyl: { z: z0 - Rp, d: D }, center: { z: z0 - Rp, d: D - sx * 2 * Rp } },
    };
  }
  if (R < r) return null;
  const Rp = R - r;
  return {
    Rp,
    contour: { cyl: { z: z0 + R, d: D }, face: { z: z0, d: D + sx * 2 * R }, center: { z: z0 + R, d: D + sx * 2 * R } },
    prog: { cyl: { z: z0 + Rp, d: D }, face: { z: z0, d: D + sx * 2 * Rp }, center: { z: z0 + Rp, d: D + sx * 2 * Rp } },
  };
}

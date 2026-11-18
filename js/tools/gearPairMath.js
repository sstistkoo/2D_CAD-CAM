// ╔══════════════════════════════════════════════════════════════╗
// ║  Gear pair math – výpočet osové vzdálenosti a fáze         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čistá JS matematika bez DOM/canvas závislostí – testovatelné v Node.

/**
 * Spočítá pozici středu druhého kola a fázovou rotaci tak, aby zuby
 * zabíraly. Předpokládá, že generátor umisťuje první zub centrovaný
 * na lokálním úhlu 0 (relativně ke středu kola).
 *
 * Geometrie zabírání:
 *   - Bod kontaktu na spojnici středů na valivých kružnicích (bez korekcí
 *     roztečné, a = m·(z1+z2)/2; s korekcemi provozní a_w, viz níž).
 *   - Kolo 1 má v bodě kontaktu zub (úhel 0 + orientation).
 *   - Kolo 2 musí mít v bodě kontaktu mezeru (centrovanou na úhlu π
 *     v jeho lokálním systému, protože bod kontaktu je v −X směru od
 *     středu kola 2).
 *   - Mezery kola 2 jsou na úhlech π·(2k+1)/z2:
 *       - liché z2 → mezera přirozeně na π (rotace 0)
 *       - sudé z2 → posun o π/z2
 *
 * Osová vzdálenost je provozní a_w (s korekcemi x1, x2 bez vůle v boku),
 * tipShorten = zkrácení hlavy obou kol k·m, aby zůstala hlavová vůle 0,25·m.
 * @param {{m:number, z1:number, z2:number, orientation?:number, alpha?:number, x1?:number, x2?:number}} params
 * @param {number} cx1
 * @param {number} cy1
 * @returns {{axis:number, cx2:number, cy2:number, rotation2:number, tipShorten:number}}
 */
export function computeGearPairLayout(params, cx1, cy1) {
  const { m, z1, z2 } = params;
  const orientation = params.orientation || 0;
  const axis = operatingCenterDistance(m, z1, z2, params.alpha, params.x1, params.x2);
  const tipShorten = tipShortening(m, z1, z2, params.alpha, params.x1, params.x2);
  const orientRad = orientation * Math.PI / 180;
  const cx2 = cx1 + axis * Math.cos(orientRad);
  const cy2 = cy1 + axis * Math.sin(orientRad);

  const phaseRot = (z2 % 2 === 0) ? Math.PI / z2 : 0;
  const rotation2 = phaseRot + orientRad;

  return { axis, cx2, cy2, rotation2, tipShorten };
}

const invol = (phi) => Math.tan(phi) - phi;

/**
 * Provozní úhel záběru α_w soukolí s korekcemi (ISO 21771 / ČSN 01 4686):
 *   inv α_w = inv α + 2·tg α·(x1+x2)/(z1+z2).
 * @returns {number} α_w [rad]
 */
export function operatingPressureAngle(z1, z2, alphaDeg = 20, x1 = 0, x2 = 0) {
  const al = (Number(alphaDeg) || 20) * Math.PI / 180;
  const xs = (Number(x1) || 0) + (Number(x2) || 0);
  if (Math.abs(xs) < 1e-12) return al;
  const target = invol(al) + 2 * Math.tan(al) * xs / (z1 + z2);
  if (!(target > 0)) return al;                       // nesmyslná záporná korekce
  let lo = 1e-6, hi = 80 * Math.PI / 180;             // inv φ je rostoucí → půlení
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (invol(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Osová vzdálenost soukolí bez vůle v boku: a_w = a·cos α / cos α_w.
 * Bez korekcí a = m·(z1+z2)/2. Dřív se kreslilo vždy v a – s x1+x2 > 0 se
 * zuby překrývaly, s x1+x2 < 0 měly vůli (uživatel 18. 11. 2026: „oprav to
 * a zpřesni to").
 */
export function operatingCenterDistance(m, z1, z2, alphaDeg = 20, x1 = 0, x2 = 0) {
  const a = m * (z1 + z2) / 2;
  const al = (Number(alphaDeg) || 20) * Math.PI / 180;
  const aw = operatingPressureAngle(z1, z2, alphaDeg, x1, x2);
  return aw === al ? a : a * Math.cos(al) / Math.cos(aw);
}

/**
 * Zkrácení hlavy k·m [mm]: v a_w je hlavová vůle a_w − r_a1 − r_f2 menší než
 * 0,25·m o (a + (x1+x2)·m − a_w). Hlava obou kol se zkrátí právě o tolik
 * (k = x1 + x2 − y, y = (a_w − a)/m), jinak by hlava narazila do dna.
 */
export function tipShortening(m, z1, z2, alphaDeg = 20, x1 = 0, x2 = 0) {
  const xs = (Number(x1) || 0) + (Number(x2) || 0);
  const k = m * xs - (operatingCenterDistance(m, z1, z2, alphaDeg, x1, x2) - m * (z1 + z2) / 2);
  return k > 1e-9 ? k : 0;
}

/**
 * Rotuje vrcholy polylinu okolo bodu (px, py) o úhel angle (radiány).
 * Bulges zůstávají beze změny (geometrie oblouků se nemění).
 *
 * @param {{vertices:{x:number,y:number}[], bulges:number[]}} profile
 * @param {number} px
 * @param {number} py
 * @param {number} angle
 */
export function rotateProfile(profile, px, py, angle) {
  if (!angle) return profile;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const vertices = profile.vertices.map(v => {
    const dx = v.x - px, dy = v.y - py;
    return { x: px + dx * cosA - dy * sinA, y: py + dx * sinA + dy * cosA };
  });
  return { vertices, bulges: profile.bulges };
}

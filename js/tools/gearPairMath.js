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
 *   - Bod kontaktu na spojnici středů ve vzdálenosti r_pitch1 od kola 1,
 *     r_pitch2 od kola 2 (a = m·(z1+z2)/2 = r1 + r2).
 *   - Kolo 1 má v bodě kontaktu zub (úhel 0 + orientation).
 *   - Kolo 2 musí mít v bodě kontaktu mezeru (centrovanou na úhlu π
 *     v jeho lokálním systému, protože bod kontaktu je v −X směru od
 *     středu kola 2).
 *   - Mezery kola 2 jsou na úhlech π·(2k+1)/z2:
 *       - liché z2 → mezera přirozeně na π (rotace 0)
 *       - sudé z2 → posun o π/z2
 *
 * @param {{m:number, z1:number, z2:number, orientation?:number}} params
 * @param {number} cx1
 * @param {number} cy1
 * @returns {{axis:number, cx2:number, cy2:number, rotation2:number}}
 */
export function computeGearPairLayout(params, cx1, cy1) {
  const { m, z1, z2 } = params;
  const orientation = params.orientation || 0;
  const axis = m * (z1 + z2) / 2;
  const orientRad = orientation * Math.PI / 180;
  const cx2 = cx1 + axis * Math.cos(orientRad);
  const cy2 = cy1 + axis * Math.sin(orientRad);

  const phaseRot = (z2 % 2 === 0) ? Math.PI / z2 : 0;
  const rotation2 = phaseRot + orientRad;

  return { axis, cx2, cy2, rotation2 };
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

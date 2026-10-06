// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díry na roztečné kružnici (čistý výpočet)           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díra i leží na úhlu θi = θ0 ± i·Δθ (± podle směru), souřadnice
// X = Xs + R·cos θi, Y = Ys + R·sin θi, R = rozteč / 2. Pro soustruh s osou C
// (vrtání do čela) se programuje X = roztečný průměr a C = θi.

/** Úhel do rozsahu [0, 360). */
export function normAngle(deg) {
  const a = deg % 360;
  const r = a < 0 ? a + 360 : a;
  return Math.abs(r - 360) < 1e-9 ? 0 : r;
}

/**
 * @param {{count:number, pcd:number, start?:number, pitch?:number|null,
 *   cx?:number, cy?:number, cw?:boolean}} p
 *   pitch – úhlová rozteč [°]; null = celý kruh (360/count)
 * @returns {{holes:{i:number, angle:number, c:number, x:number, y:number}[],
 *   pitch:number, chord:number, span:number}|null}
 *   chord – vzdálenost středů sousedních děr, span – úhel mezi první a poslední
 */
export function boltCircle({ count, pcd, start = 0, pitch = null, cx = 0, cy = 0, cw = false }) {
  if (!Number.isInteger(count) || count < 1 || count > 720 || !(pcd > 0)) return null;
  const step = pitch == null ? 360 / count : pitch;
  if (!(step > 0) || !Number.isFinite(start) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const R = pcd / 2, dir = cw ? -1 : 1;
  const holes = [];
  for (let i = 0; i < count; i++) {
    const angle = start + dir * i * step;
    const t = angle * Math.PI / 180;
    const x = cx + R * Math.cos(t), y = cy + R * Math.sin(t);
    holes.push({ i: i + 1, angle, c: normAngle(angle), x: Math.abs(x) < 1e-12 ? 0 : x, y: Math.abs(y) < 1e-12 ? 0 : y });
  }
  return {
    holes,
    pitch: step,
    chord: count > 1 ? 2 * R * Math.sin(Math.min(step, 360) * Math.PI / 360) : 0,
    span: step * (count - 1),
  };
}

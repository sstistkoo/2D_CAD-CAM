// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díry v řadě a v mřížce (čistý výpočet)              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Řada: počet n od bodu (X0, Y0), buď s roztečí a úhlem, nebo do koncového bodu.
// Mřížka: nx × ny děr s roztečemi px, py, natočená o θ kolem bodu (X0, Y0);
// pořadí po řádcích, nebo meandrem (každý druhý řádek opačně → kratší pojezdy).
// Úhel 0° = kladná osa X, kladný směr proti hodinám.

const RAD = Math.PI / 180;

/**
 * @param {{count:number, x0?:number, y0?:number, pitch?:number|null, angle?:number, x1?:number|null, y1?:number|null}} p
 *   pitch + angle, nebo koncový bod (x1, y1) – pak se rozteč dopočítá (count ≥ 2)
 * @returns {{holes:{i:number,x:number,y:number}[], pitch:number, length:number, angle:number}|null}
 */
export function rowHoles({ count, x0 = 0, y0 = 0, pitch = null, angle = 0, x1 = null, y1 = null }) {
  if (!Number.isInteger(count) || count < 1 || count > 2000) return null;
  let step, ang = angle;
  if (x1 !== null && y1 !== null) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (count < 2 || !(L > 1e-12)) return null;
    step = L / (count - 1);
    ang = Math.atan2(dy, dx) / RAD;
  } else {
    if (pitch === null || !(pitch > 0)) return null;
    step = pitch;
  }
  const c = Math.cos(ang * RAD), s = Math.sin(ang * RAD);
  const holes = [];
  for (let i = 0; i < count; i++) holes.push({ i: i + 1, x: x0 + i * step * c, y: y0 + i * step * s });
  return { holes, pitch: step, length: step * (count - 1), angle: ang };
}

/**
 * @param {{nx:number, ny:number, px:number, py:number, x0?:number, y0?:number, angle?:number, meander?:boolean}} p
 * @returns {{holes:{i:number,col:number,row:number,x:number,y:number}[], width:number, height:number}|null}
 *   col/row jsou od 1; width/height = rozměr mřížky mezi krajními středy děr
 */
export function gridHoles({ nx, ny, px, py, x0 = 0, y0 = 0, angle = 0, meander = false }) {
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1 || nx * ny > 5000) return null;
  if ((nx > 1 && !(px > 0)) || (ny > 1 && !(py > 0))) return null;
  const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD);
  const holes = [];
  for (let r = 0; r < ny; r++) {
    for (let k = 0; k < nx; k++) {
      const col = meander && r % 2 ? nx - 1 - k : k;
      const u = col * (px || 0), v = r * (py || 0);
      holes.push({ i: holes.length + 1, col: col + 1, row: r + 1, x: x0 + u * c - v * s, y: y0 + u * s + v * c });
    }
  }
  return { holes, width: (nx - 1) * (px || 0), height: (ny - 1) * (py || 0) };
}

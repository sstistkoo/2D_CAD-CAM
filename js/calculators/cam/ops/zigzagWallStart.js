// ╔══════════════════════════════════════════════════════════════╗
// ║  CIK CAK — vrstva u čela na straně začátku jede až ke stěně    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 5. 11. 2026 (karusel Od středu, díl (9)): „mám to cik cak, mělo by
// to jezdit až k čelům tam a nazpět" — u šikmé stěny S12–S13 vjížděla každá
// vrstva rampou z čáry zanoření (X96 → X120), takže mezi stěnou a rampami
// zůstal klín. Pod ním pak cik cak po dně narážel držákem.
//
// U Cik cak se proto vjezd vrstvy, která začíná na čáře zanoření od stěny
// na straně začátku obrábění, posune KE STĚNĚ: mělčí vrstva u stěny skončila
// (začíná tam), odtud rampa pod úhlem zanoření o ap níž a vrstva pokračuje
// jako dřív. U stěny zůstanou jen schody po ap — dojede je jízda po stěně
// (Hrub. bez schodků). Rozšíření pravidla 20 (cik cak od stěny ke stěně).
//
// Pracuje v prostoru středu nosu, jízda −Z (zleva je svět zrcadlený), strana
// začátku = vyšší z. Stěna se hledá jen v rozsahu úseku (pravidlo 11).

import { wallFinders } from './zigzagFloor.js';

const EPS = 0.05;

/**
 * @param {object} o { passes, start, raw, step, tanA, zHi }
 *   raw — hrubovací offset bez čar zanoření; zHi — začátek rozsahu úseku
 * @returns {number} počet posunutých vjezdů
 */
export function zigzagWallStart({ passes, start = 0, raw, step, tanA, zHi = Infinity }) {
  if (!Array.isArray(passes) || !raw || !(step > 0) || !(tanA > 0)) return 0;
  const W = wallFinders(raw);
  const reach = 4 * step / Math.max(tanA, 0.2) + 2;
  // Shora dolů: posunutý vjezd mělčí vrstvy je pak „začátek u stěny" pro další.
  const order = [];
  for (let i = start; i < passes.length; i++) {
    const p = passes[i];
    if (p && p.type === 'long' && Number.isFinite(p.x) && p.zStart > p.zEnd + 0.5) order.push(p);
  }
  order.sort((a, b) => b.x - a.x);
  let moved = 0;
  for (const p of order) {
    const li = Array.isArray(p.contourLeadIn) && p.contourLeadIn.length === 1 ? p.contourLeadIn[0] : null;
    if (!li || li.type !== 'line' || p.ramp) continue;
    const dx = li.x1 - li.x2, dz = li.z1 - li.z2;
    // Rampa dolů pod úhlem zanoření směrem od stěny (z čáry zanoření).
    if (!(dx > EPS) || !(dz > EPS) || Math.abs(dz / dx - 1 / tanA) > 0.02 * Math.max(1 / tanA, 1)) continue;
    const zLim = Math.min(li.z1 + reach, zHi);
    const wall = W.wallRight(li.x1, li.z1, zLim);
    if (wall === null || wall - li.z1 <= 1) continue;
    // Mělčí vrstva na výšce začátku rampy dojela ke stěně (začíná u ní).
    const above = order.some((q) => q !== p && Math.abs(q.x - li.x1) < EPS && q.zStart >= wall - 1.5);
    if (!above) continue;
    const zr = wall - dx / tanA;
    if (!(zr > p.zStart + EPS) || zr <= p.zEnd + 0.5) continue;
    // Rampa nesmí podříznout offset (stěna pozvolnější než úhel zanoření).
    let gouge = false;
    for (let k = 1; k < 16 && !gouge; k++) {
      const t = k / 16, x = li.x1 - dx * t, z = wall - (wall - zr) * t;
      if (W.fR(z) > x + 0.02) gouge = true;
    }
    if (gouge) continue;
    p.contourLeadIn = [{ ...li, z1: wall, z2: zr }];
    p.zStart = zr;
    p.wallStart = true;
    moved += 1;
  }
  return moved;
}

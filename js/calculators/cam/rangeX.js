// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – rozsah obrábění X (📐): meze a strop X max              ║
// ╚══════════════════════════════════════════════════════════════╝
// Každá mez má vlastní přepínač (`minActive` / `maxActive`), aby šla vypnout
// bez mazání hodnoty. Starší projekty mají jen společné `active` — pro ně
// platí to.
//
// PRAVIDLO 12 (docs/cam-pravidla.md): nad X max se neobrábí a materiálu,
// který nad X max stojí, se nástroj nedotkne. Obrábí se proto jen od volného
// konce (+Z; zleva se počítá v Z-zrcadle, takže i tam je to +Z) po místo,
// kde polotovar poprvé vyleze nad X max — dál by se pod ten materiál muselo
// podjet (podélně) nebo jím projet shora (čelně).

import { stockOuterXAtZ } from './camMath.js';

/** Materiál nad X max o méně než tohle se nepočítá (numerický šum, zbytek předchozí operace na mezi). */
export const XMAX_WALL_TOL = 0.05;

/** Je mez zapnutá? `which` = 'min' | 'max'. */
export function xBoundOn(xl, which) {
  if (!xl) return false;
  const flag = which === 'min' ? xl.minActive : xl.maxActive;
  return typeof flag === 'boolean' ? flag : !!xl.active;
}

/** Hodnota zapnuté meze, jinak null. */
export function xBoundValue(xl, which) {
  if (!xBoundOn(xl, which)) return null;
  const v = which === 'min' ? xl.rangeXMin : xl.rangeXMax;
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** Platí aspoň jedna mez (čip „X", kreslení, tahání čar). */
export function xRangeAnyOn(xl) {
  return xBoundOn(xl, 'min') || xBoundOn(xl, 'max');
}

/**
 * Pás poloměrů pro generování drah: { xLo, xHi }, chybějící mez = ±∞;
 * null = rozsah X neplatí. Obě meze naráz se srovnají (min/max), aby
 * přetažení čar přes sebe na plátně nic nerozbilo.
 */
export function resolveRangeX(xl) {
  const lo = xBoundValue(xl, 'min'), hi = xBoundValue(xl, 'max');
  if (lo === null && hi === null) return null;
  if (lo !== null && hi !== null) return { xLo: Math.min(lo, hi), xHi: Math.max(lo, hi) };
  return { xLo: lo ?? -Infinity, xHi: hi ?? Infinity };
}

/**
 * Stěna materiálu nad X max: první Z od volného konce (+Z) směrem k −Z,
 * kde vrch polotovaru přesáhne `xHi`. Hledá se jen v [zLo, zHi].
 *
 * @returns {{ zWall: number, empty: boolean } | null}
 *   null  = polotovar v celém rozsahu leží pod X max (nic se neomezuje);
 *   empty = nad X max stojí polotovar už na volném konci → nic k obrábění.
 */
export function xMaxWallZ(prms, sRad, stockPathSegments, xHi, zLo = -Infinity, zHi = Infinity) {
  const lim = xHi + XMAX_WALL_TOL;
  const segs = (stockPathSegments || []).filter(s => !s.isDegenerate);
  // Tyč: vrch je všude poloměr polotovaru.
  if (prms.stockMode !== 'casting' || segs.length === 0)
    return sRad > lim ? { zWall: Infinity, empty: true } : null;

  // Zlomy vrchu polotovaru: konce segmentů a u oblouků i střed a krajní Z.
  // Mezi dvěma sousedními zlomy leží vrch na jediném segmentu (hranice
  // polotovaru se nekříží) a je monotónní, takže stačí hlídat konce intervalu.
  const cand = [];
  for (const s of segs) {
    if (s.type === 'line') cand.push(s.p1.z, s.p2.z);
    else cand.push(s.cz - s.r, s.cz, s.cz + s.r, s.cz + s.r * Math.cos(s.startAngle), s.cz + s.r * Math.cos(s.endAngle));
  }
  const zMaxStock = Math.max(...cand), zMinStock = Math.min(...cand);
  const zStart = Math.min(zHi, zMaxStock), zEnd = Math.max(zLo, zMinStock);
  if (!(zStart > zEnd)) return null;
  const zs = [...new Set([zStart, zEnd, ...cand.filter(z => z < zStart && z > zEnd)])].sort((a, b) => b - a);

  const eps = 1e-6;
  const top = (z) => stockOuterXAtZ(prms, sRad, segs, z) ?? -Infinity;
  for (let i = 0; i + 1 < zs.length; i++) {
    const a = zs[i], b = zs[i + 1];          // a > b, jde se od volného konce
    if (a - b < 2 * eps) continue;
    if (top(a - eps) > lim) return { zWall: a, empty: a >= zStart };
    if (top(b + eps) > lim) {
      let ok = a - eps, bad = b + eps;       // top(ok) ≤ lim < top(bad)
      for (let k = 0; k < 60 && ok - bad > 1e-7; k++) {
        const m = (ok + bad) / 2;
        if (top(m) > lim) bad = m; else ok = m;
      }
      return { zWall: ok, empty: false };
    }
  }
  return null;
}

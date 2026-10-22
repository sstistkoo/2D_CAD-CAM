// Simulace zápichu v díře (Upich + ◎ Vnitřní, ops/grooveInner.js).
//
// Emise jede ve skutečných souřadnicích a nástroj je v modelech světa
// obrácený radiálně (cam/toolRadialFlip.js). Zbývá polotovar: v programu
// po částech už díru má (obrobený polotovar z předchozí části), samostatná
// část ji ale nemá — tyč by v simulaci „vrtala" plný materiál a validátor by
// hlásil rychloposuvy v materiálu. Proto se díra (z vyvrtávání / předvrtání /
// ručního ⌀) z polotovaru odečte; když už v něm je, odečtení nic nezmění.
import { radialFlip } from '../toolRadialFlip.js';
import { buildStockLoopRaw } from '../materialRemoval.js';
import { boreGeom, boreHoleLoop } from '../ops/bore.js';
import { boreChainFromState } from '../boreContour.js';
import { polyDifference, polyArea } from '../../../geom/geomCore.js';

const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

/** Obrys díry pro zápich (skutečné souřadnice, od osy), nebo null. */
export function grooveHoleLoop(S) {
  const p = S.params;
  const src = p.boreSource === 'cad' ? boreChainFromState(S) : null;
  const g = boreGeom(p, src ? src.segs : null);
  if (g.chain) return boreHoleLoop(g);
  const manual = num(p.grooveHoleD) / 2;
  const r = manual > 0 ? manual : g.D > 0 ? g.D / 2 : g.d0 / 2;
  if (!(r > 0)) return null;
  // Hloubka: díra / předvrtání; ruční ⌀ aspoň za druhý bok zápichu + 2 mm.
  const zB = num(p.partOffZ) - g.s * Math.max(0, num(p.grooveWidth));
  const reach = g.s * (g.zF - zB) + 2;
  const L = manual > 0 ? Math.max(reach, g.L || 0, g.L0 || 0) : g.D > 0 ? g.L : g.L0;
  if (!(L > 0)) return null;
  // Od osy kousek před ústí (polotovar může přečnívat čelo), do hloubky L.
  const zOut = g.zF + g.s * 50;
  return [{ x: -1, z: zOut }, { x: r, z: zOut }, { x: r, z: g.zF - g.s * L }, { x: -1, z: g.zF - g.s * L }];
}

/**
 * Argumenty (params, segmenty polotovaru) pro modely úběru / validátor.
 * Mimo zápich v díře beze změny; jinak polotovar MÍNUS díra jako odlitek.
 * @returns {[Object, Array]}
 */
export function simStockArgs(S, calc, segs = calc && calc.stockPathSegments) {
  if (!radialFlip(S.params)) return [S.params, segs];
  try {
    const stock = buildStockLoopRaw(S.params, segs);
    const hole = grooveHoleLoop(S);
    if (!stock || !hole) return [S.params, segs];
    const rest = polyDifference([stock], [hole]);
    const big = rest.slice().sort((a, b) => Math.abs(polyArea([b])) - Math.abs(polyArea([a])))[0];
    if (!big || big.length < 3) return [S.params, segs];
    // Odlitek je otevřený profil, který buildStockLoopRaw uzavře k ose X=0:
    // smyčku proto začít a skončit na hraně v ose (za dnem díry). Bez ní
    // (díra skrz celý polotovar) se profil zapsat nedá — polotovar beze změny.
    const n = big.length, onAxis = (q) => Math.abs(q.x) < 1e-4;
    const i = big.findIndex((q, k) => onAxis(q) && onAxis(big[(k + 1) % n]));
    if (i < 0) return [S.params, segs];
    const ring = [...big.slice(i + 1), ...big.slice(0, i + 1)];
    const out = ring.slice(0, -1).map((q, k) => ({ type: 'line', p1: q, p2: ring[k + 1] }));
    return [{ ...S.params, stockMode: 'casting' }, out];
  } catch {
    return [S.params, segs];
  }
}

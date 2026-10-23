// Simulace zápichu v díře (Upich + ◎ Vnitřní, ops/grooveInner.js)
// a vnitřního závitu (Závit + ◎ Vnitřní, ops/thread.js).
//
// Emise jede ve skutečných souřadnicích a nástroj je v modelech světa
// obrácený radiálně (cam/toolRadialFlip.js). Zbývá polotovar: v programu
// po částech už díru má (obrobený polotovar z předchozí části), samostatná
// část ji ale nemá — tyč by v simulaci „vrtala" plný materiál a validátor by
// hlásil rychloposuvy v materiálu. Proto se díra (z vyvrtávání / předvrtání /
// ručního ⌀) z polotovaru odečte; když už v něm je, odečtení nic nezmění.
import { radialFlip, threadInnerActive, grooveInnerActive, toolReachAlongZ } from '../toolRadialFlip.js';
import { grooveInnerGeom } from '../ops/grooveInner.js';
import { chainWithoutGrooves } from './grooveCad.js';
import { buildStockLoopRaw, toolFootprint } from '../materialRemoval.js';
import { holderWorldLoop } from '../collisionValidator.js';
import { boreGeom, boreHoleLoop } from '../ops/bore.js';
import { boreChainFromState } from '../boreContour.js';
import { polyDifference, polyArea } from '../../../geom/geomCore.js';
import { stockHoleRadiusAt } from '../stockHole.js';

const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

/** Díra vnitřního závitu: předvrtání ⌀(D − 2H) od ústí za konec závitu
 *  (i s výběhem) + kam nástroj sahá za špičku (destička IR je široká) + 2 mm,
 *  nebo hlouběji, sahá-li tam předvrtání/vyvrtávání. Hloubku skutečné díry
 *  závit nezná — u slepé díry ji hlídá uživatel. */
function threadHoleLoop(p) {
  const H = num(p.threadDepth);
  const r = num(p.threadDiameter) / 2 - H;
  if (!(r > 0)) return null;
  const zS = num(p.threadZStart);
  const zE = Number.isFinite(parseFloat(p.threadZEnd)) ? parseFloat(p.threadZEnd) : zS - 10;
  const dir = zE < zS ? -1 : 1;                       // směr řezu = do díry
  const reach = toolReachAlongZ([holderWorldLoop(p, p.roughingSide === 'left'), toolFootprint(p)], dir);
  const zIn = zE + dir * (Math.max(0, num(p.threadRunOut)) + reach + 2);
  const g = boreGeom(p, null);
  const zDeep = g.s === -dir && (g.L0 > 0 || g.L > 0) ? g.zF - g.s * Math.max(g.L0 || 0, g.L || 0) : zIn;
  const zEnd = dir < 0 ? Math.min(zIn, zDeep) : Math.max(zIn, zDeep);
  const zOut = zS - dir * 50;
  return [{ x: -1, z: zOut }, { x: r, z: zOut }, { x: r, z: zEnd }, { x: -1, z: zEnd }];
}

/** Obrys díry pro zápich / vnitřní závit (skutečné souřadnice, od osy), nebo null. */
export function grooveHoleLoop(S) {
  const p = S.params;
  if (threadInnerActive(p)) return threadHoleLoop(p);
  const src = p.boreSource === 'cad' ? boreChainFromState(S) : null;
  const g = boreGeom(p, src ? src.segs : null);
  // Nakreslený zápich v polotovaru ještě není — stěna díry místo něj.
  if (g.chain) return boreHoleLoop({ ...g, chain: chainWithoutGrooves(g.chain) });
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

/** Z, kde se zjišťuje, jestli polotovar díru už má: kousek za bokem
 *  zápichu u ústí, u závitu prostředek závitu. */
function holeProbeZ(p) {
  if (threadInnerActive(p)) {
    const zS = num(p.threadZStart);
    const zE = Number.isFinite(parseFloat(p.threadZEnd)) ? parseFloat(p.threadZEnd) : zS - 10;
    return (zS + zE) / 2;
  }
  const s = p.roughingSide === 'left' ? -1 : 1;
  return num(p.partOffZ) - s * 0.1;
}

/**
 * ⌀ díry pro výběr zapichovací tyče a předvyplnění dna: ruční ⌀, jinak díra
 * v polotovaru části v místě zápichu (± 5 mm, když Z ještě není), jinak
 * parametry vyvrtávání / předvrtání.
 */
export function partHoleDiameter(S) {
  const p = S.params || {};
  const manual = num(p.grooveHoleD);
  if (manual > 0) return manual;
  try {
    const stock = S._cachedCalc ? buildStockLoopRaw(p, S._cachedCalc.stockPathSegments) : null;
    if (stock) {
      const z = num(p.partOffZ, NaN);
      const r = Number.isFinite(z) ? stockHoleRadiusAt(stock, z) : null;
      if (r !== null && Number.isFinite(r)) return Math.round(2 * r * 1000) / 1000;
    }
  } catch { /* bez polotovaru — z parametrů */ }
  return num(p.boreDiameter) || num(p.borePreDiameter) || 0;
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
    // Polotovar části díru už má (program po částech) → nic neodečítat, jinak
    // by simulace ukázala díru z parametrů (výchozí ⌀30) místo skutečné.
    if (stock && stockHoleRadiusAt(stock, holeProbeZ(S.params)) !== null) return [S.params, segs];
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

/**
 * Čárkovaný náhled zápichu v díře na polotovaru (jako díra u vrtání a
 * vyvrtávání, drawStock.js): obrys zápichu (boky + dno) a stěna díry
 * od ústí k zápichu. Skutečné souřadnice {x poloměr, z}; null = nic.
 * @returns {{groove: number[][], wall: number[][]}|null}
 */
export function grooveOutline(S) {
  const p = S.params;
  if (!grooveInnerActive(p) || threadInnerActive(p)) return null;
  const src = p.boreSource === 'cad' ? boreChainFromState(S) : null;
  let stock = null;
  try { stock = S._cachedCalc ? buildStockLoopRaw(p, S._cachedCalc.stockPathSegments) : null; } catch { stock = null; }
  const g = grooveInnerGeom(p, src ? src.segs : null, stock);
  if (!(g.rHole > 0) || g.rHole === Infinity || !(g.rBot > 0) || !Number.isFinite(g.zA)) {
    // Nevydaná dráha: aspoň kde zápich je (bok u ústí, šířka, dno), když jde.
    const rB = num(p.grooveBottomX), zA = num(p.partOffZ, NaN), W = num(p.grooveWidth) || g.w;
    if (!(rB > 0) || !Number.isFinite(zA) || !(W > 0)) return null;
    const zB = zA - g.s * W, r0 = rB - 1;
    return { groove: [[r0, zA], [rB, zA], [rB, zB], [r0, zB]], wall: [] };
  }
  return {
    groove: [[g.rHole, g.zA], [g.rBot, g.zA], [g.rBot, g.zB], [g.rHole, g.zB]],
    wall: [[g.rHole, g.zF], [g.rHole, g.zA]],
  };
}

// ╔════════════════════════════════════════════════════╗
// ║  VYVRTÁVÁNÍ — JEN DOKONČENÍ (Hot. + ◎ Vnitřní)        ║
// ╚════════════════════════════════════════════════════╝
// Doplnění pravidla 13 (docs/cam-pravidla.md, schválil uživatel 22. 10. 2026):
// „Jen dokončení v díře = vnější Hot. v zrcadle: jeden dokončovací průchod
// po stěně díry, bez hrubování. Předpokládá díru vyhrubovanou předchozí
// operací: polotovar díry = hotový obrys zmenšený o přídavky (stěna Ph +
// Přídavek X, dno Ph + Přídavek Z). Tyč se musí vejít do vyhrubované díry —
// protější stěna = nejužší místo vyhrubované díry od ústí po špičku."
//
// Proč vlastní polotovar: zrcadlo vyvrtávání (ops/bore.js) bere jako
// polotovar předvrtání. Dokončení z předvrtání (sonda 22. 10. 2026, díra ⌀42
// z cam-bore-contour) hlásilo nevyhrubovaný zbytek a kontrola pravidla 13
// zahodila program — dokončovací tyč by do předvrtání nevešla. Skutečný
// zbytek z předchozí části programu předat nejde (obrobený polotovar s dírou
// se nedotýká osy, opParts ho profilem nezapíše) — uživatel zvolil
// „vyhrubovaná s přídavky".
//
// Čistá geometrie bez importu ops/bore.js (žádný cyklus importů): obrys díry
// (bore.boreHoleLoop) dodá volající. Souřadnice: x = skutečný poloměr,
// z = zrcadlové Z (z' = s·z — do díry vždy k −z', jako v zrcadle bore.js).

import { polyDifference, polyIntersect, polyOffset } from '../../../geom/geomCore.js';

const EPS = 1e-6;

/**
 * Materiál kolem VYHRUBOVANÉ díry: pás od předvrtání po R_ref minus hotová
 * díra, narostlý o přídavky (eliptický posun jako offsetStockLoop — stěna
 * o aRad, dno o aAx) a oříznutý na pás.
 * Pás začíná na poloměru předvrtání v CELÉ hloubce, jako válcový polotovar
 * zrcadla při hrubování: dno se dokončuje jen k předvrtání (pravidlo 13)
 * a střed pod ním do operace nepatří. Kdyby tam pod dnem (díra hlubší než
 * plný ⌀ vrtáku) zůstal materiál až k ose, byl by v zrcadle schod vysoký
 * jako celý poloměr a destička by dno „nedosáhla" — změřeno 22. 10. 2026
 * v prohlížeči (⌀30 × 20, předvrtání vrtákem ⌀20 do 13,9): dokončení
 * skončilo na stěně nad dnem.
 * @param hole  boreHoleLoop(g): {x, z} skutečná Z — od osy na čele přes stěnu po dno k ose
 * @param o { s, zF, r0, rRef, depth, aRad, aAx }
 * @returns {Array<Array<{x:number,z:number}>>}
 */
export function roughedMaterial(hole, { s, zF, r0, rRef, depth, aRad, aAx }) {
  const zf = s * zF, zEnd = zf - depth;
  const box = [{ x: r0, z: zf }, { x: rRef, z: zf }, { x: rRef, z: zEnd }, { x: r0, z: zEnd }];
  let mat = polyDifference([box], [hole.map(p => ({ x: p.x, z: s * p.z }))]);
  if (aRad > EPS || aAx > EPS) mat = growAniso(mat, aRad, aAx);
  return polyIntersect(mat, [box]);
}

/** Posun ven o a v X a b v Z (měřítko osy Z, izotropní offset, měřítko zpět). */
function growAniso(loops, a, b) {
  const kZ = Math.min(100, Math.max(0.01, Math.max(a, EPS) / Math.max(b, EPS)));
  const d = Math.max(a, b * kZ);
  const off = polyOffset(loops.map(l => l.map(p => ({ x: p.x, z: p.z * kZ }))), d);
  return off.map(l => l.map(p => ({ x: p.x, z: p.z / kZ })));
}

/** Poloměr vyhrubované díry v zrcadlovém Z = nejmenší x materiálu (žádný → rRef). */
function voidRadiusAt(mat, z, rRef) {
  let best = rRef;
  for (const loop of mat) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i], q = loop[(i + 1) % loop.length];
      if ((p.z - z) * (q.z - z) > 0 || Math.abs(p.z - q.z) < 1e-12) continue;
      const x = p.x + (q.x - p.x) * (z - p.z) / (q.z - p.z);
      if (x < best) best = x;
    }
  }
  return Math.max(0, best);
}

/**
 * Profil vyhrubované díry od čela do konce pásu: body {z, r} (zrcadlové Z,
 * shora dolů) se schody — v každé výšce vrcholu hodnota nad i pod ním.
 * Mezi vrcholy je poloměr lineární (hrany se nekříží).
 */
export function roughedProfile(mat, { s, zF, rRef, depth }) {
  const zf = s * zF, zEnd = zf - depth;
  const zs = [...new Set(mat.flat().map(p => +p.z.toFixed(6)).filter(z => z <= zf + EPS && z >= zEnd - EPS))];
  zs.push(zf, zEnd);
  const sorted = [...new Set(zs)].sort((a, b) => b - a);
  const out = [];
  const push = (z, r) => {
    const l = out[out.length - 1];
    if (!l || Math.abs(l.z - z) > EPS || Math.abs(l.r - r) > EPS) out.push({ z, r });
  };
  sorted.forEach((z, i) => {
    if (i > 0) push(z, voidRadiusAt(mat, z + 1e-5, rRef));
    if (i < sorted.length - 1) push(z, voidRadiusAt(mat, z - 1e-5, rRef));
  });
  return out;
}

/**
 * Polotovar zrcadlového světa (odlitek): profil x' = R_ref − r od čela po
 * konec pásu, body ve formátu kontury (X v jednotkách programu, k = 2 u Ø).
 * Profil k ose zrcadla (x' = 0) uzavře buildStockLoopRaw.
 */
export function finishStockPoints(profile, { k, rRef }) {
  return profile.map((p, i) => ({
    id: i + 1, type: i ? 'G1' : 'G0', x: +(k * (rRef - p.r)).toFixed(6), z: +p.z.toFixed(6), r: 0, mode: 'ABS',
  }));
}

/**
 * Protější stěna pro kontrolu pravidla 13: nejužší místo vyhrubované díry od
 * ústí (z' = čelo) po špičku v zrcadlovém Z `zTip`.
 */
export function wallMinFrom(profile, zTip) {
  let best = Infinity;
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    if (p.z >= zTip - EPS) best = Math.min(best, p.r);
    const q = profile[i + 1];
    // Špička mezi dvěma body profilu: poloměr v její výšce (lineárně).
    if (q && p.z > zTip && q.z < zTip) best = Math.min(best, p.r + (q.r - p.r) * (zTip - p.z) / (q.z - p.z));
  }
  return Number.isFinite(best) ? best : 0;
}

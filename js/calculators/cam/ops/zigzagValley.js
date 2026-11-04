// ╔══════════════════════════════════════════════════════════════╗
// ║  CIK CAK — údolí pod čarou zanoření uvnitř úseku               ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 4. 11. 2026 (karusel po X, údolí mezi hrby): „cik cak metoda pro
// kulatý plátek by měla jet, že přijede ke konci a zanoří se pod úhlem 45°
// a jede na druhou stranu, kde zas zanořuje pod 45°. A dojíždí se ke konci,
// i když se tam bude na chvilku překračovat."
//
// Podélné hrubování bere údolí za hrbem, jehož čára zanoření skončí na
// kontuře (hranice úseku tam nevznikne), řetězem vrstev: každá vjede rampou
// po čáře zanoření a jede jen doleva. U strmé stěny hrbu tak zůstane klín
// mezi čarou zanoření a stěnou. Tady se takový řetěz nahradí stejným
// průchodem cik cak jako spodek u hranice úseku (ops/zigzagFloor.js):
// vrstva od stěny ke stěně (vpravo až ke skutečné stěně, přes čáru
// zanoření), na konci rampa pod úhlem zanoření o ap níž, další vrstva
// opačným směrem. Jen strategie Cik cak (ops/zigzagRough.js).

import { wallFinders, zigzagFromLayers } from './zigzagFloor.js';

const EPS = 0.05;

const near = (x1, z1, x2, z2) => Math.abs(x1 - x2) < EPS && Math.abs(z1 - z2) < EPS;

/** Vjezd vrstvy jednou přímkou dolů pod úhlem zanoření (rampa po čáře zanoření). */
function plungeLeadIn(p, tanA) {
  if (!p || p.type !== 'long' || !Number.isFinite(p.x) || !(p.zStart > p.zEnd + 0.5)) return null;
  const li = p.contourLeadIn;
  if (!Array.isArray(li) || li.length !== 1 || !li[0] || li[0].type !== 'line') return null;
  const s = li[0], dx = s.x1 - s.x2, dz = s.z1 - s.z2;
  if (!(dx > EPS) || !(dz > EPS)) return null;
  return Math.abs(dx / dz - tanA) <= 0.02 * Math.max(tanA, 1) ? s : null;
}

/** Další člen řetězu: vrstva o nejvýš ~ap níž, vjezd začíná na začátku nebo konci předchozí. */
function nextMember(passes, from, prev, step) {
  for (let i = from; i < passes.length; i++) {
    const q = passes[i];
    if (!q || q.type !== 'long' || !Number.isFinite(q.x)) continue;
    const dx = prev.x - q.x;
    if (dx < EPS || dx > 1.6 * step) continue;
    const li = Array.isArray(q.contourLeadIn) && q.contourLeadIn[0];
    if (!li || !Number.isFinite(li.x1)) continue;
    if (near(li.x1, li.z1, prev.x, prev.zStart) || near(li.x1, li.z1, prev.x, prev.zEnd)) return i;
  }
  return -1;
}

/**
 * Nahradí řetězy vrstev zanořených po čáře zanoření průchody cik cak.
 * @param {object} o { passes, start, raw, step, tanA, zHi, noSteps }
 *   raw — offset bez čar zanoření; zHi — konec rozsahu na straně začátku
 *   obrábění (stěna vpravo se za ním nehledá)
 * @returns {number} počet nahrazených vrstev
 */
export function valleyZigzag({ passes, start = 0, raw, step, tanA, zHi = Infinity, noSteps = false }) {
  if (!Array.isArray(passes) || !raw || !(step > 0) || !(tanA > 0)) return 0;
  const W = wallFinders(raw);
  const reach = 4 * step / Math.max(tanA, 0.2) + 2;
  let total = 0;
  for (let i0 = start; i0 < passes.length; i0++) {
    const s0 = plungeLeadIn(passes[i0], tanA);
    if (!s0) continue;
    const grp = [i0];
    for (let j = nextMember(passes, i0 + 1, passes[i0], step); j >= 0; j = nextMember(passes, j + 1, passes[j], step)) grp.push(j);
    if (grp.length < 2) continue;
    // Vrstvy mezi stěnami: vlevo musí stát stěna (údolí — s volnem vlevo
    // se bere obrácená vrstva, ops/zigzagReverse.js), vpravo stěna hrbu
    // v rozsahu. Tenký zbytek u dna (< 1 mm mezi stěnami) zůstane, jak byl.
    const layers = [], used = [];
    for (const j of grp) {
      const p = passes[j];
      const a = W.wallLeft(p.x, p.zEnd + 0.5, p.zEnd - reach);
      const b = W.wallRight(p.x, p.zStart, Math.min(p.zStart + reach + 50, zHi));
      if (a === null || b === null || b - a < 1) break;
      layers.push({ X: p.x, a, b });
      used.push(j);
    }
    // Rampa mezi vrstvami nesmí projet pod offset (stupeň dna: další vrstva
    // leží jinde než konec předchozí) — spodní vrstvy se odeberou, zůstanou
    // původní průchody.
    while (used.length >= 2) {
      const tmp = passes.slice();
      zigzagFromLayers({ passes: tmp, grp: used, layers, xTop: s0.x1, tanA, reach, noSteps, W });
      if (!gouges(tmp[used[0]].moves, W.fR)) break;
      used.pop(); layers.pop();
    }
    if (used.length < 2) continue;
    total += zigzagFromLayers({ passes, grp: used, layers, xTop: s0.x1, tanA, reach, noSteps, W });
  }
  return total;
}

/** Některý posuv vede pod offsetem (střed nosu pod hrubovací čarou). */
function gouges(moves, fR) {
  for (let i = 1; i < moves.length; i++) {
    const p = moves[i - 1], q = moves[i];
    const n = Math.max(2, Math.ceil(Math.abs(q.z - p.z) / 0.25));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (p.x + (q.x - p.x) * t < fR(p.z + (q.z - p.z) * t) - 0.01) return true;
    }
  }
  return false;
}

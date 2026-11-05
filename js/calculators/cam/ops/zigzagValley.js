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

import { wallFinders, zigzagFromLayers, buildZigzag } from './zigzagFloor.js';

const EPS = 0.05;

// Začátek vjezdu u předchozí vrstvy: X přesně, podél vrstvy do 1 mm (rampa
// řetězu začíná kousek vedle začátku mělčí vrstvy).
const near = (x1, z1, x2, z2) => Math.abs(x1 - x2) < EPS && Math.abs(z1 - z2) < 1;

/** Vjezd vrstvy: vjezd po stěně jednou přímkou, nebo rampa (`ramp`). */
function leadInSeg(p) {
  const li = p && p.contourLeadIn;
  if (Array.isArray(li) && li.length === 1 && li[0] && li[0].type === 'line') return li[0];
  if (p && p.ramp && Number.isFinite(p.ramp.x0) && Number.isFinite(p.ramp.z0) && !p.contourLeadIn) {
    return { type: 'line', x1: p.ramp.x0, z1: p.ramp.z0, x2: p.x, z2: p.zStart };
  }
  return null;
}

/** Vjezd vrstvy jednou přímkou dolů pod úhlem zanoření (rampa po čáře zanoření). */
function plungeLeadIn(p, tanA) {
  if (!p || p.type !== 'long' || !Number.isFinite(p.x) || !(p.zStart > p.zEnd + 0.5)) return null;
  const s = leadInSeg(p);
  if (!s) return null;
  const dx = s.x1 - s.x2, dz = s.z1 - s.z2;
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
    const li = (Array.isArray(q.contourLeadIn) && q.contourLeadIn[0]) || leadInSeg(q);
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
export function valleyZigzag({ passes, start = 0, raw, step, tanA, zLo = -Infinity, zHi = Infinity, noSteps = false }) {
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
      // Vrstva končící na dolní mezi rozsahu (hranice úseku, ✂ Po úsecích):
      // vlevo stojí materiál dalšího úseku — konec je ta mez (pravidlo 11),
      // rampa od ní jde do materiálu tohoto úseku.
      const a = W.wallLeft(p.x, p.zEnd + 0.5, p.zEnd - reach) ?? (Math.abs(p.zEnd - zLo) < 0.6 ? p.zEnd : null);
      // Stěna vpravo smí ležet i za hranicí úseku (spodek u hranice, pravidlo
      // 20 — výjimka z pravidla 11), nanejvýš jako u floorZigzag (zHi + reach + 50).
      const b = W.wallRight(p.x, p.zStart, Math.min(p.zStart + reach + 50, zHi + reach + 50));
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

// ── KAPSY POD SPODKEM CIK CAK ─────────────────────────────────────
// Uživatel 4. 11. 2026 (karusel, Ú2 od S7): pod spodkem údolí zůstal
// zářez do V (bod 10) a nižší dno (bod 6) — „napřed pravou … zářez do tvaru
// V, pak bod 6 a naposled údolí s bodem 2". Materiál pod poslední vrstvou
// spodku se rozloží na kapsy: vrstva po ap (nebo na plošinu dna), dokud
// zůstává jedna kapsa; kde se rozdělí, napřed pravá (blíž začátku
// obrábění), pak levá. Každá kapsa cik cak jako spodek.

const DS = 0.25;

/** Úseky [a, b] v rozsahu [zA, zB], kde offset leží pod hloubkou X (šířka ≥ 1 mm), zprava doleva. */
function pocketRuns(W, X, zA, zB, zLo) {
  const runs = [];
  let s = null;
  for (let z = zA; z <= zB + 1e-9; z += DS) {
    if (W.fR(z) < X - 1e-6) { if (s === null) s = z; }
    else if (s !== null) { runs.push([s, z - DS]); s = null; }
  }
  if (s !== null) runs.push([s, zB]);
  const out = [];
  for (const [s0, s1] of runs) {
    const seed = (s0 + s1) / 2;
    const wl = W.wallLeft(X, seed, zA - 50) ?? s0;
    const a = Math.max(wl, zLo, zA), b = Math.min(W.wallRight(X, seed, zB + 50) ?? s1, zB);
    // Vlevo jen hranice úseku (stěna až za ní): kapsa patří dalšímu úseku.
    if (b - a >= 1) out.push({ a, b, cut: wl < zLo - 0.5 });
  }
  return out.sort((p, q) => q.b - p.b);
}

/** Nejvyšší plošina dna (offset vodorovně ≥ 2 mm) mezi hloubkami lo a hi. */
function plateauIn(W, a, b, lo, hi) {
  let best = null, run = 0, v0 = null;
  for (let z = a; z <= b + 1e-9; z += DS) {
    const v = W.fR(z);
    if (v0 !== null && Math.abs(v - v0) < 0.03) run += DS; else { v0 = v; run = 0; }
    if (run >= 2 && v0 > lo && v0 < hi && (best === null || v0 > best)) best = v0;
  }
  return best;
}

/** Leží v kapse [a, b] pod hloubkou X už nějaký průchod (vrstva nebo cik cak)? */
function covered(passes, X, a, b) {
  return passes.some((p) => {
    if (!p) return false;
    if (p.type === 'long' && Number.isFinite(p.x) && p.x < X - 0.3) {
      const lo = Math.min(p.zStart, p.zEnd), hi = Math.max(p.zStart, p.zEnd);
      return Math.min(hi, b) - Math.max(lo, a) > 1;
    }
    return p.type === 'zigzag' && !p.wallClean && p.moves.some((m) => m.x < X - 0.3 && m.z > a + 0.5 && m.z < b - 0.5);
  });
}

/**
 * Kapsy pod hloubkou Xtop v [a0, b0] jako strom uzlů { layers, xTop, kids }:
 * vrstvy, dokud zůstává jedna kapsa; kde se rozdělí, podkapsy zprava doleva.
 */
function decompose(o, Xtop, a0, b0, depth = 0) {
  const { W, step, zLo, passes } = o;
  const out = [];
  if (depth > 20) return out;
  for (const iv of pocketRuns(W, Xtop - 0.3, a0, b0, zLo)) {
    if (iv.cut || covered(passes, Xtop, iv.a, iv.b)) continue;
    const layers = [];
    let X = Xtop, cur = iv;
    const kids = [];
    for (;;) {
      let minF = Infinity;
      for (let z = cur.a; z <= cur.b + 1e-9; z += DS) minF = Math.min(minF, W.fR(z));
      if (!(minF < X - 0.3)) break;
      const pl = plateauIn(W, cur.a, cur.b, X - step, X - 0.3);
      const bottom = pl === null && X - step <= minF + 0.02;
      const nx = pl !== null ? pl + 0.02 : Math.max(X - step, minF + 0.02);
      const subs = pocketRuns(W, nx, cur.a, cur.b, zLo);
      // DNO MÍRNĚ ŠIKMÉ (uživatel 5. 11. 2026, N4630: „mělo by se zanořit
      // a pokračovat vodorovně"): poslední vodorovná vrstva by vzala jen
      // nejnižší místo a rampa k ní vedla přes celé dno — místo ní jízda
      // po dně mezi stěnami (zigzagFloor.js `follow`).
      if (bottom && subs.length === 1 && !subs[0].cut && subs[0].b - subs[0].a < 0.6 * (cur.b - cur.a)) {
        layers.push({ X: nx, a: cur.a, b: cur.b, follow: true, top: X });
        break;
      }
      if (subs.length !== 1 || subs[0].cut) {
        // Jen užší podkapsy (jinak by se dělení točilo dokola).
        for (const s of subs) if (s.b - s.a < cur.b - cur.a - 0.01) kids.push(...decompose(o, X, s.a, s.b, depth + 1));
        break;
      }
      layers.push({ X: nx, a: subs[0].a, b: subs[0].b });
      X = nx; cur = subs[0];
    }
    out.push({ layers, xTop: Xtop, kids });
  }
  return out;
}

/** Uzly rozkladu → průchody (cik cak + dojetí stěn), podkapsy za svou kapsou. */
function emitNodes(o, nodes) {
  const { W, tanA, reach, noSteps } = o;
  const out = [];
  for (const n of nodes) {
    const layers = n.layers.slice();
    while (layers.length >= 1) {
      const zz = buildZigzag({ layers, xTop: n.xTop, tanA, reach, noSteps, W });
      if (!gouges(zz[0].moves, W.fR)) { out.push(...zz); break; }
      layers.pop();
    }
    out.push(...emitNodes(o, n.kids));
  }
  return out;
}

/**
 * Za každý spodek cik cak (floorZigzag) vloží kapsy, které pod jeho poslední
 * vrstvou zůstaly a žádný průchod je nebere. Kapsa přímo pod celou šířkou
 * poslední vrstvy (vrstva na dně, N4160: dno 68,22 jako samostatná kapsa se
 * dvěma jízdami po stěnách) se přidá jako další vrstvy TÉHOŽ cik caku.
 * @returns {number} počet vložených průchodů
 */
export function pocketsBelowZigzag({ passes, start = 0, raw, step, tanA, zLo = -Infinity, noSteps = false }) {
  if (!Array.isArray(passes) || !raw || !(step > 0) || !(tanA > 0)) return 0;
  const W = wallFinders(raw);
  const o = { W, step, tanA, reach: 4 * step / Math.max(tanA, 0.2) + 2, noSteps, zLo, passes };
  let added = 0;
  const done = new Set();
  for (let i = start; i < passes.length; i++) {
    const zg = passes[i];
    if (!zg || !zg.floorZigzag || done.has(zg)) continue;
    done.add(zg);
    const pl = zg._layers;
    if (pl && pl[pl.length - 1].follow) continue;
    let Xb, a, b;
    if (pl) ({ X: Xb, a, b } = pl[pl.length - 1]);
    else {
      Xb = Math.min(...zg.moves.map((m) => m.x));
      const zs = zg.moves.filter((m) => Math.abs(m.x - Xb) < 1e-6).map((m) => m.z);
      a = Math.min(...zs); b = Math.max(...zs);
    }
    let nodes = decompose(o, Xb, a, b);
    if (!nodes.length) continue;
    let j = i + 1;
    while (j < passes.length && passes[j] && passes[j].wallClean) j++;
    if (pl && nodes.length === 1 && nodes[0].layers.length) {
      const merged = buildZigzag({ layers: [...pl, ...nodes[0].layers], xTop: zg._xTop, tanA, reach: o.reach, noSteps, W });
      if (!gouges(merged[0].moves, W.fR)) {
        passes.splice(i, j - i, ...merged);
        merged.forEach((p) => done.add(p));
        j = i + merged.length;
        nodes = nodes[0].kids;
      }
    }
    const ins = emitNodes(o, nodes);
    passes.splice(j, 0, ...ins);
    ins.forEach((p) => done.add(p));
    added += ins.length;
    i = j + ins.length - 1;
  }
  return added;
}

/**
 * ÚSEK NAD ÚDOLÍM POLOTOVARU (✂ Po úsecích, sectionPlan.js `orderSteps`):
 * úsek jede až na dno, jen vlevo od prvního hrbu u dolní hranice ne pod výšku
 * dna údolí — pod ní stojí materiál dalšího úseku, a ten ho vezme celý
 * (uživatel 5. 11. 2026: „z pravé strany nedělit a jet až dolů", u S7 „ne až
 * dolů"). Hrb = první místo od hranice, kde offset vystoupí nad tu výšku.
 * @returns {number} počet odebraných průchodů
 */
export function dropBelowValleyFloor({ passes, start = 0, raw, floor, zLo }) {
  if (!Array.isArray(passes) || !raw || !Number.isFinite(floor) || !Number.isFinite(zLo)) return 0;
  const { fR } = wallFinders(raw);
  let h = null;
  for (let z = zLo; z <= zLo + 5000; z += DS) if (fR(z) >= floor) { h = z; break; }
  if (h === null) return 0;
  const zMax = (p) => {
    const zs = [p.zStart, p.zEnd];
    for (const s of [...(p.contourLeadIn || []), ...(p.contourLeadOut || [])]) zs.push(s.z1, s.z2);
    if (p.ramp) zs.push(p.ramp.z0);
    return Math.max(...zs.filter(Number.isFinite));
  };
  let n = 0;
  for (let i = passes.length - 1; i >= start; i--) {
    const p = passes[i];
    if (p && p.type === 'long' && Number.isFinite(p.x) && p.x < floor - 1e-6 && zMax(p) <= h + 1) { passes.splice(i, 1); n++; }
  }
  return n;
}

/**
 * Vrstva POD HRUBOVACÍM OFFSETEM (střed nosu níž než offset) = zajetí do
 * kontury. Karusel 5. 11. 2026 (bod 1 u osy): zbytek vrstvy X' 189,05 za
 * stěnou (Z' 73,9 → 69,0) jel pod obloukem offsetu v rohu (190,7–194,2)
 * a výjezdem po „čele" za osu (`G1 Z191.154 X-5.200`) do dílu. Takový
 * průchod se zahodí; mělčí vrstva, která na něj navazovala bez odskoku,
 * odskočí normálně.
 * @returns {number} počet odebraných průchodů
 */
export function dropUnderOffset({ passes, start = 0, raw }) {
  if (!Array.isArray(passes) || !raw) return 0;
  const { fR } = wallFinders(raw);
  let n = 0;
  for (let i = passes.length - 1; i >= start; i--) {
    const p = passes[i];
    if (!p || p.type !== 'long' || !Number.isFinite(p.x) || !Number.isFinite(p.zStart) || !Number.isFinite(p.zEnd)) continue;
    const lo = Math.min(p.zStart, p.zEnd), hi = Math.max(p.zStart, p.zEnd);
    const k = Math.max(2, Math.ceil((hi - lo) / DS));
    let under = 0;
    for (let j = 0; j <= k; j++) if (fR(lo + (hi - lo) * j / k) > p.x + 0.05) under++;
    // Celá vrstva pod offsetem (ne jen dotek u stěny na konci).
    if (under < k) continue;
    passes.splice(i, 1);
    const prev = passes[i - 1];
    if (prev && prev.noRetract) delete prev.noRetract;
    n++;
  }
  return n;
}

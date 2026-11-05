// ╔══════════════════════════════════════════════════════════════╗
// ║  Karusel po X: ✂ Po úsecích, ➕ Operace a náhled úseků         ║
// ╚══════════════════════════════════════════════════════════════╝
// Plán úseků (ops/sections/sectionPlan.js) vzniká v prohozeném světě
// (cam/xzSwap.js): úseky leží po Z' = skutečném X (poloměru), dno úseku
// `xTo` je X' = skutečná výška Z. Reálný `calc.sectionPlan` je null, aby ho
// nečetl nikdo, kdo počítá se soustruhem — tady se bere z `calc._xz`.
//
// Krok úseku se do SKUTEČNÉHO stavu zapisuje jako rozsahy 📐 (swapLimits je
// pak prohodí zpět): pás úseku → rozsah X (poloměry), dno → rozsah Z od výšky
// `xTo` nahoru. Obrobený polotovar se počítá taky v prohozeném světě
// (profil „od stolu" = jako od osy na soustruhu) a prohodí se zpět.
//
// Na soustruhu (bez prohození) se funkce chovají přesně jako dřív — kód
// soustruhu je sem jen přesunutý z camSimulator.js.

import { swapsXZ, swapPointsIn } from '../xzSwap.js';
import { swapSimPath, swapLoops } from './xzSim.js';
import { sectionRanges } from '../ops/sections/sectionRanges.js';
import { sectionLeftover } from '../ops/sections/sectionLeftover.js';
import { machinedStockPoints } from '../opParts.js';
import { xBoundOn, xBoundValue, resolveRangeX } from '../rangeX.js';

const BIG = 1e4;
const xz = (S, calc) => (swapsXZ(S) && calc && calc._xz ? calc._xz : null);

/**
 * Kroky „✂ Po úsecích" v prohozeném světě: { steps } | { error }; null = neprohazuje se.
 * Kroky mají tvar ze sectionRanges (zLo/zHi = pás po skutečném X, xTo = výška dna).
 */
export function xzSectionSteps(S, calc) {
  const w = xz(S, calc);
  if (!w) return null;
  const plan = w.calc.sectionPlan;
  if (!plan || !plan.sections || plan.sections.length === 0) {
    return { error: 'Úseky nejsou — dráhy po úsecích jen pro hrubování po X kulatou/polygonem.' };
  }
  const zs = (w.calc.stockWorldPoints || []).map(p => p.zReal).filter(Number.isFinite);
  if (zs.length === 0) return { error: 'Chybí polotovar.' };
  const rx = resolveRangeX(S.xLimits);
  const userRange = rx ? { zLo: rx.xLo, zHi: rx.xHi } : null;
  const steps = sectionRanges(plan, { lo: Math.min(...zs), hi: Math.max(...zs) }, userRange)
    .map(st => ({ ...st, name: `Úsek ${st.id}` + (st.xTo !== null ? ` (do Z${st.xTo.toFixed(1)})` : '') }));
  return steps.length ? { steps } : { error: 'Žádný úsek neleží v rozsahu obrábění.' };
}

/**
 * Hrubování bez úseků (tlačítko ✂ se schová): na soustruhu čelní, na karuselu
 * po X naopak ↕ Podélně (to je v prohozeném světě čelní).
 */
export function noSections(S, key) {
  return swapsXZ(S) ? (S.params.roughingStrategy || 'longitudinal') === 'longitudinal' : key === 'face';
}

/**
 * Rozsahy 📐 pro jeden krok úseku (skutečný svět).
 * @param base  { z, x } rozsahy uživatele před „✂ Po úsecích"
 * @returns {{ zLimits, xLimits }}
 */
export function sectionStepLimits(S, st, base) {
  const L = stepLimits(S, st, base);
  // Výška dna údolí polotovaru (sectionPlan.js `orderSteps`): vlevo od prvního
  // hrbu u dolní hranice úseku se pod ni nejede (ops/zigzagRough.js). Na
  // soustruhu je to X (rozsah X), na karuselu výška Z — swapLimits ji
  // v prohozeném světě předá do X'.
  if (Number.isFinite(st.valleyFloor)) {
    if (swapsXZ(S)) L.zLimits = { ...L.zLimits, valleyFloor: st.valleyFloor };
    else L.xLimits = { ...L.xLimits, valleyFloor: st.valleyFloor };
  }
  // Úsek začíná na hranici údolí polotovaru: spodek až ke stěně hrbu za ní.
  if (st.valleyStart) {
    if (swapsXZ(S)) L.zLimits = { ...L.zLimits, valleyStart: true };
    else L.xLimits = { ...L.xLimits, valleyStart: true };
  }
  return L;
}

function stepLimits(S, st, base) {
  if (!swapsXZ(S)) {
    // Soustruh (beze změny, dřív v camSimulator.js): pás úseku = rozsah Z.
    // Dno úseku (`xTo`) se SKLÁDÁ s rozsahem X uživatele — platí vyšší
    // z obou den, strop X max zůstává jeho. Do 30. 9. 2026 se tu X max
    // přepsal na 1e4, takže se v úsecích se dnem tiše ztratil.
    const zLimits = { ...base.z, rangeStart: st.zHi, rangeEnd: st.zLo, rangeActive: true };
    if (st.xTo === null) return { zLimits, xLimits: { ...base.x } };
    const bx = base.x, uMin = xBoundValue(bx, 'min');
    return { zLimits, xLimits: { ...bx, rangeXMin: uMin !== null ? Math.max(uMin, st.xTo) : st.xTo,
      minActive: true, maxActive: xBoundOn(bx, 'max'), active: true } };
  }
  // Karusel po X: pás úseku = rozsah X (poloměry; uživatelův rozsah X už
  // sectionRanges zúžil), dno = rozsah Z od výšky xTo, strop Z uživatele zůstává.
  const xLimits = { ...base.x, rangeXMin: st.zLo, rangeXMax: st.zHi, minActive: true, maxActive: true, active: true };
  if (st.xTo === null) return { zLimits: { ...base.z }, xLimits };
  const bz = base.z;
  const on = bz.rangeActive && Number.isFinite(bz.rangeStart) && Number.isFinite(bz.rangeEnd);
  const lo = on ? Math.max(Math.min(bz.rangeStart, bz.rangeEnd), st.xTo) : st.xTo;
  const hi = on ? Math.max(bz.rangeStart, bz.rangeEnd) : BIG;
  return { zLimits: { ...bz, rangeStart: hi, rangeEnd: lo, rangeActive: true }, xLimits };
}

/**
 * Obrobený polotovar po dráze `calc` (➕ Operace, ✂ Po úsecích) — skutečné body.
 * Na karuselu po X profil od stolu v prohozeném světě, prohozený zpět.
 */
export function machinedFor(S, calc) {
  const w = xz(S, calc);
  if (!w) return machinedStockPoints(S.params, calc.stockPathSegments, calc.simPath);
  const m = machinedStockPoints(w.S.params, w.calc.stockPathSegments, swapSimPath(calc.simPath));
  const dia = S.params.mode === 'DIAMON' ? 2 : 1;
  const out = { ...m, baseLoop: m.baseLoop ? swapLoops([m.baseLoop])[0] : m.baseLoop };
  if (m.points && m.points.length >= 2) {
    let id = Date.now();
    out.points = swapPointsIn(m.points, false).map(p => ({
      id: id++, type: p.type, x: Math.round(p.x * dia * 1000) / 1000, z: p.z, r: p.r || 0, mode: 'ABS',
    }));
  }
  return out;
}

/**
 * Náhled úseků na plátně: { plan, toScreen, leftover } — na karuselu po X
 * plán z prohozeného světa a toScreen, který osy prohodí; null = kreslit postaru.
 */
const _left = new WeakMap();   // calc → { src: simPath, v } (zbytek se počítá jednou na dráhu)
export function xzSectionView(S, calc, toScreen) {
  const w = xz(S, calc);
  if (!w || !w.calc.sectionPlan) return null;
  let c = _left.get(calc);
  if (!c || c.src !== calc.simPath) {
    let v = null;
    try {
      v = calc.simPath && calc.simPath.length > 1
        ? sectionLeftover(w.S.params, { ...w.calc, simPath: swapSimPath(calc.simPath) }) : null;
    } catch (err) { console.warn('CAM: zbytek po úsecích (karusel po X):', err); }
    c = { src: calc.simPath, v };
    _left.set(calc, c);
  }
  return { plan: w.calc.sectionPlan, toScreen: (x, z) => toScreen(z, x), leftover: c.v };
}

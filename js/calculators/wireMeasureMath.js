// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Měření přes drátky a válečky (čistý výpočet)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Závit – metoda tří drátků (bez korekce na úhel stoupání, u běžných
// jemných i hrubých metrických závitů zanedbatelná):
//   M = d2 + dw·(1 + 1/sin(α/2)) − (P/2)·cot(α/2),  optimální dw = P / (2·cos(α/2))
// Kužel přes dva válečky Ø dv na rovinné desce a na měrkách výšky h:
//   tan(α/2) = |M2 − M1| / (2h);  Ø u desky = M1 − dv·(1 + tan(45° ± α/4))
//   (+ kužel stojí na menším průměru a nahoru se rozšiřuje, − stojí na větším)
// Rybina přes válečky Ø dv v rozích s úhlem α (boky × základna):
//   vnější (čep) M = B + dv·(1 + cot(α/2)), B = šířka u paty
//   vnitřní (drážka) X = A − dv·(1 + cot(α/2)), A = šířka u dna

const rad = (deg) => deg * Math.PI / 180;

/** Typy závitů: úhel profilu a střední průměr z jmenovitého d a stoupání P. */
export const THREAD_TYPES = [
  { id: 'M', name: 'Metrický ISO (60°)', angle: 60, d2: (d, P) => d - 0.649519 * P },
  { id: 'UN', name: 'UNC / UNF (60°)', angle: 60, d2: (d, P) => d - 0.649519 * P },
  { id: 'W', name: 'Whitworth BSW / G (55°)', angle: 55, d2: (d, P) => d - 0.640327 * P },
  { id: 'Tr', name: 'Trapézový Tr (30°)', angle: 30, d2: (d, P) => d - 0.5 * P },
];

/** Běžná sada měřicích drátků [mm] (orientačně – podle sady v dílně). */
export const WIRE_SET = [0.17, 0.195, 0.22, 0.25, 0.29, 0.335, 0.39, 0.455, 0.53, 0.62, 0.725,
  0.895, 1.035, 1.24, 1.47, 1.65, 2.05, 2.55, 3.2];

/** Optimální drátek (dotyk na středním průměru). */
export function bestWire(P, angleDeg) {
  if (!(P > 0) || !(angleDeg > 0 && angleDeg < 180)) return NaN;
  return P / (2 * Math.cos(rad(angleDeg / 2)));
}

/** Nejbližší drátek ze sady. */
export function nearestWire(dw) {
  if (!(dw > 0)) return NaN;
  return WIRE_SET.reduce((b, w) => (Math.abs(w - dw) < Math.abs(b - dw) ? w : b), WIRE_SET[0]);
}

/**
 * Rozsah použitelných drátků: drátek musí vyčnívat nad vrcholy závitu
 * (jinak mikrometr dosedne na závit) a dotýkat se boků pod vrcholem
 * (jinak sedí na hranách vrcholů). Metrický závit: 0,505·P až 1,01·P.
 * @param {number} crestDepth - vzdálenost vrcholu závitu od roztečné přímky = (d − d2)/2
 * @returns {{min:number, max:number}}
 */
export function wireRange(P, angleDeg, crestDepth) {
  const h = rad(angleDeg / 2);
  const crest = (P / 2) / Math.tan(h) / 2 + crestDepth;     // výška vrcholu nad vrcholem ostrého V
  return { min: 2 * crest / (1 + 1 / Math.sin(h)), max: 2 * crest * Math.sin(h) / (Math.cos(h) ** 2) };
}

/**
 * Drátek ze sady nejblíž optimu, ale jen z použitelného rozsahu.
 * @returns {{dw:number, fromSet:boolean, opt:number}} fromSet = false → sada nemá vhodný, dw = optimum
 */
export function pickWire(P, angleDeg, crestDepth) {
  const opt = bestWire(P, angleDeg);
  const { min, max } = wireRange(P, angleDeg, crestDepth);
  const ok = WIRE_SET.filter(w => w >= min && w <= max);
  if (!ok.length) return { dw: opt, fromSet: false, opt };
  return { dw: ok.reduce((b, w) => (Math.abs(w - opt) < Math.abs(b - opt) ? w : b)), fromSet: true, opt };
}

/** Míra přes tři drátky. */
export function threadWireM(d2, P, angleDeg, dw) {
  if (!(d2 > 0) || !(P > 0) || !(dw > 0) || !(angleDeg > 0 && angleDeg < 180)) return NaN;
  const h = rad(angleDeg / 2);
  return d2 + dw * (1 + 1 / Math.sin(h)) - (P / 2) / Math.tan(h);
}

/** Střední průměr z naměřené míry M (obrácený výpočet). */
export function threadD2FromM(M, P, angleDeg, dw) {
  if (!(M > 0) || !(P > 0) || !(dw > 0) || !(angleDeg > 0 && angleDeg < 180)) return NaN;
  const h = rad(angleDeg / 2);
  return M - dw * (1 + 1 / Math.sin(h)) + (P / 2) / Math.tan(h);
}

/**
 * Kužel z naměřených měr přes válečky.
 * @returns {{angle:number, half:number, ratio:number, dBase:number, dTop:number, widening:boolean}|null}
 *   angle – vrcholový úhel α, half – α/2, ratio – kuželovitost 1:x, dBase – Ø kužele
 *   v rovině desky, dTop – Ø ve výšce h, widening – kužel se směrem nahoru rozšiřuje
 */
export function taperFromRollers(M1, M2, h, dv) {
  if (!(M1 > 0) || !(M2 > 0) || !(h > 0) || !(dv > 0)) return null;
  const widening = M2 > M1;
  const half = Math.atan(Math.abs(M2 - M1) / (2 * h));
  const k = 1 + Math.tan(Math.PI / 4 + (widening ? 1 : -1) * half / 2);
  const dBase = M1 - dv * k;
  const dTop = dBase + (widening ? 1 : -1) * 2 * h * Math.tan(half);
  if (!(dBase > 0) || !(dTop > 0)) return null;
  const halfDeg = half * 180 / Math.PI;
  return { angle: 2 * halfDeg, half: halfDeg, ratio: half > 0 ? 1 / (2 * Math.tan(half)) : Infinity, dBase, dTop, widening };
}

/**
 * Kontrolní míry kužele přes válečky z výkresu.
 * @param {number} dBase - Ø kužele v rovině desky
 * @param {number} angleDeg - vrcholový úhel α
 * @param {boolean} widening - kužel stojí na menším průměru (nahoru se rozšiřuje)
 * @returns {{M1:number, M2:number}|null}
 */
export function rollersForTaper(dBase, angleDeg, widening, h, dv) {
  if (!(dBase > 0) || !(angleDeg >= 0 && angleDeg < 180) || !(h >= 0) || !(dv > 0)) return null;
  const half = rad(angleDeg / 2);
  const M1 = dBase + dv * (1 + Math.tan(Math.PI / 4 + (widening ? 1 : -1) * half / 2));
  const M2 = M1 + (widening ? 1 : -1) * 2 * h * Math.tan(half);
  return M2 > 0 ? { M1, M2 } : null;
}

/** Rybina: míra přes / mezi válečky z šířky (internal = drážka). */
export function dovetailM(width, angleDeg, dv, internal = false) {
  if (!(width > 0) || !(dv > 0) || !(angleDeg > 0 && angleDeg < 180)) return NaN;
  const k = dv * (1 + 1 / Math.tan(rad(angleDeg / 2)));
  return internal ? width - k : width + k;
}

/** Rybina: šířka (u paty / u dna) z naměřené míry. */
export function dovetailWidth(M, angleDeg, dv, internal = false) {
  if (!(M > 0) || !(dv > 0) || !(angleDeg > 0 && angleDeg < 180)) return NaN;
  const k = dv * (1 + 1 / Math.tan(rad(angleDeg / 2)));
  return internal ? M + k : M - k;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Metrický závit ISO 965-1: tolerance, předvrtání     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Tolerance stupně 6 podle vzorců ISO 965-1, zaokrouhlené na řadu R40
// (tak vznikly normové tabulky – ověřeno na M6, M10, M16, M20):
//   Td2(6) = 90·P^0,4·d^0,1   (d = geometrický střed rozsahu průměrů)
//   TD2(6) = 1,32·Td2(6)      Td(6) = 180·P^(2/3) − 3,15·P^(−1/2)
//   TD1(6) = 433·P − 190·P^1,22 (P ≤ 1), jinak 230·P^0,7
//   ostatní stupně = k·hodnota(6), k = 0,5 / 0,63 / 0,8 / 1 / 1,25 / 1,6 / 2 (3…9)
// Základní úchylka g/G z tabulky ISO 965-1 (vzorec 15 + 11P se pro některá
// stoupání liší o 1 µm), e/f vzorcem.

const R40 = [1.00, 1.06, 1.12, 1.18, 1.25, 1.32, 1.40, 1.50, 1.60, 1.70, 1.80, 1.90, 2.00, 2.12, 2.24, 2.36,
  2.50, 2.65, 2.80, 3.00, 3.15, 3.35, 3.55, 3.75, 4.00, 4.25, 4.50, 4.75, 5.00, 5.30, 5.60, 6.00, 6.30, 6.70,
  7.10, 7.50, 8.00, 8.50, 9.00, 9.50];

/** Zaokrouhlení na nejbližší člen řady R40 (podle geometrické polohy). */
export function roundR40(x) {
  if (!(x > 0)) return 0;
  const i = Math.round(40 * Math.log10(x));
  const e = Math.floor(i / 40);
  return Math.round(R40[((i % 40) + 40) % 40] * Math.pow(10, e) * 1000) / 1000;
}

const D_RANGES = [0.99, 1.4, 2.8, 5.6, 11.2, 22.4, 45, 90, 180, 355, 600];
const GRADE_K = { 3: 0.5, 4: 0.63, 5: 0.8, 6: 1, 7: 1.25, 8: 1.6, 9: 2 };
/** Základní úchylka g (vnější) = G (vnitřní) [µm] podle stoupání. */
const DEV_G = { 0.2: 17, 0.25: 18, 0.3: 18, 0.35: 19, 0.4: 19, 0.45: 20, 0.5: 20, 0.6: 21, 0.7: 22, 0.75: 22,
  0.8: 24, 1: 26, 1.25: 28, 1.5: 32, 1.75: 34, 2: 38, 2.5: 42, 3: 48, 3.5: 53, 4: 60, 4.5: 63, 5: 71, 5.5: 75, 6: 80 };

function rangeMean(D) {
  for (let i = 1; i < D_RANGES.length; i++) {
    if (D <= D_RANGES[i]) return Math.sqrt(D_RANGES[i - 1] * D_RANGES[i]);
  }
  return Math.sqrt(D_RANGES[D_RANGES.length - 2] * D_RANGES[D_RANGES.length - 1]);
}

/** Velikost základní úchylky polohy e, f, g (vnější) / G (vnitřní) [µm, kladně]. */
export function fundamentalDeviation(position, P) {
  const p = position.toLowerCase();
  if (p === 'h') return 0;
  if (p === 'g') return DEV_G[P] ?? Math.round(15 + 11 * P);
  if (p === 'f') return Math.round(30 + 11 * P);
  if (p === 'e') return Math.round(50 + 11 * P);
  return null;
}

/**
 * Tolerance [µm] pro stupeň: Td2, Td (vnější), TD2, TD1 (vnitřní).
 * @returns {{Td2:number, Td:number, TD2:number, TD1:number}}
 */
export function gradeTolerances(D, P, grade) {
  const k = GRADE_K[grade] ?? 1;
  const td2_6 = roundR40(90 * Math.pow(P, 0.4) * Math.pow(rangeMean(D), 0.1));
  const td_6 = roundR40(180 * Math.pow(P, 2 / 3) - 3.15 / Math.sqrt(P));
  const tD2_6 = roundR40(1.32 * td2_6);
  const tD1_6 = roundR40(P <= 1 ? 433 * P - 190 * Math.pow(P, 1.22) : 230 * Math.pow(P, 0.7));
  const g = (v6) => (grade === 6 ? v6 : roundR40(k * v6));
  return { Td2: g(td2_6), Td: g(td_6), TD2: g(tD2_6), TD1: g(tD1_6) };
}

/**
 * Mezní rozměry metrického závitu.
 * @param {string} extClass - např. '6g', '4g', '8g', '6h', '6e'
 * @param {string} intClass - např. '6H', '5H', '7H', '6G'
 */
export function iso965Limits(D, P, extClass, intClass) {
  const eg = parseInt(extClass, 10), ig = parseInt(intClass, 10);
  const ePos = extClass.replace(/\d/g, ''), iPos = intClass.replace(/\d/g, '');
  const es = -(fundamentalDeviation(ePos, P) ?? 0);
  const EI = iPos.toUpperCase() === 'G' ? fundamentalDeviation('g', P) : 0;
  const te = gradeTolerances(D, P, eg), ti = gradeTolerances(D, P, ig);
  const d2 = D - 0.649519 * P, D1 = D - 1.082532 * P;
  const mm = (v) => v / 1000;
  return {
    es, EI, Td: te.Td, Td2: te.Td2, TD1: ti.TD1, TD2: ti.TD2,
    d_max: D + mm(es), d_min: D + mm(es) - mm(te.Td),
    d2_max: d2 + mm(es), d2_min: d2 + mm(es) - mm(te.Td2),
    D1_min: D1 + mm(EI), D1_max: D1 + mm(EI) + mm(ti.TD1),
    D2_min: d2 + mm(EI), D2_max: d2 + mm(EI) + mm(ti.TD2),
  };
}

/** Běžné vrtáky [mm]: do 20 po 0,1–0,5 (ISO 235), od 20 po 0,5. */
export const STD_DRILLS = (() => {
  const a = [1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.7, 1.75, 1.8, 1.9, 2, 2.05, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7,
    2.8, 2.9, 3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 5, 5.1, 5.2, 5.3,
    5.5, 5.8, 6, 6.2, 6.5, 6.8, 7, 7.2, 7.5, 7.8, 8, 8.2, 8.5, 8.8, 9, 9.2, 9.5, 9.8, 10, 10.2, 10.5, 10.8, 11, 11.2,
    11.5, 11.8, 12, 12.2, 12.5, 12.8, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 18.5, 19, 19.5];
  for (let d = 20; d <= 70; d += 0.5) a.push(d);
  return a;
})();

/** Podíl profilu závitu [%] pro vrták (75 % ≈ D − 0,974·P; 100 % = 1,299·P). */
export function threadPercent(D, P, drill) {
  return (D - drill) / (1.299038 * P) * 100;
}

/** Normový vrták pro předvrtání (nejbližší k 75 % závitu: M10 → 8,5, M12 → 10,2). */
export function tapDrill(D, P) {
  const ideal = D - 0.974279 * P;
  return STD_DRILLS.reduce((b, d) => (Math.abs(d - ideal) < Math.abs(b - ideal) - 1e-9 ? d : b), STD_DRILLS[0]);
}

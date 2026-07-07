// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Tabulky zápichů dle DIN 76 / DIN 509 (orientační)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// DIN 76-1: zápich pro výběh závitu (vnější) – podle stoupání P.
//   f = šířka zápichu, r = poloměr, t = radiální hloubka.
// DIN 509: zápich pro výběh broušení – podle průměru d.
//   Forma E: úhel stěny 15°. Forma F: úhel 8°, navíc rovina pro broušení čela.
//
// Hodnoty jsou orientační (zaokrouhlené dle běžně používaných strojírenských
// tabulek) – v dialogu je lze ručně upravit dle konkrétního výkresu/normy.

// t = radiální hloubka POD JMENOVITÝM ⌀ dle DIN 76-1 Forma A: (d − dg)/2,
// kde dg je průměr dna zápichu (P0,5 → d−0,8; P1 → d−1,6; P2,5 → d−3,6;
// P6 → d−8,3). Zápich tak leží ~0,25–0,45 mm POD dnem závitu (H = 0,6134·P)
// — nůž při výběhu do zápichu nesmí řezat do jeho stěn/dna.
/** @type {Array<{p:number, f:number, r:number, t:number}>} */
export const DIN76_TABLE = [
  { p: 0.5,  f: 1.6,  r: 0.2, t: 0.4 },
  { p: 0.6,  f: 1.6,  r: 0.3, t: 0.5 },
  { p: 0.7,  f: 2.0,  r: 0.3, t: 0.55 },
  { p: 0.75, f: 2.0,  r: 0.3, t: 0.6 },
  { p: 0.8,  f: 2.0,  r: 0.3, t: 0.65 },
  { p: 1.0,  f: 3.0,  r: 0.5, t: 0.8 },
  { p: 1.25, f: 3.5,  r: 0.5, t: 1.0 },
  { p: 1.5,  f: 4.0,  r: 0.8, t: 1.15 },
  { p: 1.75, f: 4.5,  r: 0.8, t: 1.3 },
  { p: 2.0,  f: 5.0,  r: 1.0, t: 1.5 },
  { p: 2.5,  f: 6.0,  r: 1.2, t: 1.8 },
  { p: 3.0,  f: 8.0,  r: 1.6, t: 2.2 },
  { p: 3.5,  f: 9.0,  r: 1.6, t: 2.5 },
  { p: 4.0,  f: 11.0, r: 2.0, t: 2.85 },
  { p: 4.5,  f: 12.0, r: 2.0, t: 3.2 },
  { p: 5.0,  f: 14.0, r: 3.0, t: 3.5 },
  { p: 5.5,  f: 16.0, r: 3.0, t: 3.85 },
  { p: 6.0,  f: 18.0, r: 4.0, t: 4.15 },
];

/**
 * Vrátí rozměry zápichu DIN 76-1 pro dané stoupání závitu P [mm].
 * Nejbližší (>=) hodnota z tabulky, jinak poslední řádek.
 * @param {number} pitch
 * @returns {{f:number, r:number, t:number}}
 */
export function lookupDin76(pitch) {
  const p = Number(pitch) || 0;
  for (const row of DIN76_TABLE) {
    if (p <= row.p + 1e-9) return { f: row.f, r: row.r, t: row.t };
  }
  const last = DIN76_TABLE[DIN76_TABLE.length - 1];
  return { f: last.f, r: last.r, t: last.t };
}

/**
 * Tabulka DIN 509 – výběh pro broušení (Forma E / F).
 * Rozsah průměrů d -> { f, t, r, alpha }. alpha = úhel stěny zápichu [°].
 * @type {Array<{dMax:number, f:number, t:number, r:number}>}
 */
export const DIN509_E = [
  { dMax: 10,  f: 1.6, t: 0.1, r: 0.2 },
  { dMax: 18,  f: 2.0, t: 0.2, r: 0.3 },
  { dMax: 80,  f: 3.0, t: 0.3, r: 0.5 },
  { dMax: 500, f: 4.0, t: 0.4, r: 1.0 },
];

export const DIN509_F = [
  { dMax: 10,  f: 1.6, t: 0.1, r: 0.2 },
  { dMax: 18,  f: 2.0, t: 0.2, r: 0.3 },
  { dMax: 80,  f: 3.0, t: 0.3, r: 0.5 },
  { dMax: 500, f: 4.0, t: 0.4, r: 1.0 },
];

/**
 * Vrátí rozměry zápichu DIN 509 pro daný průměr d [mm] a formu ('E'|'F').
 * Forma E: úhel stěny 15°, Forma F: úhel 8° (+ rovina pro broušení čela –
 * tu je třeba domodelovat samostatně).
 * @param {number} diameter
 * @param {'E'|'F'} form
 * @returns {{f:number, t:number, r:number, alpha:number}}
 */
export function lookupDin509(diameter, form = 'E') {
  const d = Number(diameter) || 0;
  const table = form === 'F' ? DIN509_F : DIN509_E;
  const alpha = form === 'F' ? 8 : 15;
  for (const row of table) {
    if (d <= row.dMax + 1e-9) return { f: row.f, t: row.t, r: row.r, alpha };
  }
  const last = table[table.length - 1];
  return { f: last.f, t: last.t, r: last.r, alpha };
}

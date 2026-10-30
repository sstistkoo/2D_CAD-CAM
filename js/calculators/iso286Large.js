// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – ISO 286 pro rozměry nad 500 do 3150 mm              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hodnoty v µm převzaté z tabulek ISO 286-2:2010 (Table 1, 3–5, 8–12, 17–28),
// každá zkontrolovaná rozdílem horní − dolní = IT daného rozsahu.
// Pravidla nad 500 mm (podle tabulek normy):
//   - a, b, c, j (a A, B, C, J) nejsou definovány,
//   - k: ei = 0 pro všechny stupně; K: ES = 0,
//   - díry K–S: ES = −ei stejného písmene hřídele BEZ korekce Δ (i N9–N11),
//   - díry D–H: EI = −es, JS/js = ±IT/2.

/** Hlavní rozsahy nad 500 mm (horní meze, mm). */
const MAIN = [630, 800, 1000, 1250, 1600, 2000, 2500, 3150];
/** Jemné podrozsahy pro r a s. */
const FINE = [560, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1600, 1800, 2000, 2240, 2500, 2800, 3150];

/** Základní tolerance IT1–IT18 [µm] (ISO 286-1:2010, tab. 1; IT01 a IT0 nad 500 mm neexistují). */
const IT = [
  [9, 11, 16, 22, 32, 44, 70, 110, 175, 280, 440, 700, 1100, 1750, 2800, 4400, 7000, 11000],
  [10, 13, 18, 25, 36, 50, 80, 125, 200, 320, 500, 800, 1250, 2000, 3200, 5000, 8000, 12500],
  [11, 15, 21, 28, 40, 56, 90, 140, 230, 360, 560, 900, 1400, 2300, 3600, 5600, 9000, 14000],
  [13, 18, 24, 33, 47, 66, 105, 165, 260, 420, 660, 1050, 1650, 2600, 4200, 6600, 10500, 16500],
  [15, 21, 29, 39, 55, 78, 125, 195, 310, 500, 780, 1250, 1950, 3100, 5000, 7800, 12500, 19500],
  [18, 25, 35, 46, 65, 92, 150, 230, 370, 600, 920, 1500, 2300, 3700, 6000, 9200, 15000, 23000],
  [22, 30, 41, 55, 78, 110, 175, 280, 440, 700, 1100, 1750, 2800, 4400, 7000, 11000, 17500, 28000],
  [26, 36, 50, 68, 96, 135, 210, 330, 540, 860, 1350, 2100, 3300, 5400, 8600, 13500, 21000, 33000],
];

// Hřídele d–h: horní úchylka es [µm] po hlavních rozsazích
const ES = {
  d: [-260, -290, -320, -350, -390, -430, -480, -520],
  e: [-145, -160, -170, -195, -220, -240, -260, -290],
  f: [-76, -80, -86, -98, -110, -120, -130, -145],
  g: [-22, -24, -26, -28, -30, -32, -34, -38],
  h: [0, 0, 0, 0, 0, 0, 0, 0],
};
// Hřídele k–p: dolní úchylka ei [µm] po hlavních rozsazích
const EI_MAIN = {
  k: [0, 0, 0, 0, 0, 0, 0, 0],
  m: [26, 30, 34, 40, 48, 58, 68, 76],
  n: [44, 50, 56, 66, 78, 92, 110, 135],
  p: [78, 88, 100, 120, 140, 170, 195, 240],
};
// Hřídele r, s: dolní úchylka ei [µm] po jemných podrozsazích
const EI_FINE = {
  r: [150, 155, 175, 185, 210, 220, 250, 260, 300, 330, 370, 400, 440, 460, 550, 580],
  s: [280, 310, 340, 380, 430, 470, 520, 580, 640, 720, 820, 920, 1000, 1100, 1250, 1400],
};

function rangeIndex(bounds, dim) {
  for (let i = 0; i < bounds.length; i++) if (dim <= bounds[i] + 1e-9) return i;
  return -1;
}

/** Základní tolerance ITn [µm] pro rozměr nad 500 do 3150 mm; null mimo rozsah. */
export function itValueLarge(dim, grade) {
  const ri = dim > 500 ? rangeIndex(MAIN, dim) : -1;
  if (ri < 0 || !(grade >= 1 && grade <= 18)) return null;
  return IT[ri][grade - 1];
}

/**
 * Mezní úchylky pole tolerance pro rozměr (500, 3150] mm.
 * @param {string} letter - písmeno (malé = hřídel, velké = díra)
 * @param {number} grade - stupeň IT 1–18
 * @param {number} dim - jmenovitý rozměr mm
 * @returns {{upper:number, lower:number, tol:number}|{error:string}} úchylky v µm
 */
export function deviationsLarge(letter, grade, dim) {
  if (!(dim > 500 && dim <= 3150)) return { error: 'Rozměr mimo rozsah 500–3150 mm' };
  const ri = rangeIndex(MAIN, dim), fi = rangeIndex(FINE, dim);
  const tol = IT[ri][grade - 1];
  const hole = letter !== letter.toLowerCase();
  const l = letter.toLowerCase();

  if (l === 'js') return { upper: tol / 2, lower: -tol / 2, tol };
  if ('abcj'.includes(l)) {
    return { error: 'Pole ' + letter + ' není v ISO 286 pro rozměry nad 500 mm definováno' };
  }
  if (ES[l]) {
    const es = ES[l][ri];
    const EI = 0 - es;                                   // 0 − 0 = +0 (ne −0)
    return hole ? { upper: EI + tol, lower: EI, tol } : { upper: es, lower: es - tol, tol };
  }
  const ei = EI_MAIN[l] ? EI_MAIN[l][ri] : EI_FINE[l][fi];
  const ESh = 0 - ei;
  return hole ? { upper: ESh, lower: ESh - tol, tol } : { upper: ei + tol, lower: ei, tol };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – ISO 286 (tolerance a uložení) – čistý výpočet       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hřídele: a–h → základní úchylka je HORNÍ (es ≤ 0), j–s → DOLNÍ (ei).
// Díry:    A–H → EI = −es stejného písmene hřídele,
//          K, M, N (do IT8) a P–S (do IT7) → ES = −ei + Δ, Δ = ITn − IT(n−1)
//          (pro rozměry nad 3 mm), jinak ES = −ei (K a N nad IT8: ES = 0).
//          J – vlastní tabulka (J6, J7, J8), JS/js = ±IT/2.
// Hodnoty v µm podle ISO 286-2. Rozsah 0–500 mm.

/** Hlavní rozsahy jmenovitých rozměrů (horní meze, mm). */
const MAIN = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
/** Jemné podrozsahy (a, b, c, r, s se uvnitř hlavních rozsahů mění). */
const FINE = [3, 6, 10, 18, 30, 40, 50, 65, 80, 100, 120, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];

/** Základní tolerance IT1–IT18 [µm] po hlavních rozsazích. */
export const IT = [
  [0.8, 1.2, 2, 3, 4, 6, 10, 14, 25, 40, 60, 100, 140, 250, 400, 600, 1000, 1400],
  [1, 1.5, 2.5, 4, 5, 8, 12, 18, 30, 48, 75, 120, 180, 300, 480, 750, 1200, 1800],
  [1, 1.5, 2.5, 4, 6, 9, 15, 22, 36, 58, 90, 150, 220, 360, 580, 900, 1500, 2200],
  [1.2, 2, 3, 5, 8, 11, 18, 27, 43, 70, 110, 180, 270, 430, 700, 1100, 1800, 2700],
  [1.5, 2.5, 4, 6, 9, 13, 21, 33, 52, 84, 130, 210, 330, 520, 840, 1300, 2100, 3300],
  [1.5, 2.5, 4, 7, 11, 16, 25, 39, 62, 100, 160, 250, 390, 620, 1000, 1600, 2500, 3900],
  [2, 3, 5, 8, 13, 19, 30, 46, 74, 120, 190, 300, 460, 740, 1200, 1900, 3000, 4600],
  [2.5, 4, 6, 10, 15, 22, 35, 54, 87, 140, 220, 350, 540, 870, 1400, 2200, 3500, 5400],
  [3.5, 5, 8, 12, 18, 25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300],
  [4.5, 7, 10, 14, 20, 29, 46, 72, 115, 185, 290, 460, 720, 1150, 1850, 2900, 4600, 7200],
  [6, 8, 12, 16, 23, 32, 52, 81, 130, 210, 320, 520, 810, 1300, 2100, 3200, 5200, 8100],
  [7, 9, 13, 18, 25, 36, 57, 89, 140, 230, 360, 570, 890, 1400, 2300, 3600, 5700, 8900],
  [8, 10, 15, 20, 27, 40, 63, 97, 155, 250, 400, 630, 970, 1550, 2500, 4000, 6300, 9700],
];

// Hřídele a–h: horní úchylka es [µm]
const ES_FINE = {     // po jemných podrozsazích
  a: [-270, -270, -280, -290, -300, -310, -320, -340, -360, -380, -410, -460, -520, -580, -660, -740, -820, -920, -1050, -1200, -1350, -1500, -1650],
  b: [-140, -140, -150, -150, -160, -170, -180, -190, -200, -220, -240, -260, -280, -310, -340, -380, -420, -480, -540, -600, -680, -760, -840],
  c: [-60, -70, -80, -95, -110, -120, -130, -140, -150, -170, -180, -200, -210, -230, -240, -260, -280, -300, -330, -360, -400, -440, -480],
};
const ES_MAIN = {     // po hlavních rozsazích
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
// Hřídele j–s: dolní úchylka ei [µm]
const EI_MAIN = {
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],          // IT4–IT7; ostatní stupně ei = 0
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};
const EI_FINE = {
  r: [10, 15, 19, 23, 28, 34, 34, 41, 43, 51, 54, 63, 65, 68, 77, 80, 84, 94, 98, 108, 114, 126, 132],
  s: [14, 19, 23, 28, 35, 43, 43, 53, 59, 71, 79, 92, 100, 108, 122, 130, 140, 158, 170, 190, 208, 232, 252],
};
// j: dolní úchylka ei pro j5, j6, j7
const J_SHAFT = {
  5: [-2, -2, -2, -3, -4, -5, -7, -9, -11, -13, -16, -18, -20],
  6: [-4, -2, -2, -3, -4, -5, -7, -9, -11, -13, -16, -18, -20],
  7: [-4, -4, -5, -6, -8, -10, -12, -15, -18, -21, -26, -28, -32],
};
// J: horní úchylka ES pro J6, J7, J8
const J_HOLE = {
  6: [2, 5, 5, 6, 8, 10, 13, 16, 18, 22, 25, 29, 33],
  7: [4, 6, 8, 10, 12, 14, 18, 22, 26, 30, 36, 39, 43],
  8: [6, 10, 12, 15, 20, 24, 28, 34, 41, 47, 55, 60, 66],
};

export const SHAFT_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'js', 'j', 'k', 'm', 'n', 'p', 'r', 's'];
export const HOLE_LETTERS = SHAFT_LETTERS.map(l => l.toUpperCase());

function rangeIndex(bounds, dim) {
  for (let i = 0; i < bounds.length; i++) if (dim <= bounds[i] + 1e-9) return i;
  return -1;
}

/** Základní tolerance ITn [µm] pro rozměr; null mimo rozsah. */
export function itValue(dim, grade) {
  const ri = dim > 0 ? rangeIndex(MAIN, dim) : -1;
  if (ri < 0 || !(grade >= 1 && grade <= 18)) return null;
  return IT[ri][grade - 1];
}

function shaftFundamental(letter, ri, fi, grade) {
  if (ES_FINE[letter]) return { es: ES_FINE[letter][fi] };
  if (ES_MAIN[letter]) return { es: ES_MAIN[letter][ri] };
  if (letter === 'k') return { ei: grade >= 4 && grade <= 7 ? EI_MAIN.k[ri] : 0 };
  if (EI_MAIN[letter]) return { ei: EI_MAIN[letter][ri] };
  if (EI_FINE[letter]) return { ei: EI_FINE[letter][fi] };
  return null;
}

/**
 * Mezní úchylky pole tolerance.
 * @param {string} letter - písmeno (malé = hřídel, velké = díra), např. 'H', 'g', 'js', 'JS'
 * @param {number} grade - stupeň IT 1–18
 * @param {number} dim - jmenovitý rozměr (0, 500] mm
 * @returns {{upper:number, lower:number, tol:number}|{error:string}} úchylky v µm
 */
export function deviations(letter, grade, dim) {
  if (!(dim > 0 && dim <= 500)) return { error: 'Rozměr mimo rozsah 0–500 mm' };
  if (!Number.isInteger(grade) || grade < 1 || grade > 18) return { error: 'Stupeň IT musí být 1–18' };
  const ri = rangeIndex(MAIN, dim), fi = rangeIndex(FINE, dim);
  const tol = IT[ri][grade - 1];
  const hole = letter !== letter.toLowerCase();
  const l = letter.toLowerCase();
  if (!SHAFT_LETTERS.includes(l)) return { error: 'Neznámé písmeno ' + letter };

  if (l === 'js') return { upper: tol / 2, lower: -tol / 2, tol };

  if (l === 'j') {
    const tbl = hole ? J_HOLE[grade] : J_SHAFT[grade];
    if (!tbl) return { error: (hole ? 'J' : 'j') + grade + ' není v ISO 286 definováno (' + (hole ? 'J6–J8' : 'j5–j7') + ')' };
    return hole ? { upper: tbl[ri], lower: tbl[ri] - tol, tol } : { upper: tbl[ri] + tol, lower: tbl[ri], tol };
  }

  if (!hole) {
    const f = shaftFundamental(l, ri, fi, grade);
    return f.es !== undefined ? { upper: f.es, lower: f.es - tol, tol } : { upper: f.ei + tol, lower: f.ei, tol };
  }

  // Díry
  if ('abcdefgh'.includes(l)) {
    const EI = 0 - shaftFundamental(l, ri, fi, grade).es;     // 0 − 0 = +0 (ne −0)
    return { upper: EI + tol, lower: EI, tol };
  }
  const over3 = dim > 3;
  const delta = over3 && grade >= 2 ? IT[ri][grade - 1] - IT[ri][grade - 2] : 0;
  let ES;
  if (l === 'k') {
    const ei = EI_MAIN.k[ri];                          // hodnota pro IT4–IT7
    ES = !over3 ? 0 : grade <= 8 ? -ei + delta : 0;
  } else if (l === 'm') {
    const ei = EI_MAIN.m[ri];
    ES = !over3 ? -2 : grade <= 8 ? -ei + delta : -ei;
  } else if (l === 'n') {
    const ei = EI_MAIN.n[ri];
    ES = !over3 ? -4 : grade <= 8 ? -ei + delta : 0;
  } else {                                             // p, r, s
    const ei = shaftFundamental(l, ri, fi, grade).ei;
    ES = grade <= 7 ? -ei + delta : -ei;
  }
  return { upper: ES, lower: ES - tol, tol };
}

/**
 * Uložení díra/hřídel.
 * @returns {{hole, shaft, maxClearance:number, minClearance:number, type:'vůle'|'přechodné'|'přesah'}|{error:string}}
 *   vůle v µm (záporná = přesah)
 */
export function fit(holeLetter, holeGrade, shaftLetter, shaftGrade, dim) {
  const hole = deviations(holeLetter, holeGrade, dim);
  if (hole.error) return hole;
  const shaft = deviations(shaftLetter, shaftGrade, dim);
  if (shaft.error) return shaft;
  const maxClearance = hole.upper - shaft.lower, minClearance = hole.lower - shaft.upper;
  const type = minClearance >= 0 ? 'vůle' : maxClearance <= 0 ? 'přesah' : 'přechodné';
  return { hole, shaft, maxClearance, minClearance, type };
}

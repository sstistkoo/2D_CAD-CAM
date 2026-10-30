import { describe, it, expect } from 'vitest';
import { deviations, fit, itValue } from '../js/calculators/iso286.js';

// Referenční hodnoty [horní, dolní] µm opsané z tabulek ISO 286-2:2010 (rozměry nad 500 mm).
// Každý řádek = jiný rozsah, ať se chytí posun indexu i chyba v jediné hodnotě.
const REF = [
  // Table 18 (d)
  ['d', 7, 600, -260, -330], ['d', 11, 600, -260, -700], ['d', 11, 3000, -520, -1870],
  // Table 19 (e)
  ['e', 6, 700, -160, -210], ['e', 10, 2400, -260, -960],
  // Table 20 (f)
  ['f', 7, 900, -86, -176], ['f', 9, 3150, -145, -685],
  // Table 21 (g)
  ['g', 6, 1100, -28, -94], ['g', 8, 2600, -38, -368],
  // Table 22 (h)
  ['h', 6, 1500, 0, -78], ['h', 11, 2200, 0, -1100],
  // Table 23 (js)
  ['js', 9, 550, 87.5, -87.5], ['js', 7, 1800, 75, -75],
  // Table 24 (k)
  ['k', 6, 600, 44, 0], ['k', 13, 2500, 2800, 0],
  // Table 25 (m, n)
  ['m', 6, 1000, 90, 34], ['m', 7, 3000, 286, 76], ['n', 6, 1200, 132, 66], ['n', 7, 1700, 242, 92],
  // Table 26 (p)
  ['p', 6, 700, 138, 88], ['p', 8, 2100, 475, 195], ['p', 8, 3000, 570, 240],
  // Table 27 (r) – jemné podrozsahy
  ['r', 6, 520, 194, 150], ['r', 6, 600, 199, 155], ['r', 8, 2300, 740, 460], ['r', 7, 3150, 790, 580],
  // Table 28 (s) – jemné podrozsahy
  ['s', 6, 750, 430, 380], ['s', 7, 1300, 765, 640], ['s', 8, 2900, 1730, 1400],
  // Table 3 (D, E)
  ['D', 7, 600, 330, 260], ['D', 13, 3000, 3820, 520], ['E', 9, 1500, 530, 220],
  // Table 4, 5 (F, G)
  ['F', 6, 600, 120, 76], ['F', 9, 2600, 685, 145], ['G', 7, 900, 116, 26],
  // Table 8 (K) – ES = 0
  ['K', 6, 600, 0, -44], ['K', 8, 2600, 0, -330],
  // Table 9 (M, N) – bez korekce Δ, N9 také −ei
  ['M', 6, 600, -26, -70], ['M', 8, 2600, -76, -406], ['N', 7, 900, -56, -146], ['N', 9, 600, -44, -219],
  // Table 10–12 (P, R, S)
  ['P', 9, 3000, -240, -780], ['R', 6, 1000, -220, -276], ['R', 7, 750, -185, -265], ['S', 7, 2400, -1100, -1275],
];

describe('ISO 286 nad 500 do 3150 mm (tabulky ISO 286-2:2010)', () => {
  it.each(REF)('%s%i Ø%i → %d / %d', (letter, grade, dim, up, lo) => {
    const r = deviations(letter, grade, dim);
    expect(r.error).toBeUndefined();
    expect(r.upper).toBe(up);
    expect(r.lower).toBe(lo);
  });

  it('IT nad 500 mm (tab. 1) a hranice rozsahů', () => {
    expect(itValue(500, 7)).toBe(63);      // 500 patří ještě do 400–500
    expect(itValue(500.01, 7)).toBe(70);
    expect(itValue(630, 6)).toBe(44);
    expect(itValue(3150, 18)).toBe(33000);
    expect(itValue(3151, 7)).toBeNull();
  });

  it('a, b, c, j nad 500 mm nejsou definovány', () => {
    for (const l of ['a', 'B', 'c', 'j', 'J']) expect(deviations(l, 8, 800).error).toBeTruthy();
  });

  it('H a K bez záporné nuly', () => {
    expect(Object.is(deviations('H', 7, 1000).lower, 0)).toBe(true);
    expect(Object.is(deviations('K', 7, 1000).upper, 0)).toBe(true);
  });

  it('uložení H7/s6 Ø800 je s přesahem', () => {
    const f = fit('H', 7, 's', 6, 800);
    expect(f.type).toBe('přesah');
    expect(f.minClearance).toBe(-430);    // 0 − 430
    expect(f.maxClearance).toBe(-300);    // 80 − 380
  });
});

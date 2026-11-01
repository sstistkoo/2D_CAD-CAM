// SBL: cíl přehrávání = konec bloku, který právě běží (cam/sim/singleBlock.js).
// Uživatel 1. 11. 2026: SBL zapnutý ZA BĚHU se nezastavil po dokončeném řádku —
// cíl se počítal jen při ▶, přepnutí za běhu teď volá totéž.
import { describe, it, expect } from 'vitest';
import { nextBlockTarget } from '../js/calculators/cam/sim/singleBlock.js';

const path = [0, 0, 1, 1, 1, 2, 3].map(li => ({ originalLineIdx: li }));   // 7 bodů, total 6

describe('nextBlockTarget', () => {
  it('z prvního bloku na začátek dalšího', () => {
    expect(nextBlockTarget(path, 0)).toBeCloseTo(2 / 6, 9);
  });
  it('uprostřed bloku 1 → konec bloku 1', () => {
    expect(nextBlockTarget(path, 3 / 6)).toBeCloseTo(5 / 6, 9);
  });
  it('poslední blok → konec programu', () => {
    expect(nextBlockTarget(path, 1)).toBe(1);
    expect(nextBlockTarget([{ originalLineIdx: 0 }], 0)).toBe(1);
  });
  it('ze zastávky na i/total vždy dál (plovoucí čárka)', () => {
    // floor(i/total·total) === i − 1 u části i — dřív cíl = aktuální pozice.
    const total = 8000;
    const p = Array.from({ length: total + 1 }, (_, i) => ({ originalLineIdx: i }));
    for (let i = 1; i < total; i++) expect(nextBlockTarget(p, i / total)).toBeGreaterThan(i / total);
  });
});

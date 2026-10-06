import { describe, it, expect } from 'vitest';
import { iso965Limits, gradeTolerances, tapDrill, threadPercent, roundR40 } from '../js/calculators/iso965.js';

const r3 = (x) => Math.round(x * 1000) / 1000;
const lim = (D, P, e = '6g', i = '6H') => {
  const t = iso965Limits(D, P, e, i);
  return { d: [r3(t.d_max), r3(t.d_min)], d2: [r3(t.d2_max), r3(t.d2_min)], D2: [r3(t.D2_min), r3(t.D2_max)], D1: [r3(t.D1_min), r3(t.D1_max)] };
};

// Mezní rozměry z tabulek ISO 965-2 (6g / 6H)
describe('ISO 965 – tolerance 6g/6H', () => {
  it('M6×1', () => expect(lim(6, 1)).toEqual({ d: [5.974, 5.794], d2: [5.324, 5.212], D2: [5.350, 5.500], D1: [4.917, 5.153] }));
  it('M10×1,5', () => expect(lim(10, 1.5)).toEqual({ d: [9.968, 9.732], d2: [8.994, 8.862], D2: [9.026, 9.206], D1: [8.376, 8.676] }));
  it('M16×2', () => expect(lim(16, 2)).toEqual({ d: [15.962, 15.682], d2: [14.663, 14.503], D2: [14.701, 14.913], D1: [13.835, 14.210] }));
  it('M20×2,5', () => expect(lim(20, 2.5)).toEqual({ d: [19.958, 19.623], d2: [18.334, 18.164], D2: [18.376, 18.600], D1: [17.294, 17.744] }));
});

describe('ISO 965 – ostatní stupně (M10×1,5)', () => {
  it('4g: Td2 85, Td 150; 8g: Td 375; 7H: TD2 224, TD1 375; 5H: TD1 236', () => {
    expect(gradeTolerances(10, 1.5, 4)).toMatchObject({ Td2: 85, Td: 150 });
    expect(gradeTolerances(10, 1.5, 8).Td).toBe(375);
    expect(gradeTolerances(10, 1.5, 7)).toMatchObject({ TD2: 224, TD1: 375 });
    expect(gradeTolerances(10, 1.5, 5).TD1).toBe(236);
  });
  it('řada R40', () => {
    expect(roundR40(233.3)).toBe(236);
    expect(roundR40(174.24)).toBe(180);
    expect(roundR40(305.5)).toBe(300);
  });
});

describe('vrták pro předvrtání', () => {
  it('normové vrtáky DIN 336 pro hrubé i jemné závity', () => {
    const cases = [[3, 0.5, 2.5], [4, 0.7, 3.3], [5, 0.8, 4.2], [6, 1, 5], [8, 1.25, 6.8], [10, 1.5, 8.5], [12, 1.75, 10.2],
      [16, 2, 14], [20, 2.5, 17.5], [24, 3, 21], [30, 3.5, 26.5], [36, 4, 32], [42, 4.5, 37.5], [48, 5, 43],
      [10, 1, 9], [12, 1.5, 10.5], [20, 1.5, 18.5]];
    for (const [D, P, drill] of cases) expect(tapDrill(D, P)).toBe(drill);
  });
  it('podíl závitu: M10 vrták 8,5 ≈ 77 %', () => {
    expect(threadPercent(10, 1.5, 8.5)).toBeCloseTo(76.98, 1);
  });
});

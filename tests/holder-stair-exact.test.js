// Schod od držáku podle PŘESNÉHO obrysu (uživatel 24. 11. 2026): o kolik smí
// špička za konec mělčí vrstvy = nejlevější bod části obrysu ve výškách schodu,
// ne celého držáku. long-pclnr-valley: zbytek Z237–345 26,6 → 11,6 mm, bez kolize.
import { describe, it, expect } from 'vitest';
import { minZInXBand } from '../js/calculators/cam/toolEnvelope.js';

describe('minZInXBand — nejnižší Z obrysu v pásu výšek', () => {
  // Držák: u špičky úzký (z ≥ −1 do výšky 5), výš široký (z −4).
  const holder = [{ x: 0, z: 0 }, { x: 0, z: -1 }, { x: 5, z: -1 }, { x: 5, z: -4 }, { x: 30, z: -4 }, { x: 30, z: 2 }, { x: 0, z: 2 }];
  it('pás u špičky vidí jen úzkou část', () => {
    expect(minZInXBand(holder, 0, 2.5)).toBeCloseTo(-1, 6);
  });
  it('pás přes rozšíření vidí širokou část', () => {
    expect(minZInXBand(holder, 4, 7)).toBeCloseTo(-4, 6);
  });
  it('pás mimo obrys → null', () => {
    expect(minZInXBand(holder, 40, 50)).toBe(null);
  });
});

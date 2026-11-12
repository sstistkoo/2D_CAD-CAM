// NC program × nezávislý interpret — karusel, překlopené osy, zápis v poloměru.
// Co a proč se hlídá: viz hlavička cam-nc-roundtrip.test.js. Odděleno do
// vlastního souboru, aby obě části běžely paralelně (každá ~1–2 min).
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { roundtripProblems } from './helpers/ncRoundtrip.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cases = join(__dirname, 'fixtures', 'cam-cases');
const lathe = join(__dirname, 'fixtures', 'cam');
// Výběr karuselových dílů do ~10 s na díl × 3 systémy (všech 14 by trvalo ~200 s,
// `carousel-contour-ends-on-stock-end` sám 53 s). Pokrývá čelně po X, kapsu,
// úseky, cik cak i od středu za osu. Hlídají dialekt a prohození os, ne strategii,
// takže stačí výběr; nový karuselový díl s oblouky sem přidej, je-li rychlý.
const carousel = [
  'carousel-face-swap-xz.camprog', 'carousel-pocket-buried-corner.camprog', 'carousel-rim-side-touch.camprog',
  'carousel-sections3.camprog', 'carousel-zigzag-ap6.camprog', 'carousel-zigzag-center-u3-beyond.camprog',
  'carousel-zigzag-po-x.camprog',
];

describe('karusel × 3 řídicí systémy', () => {
  for (const f of carousel) {
    it(f, async () => {
      expect(await roundtripProblems(join(cases, f))).toEqual([]);
    });
  }
});

// Díly s oblouky ve hrubování i dokončení — tam se projeví prohození G2/G3.
// part-22: 21 oblouků zprava, part-21: zleva (zrcadlený svět).
const VARIANTS = [
  ['part-22-round-r10.camprog', 'zespodu (flipX)', { flipX: true }],
  ['part-22-round-r10.camprog', 'otočená Z (flipZ)', { flipZ: true }],
  ['part-22-round-r10.camprog', 'flipX + flipZ', { flipX: true, flipZ: true }],
  ['part-21-zleva-insert-shadow.camprog', 'zleva + zespodu (flipX)', { flipX: true }],
  ['part-21-zleva-insert-shadow.camprog', 'X v poloměru (DIAMOF)', { params: { mode: 'DIAMOF' } }],
];

describe('překlopené osy a zápis v poloměru × 3 řídicí systémy', () => {
  for (const [f, name, v] of VARIANTS) {
    it(`${f} – ${name}`, async () => {
      expect(await roundtripProblems(join(lathe, f), v)).toEqual([]);
    });
  }
  it('karusel – X v poloměru (DIAMOF)', async () => {
    expect(await roundtripProblems(join(cases, 'carousel-face-swap-xz.camprog'), { params: { mode: 'DIAMOF' } })).toEqual([]);
  });
});

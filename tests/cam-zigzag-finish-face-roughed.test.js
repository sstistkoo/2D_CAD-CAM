// Dokončení po čele ke spodku cik caku (pravidlo 20) jen po VYHRUBOVANÉM čele
// (audit 24. 11. 2026): karusel u3-beyond `N1150` sjížděl svisle 33,7 mm
// a pod nosem měl 23,9 mm neubraného polotovaru (floorFinishFace bez kontroly).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cik cak: svislý nájezd dokončení jen po vyhrubovaném čele', () => {
  it('carousel-zigzag-center-u3-beyond: žádné strmé zanoření ani kolize', () => {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/cam_rules_check.mjs'),
      join(ROOT, 'tests/fixtures/cam-cases/carousel-zigzag-center-u3-beyond.camprog'), '--all', '--jobs=1'], { encoding: 'utf8', maxBuffer: 1 << 24 });
    expect(out).toMatch(/P6 zanoření strměji než dovoleno: 0/);
    expect(out).toMatch(/P2 kolize: 0/);
  }, 240000);
});

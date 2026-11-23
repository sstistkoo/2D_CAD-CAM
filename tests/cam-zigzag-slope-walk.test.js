// Cik cak: jízda obrácené vrstvy po MÍRNÉM SVAHU jede až nahoru (audit
// 23. 11. 2026, pravidlo 3 „zbytek na dně" + pravidlo 20 „po stěně vyjede
// o vrstvu nahoru"). lathe-zigzag-left-10: kužel X45 → X39 přes 169 mm
// (Z673–842). Jízda po offsetu „přes vršek" měla strop 4R + 4ap, skončila na
// Z772,6 a pás pod vrstvou o ap výš (Z673–769, až 4 mm nad přídavkem) nevzal
// nikdo — ani dokončování. `slopeOn` v cam/ops/zigzagReverse.js.
// Karuselové dvojče (prohozené osy): carousel-zigzag-center-wedge.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cik cak: jízda po mírném svahu jede až ke stěně', () => {
  it.each(['lathe-zigzag-left-10', 'carousel-zigzag-center-wedge'])('%s', (f) => {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/cam_rules_check.mjs'),
      join(ROOT, `tests/fixtures/cam-cases/${f}.camprog`), '--all'], { encoding: 'utf8', maxBuffer: 1 << 24 });
    expect(out).toMatch(/P2 kolize: 0/);
    expect(out).toMatch(/P3 tříska větší než ap: 0/);
    // Žádný zbytek na dně v pásu kužele Z673–842 (kromě konce u Z842+).
    const floors = [...out.matchAll(/Z (\d+\.\d)…(\d+\.\d): až/g)].map((m) => [+m[1], +m[2]]);
    expect(floors.filter(([a, b]) => a < 800 && b > 680)).toEqual([]);
  }, 180000);
});

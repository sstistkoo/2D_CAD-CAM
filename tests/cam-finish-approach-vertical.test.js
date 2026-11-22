// Nájezd dokončování svisle jen na hotovo (pravidlo 15, uživatel 22. 11. 2026:
// „nájezd do hloubky na hotovo by mohl jít svisle dolů, když by materiál jenom
// objížděl — pokud by bral jenom na hotovo a plátek by to dovolil").
//  • part-24 (polygon, strop plátku 15°): přibližovací bod rampy stál v
//    materiálu, rychloposuv k němu dojel svisle posuvem `N750 G1 X16.489`
//    0,34 mm při přídavku 0,2 → bod se posune po přímce rampy do vzduchu.
//  • round-r10-finish-steep-arc (kulatá R10, přídavek 0): „hrana materiálu"
//    se hledala jen pod středem nosu, svislý sjezd vedle hrany bral bokem
//    0,79 mm (`N910 G1 X18.743`) → hrana = volné celé okno nosu.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('nájezd dokončování svisle jen na hotovo (P6, pravidlo 15)', () => {
  it.each(['cam/part-24-zleva-finish-ramp', 'cam-cases/round-r10-finish-steep-arc'])('%s', (f) => {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/cam_rules_check.mjs'),
      join(ROOT, `tests/fixtures/${f}.camprog`)], { encoding: 'utf8', maxBuffer: 1 << 24 });
    expect(out).toMatch(/P6 zanoření strměji než dovoleno: 0/);
    expect(out).toMatch(/P2 kolize: 0/);
  }, 180000);
});

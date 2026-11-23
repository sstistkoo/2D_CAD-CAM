// Koncový vzduch dojezdu se nejede (audit 22. 11. 2026, pravidlo 5).
// Dojezd „bez schodků" polygonu po šikmé stěně nahoru na vršek schodu:
// klínek mezi koncem vrstvy a stěnou ubrala hlavní hrana už během vrstvy,
// takže úsek po stěně jel posuvem vzduchem — part-21 (zleva) `N400 G1
// X30.738 Z-1.293` 3,3 mm a part-14 na každé vrstvě. Koncové šikmé úsečky,
// které celou destičkou z plánovacího zbytku nic neuberou, se zahodí
// (`dropAirTail` v cam/ops/roughEmit.js); jen polygon.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('dojezd polygonu po stěně nejede posuvem vzduchem (P5)', () => {
  it.each(['part-21-zleva-insert-shadow', 'part-14-finish-holder'])('%s', (f) => {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/cam_rules_check.mjs'),
      join(ROOT, `tests/fixtures/cam/${f}.camprog`)], { encoding: 'utf8', maxBuffer: 1 << 24 });
    expect(out).toMatch(/P5 posuv vzduchem: 0/);
    expect(out).toMatch(/P2 kolize: 0/);
  }, 180000);
});

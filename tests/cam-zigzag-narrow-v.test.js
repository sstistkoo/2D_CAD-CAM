// Cik cak v úzkém V: rampa mezi vrstvami spodku pod úhlem zanoření, ne zostřená
// (uživatel 24. 11. 2026, pravidlo 3 výjimka + pravidlo 6). Dřív se rampa
// zkrátila na šířku další vrstvy: lathe-zigzag-left-10 `N2710` 8 mm dolů na
// 5,3 mm (56°), karusel wall-steps `N2400` 78° s plným ap 10 (emise sjela
// z výšky přejezdu jedním G1). Zbývají jen svislá dojetí (88–90°, skupina A).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fitRampLayers } from '../js/calculators/cam/ops/zigzagFloor.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cik cak: rampa v úzkém V pod úhlem zanoření', () => {
  it.each(['lathe-zigzag-left-10', 'carousel-zigzag-wall-steps'])('%s: žádná rampa 50–85°', (f) => {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/cam_rules_check.mjs'),
      join(ROOT, `tests/fixtures/cam-cases/${f}.camprog`), '--all', '--jobs=1'], { encoding: 'utf8', maxBuffer: 1 << 24 });
    const degs = [...out.matchAll(/N\d+: (\d+)° \(smí 45°\)/g)].map((m) => +m[1]);
    expect(degs.filter((d) => d > 50 && d < 85)).toEqual([]);
    expect(out).toMatch(/P2 kolize: 0/);
  }, 240000);

  it('fitRampLayers vloží mezivrstvu, aby se rampa vešla; jámu nechá', () => {
    // V se zužuje: vrstva X47 je široká 5,8 mm, rampa o 8 mm pod 45° potřebuje 8 mm.
    const W = { wallLeft: (X, c) => c - (X - 40) * 0.6, wallRight: (X, c) => c + (X - 40) * 0.6 };
    const L = [{ X: 55, a: -9, b: 9 }, { X: 47, a: -2.9, b: 2.9 }];
    const out = fitRampLayers(L, 63, 1, W, 50);
    expect(out.length).toBe(3);
    expect(out[1].fitted).toBe(true);
    expect(55 - out[1].X).toBeCloseTo(5.3, 5);   // rampa = šířka vrstvy − 0,5
    // Jáma: vrstva užší než 1,5 mm → beze změny.
    expect(fitRampLayers([{ X: 55, a: -9, b: 9 }, { X: 47, a: -0.6, b: 0.6 }], 63, 1, W, 50).length).toBe(2);
  });
});

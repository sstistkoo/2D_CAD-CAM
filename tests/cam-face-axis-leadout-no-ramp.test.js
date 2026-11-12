// Čelní hrubování (soustruh, PSKNR −15°, odlitek; díl uživatele 12. 11. 2026):
//  1) dojezd „bez schodků" u čela nesmí brát offset OSOVÉ hrany (X −1) —
//     emise jela z konce vrstvy šikmo přes roh hotové kontury
//     (`N690 G1 X-1.000 Z846.000`);
//  2) příjezd v X na začátek čelní vrstvy je řez, ne zanoření — žádná rampa
//     s couvnutím v Z do obrobeného (`G0 Z682.443` → `G1 X239.150 Z588.000
//     ; Zanoření 15.0°`);
//  3) rychloposuv na začátek vrstvy u šikmé stěny odlitku nesmí zůstat vysoko
//     kvůli FANTOMOVÝM schodům v plánovacím modelu (řezal se úzkou stopou):
//     Z580 začínala na X236,7 a 30 mm jela vzduchem; teď u vršku vrstvy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');

describe('čelně: dojezd u osy a příjezd na vrstvu', () => {
  it('hrubování nejede za osu (X < 0) a nemá rampu zanoření', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'lathe-face-casting-axial.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    const rough = r.gcode.split('; --- DOKONCOVANI ---')[0];
    expect(rough).not.toMatch(/G1 X-\d/);
    expect(rough).not.toMatch(/Zanoření/);
    // Průchod 14 dojede po offsetu čela přímo k ose.
    expect(rough).toMatch(/G1 X29\.301 F0\.48\n[^\n]*G1 X0\.000 Z847\.005/);
    // Vrstva Z580 (konec X174,858): rychloposuv dolů až k vršku vrstvy, ne na X236.
    const m = rough.match(/G0 X([\d.]+)\n[^\n]*G1 X174\.858 F/);
    expect(m, 'vrstva Z580').toBeTruthy();
    expect(+m[1]).toBeLessThan(225);
    // 4) Z456 (průchod 84): zadní hrana destičky smí k offsetové čáře pásu ZA
    //    vrstvou (X127 → konec 130,85), ne nad vlastní řezanou vrstvu (135,94).
    const p84 = r.calc.passes.find(p => p.type === 'face' && Math.abs(p.z - 456) < 0.01);
    expect(p84 && p84.xEnd).toBeLessThan(131.5);
  }, 120000);
});

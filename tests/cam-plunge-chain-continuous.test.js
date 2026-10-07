// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – pravidlo 14: řetěz zanoření bez odjezdu                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// docs/cam-pravidla.md, pravidlo 14 (uživatel 7. 10. 2026). Díl uživatele
// `projekt_2026-10-07 (3)`, úsek 3 (kulatá R 10, 45°): za čelem dílu
// rampa `N3110 G1 X33.666 Z-11.749`, pak `N3120 G0 Z-18.996` (tělo vrstvy
// vzduchem za koncem polotovaru), odskok `N3130 G1 X35.666 Z-16.996`
// a návrat na konec rampy k další rampě. Tělo za rampou, které ze
// skutečného polotovaru nic neubere, odpadne — další rampa navazuje
// bez odskoku, jeden souvislý sjezd.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('pravidlo 14 na dílu uživatele (úsek 3, kulatá R 10, 45°)', () => {
  it('řetěz ramp za čelem jede souvisle — žádný rychloposuv za polotovar a návrat', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'round-r10-plunge-chain-end.camprog'), 'utf8'));
    const { gcode } = await runCamProg(prog);
    const lines = gcode.split('\n');
    const a = lines.findIndex(l => /HRUBOVANI/.test(l)), b = lines.findIndex(l => /DOKONCOVANI/.test(l));
    const rough = lines.slice(a, b).filter(l => /^N\d+/.test(l));
    // Konec první rampy za čelem a hned na něj navazující další rampa.
    const k = rough.findIndex(l => /G1 X33\.666 Z-11\.749/.test(l));
    expect(k, rough.join('\n')).toBeGreaterThan(0);
    expect(rough[k + 1]).toMatch(/G1 X29\.666 Z-15\.749 ; Rampa/);
    // Polotovar končí na Z −8 — nic nejede na Z −18,996 (tělo vzduchem).
    expect(rough.filter(l => /Z-1[6-9]\.\d/.test(l))).toEqual([]);
  });
});

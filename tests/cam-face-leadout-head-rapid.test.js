// Čelní dojezd polygonu nezačíná posuvem vzduchem (audit CAM 25. 11. 2026, pravidlo 5).
// PSKNR −15°: hlavní hrana vezme schod u stěny rovnoběžné s ní celý — úvodní
// úsečka dojezdu po té stěně se jede rychloposuvem `G0 Z` o 0,5 mm před konec.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('čelní dojezd polygonu — úvodní vzduch rychloposuvem', () => {
  it('part-25: po řezu na X51,668 (Z232,932) G0 Z235,35, pak posuv na stěnu', async () => {
    const { gcode } = await runCamProg(load('cam/part-25-face-runout-reversed.camprog'));
    const L = gcode.split('\n').map(l => l.replace(/^N\d+\s*/, '').trim());
    const i = L.findIndex(l => l.startsWith('G1 X51.668'));
    expect(i).toBeGreaterThan(0);
    expect(L[i + 1]).toBe('G0 Z235.350');
    expect(L[i + 2]).toMatch(/^G1 X50\.886 Z235\.850/);
  }, 120000);
});

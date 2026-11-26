// Vjezd vrstvy cik caku vedle dílu (pod nosem v tom Z žádný zbytek) jede
// rychloposuvem až 0,5 nad vrstvu, ne s výchozí vůlí a 3 mm posuvem vzduchem
// (audit CAM 26. 11. 2026, pravidlo 5: lathe-zigzag-wall-steps `N6430`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('cik cak — vjezd vedle dílu rychloposuvem až nad vrstvu', () => {
  it('wall-steps: na Z−14,044 G0 X35,066 a posuv jen 0,5 mm na X34,566', async () => {
    const { gcode } = await runCamProg(load('cam-cases/lathe-zigzag-wall-steps.camprog'));
    const L = gcode.split('\n').map(l => l.replace(/^N\d+\s*/, '').trim());
    const i = L.findIndex(l => l === 'G0 Z-14.044');
    expect(i).toBeGreaterThan(0);
    expect(L[i + 1]).toBe('G0 X35.066');
    expect(L[i + 2]).toMatch(/^G1 X34\.566/);
  }, 120000);
});

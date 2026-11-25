// Sjezd na začátek rampy nezabere spodní hranou polygonu do klínu odlitku
// (audit CAM 25. 11. 2026, pravidlo 6). pocket-wall-at-plunge-angle: vrstva
// X16,978 sjížděla svisle na Z209,927 a hrana destičky brala 4,32 mm² z klínu
// odlitku Z214–219 (pod nosem nic). Rampa se posune po směru řezu.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('rampa do kapsy mimo klín odlitku', () => {
  it('pocket-wall: rampa vrstvy X16,978 začíná až za klínem (Z ≤ 207)', async () => {
    const { gcode } = await runCamProg(load('cam/pocket-wall-at-plunge-angle.camprog'));
    const L = gcode.split('\n').map(l => l.replace(/^N\d+\s*/, '').trim());
    const i = L.findIndex(l => /^G1 X16\.978 Z[\d.]+ ; Rampa/.test(l));
    expect(i).toBeGreaterThan(2);
    const z0 = +L.slice(0, i).reverse().find(l => /^G0 Z/.test(l)).match(/Z([\d.]+)/)[1];
    expect(z0).toBeLessThanOrEqual(207);
    expect(z0).toBeGreaterThan(200);   // posun jen za klín, ne o celou kapsu
  }, 120000);
});

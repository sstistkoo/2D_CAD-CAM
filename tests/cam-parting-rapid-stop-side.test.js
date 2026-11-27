// Rychloposuv upichováku se zastaví podle těla plátku jen na jeho skutečné
// straně (audit CAM 27. 11. 2026, pravidlo 5). Dřív `rapidStopXAt` bral tělo
// souměrně ±span a zastavil nad dnem vedle plátku (X12,924 nad X10,117),
// takže zápich jel 6,5 mm posuvem vzduchem.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('upichovák — zastavení rychloposuvu podle strany těla', () => {
  it('parting-finish-envelope-edge: zápich na Z350,795 jede rychloposuvem na X7,48', async () => {
    const { gcode } = await runCamProg(load('cam-cases/parting-finish-envelope-edge.camprog'));
    const L = gcode.split('\n').map(l => l.replace(/^N\d+\s*/, '').trim());
    const i = L.findIndex(l => l.startsWith('G1 X0.200 Z350.755'));
    expect(i).toBeGreaterThan(3);
    expect(L.slice(i - 4, i)).toEqual(['G0 X12.924', 'G0 Z350.795', 'G0 X7.480', 'G1 X0.106 F0.1']);
  }, 120000);
});

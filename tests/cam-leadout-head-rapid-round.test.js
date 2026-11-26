// Výstup kulaté po stěně, který se v Z stáčí ke stěně a škrtne o ni jen
// tenkým vláskem, začíná rychloposuvem (audit CAM 25. 11. 2026, pravidlo 5).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('dojezd kulaté — úvodní vzduch rychloposuvem i přes vlásek u stěny', () => {
  it('karusel ap 6: po řezu na Z53,062 rychloposuv G0 Z56,944 místo posuvu 4,4 mm', async () => {
    const { gcode } = await runCamProg(load('cam-cases/carousel-zigzag-ap6.camprog'));
    const L = gcode.split('\n').map(l => l.replace(/^N\d+\s*/, '').trim());
    const i = L.findIndex(l => l.startsWith('G1 X423.216'));
    expect(i).toBeGreaterThan(0);
    expect(L[i + 1]).toBe('G0 Z56.944');
    expect(L[i + 2]).toMatch(/^G1 Z57\.444 X423\.069/);
  }, 120000);

  // Dojezd z JEDINÉ úsečky (výstup po stěně o vrstvu výš, ubráno 0) se dřív
  // nezkracoval — `emitLeadOutHeadRapid` se volal jen u víc úseků (audit 26. 11. 2026).
  it('round R10 za úsekem: po vrstvě X15,545 rychloposuv G0 X19,045, posuv jen 0,5 mm', async () => {
    const { gcode } = await runCamProg(load('cam-cases/round-r10-chain-beyond-section.camprog'));
    const L = gcode.split('\n').map(l => l.replace(/^N\d+\s*/, '').trim());
    const i = L.findIndex(l => l.startsWith('G1 Z355.269'));
    expect(i).toBeGreaterThan(0);
    expect(L[i + 1]).toBe('G0 X19.045');
    expect(L[i + 2]).toMatch(/^G1 X19\.545 Z354\.843/);
  }, 120000);
});

// Nájezd dokončování nesmí být kolmý (pravidlo 15), když v jeho koridoru
// stojí jen přídavková slupka po hrubovací rampě.
// Nález uživatele 30. 10. 2026 (Ú2 zleva, part-24): hrubovací rampa 15°
// průchodu s nulovým dnem se nezapsala do zbytkového modelu emise
// (`noteCutPass` ji u nulového dna přeskakuje, emise rampy `noteCutMove`
// nevolala) → dokončování v koridoru „vidělo" 0,87 mm, rampu zahodilo
// a sjelo kolmo `G0 X16.289` → `G1 X14.489`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';
import { getEffectivePlungeAngle } from '../js/calculators/cam/camMath.js';

const prog = () => JSON.parse(readFileSync(new URL('./fixtures/cam/part-24-zleva-finish-ramp.camprog', import.meta.url), 'utf8'));

describe('dokončování: nájezd rampou i po hrubovací rampě', () => {
  it('první řez dokončování jede pod úhlem zanoření, ne kolmo', async () => {
    const { gcode, params } = await runCamProg(prog());
    const lines = gcode.split('\n');
    const fin = lines.findIndex(l => l.includes('DOKONCOVANI'));
    expect(fin).toBeGreaterThan(0);
    let x = null, z = null, move = null;
    for (const l of lines.slice(fin + 1)) {
      const c = l.replace(/;.*$/, '');
      const mx = /X(-?[\d.]+)/.exec(c), mz = /Z(-?[\d.]+)/.exec(c);
      const nx = mx ? +mx[1] : x, nz = mz ? +mz[1] : z;
      if (/\bG1\b/.test(c)) { move = { x0: x, z0: z, x1: nx, z1: nz }; break; }
      x = nx; z = nz;
    }
    expect(move).not.toBeNull();
    const deg = Math.atan2(Math.abs(move.x1 - move.x0), Math.abs(move.z1 - move.z0)) * 180 / Math.PI;
    expect(deg).toBeLessThanOrEqual(getEffectivePlungeAngle(params) + 0.5);
  }, 120000);
});

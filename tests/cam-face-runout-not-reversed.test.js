// Čelní průchod (i doběh na konci úseku) nesmí končit nad svým začátkem —
// jel by posuvem od osy ven, celý vzduchem.
// Nález uživatele 30. 10. 2026 (part-25): hlídání hloubky vrstev
// (`ops/face/layerDepth.js`) zvedlo doběh na Z56,932 na X38,735 nad jeho
// začátek X37,86 a doběh z vynechání vyjímalo → `G0 X37.860` → `G1 X38.735`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const prog = () => JSON.parse(readFileSync(new URL('./fixtures/cam/part-25-face-runout-reversed.camprog', import.meta.url), 'utf8'));

describe('čelní hrubování: průchod nejede od osy ven', () => {
  it('žádný čelní průchod nemá konec nad začátkem', async () => {
    const { calc, gcode } = await runCamProg(prog());
    const reversed = calc.passes.filter(p => p.type === 'face' && p.xEnd >= p.xStart - 0.05)
      .map(p => `Z${p.z.toFixed(3)} X${p.xStart.toFixed(3)}→${p.xEnd.toFixed(3)}`);
    expect(reversed).toEqual([]);
    expect(gcode).not.toMatch(/G1 X38\.735/);
  }, 120000);
});

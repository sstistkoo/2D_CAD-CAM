// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kontura končí na spodním konci polotovaru                ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Karuselový díl uživatele 3. 11. 2026: poslední bod kontury X846 Z0 leží
// přesně na spodku polotovaru (od Z0). Silueta polotovaru rozšířená o R nosu
// přečnívala pod díl a cik cak tam jel 425 obrácených vrstev vzduchem
// (`G0 Z-6.079` / `G1 Z0.521`, pod celým dílem). Oprava: offsetStockEnd.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'carousel-contour-ends-on-stock-end.camprog'), 'utf8'));

describe('CAM: kontura končí na konci polotovaru', () => {
  it('pod dílem (Z < 0, X < 846) nejede žádná vrstva ani rychloposuv', async () => {
    const { gcode, errors } = await runCamProg(prog);
    let x = null;
    const bad = [];
    for (const line of gcode.split('\n')) {
      const mx = /X(-?[\d.]+)/.exec(line), mz = /Z(-?[\d.]+)/.exec(line);
      if (mx) x = parseFloat(mx[1]);
      if (mz && /^N\d+ G[01]/.test(line) && parseFloat(mz[1]) < -1.5 && x !== null && x < 846) bad.push(line);
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(errors.some(e => /vrstev vynecháno/.test(e.msg) && !/ 0 vrstev vynecháno/.test(e.msg))).toBe(false);
  }, 120000);

  it('dokončování nejede po spodním čele pod dílem', async () => {
    const { gcode } = await runCamProg(prog);
    const fin = gcode.slice(gcode.indexOf('DOKONCOVANI'));
    expect(fin).not.toMatch(/G1 X0\.000 Z-/);
  }, 120000);
});

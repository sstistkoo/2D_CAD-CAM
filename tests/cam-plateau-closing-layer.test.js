// Plošina na začátku vrstvy dostane uzavírací vrstvu (audit CAM 25. 11. 2026,
// pravidlo 3). part-13-zleva-flange: plošina příruby X85,02 Z0–38 (offset
// X86,22) leží mezi vrstvami 90,922 a 85,922; hlubší vrstva na ni nepřijede
// a nad plošinou zůstával pás 4,6 mm.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('uzavírací vrstva plošiny na začátku vrstvy', () => {
  it('part-13: vrstva těsně nad offsetem plošiny přes celou přírubu, konec sjezdem po kontuře', async () => {
    const { gcode } = await runCamProg(load('cam/part-13-zleva-flange.camprog'));
    const L = gcode.split('\n').map(l => l.replace(/^N\d+\s*/, '').replace(/\s*;.*$/, '').trim());
    let x = null, z = null, best = null;
    for (let i = 0; i < L.length; i++) {
      const mx = L[i].match(/X(-?[\d.]+)/), mz = L[i].match(/Z(-?[\d.]+)/);
      const nz = mz ? +mz[1] : z;
      if (/^G1/.test(L[i]) && !mx && x !== null && x > 86.22 && x < 86.4 && z <= 0 && nz >= 38) best = i;
      if (mx) x = +mx[1]; if (mz) z = +mz[1];
    }
    expect(best).not.toBeNull();
    // Za plošinou sjezd po kontuře (oblouk), ne konec uprostřed materiálu.
    expect(L[best + 1]).toMatch(/^G2 X85\.\d+ Z4[01]\./);
  }, 120000);
});

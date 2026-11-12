// Karusel Od středu, ap 4, celý program (díl uživatele 11. 11. 2026,
// fixture carousel-center-axis): vrstvy Z170…130 u šikmé stěny odlitku
// X557→597 vjížděly řetězem ramp místo vodorovně ze vzduchu (pravidlo 10/2),
// pod rampami zůstal klín a vrstvy pod ním ho projely držákem; dobrání levé
// kapsy od rohu S1 jelo mezní čarou skrz plný materiál. Dřív 66 nálezů
// (37 443 mm²), teď žádný — i nájezd po mezní čáře k rohu S13 hlídá držák
// proti zbytku (pocketPass.js, pravidlo 2).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { castingAirEntry } from '../js/calculators/cam/ops/long/castingAirEntry.js';
import { pocketPathBuried } from '../js/calculators/cam/ops/long/pocketCornerBuried.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');

describe('castingAirEntry', () => {
  const base = { prms: { stockMode: 'casting' }, entryZ: -568.5, effZMax: 1, currentX: 170, noseLift: 0,
    surfAt: () => 170, holderFits: () => true, rangeCapped: false, regionCapped: false };
  it('vjezd na hraně odlitku se vzduchem nad nosem = bez rampy', () => {
    expect(castingAirEntry(base)).toBe(true);
  });
  it('materiál nad nosem, rozsah, region, válec nebo držák = rampa jako dřív', () => {
    expect(castingAirEntry({ ...base, surfAt: () => 172 })).toBe(false);
    expect(castingAirEntry({ ...base, rangeCapped: true })).toBe(false);
    expect(castingAirEntry({ ...base, regionCapped: true })).toBe(false);
    expect(castingAirEntry({ ...base, prms: { stockMode: 'cylinder' } })).toBe(false);
    expect(castingAirEntry({ ...base, holderFits: () => false })).toBe(false);
    expect(castingAirEntry({ ...base, entryZ: 1 })).toBe(false);
  });
});

describe('pocketPathBuried', () => {
  const passes = [{ type: 'long', x: 178, zStart: -113.9, zEnd: -447.9 }];
  it('trasa 23 mm pod dosaženým dnem je zasypaná, trasa u dna ne', () => {
    expect(pocketPathBuried(passes, [{ type: 'line', x1: 190, z1: -69, x2: 133, z2: -282 }], 4)).toBe(true);
    expect(pocketPathBuried(passes, [{ type: 'line', x1: 177, z1: -120, x2: 176, z2: -200 }], 4)).toBe(false);
  });
  it('model materiálu rozhodne: nad trasou nic nestojí = není zasypaná', () => {
    expect(pocketPathBuried(passes, [{ type: 'line', x1: 190, z1: -69, x2: 133, z2: -282 }], 4, () => 0)).toBe(false);
  });
});

describe('Karusel Od středu, celý program — držák', () => {
  it('žádná kolize držáku (dřív 66 / 37 443 mm²)', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'carousel-center-axis.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    const iss = validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments,
      { planStock: true, maxIssues: 500, backside: true });
    expect(iss).toHaveLength(0);
    // Vrstvy u šikmé stěny odlitku vjíždějí ze vzduchu, ne řetězem ramp od X572.
    expect(r.gcode).not.toMatch(/G1 Z170\.000 X587\.374 ; Rampa/);
  });
});

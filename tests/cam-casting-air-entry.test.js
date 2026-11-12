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

// Soustruh zleva, PSBNR, ap 4 (díl uživatele 12. 11. 2026, Úsek 1 Z −5…700):
// vjezd ze vzduchu na hraně odlitku u pravého hrbu (Z557) přerušil řetěz ramp
// z levého bloku — po `N1450 G1 Z446.980` (X182) se už nezanořovalo a zbytek
// v Z 99–595 narostl z 37 na 87 mm. Běží-li řetěz s kotvou před vjezdem,
// vjezd ze vzduchu se nepoužije (castingAirEntry `chainBefore`).
describe('soustruh zleva — řetěz ramp po čáře od S15', () => {
  it('řetěz navazuje krok za krokem, nájezd kapsy bez posuvu vzduchem, bez kolize', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'lathe-left-ramp-chain-valley.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    const ramps = [...r.gcode.matchAll(/G1 X([\d.]+) Z([\d.]+) ; Rampa/g)].map(m => [+m[1], +m[2]]);
    // Řetěz jde po čáře zanoření od S15 (X190 Z69) krok za krokem o ap 4 /
    // 14,93 mm v Z — X178 navazuje na konec rampy X182 (Z99), ne až na Z236
    // (model zbytku dřív vrstvu X182 přeskočil, roughLong.js `cutFloorSynced`).
    for (let k = 1; k <= 13; k++) {
      const x = 186 - 4 * k, z = 84.06 + 14.928 * k;
      expect(ramps.some(([rx, rz]) => Math.abs(rx - x) < 0.01 && Math.abs(rz - z) < 0.05), `rampa X${x} Z${z.toFixed(1)}`).toBe(true);
    }
    // Nájezd kapsy nejede posuvem po čáře, kterou řetěz už vybral (leadInCutPrefix.js).
    expect(r.gcode).not.toMatch(/G0 Z69\.150\n[^\n]*G1 X133\.000 Z281\.859/);
    expect(r.gcode).not.toMatch(/G1 X57\.152 Z571\.200 F[\d.]+\n/);
    const iss = validateToolpath(r.calcSim.simPath, r.S.params, r.calc.stockPathSegments, { planStock: true, maxIssues: 500, backside: true });
    expect(iss).toHaveLength(0);
  }, 120000);
});

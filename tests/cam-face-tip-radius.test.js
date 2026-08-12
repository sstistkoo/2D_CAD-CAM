// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM čelně – střed nosu × povrch polotovaru (velký rádius)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dráha je STŘED rádiusové kružnice špičky, ne řezný bod: nos sahá o R níž
// a stranou v ose Z až o R do boku. Kdo tyhle dvě soustavy zamění, dostane
// vadu úměrnou rádiusu — u R 0,8 mm neznatelnou, u R 8 mm reálnou (nález
// uživatele 12. 8. 2026, fixture `part-18-face-big-radius`):
//   * konec řezu se filtroval podle JMENOVITÉHO Ø polotovaru (`sRad`), takže
//     u odlitku většího než jmenovka vypadl celý úsek průchodů (30 mm stěny)
//     a hned pod ním najel držák do neobrobeného materiálu,
//   * „sjezd na povrch" vedl HLOUBĚJI než cíl průchodu → nos přes celý
//     přídavek až na hotovou konturu,
//   * nájezdová výška počítaná z povrchu v JEDINÉM Z → rychloposuv bokem
//     nosu skrz kužel odlitku.
//
// Testuje se nad REÁLNÝM pipeline (žádná rekonstrukce geometrie): pozice
// průchodů z `calc.passes`, hotový program přes `validateToolpath` — stejným
// obrysem nástroje, jakým kolize hlásí ⛔ panel v aplikaci.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProgFile } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'cam', 'part-18-face-big-radius.camprog');

describe('Čelní hrubování s velkým rádiusem nosu (R 8 mm)', () => {
  it('program neobsahuje kolize destičky ani držáku', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));
    const { calcSim } = await runCamProgFile(fixture);
    const issues = validateToolpath(calcSim.simPath, prog.params, calcSim.stockPathSegments, {
      backside: prog.params.roughingSide === 'left',
    });
    expect(issues.map(i => `${i.kind} @X${i.x.toFixed(1)} Z${i.z.toFixed(1)} = ${i.area.toFixed(0)} mm²`)).toEqual([]);
  });

  it('žádný čelní průchod nesjede pod svůj cíl (řez do hotové kontury)', async () => {
    const { gcode } = await runCamProgFile(fixture);
    // Čelní průchod emituje samé ČISTĚ RADIÁLNÍ posuvy (`G1 X… F…` bez Z):
    // sjezd na dotyk a řez na cíl — obojí SMĚREM K OSE. Kdyby sjezd vedl pod
    // cíl, musel by se z něj nástroj vracet ven, tedy X mezi dvěma takovými
    // řádky vzroste. Dojezdy po kontuře a odskoky mají v řádku Z, sem nespadnou.
    const back = [];
    let prev = null;
    for (const line of gcode.split('\n')) {
      if (/\bG0\b/.test(line)) { prev = null; continue; }
      const m = /^N\d+ G1 X(-?[\d.]+) F/.exec(line.trim());
      if (!m) { if (/\bG[123]\b/.test(line)) prev = null; continue; }
      const x = parseFloat(m[1]);
      if (prev !== null && x > prev + 1e-6) back.push(`${prev} → ${x}: ${line.trim()}`);
      prev = x;
    }
    expect(back).toEqual([]);
  });

  it('úsek přes největší osazení odlitku se neztratí (souvislé marchování)', async () => {
    const { calc } = await runCamProgFile(fixture);
    const ap = 3;   // depthOfCut fixture
    // Osazení Ø≈129 mezi Z 196…256 je nad jmenovitým Ø polotovaru (111) —
    // právě tam se dřív zahodily všechny průchody podle `sRad`.
    const zs = calc.passes.filter(p => p.type === 'face' && p.z > 200 && p.z < 250)
      .map(p => p.z).sort((a, b) => b - a);
    expect(zs.length).toBeGreaterThan(10);
    const maxGap = zs.slice(1).reduce((m, z, i) => Math.max(m, zs[i] - z), 0);
    expect(maxGap).toBeLessThanOrEqual(ap + 0.01);
  });
});

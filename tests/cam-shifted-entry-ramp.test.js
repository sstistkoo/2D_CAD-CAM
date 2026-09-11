// ╔══════════════════════════════════════════════════════════════╗
// ║  Vjezd POSUNUTÝ obálkou držáku vjíždí rampou, ne zápichem     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hlídání držáku umí posunout začátek prvního intervalu doleva
// (`iv0.zStart = zTry` v `ops/roughLong.js`), aby se vedle vjezdu vešel
// držák. Bránu rampy v `ops/long/openPass.js` ale tvořilo
// `iv.zStart >= entryZ`, tedy „vjezd sedí PŘESNĚ na umělé hranici" — po tom
// posunu propadla a průchod se zanořil KOLMO (90°), přestože je Zanořování
// zapnuté a úhel zanoření je 15°.
//
// Nález uživatele 1. 9. 2026 na dílu ⌀129 × 355 (údolí Z 74–84):
// `N3190 G0 X20.550 / N3200 G1 X13.545 F0.25` — 3 mm radiálního zápichu
// destičkou, která na to není. Táž vada je na `part-17-long-parting`
// (údolí Z 75–84, hloubka X 16,545), a proto se hlídá tady.
//
// Co se tímhle testem CHRÁNÍ (viz komentář u opravy v `openPass.js`):
// kotva se hledá `stockEntryRamp` (přímka zanoření skrz SKUTEČNÝ vjezd), leží
// tedy na téže přímce jako vjezd → `zStart` se nemění a úhel rampy je přesně
// úhel zanoření. Kdyby se kotva vzala z `offsetStockTopXAtZ(entryZ)` jako
// v bloku pro hranici rozsahu, mířila by zpátky tam, odkud hlídání držáku
// vjezd odsunulo — a úhel by nesouhlasil.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';

const fxDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam');

describe('posunutý vjezd (obálka držáku) — rampa místo kolmého zápichu', () => {
  it('part-17: průchod v údolí Z 75–84 vjíždí rampou pod úhlem zanoření', async () => {
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-17-long-parting.camprog'), 'utf8'));
    const { calc, gcode } = await runCamProg(prog);

    // Vrstva, které hlídání držáku posunulo vjezd (X 16,545; údolí mezi
    // Z 75 a 84). Hledá se podle geometrie, ne podle pořadí v poli —
    // to se změnou plánování posouvá.
    // HLOUBKA SE NEPÍŠE NATVRDO (11. 9. 2026): od vlastního žebříku úseku
    // (§5.3 docs/cam-pravidla-drah.md) je ten průchod na X 15,566 místo
    // 16,545. Hledá se tedy podle ROLE — nejmělčí průchod v údolí, kterému
    // hlídání držáku posunulo vjezd, a ten se pozná podle toho, že MÁ rampu.
    const inValley = calc.passes.filter(q => q.type === 'long'
      && q.zStart > 75 && q.zStart < 84 && q.ramp);
    expect(inValley.length, 'v údolí Z 75–84 není žádný rampovaný vjezd').toBeGreaterThan(0);
    const p = inValley.reduce((a, b) => (b.x > a.x ? b : a));
    expect(p.ramp, 'vjezd musí být rampou, ne kolmým zápichem na hloubku').toBeTruthy();

    // Rampa jde ZHORA DOPRAVA (kotva výš v X i v Z) a přesně pod úhlem
    // zanoření — `entryAngle` 15° s vypnutým `entryAngleAuto`.
    const dx = p.ramp.x0 - p.x;
    const dz = p.ramp.z0 - p.zStart;
    expect(dx, 'kotva rampy musí ležet nad hloubkou průchodu').toBeGreaterThan(0.05);
    expect(dz, 'kotva rampy musí ležet před vjezdem v Z').toBeGreaterThan(0);
    expect(dx / dz).toBeCloseTo(Math.tan(15 * Math.PI / 180), 3);

    // A totéž ve VYDANÉM programu: dřív tu stál radiální `G1 X…` bez Z.
    const xTag = p.x.toFixed(3).replace('.', '\.');
    const at = gcode.split('\n').findIndex(l => /Rampa/.test(l) && new RegExp(`X${xTag}`).test(l));
    expect(at, `v G-kódu chybí rampa na X${p.x.toFixed(3)}`).toBeGreaterThan(0);
  }, 120000);
});

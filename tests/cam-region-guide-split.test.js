// ╔══════════════════════════════════════════════════════════════╗
// ║  Hranice úseku = mezní čára, která VYJEDE z polotovaru        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Údolí odlitku samo o sobě díl na úseky NEDĚLÍ. Dělí ho až DOSAH DESTIČKY:
// mezní čára hlídání geometrie (kind 'zanoreni') musí volným koncem vyjet
// Z POLOTOVARU do vzduchu — teprve pak je za ní materiál z téhle strany
// nedostupný a začíná další úsek. Čára, která končí uvnitř polotovaru
// (na hotovní kontuře), hranici nedělá: sweep pokračuje dál a vzduch nad
// údolím přeletí rychloposuvem.
//
// Reálný nález na díle uživatele (part-11/12-zleva, údolí Z≈35): řezalo se
// na dva úseky, takže hluboké průchody prvního zajížděly do Z-zóny druhého,
// kde nad nimi ještě stál materiál → záběr přes Hloubku (ap). Zprava doleva
// se přitom TÝŽ díl bral vcelku (splitIsNeeded hranici zahodil) — asymetrie
// jen podle toho, jestli sweep narazí na stěnu kontury před údolím, nebo za.
//
// Implementace: `guideStaysInStock` v js/calculators/cam/roughingStrategies.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

// Splity z guarded diagnostického háčku v computeRegions (Z je ve VNITŘNÍCH
// souřadnicích strategie — u hrubování zleva zrcadlených, viz zMirror.js).
async function runWithSplits(prog) {
  globalThis.__REGION_LOG__ = [];
  const res = await runCamProg(prog);
  const splits = (globalThis.__REGION_LOG__[globalThis.__REGION_LOG__.length - 1] || {}).splits || [];
  globalThis.__REGION_LOG__ = undefined;
  return { ...res, splits };
}

describe('Úseky hrubování: dělí jen mezní čára, která opustí polotovar', () => {
  it('part-11-zleva: údolí Z≈35 (čára končí v materiálu) úsek NEDĚLÍ, Z≈92/172 ano', async () => {
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-11-zleva-casting.camprog'), 'utf8'));
    expect(prog.params.regionRoughing).toBe(true);
    expect(prog.params.respectInsertGeometry).toBe(true);
    const { calc, splits } = await runWithSplits(prog);

    // Zrcadlené Z (hrubování zleva): −35,1 / −92 / −172,5 ≡ reálné 35 / 92 / 172.
    const at = (z) => splits.some(s => Math.abs(s.z - z) < 3);
    expect(at(-35), `údolí Z≈35 nesmí být hranicí úseku: ${JSON.stringify(splits)}`).toBe(false);
    expect(at(-92), `údolí Z≈92 hranicí zůstává: ${JSON.stringify(splits)}`).toBe(true);
    expect(at(-172.5), `údolí Z≈172 hranicí zůstává: ${JSON.stringify(splits)}`).toBe(true);

    // Důsledek: nejvyšší průměr nad údolím se bere JEDNÍM průchodem přes obě
    // strany (vzduch mezi nimi přeletí rychloposuv při emisi), ne dvěma úseky.
    const outer = (calc.passes || []).filter(p => p.type === 'long' && Math.abs(p.x - 34.545) < 0.01);
    const spanning = outer.filter(p => Math.min(p.zStart, p.zEnd) < 20 && Math.max(p.zStart, p.zEnd) > 60);
    expect(spanning.length, `průchod přes celé údolí: ${JSON.stringify(outer.map(p => [p.zStart, p.zEnd]))}`).toBe(1);
  }, 30000);

  it('range-end-leadout: údolí BEZ mezní čáry si hranici drží (nezahodit naslepo)', async () => {
    // Pojistka proti opačnému extrému (nahradit údolí čistě mezními čarami):
    // tady v ústí údolí Z≈92 žádná čára zanoření neleží → pravidlo nesmí
    // sáhnout na hranici, jinak vypadnou celé průchody a zůstane materiál.
    const prog = JSON.parse(readFileSync(join(fxDir, 'range-end-leadout.camprog'), 'utf8'));
    const { splits } = await runWithSplits(prog);
    expect(splits.some(s => Math.abs(s.z - 92) < 3), JSON.stringify(splits)).toBe(true);
    expect(splits.some(s => Math.abs(s.z - 172.6) < 3), JSON.stringify(splits)).toBe(true);
  }, 30000);
});

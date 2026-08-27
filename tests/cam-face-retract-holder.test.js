// ╔══════════════════════════════════════════════════════════════╗
// ║  Odskok čelního průchodu nesmí zavézt DRŽÁK dál než průchod   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hlídání držáku sesadí hloubku čelního průchodu tak, aby se držák VEŠEL NA
// POLOZE PRŮCHODU. Odskok pod 45° pak posune celý držák o `rDistZ` dál na
// obrobenou stranu a jen o `rDist` ven — u stěny strmější než úhel odskoku
// tím tu právě vyměřenou rezervu sní.
//
// Kontrola odskoku v `gcodeEmit` do 25. 8. 2026 znala jen ŠPIČKU: hotovou
// konturu pod diagonálou (`gcOffsetXAt`) a zbytek na sousedních čelních
// rovinách do `rDistZ`, tedy 2 mm. Držák je ale v Z přes 20 mm tlustý, takže
// stěna, o kterou jde, leží desítky mm daleko — mimo dosah obojího.
//
// Fixture je díl uživatele (upichovák 5 mm, čelní hrubování, odlitek): na
// `N4750 G1 X18.641 Z82.932` se vnější zadní roh držáku otřel o přídavkovou
// slupku na stěně v pásu Z ≈ 100–108, kterou hlídání nechalo stát
// (17 průchodů vynecháno). Náhled to vybarvil červeně, ⛔ panel mlčel:
// 0,09 mm² je pod jeho prahem 0,5 mm².
//
// PAST PŘI MĚŘENÍ: chová se to NEMONOTÓNNĚ ve Virt. zvětšení držáku. Při 0
// a 2 mm je táž dráha čistá, při 1 mm ne — hlídání nechá pokaždé jinou
// rezervu a odskok ji sní jen někdy. Testovat proto všechny tři.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { HolderGouge } from '../js/calculators/cam/holderGouge.js';
import { polyArea } from '../js/geom/geomCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'cam', 'face-parting-retract-holder.camprog');

async function run(holderInflate) {
  const prog = JSON.parse(readFileSync(FIX, 'utf8'));
  prog.params = { ...prog.params, holderInflate };
  const { calc, calcSim, gcode, params } = await runCamProg(prog);
  // Měří se týmž modelem, jakým se náhled VYBARVUJE (`HolderGouge`), ne
  // validátorem: ten má práh 0,5 mm² a tenhle nález je pod ním.
  const hg = new HolderGouge(params, calcSim.stockPathSegments, params.roughingSide === 'left', { band: true });
  expect(hg.valid, 'HolderGouge musí být platný, jinak test nic neměří').toBe(true);
  hg.advanceTo(calcSim.simPath, calcSim.simPath.length - 1);
  return {
    hard: Math.abs(polyArea(hg.gouge)),
    band: Math.abs(polyArea(hg.gougeBand)),
    faces: calc.passes.filter(p => p.type === 'face').length,
    gcode,
  };
}

describe('čelní odskok nezavleče držák do stojícího materiálu', () => {
  for (const inflate of [0, 1, 2]) {
    it(`Virt. zvětšení držáku ${inflate} mm → žádné vnoření`, async () => {
      const r = await run(inflate);
      expect(r.hard, 'vnoření do nakresleného odlitku').toBeLessThan(0.005);
      expect(r.band, 'vnoření do přídavkové slupky').toBeLessThan(0.005);
    }, 180000);
  }

  it('náprava nestojí ani hloubku průchodu, ani žádný průchod', async () => {
    // Zásah smí odskok jen ZKRÁTIT (svisle v X, zpátky do vlastní stopy) —
    // hloubka a počet průchodů zůstávají. NAMĚŘENO na HEAD před opravou:
    // 112 čelních průchodů, poslední řezný pohyb průchodu 82 `X16.641`.
    const r = await run(1);
    expect(r.faces).toBe(112);
    const L = r.gcode.split('\n');
    const i = L.findIndex(l => l.trim() === '; Průchod 82');
    expect(i).toBeGreaterThan(0);
    // ČTE SE CELÝ PRŮCHOD, ne pevný offset ani N-číslo: od 27. 8. 2026 se
    // navazující přímé bloky slévají (`cam/gcodeCollapse.js`), takže táž dráha
    // má míň řádků. Invariant je pořád ten samý: průchod dojede na X16,641
    // a odskočí SVISLE v X (zpátky do vlastní stopy), ne šikmo.
    let end = i + 1;
    while (end < L.length && !/^\s*;\s*Průchod /.test(L[end])) end++;
    const pass = L.slice(i + 1, end).map(l => l.trim());
    const cuts = pass.filter(l => /^N\d+\s+G0?1\b/.test(l));
    const xs = cuts.map(l => parseFloat((l.match(/X(-?[\d.]+)/) || [])[1]));
    expect(Math.min(...xs), pass.join(' | ')).toBeCloseTo(16.641, 3);
    const out = cuts[cuts.length - 1];
    expect(out).toMatch(/^N\d+ G1 X18\.641 ; Výjezd v X/);
    expect(out, 'diagonála se musí nahradit svislým výjezdem').not.toMatch(/Z\d/);
  }, 180000);
});

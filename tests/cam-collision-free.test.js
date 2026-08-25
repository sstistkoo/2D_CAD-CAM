// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM invariant: vygenerovaný program NEJEZDÍ materiálem       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Proč zvlášť, když `collision-validator.test.js` už existuje: ten testuje
// VALIDÁTOR na ručně sestavených drahách (umí najít kolizi?). Tenhle testuje
// GENERÁTOR na reálných dílech (nevyrábí kolize?) — a to je něco jiného.
//
// Ta díra byla drahá. `validateToolpath` hlásí ⛔ „Rychloposuv materiálem"
// v aplikaci od 16. 7. 2026 a testuje u rychloposuvu jak destičku, TAK držák
// (collisionValidator.js, větev `block.type === 'G0'`). Emise se ale řídila
// pouze destičkou (`rapidHitsStock`), takže aplikace uměla kolizi NAJÍT, ale
// generátor ji neuměl OBEJÍT — a protože žádný test nepouštěl validátor na
// vygenerovaný G-kód napříč fixtures, sada zůstala 1285/1285 zelená i s
// kolizí 2× 135,3 mm² na `holder-region-roughing` (zavedl ji `e538e66`,
// nalezena až 13. 8. 2026).
//
// Invariant je proto úmyslně TVRDÝ a plošný: žádná fixture, žádná kolize.
// Když sem přibude fixture, která kolizi má z podstaty zadání (a ne kvůli
// dráze), patří do `EXPECTED` i s naměřeným číslem a důvodem — ne zvednutí
// společné meze.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

// Fixtures s doloženou, zadáním danou kolizí: { soubor: 'proč' }.
// Prázdné = všechny díly jedou čistě. Nepřidávat sem nic, co jde spravit
// v generátoru — od toho je tenhle test.
//
// ── 25. 8. 2026: dva zápisy, které sem patřit NEMAJÍ a musí zmizet ────────
// Do tohohle dne se validovalo `prog.params` (syrový obsah `.camprog`),
// kdežto pipeline běžela nad `S.params` (doplněné výchozími). 9 z 24 fixtures
// nemá v `.camprog` `holderWidth`/`holderLength`, takže `holderProfileLoop`
// vrátila `null` a KONTROLA DRŽÁKU U NICH TIŠE NEDĚLALA NIC. Po opravě (test
// i harness berou parametry z běhu) se ukázalo, co pod tím leželo.
//
// Obě položky mají JEDNU společnou příčinu a JEDNU opravu: náhradní
// obdélníkový držák je vystředěný na špičku (`x ∈ [−hw/2, +hw/2]`
// v `holderProfileLoop` / `holderRectProfile`), takže půlka trčí na
// NEOBROBENOU stranu břitu, přímo do materiálu. Každý skutečný obrys —
// nakreslený i všech šest nožů v DEFAULT_TOOL_MAGAZINE — má `x ∈ [0, hw]`.
// Změřeno: posunutí TÉHOŽ obdélníku na jednu stranu srazí u obou dílů
// nálezy z 12 na 0.
//
// Proč to ještě není opravené: ta oprava odemyká starší vadu, kterou dosud
// držel zavřenou právě ten špatný tvar — vjezdy (rampa i zápich) do
// nevyhrubovaného polotovaru, které `buildObstacleLoops` z principu nevidí
// (staví překážku z HOTOVÉHO dílu). Na `part-8` je to 103,9 mm². Detaily,
// čísla a tři změřené slepé uličky: docs/ + audit z 25. 8. 2026.
const EXPECTED = {
  'face-casting.camprog': 'vystředěný náhradní držák — 12 nálezů do 172,6 mm² (jednostranný obdélník je srazí na 0)',
  'face-cylinder.camprog': 'vystředěný náhradní držák — 12 nálezů do 195,8 mm² (jednostranný obdélník je srazí na 0)',
};

// ── DRUHÝ STANDARD: polotovar končí až na OFFSETOVÉ ČÁŘE ────────────────────
// Přídavek X/Z (polo.) je v zadání právě proto, že odlitek MŮŽE být větší —
// materiál až k té čáře tedy reálně existovat může a náraz do něj je náraz
// (rozhodnutí uživatele 20. 8. 2026). Dráhy se proti té čáře plánují
// (`planLoopRef`), náhled ji vybarvuje a ⛔ panel v aplikaci ji posílá
// (`planStock: true`); tenhle blok je poslední místo, kde se to zamyká.
//
// PROČ `shrink` 0,25 mm a ne 0,05 jako u syrového standardu: plánovací hranice
// je sama konstrukce „± vůle" a DVA modely zbytku ji diskretizují jinak —
// emise si vede `rapidStockPlan` po PLÁNOVANÉ geometrii průchodů
// (`noteCutPass`), validátor řeže po SKUTEČNĚ vygenerované dráze (`simPath`).
// Rozdíl je mělký, ale nenulový. Změřeno 20. 8. 2026 (nález mělčí než zmenšení
// nástroje zmizí):
//
//   fixture                  0,05 mm   0,10 mm   0,15 mm   0,25 mm
//   part-15-finish-zprava    2/1,3     2/1,1     0         0
//   part-17-long-parting     2/1,3     2/1,1     0         0
//   range-end-leadout        2/1,7     2/1,4     2/1,2     0
//   holder-region-roughing   4/4,9     4/3,3     2/1,6     2/1,3
//
// Nad 0,25 mm zbývají JEN skutečné vady. Ověřeno i to, že emise počítá
// správně: u `part-15` `N2240 G0 X19.545` vyjde její mez sjezdu 18,38 =
// zbytek 16,579 + R + Vůle, tedy přesně. Syrový standard výš si `shrink` 0,05
// PONECHÁVÁ — tenhle blok nic neoslabuje, jen přidává.
const EXPECTED_PLAN = {
  // Rampa do kapsy a odskok po ní (`N1760 G1 X13.164 Z115.145 ; Rampa 15.0°`,
  // `N1780 G1 X15.164 Z117.095`), 2× 0,6 mm² vnoření DRŽÁKU do pásu.
  // Není to vada dráhy, ale MEZ HLÍDÁNÍ: `holderFitsAt` modeluje držák
  // skenem povrchu po Z + profilem spodní hrany, kdežto validátor počítá
  // s celým polygonem držáku — a ten první systematicky podceňuje. Srovnat
  // je znamená nasadit polygonový test (Minkowski, jako `makeHolderClamp`)
  // i na kotvu/zátah rampy; to je samostatná práce, ne dolaďování prahu.
  // Zkoušeno a zahozeno (viz docs/cam-sjednoceni-polotovaru.md, krok 5):
  // `holderFitsAt` do `stockEntryRamp`, přímo ke kotvě, i `holderFitsAlong`
  // po celém zátahu — všechny tři BEZ efektu na nálezy, poslední navíc
  // sebrala úběr (part-15 −24,6 mm²).
  // 24. 8. 2026: po doplnění `toolSweep` o vlastní plochu obrysu je stopa
  // držáku úplná, takže se tatáž mez měří přesněji — 5 nálezů 0,79–0,92 mm²
  // místo 4 nálezů 0,61–0,92 na týchž dvou místech (r 12,8–13,0, Z ≈ 115).
  // Není to nová vada dráhy, jen doměřená stará.
  'holder-region-roughing.camprog': 'držák na rampě do kapsy — mez modelu holderFitsAt (5× 0,8–0,9 mm²)',
  // Táž příčina jako v EXPECTED výš (vystředěný náhradní držák) — proti
  // offsetové čáře vyjdou tytéž nálezy o pár mm² větší. Zmizí stejnou opravou.
  'face-casting.camprog': 'vystředěný náhradní držák — 12 nálezů do 175,3 mm², viz EXPECTED',
  'face-cylinder.camprog': 'vystředěný náhradní držák — 12 nálezů do 197,6 mm², viz EXPECTED',
};

const detailOf = (issues) => issues.map(i =>
  `${i.kind} @r${i.x.toFixed(2)} Z${i.z.toFixed(1)} = ${i.area.toFixed(1)} mm² (řádek ${i.lineIdx})`,
).join('; ');

describe('generátor nevyrábí kolize (destička ani držák)', () => {
  it('nalezeny fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    it(`${file} → dráha nejede materiálem`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      // POZOR: kolize se měří na `calcSim` — dráze naparsované ze skutečně
      // VYGENEROVANÉHO G-kódu (druhý průchod v runCamProg), ne na plánované
      // geometrii průchodů. Autoritativní je to, co stroj opravdu dostane.
      // POZOR: validovat `params` z běhu, ne `prog.params`. Fixture nemusí
      // uvádět všechny klíče a pipeline si chybějící doplní z výchozích —
      // s neúplnou sadou tedy validátor vidí JINÝ NÁSTROJ, než jakým se
      // řezalo. `holderProfileLoop` bez `holderWidth`/`holderLength` vrátí
      // `null` a kontrola držáku pak tiše nedělá nic: takhle jelo 9 z 24
      // fixtures (`part-1/2/4/6/8/9`, `pocket-wall-at-plunge-angle`,
      // `face-casting`, `face-cylinder`) a schovalo to 12 nálezů do 195,8 mm²
      // (nález 25. 8. 2026 — viz EXPECTED níž).
      const { calcSim, params } = await runCamProg(prog);
      const opts = { backside: params.roughingSide === 'left' };
      const issues = validateToolpath(
        calcSim.simPath, params, calcSim.stockPathSegments, opts,
      );
      const detail = detailOf(issues);
      if (EXPECTED[file]) {
        expect(issues.length, `${file}: ${EXPECTED[file]} — ${detail}`).toBeGreaterThan(0);
      } else {
        expect(issues.length, `${file}: ${detail}`).toBe(0);
      }

      // Týž program proti OFFSETOVÉ ČÁŘE (viz komentář u EXPECTED_PLAN).
      const plan = validateToolpath(
        calcSim.simPath, params, calcSim.stockPathSegments,
        { ...opts, planStock: true, shrink: 0.25 },
      );
      const detailPlan = detailOf(plan);
      if (EXPECTED_PLAN[file]) {
        expect(plan.length, `${file} (offsetová čára): ${EXPECTED_PLAN[file]} — ${detailPlan}`).toBeGreaterThan(0);
        return;
      }
      expect(plan.length, `${file} (offsetová čára): ${detailPlan}`).toBe(0);
    }, 120000);
  }
});

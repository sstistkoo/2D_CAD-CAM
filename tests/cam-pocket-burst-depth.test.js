// ╔══════════════════════════════════════════════════════════════╗
// ║  Kapsa se dobírá po Hloubce (ap), i když je PRVNÍM intervalem ║
// ╚══════════════════════════════════════════════════════════════╝
//
// „Dobrat kapsu najednou" (`pocketFinishAtOnce`) hledá tutéž kapsu na každé
// nové hloubce ZNOVU — a hledalo ji až od DRUHÉHO intervalu (`j = 1`), protože
// se mlčky předpokládalo, že před kapsou vždycky leží otevřený řez.
//
// U hrubování ZLEVA za přírubou u čela to neplatí: vjezd zprava neexistuje
// (`firstOpen === false`), takže kapsa JE intervalem prvním. Burst ji na nové
// hloubce nenašel, po prvním zanoření skončil a celý zbytek kapsy zůstal na
// jediném dokončovacím průchodu — ten ji projel DIAGONÁLOU přes celé údolí
// (reálný nález na díle uživatele: `G1 X50.915 Z171.500` ze Ø171 dolů,
// 985 mm² kolize držáku a dalších 570 mm² na navazujících úsecích).
//
// Test je model-free: kouká jen na hloubky vydaných průchodů. Kapsa, do které
// se zanořilo, musí být dobraná KROKY ≤ ap — ne jedním skokem.
//
// Implementace: `rescan.firstOpen ? 1 : 0` v genLongPasses
// (js/calculators/cam/roughingStrategies.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');
const load = (name) => JSON.parse(readFileSync(join(fxDir, name), 'utf8'));

describe('Zanoření do kapsy sjíždí po Hloubce (ap)', () => {
  // part-13-zleva-flange = díl uživatele, na kterém se to našlo: hrubování
  // ZLEVA, příruba Ø170 na Z 0–38 blokuje vjezd, takže údolí za ní je PRVNÍM
  // intervalem. Na starém kódu tu vzniklo 6 průchodů a jeden dokončovací
  // průchod diagonálou přes celé údolí; nově 12 průchodů po ap.
  it('part-13-zleva-flange: kapsa za přírubou se dobere kroky ≤ ap', async () => {
    const prog = load('part-13-zleva-flange.camprog');
    expect(prog.params.plungeRoughing).toBe(true);
    expect(prog.params.roughingSide).toBe('left');
    const { calc } = await runCamProg(prog);
    const passes = calc.passes || [];
    const ap = prog.params.depthOfCut;

    // Řetěz musí mít víc než jeden krok — jinak burst skončil po prvním
    // zanoření a zbytek kapsy spadl na jediný dokončovací průchod.
    const plunges = passes.filter(p => p.pocketEntry || p.pocketReposition);
    expect(plunges.length, 'kapsa se nedobrala rampovanými kroky').toBeGreaterThan(4);

    // Žádný průchod nesmí sjet o víc než ap pod hloubku svého předchůdce
    // v řetězu (kotva `rampFeedFrom` ukazuje přesně na něj).
    for (const p of plunges) {
      if (!p.rampFeedFrom) continue;
      const drop = p.rampFeedFrom.x - p.x;
      expect(drop, `krok x=${p.x.toFixed(3)} sjel ${drop.toFixed(3)} mm (ap=${ap})`)
        .toBeLessThanOrEqual(ap + 1e-6);
    }
    // Dokončovací průchod kapsy nesmí zůstat jediným, kdo se dostane na dno:
    // nejhlubší rampovaný krok musí být do ap od nejhlubšího průchodu vůbec.
    const deepest = Math.min(...passes.map(p => p.x));
    const deepestPlunge = Math.min(...plunges.map(p => p.x));
    expect(deepestPlunge - deepest,
      `rampy dosáhly jen na X${deepestPlunge.toFixed(2)}, nejhlubší průchod je X${deepest.toFixed(2)}`)
      .toBeLessThanOrEqual(ap + 1e-6);
  }, 30000);

  // part-11-zleva má odlitkové vybrání, do kterého se se zanořováním sjíždí.
  it('part-11-zleva: mezi sousedními kapsovými kroky není skok větší než ap', async () => {
    const prog = load('part-11-zleva-casting.camprog');
    expect(prog.params.plungeRoughing).toBe(true);
    const { calc } = await runCamProg(prog);
    const passes = calc.passes || [];
    const ap = prog.params.depthOfCut;

    // Řetěz zanořování: pocketEntry zahajuje, pocketReposition pokračuje.
    // Každý navazující krok smí být max o ap hlouběji než jeho předchůdce
    // (kotva `rampFeedFrom` ukazuje přesně na něj).
    const chain = passes.filter(p => p.pocketEntry || p.pocketReposition);
    for (const p of chain) {
      if (!p.rampFeedFrom) continue;
      const drop = p.rampFeedFrom.x - p.x;
      expect(drop, `krok x=${p.x.toFixed(3)} sjel ${drop.toFixed(3)} mm (ap=${ap})`)
        .toBeLessThanOrEqual(ap + 1e-6);
    }
    // A samotná rampa taky ne — kotva zvednutá až na kůru leží u kapsy za
    // bossem klidně 2× ap nad dnem.
    for (const p of passes) {
      if (p.type !== 'long' || !p.ramp || p.entryRangeRamp) continue;
      expect(p.ramp.x0 - p.x, `rampa průchodu x=${p.x.toFixed(3)}`).toBeLessThan(ap + 1e-6);
    }
  }, 30000);

  // Bez zanořování kapsová větev neběží vůbec (je za tím příznakem).
  // POZOR: `pocketReposition` sem NEPATŘÍ — ten příznak sdílejí TŘI mechanismy
  // (řetěz vjezdu na hranici rozsahu, dobírání kapsy, dorampování strmé stěny;
  // viz hlavička tests/cam-ramp-chain.test.js) a dva z nich běží i bez
  // zanořování. Výhradně kapsové jsou `pocketEntry` a `pocketClean`.
  it('bez Zanořování kapsové průchody nevznikají', async () => {
    const prog = load('part-11-zleva-casting.camprog');
    const { calc } = await runCamProg({
      ...prog, params: { ...prog.params, plungeRoughing: false },
    });
    expect((calc.passes || []).some(p => p.pocketEntry || p.pocketClean)).toBe(false);
  }, 30000);
});

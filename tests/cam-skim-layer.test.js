// ╔══════════════════════════════════════════════════════════════╗
// ║  SKIM VRSTVA: první záběr nesmí přetéct Hloubku záběru        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Polotovar končí až na OFFSETOVÉ ČÁŘE (Přídavek X/Z je v zadání proto, že
// odlitek MŮŽE být větší). Posloupnost hloubek i čelní march jsou ale kotvené
// na NAKRESLENÉM obrysu, takže první průchod ukusoval `ap + Přídavek` — na
// 17 fixtures přesně o Přídavek víc, tedy 20–50 % přetížení podle `ap`
// (docs/cam-sjednoceni-polotovaru.md, kroky 2 a 3). Nad mřížku se proto přidá
// SKIM vrstva; mřížka se NEPOSOUVÁ (posun celé posloupnosti je změřeně horší —
// `part-8` −5 průchodů a −337 mm² úběru).
//
// Snapshoty tohle samy neuhlídají: kdyby skim vrstva zmizela, jen se přepíšou.
// Tady je zapsaný ZÁMĚR.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { stockPlanLoop } from '../js/calculators/cam/materialRemoval.js';
import { topXOnLoop } from '../js/calculators/cam/camMath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');
const load = (f) => JSON.parse(readFileSync(join(fxDir, f), 'utf8'));

/** Hloubky podélných průchodů odshora dolů (bez duplicit). */
const longDepths = (calc) => [...new Set((calc.passes || [])
  .filter(p => p.type === 'long' && p.x !== undefined)
  .map(p => +p.x.toFixed(3)))].sort((a, b) => b - a);

describe('Skim vrstva — první záběr nepřeteče ap', () => {
  it('podélně: nejvyšší průchod bere nejvýš ap i proti PLÁNOVACÍMU obrysu', async () => {
    const prog = load('part-1.camprog');
    const ap = parseFloat(prog.params.depthOfCut);
    const { calc, calcSim, S } = await runCamProg(prog);
    const plan = stockPlanLoop(S.params, calcSim.stockPathSegments);
    const depths = longDepths(calc);
    expect(depths.length).toBeGreaterThan(2);
    // Vrch plánovacího obrysu = odkud může sahat materiál.
    let planTop = -Infinity;
    for (const p of plan) if (p.x > planTop) planTop = p.x;
    // Bez skim vrstvy tady vyšlo 4,000 mm při ap 3 (Přídavek 1 mm).
    expect(planTop - depths[0], `první záběr ${(planTop - depths[0]).toFixed(3)} mm při ap ${ap}`)
      .toBeLessThanOrEqual(ap + 0.01);
  }, 120000);

  it('podélně: MALÝ Přídavek nevyrobí vrstvu naprázdno (bere se najednou)', async () => {
    // Přídavek 0,05 mm (spodní mez `stockClearances`) při ap 3: skim vrstva by
    // pod sebou nechala zbytek 0,05 mm a ten by jel jako plný průchod
    // naprázdno. `SKIM_MIN_LAYER` ho nechá sebrat sousednímu průchodu —
    // vědomé, ohraničené přetížení na nejvýš 1,1 × ap.
    const prog = load('part-1.camprog');
    prog.params.stockClearX = 0.05;
    prog.params.stockClearZ = 0.05;
    const ap = parseFloat(prog.params.depthOfCut);
    const { calc, calcSim, S } = await runCamProg(prog);
    const plan = stockPlanLoop(S.params, calcSim.stockPathSegments);
    const depths = longDepths(calc);
    const firstGap = depths[0] - depths[1];
    expect(firstGap, `nejvyšší vrstva ${firstGap.toFixed(3)} mm je tenčí než 10 % ap`)
      .toBeGreaterThan(0.1 * ap);
    let planTop = -Infinity;
    for (const p of plan) if (p.x > planTop) planTop = p.x;
    const first = planTop - depths[0];
    expect(first, `první záběr ${first.toFixed(3)} mm`).toBeLessThanOrEqual(1.1 * ap + 0.01);
  }, 120000);

  it('čelně: první vrstva bere nejvýš ap i proti PLÁNOVACÍMU čelu', async () => {
    const prog = load('part-19-face-tilted-insert.camprog');
    const ap = parseFloat(prog.params.depthOfCut);
    const { calcSim, S } = await runCamProg(prog);
    const plan = stockPlanLoop(S.params, calcSim.stockPathSegments);
    // První čelní vrstva = nejvyšší Z mezi RADIÁLNÍMI řeznými běhy
    // (konstantní Z, dlouhá změna X) — čelí se zprava.
    const sp = calcSim.simPath;
    let z0 = -Infinity, xHi = 0, xLo = 0;
    for (let i = 1; i < sp.length; i++) {
      const a = sp[i - 1], b = sp[i];
      if (b.rapid || b.type === 'G0') continue;
      if (Math.abs(b.z - a.z) > 0.01 || Math.abs(b.x - a.x) < 1) continue;
      if (b.z > z0) { z0 = b.z; xHi = Math.max(a.x, b.x); xLo = Math.min(a.x, b.x); }
    }
    expect(z0).toBeGreaterThan(-Infinity);
    // Plánovací čelo nad tou vrstvou: max Z obrysu na kterékoli X pod řezem.
    let planFace = -Infinity;
    for (let k = 0; k <= 40; k++) {
      const X = xLo + (xHi - xLo) * (k / 40);
      for (let i = 0, n = plan.length; i < n; i++) {
        const a = plan[i], b = plan[(i + 1) % n];
        if ((a.x <= X && b.x > X) || (b.x <= X && a.x > X)) {
          const z = a.z + (b.z - a.z) * ((X - a.x) / (b.x - a.x));
          if (z > planFace) planFace = z;
        }
      }
    }
    // Bez skim vrstvy tady vyšlo 3,998 mm při ap 3 (Přídavek 1 mm).
    expect(planFace - z0, `první čelní vrstva ${(planFace - z0).toFixed(3)} mm při ap ${ap}`)
      .toBeLessThanOrEqual(ap + 0.01);
  }, 120000);
});

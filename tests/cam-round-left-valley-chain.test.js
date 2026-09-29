// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10 zleva: řetěz ramp v údolí, dobrání, levý konec ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele 29. 9. 2026 (projekt_2026-09-29, „✂ Po úsecích", úsek 1 =
// Z −13…145,3; kulatá R 10, ap 2,5, zleva). Nálezy při kontrole po úsecích:
//  1. údolí Z 82–104: kroky řetězu X 24,118 … 18,079 (`pocketReposition`)
//     jely nájezd po 45° stěně pokaždé od rohu X 29,118 Z 82,41 — 5, 7,5,
//     10 a 11 mm po čáře, kterou předchozí krok právě projel
//     (ops/long/pocketPass.js, „NÁJEZD PO STĚNĚ OD KONCE PŘEDCHOZÍHO KROKU"),
//  2. dobrání kapsy („kapsa bez schodků") jelo znovu celou rampu (15,6 mm)
//     a dno (6 mm) — poslední krok dosedl 0,1 mm za dno, navázání se
//     zamítlo (pocketPass.js, `reachedBottom` / `cleanBottomZ`),
//  3. levý konec: nájezd po plošině X 41,066 začínal na Z −9, jen o Vůli Z
//     před polotovarem — kružnice nosu tam bokem zapichovala (`G1 X41.066`
//     kolmo; ops/long/leadInChain.js, prodloužení dozadu).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-left-valley-chain.camprog');
let run = null;
const getRun = async () => (run ??= await runCamProg(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

describe('CAM: kulatá R 10 zleva — řetěz ramp v údolí, dobrání, levý konec', () => {
  // Od 29. 9. 2026 (večer) staví vrstvy kulaté jeden postup pravidla 7
  // (ops/long/rule7Layers.js) — testy hlídají VLASTNOSTI drah (pravidla 3, 4,
  // 6, 7), ne tvar, jakým je stavěl dřívější generátor (řetězy, „dobrání").
  it('vrstvy v údolí sjíždějí po stěně nejvýš o ap (od úrovně mělčí vrstvy)', async () => {
    const { calc } = await getRun();
    const inValley = calc.passes.filter(p => p.type === 'long' && p.x < 34 && p.x > 17
      && Math.min(p.zStart, p.zEnd) > 76 && Math.max(p.zStart, p.zEnd) < 110);
    expect(inValley.length).toBeGreaterThanOrEqual(5);
    for (const p of inValley) {
      const top = p.contourLeadIn?.length ? p.contourLeadIn[0].x1 : p.ramp ? p.ramp.x0 : p.x;
      expect(top - p.x, `vjezd X ${p.x.toFixed(3)} z X ${top.toFixed(3)}`).toBeLessThanOrEqual(2.5 + 0.05);
    }
    // Dno údolí má vrstvu (pravidlo 3).
    expect(inValley.some(p => p.x < 18.2)).toBe(true);
  });

  it('vrstva X 36,618 jede přes hrb vcelku až na konec (pravidlo 7)', async () => {
    const { calc } = await getRun();
    const i = calc.passes.findIndex(p => p.type === 'long' && near(p.x, 36.618)
      && Math.min(p.zStart, p.zEnd) > 15 && Math.min(p.zStart, p.zEnd) < 30);
    expect(i).toBeGreaterThanOrEqual(0);
    const a = calc.passes[i], b = calc.passes[i + 1];
    expect(a.noRetract, 'bez odskoku u hrbu').toBe(true);
    expect(b && near(b.x, 36.618) && Math.max(b.zStart, b.zEnd) > 105, 'pokračuje za hrbem až ke stěně').toBe(true);
    // Vybrání (před hrbem) se dodělá dřív, než začne údolí za hrbem.
    const recessBottom = calc.passes.findIndex(p => p.type === 'long' && p.x > 29.7 && p.x < 29.8);
    const valleyFirst = calc.passes.findIndex(p => p.type === 'long' && near(p.x, 34.118) && Math.min(p.zStart, p.zEnd) > 70);
    expect(recessBottom).toBeGreaterThan(i);
    expect(valleyFirst).toBeGreaterThan(recessBottom);
  });

  it('levý konec před čelem dílu se obrobí po vrstvách až dolů', async () => {
    const { calc } = await getRun();
    // Odlitek Z −8…0 před čelem (X 30,566): vrstvy pod čelem začínají ve
    // vzduchu za dosahem nosu a končí u čela (Z −10,5 = čelo − R − přídavek).
    const left = calc.passes.filter(p => p.type === 'long' && p.x < 39 && Math.max(p.zStart, p.zEnd) < -10);
    expect(left.length).toBeGreaterThanOrEqual(8);
    // Začátek = kde kružnice nosu zasáhne SKUTEČNÝ odlitek (Z −8 − R = −18,
    // od 29. 9. 2026 večer; nájezd o vůli před ním přidá emise).
    for (const p of left) expect(Math.min(p.zStart, p.zEnd)).toBeLessThanOrEqual(-17.95);
    expect(Math.min(...left.map(p => p.x))).toBeLessThan(10);
  });

  // Nálezy uživatele 29. 9. 2026 odpoledne (projekt_2026-09-29 (4)): nájezd
  // kulaté počítal Vůli Z + R, přestože začátek vrstvy už R obsahuje (klíč
  // `approachFromNoseContact`) — `G0 Z101.617 / G1 Z143.003` jel 11 mm
  // posuvem vzduchem a vrstva X 29,118 u pravé stěny údolí vypadla (místo
  // nájezdu padlo o 11 mm vlevo do protější stěny), takže X 26,618 tam brala
  // dvě vrstvy naráz.
  it('vrstva X 29,118 dojede v údolí až na pravou stěnu', async () => {
    const { calc } = await getRun();
    const p = calc.passes.find(q => q.type === 'long' && near(q.x, 29.118)
      && Math.max(q.zStart, q.zEnd) > 103 && Math.min(q.zStart, q.zEnd) < 95);
    expect(p, 'vrstva X 29,118 u stěny Z ~94…103').toBeTruthy();
  });

  it('nájezd před šikminou odlitku jede posuvem jen o Vůli Z, ne o Vůli Z + R', async () => {
    const { gcode, calc } = await getRun();
    const lines = gcode.split('\n');
    const p = calc.passes.find(q => q.type === 'long' && near(q.x, 54.118));
    expect(p).toBeTruthy();
    const i = lines.findIndex(l => /G0 X54\.118\b/.test(l));
    const m = i > 0 && lines[i - 1].match(/G0 Z(-?[\d.]+)/);
    expect(m, 'G0 Z před sjezdem na X 54,118').toBeTruthy();
    // Rychloposuv končí tam, kde je kružnice nosu Vůli Z (1 mm, měřeno
    // vzdáleností) od offsetové čáry (dotek Z ~109,2; se samotným odlitkem
    // Z 111,05) — dřív o Vůli Z + R před začátkem vrstvy: G0 Z101,617, 11 mm.
    const zG0 = parseFloat(m[1]);
    expect(p.zStart - zG0).toBeLessThanOrEqual(5.5);
    expect(zG0).toBeGreaterThan(107);
  });

  it('bez kolize nástroje a držáku (validátor, planStock, zleva)', async () => {
    const r = await getRun();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: true });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});

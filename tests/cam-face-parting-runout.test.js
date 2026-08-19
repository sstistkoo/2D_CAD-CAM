// ╔══════════════════════════════════════════════════════════╗
// ║  Čelní hrubování UPICHOVÁKEM — doběh na konci úseku + roh dojezdu  ║
// ╚══════════════════════════════════════════════════════════╝
//
// U natočené destičky se doběh na konci úseku (`appendRegionRunOut`) chytal
// náhodou: `enforceLayerDepth()` je polygon-only a průchody za koncem úseku
// zahodilo ještě před ním, takže doběh viděl skutečný konec. U UPICHOVÁKU
// hloubka vrstev neběží vůbec — průchod na dalším Z tam pořád JE (zahodí ho až
// hlídání držáku, které běželo AZ ZA doběhem) → doběh usoudil „úsek pokračuje
// sám“ a přeskočil. Uživatel to na svém dílu (19. 8. 2026) viděl jako tři
// nedojeté konce: čelo příruby (Z197,932), konec úseku (Z110,932) a levý konec.
//
// Fix = pořadí: hlídání držáku → doběh → hlídání držáku znovu. Druhé volání
// není kosmetika: průchod přidaný za držákem bez kontroly = 3 změřené kolize.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProgFile } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'cam', 'part-16-face-holder.camprog');
const prms0 = JSON.parse(readFileSync(fixture, 'utf8')).params;

const isAxial = (sg) => sg.type === 'line'
  && Math.abs(sg.x2 - sg.x1) < 0.01 && Math.abs(sg.z2 - sg.z1) > 0.01;

describe('Čelně upichovákem (šířka 5 mm, natočení 0°)', () => {
  it('konce úseků dostávají doběh, a to MIMO mřížku vrstev', async () => {
    const { calc } = await runCamProgFile(fixture);
    const face = calc.passes.filter(p => p.type === 'face');
    const runOut = face.filter(p => p.runOut);
    expect(runOut.length).toBeGreaterThan(0);
    // Doběh má smysl jen mimo mřížku: na ní by průchod vznikl sám. Krok mřížky
    // je `depthOfCut`, takže alespoň jeden doběh musí ležet mezi dvěma Z mřížky.
    const ap = parseFloat(prms0.depthOfCut);
    const offGrid = runOut.filter(p => {
      const near = face.filter(q => q !== p && !q.runOut)
        .map(q => Math.abs(((p.z - q.z) % ap + ap) % ap));
      return near.every(d => Math.min(d, ap - d) > 0.05);
    });
    expect(offGrid.length).toBeGreaterThan(0);
  }, 120000);

  it('doběh nejde HLOUBĚJI — natočení 0° = žádný kužel, tedy stejná hloubka', async () => {
    const { calc } = await runCamProgFile(fixture);
    const face = calc.passes.filter(p => p.type === 'face');
    for (let i = 1; i < face.length; i++) {
      if (!face[i].runOut) continue;
      // Kdyby se `tanR` počítal bez `Math.max(0, …)`, vyšel by u natočení 0°
      // (a u kladného) ZÁPORNÝ tangens a vrstva by šla hlouběji než předchozí.
      expect(face[i].xEnd).toBeGreaterThanOrEqual(face[i - 1].xEnd - 0.001);
    }
  }, 120000);

  it('program s doběhem nemá kolizi (doběh projde hlídáním držáku)', async () => {
    const { calc, calcSim, S } = await runCamProgFile(fixture);
    const issues = validateToolpath(calcSim.simPath, S.params, calc.stockPathSegments,
      { backside: false, maxIssues: 500, maxBlocks: 100000 });
    expect(issues.map(i => `${i.kind} @X${i.x.toFixed(1)} Z${i.z.toFixed(1)}`)).toEqual([]);
  }, 120000);

  it('dojezd se zastaví v rohu — za sloupnutým schodem už po plášti nejede', async () => {
    const { calc } = await runCamProgFile(fixture);
    const face = calc.passes.filter(p => p.type === 'face');
    // Žádný dojezd nesmí mít osový úsek AZ ZA jiným úsekem: tam už schod není.
    const after = face.filter(p => p.contourLeadOut
      && p.contourLeadOut.findIndex(isAxial) >= 1);
    expect(after).toEqual([]);
    // Test není vacuum: dojezdy, které osovým úsekem ZAČÍNAJÍ, se nechaly — ty
    // materiál odebírají (změřeno modelem úběru: zahození = +75 mm² zbytku).
    expect(face.some(p => p.contourLeadOut && p.contourLeadOut.some(isAxial))).toBe(true);
  }, 120000);
});

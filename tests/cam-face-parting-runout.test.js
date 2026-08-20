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

  it('doběh dostane NORMÁLNÍ cíl — hloubku mu určí hlídání držáku', async () => {
    const { calc } = await runCamProgFile(fixture);
    const face = calc.passes.filter(p => p.type === 'face');
    const runOut = face.filter(p => p.runOut);
    expect(runOut.length).toBeGreaterThan(0);
    // Dřív doběh držel hloubku PŘEDCHOZÍ vrstvy (u natočení 0° je `tanR` = 0),
    // ale předchozí vrstvy přitom klesaly — a to proto, že je tak hluboko pustil
    // DRŽÁK. Doběh se tak jako jediný nezanořoval dál, i když by směl (nález
    // uživatele 20. 8. 2026). Teď dostane týž cíl jako každý jiný průchod
    // a hloubku mu ustřihne clamp držáku — takže musí být zkrácený držákem
    // A hlouběji než průchod nad ním.
    const zs = face.map(p => p.z);
    for (const p of runOut) {
      expect(p.holderClamped).toBe(true);
      const aboveZ = zs.filter(z => z > p.z + 1e-6).sort((a, b) => a - b)[0];
      if (aboveZ === undefined) continue;
      const above = face.find(q => Math.abs(q.z - aboveZ) < 1e-9);
      expect(p.xEnd).toBeLessThan(above.xEnd - 0.01);
    }
  }, 120000);

  it('krok doběhu DODRŽUJE ap', async () => {
    const { calc } = await runCamProgFile(fixture);
    const face = calc.passes.filter(p => p.type === 'face');
    const runOut = face.filter(p => p.runOut);
    expect(runOut.length).toBeGreaterThan(0);
    // Krok doběhu se skladá z hrany materiálu a ještě `faceOffsetOut`, takže
    // součet může ap překročit — na dilu uživatele vyšel 3,95 mm při ap 3.
    const ap = parseFloat(prms0.depthOfCut);
    const zs = face.map(p => p.z);
    for (const p of runOut) {
      const aboveZ = zs.filter(z => z > p.z + 1e-6).sort((a, b) => a - b)[0];
      if (aboveZ === undefined) continue;
      expect(aboveZ - p.z).toBeLessThanOrEqual(ap + 0.01);
    }
  }, 120000);

  it('upichovák vezme konec úseku JEDNOU vrstvou, ne dvěma', async () => {
    const { calc } = await runCamProgFile(fixture);
    const ro = calc.passes.filter(p => p.type === 'face' && p.runOut);
    // Konec úseku potřebuje odříznout proužek na hraně materiálu A sjet po
    // offsetové čáře. Nos to musí na dvakrát, plátek šířky 5 mm ne — ty dvě
    // vrstvy byly od sebe 2,95 mm (uživatel 20. 8. 2026: „vezme to najednou").
    // Žádné dva doběhy proto nesmějí ležet blíž než šířka plátku.
    const w = parseFloat(prms0.toolLength);
    for (let i = 1; i < ro.length; i++)
      expect(Math.abs(ro[i].z - ro[i - 1].z)).toBeGreaterThan(w - 0.01);
    expect(ro.length).toBeGreaterThan(0);
  }, 120000);

  it('nájezd doběhu jde z povrchu pod CELÝM záběrem, ne z 1 mm nad řezem', async () => {
    const { calc } = await runCamProgFile(fixture);
    const ro = calc.passes.filter(p => p.type === 'face' && p.runOut);
    expect(ro.length).toBeGreaterThan(0);
    for (const p of ro) {
      // Dřív `xSurface` bralo povrch jen na programovaném Z — u čela příruby
      // je tam za schodem 16,7, takže nájezd skoňčil 1 mm nad koncem řezu
      // (`G0 X47.376` → `G1 X46.376`). Plátek ale leží tělem nad velkým čelem.
      expect(p.xSurface).toBeGreaterThan(p.xEnd + 1);
      expect(p.xStart).toBeGreaterThan(p.xSurface);
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
    // Osový úsek AŽ ZA jiným úsekem (= za sloupnutým schodem) se zkrátí na
    // 0,4 mm — přesah je numerická rezerva pro dynamický model polotovaru,
    // viz `roughingStrategies.js`. Před opravou měřil 1,4–1,7 mm.
    const after = face.filter(p => p.contourLeadOut
      && p.contourLeadOut.findIndex(isAxial) >= 1);
    expect(after.length).toBeGreaterThan(0);
    for (const p of after) {
      const sg = p.contourLeadOut[p.contourLeadOut.findIndex(isAxial)];
      expect(Math.abs(sg.z2 - sg.z1)).toBeLessThanOrEqual(0.41);
      // A musí to být POSLEDNÍ úsek — za rohem už dojezd nepokračuje.
      expect(p.contourLeadOut[p.contourLeadOut.length - 1]).toBe(sg);
    }
    // Test není vacuum: dojezdy, které osovým úsekem ZAČÍNAJÍ, se nechaly — ty
    // materiál odebírají (změřeno modelem úběru: zahození = +75 mm² zbytku).
    expect(face.some(p => p.contourLeadOut && p.contourLeadOut.some(isAxial))).toBe(true);
  }, 120000);
});

describe('Obálka upichováku v ROHU offsetu', () => {
  it('rovné čelo zůstává JEDNOU úsečkou — nevzorkůje se na tětivy', async () => {
    const { calc } = await runCamProgFile(fixture);
    const p = calc.passes.find(q => q.type === 'face' && Math.abs(q.z - 137.932) < 0.01);
    expect(p).toBeTruthy();
    // Obálka plátku dřív převzorkovala vystopovaný offset na rovnoměrnou mřížku
    // 0,375 mm v Z. Zlomy offsetu (Z138,785 a Z139,523) na ni nepadly, takže
    // rovné čelo vyšlo jako tři tětivy a poslední z nich měla 4× větší sklon
    // než čelo (X9,943 Z139,807 místo Z139,523) — dráha z offsetu vyjela.
    const face = (p.contourLeadOut || []).find(sg => sg.type === 'line'
      && Math.abs(sg.x2 - sg.x1) > 5);
    expect(face).toBeTruthy();
    // Sklon čela z výkresu: 0,738 mm v Z na 29,63 mm v X.
    expect(Math.abs(face.z2 - face.z1) / Math.abs(face.x2 - face.x1)).toBeCloseTo(0.0249, 3);
    // A celé čelo (29,6 mm v X) musí projít jedním úsekem, ne po kouscích.
    expect(Math.abs(face.x2 - face.x1)).toBeGreaterThan(29);
  }, 120000);

  it('dokončování neztratí úsek po kuželu (žádná jehla ve zbytkovém modelu)', async () => {
    const { S } = await runCamProgFile(fixture);
    // Ořez dojezdu PŘESNĚ v rohu nechal v dynamickém modelu polotovaru jehlu
    // (Z243,5: 16,17 mm mezi sousedícemi 11,06 a 9,67) a `finDeepCut` na ni
    // zahodil celý dokončovací úsek po kuželu = 19 mm² neobrobeného.
    const msgs = (S.genNotes || []).map(n => n.msg).join(' | ');
    expect(msgs).not.toMatch(/Dokončování: \d+ úsek/);
  }, 120000);
});

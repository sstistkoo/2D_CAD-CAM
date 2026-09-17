// ╔══════════════════════════════════════════════════════════════╗
// ║  OFFSETOVÁ ČÁRA SE NAPOJUJE NA MEZNÍ ČÁRU ZANOŘENÍ            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pravidlo uživatele 17. 9. 2026 (docs/cam-pravidla-drah.md §3.2e): offset
// nesmí u strmé stěny kopírovat povrch — pod zadaným úhlem zanoření tam
// plátek nesjede. Řetěz se proto ořízne offsetem mezní čáry a napojí se na
// sousední offsetové čáry.
//
// Snapshot G-kódu tohle neuhlídá (přepsal by se), a otisk taky ne — obojí
// jen zaznamená, že se něco změnilo. Tady je zapsaný ZÁMĚR i obě pojistky,
// které si měření vynutilo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { guideOffsetLine, joinChainToGuideOffset } from '../js/calculators/cam/guideOffsetJoin.js';
import { getInsert } from '../js/calculators/cam/inserts/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');
const load = (f) => JSON.parse(readFileSync(join(fxDir, f), 'utf8'));

const line = (x1, z1, x2, z2) => ({ type: 'line', p1: { x: x1, z: z1 }, p2: { x: x2, z: z2 } });
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

describe('offset mezní čáry zanoření — napojení na okolní řetěz', () => {
  // Geometrie z dílu uživatele (projekt_2026-09-17): kontura 50,081 @ Z221,135
  // → 30,156 @ Z213,667 (stěna 69,5°) → schod → čelo Z205,009. Kulatá R10,
  // Přídavek X 0,4 / Z 0,5, úhel zanoření 45°.
  const guide = { x1: 24.224, z1: 195.278, x2: 50.081, z2: 221.135 };
  const roughChain = () => [
    line(60.481, 243.626, 60.481, 213.833),
    line(60.481, 213.833, 40.556, 206.365),
    line(40.556, 206.365, 40.556, 194.509),
    line(40.556, 194.509, 17.144, 194.509),
  ];

  it('napojí se přesně tam, kde se offsety kříží', () => {
    const l = guideOffsetLine(guide, 10 + 0.4, 10 + 0.5);
    const res = joinChainToGuideOffset(roughChain(), l, 10.5);
    expect(res).not.toBeNull();
    // Body, které uživatel ukázal na fotkách (a nasnapoval v aplikaci).
    expect(near(res.from.x, 60.481)).toBe(true);
    expect(near(res.from.z, 216.756)).toBe(true);
    expect(near(res.to.x, 38.234)).toBe(true);
    expect(near(res.to.z, 194.509)).toBe(true);
    // Řetěz je spojitý: vodorovně → po mezní čáře → dál dolů.
    const c = res.chain;
    expect(c.length).toBe(3);
    expect(c[1].fromGuideOffset).toBe(true);
    for (let i = 1; i < c.length; i++) {
      expect(near(c[i].p1.x, c[i - 1].p2.x)).toBe(true);
      expect(near(c[i].p1.z, c[i - 1].p2.z)).toBe(true);
    }
  });

  it('řetěz, který mez neporušuje, zůstává beze změny', () => {
    // Týž tvar, ale posunutý tak, že celý leží na straně vzduchu.
    const l = guideOffsetLine({ x1: 0, z1: 100, x2: 30, z2: 130 }, 10.4, 10.5);
    expect(joinChainToGuideOffset(roughChain(), l, 10.5)).toBeNull();
  });

  // Obě pojistky níž na zjednodušené geometrii: mez je svislice X = 10,
  // vzduch nahoře (+X), materiál pod ní. Ke každé je i protipříklad, aby
  // test nemohl projít „náhodou" (žádný průsečík → taky null).
  const limit = { p1: { x: 10, z: 0 }, p2: { x: 10, z: 100 }, n: { x: 1, z: 0 } };
  const dipChain = (d) => [line(12, 0, 10 - d, 50), line(10 - d, 50, 12, 100)];

  it('DOTYK (tečná čára) se za porušení meze nepovažuje', () => {
    // Mezní čára bývá k oblouku TEČNÁ — její offset pak offsetový oblouk
    // numericky protne ve dvou bodech pár desetin od sebe. Bez prahu MIN_DIP
    // z toho vznikla na dílu uživatele tětiva 0,68 mm (prohnutí 0,003 mm).
    expect(joinChainToGuideOffset(dipChain(0.003), limit, 50)).toBeNull();
    // PROTIPŘÍKLAD: týž tvar s měřitelným prohnutím se napojit MUSÍ —
    // jinak by test výš procházel jen proto, že se nenašly průsečíky.
    const deep = joinChainToGuideOffset(dipChain(0.5), limit, 50);
    expect(deep).not.toBeNull();
    expect(near(deep.from.x, 10)).toBe(true);
    expect(near(deep.to.x, 10)).toBe(true);
  });

  it('odchylka se měří jen MEZI napojeními, ne po celém krajním segmentu', () => {
    // Krajní segment pokračuje i ZA napojením; kdyby se vzorkoval celý, měřila
    // by se odchylka na kusu, který se vůbec nenahrazuje.
    const flat = [line(12, 0, 10.001, 30), line(10.001, 30, 10.001, 70), line(10.001, 70, 12, 100)];
    expect(joinChainToGuideOffset(flat, limit, 50)).toBeNull();   // odchylka 0,001 mm
    const bent = [line(12, 0, 9, 30), line(9, 30, 9, 70), line(9, 70, 12, 100)];
    expect(joinChainToGuideOffset(bent, limit, 50)).not.toBeNull();
  });

  it('roh u čela se napojí — plátek tam radiálně zanořit nesmí', () => {
    // Mezní čára u čela dílu (Z0). Roh offsetu leží celý na straně vzduchu,
    // takže se NEPŘEKRAČUJE — přesto se nahrazuje: hrana je hlídaná a dráha
    // ji má objet pod úhlem zanoření, ne kolmo (nález uživatele 17. 9. 2026,
    // třetí fotka: „u té poslední zas nedělá vůbec nic").
    const g = { x1: 21.566, z1: -9, x2: 30.566, z2: 0 };
    const l = guideOffsetLine(g, 10.4, 10.5);
    const chain = [line(40.966, 9.503, 40.966, -10.5), line(40.966, -10.5, 0, -10.5)];
    const res = joinChainToGuideOffset(chain, l, 10.5);
    expect(res).not.toBeNull();
    expect(near(res.from.x, 40.966)).toBe(true);
    expect(near(res.to.z, -10.5)).toBe(true);
  });

  it('ZA konec nakreslené čáry se napojení NEHLEDÁ', () => {
    // Mezní čára končí tam, kde vyjela z materiálu. Protahovat její offset
    // k prvnímu, co potká, znamená přeříznout celé údolí — nález uživatele
    // 17. 9. 2026 na dílu s kulatou R10: *„jde v tom údolí až na druhou
    // stranu"*. Polygon to nedělá: jeho offsetová čára končí na offsetu
    // vlastního konce. `far` se vrací k mezi až daleko za `limit.p2` (Z100).
    const far = [line(12, -4, 9, 2), line(9, 2, 9, 150), line(9, 150, 14, 170)];
    expect(joinChainToGuideOffset(far, limit, 5)).toBeNull();
    // PROTIPŘÍKLAD: když se řetěz vrátí JEŠTĚ v okolí čáry, napojí se.
    const nearBack = [line(12, -4, 9, 2), line(9, 2, 9, 90), line(9, 90, 14, 110)];
    const res = joinChainToGuideOffset(nearBack, limit, 20);
    expect(res).not.toBeNull();
    expect(near(res.to.x, 10)).toBe(true);
  });

  it('napojení, které by zajelo do dílu, se odmítne', () => {
    // `bridgeClears` hlídá, že náhrada nepřijde ke kontuře blíž než `minDist`.
    const back = [line(12, -4, 9, 2), line(9, 2, 9, 90), line(9, 90, 14, 110)];
    const contour = [line(5, 20, 5, 80)];
    expect(joinChainToGuideOffset(back, limit, 20, { contour, minDist: 6 })).toBeNull();
    expect(joinChainToGuideOffset(back, limit, 20, { contour, minDist: 3 })).not.toBeNull();
  });

  it('pravidlo je KLÍČ PLÁTKU — nemá ho nikdo než kulatá', () => {
    expect(getInsert({ toolShape: 'round' }).plungeGuideJoinsOffset).toBe(true);
    for (const shape of ['polygon', 'parting', 'threading'])
      expect(getInsert({ toolShape: shape }).plungeGuideJoinsOffset).toBe(false);
  });

  it('celý pipeline: offsetPath dílu s kulatou vede po mezní čáře', async () => {
    const { calc } = await runCamProg(load('part-22-round-r10.camprog'));
    const bridged = (calc.offsetPath || []).filter(s => s.fromGuideOffset);
    // Napojí se ty mezní čáry, u kterých se řetěz k mezi VRÁTÍ ještě v jejich
    // okolí — na tomhle dílu příruba a čelo. Čára u oblouku R10 se nenapojuje
    // ZÁMĚRNĚ: řetěz se k ní vrací až 14 mm za jejím koncem, takže by náhrada
    // přeřízla celé údolí (nález uživatele 17. 9. 2026). Její offset zůstává
    // prostý kolmý posun končící na offsetu vlastního konce — jako u polygonu.
    expect(bridged.length).toBe(2);
    expect((calc.interferenceGuides || []).filter(g => g.offRough).length).toBe(2);
    // Náhrada nesmí přeříznout údolí: žádná není delší než mezní čára + offset.
    for (const g of calc.interferenceGuides || []) {
      if (!g.offRough) continue;
      const lg = Math.hypot(g.x2 - g.x1, g.z2 - g.z1);
      const lo = Math.hypot(g.offRough.p2.x - g.offRough.p1.x, g.offRough.p2.z - g.offRough.p1.z);
      expect(lo, `náhrada ${lo.toFixed(1)} mm proti čáře ${lg.toFixed(1)} mm`).toBeLessThanOrEqual(lg + 25);
    }
    // Napojení leží na sousedních segmentech řetězu — žádný konec ve vzduchu.
    const idx = calc.offsetPath.findIndex(s => s.fromGuideOffset);
    const prev = calc.offsetPath[idx - 1], next = calc.offsetPath[idx + 1];
    expect(prev && next).toBeTruthy();
    expect(near(prev.p2.x ?? NaN, calc.offsetPath[idx].p1.x)).toBe(true);
    expect(near(prev.p2.z ?? NaN, calc.offsetPath[idx].p1.z)).toBe(true);
    // Mezní čára si napojenou podobu nese pro náhled i SNAP.
    const g = (calc.interferenceGuides || []).find(q => q.offRough);
    expect(g).toBeTruthy();
    expect(near(g.offRough.p1.x, calc.offsetPath[idx].p1.x)).toBe(true);
  }, 120000);
});

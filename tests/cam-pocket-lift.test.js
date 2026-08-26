// ╔══════════════════════════════════════════════════════════════╗
// ║  Zdvih v kapse se testuje proti zbytku, ne jen přejezd v Z    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Při návratu v kapse (`pocketReposition`) se nástroj zvedá po úrovních vrstev,
// dokud není volný PŘEJEZD V OSE Z. Sám ZDVIH na tu výšku se ale netestoval —
// a to je vlastní stěna kapsy: po odskoku o „Odskok" nástroj pořád stojí v ní.
//
// Projevilo se to až při jiné hloubce záběru, protože při té uložené ve fixture
// zdvih náhodou vycházel do vzduchu. S POLOVIČNÍM `ap` začalo šest z dvaceti
// čtyř dílů generovat rychloposuv stojícím materiálem (naměřeno 25. 8. 2026):
//
//   part-4 / part-6 / part-9        ap 2 → 1     3,0 mm²
//   pocket-wall-at-plunge-angle     ap 2 → 1     1,8 mm²
//   part-15-finish-zprava           ap 5 → 2,5   1,8 mm²   ← jiné místo
//   range-end-leadout               ap 5 → 2,5   2,5 mm²   ← jiné místo
//
// Konkrétní důkaz (part-4, ap 1): `N2580 G1 X33.977 Z42.434` je odskok 45°,
// pořád v kapse, a hned za ním `N2590 G0 X39.977` jel 1,8 mm² skrz stěnu.
// Hloubka nálezu přežila i zmenšení nástroje o 0,5 mm, takže to nebyl drift
// modelu, ale skutečné zajetí.
//
// Opraveno zrcadlem `emitDescendX` — `emitLiftX`: když zdvih na zbytek naráží,
// jede se posuvem až nad jeho povrch a teprve zbytek rychloposuvem.
//
// POSLEDNÍ DVA DÍLY měly JINOU PŘÍČINU (dohledáno a opraveno 25. 8. 2026) —
// a nebyl to rozdíl obou modelů zbytku, jak to zprvu vypadalo. Model emise
// tam říká přesně totéž co syrový polotovar (na Z 85,268 oba r 15,58); vadila
// DÉLKA ODSTUPU V Z.
//
// Rychloposuv se zastaví `rapidStopZ` před hranou materiálu, aby sjezd v X
// proběhl ve vzduchu. Tím se ale o tentýž kus posune na neobrobenou stranu
// celý DRŽÁK, a ten je v Z přes 20 mm dlouhý: průchod, který se svou vlastní
// polohou vejde, narazí tělem o 20 mm dál. Změřeno na `range-end-leadout`,
// ap 2,5 — držák 2,47 mm² v materiálu na Z 103,8–105,2 STATICKY na cíli
// (16,881; 85,268), kdežto na vlastním `firstCutZ` 83,468 nula.
//
// Že to bylo POLOHOVÉ, ne trasové, je i důvod, proč to vypadalo jako slepá
// ulička: `safeRapidTo` kolizi pozná, ale odpoví jediným, co umí — zdvihem
// nad konturu. Ten s polohovou kolizí nehne, takže vznikla zbytečná dvojice
// „nahoru na X68 a hned zpátky dolů" a sjezd do ní vjel stejně. Náprava je
// zkrátit odstup, dokud se držák nevejde, nejvýš na `firstCutZ` — tam, kde
// stejně bude tělo průchodu.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const ZL0 = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
const XL0 = { rangeXMin: null, rangeXMax: null, active: false };

async function runAtAp(file, divisor) {
  const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  prog.zLimits = { ...ZL0, ...(prog.zLimits || {}) };
  prog.xLimits = { ...XL0, ...(prog.xLimits || {}) };
  prog.params.depthOfCut = Math.max(0.2, (parseFloat(prog.params.depthOfCut) || 2) / divisor);
  const { calc, calcSim, gcode, params } = await runCamProg(prog);
  const opts = { backside: params.roughingSide === 'left' };
  return {
    gcode, passes: calc.passes.length, ap: prog.params.depthOfCut,
    issues: validateToolpath(calcSim.simPath, params, calcSim.stockPathSegments, { ...opts, maxIssues: 8 }),
  };
}

const detail = (iss) => iss.map(i => `${i.kind} @r${i.x.toFixed(2)} Z${i.z.toFixed(1)} = ${i.area.toFixed(1)} mm²`).join('; ');

describe('poloviční hloubka záběru nevyrobí rychloposuv materiálem', () => {
  for (const file of ['part-4.camprog', 'part-6.camprog', 'part-9.camprog', 'pocket-wall-at-plunge-angle.camprog',
    'part-15-finish-zprava.camprog', 'range-end-leadout.camprog']) {
    it(`${file} — ap/2 jede čistě`, async () => {
      const half = await runAtAp(file, 2);
      expect(half.passes, 'poloviční ap nevygeneroval žádné průchody').toBeGreaterThan(0);
      expect(half.issues.length, `${file} (ap ${half.ap}): ${detail(half.issues)}`).toBe(0);
    }, 120000);
  }

  it('hloubka záběru není jediná, se kterou se smí hýbat (part-4 na třetinu i pětinu)', async () => {
    // Půlka byla jen ta, na které se to našlo. Invariant platí obecně.
    for (const div of [3, 5]) {
      const r = await runAtAp('part-4.camprog', div);
      expect(r.issues.length, `part-4 (ap ${r.ap}): ${detail(r.issues)}`).toBe(0);
    }
  }, 180000);

  it('odstup v Z se zkrátí, když se na něm nevejde držák (range-end-leadout)', async () => {
    // Přímý otisk druhé opravy. Před ní vypadal nájezd 28. průchodu takhle:
    //   N1920 G0 Z85.268                        ← odstup 1,8 mm
    //   N1930 G0 X68.046 ; Výjezd nad konturu   ← marný zdvih …
    //   N1940 G0 X16.881                        ← … a sjezd do téže kolize
    // Po opravě je odstup 0,9 mm a zdvih zmizel, protože kolize zmizela s ním:
    //   N1920 G0 Z84.368
    //   N1930 G0 X16.881
    //
    // ČÍSLA SE 26. 8. 2026 POSUNULA, invariant ne. Order-aware kontrola nájezdu
    // (krok 7 v docs/cam-order-aware-holder.md) posouvá vjezd tam, kde se vedle
    // něj nevejde držák, takže odstup vyšel ještě kratší (83,518) a sjezd se
    // rozdělil na rychloposuv k offsetové čáře + zbytek posuvem:
    //   N1920 G0 Z83.518
    //   N1930 G0 X18.640
    //   N1940 G1 X16.881 F0.25
    // Podstatné je pořád totéž: ŽÁDNÝ marný „Výjezd nad konturu" a nula nálezů.
    const r = await runAtAp('range-end-leadout.camprog', 2);
    const L = r.gcode.split('\n');
    const i = L.findIndex(l => l.trim() === '; Průchod 28 (bez schodků)');
    expect(i, 'průchod 28 se nenašel — fixture nebo číslování se změnily').toBeGreaterThan(0);
    // Odstup je KRATŠÍ než původních 1,8 mm (hrana materiálu je na 83,468).
    const zApproach = parseFloat((L[i + 1].match(/Z([\d.]+)/) || [])[1]);
    expect(zApproach).toBeGreaterThan(83.468);
    expect(zApproach).toBeLessThan(85.268);
    // Nájezd nesmí obsahovat marný zdvih nad konturu.
    expect(L.slice(i + 1, i + 4).join('\n')).not.toContain('Výjezd nad konturu');
    expect(r.issues, detail(r.issues)).toEqual([]);
  }, 120000);

  it('zdvih v kapse vyjíždí z materiálu posuvem, ne rychloposuvem (part-8)', async () => {
    // Přímý otisk opravy: na part-8 se dva zdvihy v kapse změnily z `G0`
    // na výjezd posuvem. Bez opravy tam `G0` zůstane.
    const r = await runAtAp('part-8.camprog', 1);
    const lifts = r.gcode.split('\n').filter(l => l.includes('Výjezd materiálem posuvem'));
    expect(lifts.length, 'zdvih materiálem se nikde nerozdělil').toBeGreaterThanOrEqual(2);
  }, 120000);
});

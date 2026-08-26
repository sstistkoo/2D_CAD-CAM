// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM: vjezd na hranici rozsahu 📐 NESMÍ být kolmý zápich      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Když rozsah obrábění začíná UVNITŘ polotovaru, stojí napravo od hranice dál
// materiál — proto se tam nezapichuje kolmo, ale zanořuje RAMPOU pod úhlem
// zanoření (`entryRangeRamp` v roughingStrategies.js). Jenže při úhlu 90°
// (upichovák + Auto) rampa na kolmý zápich DEGENERUJE: `tan(90°)` je 1,6e16,
// posun v Z vyjde nula a vydá se `G1 X… Z<hranice> ; Rampa 90.0°`, které na
// hranici jen zapíchne — a držák sjede do stojícího materiálu.
//
// Nález na díle uživatele 26. 8. 2026 (podélné hrubování, upichovák, Start
// rozsahu Z = 333,06 uvnitř odlitku): 8 nálezů držáku, 403,5 mm² celkem,
// všechny přesně na té hranici. S ručním úhlem 45° shluk zmizel úplně —
// důkaz, že vadí svislost, ne rozsah sám.
//
// Fixture leží v `tests/fixtures/cam-cases/`, ne v `tests/fixtures/cam/`:
// tam se globem berou plošné sady (`cam-gcode-regression`, `cam-collision-free`)
// a tenhle díl má i po opravě zbytkový nález u druhého údolí (jiný mechanismus,
// rychloposuv + držák do stoupajícího odlitku, měřeno 7,4 mm² při Virt.
// zvětšení držáku 1 mm / 1,3 mm² proti syrovému obrysu). Až padne i ten,
// může se fixture přestěhovat do hlavní sady.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'range-parting-plunge.camprog');
const loadProg = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

describe('CAM: hranice rozsahu 📐 + svislé zanoření (upichovák)', () => {
  it('na hranici rozsahu se nezapichuje kolmo', async () => {
    const prog = loadProg();
    const zHi = prog.zLimits.rangeStart;
    const run = await runCamProg(prog);

    // Efektivní úhel zanoření je pro upichovák s Auto 90° — právě ta
    // konfigurace, ve které rampa degenerovala.
    expect(run.params.toolShape).toBe('parting');
    expect(run.params.entryAngleAuto).toBe(true);

    // Žádný řezný pohyb označený jako rampa nesmí ZŮSTAT na hranici rozsahu
    // (rampa, která se v Z nehne, je zápich).
    const stuck = run.gcode.split('\n').filter(l =>
      /Rampa/.test(l) && new RegExp(`Z${zHi.toFixed(3)}\\b`).test(l));
    expect(stuck, `svislá „rampa" na hranici rozsahu:\n${stuck.join('\n')}`).toEqual([]);
  });

  it('na hranici rozsahu nezůstane kolize držáku', async () => {
    const run = await runCamProg(loadProg());
    const issues = validateToolpath(run.calcSim.simPath, run.params, run.calc.stockPathSegments,
      { planStock: true });
    // Shluk nálezů seděl přesně na Startu rozsahu (Z 333,06).
    const atRange = issues.filter(i => (i.z ?? 0) > 300);
    const area = atRange.reduce((a, i) => a + (i.area || 0), 0);
    expect(atRange.length, `nálezy nad Z300: ${JSON.stringify(atRange.map(i => ({ k: i.kind, z: +(i.z || 0).toFixed(1), a: +(i.area || 0).toFixed(1) })))}`).toBe(0);
    expect(area).toBe(0);
  });

  it('s order-aware modelem se kolmý vjezd povolí tam, kde držák projde', async () => {
    // Upichovák zapichuje kolmo — to je jeho normální provoz. Plošný zákaz na
    // umělé hranici je jen náhradní řešení za chybějící model: statická obálka
    // (výškové pole) na otázku „vejde se tam držák?" odpovědět neumí.
    // S `orderAwareHolder` se ptá POLYGONOVÝ zbytek, který zná pořadí obrábění,
    // a kde držák projde, vjezd se povolí (viz plungeHolderFitsAt).
    const off = await runCamProg(loadProg());
    const progOn = loadProg();
    progOn.params.orderAwareHolder = true;
    const on = await runCamProg(progOn);

    // Povolený vjezd = o průchod víc a víc odebraného materiálu…
    expect(on.calc.passes.length).toBeGreaterThan(off.calc.passes.length);
    // …a pořád BEZ svislé „rampy" na hranici (vjezd je kolmý zápich, ne rampa).
    expect(on.gcode.split('\n').filter(l => /Rampa/.test(l))).toEqual([]);

    // Hranice rozsahu zůstává bez nálezu držáku.
    const issues = validateToolpath(on.calcSim.simPath, on.params, on.calc.stockPathSegments,
      { planStock: true, shrink: 0.25 });
    expect(issues.filter(i => (i.z ?? 0) > 300)).toEqual([]);
  });

  it('mimo hranici rozsahu zůstává dílu jen doložený zbytkový nález', async () => {
    // Pojistka proti opačnému extrému: kdyby oprava spolkla dráhy plošně,
    // tenhle práh by ji nechytil — proto se hlídá i to, že se pořád hrubuje.
    const run = await runCamProg(loadProg());
    const cuts = run.gcode.split('\n').filter(l => /^\s*N\d+\s+G0?[123]\b/.test(l)).length;
    expect(cuts).toBeGreaterThan(100);

    const issues = validateToolpath(run.calcSim.simPath, run.params, run.calc.stockPathSegments,
      { planStock: true });
    const area = issues.reduce((a, i) => a + (i.area || 0), 0);
    // Před opravou 403,5 mm²; zbývá jen údolí u Z≈84,6.
    expect(area).toBeLessThan(15);
  });
});

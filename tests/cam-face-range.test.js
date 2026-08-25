// ╔══════════════════════════════════════════════════════════════╗
// ║  Rozsah obrábění 📐 platí i pro ČELNÍ hrubování               ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Do 25. 8. 2026 si `genFacePasses` `machiningRange` ani `machiningRangeX`
// z kontextu vůbec nevyzvedlo — `calculatePipeline` je do `passCtx` předávalo,
// ale četl je jen `genLongPasses`. Čelní výstup byl proto se zapnutým
// i vypnutým rozsahem BITOVĚ STEJNÝ: uživatel viděl v náhledu čáry „Start /
// Konec rozsahu“ a dráhy si jich vůbec nevšímaly.
//
// Sada přitom byla 1340/1340 zelená, protože jediná čelní fixture s aktivním
// rozsahem (`face-cylinder`) má pás, který díl celý obsáhne — nic tedy
// neořezával a nikdo si nevšiml, že by neořezával ani kdyby měl.
//
// Tenhle test hlídá čtyři věci najednou:
//   1. Pás Z opravdu vybírá vrstvy (a je jich míň než bez pásu).
//   2. Pás X opravdu drží dno řezu (`xEnd >= xLo`).
//   3. Ani jedno nevyrobí kolizi — proti nakreslené siluetě i proti
//      offsetové čáře, stejným měřítkem jako `cam-collision-free`.
//   4. Pás, který díl celý obsáhne, NEMĚNÍ NIC. Na tom stojí stabilita
//      čelních snapshotů: mez odskoku na kraji pásu se smí nasadit jen
//      tam, kde rozsah mřížku skutečně ořízl (viz `faceRetractCapZ`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { _defaultCamParams } from '../js/calculators/cam/camDefaults.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');

const ZL0 = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
const XL0 = { rangeXMin: null, rangeXMax: null, active: false };

// `runCamProg` slévá parametry do sdíleného `S`, takže fixture bez některého
// klíče zdědí hodnotu z předchozího běhu. Doplnit výchozí sadu a obě omezení
// vždy CELÁ — jinak měří test kontaminovaný stav, ne fixture.
async function runWith(file, { zLimits = {}, xLimits = {}, params = {} } = {}) {
  const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  prog.params = { ..._defaultCamParams(), ...prog.params, ...params };
  prog.zLimits = { ...ZL0, ...zLimits };
  prog.xLimits = { ...XL0, ...xLimits };
  // NÁHRADNÍ OBDÉLNÍKOVÝ DRŽÁK JE VYSTŘEDĚNÝ NA ŠPIČKU (`holderRectProfile`,
  // `x ∈ [−hw/2, +hw/2]`), takže půlka leží na NEOBROBENÉ straně a čelně
  // vyrábí kolize sama od sebe — na `face-cylinder` 12 nálezů do 135 mm²
  // i bez jakéhokoli rozsahu. To je samostatná vada (hlídání ji nevidí,
  // `holderBottomProfile` odmítá `d < 0`), ne vlastnost rozsahu. Fixtures
  // bez nakresleného obrysu proto dostanou JEDNOSTRANNÝ obdélník — stejný
  // tvar, jaký má každý nakreslený profil i každý nůž v DEFAULT_TOOL_MAGAZINE
  // — aby tenhle test měřil rozsah, a ne cizí vadu.
  const hp = prog.params.holderProfile;
  if (!hp || !((hp.sideA || []).length > 1 || (hp.sideB || []).length > 1)) {
    const z0 = Math.max(parseFloat(prog.params.toolLength) || 10, parseFloat(prog.params.toolRadius) || 0.8, 4);
    const hw = Math.max(parseFloat(prog.params.holderWidth) || 20, 0.1);
    const l1 = Math.max(parseFloat(prog.params.holderLength) || 200, 1);
    prog.params.holderProfile = {
      sideA: [{ x: 0, z: z0 }, { x: hw, z: z0 }, { x: hw, z: z0 + l1 }, { x: 0, z: z0 + l1 }, { x: 0, z: z0 }],
      sideB: [],
    };
  }
  const { calc, calcSim, gcode } = await runCamProg(prog);
  const facePasses = calc.passes.filter(p => p.type === 'face');
  const opts = { backside: prog.params.roughingSide === 'left' };
  return {
    facePasses, gcode, prog,
    issues: validateToolpath(calcSim.simPath, prog.params, calcSim.stockPathSegments, opts),
    issuesPlan: validateToolpath(calcSim.simPath, prog.params, calcSim.stockPathSegments,
      { ...opts, planStock: true, shrink: 0.25 }),
  };
}

const detail = (iss) => iss.map(i => `${i.kind} @r${i.x.toFixed(2)} Z${i.z.toFixed(1)} = ${i.area.toFixed(1)} mm²`).join('; ');

// Pásy volené tak, aby ležely uvnitř dílu (tj. aby opravdu ořezávaly).
const CASES = [
  { file: 'part-16-face-holder.camprog', band: [250, 320] },
  { file: 'part-18-face-big-radius.camprog', band: [100, 150] },
  { file: 'part-19-face-tilted-insert.camprog', band: [250, 320] },
  { file: 'face-cylinder.camprog', band: [25, 45] },
  { file: 'face-casting.camprog', band: [-60, -20] },
];

describe('čelní hrubování respektuje rozsah obrábění Z (📐)', () => {
  for (const { file, band: [lo, hi] } of CASES) {
    it(`${file} — pás Z ${lo}…${hi} vybírá vrstvy a nedělá kolize`, async () => {
      const free = await runWith(file);
      const band = await runWith(file, { zLimits: { rangeActive: true, rangeStart: lo, rangeEnd: hi } });

      expect(band.facePasses.length, `${file}: pás nevygeneroval ani jeden průchod`).toBeGreaterThan(0);
      expect(band.facePasses.length, `${file}: pás neubral ani jeden průchod — rozsah se ignoruje`)
        .toBeLessThan(free.facePasses.length);

      for (const p of band.facePasses) {
        expect(p.z, `${file}: průchod na Z${p.z.toFixed(2)} leží pod pásem`).toBeGreaterThanOrEqual(lo - 0.01);
        expect(p.z, `${file}: průchod na Z${p.z.toFixed(2)} leží nad pásem`).toBeLessThanOrEqual(hi + 0.01);
      }

      expect(band.issues.length, `${file} (silueta): ${detail(band.issues)}`).toBe(0);
      expect(band.issuesPlan.length, `${file} (offsetová čára): ${detail(band.issuesPlan)}`).toBe(0);
    }, 120000);
  }
});

describe('čelní hrubování respektuje rozsah obrábění X (📐)', () => {
  // Dolní mez JE vynutitelná (dno řezu), horní ne: čelní řez jde radiálně od
  // povrchu, takže materiál nad horní mezí nástroj projede tak jako tak.
  // Vynechávání celých vrstev bylo zkoušeno a zamítnuto — nechává uprostřed
  // dílu stát plátky, které nos při nájezdu ořízne (part-18, R8: 11,8 mm²).
  const XCASES = [
    { file: 'part-16-face-holder.camprog', xLo: 20, xHi: 40 },
    { file: 'part-18-face-big-radius.camprog', xLo: 20, xHi: 40 },
    { file: 'face-cylinder.camprog', xLo: 8, xHi: 20 },
  ];
  for (const { file, xLo, xHi } of XCASES) {
    it(`${file} — pás X ${xLo}…${xHi} drží dno řezu`, async () => {
      const free = await runWith(file);
      const band = await runWith(file, { xLimits: { active: true, rangeXMin: xLo, rangeXMax: xHi } });

      expect(band.facePasses.length).toBeGreaterThan(0);
      const deepestFree = Math.min(...free.facePasses.map(p => p.xEnd));
      expect(deepestFree, `${file}: bez pásu se ani nedostane pod dolní mez — případ nic netestuje`)
        .toBeLessThan(xLo - 0.01);
      for (const p of band.facePasses) {
        expect(p.xEnd, `${file}: průchod na Z${p.z.toFixed(2)} jde na r${p.xEnd.toFixed(2)}, tedy pod dolní mez`)
          .toBeGreaterThanOrEqual(xLo - 0.01);
      }

      expect(band.issues.length, `${file} (silueta): ${detail(band.issues)}`).toBe(0);
      expect(band.issuesPlan.length, `${file} (offsetová čára): ${detail(band.issuesPlan)}`).toBe(0);
    }, 120000);
  }
});

describe('rozsah, který díl celý obsáhne, nemění nic', () => {
  // Pojistka pro `faceRetractCapZ`: mez odskoku se nesmí nasadit tam, kde
  // rozsah mřížku neořízl — jinak by se z každého krajního odskoku stal
  // svislý výjezd a přepsalo by to všechny čelní snapshoty.
  it('face-cylinder — pás přes celý díl dá bitově stejný G-kód', async () => {
    const free = await runWith('face-cylinder.camprog');
    const wide = await runWith('face-cylinder.camprog', {
      zLimits: { rangeActive: true, rangeStart: -500, rangeEnd: 500 },
      xLimits: { active: true, rangeXMin: -500, rangeXMax: 500 },
    });
    expect(wide.facePasses.length).toBe(free.facePasses.length);
    expect(wide.gcode).toBe(free.gcode);
  }, 120000);
});

describe('čelní hrubování ZLEVA respektuje rozsah stejně', () => {
  // Čelně zleva se svět NEzrcadlí (roughingKey → 'face'), takže rozsah je
  // v reálných souřadnicích a mez odskoku míří na opačnou stranu. Kdyby se
  // někdy doplnilo `genFaceLeft` se zrcadlením, `mirrorPass` musí překlopit
  // i `retractCapZ` — na to je tenhle případ.
  it('part-19-face-tilted-insert — pás Z 250…320 zleva', async () => {
    const free = await runWith('part-19-face-tilted-insert.camprog', { params: { roughingSide: 'left' } });
    const band = await runWith('part-19-face-tilted-insert.camprog', {
      params: { roughingSide: 'left' },
      zLimits: { rangeActive: true, rangeStart: 250, rangeEnd: 320 },
    });
    expect(band.facePasses.length).toBeGreaterThan(0);
    expect(band.facePasses.length).toBeLessThan(free.facePasses.length);
    for (const p of band.facePasses) {
      expect(p.z).toBeGreaterThanOrEqual(249.99);
      expect(p.z).toBeLessThanOrEqual(320.01);
    }
    expect(band.issues.length, `(silueta): ${detail(band.issues)}`).toBe(0);
  }, 120000);
});

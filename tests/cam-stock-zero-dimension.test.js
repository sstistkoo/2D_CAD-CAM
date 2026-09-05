// ╔══════════════════════════════════════════════════════════════╗
// ║  Nula je u rozměrů polotovaru HODNOTA, ne „nezadáno"          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// `genLongPasses` si dno pro sledování obrysu (dojezdy schodů, výjezdy
// z kapes, cíle ramp) bralo z `(parseFloat(prms.stockLength) || 100) * -1`.
// Nula je ale u obou rozměrů polotovaru legitimní volba — Čelo v Z 0 je
// nejběžnější — a `||` ji spolkne stejně jako prázdné pole, které UI ukládá
// právě jako nulu (`applyParamChange` v camSimulator.js).
//
// Hrubování ZLEVA to trefí naplno: `mirrorParamsZ` Čelo a Délku PROHODÍ,
// takže Čelo 0 se v zrcadle stane Délkou 0 → dno spadlo na −100 a dráhy se
// plánovaly 100 mm za koncem materiálu.
//
// Pokrytí tu nebylo žádné: mezi fixtures je jediná válcová (`face-cylinder`)
// a ta jede ČELNÍ strategií, kde `cylStockZ` nefiguruje. Kombinace
// válec + podélně + zleva nebyla otestovaná vůbec.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');

// Osazený hřídel v Z −60…0, aby vznikaly schody (a s nimi dojezdy, které se
// o dno opírají). Polotovar = válec Ø60 dlouhý 60 od Čela → sahá do Z −60.
const CYL = (stockFace) => ({
  params: {
    roughingStrategy: 'longitudinal', roughingSide: 'left',
    stockMode: 'cylinder', stockDiameter: 60, stockLength: 60, stockFace,
    depthOfCut: 3, feed: 0.25, speed: 200, toolRadius: 0.8,
    allowanceX: 0.4, allowanceZ: 0.5, safeX: 150, safeZ: 5,
    holderWidth: 20, holderLength: 200, holderProfile: null,
  },
  contourPoints: [
    { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
    { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
    { id: 3, type: 'G1', x: 20, z: -20, r: 0, mode: 'ABS' },
    { id: 4, type: 'G1', x: 28, z: -20, r: 0, mode: 'ABS' },
    { id: 5, type: 'G1', x: 28, z: -60, r: 0, mode: 'ABS' },
    { id: 6, type: 'G1', x: 0, z: -60, r: 0, mode: 'ABS' },
  ],
  stockPoints: [],
  zLimits: { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false },
  xLimits: { rangeXMin: null, rangeXMax: null, active: false },
});

const zSpan = (calc, gcode) => {
  const plan = [];
  for (const p of calc.passes) {
    if (Number.isFinite(p.zStart)) plan.push(p.zStart);
    if (Number.isFinite(p.zEnd)) plan.push(p.zEnd);
    if (Number.isFinite(p.z)) plan.push(p.z);
  }
  const emitted = [...gcode.matchAll(/Z(-?\d+\.\d+)/g)].map(m => +m[1]);
  return { planMax: Math.max(...plan), emitMax: Math.max(...emitted), passes: calc.passes.length };
};

describe('Čelo/Délka polotovaru 0 nesmí spadnout do fallbacku', () => {
  it('válec + podélně + zleva: Čelo 0 plánuje tam co Čelo 0,01', async () => {
    const [zero, eps] = await Promise.all([
      runCamProg(CYL(0)).then(r => zSpan(r.calc, r.gcode)),
      runCamProg(CYL(0.01)).then(r => zSpan(r.calc, r.gcode)),
    ]);
    // NAMĚŘENO před opravou: Čelo 0 → 7 průchodů, plán do Z +100,00,
    // G-kód do Z 100,00 (a 4 hlášky hlídání držáku navíc). Čelo 0,01 →
    // 3 průchody, plán do Z 0,01, G-kód do Z 5,00 (bezpečná poloha).
    expect(zero.passes, 'počet průchodů nesmí záviset na setině mm').toBe(eps.passes);
    expect(zero.planMax).toBeCloseTo(eps.planMax, 1);
    expect(zero.emitMax).toBeCloseTo(eps.emitMax, 1);
    // A hlavně: ani jedna varianta nesmí mířit za konec materiálu. Nejdál
    // smí bezpečná poloha (safeZ = 5), materiál končí na Čele.
    expect(zero.planMax, 'plánovaná dráha za koncem materiálu').toBeLessThanOrEqual(0.05);
    expect(zero.emitMax, 'emitovaná dráha za bezpečnou polohou').toBeLessThanOrEqual(5.05);
  }, 180000);

  it('odlitek: Délka dráhou NEPOHNE, ať je jakákoli (autorita je silueta)', async () => {
    // Po opravě `cylStockZ` (5. 9. 2026) je u odlitku silueta autorita VŽDYCKY,
    // ne jen když je pole prázdné. Rozměry válce o odlitku neříkají nic, takže
    // s nimi nesmí jít hnout dráhou — a to je tvrzení, které se dá pinnout
    // NATVRDO: tři různé Délky, jeden a týž program.
    //
    // Naměřené hodnoty dna, aby bylo vidět, o kolik ta oprava hýbe:
    //   part-1                  Délka 5 dávala dno −5,000, silueta je −10,000
    //   part-11-zleva-casting   Délka 5 dávala dno −5,000, silueta je  −8,499
    for (const f of ['part-1.camprog', 'part-11-zleva-casting.camprog']) {
      const prog = JSON.parse(readFileSync(join(fixturesDir, f), 'utf8'));
      // POSTUPNĚ, ne `Promise.all` — harness běží nad singletonem `S`
      // a soubězí běhy si do něj lezou (viz hlavička scripts/cam_sweep.mjs).
      const run = (stockLength) => runCamProg({ ...prog, params: { ...prog.params, stockLength } });
      const none = await run(0);
      const short = await run(5);
      const long = await run(500);
      expect(short.gcode, `${f}: Délka 5 pohnula dráhou`).toBe(none.gcode);
      expect(long.gcode, `${f}: Délka 500 pohnula dráhou`).toBe(none.gcode);
      // A hlavně: ani jedna varianta nesmí spadnout na konstantu −100.
      const zMin = Math.min(...[...none.gcode.matchAll(/Z(-?\d+\.\d+)/g)].map(m => +m[1]));
      expect(zMin, `${f}: spadlo to na konstantu −100`).toBeGreaterThan(-99);
    }
  }, 300000);
});

// ╔══════════════════════════════════════════════════════════════╗
// ║  Vjezd do polotovaru na hranici rozsahu Z rampou (Fáze 4)     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Rozsah obrábění začínající UPROSTŘED polotovaru: dřív dráha zajela za
// hranici o vůli a spadla KOLMO na hloubku (jako upichování). Teď vjíždí
// rampou pod úhlem zanoření z kotvy = průsečík čáry začátku rozsahu s
// hranicí polotovaru (+ vůle X); všechny hloubky sdílejí tutéž přímku.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const prog = {
  __camprog: 1,
  params: {
    machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1',
    speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0, retractAngle: 45,
    allowanceX: 0, allowanceZ: 0, toolRadius: 0.8, finishAllowance: 0,
    doFinishing: false, roughingStrategy: 'longitudinal', roughingSide: 'right',
    stockMode: 'cylinder', stockDiameter: 60, stockLength: 80, stockFace: 2,
    safeX: 150, safeZ: 5, machineStructure: 'lathe', controlSystem: 'sinumerik',
    autoProfile: true, toolShape: 'round', toolLength: 10, toolAngle: 15,
    toolTipAngle: 90, toolClearanceAngle: 0,
    holderWidth: 0, holderLength: 0, holderHand: 'R', holderProfile: null,
    entryAngle: 30, entryAngleAuto: false, respectInsertGeometry: false,
    plungeRoughing: false, pocketFinishAtOnce: false,
    noStepRoughing: false, noStepRoughingFace: false, regionRoughing: false,
    rapidClearance: 1.0, partOffZ: null, threadActive: false,
  },
  contourPoints: [
    { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
    { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
    { id: 3, type: 'G1', x: 20, z: -75, r: 0, mode: 'ABS' },
    { id: 4, type: 'G1', x: 30, z: -75, r: 0, mode: 'ABS' },
  ],
  stockPoints: [],
  zLimits: { chuck: null, tail: null, chuckActive: false, tailActive: false,
    rangeStart: -30, rangeEnd: -70, rangeActive: true },
};

describe('rozsah Z uprostřed polotovaru', () => {
  it('průchody vjíždějí rampou od hranice polotovaru, ne kolmým zápichem', async () => {
    const { calc, gcode } = await runCamProg(prog);
    const ramped = calc.passes.filter(p => p.type === 'long' && p.ramp);
    expect(ramped.length).toBeGreaterThan(0);
    for (const p of ramped) {
      // kotva rampy: začátek rozsahu (z=−30), povrch + vůle X (30+1=31)
      expect(p.ramp.z0).toBeCloseTo(-30, 4);
      expect(p.ramp.x0).toBeCloseTo(31, 4);
      // rampa má úhel zanoření: Δz = Δx / tan(30°)
      const dz = p.ramp.z0 - p.zStart;
      const dx = p.ramp.x0 - p.x;
      expect(dz).toBeCloseTo(dx / Math.tan(30 * Math.PI / 180), 2);
    }
    expect(gcode).toContain('Rampa');
    // Žádný kolmý zápich na hranici: dřívější vzor G0 Z(−30+vůle) → G1 X(hloubka)
    // uvnitř materiálu se u rampovaných průchodů nevyskytuje — vjezd jde po
    // rampě z povrchu. (Kontrola: v kódu není G1 X.. bez Z na z≈−29.)
  }, 30000);
});

// ── Zanoření za odlitkovým hrbem (strop vjezdu podle držáku) ────────────
// Na fixture range-end-leadout stojí NAPRAVO od obráběné zóny hrb Ø≈129
// (skok siluety polotovaru na Z=196,278). Rampa od jeho povrchu na malé
// průměry se do Z-okna nevejde, takže se dřív takové hloubky celé zahodily —
// menší průměry zůstaly nehrubované, dokud uživatel ručně neposunul Start
// rozsahu Z až za hrb. Vjezd se teď posune sám tam, kde se vedle vejde držák.
const HRB_Z = 196.278;        // skok siluety polotovaru (hrb napravo)
const HOLDER_W = 20;          // holderWidth fixture
const STOCK_CLR_Z = 1;        // rapidClearance fixture (Přídavek Z polotovaru)
const GAP = 1;                // volný prostor mezi držákem a offsetovou čarou

describe('zanoření za odlitkovým hrbem', () => {
  it('vjezd se posune tam, kam se vejde držák — a přijde na řadu až po větších průměrech', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures/cam/range-end-leadout.camprog'), 'utf8'));
    const { calc } = await runCamProg(prog);
    const longs = calc.passes.filter(p => p.type === 'long');
    // Zanoření na malý průměr, které dřív úplně chybělo.
    const plunges = longs.filter(p => p.entryRangeRamp && p.x < 20);
    expect(plunges.length).toBeGreaterThan(0);
    // Držák (šířka HOLDER_W od špičky) se u vjezdu vejde vedle hrbu, a ještě
    // s GAP volného prostoru od offsetové čáry polotovaru.
    for (const p of plunges) {
      expect(p.ramp.z0 + HOLDER_W).toBeLessThanOrEqual(HRB_Z - STOCK_CLR_Z - GAP + 1e-6);
    }
    // „Co je nahoře, má přednost": zanoření je až za všemi průchody na
    // větších průměrech SVÉHO MÍSTA, hrubuje se odshora dolů.
    //
    // Měří se v Z-okně zanoření, ne přes celý program: úseky (regiony) jsou
    // samostatné Z-zóny dílu a odložené zanoření se řadí na konec SVÉHO úseku
    // (jinak by se dělalo až úplně nakonec programu, dlouho po vrstvě, ke
    // které patří — reálný nález na díle uživatele). Materiál nad zanořeným
    // nástrojem hlídá tahle podmínka dál stejně přísně.
    for (const p of plunges) {
      const zLo = Math.min(p.zStart, p.zEnd), zHi = Math.max(p.zStart, p.zEnd);
      const after = longs.slice(longs.indexOf(p) + 1)
        .filter(q => Math.max(q.zStart, q.zEnd) > zLo && Math.min(q.zStart, q.zEnd) < zHi);
      for (const q of after) {
        expect(q.x, `po zanoření Ø${p.x.toFixed(3)} ještě průchod na Ø${q.x.toFixed(3)}`)
          .toBeLessThanOrEqual(p.x + 1e-6);
      }
    }
  }, 30000);
});

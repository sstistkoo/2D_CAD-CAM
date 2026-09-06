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
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

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
    const tan = Math.tan(30 * Math.PI / 180);
    const ramped = calc.passes.filter(p => p.type === 'long' && p.ramp);
    expect(ramped.length).toBeGreaterThan(0);

    // ── KOTVA SE ŘETĚZÍ, NERESTARTUJE ─────────────────────────────────────
    // Assertion přepsána 2. 9. 2026. Test dřív žádal kotvu (31, −30) pro
    // KAŽDOU hloubku, tedy „každá vrstva ramuje znovu od povrchu". Ten model
    // opustil `fcc0def` (27. 8. 2026) — a vědomě: kdyby hlubší vrstva začínala
    // na povrchu, prorampovala by znovu i ten klín, který vyřízla vrstva nad
    // ní (reálný nález na díle uživatele, viz `entryRampAnchor` v
    // ops/roughLong.js). Kotva proto sjíždí PO SDÍLENÉ PŘÍMCE zanoření a každá
    // další sedí na hloubce a začátku té předchozí — tedy na povrchu, který
    // předchozí vrstva právě obrobila.
    //
    // Zástupná aritmetika tím zastarala a test padal 24 commitů (kotva
    // −32,598 proti očekávaným −30), přestože dráha je správně. Měří se proto
    // to, co hlavička souboru odjakživa slibuje — „všechny hloubky sdílejí
    // tutéž přímku" — plus samo navázání řetězu.
    const [first] = ramped;
    // První kotva = průsečík čáry začátku rozsahu (z=−30) s povrchem
    // polotovaru + vůle X (30+1=31).
    expect(first.ramp.z0).toBeCloseTo(-30, 4);
    expect(first.ramp.x0).toBeCloseTo(31, 4);

    ramped.forEach((p, i) => {
      // (a) kotva leží na TÉŽE přímce zanoření jako ta první
      expect((31 - p.ramp.x0)).toBeCloseTo((-30 - p.ramp.z0) * tan, 4);
      // (b) rampa z kotvy na hloubku má úhel zanoření
      expect(p.ramp.z0 - p.zStart).toBeCloseTo((p.ramp.x0 - p.x) / tan, 2);
      // (c) řetěz: kotva sedí na hloubce a začátku PŘEDCHOZÍ vrstvy, takže
      //     sjezd k ní jde po už obrobeném povrchu, ne skrz materiál
      if (i > 0) {
        expect(p.ramp.x0).toBeCloseTo(ramped[i - 1].x, 6);
        expect(p.ramp.z0).toBeCloseTo(ramped[i - 1].zStart, 6);
      }
    });

    expect(gcode).toContain('Rampa');

    // ── ŽÁDNÝ KOLMÝ ZÁPICH ────────────────────────────────────────────────
    // Hlavička tuhle podmínku slibovala od začátku, ale nikdy se neměřila.
    // Nález uživatele 2. 9. 2026 ukázal, proč má: přeskupení pořadí průchodů
    // dokáže kotvu nechat viset pod povrchem a sjezd k ní se pak prořeže
    // plným materiálem (tam 11,8 a 14,8 mm radiálně). Radiální posuv smí být
    // jen přísun přes vůli — tady vychází 1,8 mm.
    let x = null, deepest = 0;
    for (const line of gcode.split('\n')) {
      const body = line.replace(/;.*/, '').trim();
      if (!body.startsWith('N')) continue;
      const xm = body.match(/X(-?[\d.]+)/);
      const isFeed = /\bG0?1\b/.test(body);
      const hasZ = /Z(-?[\d.]+)/.test(body);
      if (xm && isFeed && !hasZ && x !== null) deepest = Math.max(deepest, x - +xm[1]);
      if (xm) x = +xm[1];
    }
    expect(deepest, `nejhlubší kolmý posuv v X: ${deepest.toFixed(3)} mm`).toBeLessThan(2.5);
  }, 30000);
});

// ── Zanoření za odlitkovým hrbem (strop vjezdu podle držáku) ────────────
// Na fixture range-end-leadout stojí NAPRAVO od obráběné zóny hrb Ø≈129
// (skok siluety polotovaru na Z=196,278). Rampa od jeho povrchu na malé
// průměry se do Z-okna nevejde, takže se dřív takové hloubky celé zahodily —
// menší průměry zůstaly nehrubované, dokud uživatel ručně neposunul Start
// rozsahu Z až za hrb. Vjezd se teď posune sám tam, kde se vedle vejde držák.
//
// MODEL DRŽÁKU — assertion přepsána 12. 8. 2026. Test dřív počítal, že se
// celých 20 mm držáku musí vejít PŘED hrb (`ramp.z0 + 20 ≤ 196,278 − vůle`).
// To je model PLOCHÉHO bloku v úrovni špičky, který commit `e538e66`
// (10. 8. 2026) vědomě opustil: bere se SKUTEČNÁ spodní hrana obrysu, která
// stoupá (u tohohle držáku 0 → 6,55 mm na 20 mm dozadu), takže smí hrb
// přeletět, pokud pod ní zůstane `HOLDER_ENTRY_STOCK_GAP` = 2 mm volno.
// Zástupná aritmetika tím zastarala a test padal (kotva Z175,55 → konec
// držáku 195,55 proti limitu 194,278), ačkoli dráha kolizi nemá. Měří se
// proto rovnou VALIDÁTOREM — týž Minkowského model, co plní ⚠ panel —
// nad plným obrysem držáku, ne přes jeden jeho rozměr.
const fixture = join(__dirname, 'fixtures/cam/range-end-leadout.camprog');
const load = () => JSON.parse(readFileSync(fixture, 'utf8'));

async function runAndValidate() {
  const { calc, calcSim, S } = await runCamProg(load());
  const issues = validateToolpath(calcSim.simPath, S.params, calc.stockPathSegments,
    { backside: S.params.roughingSide === 'left', maxIssues: 500, maxBlocks: 100000 });
  return { calc, issues };
}

const plungesOf = (calc) => calc.passes
  .filter(p => p.type === 'long' && p.entryRangeRamp && p.x < 20);

describe('zanoření za odlitkovým hrbem', () => {
  it('vjezd se posune tam, kam se vejde držák — a přijde na řadu až po větších průměrech', async () => {
    const { calc, issues } = await runAndValidate();
    const longs = calc.passes.filter(p => p.type === 'long');
    // Zanoření na malý průměr, které dřív úplně chybělo.
    const plunges = plungesOf(calc);
    expect(plunges.length).toBeGreaterThan(0);
    // Držák u nich nikam nenaráží (plný obrys × zbytkový polotovar).
    expect(issues.filter(i => i.kind === 'holder')
      .map(i => `${i.area.toFixed(1)}mm² @X${i.x.toFixed(1)} Z${i.z.toFixed(1)}`)).toEqual([]);
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
  }, 60000);

  it('není to vacuum: s vypnutým hlídáním držáku kolize BÝT musí', async () => {
    // Bez `holderLoopL` (a tedy bez holderEntryCapZ/ReachZ) jede program do
    // hrbu. Zároveň zmizí i všechna tři zanoření za hrbem — ta hloubka se bez
    // clampu vůbec nenajde, což je právě ta zásluha, kterou test výš hlídá.
    // Neasertuje se, aby budoucí lepší vjezd (bez clampu) nepadal na pojistce.
    //
    // 21 → 5 nálezů dne 1. 9. 2026, a NENÍ to oslabení hlídání držáku:
    // většinu těch průchodů teď nevyrobí ani bez něj, protože je zastaví JINÉ
    // pravidlo — kapsový průchod bez rampy i bez nájezdu se nevydá
    // (`ops/long/pocketPass.js`, viz docs/cam-pravidla-drah.md §3.1). Se
    // zapnutým clampem je fixture dál čistá (asserty výš), takže clamp pořád
    // odstraňuje těch zbylých pět — vacuum to není. Práh je proto 2, ne 10:
    // hlídá, že scénář vůbec něco produkuje, ne konkrétní historické číslo.
    globalThis.__DISABLE_HOLDER_CLAMP__ = true;
    try {
      const { issues } = await runAndValidate();
      expect(issues.filter(i => i.kind === 'holder').length).toBeGreaterThan(2);
    } finally {
      delete globalThis.__DISABLE_HOLDER_CLAMP__;
    }
  }, 60000);
});

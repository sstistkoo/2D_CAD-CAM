// ╔══════════════════════════════════════════════════════════════╗
// ║  Uzavřená silueta odlitku nesmí zahodit hloubky průchodů      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// `stockZRangeAt` (genLongPasses) hledá Z-pás, kde na dané hloubce stojí
// polotovar, a dělá to skenem OTEVŘENÉHO řetězu siluety: průsečíky vodorovnice
// se siluetou + konce řetězu, ale ty jen tehdy, když samy leží NAD hloubkou.
//
// Odlitek nakreslený jako UZAVŘENÁ smyčka (poslední bod dosedne na osu) tím
// o svou levou hranici přijde. Na `part-8` se silueta v krčku propadá na
// r 17,9, takže pro hloubky 16,978 … 1,978 nevyšel ani jeden průsečík a konec
// řetězu na r 0 se nezapočítal → jediné Z → `null` → hloubka se přeskočila
// CELÁ. Přitom v pásu Z 258–266 tam stojí materiál od osy až na r 39,94.
//
// Následek nebyl „chybí pár průchodů": posloupnost skočila z 21,978 rovnou na
// vynucený poslední průchod na `minPartX = 0`, takže jeden záběr vzal 21,98 mm
// při ap 2,5.
//
// Test běží s NAKRESLENÝM nožem z DEFAULT_TOOL_MAGAZINE, ne s náhradním
// obdélníkem: reálný nůž je přísnější (začíná na úrovni špičky) a právě na něm
// se ten záběr projevil jako 121,8 mm² držáku v materiálu.
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

// Obrys ze slotu 2 („Hrubovaci") DEFAULT_TOOL_MAGAZINE — reálný nůž.
const MAGAZINE_HOLDER = {
  sideA: [
    { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 20, z: 6.551464216791643 },
    { x: 20, z: 200 }, { x: 0, z: 200 }, { x: 0, z: 0 },
  ],
  sideB: [],
};

async function run(file, holderProfile) {
  const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  prog.params = { ...prog.params, holderProfile };
  prog.zLimits = { ...ZL0, ...(prog.zLimits || {}) };
  prog.xLimits = { ...XL0, ...(prog.xLimits || {}) };
  const { calc, calcSim, params } = await runCamProg(prog);
  return {
    passes: calc.passes.filter(p => p.type === 'long'),
    issues: validateToolpath(calcSim.simPath, params, calcSim.stockPathSegments,
      { backside: params.roughingSide === 'left', maxIssues: 12 }),
  };
}

describe('hloubková posloupnost nevynechá pásmo pod krčkem siluety', () => {
  it('part-8 — pahýl za koncem kontury se nebere jedním 22mm záběrem', async () => {
    const r = await run('part-8.camprog', MAGAZINE_HOLDER);
    // Pás Z 258–266 = pahýl polotovaru za koncem kontury; materiál tam stojí
    // od osy až na r 39,94, takže hloubky musí jít postupně dolů.
    const stub = r.passes
      .filter(p => p.zStart > 258 && p.zStart < 267 && p.zEnd > 255)
      .map(p => +p.x.toFixed(3))
      .sort((a, b) => b - a);
    let maxJump = 0;
    for (let i = 1; i < stub.length; i++) maxJump = Math.max(maxJump, stub[i - 1] - stub[i]);

    // NAMĚŘENO. Před opravou: 6 hloubek (31,978 … 21,978 a pak rovnou 0),
    // největší skok 21,978 mm při ap 2,5. Po opravě: 13 hloubek, největší
    // skok 5,000 mm (chybějící 19,478 zahodí jiné hlídání — samostatná věc).
    expect(stub.length, `hloubky v pahýlu: ${stub.join(', ')}`).toBeGreaterThanOrEqual(12);
    expect(maxJump, `hloubky v pahýlu: ${stub.join(', ')}`).toBeLessThanOrEqual(5.01);
    expect(Math.min(...stub)).toBeLessThan(2.5);
  }, 120000);

  it('part-8 — držák už nezajede o víc než 20 mm² (bylo 121,8)', async () => {
    // Nula to není: zbývají nálezy na rampách, kde se kotva hlídá skenovým
    // modelem `holderFitsAt`, ne polygonem — doložená mez, ne vada dráhy.
    // Práh hlídá jen to, že se nevrátí ten VELKÝ záběr.
    const r = await run('part-8.camprog', MAGAZINE_HOLDER);
    const max = r.issues.reduce((m, i) => Math.max(m, i.area), 0);
    expect(max, r.issues.map(i => `${i.kind} @r${i.x.toFixed(1)} Z${i.z.toFixed(1)} = ${i.area.toFixed(1)}`).join('; '))
      .toBeLessThan(20);
  }, 120000);

  it('díly, jejichž silueta se nepropadá, zůstávají beze změny', async () => {
    // Oprava se smí projevit JEN tam, kde sken vracel null — plošně to hlídají
    // snapshoty, tady je bodová kontrola na dílu s vlastním obrysem držáku.
    const own = JSON.parse(readFileSync(join(fixturesDir, 'part-15-finish-zprava.camprog'), 'utf8'));
    const r = await run('part-15-finish-zprava.camprog', own.params.holderProfile);
    // 32 → 33 dne 26. 8. 2026: NE regrese téhle opravy. Order-aware kontrola
    // nájezdu (krok 7 v docs/cam-order-aware-holder.md) posune vjezd o pár
    // desetin tam, kde se vedle něj nevejde držák, a díl tím získal jeden
    // průchod navíc (celá sada +67,2 mm² úběru při 0 nálezech). Kontrolní
    // podmínka téhle opravy je „bez nálezů", ne konkrétní počet — ten je tu
    // jen jako bodový otisk.
    // 33 → 32 dne 1. 9. 2026: taky NE regrese. Kolmé zanoření je u plátku
    // s úhlem < 90° zakázané (rozhodnutí uživatele, viz
    // docs/cam-pravidla-drah.md §3.1) — vrstva, na kterou se nedá vjet
    // rampou, se vynechá místo aby se do ní nůž zapíchl radiálně.
    expect(r.passes.length).toBe(32);
    expect(r.issues.length).toBe(0);
  }, 120000);
});

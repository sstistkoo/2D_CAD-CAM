// ╔══════════════════════════════════════════════════════════════╗
// ║  Čelisti a koník ořezávají dokončování, ne mažou              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Ořez dokončovací dráhy na [čelisti, koník] zvedal do 25. 8. 2026 na PRVNÍM
// ořezaném segmentu příznak `pastLimit` a všechno za ním zahodil — ať už byl
// na vině kterýkoli z limitů. To dává smysl jen pro limit na KONCI jízdy:
// dokončování jede od velkého Z k malému, takže čelisti (levý konec) potká
// naposled, kdežto koník hned na začátku. Aktivní koník uvnitř dílu proto
// smazal celou dokončovací operaci místo zkrácení zprava.
//
// Naměřeno na part-15 (dokončování bez limitů Z 0,0…235,0):
//   koník Z200                → 0 úseků   (správně 7, Z 0,0…166,5)
//   koník Z120                → 0 úseků   (správně 3, Z 0,0…67,1)
//   čelisti 100 + koník 200   → 0 úseků   (správně 4, Z 125,5…166,5)
// a na part-14 dokonce i u samotných čelistí (0 místo 8) — segment, který se
// nedal ořezat „čistě", shodil zbytek taky.
//
// Uživatel přitom dostal jen obecné „Z-limity: dokončování ořezáno", takže
// zmizení celé operace vypadalo jako normální ořez.
//
// Opraveno přechodem na PÁSOVÝ ořez (`clipFinishBand`, sdílený s rozsahem
// obrábití 📐 — viz cam-face-range.test.js): ten pojem „za hranicí" vůbec nezná,
// ptá se jen „uvnitř, nebo venku?", takže na pořadí limitů ani na směru jízdy
// nezáleží.
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

// Doplnit výchozí parametry i obě omezení CELÁ — `runCamProg` slévá parametry
// do sdíleného `S`, takže fixture bez klíče zdědí hodnotu z předchozího běhu.
// Fixtures bez nakresleného obrysu držáku dostanou jednostranný obdélník:
// náhradní obrys je vystředěný na špičku a vyrábí kolize sám od sebe, což je
// samostatná vada a tenhle test by měřil ji místo limitů.
async function runWith(file, zLimits = {}, params = {}) {
  const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  prog.params = { ..._defaultCamParams(), ...prog.params, doFinishing: true, finishOnly: false, ...params };
  prog.zLimits = { ...ZL0, ...zLimits };
  prog.xLimits = { ...XL0 };
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
  const opts = { backside: prog.params.roughingSide === 'left' };
  return {
    gcode,
    finish: extentOf(calc.finishOffsetPath || []),
    issues: validateToolpath(calcSim.simPath, prog.params, calcSim.stockPathSegments, opts),
  };
}

// Skutečné body na dráze — bounding box oblouku (cz ± r) popisuje celou
// kružnici, ne projetý výsek, a hlásil by polohy, kudy dráha vůbec nejede.
function extentOf(segs) {
  let zLo = Infinity, zHi = -Infinity, n = 0, len = 0;
  for (const s of segs) {
    if (s.isDegenerate) continue;
    n++;
    if (s.type === 'line') {
      for (let k = 0; k <= 20; k++) {
        const z = s.p1.z + (s.p2.z - s.p1.z) * (k / 20);
        zLo = Math.min(zLo, z); zHi = Math.max(zHi, z);
      }
      len += Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z);
    } else {
      let a0 = s.startAngle, a1 = s.endAngle;
      if (s.dir === 'G2' && a1 > a0) a1 -= 2 * Math.PI;
      if (s.dir === 'G3' && a1 < a0) a1 += 2 * Math.PI;
      for (let k = 0; k <= 40; k++) {
        const z = s.cz + Math.cos(a0 + (a1 - a0) * (k / 40)) * s.r;
        zLo = Math.min(zLo, z); zHi = Math.max(zHi, z);
      }
      len += Math.abs(a1 - a0) * s.r;
    }
  }
  return { n, len, zLo, zHi };
}

// Naměřené hodnoty PO opravě. Před ní byly všechny „úseků" u koníku nulové.
const CASES = [
  { file: 'part-15-finish-zprava.camprog', lbl: 'koník Z200', zl: { tailActive: true, tail: 200 }, lo: -Infinity, hi: 200 },
  { file: 'part-15-finish-zprava.camprog', lbl: 'koník Z120', zl: { tailActive: true, tail: 120 }, lo: -Infinity, hi: 120 },
  { file: 'part-15-finish-zprava.camprog', lbl: 'čelisti 100 + koník 200', zl: { chuckActive: true, chuck: 100, tailActive: true, tail: 200 }, lo: 100, hi: 200 },
  { file: 'part-14-finish-holder.camprog', lbl: 'čelisti Z100', zl: { chuckActive: true, chuck: 100 }, lo: 100, hi: Infinity },
  { file: 'part-14-finish-holder.camprog', lbl: 'koník Z200', zl: { tailActive: true, tail: 200 }, lo: -Infinity, hi: 200 },
  { file: 'part-1.camprog', lbl: 'koník Z200', zl: { tailActive: true, tail: 200 }, lo: -Infinity, hi: 200 },
  { file: 'part-16-face-holder.camprog', lbl: 'koník Z200', zl: { tailActive: true, tail: 200 }, lo: -Infinity, hi: 200 },
];

describe('čelisti/koník dokončování ořežou, ne smažou', () => {
  for (const { file, lbl, zl, lo, hi } of CASES) {
    it(`${file} — ${lbl}`, async () => {
      const free = await runWith(file);
      const lim = await runWith(file, zl);

      expect(free.finish.n, `${file}: bez limitů není co dokončovat`).toBeGreaterThan(0);
      expect(free.finish.zLo < lo - 0.5 || free.finish.zHi > hi + 0.5,
        `${file}: dokončování leží celé v mezích — případ nic netestuje`).toBe(true);

      // Jádro opravy: po ořezu musí ZBÝT dráha (dřív jich u koníku bylo nula).
      expect(lim.finish.n, `${file} / ${lbl}: dokončování zmizelo celé`).toBeGreaterThan(0);
      expect(lim.finish.len, `${file} / ${lbl}: ořez nic nezkrátil`).toBeLessThan(free.finish.len - 0.5);
      expect(lim.finish.zLo, `${file} / ${lbl}: dráha sahá na Z${lim.finish.zLo.toFixed(2)}, tedy pod čelisti`)
        .toBeGreaterThanOrEqual(lo - 0.02);
      expect(lim.finish.zHi, `${file} / ${lbl}: dráha sahá na Z${lim.finish.zHi.toFixed(2)}, tedy za koník`)
        .toBeLessThanOrEqual(hi + 0.02);
    }, 120000);
  }

  it('limity mimo díl nemění nic (part-15 = uložené hodnoty fixture)', async () => {
    // Pojistka proti tomu, aby přechod na pásový ořez hnul s dráhami tam, kde
    // limity do dílu vůbec nezasahují — na tom stojí všechny čelní snapshoty.
    const free = await runWith('part-15-finish-zprava.camprog');
    const wide = await runWith('part-15-finish-zprava.camprog',
      { chuckActive: true, chuck: -1000, tailActive: true, tail: 1000 });
    expect(wide.finish.n).toBe(free.finish.n);
    expect(wide.gcode).toBe(free.gcode);
  }, 120000);

  it('ořez nepřidává kolize (part-16, čelisti Z100)', async () => {
    // Konfigurace, kde je i hrubování v mezích čisté — jinde nálezy jsou, ale
    // pocházejí z hrubování ořezaného limity (materiál zůstane stát vedle)
    // a jsou PŘED opravou i po ní ve shodných počtech.
    const r = await runWith('part-16-face-holder.camprog', { chuckActive: true, chuck: 100 });
    expect(r.finish.n).toBeGreaterThan(0);
    expect(r.issues.length,
      r.issues.map(i => `${i.kind} @r${i.x.toFixed(2)} Z${i.z.toFixed(1)} = ${i.area.toFixed(1)} mm²`).join('; ')).toBe(0);
  }, 120000);
});

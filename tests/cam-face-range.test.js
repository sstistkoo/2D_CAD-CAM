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
import { insertBodyZ } from '../js/calculators/cam/materialRemoval.js';

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
    facePasses, gcode, prog, calc,
    finish: calc.finishOffsetPath || [],
    issues: validateToolpath(calcSim.simPath, prog.params, calcSim.stockPathSegments, opts),
    issuesPlan: validateToolpath(calcSim.simPath, prog.params, calcSim.stockPathSegments,
      { ...opts, planStock: true, shrink: 0.25 }),
  };
}

// Skutečné body na dokončovací dráze. Bounding box oblouku (cx ± r) tu NESTAČÍ:
// popisuje celou kružnici, ne projetý výsek, takže by hlásil polohy, kudy dráha
// vůbec nejede — a test by padal na vlastní měřicí chybu.
function finishExtent(segs) {
  let zLo = Infinity, zHi = -Infinity, xLo = Infinity, xHi = -Infinity, n = 0, len = 0;
  for (const s of segs) {
    if (s.isDegenerate) continue;
    n++;
    const pts = [];
    if (s.type === 'line') {
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        pts.push({ x: s.p1.x + (s.p2.x - s.p1.x) * t, z: s.p1.z + (s.p2.z - s.p1.z) * t });
      }
      len += Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z);
    } else {
      let a0 = s.startAngle, a1 = s.endAngle;
      if (s.dir === 'G2' && a1 > a0) a1 -= 2 * Math.PI;
      if (s.dir === 'G3' && a1 < a0) a1 += 2 * Math.PI;
      for (let k = 0; k <= 40; k++) {
        const a = a0 + (a1 - a0) * (k / 40);
        pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
      }
      len += Math.abs(a1 - a0) * s.r;
    }
    for (const p of pts) {
      zLo = Math.min(zLo, p.z); zHi = Math.max(zHi, p.z);
      xLo = Math.min(xLo, p.x); xHi = Math.max(xHi, p.x);
    }
  }
  return { n, len, zLo, zHi, xLo, xHi };
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

describe('rozsah obrábění ořezává i DOKONČOVACÍ dráhu', () => {
  // Rozsah není polorovina jako čelisti/koník, ale PÁS: může uříznout oba konce
  // a nechat kus uprostřed. Ořezává se, nezahazuje — hranice pásu je volba
  // uživatele („tady končí tenhle úsek“), ne mez dosažitelnosti nástroje.
  const FIN = [
    { file: 'part-15-finish-zprava.camprog', strategy: 'longitudinal', band: [100, 200], xBand: [20, 40] },
    { file: 'part-14-finish-holder.camprog', strategy: 'longitudinal', band: [0, 120], xBand: [20, 40] },
    { file: 'part-16-face-holder.camprog', strategy: 'face', band: [100, 200], xBand: [20, 40] },
    { file: 'part-1.camprog', strategy: 'longitudinal', band: [100, 200], xBand: [20, 40] },
  ];
  for (const { file, strategy, band: [lo, hi], xBand: [xLo, xHi] } of FIN) {
    it(`${file} — dokončování zůstane v pásu Z ${lo}…${hi}`, async () => {
      const p = { roughingStrategy: strategy, doFinishing: true, finishOnly: false };
      const free = finishExtent((await runWith(file, { params: p })).finish);
      const band = finishExtent((await runWith(file, {
        params: p, zLimits: { rangeActive: true, rangeStart: lo, rangeEnd: hi },
      })).finish);

      expect(free.n, `${file}: bez pásu není co dokončovat — případ nic netestuje`).toBeGreaterThan(0);
      // Pás musí aspoň z jedné strany do dráhy zasahovat, jinak případ nic neměří.
      expect(free.zLo < lo - 0.5 || free.zHi > hi + 0.5,
        `${file}: dokončování (Z ${free.zLo.toFixed(1)}…${free.zHi.toFixed(1)}) leží celé v pásu — případ nic netestuje`).toBe(true);
      expect(band.n, `${file}: pás smazal dokončování celé`).toBeGreaterThan(0);
      expect(band.len, `${file}: pás dokončovací dráhu nezkrátil`).toBeLessThan(free.len - 0.5);
      expect(band.zLo, `${file}: dokončování sahá na Z${band.zLo.toFixed(2)}, tedy pod pás`).toBeGreaterThanOrEqual(lo - 0.02);
      expect(band.zHi, `${file}: dokončování sahá na Z${band.zHi.toFixed(2)}, tedy nad pás`).toBeLessThanOrEqual(hi + 0.02);
    }, 120000);

    it(`${file} — dokončování zůstane v pásu X ${xLo}…${xHi}`, async () => {
      const p = { roughingStrategy: strategy, doFinishing: true, finishOnly: false };
      const band = finishExtent((await runWith(file, {
        params: p, xLimits: { active: true, rangeXMin: xLo, rangeXMax: xHi },
      })).finish);
      expect(band.n).toBeGreaterThan(0);
      expect(band.xLo, `${file}: dokončování jde na r${band.xLo.toFixed(2)}, tedy pod pás`).toBeGreaterThanOrEqual(xLo - 0.02);
      expect(band.xHi, `${file}: dokončování jde na r${band.xHi.toFixed(2)}, tedy nad pás`).toBeLessThanOrEqual(xHi + 0.02);
    }, 120000);
  }

  it('ořez dokončování nepřidává kolize (part-16, pás Z 100…200)', async () => {
    // Měřeno proti stavu BEZ ořezu: kolize, které u některých pásů vyskočí,
    // pocházejí z hrubování omezeného pásem (materiál zůstane stát vedle),
    // ne z ořezu dokončování — ten je vůči nim neutrální. Tady je fixture,
    // kde je i hrubování v pásu čisté, takže se nula dá tvrdit natvrdo.
    const r = await runWith('part-16-face-holder.camprog', {
      params: { roughingStrategy: 'face', doFinishing: true, finishOnly: false },
      zLimits: { rangeActive: true, rangeStart: 100, rangeEnd: 200 },
    });
    expect(r.issues.length, `(silueta): ${detail(r.issues)}`).toBe(0);
    expect(r.issuesPlan.length, `(offsetová čára): ${detail(r.issuesPlan)}`).toBe(0);
  }, 120000);
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

describe('rozsah 📐 vymezuje OBROBENOU PLOCHU, ne programovaný bod', () => {
  // Destička má šířku: řez sahá o rádius nosu PŘED programovaný bod a o tělo
  // (`insertBodyZ` — u upichováku šířka plátku bez rádiusu, jinak `ap`) ZA něj.
  // Hranice pásu se proto měří na ŘEZU:
  //   • žádný průchod nesmí řezat za hranici (dovnitř sousedního úseku),
  //   • na konci marche musí řez na hranici DOJET — mřížka kotvená na kraji
  //     polotovaru tam sama nesedne a nechávala proužek až `ap` široký.
  // Nález uživatele 26. 8. 2026 (upichovák 5 mm, pás od Z311,76): první průchod
  // na Z308,932 řezal až na Z313,932, tedy 2,17 mm za startem rozsahu.
  const reachOf = (p) => {
    const r = Math.max(parseFloat(p.toolRadius) || 0.8, 0.05);
    return { lead: r, trail: Math.max(r, insertBodyZ(p, r)) };
  };

  // Zleva se čelně svět NEzrcadlí, ale marche jde opačně a s ní i obě strany
  // stopy destičky — proto je v seznamu i případ `roughingSide: 'left'`.
  // Znaménko se v `genFacePasses` řídí `sgnF` a kraj polotovaru na straně
  // startu je `faceEdgeZ` (zleva DRUHÝ konec dílu); s `faceStartZ` se klamp
  // startu zleva vůbec nenasadil.
  const SIDES = [...CASES.map(c => ({ ...c, side: 'right' })),
    { file: 'part-19-face-tilted-insert.camprog', band: [250, 320], side: 'left' }];
  for (const { file, band: [lo, hi], side } of SIDES) {
    it(`${file} (${side}) — řez zůstane v pásu Z ${lo}…${hi} a dojede na jeho konec`, async () => {
      const free = await runWith(file, { params: { roughingSide: side } });
      const band = await runWith(file, { params: { roughingSide: side }, zLimits: { rangeActive: true, rangeStart: lo, rangeEnd: hi } });
      const prms = band.prog.params;
      const { lead, trail } = reachOf(prms);
      // Zprava marche klesá (čelo řezu je na −Z, záď na +Z), zleva obráceně.
      const left = prms.roughingSide === 'left';
      const cutLead = (p) => left ? p.z + lead : p.z - lead;
      const cutTail = (p) => left ? p.z - trail : p.z + trail;
      const bndEnd = left ? hi : lo;
      const bndStart = left ? lo : hi;

      expect(band.facePasses.length).toBeGreaterThan(0);
      // 1) Nic nepřeteče ven z pásu — ani čelo řezu, ani jeho záď.
      for (const p of band.facePasses) {
        for (const v of [cutLead(p), cutTail(p), p.z]) {
          expect(v, `${file}: řez průchodu Z${p.z.toFixed(2)} sahá na Z${v.toFixed(2)}, tedy pod pás`).toBeGreaterThanOrEqual(lo - 0.01);
          expect(v, `${file}: řez průchodu Z${p.z.toFixed(2)} sahá na Z${v.toFixed(2)}, tedy nad pás`).toBeLessThanOrEqual(hi + 0.01);
        }
      }
      // 2) Na konci marche řez na hranici DOJEDE (bez pásu se za ni jezdí,
      //    takže je co dorovnávat).
      //    VÝJIMKA `face-casting`: vrstva na hranici se do mřížky přidá, ale
      //    průchod z ní nevznikne — schodišťové pravidlo vede hloubku od první
      //    vrstvy pásu a u dolní meze je řez už nad povrchem odlitku, tedy
      //    vzduch (zbývá 1,2 mm). Kdyby to někdy dosáhlo, je to zlepšení:
      //    přepiš výjimku, netlum test.
      const beyond = free.facePasses.some(p => Math.abs(cutLead(p) - bndEnd) > 0.01
        && (left ? cutLead(p) > hi : cutLead(p) < lo));
      expect(beyond, `${file}: bez pásu se za hranici Z${bndEnd} stejně nejede — případ nic netestuje`).toBe(true);
      if (file !== 'face-casting.camprog') {
        const gap = Math.min(...band.facePasses.map(p => Math.abs(cutLead(p) - bndEnd)));
        expect(gap, `${file}: řez končí ${gap.toFixed(2)} mm před hranicí Z${bndEnd}`).toBeLessThanOrEqual(0.01);
      }
      // 3) Start pásu leží uvnitř materiálu, takže se o něj první průchod
      //    opřel — záď řezu na něm musí sedět (ne za ním, ne o `ap` dřív).
      const gapS = Math.min(...band.facePasses.map(p => Math.abs(cutTail(p) - bndStart)));
      expect(gapS, `${file}: řez začíná ${gapS.toFixed(2)} mm za startem pásu Z${bndStart}`).toBeLessThanOrEqual(0.01);

      expect(band.issues.length, `${file} (silueta): ${detail(band.issues)}`).toBe(0);
      expect(band.issuesPlan.length, `${file} (offsetová čára): ${detail(band.issuesPlan)}`).toBe(0);
    }, 120000);
  }

  // Podélně je řezná osa Z a mřížkou jsou HLOUBKY, takže hranici dorovnává
  // rozsah X — a jen jeho DOLNÍ mez (dno pásu). Nad horní mezí se v tomhle
  // úseku neobrábí vůbec; tu hloubku dělá sousední úsek, jehož dnem je právě
  // ona, takže průchod na ní by z ničeho neubral.
  const XCASES = [
    { file: 'part-1.camprog', xLo: 20, xHi: 40 },
    { file: 'part-15-finish-zprava.camprog', xLo: 20, xHi: 40 },
    { file: 'part-14-finish-holder.camprog', xLo: 20, xHi: 40 },
  ];
  for (const { file, xLo, xHi } of XCASES) {
    it(`${file} — podélné hloubky dojedou na dno pásu X ${xLo}…${xHi}`, async () => {
      const params = { roughingStrategy: 'longitudinal' };
      const free = await runWith(file, { params });
      const band = await runWith(file, { params, xLimits: { active: true, rangeXMin: xLo, rangeXMax: xHi } });
      const longsOf = (r) => (r.calc.passes || []).filter(p => p.type === 'long');
      expect(longsOf(free).some(p => p.x < xLo - 1e-6),
        `${file}: bez pásu se pod dolní mez vůbec nejede — případ nic netestuje`).toBe(true);
      const longs = longsOf(band);
      expect(longs.length).toBeGreaterThan(0);
      const deepest = Math.min(...longs.map(p => p.x));
      expect(deepest, `${file}: nejhlubší průchod je na r${deepest.toFixed(2)}, tedy ${(deepest - xLo).toFixed(2)} mm nad dnem pásu`)
        .toBeCloseTo(xLo, 2);
      for (const p of longs)
        expect(p.x, `${file}: průchod na r${p.x.toFixed(2)} leží pod dnem pásu`).toBeGreaterThanOrEqual(xLo - 0.01);
    }, 120000);
  }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║  Model zbytku VE STRATEGII × reálně projetá dráha             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dvojče `cam-residual-model.test.js`. Ten hlídá model, podle kterého se
// v EMISI rozhodují rychloposuvy (`rapidStock` v gcodeEmit.js). Tenhle hlídá
// model, podle kterého se ve STRATEGII rozhoduje o vjezdech a zanořeních —
// a na kterém má podle `docs/cam-order-aware-holder.md` stát i hlídání
// držáku pro hloubkové intervaly (dnes statická obálka z HOTOVÉHO dílu).
//
// SMĚR JE JEN JEDEN. Model výš než realita = strategie si myslí, že materiál
// stojí, a vjezd odmítne: stojí to úběr, ale nikoho to nezraní. Model NÍŽ než
// realita = strategie si myslí, že je vykopáno, pustí tam držák a ten narazí.
// Měří se proto jen tenhle druhý směr, stejně jako u `cam-residual-model`.
//
// ── PROČ POLYGONY A NE VÝŠKOVÉ POLE ───────────────────────────────────────
// Strategie si dodnes vede `cutFloorTab`: jedno číslo na svislici Z, MINIMUM
// přes naplánované průchody. Levné a pro běžné vrstvení správné, ale neumí
// popsat TUNEL — když zanoření nebo dojezd po kontuře podjede pod stojícím
// materiálem, srazí celý sloupec na hloubku tunelu. Změřeno 26. 8. 2026:
//
//   fixture                       výškové pole      ResidualTracker
//   part-8                        −11,2 mm          viz test níž
//   holder-casting-slanted-face   −13,6 mm          viz test níž
//
// Obojí jsou přesně ty dva díly, na kterých zůstávají doložené kolize držáku
// (4 / 33,4 mm² a 2 / 2,3 mm²). Rozdíl tedy NENÍ jen v modelu držáku, jak
// dosud stálo v EXPECTED u `cam-collision-free`, ale i v modelu MATERIÁLU.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { StockModel, toolSweep } from '../js/geom/geomCore.js';
import { toolFootprint } from '../js/calculators/cam/materialRemoval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

// Nejvyšší materiál na svislici Z (null = smyčky tam nesahají).
function topAt(loops, z) {
  let top = null;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
        if (top === null || x > top) top = x;
      }
    }
  }
  return top;
}

// Povrch podle VÝŠKOVÉHO POLE — přesně jako `residTopAt` v roughingStrategies:
// z polotovaru VYŠŠÍ ze dvou sousedních vzorků (svislé čelo mezi vzorky se
// nesmí přichytit k prázdné straně), z podlahy NIŽŠÍ.
function tabTopAt(tab, z, withFloor = true) {
  const f = (z - tab.z0) / tab.dz;
  let top = null, cut = Infinity;
  for (const i of [Math.floor(f), Math.floor(f) + 1]) {
    if (i < 0 || i >= tab.stock.length) continue;
    if (tab.stock[i] !== -Infinity && (top === null || tab.stock[i] > top)) top = tab.stock[i];
    if (withFloor && tab.floor[i] < cut) cut = tab.floor[i];
  }
  return top === null ? null : Math.min(top, cut);
}

// Zbytek podle REÁLNĚ projeté dráhy — řezné bloky `simPath` do StockModelu,
// stejně jako to dělá validateToolpath (a `cam-residual-model`).
function replayReality(seed, calcSim, prms) {
  const stock = new StockModel([seed]);
  const foot = toolFootprint(prms);
  const sp = calcSim.simPath || [];
  let cur = null;
  const blocks = [];
  for (let i = 1; i < sp.length; i++) {
    const p = sp[i];
    const li = p.originalLineIdx ?? (cur ? cur.lineIdx : null);
    const type = p.type || 'G0';
    if (!cur || li !== cur.lineIdx || type !== cur.type) {
      cur = { lineIdx: li, type, pts: [sp[i - 1], p] };
      blocks.push(cur);
    } else cur.pts.push(p);
  }
  for (const b of blocks) {
    if (b.type === 'G0') continue;              // rychloposuv neřeže
    const pts = b.pts.map(p => ({ x: p.x, z: p.z }));
    if (pts.length < 2) continue;
    try { stock.cut(toolSweep(foot, pts)); } catch { /* model je jen měřidlo */ }
  }
  return stock;
}

/** Nejhorší podřezání obou modelů proti realitě [mm]. */
async function measure(name) {
  const prog = JSON.parse(readFileSync(join(fxDir, `${name}.camprog`), 'utf8'));
  globalThis.__RESIDUAL_TRACKER_DUMP__ = [];
  globalThis.__FLOOR_TAB_DUMP__ = [];
  let trk, tabs, run;
  try {
    run = await runCamProg(prog);
    trk = globalThis.__RESIDUAL_TRACKER_DUMP__;
    tabs = globalThis.__FLOOR_TAB_DUMP__;
  } finally {
    delete globalThis.__RESIDUAL_TRACKER_DUMP__;
    delete globalThis.__FLOOR_TAB_DUMP__;
  }
  expect(trk.length, 'seam nevydal tracker — strategie ho přestala plnit').toBeGreaterThan(0);
  expect(tabs.length, 'seam nevydal výškové pole').toBeGreaterThan(0);
  // ── VYBRAT BĚH, ZE KTERÉHO OPRAVDU VZNIKL G-KÓD ────────────────────────
  // Opraveno 2. 9. 2026. Test dřív bral `trk[0]` s odůvodněním „pipeline běží
  // dvakrát, model z prvního běhu je ten, podle kterého se plánovalo". To
  // neplatí: generátor běží v každém `calculate()` VÍCKRÁT a jednotlivé běhy
  // se liší. Na `part-8` vydaly 44 a 41 průchodů — a do `calc` (a tedy do
  // G-kódu, ze kterého se replayuje realita) šel ten se 41. Porovnával se
  // proto model jednoho běhu s dráhou jiného: rozdíl 21,565 − 15,779 =
  // 5,786 mm, přesně to, co test hlásil jako „model lže".
  //
  // Vybírá se podle `len` (délka pole průchodů v tom běhu) shodné s
  // `calc.passes` — a POSLEDNÍ takový, protože emituje se z posledního běhu
  // prvního `calculate()`. Nesedne-li žádný, vezme se první a test měří jako
  // dřív (raději hlásit rozdíl než tiše měřit nesmysl).
  const pick = (arr) => arr.filter(d => d.len === run.calc.passes.length).pop() || arr[0];
  const dump = pick(trk), tab = pick(tabs);
  expect(dump.seed, 'tracker nemá výchozí smyčku').toBeTruthy();

  // HRUBOVÁNÍ ZLEVA JE ZRCADLO. `computeCalculation` překlopí celý svět
  // v Z (mirZ, zMirror.js), takže oba modely ze strategie jsou v zrcadlených
  // souřadnicích, kdežto `simPath` (z vygenerovaného G-kódu) v reálných.
  // Bez překlopení zpátky se porovnává díl se svým vlastním obrazem —
  // na part-13-zleva-flange to vyšlo jako „57 mm pod realitou" @Z−173.
  const mir = (run.S.params.roughingSide === 'left') ? -1 : 1;
  const M = { loops: dump.loops.map(l => l.map(q => ({ x: q.x, z: mir * q.z }))),
    seed: dump.seed.map(q => ({ x: q.x, z: mir * q.z })) };
  const T = mir < 0
    ? { z0: -(tab.z0 + (tab.stock.length - 1) * tab.dz), dz: tab.dz,
      stock: Array.from(tab.stock).reverse(), floor: Array.from(tab.floor).reverse() }
    : tab;

  // Realita se přehrává z TÉHOŽ polotovaru, jaký zná tracker — jinak by se
  // porovnávaly dva různé polotovary, ne dva modely řezu.
  const real = replayReality(M.seed, run.calcSim, run.S.params);

  let worstTrk = 0, worstTrkZ = null, worstTab = 0;
  const zLo = T.z0, zHi = T.z0 + (T.stock.length - 1) * T.dz;
  for (let z = zLo + T.dz; z < zHi; z += T.dz) {
    const r = topAt(real.loops, z);
    if (r === null) continue;
    const m = topAt(M.loops, z);
    if (m !== null && r - m > worstTrk) { worstTrk = r - m; worstTrkZ = z; }
    const t = tabTopAt(T, z);
    // Výškové pole neví o materiálu za svým vzorkovaným rozsahem — porovnávat
    // se dá jen tam, kde polotovar zná.
    const st = tabTopAt(T, z, false);
    if (t !== null && st !== null && Math.min(r, st) - t > worstTab) worstTab = Math.min(r, st) - t;
  }
  return { worstTrk, worstTrkZ, worstTab, passes: dump.count };
}

// Doložené meze: { fixture: [mez mm, proč] }. Nepřidávat sem nic, co jde
// spravit v modelu — od toho je tenhle test.
const LIMITS = {
  // Tracker zná PLÁN, ne EMISI. Mezi nimi je ještě `envify`, zpětné
  // prokládání oblouků, ořezy držáku a `emitBodyX`, takže dojezd po kontuře
  // se vydá o kousek jinudy, než jak ho strategie zapsala. Změřeno 26. 8.
  // 2026: 35 vzorků z 1936, výhradně v pásech Z 173–176 a 181–186, a každý
  // sedí na `contourLeadOut` průchodů #8/#11 (dno #11 končí na Z 173,17,
  // dojezd pokračuje 173,17→175,33). Žádný jiný díl v sadě takový rozdíl
  // nemá. Zpřesnit to jde jedině tím, že by se model plnil AŽ V EMISI —
  // což je přesně to, co `rapidStock` v gcodeEmit.js dělá a co strategii
  // nepomůže, protože ta se musí rozhodnout dřív.
  'part-13-zleva-flange': [0.35, 'dojezd po kontuře: plán × skutečně vydaná dráha'],
};

describe('ResidualTracker nelže o materiálu', () => {
  // Fixtures z `cam-residual-model` + ty, na kterých držák rozhoduje
  // (part-8 = jediný díl se zbylými nálezy, holder-* = hlídání držáku).
  for (const name of ['part-1', 'part-4', 'part-8', 'part-13-zleva-flange',
    'holder-region-roughing', 'holder-casting-slanted-face']) {
    const [lim, why] = LIMITS[name] || [0.05, null];
    it(`${name}: model není níž než realita`, async () => {
      const { worstTrk, worstTrkZ, passes } = await measure(name);
      expect(passes, 'tracker nedostal ani jeden průchod').toBeGreaterThan(0);
      expect(worstTrk, `model o ${worstTrk.toFixed(3)} mm níž než realita @Z${worstTrkZ}` +
        (why ? ` (doložená mez ${lim} mm — ${why})` : '')).toBeLessThanOrEqual(lim);
    }, 120000);
  }

  // Smysl celého kroku 1: polygonový model umí TUNEL, výškové pole ne.
  // Kdyby tahle nerovnost padla, tracker je jen dražší kopie pole.
  //
  // `holder-casting-slanted-face` ze seznamu VEN (2. 9. 2026). Původně tu byl
  // s naměřeným −13,6 mm; po opravě výběru běhu (viz `pick` v `measure`) je
  // tam výškové pole na 0,000 mm — ten tunel v dnešním programu prostě
  // nevzniká. Nerovnost pak neměří přínos trackeru, jen náhodu na jednom
  // dílu. `part-8` ho měří dál a měří ho pořádně: pole podřezává 9,366 mm
  // proti trackeru 0,012 mm. V testu „model není níž než realita" výš
  // `holder-casting-slanted-face` ZŮSTÁVÁ — tam pořád hlídá.
  for (const name of ['part-8']) {
    it(`${name}: tracker je proti výškovému poli měřitelně lepší`, async () => {
      const { worstTrk, worstTab } = await measure(name);
      // Naměřeno 26. 8. 2026: výškové pole −11,2 (part-8) a −13,6 mm
      // (holder-casting) proti realitě; tracker do 0,05 mm.
      expect(worstTab, `výškové pole podřezává jen o ${worstTab.toFixed(3)} mm`)
        .toBeGreaterThan(1);
      expect(worstTrk).toBeLessThan(worstTab);
    }, 120000);
  }
});

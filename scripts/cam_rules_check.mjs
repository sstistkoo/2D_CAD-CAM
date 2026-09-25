// ╔══════════════════════════════════════════════════════════════╗
// ║  KONTROLA PROGRAMU PODLE PRAVIDEL (docs/cam-pravidla.md)       ║
// ╚══════════════════════════════════════════════════════════════╝
// Vezme projekt `.camprog`, vygeneruje dráhy TÍMŽ kódem jako aplikace
// a vypíše porušení pravidel s čísly řádků G-kódu (N…). Hotovo = 0.
//
//   node scripts/cam_rules_check.mjs soubor.camprog [další.camprog …]
//   node scripts/cam_rules_check.mjs soubor.camprog --all      (vypsat všechny řádky)
//
// Co se měří (materiál = model úběru ze skutečně vydané dráhy, jako simulátor):
//   P2  kolize nástroje/držáku (validátor)
//   P3  tříska > ap          — v každém bodě posuvu: materiál nad břitem PŘED
//                              pohybem (povrch − břit) > ap
//   P3  zbytek na dně        — po celém programu: materiál nad dílem víc než
//                              Přídavek X (poslední vrstva chybí)
//   P3  tenká vrstva uprostřed — průchod v Z ubral nejvýš ap − 0,3 mm, a přesto
//                              na tomtéž místě později jela ještě hlubší vrstva
//   P5  posuv vzduchem       — G1 delší než 3 mm, který skoro nic neubere
//   P6  zanoření strměji než dovoleno — posuv k ose, který řeže, strmější než
//                              „Úhel zanoření"; polygon navíc nikdy strměji než
//                              spodní hrana (neřezat dvěma stranami). Upichovák smí.
//   P7  přejezd přes hrb dřív, než je pravá strana hotová   (scripts/lib/camRuleOrder.mjs)
//   P8  úsek hlouběji než vrch nehotového úseku vpravo       (scripts/lib/camRuleOrder.mjs)
//   P4  vrstva končí uprostřed materiálu — hned za koncem průchodu
//                              stojí materiál téže vrstvy a nebrání tomu díl
// P1 (úseky) se z G-kódu ověřit nedá — hlídá ho test `cam-region-guide-split`.

import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, basename } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { runCamProg } = await imp('tests/helpers/camHeadless.mjs');
const { MaterialRemoval, toolFootprint } = await imp('js/calculators/cam/materialRemoval.js');
const { validateToolpath } = await imp('js/calculators/cam/collisionValidator.js');
const { offsetSilhouetteLoop } = await imp('js/calculators/cam/toolEnvelope.js');
const { getEffectivePlungeAngle, topXOnLoop } = await imp('js/calculators/cam/camMath.js');
const { getInsert } = await imp('js/calculators/cam/inserts/index.js');
const { makePassHelpers } = await imp('js/calculators/cam/passHelpers.js');
const { polyOffset, pointInLoop } = await imp('js/geom/geomCore.js');
const { makeOrderChecks } = await imp('scripts/lib/camRuleOrder.mjs');

// ── Tolerance (jedna místo, ať je vidět, s čím se měří) ──────────────
const TOL_AP = 0.05;        // mm nad ap, než je to porušení
const TOL_FLOOR = 0.1;      // mm nad Přídavkem X, než je to „zbytek na dně"
const THIN = 0.3;           // o kolik méně než ap = „tenká vrstva"
const AIR_MIN_LEN = 3;     // kratší posuvy (odskok 2,8 mm) se za vzduch nepočítají
const AIR_CUT_PER_MM = 0.01; // mm² na mm dráhy = „nic neubral"
const SAMPLE = 0.5;         // krok vzorkování podél pohybu [mm]

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const showAll = args.includes('--all');
if (files.length === 0) {
  console.log('Použití: node scripts/cam_rules_check.mjs soubor.camprog [--all]');
  process.exit(1);
}

const topAt = (loops, z) => {
  let top = null;
  for (const l of loops) { const t = topXOnLoop(l, z); if (t !== null && (top === null || t > top)) top = t; }
  return top;
};

async function check(file) {
  const prog = JSON.parse(readFileSync(file, 'utf8'));
  const r = await runCamProg(prog);
  const P = r.params;
  const ap = parseFloat(P.depthOfCut);
  // Břit = nejnižší bod stopy nástroje pod programovaným bodem (kulatá R, polygon rádius nosu).
  const lift = Math.max(0, -Math.min(...toolFootprint(P).map(q => q.x)));
  const ins = getInsert(P);
  const partingOk = !!ins.cutsFullWidth;
  // P6: dovolený úhel posuvu k ose. Polygon nikdy strměji než spodní hrana.
  const plungeLimit = partingOk ? 90
    : (P.toolShape === 'polygon' ? Math.min(getEffectivePlungeAngle(P), ins.autoPlungeAngleDeg) : getEffectivePlungeAngle(P));
  const allowX = parseFloat(P.allowanceX) || 0;
  const sp = r.calcSim.simPath;
  const lines = r.gcode.split('\n');
  const N = (i) => { const t = (lines[sp[i].originalLineIdx] || '').trim(); const m = /^N\d+/.exec(t); return m ? m[0] : `#${i}`; };
  const txt = (i) => (lines[sp[i].originalLineIdx] || '').trim();

  const rm = new MaterialRemoval(P, r.calcSim.stockPathSegments, {});
  const part = offsetSilhouetteLoop(r.calc.contourSegments);
  // Kam až smí dráha (střed nosu) dojet — offsetová dráha i s přídavky.
  const { offsetXAt } = makePassHelpers(r.calc.offsetPath || []);
  // Přídavek se měří KOLMO od dílu (jako offset), ne svisle — na šikmé
  // stěně je svislá vzdálenost k přídavkové čáře mnohem větší než Přídavek X.
  const allow = Math.max(allowX, parseFloat(P.allowanceZ) || 0);
  let allowLoop = part;
  try { const o = polyOffset([part], allow); if (o && o[0]) allowLoop = o.sort((u, v) => v.length - u.length)[0]; } catch { /* bez offsetu */ }
  const dir = P.roughingSide === 'left' ? -1 : 1;
  const order = makeOrderChecks({ ap, part, allowLoop, stockLoop: rm.baseLoop, guides: r.calc.interferenceGuides,
    cutsFullWidth: partingOk, offsetXAt, dir, topAt, topXOnLoop, pointInLoop });
  let afterRapid = true;
  const found = { chip: [], air: [], plunge: [], endMid: [], thin: [] };
  const thinCand = [];
  const pendingEnd = [];

  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9) { rm.advanceTo(sp, i); continue; }
    const before = Math.abs(rm.model.area());
    const loopsBefore = rm.model.loops;
    if (b.type !== 'G0') {
      // P3 — tříska: materiál nad břitem v každém bodě pohybu (stav PŘED ním).
      let worst = 0;
      const n = Math.max(1, Math.ceil(len / SAMPLE));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const top = topAt(loopsBefore, z);
        if (top !== null && top - (x - lift) > worst) worst = top - (x - lift);
      }
      rm.advanceTo(sp, i);
      const cut = before - Math.abs(rm.model.area());
      if (worst > ap + TOL_AP && cut > 0.05) found.chip.push({ i, v: worst });
      if (Math.abs(b.x - a.x) < 1e-6 && len > 1 && cut > 0.05 && worst > 0.05 && worst < ap - THIN)
        thinCand.push({ i, v: worst, z: (a.z + b.z) / 2, edge: b.x - lift });
      // P5 — posuv vzduchem
      if (len > AIR_MIN_LEN && cut < AIR_CUT_PER_MM * len) found.air.push({ i, v: len });
      // P6 — kolmé zanoření (pohyb k ose strmější než úhel zanoření)
      const dx = b.x - a.x, dz = b.z - a.z;
      if (!partingOk && dx < -0.2 && cut > 0.1) {
        const deg = Math.abs(dz) < 1e-9 ? 90 : Math.atan(Math.abs(dx) / Math.abs(dz)) * 180 / Math.PI;
        if (deg > plungeLimit + 1) found.plunge.push({ i, v: deg, lim: plungeLimit });
      }
      // P7/P8 — posuzuje se na první vrstvě (posuv v Z) po rychloposuvu.
      if (afterRapid && Math.abs(dx) < 1e-6 && Math.abs(dz) > 1) {
        order.onPassStart(i, b.x, a.z, b.x - lift, loopsBefore);
        afterRapid = false;
      }
      // P4 (návrh) — konec vrstvy: posuv v Z, po něm rychloposuv nebo odjezd
      // nahoru, a hned za koncem (1 mm dál ve směru jízdy) stojí materiál
      // téže vrstvy, přičemž díl tam leží pod břitem.
      const next = sp[i + 1];
      const axial = Math.abs(dx) < 1e-6 && Math.abs(dz) > 1;
      if (axial && next && (next.type === 'G0' || next.x > b.x + 0.5))
        pendingEnd.push({ i, zN: b.z + Math.sign(dz) * 1, edge: b.x - lift });
    } else {
      // Konec průchodu (včetně dojezdu) = první rychloposuv: teprve teď se
      // ptáme, jestli za koncem vrstvy zůstal stát její materiál.
      for (const q of pendingEnd) {
        // Materiál za koncem, a přitom by tam dráha na téže hloubce ještě mohla jet
        // (offsetová dráha tam leží pod ní) — tedy nebránila kontura ani přídavek.
        const top = topAt(rm.model.loops, q.zN), offX = offsetXAt(q.zN);
        if (top !== null && top > q.edge + 0.2 && (offX === null || offX < q.edge + lift - 0.2))
          found.endMid.push({ i: q.i, v: top - q.edge });
      }
      pendingEnd.length = 0;
      afterRapid = true;
      rm.advanceTo(sp, i);
    }
  }

  // P3 — tenká vrstva uprostřed: později na tomtéž Z jelo ještě hlouběji.
  for (const q of thinCand) {
    const topEnd = topAt(rm.model.loops, q.z);
    if (topEnd !== null && topEnd < q.edge - 0.5) found.thin.push(q);
  }

  // P3 — zbytek na dně po celém programu (materiál nad díl + Přídavek X).
  const floors = [];
  let run = null;
  let zLo = Infinity, zHi = -Infinity;
  for (const p of part) { zLo = Math.min(zLo, p.z); zHi = Math.max(zHi, p.z); }
  for (let z = zLo + 0.25; z < zHi; z += 0.25) {
    const pt = topXOnLoop(allowLoop, z), top = topAt(rm.model.loops, z);
    const over = (pt !== null && top !== null) ? top - pt : 0;
    if (over > TOL_FLOOR) {
      if (!run) run = { z0: z, z1: z, max: over }; else { run.z1 = z; run.max = Math.max(run.max, over); }
    } else if (run) { floors.push(run); run = null; }
  }
  if (run) floors.push(run);

  const coll = validateToolpath(sp, P, r.calcSim.stockPathSegments,
    { backside: P.roughingSide === 'left', maxIssues: 200 });

  return { name: basename(file), P, ap, found, floors, coll, N, txt, order };
}

const fmtList = (arr, fmt) => (showAll ? arr : arr.slice(0, 8)).map(fmt).join('\n      ')
  + (!showAll && arr.length > 8 ? `\n      … a dalších ${arr.length - 8} (--all)` : '');

let total = 0;
for (const f of files) {
  const c = await check(f);
  const { found: F } = c;
  console.log(`\n══ ${c.name}  (${c.P.toolShape}, ap ${c.ap}, ${c.P.roughingSide === 'left' ? 'zleva' : 'zprava'})`);
  const row = (label, arr, fmt) => {
    console.log(`  ${arr.length === 0 ? '✓' : '✗'} ${label}: ${arr.length}`);
    if (arr.length) console.log('      ' + fmtList(arr, fmt));
  };
  row('P2 kolize', c.coll, (q) => `${q.kind} ${q.area.toFixed(1)} mm² @X${q.x.toFixed(2)} Z${q.z.toFixed(2)}`);
  row('P3 tříska větší než ap', F.chip, (q) => `${c.N(q.i)}: ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P3 tenká vrstva uprostřed', F.thin, (q) => `${c.N(q.i)}: jen ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P3 zbytek na dně (chybí poslední vrstva)', c.floors, (q) => `Z ${q.z0.toFixed(1)}…${q.z1.toFixed(1)}: až ${q.max.toFixed(2)} mm nad přídavkem`);
  row('P5 posuv vzduchem', F.air, (q) => `${c.N(q.i)}: ${q.v.toFixed(1)} mm   | ${c.txt(q.i)}`);
  row('P6 zanoření strměji než dovoleno', F.plunge, (q) => `${c.N(q.i)}: ${q.v.toFixed(0)}° (smí ${q.lim.toFixed(0)}°)   | ${c.txt(q.i)}`);
  row('P7 přes hrb dřív, než je pravá strana hotová', c.order.found.hump, (q) => `${c.N(q.i)}: za hrbem Z${q.zTop.toFixed(1)}, vpravo ještě ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P8 pořadí úseků', c.order.found.order, (q) => `${c.N(q.i)}: úsek Z${q.A.zLo.toFixed(1)}…${q.A.zHi.toFixed(1)} jde pod vrch úseku Z${q.B.zLo.toFixed(1)}…${q.B.zHi.toFixed(1)} (${q.B.top.toFixed(1)}), ten ještě není hotový   | ${c.txt(q.i)}`);
  row('P4 vrstva končí uprostřed materiálu', F.endMid, (q) => `${c.N(q.i)}: za koncem ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  total += c.coll.length + F.chip.length + F.thin.length + c.floors.length + F.air.length + F.plunge.length + F.endMid.length + c.order.found.hump.length + c.order.found.order.length;
}
console.log(`\nCELKEM porušení: ${total}`);
console.log('(Čísla N… jsou z programu, který TEĎ vygeneruje aktuální kód — ne z G-kódu uloženého v souboru.)');

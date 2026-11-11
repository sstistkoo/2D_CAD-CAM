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
const { getEffectivePlungeAngle, plungeDisabled, topXOnLoop } = await imp('js/calculators/cam/camMath.js');
const { getInsert } = await imp('js/calculators/cam/inserts/index.js');
const { makePassHelpers } = await imp('js/calculators/cam/passHelpers.js');
const { polyOffset, pointInLoop } = await imp('js/geom/geomCore.js');
const { makeOrderChecks } = await imp('scripts/lib/camRuleOrder.mjs');
const { checkHumpContinuity } = await imp('scripts/lib/camRuleHump.mjs');

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

// Spodní hrana materiálu na souřadnici z (nejnižší průsečík se smyčkami).
const bottomAt = (loops, z) => {
  let lo = null;
  for (const l of loops) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
        if (lo === null || x < lo) lo = x;
      }
    }
  }
  return lo ?? 0;
};

async function check(file) {
  const prog = JSON.parse(readFileSync(file, 'utf8'));
  const r = await runCamProg(prog);
  const P = r.params;
  const ap = parseFloat(P.depthOfCut);
  // ČELNÍ HRUBOVÁNÍ: vrstva má hloubku v Z a průchod jede v X. Měří se stejným
  // kódem v prohozených osách — „X" měření = Z stroje (zleva zrcadlo), „Z"
  // měření = X stroje. Model úběru dál běží ve skutečných souřadnicích.
  const face = P.roughingStrategy === 'face';
  const sF = P.roughingSide === 'left' ? -1 : 1;
  const T = face ? (p) => ({ ...p, x: sF * p.z, z: p.x }) : (p) => p;
  const TL = face ? (loops) => loops.map(l => l.map(T)) : (loops) => loops;
  // Břit = nejnižší bod stopy nástroje pod programovaným bodem (kulatá R, polygon rádius nosu).
  const lift = Math.max(0, -Math.min(...toolFootprint(P).map(q => T(q).x)));
  const ins = getInsert(P);
  const partingOk = !!ins.cutsFullWidth;
  // P6: dovolený úhel posuvu k ose. Polygon nikdy strměji než spodní hrana.
  // Čelně: úhel zanoření (pravidlo 6, „Čelně"); spodní hrana podélného plátku tu neplatí.
  // 0° = bez zanořování platí pro HRUBOVÁNÍ (pravidlo 6 je pravidlo
  // hrubovacích drah); nájezd dokončování jede dál pod úhlem plátku.
  const plungeLimitFinish = partingOk ? 90
    : (P.toolShape === 'polygon' && !face ? Math.min(getEffectivePlungeAngle(P), ins.autoPlungeAngleDeg) : getEffectivePlungeAngle(P));
  const plungeLimit = !partingOk && !face && plungeDisabled(P) ? 0 : plungeLimitFinish;
  const allowX = parseFloat(P.allowanceX) || 0;
  const spR = r.calcSim.simPath;
  const sp = face ? spR.map(T) : spR;
  const lines = r.gcode.split('\n');
  const finishFromLine = lines.findIndex(l => /^[;(]\s*---\s*DOKON/.test(l));
  const N = (i) => { const t = (lines[sp[i].originalLineIdx] || '').trim(); const m = /^N\d+/.exec(t); return m ? m[0] : `#${i}`; };
  const txt = (i) => (lines[sp[i].originalLineIdx] || '').trim();

  const rm = new MaterialRemoval(P, r.calcSim.stockPathSegments, {});
  // Tenká vrstva se měří proti OFFSETOVÉ čáře polotovaru (pravidlo 9: ta čára
  // je materiál, vrstvy jsou kotvené na ní) — proti nakreslenému odlitku by
  // první vrstva vyšla o Přídavek X polotovaru tenčí, ačkoli bere přesně ap.
  const rmPlan = new MaterialRemoval(P, r.calcSim.stockPathSegments, { planningOutline: true });
  const partR = offsetSilhouetteLoop(r.calc.contourSegments);
  // Přídavek se měří KOLMO od dílu (jako offset), ne svisle — na šikmé
  // stěně je svislá vzdálenost k přídavkové čáře mnohem větší než Přídavek X.
  // + Přídavek na hotovo: hrubování ho nechává vždy (calculatePipeline), a kde
  // dokončení nejede (rozsah úseku, nedosažitelný kus), zůstane stát.
  const allow = Math.max(allowX, parseFloat(P.allowanceZ) || 0) + (parseFloat(P.finishAllowance) || 0);
  let allowLoopR = partR;
  try { const o = polyOffset([partR], allow); if (o && o[0]) allowLoopR = o.sort((u, v) => v.length - u.length)[0]; } catch { /* bez offsetu */ }
  const part = TL([partR])[0], allowLoop = TL([allowLoopR])[0];
  // Kam až smí dráha (střed nosu) dojet — offsetová dráha i s přídavky.
  // Čelně se offsetová dráha (segmenty v osách stroje) neotáčí; mez dává
  // přídavková čára + zdvih břitu.
  const offsetXAt = face
    ? (z) => { const t = topXOnLoop(allowLoop, z); return t === null ? null : t + lift; }
    : makePassHelpers(r.calc.offsetPath || []).offsetXAt;
  const dir = P.roughingSide === 'left' ? -1 : 1;
  // P7/P8 (hrb, pořadí úseků) jsou v pravidlech jen podélně — čelně se nehodnotí.
  const order = face ? { onPassStart: () => {}, found: { hump: [], order: [] } }
    : makeOrderChecks({ ap, part, allowLoop, stockLoop: rm.baseLoop, guides: r.calc.interferenceGuides,
      cutsFullWidth: partingOk, offsetXAt, dir, topAt, topXOnLoop, pointInLoop });
  let afterRapid = true;
  const found = { chip: [], air: [], plunge: [], endMid: [], thin: [] };
  const thinCand = [];
  const pendingEnd = [];

  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9) { rm.advanceTo(spR, i); continue; }
    const before = Math.abs(rm.model.area());
    const loopsBefore = TL(rm.model.loops);
    if (b.type !== 'G0') {
      // P3 — tříska: materiál nad břitem v každém bodě pohybu (stav PŘED ním).
      // Čelně jen podle ÚBĚRU (níž): vrstva končí o strmé zúžení a řádek pod
      // středem nosu tam vede tělem DÍLU za stěnou — „materiál nad břitem"
      // by započítal celý díl (part-16 N2690: 23 mm, reálně ubráno 3,0 mm).
      let worst = 0;
      const n = face ? -1 : Math.max(1, Math.ceil(len / SAMPLE));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const top = topAt(loopsBefore, z);
        if (top !== null && top - (x - lift) > worst) worst = top - (x - lift);
      }
      let worstPlan = 0;
      if (rmPlan.model) {
        const lp = TL(rmPlan.model.loops);
        for (let k = 0; k <= Math.max(n, 1); k++) {
          const t = n > 0 ? k / n : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          const top = topAt(lp, z);
          if (top !== null && top - (x - lift) > worstPlan) worstPlan = top - (x - lift);
        }
        rmPlan.advanceTo(spR, i);
      }
      rm.advanceTo(spR, i);
      const cut = before - Math.abs(rm.model.area());
      // P3 — TŘÍSKA PODLE ÚBĚRU (29. 9. 2026): tloušťka, kterou pohyb v některém
      // sloupci Z OPRAVDU ubral (povrch zbytku před × po). Sloupec pod středem
      // nestačí: materiál PŘED nosem (stěna, na kterou kružnice nosu narazí dřív
      // než spodek) tam není vidět — vrstva u stěny údolí tak brala dvě vrstvy
      // naráz a kontrola hlásila 0.
      if (cut > 0.05) {
        const loopsAfter = TL(rm.model.loops);
        const zA = Math.min(a.z, b.z) - lift - 0.25, zB = Math.max(a.z, b.z) + lift + 0.25;
        for (let z = zA; z <= zB + 1e-9; z += 0.25) {
          const t0 = topAt(loopsBefore, z);
          if (t0 === null) continue;
          const t1 = topAt(loopsAfter, z);
          // Sloupec vybraný celý: podélně až k ose (0); čelně až ke spodku řádku
          // (osa měření je tam Z stroje — „0" by bylo Z 0, ne konec materiálu).
          const d = t0 - (t1 !== null ? t1 : face ? bottomAt(loopsBefore, z) : 0);
          if (d > worst) worst = d;
        }
      }
      if (worst > ap + TOL_AP && cut > 0.05) found.chip.push({ i, v: worst });
      if (Math.abs(b.x - a.x) < 1e-6 && len > 1 && cut > 0.05 && worst > 0.05 && worst < ap - THIN
          && (!rmPlan.model || worstPlan < ap - THIN))
        thinCand.push({ i, v: worst, z: (a.z + b.z) / 2, edge: b.x - lift });
      // P5 — posuv vzduchem
      if (len > AIR_MIN_LEN && cut < AIR_CUT_PER_MM * len) found.air.push({ i, v: len });
      // P6 — kolmé zanoření (pohyb k ose strmější než úhel zanoření)
      const dx = b.x - a.x, dz = b.z - a.z;
      if (!partingOk && dx < -0.2 && cut > 0.1) {
        const deg = Math.abs(dz) < 1e-9 ? 90 : Math.atan(Math.abs(dx) / Math.abs(dz)) * 180 / Math.PI;
        const lim = finishFromLine >= 0 && sp[i].originalLineIdx > finishFromLine ? plungeLimitFinish : plungeLimit;
        if (deg > lim + 1) found.plunge.push({ i, v: deg, lim });
      }
      // P7/P8 — posuzuje se na první vrstvě (posuv v Z) po rychloposuvu.
      // Obrácená vrstva Cik cak (pravidlo 20) jede ze vzduchu za hrbem KE stěně
      // (proti směru obrábění) — přes hrb nepřejíždí, P7/P8 se na ni nevztahuje.
      const reversed = P.roughingStrategy === 'zigzag' && dz * dir > 0;
      if (afterRapid && Math.abs(dx) < 1e-6 && Math.abs(dz) > 1 && !reversed) {
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
        const top = topAt(TL(rm.model.loops), q.zN), offX = offsetXAt(q.zN);
        if (top !== null && top > q.edge + 0.2 && (offX === null || offX < q.edge + lift - 0.2))
          found.endMid.push({ i: q.i, v: top - q.edge });
      }
      pendingEnd.length = 0;
      // Rychloposuv VZDUCHEM uvnitř vrstvy (stejná hloubka, jen v Z) průchod
      // nekončí — nový průchod začíná až po odjezdu/příjezdu v X.
      if (Math.abs(b.x - a.x) > 1e-6) afterRapid = true;
      rm.advanceTo(spR, i);
      if (rmPlan.model) rmPlan.advanceTo(spR, i);
    }
  }

  // P7 — první vrstva pod vrcholem hrbu jede přes hrb vcelku (scripts/lib/camRuleHump.mjs).
  found.humpBreak = face ? [] : checkHumpContinuity(sp, offsetXAt);

  // P3 — tenká vrstva uprostřed: později na tomtéž Z jelo ještě hlouběji.
  for (const q of thinCand) {
    const topEnd = topAt(TL(rm.model.loops), q.z);
    if (topEnd !== null && topEnd < q.edge - 0.5) found.thin.push(q);
  }

  // P3 — zbytek na dně po celém programu (materiál nad díl + Přídavek X).
  // Měří se v rozsahu úseku (camprog úseku má rozsah 📐 zapnutý) a I ZA KONCEM
  // DÍLU: polotovar před čelem dílu (u osy nic není) je taky zbytek — nález
  // uživatele 29. 9. 2026, zleva: odlitek Z −8…0 před čelem zůstal celý stát
  // a kontrola ho neviděla, protože měřila jen nad Z-rozsahem dílu.
  const floors = [];
  let run = null;
  let zLo = Infinity, zHi = -Infinity;
  for (const p of part) { zLo = Math.min(zLo, p.z); zHi = Math.max(zHi, p.z); }
  let sLo = Infinity, sHi = -Infinity;
  for (const p of TL([rm.baseLoop || []])[0]) { sLo = Math.min(sLo, p.z); sHi = Math.max(sHi, p.z); }
  const zl = prog.zLimits || {};
  const rng = !face && zl.rangeActive && Number.isFinite(zl.rangeStart) && Number.isFinite(zl.rangeEnd)
    ? [Math.min(zl.rangeStart, zl.rangeEnd), Math.max(zl.rangeStart, zl.rangeEnd)] : null;
  const fLo = rng ? Math.max(rng[0], Math.min(zLo, sLo)) : Math.min(zLo, sLo);
  const fHi = rng ? Math.min(rng[1], Math.max(zHi, sHi)) : Math.max(zHi, sHi);
  for (let z = fLo + 0.25; z < fHi; z += 0.25) {
    const ptRaw = topXOnLoop(allowLoop, z);
    // Čelně: řádek nad průměrem dílu nemá přídavkovou čáru (podélně tam je osa = 0).
    const pt = ptRaw ?? (face ? null : 0), top = topAt(TL(rm.model.loops), z);
    const over = top !== null && pt !== null ? top - pt : 0;
    if (over > TOL_FLOOR) {
      if (!run) run = { z0: z, z1: z, max: over }; else { run.z1 = z; run.max = Math.max(run.max, over); }
    } else if (run) { floors.push(run); run = null; }
  }
  if (run) floors.push(run);

  const coll = validateToolpath(spR, P, r.calcSim.stockPathSegments,
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
  row('P7 vrstva přes hrb vcelku až na konec', F.humpBreak, (q) => `${c.N(q.i)}: vrstva X${q.x.toFixed(3)} se na hrbu Z${Math.min(q.h0, q.h1).toFixed(1)}…${Math.max(q.h0, q.h1).toFixed(1)} (vrchol X${q.top.toFixed(2)}) přerušila   | ${c.txt(q.i)}`);
  row('P8 pořadí úseků', c.order.found.order, (q) => `${c.N(q.i)}: úsek Z${q.A.zLo.toFixed(1)}…${q.A.zHi.toFixed(1)} jde pod vrch úseku Z${q.B.zLo.toFixed(1)}…${q.B.zHi.toFixed(1)} (${q.B.top.toFixed(1)}), ten ještě není hotový   | ${c.txt(q.i)}`);
  row('P4 vrstva končí uprostřed materiálu', F.endMid, (q) => `${c.N(q.i)}: za koncem ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  total += c.coll.length + F.chip.length + F.thin.length + c.floors.length + F.air.length + F.plunge.length + F.endMid.length + c.order.found.hump.length + c.order.found.order.length + F.humpBreak.length;
}
console.log(`\nCELKEM porušení: ${total}`);
console.log('(Čísla N… jsou z programu, který TEĎ vygeneruje aktuální kód — ne z G-kódu uloženého v souboru.)');

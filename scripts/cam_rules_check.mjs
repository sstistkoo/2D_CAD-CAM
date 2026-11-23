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
//                              pohybem (povrch − břit) > ap; jednou za řádek,
//                              bez dokončování, výjezd v X od osy = úběr ÷ délka,
//                              kolmé zanoření upichováku se nepočítá
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
//
// Parametry se berou jako v aplikaci (bez klíčů, které vlastní kód — Bp X500
// Z500). Karusel po X (pravidlo 21) se měří v PROHOZENÝCH osách, kde dráhy
// vznikají: „X" = výška nad stolem, „Z" = poloměr, držák svisle.
//
// BASELINE (audit 21. 11. 2026) — počty porušení na díl a pravidlo
// v `scripts/cam-rules-baseline.json`; test `cam-rules-baseline` pustí
// `--fixtures --check-baseline` a selže, když kterékoli číslo VZROSTE:
//   node scripts/cam_rules_check.mjs --fixtures --check-baseline  (jen kontrola)
//   node scripts/cam_rules_check.mjs --fixtures --save-baseline   (po zlepšení)
// `--fixtures` = všechny tests/fixtures/{cam,cam-cases,cam-xrange}/*.camprog.
// Baseline se smí přepsat jen POKLESEM; růst je regrese (nebo vědomá změna
// pravidla, kterou schvaluje uživatel).

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, basename } from 'path';

const PLUNGE_MIN_CUT = 0.5;   // mm² — P6: dotek bokem bez materiálu pod nosem (tolerance validátoru)
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { runCamProg } = await imp('tests/helpers/camHeadless.mjs');
const { MaterialRemoval, toolFootprint, insertExtent } = await imp('js/calculators/cam/materialRemoval.js');
const { validateToolpath } = await imp('js/calculators/cam/collisionValidator.js');
const { offsetSilhouetteLoop } = await imp('js/calculators/cam/toolEnvelope.js');
const { getEffectivePlungeAngle, plungeDisabled, wallPlungeOn, topXOnLoop } = await imp('js/calculators/cam/camMath.js');
const { getInsert } = await imp('js/calculators/cam/inserts/index.js');
const { stripCodeOwnedParams } = await imp('js/calculators/cam/camDefaults.js');
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
const FIXTURE_DIRS = ['tests/fixtures/cam', 'tests/fixtures/cam-cases', 'tests/fixtures/cam-xrange'];
const BASELINE = join(root, 'scripts', 'cam-rules-baseline.json');
const saveBaseline = args.includes('--save-baseline');
const checkBaseline = args.includes('--check-baseline');
const quiet = checkBaseline && !args.includes('--verbose');
const files = args.filter(a => !a.startsWith('--'));
if (args.includes('--fixtures')) {
  for (const d of FIXTURE_DIRS) {
    for (const f of readdirSync(join(root, d)).filter(n => n.endsWith('.camprog')).sort()) files.push(join(root, d, f));
  }
}
const showAll = args.includes('--all');
if (files.length === 0) {
  console.log('Použití: node scripts/cam_rules_check.mjs soubor.camprog [--all] | --fixtures [--check-baseline | --save-baseline]');
  process.exit(1);
}
const log = quiet ? () => {} : (...a) => console.log(...a);

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
  // Parametry JAKO APLIKACE při načtení: klíče, které vlastní kód (bezpečná
  // poloha X500 Z500, …), se ze souboru neberou (camDefaults.js). Se starým
  // Bp X150 Z5 ze souboru kontrola hlásila přejezd do polohy, kterou
  // aplikace nikdy nejede (karusel: `G1 Z5` dolů ke stolu, 11. 11. 2026).
  if (prog.params) prog.params = stripCodeOwnedParams(prog.params);
  let r = await runCamProg(prog);
  // KARUSEL PO X (pravidlo 21): dráhy se počítají podélným algoritmem
  // v prohozených osách a všechna pravidla platí TAM („k ose" = dolů ke
  // stolu, svislý držák). Ve skutečných osách kontrola měřila nesmysly
  // (P2 = 200 kolizí vodorovného držáku i s výchozím úhlem). Měří se tedy
  // prohozený výpočet; řádky programu se prohozením nemění → N… sedí.
  const xz = r.calcSim && r.calcSim._xz;
  const carouselXZ = !!(xz && r.calc && r.calc._xz);
  if (carouselXZ) r = { ...r, params: { ...xz.S.params }, calc: r.calc._xz.calc, calcSim: xz.calc };
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
  // Břit ve SKUTEČNÝCH osách (lift výš je čelně v prohozených).
  const liftR = Math.max(0, -Math.min(...toolFootprint(P).map(q => q.x)));
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
  // Co po CELÉM programu zůstane stát: „nehotová pravá strana" se měří jen
  // z materiálu, který program později opravdu odebere. Zbytek, který tam
  // zůstane navždy (klín u strmé stěny, kam hrubování při úhlu zanoření
  // nedosáhne — hlásí ho P3), pořadí neporuší: dodělat se nedá nikdy
  // (karusel: P7 „vpravo ještě 50,63 mm" = přesně klín v drážce, 11. 11. 2026).
  let finalLoops = null;
  if (!face) {
    const rmEnd = new MaterialRemoval(P, r.calcSim.stockPathSegments, {});
    rmEnd.advanceTo(spR, spR.length - 1);
    finalLoops = rmEnd.model ? rmEnd.model.loops : null;
  }
  const order = face ? { onPassStart: () => {}, found: { hump: [], order: [] } }
    : makeOrderChecks({ ap, part, allowLoop, stockLoop: rm.baseLoop, guides: r.calc.interferenceGuides,
      cutsFullWidth: partingOk, offsetXAt, dir, topAt, topXOnLoop, pointInLoop, finalLoops });
  let afterRapid = true;
  const found = { chip: [], air: [], plunge: [], endMid: [], thin: [] };
  const thinCand = [];
  const pendingEnd = [];
  const layerEnds = [];   // konce vrstev (P4 schod podle úhlu zanoření)
  // Upichovák s ČELNÍM výstupem (zápichy vedle sebe, pravidlo 17) — strategie
  // v parametrech může zůstat „podélně", program je ale radiální. Zápich končí
  // na dně, ne uprostřed vrstvy (uživatel 22. 11. 2026: jede kolmo celou
  // šířkou); P4 tu měřil celou hloubku zápichu (range-parting-plunge 40–64 mm).
  const partingPlungeOut = partingOk && /HRUBOVANI \(CELNI/.test(r.gcode);
  // HRANICE ROZSAHU Z (pravidla 4, 11, 12): vrstva smí skončit, kde by o 1 mm
  // dál OBRYS DESTIČKY přejel konec rozsahu — stěnu pod X max (`rangeEndZ`)
  // nebo ruční rozsah 📐. Meze platí pro obrys destičky, ne pro střed nosu
  // (xmax-wall: stěna Z269,63, konce vrstev Z272,927 = stěna + přesah 3,3).
  // Jen podélně (čelně jsou osy měření prohozené).
  const extR = insertExtent(P);
  const zlR = prog.zLimits || {};
  const rangeZ = (zlR.rangeActive && Number.isFinite(zlR.rangeStart) && Number.isFinite(zlR.rangeEnd))
    ? [Math.min(zlR.rangeStart, zlR.rangeEnd), Math.max(zlR.rangeStart, zlR.rangeEnd)] : [-Infinity, Infinity];
  if (Number.isFinite(r.calc.rangeEndZ)) {
    // Zleva se jede k +Z (konec rozsahu nahoře), zprava k −Z (dole).
    if (P.roughingSide === 'left') rangeZ[1] = Math.min(rangeZ[1], r.calc.rangeEndZ);
    else rangeZ[0] = Math.max(rangeZ[0], r.calc.rangeEndZ);
  }
  const pastRange = (q) => !face && (q.dir < 0
    ? q.e - 1 - extR.zNeg < rangeZ[0] - 0.05
    : q.e + 1 + extR.zPos > rangeZ[1] + 0.05);

  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9) { rm.advanceTo(spR, i); continue; }
    const before = Math.abs(rm.model.area());
    const loopsBefore = TL(rm.model.loops);
    const loopsBeforeR = rm.model.loops;   // skutečné osy (P6 nájezd dokončování)
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
      let worstPlan = 0, cutPlan = 0;
      if (rmPlan.model) {
        const beforePlan = Math.abs(rmPlan.model.area());
        const lp = TL(rmPlan.model.loops);
        for (let k = 0; k <= Math.max(n, 1); k++) {
          const t = n > 0 ? k / n : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          const top = topAt(lp, z);
          if (top !== null && top - (x - lift) > worstPlan) worstPlan = top - (x - lift);
        }
        rmPlan.advanceTo(spR, i);
        cutPlan = beforePlan - Math.abs(rmPlan.model.area());
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
        // Sloupec se měří TĚSNĚ VEDLE mřížky z obou stran: padne-li Z přesně
        // na svislou hranu, topXOnLoop vrátí před řezem horní a po něm dolní
        // konec téže stěny → falešná tříska výšky celé stěny (part-22 N160:
        // schod odlitku Z 196,278 X 64,4→16,7 = „47,6 mm", reálně 1,3 mm).
        for (let zg = zA; zg <= zB + 1e-9; zg += 0.25) for (const z of [zg - 1e-4, zg + 1e-4]) {
          const t0 = topAt(loopsBefore, z);
          if (t0 === null) continue;
          const t1 = topAt(loopsAfter, z);
          // Sloupec vybraný celý: podélně až k ose (0); čelně až ke spodku řádku
          // (osa měření je tam Z stroje — „0" by bylo Z 0, ne konec materiálu).
          const d = t0 - (t1 !== null ? t1 : face ? bottomAt(loopsBefore, z) : 0);
          if (d > worst) worst = d;
        }
      }
      // P3 — CO SE ZA TŘÍSKU NEPOČÍTÁ (audit 21.–22. 11. 2026, roztřídění P3):
      //  • DOKONČOVÁNÍ: pravidlo 3 je o vrstvách hrubování; dokončení jede po
      //    přídavku a sloupec materiálu pod ním je výška stěny dílu (part-1
      //    `G1 X31.140 Z257.214` hlášeno 30 mm).
      //  • ČISTÝ VÝJEZD V X OD OSY (po stěně/čele): sloupec v Z = výška stěny,
      //    kterou pohyb jen ošlehne (49 řádků). Tloušťka třísky je tu v Z —
      //    úběr ÷ délka pohybu. Zanoření K OSE se dál měří sloupcem. Jen
      //    podélně: čelně je to pohyb v Z stroje a u krátkého pohybu s velkou
      //    kulatou by úběr ÷ délka započítal celý kruh nosu (part-23 R10
      //    `N2610` „4,21 mm"); čelně se tříska měří úběrem po sloupcích výš.
      const finishLine = finishFromLine >= 0 && sp[i].originalLineIdx > finishFromLine;
      // Skoro radiální (Z nejvýš desetina délky — výjezd po čele `X18.140
      // Z257.514` z Z257,518) a aspoň 1 mm: u kratičkého pohybu (0,002 mm,
      // part-1 `G1 X36.180`) by úběr ÷ délka vyletěl na desítky mm.
      const dxOut = b.x - a.x;
      const outwardX = !face && dxOut > 1 && Math.abs(b.z - a.z) <= 0.1 * dxOut;
      const chipV = outwardX ? cut / dxOut : worst;
      //  • UPICHOVÁK ZANOŘUJE KOLMO CELOU ŠÍŘKOU (uživatel 22. 11. 2026: „tak má
      //    jet kolmo a celou stranou plátku, jinak to ani nejde"). Radiální
      //    zanoření k ose není vrstva — sloupec tu byl celá hloubka zápichu
      //    (part-20 `G1 X31.766` „98,7 mm"). Krok vedle sebe hlídá pravidlo 17.
      // Ve SKUTEČNÝCH osách stroje (`spR`) — čelně jsou `a`/`b` prohozené.
      const ra = spR[i - 1], rb = spR[i];
      const partingPlunge = partingOk && rb.x < ra.x && Math.abs(rb.z - ra.z) <= 0.1 * (ra.x - rb.x);
      if (!finishLine && !partingPlunge && chipV > ap + TOL_AP && cut > 0.05) found.chip.push({ i, v: chipV, line: sp[i].originalLineIdx });
      if (Math.abs(b.x - a.x) < 1e-6 && len > 1 && cut > 0.05 && worst > 0.05 && worst < ap - THIN
          && (!rmPlan.model || worstPlan < ap - THIN))
        thinCand.push({ i, v: worst, z: (a.z + b.z) / 2, edge: b.x - lift });
      // P5 — posuv vzduchem. Vzduch = neubere nic ani z odlitku velkého až po
      // OFFSETOVOU čáru (pravidlo 9: ta čára JE materiál). Měřeno jen proti
      // nakreslenému odlitku se za vzduch počítal pás vůle, kterým emise
      // správně jede posuvem (karusel R5, vůle 1 mm: 19× „Přejezd materiálem
      // posuvem" 4 mm hlášeno jako vzduch, 11. 11. 2026).
      if (len > AIR_MIN_LEN && Math.max(cut, cutPlan) < AIR_CUT_PER_MM * len) found.air.push({ i, v: len });
      // P6 — kolmé zanoření (pohyb k ose strmější než úhel zanoření)
      const dx = b.x - a.x, dz = b.z - a.z;
      // DOTEK BOKEM ≠ ZANOŘENÍ: pod nosem (sloupec dráhy, `worst`) žádný materiál
      // a úběr do tolerance validátoru (0,5 mm²) = plátek jen škrtl bokem o
      // materiál vedle, do plného nezanořuje (pravidlo 6). Karusel od obvodu ap 10
      // (12. 11. 2026): sjezd posuvem na vrstvu vedle hrany odlitku škrtl šikmou
      // hlavní hranou PSBNR o roh 0,12 mm² NAD začátkem sjezdu (5× „90°").
      // Materiál pod nosem se počítá jako dřív od 0,1 mm². Jen polygon podélně
      // (šikmá hlavní hrana; u kulaté a čelně měří `worst` jinak).
      const sideTouch = P.toolShape === 'polygon' && !face && !(worst > 0.05) && cut <= PLUNGE_MIN_CUT;
      const roughing = !(finishFromLine >= 0 && sp[i].originalLineIdx > finishFromLine);
      // DOKONČOVÁNÍ PO ČELNÍM HRUBOVÁNÍ se měří ve SKUTEČNÝCH osách (audit
      // 22. 11. 2026): dokončení jede po obrysu jako vždy a pravidlo 15 je
      // o sjíždění k OSE. V prohozených osách čelního měření byl každý pohyb
      // podél průměru (`N5220 G1 X19.117 Z251.333`, čistě −Z) „zanoření 90°"
      // — part-23 54 hlášení.
      const pa = face && !roughing ? spR[i - 1] : a, pb = face && !roughing ? spR[i] : b;
      const pdx = pb.x - pa.x, pdz = pb.z - pa.z;
      if (!partingOk && pdx < -0.2 && cut > 0.1 && !sideTouch) {
        const deg = Math.abs(pdz) < 1e-9 ? 90 : Math.atan(Math.abs(pdx) / Math.abs(pdz)) * 180 / Math.PI;
        // Kolmo u strmé stěny (kulatá, pravidlo 6 — uživatel 11. 11. 2026) je
        // schválená výjimka PRO HRUBOVÁNÍ: sjezd po stěně = střed nosu jede po
        // hrubovacím offsetu dílu (emise ho navíc značí „Kolmo u stěny").
        const onWall = () => {
          if (!offsetXAt) return false;
          for (let k = 0; k <= 4; k++) {
            const t = k / 4, ox = offsetXAt(a.z + dz * t);
            if (ox === null || Math.abs(ox - (a.x + dx * t)) > 0.1) return false;
          }
          return true;
        };
        const wall = roughing && wallPlungeOn(P)
          && (/Kolmo u stěny/.test(lines[sp[i].originalLineIdx] || '') || onWall());
        const lim = wall ? 90 : roughing ? plungeLimit : plungeLimitFinish;
        // NÁJEZD DOKONČOVÁNÍ SVISLE (uživatel 22. 11. 2026: „nájezd do hloubky
        // na hotovo by mohl jít svisle dolů, když by materiál jen objížděl —
        // pokud by bral jen na hotovo a plátek by to dovolil"). První řezný
        // pohyb dokončení po rychloposuvu smí být strmější než úhel zanoření,
        // když jde do materiálu nejvýš o Přídavek na hotovo a úhel nepřesáhne
        // strop plátku (`plungeAngleMaxDeg`: kulatá 89° ≈ kolmo, polygon =
        // spodní hrana). Hloubka = materiál nad břitem na konci nájezdu.
        let finishApproachOk = false, depth = null;
        if (!roughing && spR[i - 1].type === 'G0') {
          const top = topAt(loopsBeforeR, pb.z);
          depth = top === null ? 0 : top - (pb.x - liftR);
          finishApproachOk = deg <= (ins.plungeAngleMaxDeg ?? 0) + 1
            && depth <= (parseFloat(P.finishAllowance) || 0) + TOL_AP;
        }
        if (deg > lim + 1 && !finishApproachOk) found.plunge.push({ i, v: deg, lim, depth, cut, under: worst, line: sp[i].originalLineIdx });
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
        pendingEnd.push({ i, zN: b.z + Math.sign(dz) * 1, edge: b.x - lift, d: b.x, e: b.z, dir: Math.sign(dz) });
    } else {
      // Konec průchodu (včetně dojezdu) = první rychloposuv: teprve teď se
      // ptáme, jestli za koncem vrstvy zůstal stát její materiál.
      for (const q of pendingEnd) {
        // Materiál za koncem, a přitom by tam dráha na téže hloubce ještě mohla jet
        // (offsetová dráha tam leží pod ní) — tedy nebránila kontura ani přídavek.
        const top = topAt(TL(rm.model.loops), q.zN), offX = offsetXAt(q.zN);
        // SCHOD PODLE ÚHLU ZANOŘENÍ (audit 22. 11. 2026, pravidla 4 a 6): vrstva
        // smí skončit nejvýš o ap·tan(úhel zanoření) PŘED koncem vrstvy o ap
        // mělčí — dál by zadní roh / spodní hrana destičky řezala do schodu,
        // který ta mělčí vrstva nechala (pravidlo 6 „Čelně", schodiště PSKNR
        // −15° potvrzené uživatelem 12. 11. 2026 jako fyzikální). Materiál za
        // takovým koncem není „uprostřed vrstvy" — lathe-face-casting-axial
        // 70 hlášení, konce po 1,07 mm = 4 · tan 15°.
        // Schod musí být PRÁVĚ ap·tan(úhel) (± 0,15) — konce na stejném Z
        // (xmax-wall, stěna) schodem nejsou.
        // Úhel schodu dává nastavené zanoření, spodní hrana destičky
        // (`plungeAngleMaxDeg`) NEBO natočení destičky (`guideRotDeg` — zadní
        // roh níž než špička): face-cylinder ap 2 → 0,536 = 2·tan 15° při
        // zanoření 45° a natočení −15°.
        const stepNoms = [plungeLimit, ins.plungeAngleMaxDeg, Math.abs(ins.guideRotDeg || 0)]
          .filter(a => Number.isFinite(a) && a > 0 && a < 89)
          .map(a => ap * Math.tan(a * Math.PI / 180)).filter(s => s > 0.2);
        // Upichovák (řeže celou šířkou, úhel 90°) žádný schod nemá.
        const stair = !partingOk && layerEnds.some(L => L.dir === q.dir && Math.abs(L.d - (q.d + ap)) < 0.1
          && stepNoms.some(s => Math.abs((L.e - q.e) * q.dir - s) <= 0.15));
        if (top !== null && top > q.edge + 0.2 && (offX === null || offX < q.edge + lift - 0.2) && !stair && !partingPlungeOut && !pastRange(q))
          found.endMid.push({ i: q.i, v: top - q.edge });
        layerEnds.push(q);
      }
      pendingEnd.length = 0;
      // Rychloposuv VZDUCHEM uvnitř vrstvy (stejná hloubka, jen v Z) průchod
      // nekončí — nový průchod začíná až po odjezdu/příjezdu v X.
      if (Math.abs(b.x - a.x) > 1e-6) afterRapid = true;
      rm.advanceTo(spR, i);
      if (rmPlan.model) rmPlan.advanceTo(spR, i);
    }
  }

  // P3 — tříska se hlásí JEDNOU za řádek G-kódu (nejhorší bod): oblouk nebo
  // dlouhý řádek má v simPath víc bodů a každý se dřív počítal zvlášť
  // (433 hlášení = 311 řádků).
  // Totéž P6 (oblouk dokončení part-23 `N5440` hlášen 46×).
  const onePerLine = (arr) => {
    const byLine = new Map();
    for (const q of arr) {
      const k = q.line ?? `#${q.i}`, prev = byLine.get(k);
      if (!prev || q.v > prev.v) byLine.set(k, q);
    }
    return [...byLine.values()].sort((u, v) => u.i - v.i);
  };
  found.chip = onePerLine(found.chip);
  found.plunge = onePerLine(found.plunge);

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

  return { name: basename(file), P, ap, found, floors, coll, N, txt, order, carouselXZ };
}

const fmtList = (arr, fmt) => (showAll ? arr : arr.slice(0, 8)).map(fmt).join('\n      ')
  + (!showAll && arr.length > 8 ? `\n      … a dalších ${arr.length - 8} (--all)` : '');

let total = 0;
const counts = {};   // díl → pravidlo → počet (baseline)
for (const f of files) {
  const c = await check(f);
  const { found: F } = c;
  log(`\n══ ${c.name}  (${c.P.toolShape}, ap ${c.ap}, ${c.P.roughingSide === 'left' ? 'zleva' : 'zprava'}${c.carouselXZ ? ', karusel po X — měřeno v prohozených osách, Z… v hlášení = poloměr' : ''})`);
  const cnt = counts[c.name] = {};
  const row = (label, arr, fmt) => {
    cnt[label] = arr.length;
    log(`  ${arr.length === 0 ? '✓' : '✗'} ${label}: ${arr.length}`);
    if (arr.length) log('      ' + fmtList(arr, fmt));
  };
  row('P2 kolize', c.coll, (q) => `${q.kind} ${q.area.toFixed(1)} mm² @X${q.x.toFixed(2)} Z${q.z.toFixed(2)}`);
  row('P3 tříska větší než ap', F.chip, (q) => `${c.N(q.i)}: ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P3 tenká vrstva uprostřed', F.thin, (q) => `${c.N(q.i)}: jen ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P3 zbytek na dně (chybí poslední vrstva)', c.floors, (q) => `Z ${q.z0.toFixed(1)}…${q.z1.toFixed(1)}: až ${q.max.toFixed(2)} mm nad přídavkem`);
  row('P5 posuv vzduchem', F.air, (q) => `${c.N(q.i)}: ${q.v.toFixed(1)} mm   | ${c.txt(q.i)}`);
  row('P6 zanoření strměji než dovoleno', F.plunge, (q) => `${c.N(q.i)}: ${q.v.toFixed(0)}° (smí ${q.lim.toFixed(0)}°)${q.depth !== null && q.depth !== undefined ? `, nájezd dokončení do ${q.depth.toFixed(2)} mm` : ''}${showAll && Number.isFinite(q.cut) ? ` [úběr ${q.cut.toFixed(2)} mm², pod nosem ${q.under.toFixed(2)} mm]` : ''}   | ${c.txt(q.i)}`);
  row('P7 přes hrb dřív, než je pravá strana hotová', c.order.found.hump, (q) => `${c.N(q.i)}: za hrbem Z${q.zTop.toFixed(1)}, vpravo ještě ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P7 vrstva přes hrb vcelku až na konec', F.humpBreak, (q) => `${c.N(q.i)}: vrstva X${q.x.toFixed(3)} se na hrbu Z${Math.min(q.h0, q.h1).toFixed(1)}…${Math.max(q.h0, q.h1).toFixed(1)} (vrchol X${q.top.toFixed(2)}) přerušila   | ${c.txt(q.i)}`);
  row('P8 pořadí úseků', c.order.found.order, (q) => `${c.N(q.i)}: úsek Z${q.A.zLo.toFixed(1)}…${q.A.zHi.toFixed(1)} jde pod vrch úseku Z${q.B.zLo.toFixed(1)}…${q.B.zHi.toFixed(1)} (${q.B.top.toFixed(1)}), ten ještě není hotový   | ${c.txt(q.i)}`);
  row('P4 vrstva končí uprostřed materiálu', F.endMid, (q) => `${c.N(q.i)}: za koncem ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  total += c.coll.length + F.chip.length + F.thin.length + c.floors.length + F.air.length + F.plunge.length + F.endMid.length + c.order.found.hump.length + c.order.found.order.length + F.humpBreak.length;
}
log(`\nCELKEM porušení: ${total}`);
log('(Čísla N… jsou z programu, který TEĎ vygeneruje aktuální kód — ne z G-kódu uloženého v souboru.)');

if (saveBaseline) {
  const sorted = Object.fromEntries(Object.keys(counts).sort().map(k => [k, counts[k]]));
  writeFileSync(BASELINE, JSON.stringify({ total, parts: sorted }, null, 2) + '\n');
  console.log(`Baseline uložena: ${BASELINE} (${Object.keys(counts).length} dílů, ${total} porušení)`);
}
if (checkBaseline) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')).parts || {};
  const worse = [], better = [];
  for (const [part, rules] of Object.entries(counts)) {
    const b = base[part];
    if (!b) { worse.push(`${part}: díl chybí v baseline — přidej ho (--save-baseline)`); continue; }
    for (const [rule, n] of Object.entries(rules)) {
      const was = b[rule] ?? 0;
      if (n > was) worse.push(`${part} · ${rule}: ${was} → ${n}`);
      else if (n < was) better.push(`${part} · ${rule}: ${was} → ${n}`);
    }
  }
  if (better.length) console.log(`Zlepšení (${better.length}) — sniž baseline: node scripts/cam_rules_check.mjs --fixtures --save-baseline\n  ` + better.join('\n  '));
  if (worse.length) {
    console.log(`REGRESE pravidel CAM (${worse.length}) — podrobnosti: node scripts/cam_rules_check.mjs <díl> --all\n  ` + worse.join('\n  '));
    process.exit(1);
  }
  console.log(`Baseline OK: ${Object.keys(counts).length} dílů, ${total} porušení, nic nevzrostlo.`);
}

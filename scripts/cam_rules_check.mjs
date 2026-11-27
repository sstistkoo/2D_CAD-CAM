// ╔══════════════════════════════════════════════════════════════╗
// ║  KONTROLA PROGRAMU PODLE PRAVIDEL (docs/cam-pravidla.md)       ║
// ╚══════════════════════════════════════════════════════════════╝
// Vezme projekt `.camprog`, vygeneruje dráhy TÍMŽ kódem jako aplikace
// a vypíše porušení pravidel s čísly řádků G-kódu (N…). Hotovo = 0.
//
//   node scripts/cam_rules_check.mjs soubor.camprog [další.camprog …]
//   node scripts/cam_rules_check.mjs soubor.camprog --all      (vypsat všechny řádky)
//   … --jobs=N   víc dílů paralelně v N podprocesech (výchozí = počet jader,
//                nebo CAM_RULES_JOBS); --jobs=1 po jednom. --times = nejpomalejší díly.
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
import { spawn } from 'child_process';
import { availableParallelism } from 'os';

const PLUNGE_MIN_CUT = 0.5;   // mm² — P6: dotek bokem bez materiálu pod nosem (tolerance validátoru)
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { runCamProg } = await imp('tests/helpers/camHeadless.mjs');
const { MaterialRemoval, toolFootprint, toolFootprintVisual, insertExtent, insertWorldLoop } = await imp('js/calculators/cam/materialRemoval.js');
const { validateToolpath, holderWorldLoop } = await imp('js/calculators/cam/collisionValidator.js');
const { offsetSilhouetteLoop } = await imp('js/calculators/cam/toolEnvelope.js');
const { getEffectivePlungeAngle, plungeDisabled, wallPlungeOn, topXOnLoop } = await imp('js/calculators/cam/camMath.js');
const { getInsert } = await imp('js/calculators/cam/inserts/index.js');
const { stripCodeOwnedParams } = await imp('js/calculators/cam/camDefaults.js');
const { makePassHelpers } = await imp('js/calculators/cam/passHelpers.js');
const { polyOffset, pointInLoop, polyUnion, polyArea } = await imp('js/geom/geomCore.js');
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

// MATERIÁL V PÁSU VRSTVY (P4, audit 27. 11. 2026): úseky materiálu na svislici
// z (sudo-liché pravidlo přes všechny smyčky); vrátí horní konec nejnižšího
// úseku, který zasahuje do pásu (x0, x1), nebo null. `topAt` bere vrch CELÉHO
// sloupce — čelně (prohozené osy) u dílu s převisem je to materiál nebo díl
// o stovky mm dál (part-19: konec vrstvy Z71,9, „vrch" sloupce Z256,9)
// a uměle zkrácená vrstva tak prošla jako „díl tam leží pod břitem".
const slabTopAt = (loops, z, x0, x1) => {
  const xs = [];
  for (const l of loops) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) xs.push(a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z)));
    }
  }
  xs.sort((p, q) => p - q);
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] > x0 && xs[k] < x1) return xs[k + 1];
  return null;
};

// Spodní hrana materiálu na souřadnici z (nejnižší průsečík se smyčkami).
// Délka materiálu ve sloupci z (součet úseků uvnitř, sudo-liché pravidlo).
const colLen = (loops, z) => {
  const xs = [];
  for (const l of loops) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length];
      if ((a.z - z) * (b.z - z) > 0 || a.z === b.z) continue;
      if (Math.min(a.z, b.z) === z && Math.max(a.z, b.z) !== z && b.z === z) continue;
      xs.push(a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z));
    }
  }
  xs.sort((p, q) => p - q);
  let s = 0;
  for (let k = 0; k + 1 < xs.length; k += 2) s += xs[k + 1] - xs[k];
  return s;
};

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

// Nejmenší vzdálenost bodu od lomených čar `polys` ([[{x,z}…]…]).
const distToPoly = (polys, x, z) => {
  let best = Infinity;
  for (const pl of polys) for (let i = 1; i < pl.length; i++) {
    const a = pl[i - 1], b = pl[i], vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L2)) : 0;
    const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
    if (d < best) best = d;
  }
  return best;
};

// DOSAH DESTIČKY (P3 zbytek na dně): nejnižší X, kam sáhne stopa destičky
// (tvar plátku, `toolFootprintVisual`), když střed nosu jede po kontuře
// (`paths` = offset dílu o rádius nosu — do drážky užší než nos nevjede),
// + přídavek. Mřížka z = z0 + k·dz.
function toolReach(P, paths, allow, z0, dz, n, czLim = [-Infinity, Infinity]) {
  if (!paths || !(n > 0)) return null;
  const fp = toolFootprintVisual(P) || toolFootprint(P);
  if (!fp || fp.length < 3) return null;
  let fzLo = Infinity, fzHi = -Infinity;
  for (const p of fp) { fzLo = Math.min(fzLo, p.z); fzHi = Math.max(fzHi, p.z); }
  const prof = [];   // spodní hrana stopy po 0,05 mm v z
  const st = 0.05, m = Math.ceil((fzHi - fzLo) / st);
  for (let j = 0; j <= m; j++) {
    const zz = Math.min(fzLo + j * st, fzHi - 1e-9);
    let lo = Infinity;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], b = fp[(i + 1) % fp.length];
      if ((a.z <= zz && b.z > zz) || (b.z <= zz && a.z > zz)) lo = Math.min(lo, a.x + (b.x - a.x) * ((zz - a.z) / (b.z - a.z)));
    }
    prof.push(lo);
  }
  const out = new Array(n).fill(Infinity);
  const stamp = (cx, cz) => {
    const k0 = Math.max(0, Math.ceil((cz + fzLo - z0) / dz)), k1 = Math.min(n - 1, Math.floor((cz + fzHi - z0) / dz));
    for (let k = k0; k <= k1; k++) {
      const lo = prof[Math.round((z0 + k * dz - cz - fzLo) / st)];
      if (lo !== undefined && cx + lo + allow < out[k]) out[k] = cx + lo + allow;
    }
  };
  for (const pl of paths) for (let i = 1; i < pl.length; i++) {
    const a = pl[i - 1], b = pl[i], L = Math.hypot(b.x - a.x, b.z - a.z), s = Math.max(1, Math.ceil(L / 0.1));
    // Střed nosu za osou nejede nikdy (offset uzavírací čáry po ose X−R).
    for (let j = 0; j <= s; j++) {
      const cx = a.x + (b.x - a.x) * j / s, cz = a.z + (b.z - a.z) * j / s;
      if (cx >= 0 && cz >= czLim[0] && cz <= czLim[1]) stamp(cx, cz);
    }
  }
  return out;
}

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
  // Meze téhož výpočtu: u karuselu prohozené (rozsah X stroje = rozsah „Z"
  // měření = poloměr). Z původních `prog.zLimits` se hlásil zbytek i mimo
  // rozsah X (u3-beyond poloměr 69…526 při rozsahu 705,9…901; audit 24. 11. 2026).
  const zLim = (carouselXZ ? xz.S.zLimits : prog.zLimits) || {};
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
  let partR = offsetSilhouetteLoop(r.calc.contourSegments);
  // KARUSEL: „X0" v prohozených osách je spodní plocha dílu, ne osa — pod ni se
  // neobrábí ani za vnějším průměrem (prstenec polotovaru, zigzagRough.js
  // `floorLayerX`). Dno tam = spodní plocha + přídavek a roh u paty stěny je
  // dosah nosu (audit 24. 11. 2026, karusel od středu r 842–896).
  if (carouselXZ && partR && partR.length > 2) {
    let zA = Infinity, zB = -Infinity;
    for (const s of r.calcSim.stockPathSegments || []) for (const p of [s.p1, s.p2]) if (p) { zA = Math.min(zA, p.z); zB = Math.max(zB, p.z); }
    for (const p of partR) { zA = Math.min(zA, p.z); zB = Math.max(zB, p.z); }
    const slab = [{ x: -1, z: zA - 50 }, { x: 0, z: zA - 50 }, { x: 0, z: zB + 50 }, { x: -1, z: zB + 50 }];
    try { const u = polyUnion([partR], [slab]); if (u && u[0]) partR = u.sort((a, b) => Math.abs(polyArea([b])) - Math.abs(polyArea([a])))[0]; } catch { /* beze změny */ }
  }
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
  // Hrubovací offset stěny jako lomená čára (oblouky po 16 bodech) — P6 „po
  // stěně". Bere se dráha nosu po HOTOVÉ kontuře (`finishRefPath`) a „po
  // stěně" = ve vzdálenosti přídavku (`allow`) od ní: cik cak jede jízdu po
  // stěně „po hrubovacím offsetu s přídavkem na hotovo" (pravidlo 20) —
  // lathe-zigzag-left-10 přesně 0,20 mm = přídavek; `calc.offsetPath` je
  // u cik caku jinde (23–59 mm).
  const offsetPoly = face ? null : (() => {
    const out = [];
    for (const s of r.calc.finishRefPath || []) {
      if (!s || s.isDegenerate) continue;
      if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
        let a0 = s.startAngle, a1 = s.endAngle;
        if (s.dir === 'G2' && a1 > a0) a1 -= 2 * Math.PI;
        if (s.dir !== 'G2' && a1 < a0) a1 += 2 * Math.PI;
        const seg = [];
        for (let k = 0; k <= 16; k++) { const ang = a0 + (a1 - a0) * k / 16; seg.push({ x: s.cx + Math.sin(ang) * s.r, z: s.cz + Math.cos(ang) * s.r }); }
        out.push(seg);
      } else if (s.p1 && s.p2) out.push([s.p1, s.p2]);
    }
    return out.length ? out : null;
  })();
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
  let holderStep = 0;
  if (!face && P.respectInsertGeometry) {
    try { const h = holderWorldLoop(P, false); if (h && h.length) holderStep = -Math.min(...h.map(p => p.z)) + 0.1; } catch { /* bez držáku */ }
  }
  const order = face ? { onPassStart: () => {}, found: { hump: [], order: [] } }
    : makeOrderChecks({ ap, part, allowLoop, stockLoop: rm.baseLoop, guides: r.calc.interferenceGuides,
      cutsFullWidth: partingOk, offsetXAt, dir, topAt, topXOnLoop, pointInLoop, finalLoops, sp,
      zigzag: P.roughingStrategy === 'zigzag', noseR: parseFloat(P.toolRadius) || 0 });
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
  const zlR = zLim;
  const rangeZ = (zlR.rangeActive && Number.isFinite(zlR.rangeStart) && Number.isFinite(zlR.rangeEnd))
    ? [Math.min(zlR.rangeStart, zlR.rangeEnd), Math.max(zlR.rangeStart, zlR.rangeEnd)] : [-Infinity, Infinity];
  if (Number.isFinite(r.calc.rangeEndZ)) {
    // Zleva se jede k +Z (konec rozsahu nahoře), zprava k −Z (dole).
    if (P.roughingSide === 'left') rangeZ[1] = Math.min(rangeZ[1], r.calc.rangeEndZ);
    else rangeZ[0] = Math.max(rangeZ[0], r.calc.rangeEndZ);
  }
  // SCHOD OD MATERIÁLU NAD VRSTVOU (pravidlo 6 „Čelně", audit 26. 11. 2026):
  // první schod na přechodu z mezní čáry nemá nad sebou konec mělčí vrstvy —
  // mělčí vrstvy tam nejsou, protože pod mezní čarou nic nebraly (face-psknr
  // `N950`: vrstvy Z272,9–292,9 vynechané, nad koncem stojí válec odlitku X21,8).
  // Konec je fyzikální, když by OBRYS DESTIČKY o 1 mm dál zajel do materiálu
  // výš než horní hrana téže vrstvy (edge + ap) — ten vrstva brát nemá.
  // Tolerance ±0,15 jako u schodu podle úhlu: generátor (face/insertGuard.js)
  // měří mez od konců mělčích vrstev, ne od skutečného materiálu, a končí
  // 0,35–1,1 mm před dotykem (face-psknr `N950` 1,10, casting-axial `N2080` 1,05).
  const insLoopT = (() => {
    try {
      const l = insertWorldLoop(P, P.roughingSide === 'left');
      if (!l || l.length < 3) return null;
      const out = [];
      for (let k = 0; k < l.length; k++) {
        const a = T(l[k]), b = T(l[(k + 1) % l.length]);
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
        for (let j = 0; j < n; j++) out.push({ x: a.x + (b.x - a.x) * j / n, z: a.z + (b.z - a.z) * j / n });
      }
      return out;
    } catch { return null; }
  })();
  const blockedAbove = (q, loops) => {
    if (!insLoopT) return false;
    const zN = q.e + q.dir * 1.15, top = q.edge + ap + TOL_AP;
    for (const p of insLoopT) {
      const pt = { x: q.d + p.x, z: zN + p.z };
      if (pt.x <= top) continue;
      for (const l of loops) if (pointInLoop(pt, l) === 'inside') return true;
    }
    return false;
  };
  const pastRange = (q) => !face && (q.dir < 0
    ? q.e - 1 - extR.zNeg < rangeZ[0] - 0.05
    : q.e + 1 + extR.zPos > rangeZ[1] + 0.05);

  const hRuns = [];
  let hRun = null;
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9) { rm.advanceTo(spR, i); continue; }
    const before = Math.abs(rm.model.area());
    const loopsBefore = TL(rm.model.loops);
    const loopsBeforeR = rm.model.loops;   // skutečné osy (P6 nájezd dokončování)
    if (b.type !== 'G0') {
      // Pohyb jede po hrubovacím offsetu stěny (P3/P6 — viz `offsetPoly`).
      const onWall = () => {
        if (!offsetPoly) return false;
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          if (Math.abs(distToPoly(offsetPoly, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) - allow) > 0.15) return false;
        }
        return true;
      };
      // CIK CAK — „u stěny pod trojúhelníkem rampy se krátce bere víc než ap"
      // (pravidlo 20, schváleno): u vodorovné vrstvy cik caku se do třísky
      // nepočítají sloupce do délky rampy (ap / tan úhlu zanoření) + R od
      // jejích konců (lathe-zigzag-left-10 `N1470` 10,6 mm při ap 8 na konci
      // u stěny). Jízda po stěně cik caku sbírá schody mezi vrstvami — to
      // není vrstva, tříska se jí neměří (`N1690` po offsetu stěny).
      const zz = P.roughingStrategy === 'zigzag' && !face;
      // Vrstva cik caku po dně spodku stoupá/klesá mírně se dnem (carousel-
      // zigzag-po-x `N4450` Z108,201 → 108,609 na 9,5 mm) — pořád je to vrstva
      // a pod trojúhelníkem rampy vrstvy nad ní platí totéž (audit 26. 11. 2026).
      const zzLayer = zz && Math.abs(b.x - a.x) <= 0.1 * Math.abs(b.z - a.z) && len > 1;
      const zzZone = ap / Math.tan(Math.max(1, Math.min(plungeLimit, 89)) * Math.PI / 180) + lift;
      const inZzEnd = (z) => zzLayer && Math.min(Math.abs(z - a.z), Math.abs(z - b.z)) < zzZone;
      let worstChip = 0;
      // P3 — tříska: materiál nad břitem v každém bodě pohybu (stav PŘED ním).
      // Čelně jen podle ÚBĚRU (níž): vrstva končí o strmé zúžení a řádek pod
      // středem nosu tam vede tělem DÍLU za stěnou — „materiál nad břitem"
      // by započítal celý díl (part-16 N2690: 23 mm, reálně ubráno 3,0 mm).
      let worst = 0;
      // TŘÍSKA = tloušťka, která vydrží aspoň na 0,5 mm šířky (minimum v okně
      // podél Z). Proužek užší než to (konce sousedních vrstev o 0,1 mm jinde —
      // part-1 `N540`: vrstvy končí na Z257,468 / 257,614 / 257,506, proužek
      // 0,1 mm široký přes dvě vrstvy hlášen „5,68 mm") třískou ap není.
      const winMax = (vals, w) => {
        let m = 0;
        for (let k = 0; k + w <= vals.length; k++) { let lo = Infinity; for (let j = k; j < k + w; j++) lo = Math.min(lo, vals[j]); if (lo > m) m = lo; }
        if (vals.length < w && vals.length) m = Math.max(m, Math.min(...vals));
        return m;
      };
      const n = face ? -1 : Math.max(1, Math.ceil(len / SAMPLE));
      const chipPts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const top = topAt(loopsBefore, z);
        if (top !== null && top - (x - lift) > worst) worst = top - (x - lift);
        chipPts.push(top !== null && !inZzEnd(z) ? top - (x - lift) : 0);
      }
      worstChip = Math.max(worstChip, winMax(chipPts, 2));
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
        const chipCols = [];
        for (let zg = zA; zg <= zB + 1e-9; zg += 0.25) { let dCol = 0; for (const z of [zg - 1e-4, zg + 1e-4]) {
          const t0 = topAt(loopsBefore, z);
          if (t0 === null) continue;
          const t1 = topAt(loopsAfter, z);
          // Sloupec vybraný celý: až ke SPODKU materiálu ve sloupci (čelně je
          // osa měření Z stroje; podélně ne vždy osa — odlitek s šikmým spodkem,
          // part-13 Z −1…0 klín X107…109,9 vybraný celý hlášen „109,92 mm").
          // Odlitek s dutinami (čelně lathe-face-casting-axial: sloupec přes
          // oddělené kusy, „vrchol − spodek" hlásil 587 mm) → úbytek DÉLKY
          // materiálu ve sloupci, ne rozdíl výšek.
          const d = Math.min(t0 - (t1 !== null ? t1 : bottomAt(loopsBefore, z)),
            colLen(loopsBefore, z) - colLen(loopsAfter, z));
          if (d > worst) worst = d;
          if (!inZzEnd(z) && d > dCol) dCol = d;
        } chipCols.push(dCol); }
        worstChip = Math.max(worstChip, winMax(chipCols, 3));
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
      // Cik cak — SJEZD RAMPOU u stěny (pravidlo 20: „u stěny pod trojúhelníkem
      // rampy se krátce bere víc než ap"): šikmý pohyb dolů nejvýš o ap
      // (lathe-zigzag-left-valley `N5810` 3,26 mm, carousel-zigzag-po-x `N4470`).
      const zzRamp = zz && b.x < a.x - 0.05 && Math.abs(b.z - a.z) > 0.05 && a.x - b.x <= ap + 0.05;
      const chipV = outwardX ? cut / dxOut : (zz && (onWall() || zzRamp) ? 0 : worstChip);
      //  • UPICHOVÁK ZANOŘUJE KOLMO CELOU ŠÍŘKOU (uživatel 22. 11. 2026: „tak má
      //    jet kolmo a celou stranou plátku, jinak to ani nejde"). Radiální
      //    zanoření k ose není vrstva — sloupec tu byl celá hloubka zápichu
      //    (part-20 `G1 X31.766` „98,7 mm"). Krok vedle sebe hlídá pravidlo 17.
      // Ve SKUTEČNÝCH osách stroje (`spR`) — čelně jsou `a`/`b` prohozené.
      const ra = spR[i - 1], rb = spR[i];
      const partingPlunge = partingOk && rb.x < ra.x && Math.abs(rb.z - ra.z) <= 0.1 * (ra.x - rb.x);
      // Tolerance pravidla 3 (uživatel 23. 11. 2026): polygon — první vrstva
      // pod NEDOTČENÝM polotovarem smí vzít až ap + rádius nosu (mřížka počítá
      // se středem nosu; part-4 `N160` 2,7 mm při ap 2,5 a R 1,2).
      const polyFirst = () => {
        if (P.toolShape !== 'polygon' || !(chipV <= ap + liftR + TOL_AP)) return false;
        const SL = TL([rm.baseLoop || []]);
        const zm = (a.z + b.z) / 2, tb = topAt(loopsBefore, zm), ts = topAt(SL, zm);
        return tb !== null && ts !== null && Math.abs(tb - ts) < 0.05;
      };
      // Výjimka pravidla 3 (uživatel 26. 11. 2026): kulatá čelně — první kroky
      // sestupu pod úhlem zanoření pod osazením. Krok vezme horní půlkou nosu
      // sloupec, který vrstvy nad ním kvůli osazení nechaly (part-23 R10 `N2180`
      // 9,2 mm při ap 4, part-18 R8 `N2770` 5,6 při ap 3); jemnější krok by musel
      // být ~0,2 mm. Smí nejvýš rádius nosu. Krok = konec o vrstvu (ap) mělčí
      // vrstvy minus tento konec, 0,2 … ap·tan(zanoření) + 0,15 směrem k ose.
      const roundDescent = () => {
        if (!face || !ins.faceDescentAtPlungeAngle || !(chipV <= (parseFloat(P.toolRadius) || 0) + TOL_AP)) return false;
        const dzT = b.z - a.z;
        if (!(Math.abs(b.x - a.x) < 1e-6 && Math.abs(dzT) > 1)) return false;
        const dirT = Math.sign(dzT), maxStep = ap * Math.tan(Math.min(89, plungeLimit) * Math.PI / 180) + 0.15;
        return layerEnds.some(L => L.dir === dirT && Math.abs(L.d - (b.x + ap)) < 0.1
          && (b.z - L.e) * dirT > 0.2 && (b.z - L.e) * dirT <= maxStep);
      };
      if (!finishLine && !partingPlunge && chipV > ap + TOL_AP && cut > 0.05 && !polyFirst() && !roundDescent()) found.chip.push({ i, v: chipV, line: sp[i].originalLineIdx });
      // Vrstva = navazující vodorovné řádky na tomtéž X (cik cak u stěny dojede
      // kus vrstvy jiným posuvem — v-insert-size `N2590 G1 Z583.210` +
      // `N2600 G1 Z593.410 F0.053`; ten kus sám by vyšel „tenký").
      if (Math.abs(b.x - a.x) < 1e-6) {
        if (hRun && hRun.last === i - 1 && Math.abs(hRun.x - b.x) < 1e-6) {
          hRun.worst = Math.max(hRun.worst, worst); hRun.worstPlan = Math.max(hRun.worstPlan, worstPlan);
          hRun.len += len; hRun.cut += cut; hRun.last = i;
          hRun.z0 = Math.min(hRun.z0, b.z); hRun.z1 = Math.max(hRun.z1, b.z);
          if (cut > 0.05 && len > hRun.bestLen) { hRun.i = i; hRun.z = (a.z + b.z) / 2; hRun.bestLen = len; }
        } else {
          hRun = { x: b.x, worst, worstPlan, len, cut, last: i, i, z: (a.z + b.z) / 2, bestLen: cut > 0.05 ? len : 0, edge: b.x - lift,
            z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), finish: finishLine };
          hRuns.push(hRun);
        }
      }
      // P5 — posuv vzduchem. Vzduch = neubere nic ani z odlitku velkého až po
      // OFFSETOVOU čáru (pravidlo 9: ta čára JE materiál). Měřeno jen proti
      // nakreslenému odlitku se za vzduch počítal pás vůle, kterým emise
      // správně jede posuvem (karusel R5, vůle 1 mm: 19× „Přejezd materiálem
      // posuvem" 4 mm hlášeno jako vzduch, 11. 11. 2026).
      // Dokončení při NULOVÉM přídavku (přídavek X/Z + na hotovo < 0,05 mm)
      // po obrysu nic neubere ze své podstaty — je to nastavení, ne vzduch
      // dráhy (holder-* díly, audit 23. 11. 2026).
      const finishNoAllow = finishLine && allow < 0.05;
      if (len > AIR_MIN_LEN && Math.max(cut, cutPlan) < AIR_CUT_PER_MM * len && !finishNoAllow) found.air.push({ i, v: len });
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
        // Po offsetu = KOLMÁ vzdálenost od offsetové dráhy (`onWall` výš; ne X
        // ve stejném Z — u strmé stěny dá malá odchylka v Z velkou v X a offset
        // má v jednom Z víc průsečíků, cik cak `N1690` 71° po stěně neprošel).
        // Cik cak (pravidlo 20, „Schody na stěnách spodku"): jízda po
        // hrubovacím offsetu šikmé stěny shora do rohu u dna, svislá stěna
        // svisle dolů — schválená výjimka; jen pohyb, který po offsetu
        // opravdu jede (lathe-zigzag-left-10 `N1690 G1 X66.220 Z115.732` 71°).
        const wall = roughing && (wallPlungeOn(P) || P.roughingStrategy === 'zigzag')
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
        // Cik cak — SVISLÉ DOJETÍ DO TROJÚHELNÍKU U STĚNY (pravidlo 20, výjimka
        // uživatele 24. 11. 2026): první posuv po rychloposuvu k začátku rampy
        // nebo jízdy po stěně smí jít svisle do zbytku pod rampou / schody vyšších
        // vrstev, nejvýš o ap pod nosem (stock-valley `N2940` 3 mm, left-10 `N1760`).
        const zzEntry = roughing && P.roughingStrategy === 'zigzag' && !face && deg >= 85
          && sp[i - 1] && sp[i - 1].type === 'G0' && worst <= ap + TOL_AP;
        if (deg > lim + 1 && !finishApproachOk && !zzEntry) found.plunge.push({ i, v: deg, lim, depth, cut, under: worst, line: sp[i].originalLineIdx });
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
        // Čelně se měří MÍSTNĚ (`slabTopAt`): materiál v pásu vrstvy a díl
        // (přídavková smyčka) přímo pod břitem 1 mm za koncem.
        const top = slabTopAt(TL(rm.model.loops), q.zN, q.edge + 0.05, q.edge + ap + TOL_AP);
        // Díl brání, když by nos (kružnice rádiusu kolem středu na téže hloubce
        // 1 mm dál) zajel do přídavkové smyčky — místně, ne vrch sloupce.
        const noseHits = (() => {
          const R = Math.max(lift, 0.05);
          for (let j = 0; j <= 12; j++) {
            const a = Math.PI * j / 12;
            const pt = { x: q.d - R * Math.sin(a) + 0.05, z: q.zN + R * Math.cos(a) };
            if (pointInLoop(pt, allowLoop) === 'inside') return true;
          }
          return false;
        })();
        const offX = noseHits ? Infinity : null;
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
        // SCHOD OD DRŽÁKU (pravidlo 2, audit 24. 11. 2026): hlubší vrstva smí
        // nejvýš o levou šířku držáku + rezervu 0,1 za konec mělčí vrstvy —
        // tam stojí schod, který mělčí vrstva kvůli držáku nechala
        // (toolEnvelope.js `mainStair`; long-pclnr-valley konce po 3,772 =
        // 3,672 + 0,1). Šířka z obdélníku kolem obrysu držáku jako v generátoru.
        // Generátor bere PŘESNÝ obrys držáku ve výškách schodu (toolEnvelope.js
        // `stairReach`), takže krok je nejvýš levá šířka držáku + rezerva —
        // konec mezi tím a koncem mělčí vrstvy, za kterým stojí jen výška
        // schodu (≤ ap), je schod od držáku.
        const holderStair = holderStep > 0.2 && layerEnds.some(L => L.dir === q.dir && Math.abs(L.d - (q.d + ap)) < 0.1
          && (L.e - q.e) * q.dir > 0.05 && (L.e - q.e) * q.dir <= holderStep + 0.15);
        // Upichovák (řeže celou šířkou, úhel 90°) žádný schod nemá.
        const stair = !partingOk && (layerEnds.some(L => L.dir === q.dir && Math.abs(L.d - (q.d + ap)) < 0.1
          && stepNoms.some(s => Math.abs((L.e - q.e) * q.dir - s) <= 0.15))
          || (holderStair && top !== null && top - q.edge <= ap + TOL_AP));
        if (top !== null && top > q.edge + 0.2 && (offX === null || offX < q.edge + lift - 0.2) && !stair && !partingPlungeOut && !pastRange(q)
          && !blockedAbove(q, TL(rm.model.loops)))
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
  found.humpBreak = face ? [] : checkHumpContinuity(sp, offsetXAt, { zigzag: P.roughingStrategy === 'zigzag' });

  for (const q of hRuns) {
    if (q.len > 1 && q.cut > 0.05 && q.worst > 0.05 && q.worst < ap - THIN && (!rmPlan.model || q.worstPlan < ap - THIN))
      thinCand.push({ i: q.i, v: q.worst, z: q.z, edge: q.edge, run: q });
  }
  // P3 — tenká vrstva uprostřed: později na tomtéž Z jelo ještě hlouběji —
  // a to další VRSTVOU (vodorovný průchod přes totéž Z, ≥ 0,5 mm níž). Jízda
  // po stěně nebo dojezd do dna V-drážky pod poslední vrstvou z ní „vrstvu
  // mezi dvěma plnými" nedělá (lathe-zigzag-left-10 `N2740` X45,08 a pod ní
  // jen dojezd po stěně V na X43,87).
  const stockLoops = TL([rm.baseLoop || []]);
  // Vrstva je (aspoň zčásti) PRVNÍ pod tenčím polotovarem: polotovar nad
  // jejím břitem je tu tenčí než ap a nad ní tu dřív nejela žádná vrstva.
  // Zbytek vrstvy smí jet pod vrstvou nad sebou (lathe-face-casting-axial
  // `N5680`: zčásti pod vrstvou Z220, zčásti pod šikmým odlitkem).
  // Hrana polotovaru NAD bodem (nejbližší průsečík nad břitem) — u čelního
  // odlitku je nejvyšší průsečík jiná část odlitku (lathe-face-casting-axial:
  // X476 v čelních osách), ne povrch přímo nad vrstvou.
  const stockAbove = (z, e) => {
    let best = null;
    for (const l of stockLoops) for (let k = 0; k < l.length; k++) {
      const a = l[k], b = l[(k + 1) % l.length];
      if ((a.z - z) * (b.z - z) > 0 || a.z === b.z) continue;
      const x = a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z);
      if (x > e - 1e-6 && (best === null || x < best)) best = x;
    }
    return best;
  };
  const firstUnderThinStock = (q) => {
    const edge = q.run.x - lift, n = Math.max(2, Math.ceil((q.run.z1 - q.run.z0) / 0.5));
    const above = hRuns.filter((o) => o.last < q.run.i && o.x > q.run.x + 0.05 && o.cut > 0.05);
    let nS = 0, nT = 0;
    for (let k = 0; k <= n; k++) {
      const z = q.run.z0 + (q.run.z1 - q.run.z0) * k / n, t0 = stockAbove(z, edge);
      const t = t0 === null ? edge : t0;   // nad břitem žádný polotovar = tloušťka 0
      nS++;
      // Vrstva nad ní = mezi břitem a hranou polotovaru nad ním (ne vrstvy za
      // odlitkem na druhé straně dílu).
      if (t - edge < ap - 0.05 && !above.some((o) => o.x - lift < t + 0.05 && z >= o.z0 - 0.5 && z <= o.z1 + 0.5)) nT++;
    }
    return nS > 0 && nT >= 0.1 * nS;
  };
  // Čelně (pravidlo 3, výjimka): pás nad čelem mezi offsetovou čarou
  // polotovaru a první vrstvou mřížky se dělí ROVNOMĚRNĚ — druhá vrstva shora
  // leží pod první přesně o svou tloušťku (face-cylinder Z49,5 → 48 po 1,5).
  const faceSkimPair = (q) => {
    if (!face) return false;
    const over = hRuns.filter((o) => o.last < q.run.i && o.x > q.run.x + 0.05 && o.cut > 0.05
      && o.z0 < q.run.z1 && o.z1 > q.run.z0);
    if (!over.length) return false;
    const up = over.reduce((a, b) => (b.x < a.x ? b : a));
    return Math.abs(up.x - q.run.x - q.v) < 0.2 && !over.some((o) => o.x > up.x + 0.05);
  };
  for (const q of thinCand) {
    const topEnd = topAt(TL(rm.model.loops), q.z);
    if (topEnd === null || topEnd >= q.edge - 0.5) continue;
    const zs = [q.run.z0, q.run.z1];
    // Vrstva přesně o ap pod předchozí vrstvou přes totéž Z má ap — tenká je
    // jen proto, že kulatý nos předchozí vrstvy u stěn zúžené drážky ubral
    // víc (v-insert-size R20 `N3060` X75,22 pod X83,22, ap 8).
    if (hRuns.some((o) => o.last < q.run.i && Math.abs(o.x - q.run.x - ap) < 0.15 && o.cut > 0.05 && o.z0 < zs[1] && o.z1 > zs[0])) continue;
    // Pravidlo 3, výjimky (uživatel 23. 11. 2026): první vrstva pod tenčím
    // polotovarem smí být tenčí (lathe-zigzag-left-10 `N240` 1 mm při ap 8);
    // čelně se pás nad čelem dělí rovnoměrně.
    if (firstUnderThinStock(q) || faceSkimPair(q)) continue;
    // Cik cak v ÚZKÉM V (pravidlo 3, výjimka uživatele 24. 11. 2026): vrstva
    // kratší než rampa o ap pod úhlem zanoření — mezivrstvy, aby se rampa
    // vešla (zigzagFloor.js `fitRampLayers`; lathe-zigzag-left-10 X49,657).
    // I mezivrstva nad takovou krátkou vrstvou (vznikla kvůli ní).
    const shortRun = ap / Math.tan(Math.max(1, Math.min(plungeLimit || 45, 89)) * Math.PI / 180) + 0.5;
    if (P.roughingStrategy === 'zigzag' && !face && (q.run.z1 - q.run.z0 < shortRun
      || hRuns.some((o) => o.last > q.run.last && o.x < q.run.x - 0.05 && o.x > q.run.x - ap - 0.05
        && o.z1 - o.z0 < shortRun && o.z0 < q.run.z1 && o.z1 > q.run.z0))) continue;
    // Hlubší vrstva musí jet POD ní (překryv v Z aspoň 0,5 mm) — dno údolí,
    // které u paty stěny sahá 0,2 mm pod plošinu, vrstvu pod ní nedělá
    // (left-valley `N5420` dojezd po plošině X35,356, dno údolí X11,744 do Z200,009).
    // Dokončení (jede po kontuře pod přídavkem) další vrstvou hrubování není:
    // hrubovací vrstva po čáře přídavku je poslední a tenčí být smí
    // (part-4 `N300` X32,14 po plošině, pod ní jen dokončení X31,14).
    if (hRuns.some((o) => !o.finish && o.last > q.run.last && o.x < q.run.x - 0.5 && o.cut > 0.05 && Math.min(o.z1, zs[1]) - Math.max(o.z0, zs[0]) > 0.5)) found.thin.push(q);
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
  const zl = zLim;
  const rng = !face && zl.rangeActive && Number.isFinite(zl.rangeStart) && Number.isFinite(zl.rangeEnd)
    ? [Math.min(zl.rangeStart, zl.rangeEnd), Math.max(zl.rangeStart, zl.rangeEnd)] : null;
  let fLo = rng ? Math.max(rng[0], Math.min(zLo, sLo)) : Math.min(zLo, sLo);
  let fHi = rng ? Math.min(rng[1], Math.max(zHi, sHi)) : Math.max(zHi, sHi);
  // STĚNA POD X MAX (pravidlo 12, `rangeEndZ`): za stěnou se neobrábí vůbec
  // a u ní smí střed nosu jen tam, kde obrys destičky stěnu nepřejede — jako
  // u P4 (`pastRange`). Klín pod spodní hranou destičky mezi stěnou a koncem
  // vrstev (xmax-wall Z269,6…272,9, konce vrstev = stěna + přesah 3,3) je
  // dosah destičky, ne chybějící vrstva (audit 26. 11. 2026). `rangeEndZ` je
  // i konec ručního rozsahu, který úsek zkrátil (range-end-leadout Z61,1…64,6).
  // Totéž ruční rozsah 📐 (`rangeZ`, jako `pastRange` u P4; pravidlo 16 „meze
  // platí pro obrys plátku"): round-r10-finish-steep-arc u konce rozsahu
  // Z101,9 — Z102–116 je stín kulaté R10, střed nosu smí nejvýš na mez + přesah
  // (audit 27. 11. 2026; dřív vráceno jako „nečitelné", po rozboru oprávněné).
  let czLim = [-Infinity, Infinity];
  if (!face) {
    fLo = Math.max(fLo, rangeZ[0]); fHi = Math.min(fHi, rangeZ[1]);
    czLim = [rangeZ[0] + extR.zNeg, rangeZ[1] - extR.zPos];
  }
  // Dráha středu nosu čistě GEOMETRICKY (offset dílu o rádius nosu, úzké
  // drážky offset sám zavře) — ne `finishRefPath`: ta je u podélného
  // napojená na čáru zanoření a schovala by klín pod ní, který P3 hlásí.
  let nosePath = null;
  if (!face && liftR > 0) {
    try { const o = polyOffset([partR], liftR); if (o && o[0]) { const l = o.sort((u, v) => v.length - u.length)[0]; nosePath = [[...l, l[0]]]; } } catch { /* bez dosahu */ }
  }
  const reach = face ? null : toolReach(P, nosePath, allow, fLo + 0.25, 0.25, Math.ceil((fHi - fLo) / 0.25), czLim);
  // TŘÍDĚNÍ (audit 27. 11. 2026, počty se nemění): dosah destičky po HRANICI
  // HRUBOVÁNÍ (`calc.offsetPath` = offset dílu napojený na čáry zanoření,
  // pravidlo 1). Zbytek, který vysvětlí celý, leží pod hranicí, ke které
  // vrstvy jedou — hlásí se dál (klín pod čarou zanoření má být vidět, viz
  // výš), jen se označí, ať vyniknou nevysvětlené (chybějící vrstvy).
  // `finishRefPath` vysvětlí míň (6 proti 84): dokončování jede jinudy.
  let reachPL = null;
  const plPaths = [r.calc.offsetPath].filter(a => Array.isArray(a) && a.length);
  if (!face && plPaths.length) {
    const reachOf = (path) => {
    const pl = [];
    for (const sg of path) {
      if (sg.type === 'line' && sg.p1 && sg.p2) { pl.push({ x: sg.p1.x, z: sg.p1.z }, { x: sg.p2.x, z: sg.p2.z }); continue; }
      if (sg.type === 'arc' && sg.p1 && sg.p2 && Number.isFinite(sg.cx)) {
        const a1 = Math.atan2(sg.p1.x - sg.cx, sg.p1.z - sg.cz);
        let a2 = Math.atan2(sg.p2.x - sg.cx, sg.p2.z - sg.cz);
        if (sg.dir === 'G2') { while (a2 > a1) a2 -= 2 * Math.PI; } else { while (a2 < a1) a2 += 2 * Math.PI; }
        for (let j = 0; j <= 16; j++) { const a = a1 + (a2 - a1) * j / 16; pl.push({ x: sg.cx + Math.sin(a) * sg.r, z: sg.cz + Math.cos(a) * sg.r }); }
      }
    }
    return pl.length > 1 ? toolReach(P, [pl], allow, fLo + 0.25, 0.25, Math.ceil((fHi - fLo) / 0.25), czLim) : null;
    };
    for (const rr of plPaths.map(reachOf)) {
      if (!rr) continue;
      if (!reachPL) reachPL = rr.slice(); else for (let k = 0; k < rr.length; k++) if (rr[k] > reachPL[k] || !Number.isFinite(reachPL[k])) reachPL[k] = Number.isFinite(rr[k]) ? Math.max(rr[k], Number.isFinite(reachPL[k]) ? reachPL[k] : -Infinity) : reachPL[k];
    }
  }
  for (let k = 0, z = fLo + 0.25; z < fHi; k++, z += 0.25) {
    const ptRaw = topXOnLoop(allowLoop, z);
    // Čelně: řádek nad průměrem dílu nemá přídavkovou čáru (podélně tam je osa = 0).
    // Kam destička nedosáhne ani po hotovní čáře (dno V-drážky užší než
    // kulatá R10 — lathe-zigzag-left-10 Z554…562), tam zbytek NENÍ chybějící
    // vrstva, ale tvar nástroje: mez je výš z přídavkové čáry a dosahu.
    const ptA = ptRaw ?? (face ? null : 0), top = topAt(TL(rm.model.loops), z);
    // (+0,1 = tětivy oblouků a mřížka dosahu — jinak řada hlášení „0,11 mm".)
    // Úsek se vymezí proti přídavkové čáře (jako dřív) a vypustí se, jen když
    // ho dosah vysvětlí CELÝ — jinak by dosah jeden zbytek rozsekal na víc.
    const pt = ptA !== null && reach && Number.isFinite(reach[k]) ? Math.max(ptA, reach[k] + 0.1) : ptA;
    const overA = top !== null && ptA !== null ? top - ptA : 0;
    const over = top !== null && pt !== null ? top - pt : 0;
    const ptPL = ptA !== null && reachPL && Number.isFinite(reachPL[k]) ? Math.max(pt ?? ptA, reachPL[k] + 0.1) : pt;
    const overPL = top !== null && ptPL !== null ? top - ptPL : over;
    if (overA > TOL_FLOOR) {
      if (!run) run = { z0: z, z1: z, max: over, maxPL: overPL }; else { run.z1 = z; run.max = Math.max(run.max, over); run.maxPL = Math.max(run.maxPL, overPL); }
    } else if (run) { if (run.max > TOL_FLOOR) floors.push(run); run = null; }
  }
  if (run && run.max > TOL_FLOOR) floors.push(run);

  const coll = validateToolpath(spR, P, r.calcSim.stockPathSegments,
    { backside: P.roughingSide === 'left', maxIssues: 200 });

  return { name: basename(file), P, ap, found, floors, coll, N, txt, order, carouselXZ };
}

const fmtList = (arr, fmt) => (showAll ? arr : arr.slice(0, 8)).map(fmt).join('\n      ')
  + (!showAll && arr.length > 8 ? `\n      … a dalších ${arr.length - 8} (--all)` : '');

// Výpis a počty jednoho dílu (text se skládá, ať ho může vrátit i podproces).
function report(c) {
  const { found: F } = c;
  const lines = [];
  const log = (t) => lines.push(t);
  log(`\n══ ${c.name}  (${c.P.toolShape}, ap ${c.ap}, ${c.P.roughingSide === 'left' ? 'zleva' : 'zprava'}${c.carouselXZ ? ', karusel po X — měřeno v prohozených osách, Z… v hlášení = poloměr' : ''})`);
  const cnt = {};
  const row = (label, arr, fmt) => {
    cnt[label] = arr.length;
    log(`  ${arr.length === 0 ? '✓' : '✗'} ${label}: ${arr.length}`);
    if (arr.length) log('      ' + fmtList(arr, fmt));
  };
  row('P2 kolize', c.coll, (q) => `${q.kind} ${q.area.toFixed(1)} mm² @X${q.x.toFixed(2)} Z${q.z.toFixed(2)}`);
  row('P3 tříska větší než ap', F.chip, (q) => `${c.N(q.i)}: ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P3 tenká vrstva uprostřed', F.thin, (q) => `${c.N(q.i)}: jen ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P3 zbytek na dně (chybí poslední vrstva)', c.floors, (q) => `Z ${q.z0.toFixed(1)}…${q.z1.toFixed(1)}: až ${q.max.toFixed(2)} mm nad přídavkem${q.maxPL <= TOL_FLOOR ? '  [pod hranicí hrubování]' : ''}`);
  row('P5 posuv vzduchem', F.air, (q) => `${c.N(q.i)}: ${q.v.toFixed(1)} mm   | ${c.txt(q.i)}`);
  row('P6 zanoření strměji než dovoleno', F.plunge, (q) => `${c.N(q.i)}: ${q.v.toFixed(0)}° (smí ${q.lim.toFixed(0)}°)${q.depth !== null && q.depth !== undefined ? `, nájezd dokončení do ${q.depth.toFixed(2)} mm` : ''}${showAll && Number.isFinite(q.cut) ? ` [úběr ${q.cut.toFixed(2)} mm², pod nosem ${q.under.toFixed(2)} mm]` : ''}   | ${c.txt(q.i)}`);
  row('P7 přes hrb dřív, než je pravá strana hotová', c.order.found.hump, (q) => `${c.N(q.i)}: za hrbem Z${q.zTop.toFixed(1)}, vpravo ještě ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  row('P7 vrstva přes hrb vcelku až na konec', F.humpBreak, (q) => `${c.N(q.i)}: vrstva X${q.x.toFixed(3)} se na hrbu Z${Math.min(q.h0, q.h1).toFixed(1)}…${Math.max(q.h0, q.h1).toFixed(1)} (vrchol X${q.top.toFixed(2)}) přerušila   | ${c.txt(q.i)}`);
  row('P8 pořadí úseků', c.order.found.order, (q) => `${c.N(q.i)}: úsek Z${q.A.zLo.toFixed(1)}…${q.A.zHi.toFixed(1)} jde pod vrch úseku Z${q.B.zLo.toFixed(1)}…${q.B.zHi.toFixed(1)} (${q.B.top.toFixed(1)}), ten ještě není hotový   | ${c.txt(q.i)}`);
  row('P4 vrstva končí uprostřed materiálu', F.endMid, (q) => `${c.N(q.i)}: za koncem ${q.v.toFixed(2)} mm   | ${c.txt(q.i)}`);
  const sum = c.coll.length + F.chip.length + F.thin.length + c.floors.length + F.air.length + F.plunge.length + F.endMid.length + c.order.found.hump.length + c.order.found.order.length + F.humpBreak.length;
  return { name: c.name, text: lines.join('\n'), cnt, total: sum, shadow: c.floors.filter(q => q.maxPL <= TOL_FLOOR).length };
}

// ── PARALELNĚ (23. 11. 2026) ─────────────────────────────────────────
// Víc dílů = podprocesy téhož skriptu (`--worker`, jeden díl na proces;
// start ~0,3 s proti 10–30 s na díl), nejvýš `--jobs=N` / CAM_RULES_JOBS /
// počet jader najednou. Výsledky se vypíšou v původním pořadí dílů, takže
// výstup i baseline jsou stejné jako po jednom (`--jobs=1`).
const MARK = '@@CAMRULES@@';
const isWorker = args.includes('--worker');
const jobsArg = args.find(a => a.startsWith('--jobs='));
const jobs = Math.max(1, Math.min(files.length,
  parseInt(jobsArg ? jobsArg.slice(7) : process.env.CAM_RULES_JOBS, 10) || availableParallelism()));

const runWorker = (f) => new Promise((resolve) => {
  const pass = args.filter(a => a === '--all');
  const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), f, '--worker', ...pass], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  ch.stdout.on('data', (d) => { out += d; });
  ch.stderr.on('data', (d) => { err += d; });
  ch.on('close', (code) => {
    const at = out.lastIndexOf(MARK);
    if (code === 0 && at >= 0) resolve(JSON.parse(out.slice(at + MARK.length)));
    else resolve({ error: `${basename(f)}: podproces skončil s kódem ${code}\n${err.split('\n').slice(-15).join('\n')}` });
  });
});

let total = 0;
const counts = {};   // díl → pravidlo → počet (baseline)
let shadowTotal = 0;
const take = (r) => { log(r.text); counts[r.name] = r.cnt; total += r.total; shadowTotal += r.shadow || 0; };
if (isWorker) {
  process.stdout.write(MARK + JSON.stringify(report(await check(files[0]))));
  process.exit(0);
} else if (jobs > 1) {
  const results = new Array(files.length);
  let next = 0, shown = 0;
  const flush = () => {
    while (shown < files.length && results[shown]) {
      const r = results[shown++];
      if (r.error) console.error(r.error); else take(r);
    }
  };
  const ms = new Array(files.length);
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < files.length) {
      const k = next++, t0 = Date.now();
      results[k] = await runWorker(files[k]); ms[k] = Date.now() - t0; flush();
    }
  }));
  if (args.includes('--times')) {
    console.error('Nejpomalejší díly:\n' + files.map((f, k) => [ms[k], basename(f)]).sort((a, b) => b[0] - a[0])
      .slice(0, 10).map(([t, n]) => `  ${(t / 1000).toFixed(1)} s  ${n}`).join('\n'));
  }
  if (results.some(r => r.error)) { console.error('Kontrola některých dílů selhala — výsledek neplatí.'); process.exit(1); }
} else {
  for (const f of files) take(report(await check(f)));
}
log(`\nCELKEM porušení: ${total}`);
log(`  z toho zbytek na dně pod hranicí hrubování (čára zanoření, pravidlo 1): ${shadowTotal}`);
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

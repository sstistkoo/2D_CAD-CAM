// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – emise G-kódu (auto-generace + převod řídicího systému)  ║
// ╚══════════════════════════════════════════════════════════════╝
// Vytaženo z camSimulator.js (Fáze B). generateAutoGCode(S, calc) je bývalé
// generateAutoGCode(calc); ctrlCmt/buildControl*/renumber/convert jsou sdílené
// pomocníky hlavičky/závěru a převodu mezi systémy. V camSimulator.js zůstávají
// tenké wrappery pod původními jmény.
// POZOR: ctrlCmt MUSÍ zůstat function declaration (ne const) — headless test
// harness ho zachytává přes hoisting (viz tests/helpers/camHeadless.mjs).

import { StockModel, polyArea, polyDifference, polyOffset, polySimplify, toolSweep } from '../../geom/geomCore.js';
import { getEffectivePlungeAngle, intersectVerticalLineArc, intersectVerticalLineSegment, isAngleBetween, quantizeUp, rapidFeedGap, stockClearances, topXOnLoop } from './camMath.js';
import { holderWorldLoop } from './collisionValidator.js';
import { segmentHitsPath } from './contourBuild.js';
import { buildStockLoopRaw, offsetStockLoop, toolFootprint, toolFootprintSlim, toolFootprintVisual } from './materialRemoval.js';
import { ROUGHING_STRATEGIES } from './roughingStrategies.js';
import { roughingKey } from './calculatePipeline.js';
import { mergeCollinearMoves } from './gcodeCollapse.js';
import { ctrlCmt, buildControlHeaderLines, buildControlTailLines,
  controlArcFormatter, renumberGCodeLines, convertGCodeControlSystem } from './controlDialect.js';
import { emitThread } from './ops/thread.js';
import { emitPartOff } from './ops/partOff.js';
import { emitRoughing } from './ops/roughEmit.js';
import { emitFinish } from './ops/finishEmit.js';

export function generateGCode(S, calc) {
  return S.manualGCode.split('\n').map((line, idx) => ({ text: line, simIdx: idx }));
}

// Dialekt řídicího systému (hlavička/závěr/převod) — viz cam/controlDialect.js.
// Reexport kvůli zpětné kompatibilitě: camSimulator.js i headless harness
// berou `convertGCodeControlSystem` odsud.
export { ctrlCmt, buildControlHeaderLines, buildControlTailLines,
  controlArcFormatter, renumberGCodeLines, convertGCodeControlSystem };

// ── Auto G-Code Generator (z aktuální kontury/parametrů) ─────
// Volá se jen z tlačítka "🔄 Autorefresh drah" — výsledek přepíše
// S.manualGCode (a tedy i editor a simulační dráhu).
export function generateAutoGCode(S, calc) {
  const prms = S.params;
  // Hlášení, na která se přijde až při EMISI (znají pořadí obrábění a
  // zbytkový polotovar, což calculate() ještě neví). S.errors sem psát
  // nelze — následný přepočet (fullUpdate → calculate) ho přepíše od nuly;
  // fullUpdate proto tenhle seznam po přepočtu do ⚠ panelu připojí.
  S.genNotes = [];
  const lines = [];
  const add = (text, simIdx = null) => lines.push({ text, simIdx });
  const cmt = ctrlCmt(prms.controlSystem);
  const addCmt = (text) => add(cmt(text), null);
  let blockNum = 10;
  const N = () => { const s = `N${blockNum} `; blockNum += 10; return s; };
  const addN = (text, simIdx = null) => add(`${N()}${text}`, simIdx);
  const note = (cmd, text) => ` ${cmd}${cmt(text)}`;
  let arcR = controlArcFormatter(prms.controlSystem);
  // Při otočení svislé osy X (X+ dolů) je program psán pro nástroj zespodu –
  // smysl rotace se obrací, takže G02↔G03 ve výstupu prohazujeme.
  // Totéž platí pro flipZ; G2/G3 se prohazují při lichém počtu překlopení (XOR).
  const flipArc = (code) => {
    if (S.flipX === S.flipZ) return code;
    const c = String(code).trim().toUpperCase();
    if (c === 'G2' || c === 'G02') return code.includes('02') ? 'G03' : 'G3';
    if (c === 'G3' || c === 'G03') return code.includes('03') ? 'G02' : 'G2';
    return code;
  };

  buildControlHeaderLines(prms.controlSystem, prms, S.flipX, S.flipZ).forEach(line => {
    if (line.startsWith(';') || line.startsWith('(')) add(line, null);
    else addN(line, null);
  });

  let simCounter = 0;
  addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Rychloposuv')}`, 0);
  const rDist = calc.retractDist || 2.0;
  // Úhel odskoku (°): X-složka je vždy rDist, Z-složka = rDist/tan(úhel).
  // 45° = klasická diagonála (Z = rDist), 90° = svisle jen v X (Z = 0).
  const rAngDeg = Math.max(5, Math.min(90, parseFloat(prms.retractAngle) || 45));
  // zaokrouhlení na 1e-9 → tan(45°)=0.999…99 nerozhodí výstup (Z1.901 vs 1.902)
  const rDistZ = rAngDeg >= 89.95 ? 0 : Math.round(rDist / Math.tan(rAngDeg * Math.PI / 180) * 1e9) / 1e9;

  // ── ZÁVITOVÁNÍ (záložka Závit) ── samostatná operace, viz ops/thread.js.
  if (prms.threadActive)
    return emitThread({ S, prms, lines, addCmt, addN, note, arcR, flipArc });

  // ── UPICHNUTÍ (part-off) ── samostatná operace, viz ops/partOff.js.
  const partOffActive = prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ));
  if (partOffActive)
    return emitPartOff({ S, calc, prms, lines, addCmt, addN, note, arcR, flipArc });

  if (!prms.finishOnly)
    addCmt(`--- HRUBOVANI (${(ROUGHING_STRATEGIES[roughingKey(S)] || ROUGHING_STRATEGIES.longitudinal).label}) ---`);
  // Vůle nad polotovarem po osách + úhel nájezdové rampy (ladí s calculate()).
  const { x: rapidClrGc, z: rapidClrZGc } = stockClearances(prms);
  // Zastavení rychloposuvu: vůle se měří od HRANY nástroje — nos špičky
  // (rádius R) předbíhá střed, takže střed staví o R dál. Jinak by při
  // vůli < R nos při příjezdu „na vůli“ už škrtal o polotovar.
  const tipRGc = parseFloat(prms.toolRadius) || 0;
  const rapidStopX = rapidClrGc + tipRGc;
  const rapidStopZ = rapidClrZGc + tipRGc;
  // ODSTUP, ve kterém rychloposuv nad plánovací (offsetovou) čarou končí.
  // `rapidStopX` = Vůle + R znamená, že spodek nosu dosedne PŘESNĚ na tu čaru —
  // příjezd tedy končil V ní, ačkoli odlitek až u ní reálně být může (nález
  // uživatele 20. 8. 2026). Zbytek se dojede pracovním posuvem.
  const feedGapGc = rapidFeedGap(prms);
  // Hloubka záběru (ap) = rozteč vrstev — zvednutí „o úroveň výš" (viz
  // přesun v kapse níž) se měří v jejích krocích.
  const stepGc = Math.max(0.1, parseFloat(prms.depthOfCut) || 1);
  const entryAngleDegGc = getEffectivePlungeAngle(prms);
  const entryRadGc = entryAngleDegGc * Math.PI / 180;
  // Helper: ořezat Z na aktivní čelisti/koník limity (G-kód generace).
  const gcChuckZ = (S.zLimits.chuckActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) ? S.zLimits.chuck : null;
  const gcTailZ  = (S.zLimits.tailActive  && typeof S.zLimits.tail  === 'number' && isFinite(S.zLimits.tail))  ? S.zLimits.tail  : null;
  const clipZGc = (z) => {
    let v = z;
    if (gcTailZ  !== null && v > gcTailZ)  v = gcTailZ;
    if (gcChuckZ !== null && v < gcChuckZ) v = gcChuckZ;
    return v;
  };
  // Mez pro ODSKOK čelního průchodu (`pass.retractCapZ`, viz genFacePasses).
  // Vrstva na kraji pásu 📐 odskakuje 45° k obrobené straně, jenže tam v téhle
  // operaci nikdo neobrábí — materiál stojí v plné výšce a diagonála do něj
  // zajede. Mez smí nastavit jen strategie: ta jediná ví, jestli rozsah
  // marchovací mřížku vůbec ořízl. Bez meze (mřížka celá) se nic nemění.
  const clipFaceRetractZ = (z, pass) => {
    const cap = pass.retractCapZ;
    if (typeof cap !== 'number' || !isFinite(cap)) return z;
    return pass.faceLeft ? Math.max(z, cap) : Math.min(z, cap);
  };

  // ── Bezpečné rychloposuvy ──
  // Sledujeme reálnou polohu nástroje (X = rádius) a každý přejezd G0
  // testujeme proti offsetové kontuře (hrubovací i dokončovací offset).
  // Pokud by přímý přejezd konturu protnul, nejdřív se vyjede v X nad
  // polotovar/konturu, přejede v Z a teprve pak sjede na cíl.
  const rapidBlockers = [...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishUnreachablePath || [])].filter(s => !s.isDegenerate);
  let rapidTopX = calc.stockTopX || 0;
  rapidBlockers.forEach(s => {
    if (s.type === 'line') rapidTopX = Math.max(rapidTopX, s.p1.x, s.p2.x);
    else rapidTopX = Math.max(rapidTopX, s.cx + s.r);
  });
  // ── Fáze 4: dynamický zbytkový polotovar pro rychloposuvy ────────
  // Statické blockery (offsety) nevidí POŘADÍ obrábění: přejezd nad
  // místem, které se obrobí až později, vede skrz stojící materiál.
  // Model polotovaru se proto během emise průběžně „obrábí" (noteCutPass
  // po každém průchodu) a přímé rychloposuvy se testují stopou destičky
  // proti aktuálnímu zbytku — při kontaktu se jede nahoru přes polotovar
  // (stejný vzor jako u statických blockerů).
  let rapidStock = null;
  // Týž dynamický model, ale nad PLÁNOVACÍ (vůlí-posunutou) siluetou. Podle
  // něj se rozhoduje, jestli rychloposuv smí jít přímo — přídavek X/Z (polo.)
  // je v zadání právě proto, že odlitek MŮŽE být až u té čáry, takže přejezd
  // POD ní je na nadměrném kusu náraz (uživatel 20. 8. 2026: „udělej to, ať to
  // vyjede nad tu offsetovou čaru“). Syrový `rapidStock` zůstává pro všechno
  // ostatní — strop zdvihu, hloubka třísky u dokončování, EXIT-SPLIT — aby se
  // ty (na zbytek citlivé) věci nezměnily.
  let rapidStockPlan = null;
  let rapidFoot = null;
  let rapidFootSlim = null;
  let rapidStockCuts = 0;
  let stockLoop0Ref = null;   // syrová silueta odlitku — jen FALLBACK pro planLoopRef()
  let stockLoop0OffsetRef = null;   // silueta posunutá o Vůli X/Z (tečkovaná hranice v náhledu)
  try {
    const stockLoop0 = buildStockLoopRaw(prms, calc.stockPathSegments);
    if (stockLoop0) {
      stockLoop0Ref = stockLoop0;
      rapidStock = new StockModel([stockLoop0]);
      // PLNÝM obrysem se odebírá (noteCutPass), ZÚŽENÝM se testuje dotyk
      // (rapidHitsStock) — viz dělba u toolFootprintSlim v materialRemoval.js.
      rapidFoot = toolFootprint(prms);
      rapidFootSlim = toolFootprintSlim(prms);
      // Plánovací (vůlí-posunutá) silueta — sdílená implementace, viz
      // offsetStockLoop v materialRemoval.js.
      stockLoop0OffsetRef = offsetStockLoop(stockLoop0, prms);
      if (stockLoop0OffsetRef) rapidStockPlan = new StockModel([stockLoop0OffsetRef]);
    }
  } catch (err) {
    console.warn('CAM: dynamický model polotovaru pro rychloposuvy selhal:', err);
    rapidStock = null;
  }
  const rapidHitsStock = (x1, z1, x2, z2) => {
    if (!rapidStock) return false;
    try {
      const sweep = toolSweep(rapidFootSlim, [{ x: x1, z: z1 }, { x: x2, z: z2 }]);
      return Math.abs(polyArea(rapidStock.collide(sweep))) > 0.5;
    } catch { return false; }
  };
  // Totéž proti PLÁNOVACÍMU (vůlí-posunutému) zbytku. Používá se JEN
  // u čelního přejezdu v Z — tam uživatel viděl držák pod offsetovou čarou
  // (20. 8. 2026). Ostatní rozhodnutí (EXIT-SPLIT, výjezd posuvem, strop
  // zdvihu) zůstávají na syrovém zbytku: jsou na něj citlivé a přepnutí
  // všeho najednou přepsalo všech 24 fixtures.
  const rapidHitsPlan = (x1, z1, x2, z2) => {
    if (!rapidStockPlan) return false;
    try {
      const sweep = toolSweep(rapidFootSlim, [{ x: x1, z: z1 }, { x: x2, z: z2 }]);
      return Math.abs(polyArea(rapidStockPlan.collide(sweep))) > 0.5;
    } catch { return false; }
  };
  // ── Dva modely „kde je materiál" a jejich dělba (ÚKLID 8. 8. 2026) ──────
  // 1) PLÁNOVACÍ (pesimistický) obrys = vůlí-posunutá silueta `planLoopRef`.
  //    Přídavek X/Z (polotovar) je v zadání právě proto, že odlitek MŮŽE být
  //    větší — materiál až k té čáře tedy reálně existovat může a dráhy se
  //    musí plánovat proti ní. Syrový obrys se pro plánování IGNORUJE
  //    (dřív se rozhodovalo o vzduchu proti němu, ale vyjíždělo se na
  //    offsetovou čáru → neshoda prahů, kterou musely látat pojistky).
  //    Při nulových přídavcích obě čáry splývají → degenerovaný případ beze změny.
  // 2) DYNAMICKÝ ZBYTEK `rapidStock` — co už je odebráno (pořadí obrábění).
  // Syrový obrys zůstává jen tam, kde se ptáme „narazil jsem FYZICKY?"
  // (validateToolpath) nebo „co je vidět" (MaterialRemoval) — tedy mimo tento
  // soubor. `stockLoop0Ref` proto slouží už jen jako fallback, když offset
  // (Clipper) selže.
  //
  // `topXOnLoop` (max X smyčky na daném z) je sdílený v camMath.js.
  // Z-souřadnice, kde smyčka protíná hloubku `x` (přechody vzduch↔materiál na
  // této hloubce), v otevřeném intervalu (zLo, zHi).
  const crossZOnLoop = (loop, x, zLo, zHi) => {
    if (!loop) return [];
    const zs = new Set();
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i], b = loop[(i + 1) % n];
      if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
        const z = a.z + (b.z - a.z) * ((x - a.x) / (b.x - a.x));
        if (z > zLo + 1e-4 && z < zHi - 1e-4) zs.add(+z.toFixed(4));
      }
    }
    return [...zs];
  };
  // Horní hrana ZBYTKOVÉHO polotovaru — povrch, který nástroj při radiálním
  // sjezdu (klesající X) potká první. Mění se řezáním (pořadí obrábění).
  // Slouží k zastavení rychloposuvu na povrchu, když nájezdová vůle je
  // „vzduch" jen vůči kontuře, ne vůči plnému obalu odlitku (descendTo).
  const residualTopXAtZ = (z) => {
    if (!rapidStock) return null;
    let top = null;
    for (const loop of rapidStock.loops) {
      const t = topXOnLoop(loop, z);
      if (t !== null && (top === null || t > top)) top = t;
    }
    return top;
  };
  // Totéž nad PLÁNOVACÍM (vůlí-posunutým) zbytkem. Strop zdvihu se musí počítat
  // z něj: `travelBlocked` testuje i plánovací model, takže lokální strop
  // spočtený jen ze SYROVÉHO zbytku zůstal pod ním a přejezd padal až na
  // globální bezpečné X (nález uživatele 20. 8. 2026: „N5680 G0 X30.523 —
  // vyjíždí někde do bezpečné polohy v X, i když by to mělo brát normálně
  // nad polotovarem").
  const planResidualTopXAtZ = (z) => {
    if (!rapidStockPlan) return null;
    let top = null;
    for (const loop of rapidStockPlan.loops) {
      const t = topXOnLoop(loop, z);
      if (t !== null && (top === null || t > top)) top = t;
    }
    return top;
  };
  // Kde musí SJEZD zastavit rychloposuv. Dvě meze, bere se vyšší:
  //   syrový zbytek + Vůle + R   (dosavadní pravidlo)
  //   plánovací zbytek + R + gap  (odstup od offsetové čáry — exaktní i na šikmé
  //                                stěně, kde je čára v X výš než povrch + Vůle)
  const rapidStopXAt = (z) => {
    const raw = residualTopXAtZ(z);
    const plan = planResidualTopXAtZ(z);
    let need = null;
    if (raw !== null) need = raw + rapidStopX;
    if (plan !== null) {
      const cand = quantizeUp(plan + tipRGc + feedGapGc);
      if (need === null || cand > need) need = cand;
    }
    return need;
  };
  // Vyšší z obou stropů — tak vysoko musí přejezd, aby prošel proti obojmu.
  const travelTopXAtZ = (z) => {
    const a = residualTopXAtZ(z), b = planResidualTopXAtZ(z);
    if (a === null) return b;
    if (b === null) return a;
    return Math.max(a, b);
  };
  // Plánovací obrys: vůlí-posunutá silueta („tečkovaná" čára z náhledu).
  const planLoopRef = () => stockLoop0OffsetRef || stockLoop0Ref;
  // Povrch plánovacího obrysu na axiální z. Na rozdíl od residualTopXAtZ se
  // řezáním NEMĚNÍ, takže označuje jen TRVALÝ vzduch (drážky, nižší místa
  // siluety), ne už obrobené oblasti. Slouží k rozsekání řezu na
  // rapid(vzduch)/posuv(materiál) i k dojezdům na hranu materiálu.
  const planTopXAtZ = (z) => topXOnLoop(planLoopRef(), z);
  // Přechody vzduch↔materiál na hloubce x podle plánovacího obrysu.
  const planCrossZ = (x, zLo, zHi) => crossZOnLoop(planLoopRef(), x, zLo, zHi);
  // Konec řezu do vzduchu: kam až dojet POSUVEM, než se odskočí. Cíl je
  // VŮLÍ-POSUNUTÁ silueta (tečkovaná čára v náhledu) — tam podle náhledu končí
  // materiál včetně přídavku, tam má dráha vyjet. Dřívější „zEnd − Vůle Z"
  // měřilo přídavek jen podél OSY Z, takže na šikmé/obloukové hraně polotovaru
  // (posun je KOLMO k hranici) dojezd systematicky nedosáhl na čáru — reálný
  // nález na díle uživatele: na oblouku R18 chybělo 0,6 mm, dráha viditelně
  // stála před tečkovanou čarou.
  // Vrací null, když silueta hloubku x pod zFrom v rozumném okně neprotne
  // (hranice skoro rovnoběžná s osou Z → „výjezd v Z" nedává smysl) —
  // volající pak zůstane u odsazení podél osy.
  // `zDir` = směr řezu (−1 zprava doleva = standard, +1 zleva doprava
  // = druhá strana); hledá se první hrana VE SMĚRU jízdy za zFrom.
  const offsetExitZ = (x, zFrom, zDir = -1) => {
    if (!stockLoop0OffsetRef) return null;
    // Okno hledání: přídavek je KOLMÁ vzdálenost, podél Z ho hrana natáhne
    // 1/sin(sklon). Strop 4× přídavek pokryje hrany až ~15° od osy Z.
    const zWin = zFrom + zDir * 4 * Math.max(rapidClrGc, rapidClrZGc);
    // Vlastní průchod smyčkou (ne crossZOnLoop): tady se hledá NEJBLIŽŠÍ hrana
    // ve směru jízdy a porovnává se na 1e-6 — zaokrouhlení crossZOnLoop na
    // 0,1 µm by u hrany ležící přesně na zFrom rozhodlo jinak.
    let best = null;
    const n = stockLoop0OffsetRef.length;
    for (let i = 0; i < n; i++) {
      const a = stockLoop0OffsetRef[i], b = stockLoop0OffsetRef[(i + 1) % n];
      if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
        const z = a.z + (b.z - a.z) * ((x - a.x) / (b.x - a.x));
        if (zDir * (z - zFrom) > 1e-6 && zDir * (zWin - z) > 0
          && (best === null || zDir * (z - best) < 0)) best = z;
      }
    }
    return best;
  };
  // Ořez „bez schodků" dojezdu na HRANU MATERIÁLU: sledování kontury nemá kudy
  // pokračovat tam, kde nad nástrojem už polotovar není. Úseky celé ve vzduchu
  // se zahodí, ten, na kterém materiál končí, se zkrátí (u úseček přesně
  // interpolací, oblouk se nechá celý — leží těsně u dílu a krátí se stejně
  // jako dřív až navazujícím dojezdem na offsetovou čáru). Bez toho jel dojezd
  // po kontuře desítky mm prázdnem až na konec okna (reálný nález na díle
  // uživatele — za S17 dvě dráhy pokračovaly ve vzduchu).
  //
  // „Hrana materiálu" = PLÁNOVACÍ obrys (vůlí-posunutá silueta, tečkovaná čára
  // z náhledu), ne holá kůra odlitku: vůle je PŘÍDAVEK, který se má taky
  // obrobit, a všechny ostatní výjezdy (offsetExitZ, airSplitAxial,
  // findRampOutTarget) končí právě na ní. Se syrovou siluetou končil dojezd
  // o vůli dřív a proti sousedním drahám viditelně nedotažený (reálný nález
  // na díle uživatele).
  const trimLeadOutToStock = (segs, tipR) => {
    if (!segs || segs.length === 0 || !planLoopRef()) return segs;
    const solid = (x, z) => {
      const ct = planTopXAtZ(z);
      return ct !== null && (x - tipR) <= ct + 1e-4;
    };
    const out = [];
    for (const seg of segs) {
      const endSolid = solid(seg.x2, seg.z2);
      if (endSolid) { out.push(seg); continue; }
      // Konec je ve vzduchu: začíná úsek v materiálu? Pak ho zkrátit.
      if (!solid(seg.x1, seg.z1)) break;            // celý ve vzduchu — sem už dojezd nepatří
      if (seg.type !== 'line') { out.push(seg); break; }
      let lo = 0, hi = 1;                            // lo = v materiálu, hi = ve vzduchu
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        if (solid(seg.x1 + (seg.x2 - seg.x1) * t, seg.z1 + (seg.z2 - seg.z1) * t)) lo = t; else hi = t;
      }
      if (lo > 1e-3) out.push({ ...seg, x2: seg.x1 + (seg.x2 - seg.x1) * lo, z2: seg.z1 + (seg.z2 - seg.z1) * lo });
      break;
    }
    return out;
  };
  // Rozsekání AXIÁLNÍHO řezu (konstantní hloubka x) na rapid(vzduch)/posuv
  // (materiál) podle PLÁNOVACÍHO OBRYSU. `x` = programovaná hloubka (práh je
  // dosah STOPY nástroje, tj. x − rádius nosu — nos sahá o R hlouběji, takže
  // řeže i když je střed kousek nad povrchem), `dir` = směr jízdy v Z. Vrací
  // `[{ kind:'G0'|'G1', z }]` — vždy aspoň jeden prvek (celý úsek jedním
  // druhem pohybu), takže bez drážek vyjde přesně původní jediný `G1`.
  // Rychloposuvem se bere jen VÝRAZNÝ vzduch ≥ 0,5 mm — drobné crossingy
  // z tesselovaných oblouků siluety se neřežou na kousíčky.
  const airSplitAxial = (x, zFrom, zTo, dir) => {
    const xReach = x - tipRGc;
    const zLo = Math.min(zFrom, zTo), zHi = Math.max(zFrom, zTo);
    const cross = planCrossZ(xReach, zLo, zHi).filter(z => z > zLo + 1e-6 && z < zHi - 1e-6);
    let pts = [zFrom, ...cross, zTo].sort((p, q) => dir * (p - q));
    pts = pts.filter((z, i) => i === 0 || Math.abs(z - pts[i - 1]) > 1e-3);
    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      const ct = planTopXAtZ((pts[i - 1] + pts[i]) / 2);
      const air = !(ct !== null && xReach <= ct + 1e-4) && Math.abs(pts[i] - pts[i - 1]) >= 0.5;
      const kind = air ? 'G0' : 'G1';
      if (segs.length && segs[segs.length - 1].kind === kind) segs[segs.length - 1].z = pts[i];
      else segs.push({ kind, z: pts[i] });
    }
    // Přechod řez→vzduch je VÝJEZD Z MATERIÁLU — a ten podle konvence celého
    // emitoru končí až na VŮLÍ-POSUNUTÉ siluetě („tečkovaná" čára z náhledu),
    // ne na holé kůře odlitku (stejně jako konec průchodu přes offsetExitZ
    // níž). Bez toho by posuv končil o Vůli dřív a mezi ním a tečkovanou
    // čarou by zůstal proužek (hlídá tests/cam-leadout-step).
    // Prodloužení smí dojet AŽ NA konec navazujícího vzduchu (>=, ne >):
    // když průchod končí přesně na offsetové čáře (doběh dorampování ořezaný
    // na konec souvislého materiálu), je poslední vzduch přesně ten kousek
    // mezi kůrou a tečkovanou čarou — s ostrou nerovností by se prodloužení
    // zahodilo a řez by skončil o vůli dřív.
    for (let i = 0; i + 1 < segs.length; i++) {
      if (segs[i].kind !== 'G1' || segs[i + 1].kind !== 'G0') continue;
      const zOff = offsetExitZ(x, segs[i].z, dir);
      if (zOff !== null && dir * (zOff - segs[i].z) > 1e-6 && dir * (segs[i + 1].z - zOff) >= -1e-6) segs[i].z = zOff;
    }
    // Prodloužení mohlo navazující vzduch smrsknout na nulu — takový úsek
    // není pohyb, jen řádek navíc.
    return segs.filter((s, i) => Math.abs(s.z - (i === 0 ? zFrom : segs[i - 1].z)) > 1e-6);
  };
  const noteCutPts = (pts) => {
    if (!rapidStock || pts.length < 2) return;
    try {
      const cut = toolSweep(rapidFoot, pts);
      rapidStock.cut(cut);
      // Plánovací model se ubírá TÍMŽ ŘEZEM — jinak by zůstal stát celý
      // a po prvních průchodech by zablokoval každý přejezd.
      if (rapidStockPlan) rapidStockPlan.cut(cut);
      if (++rapidStockCuts % 24 === 0) {
        rapidStock.loops = polySimplify(rapidStock.loops, 0.002);
        if (rapidStockPlan) rapidStockPlan.loops = polySimplify(rapidStockPlan.loops, 0.002);
      }
    } catch { /* model je jen pro rychloposuvy — pokračovat bez řezu */ }
  };
  // Jeden SKUTEČNĚ VYDANÝ řezný pohyb (z aktuální polohy do cílové).
  // Volá se hned u emise, takže model dostane přesně to, co se pojede —
  // po ořezu i po rozsekání na rapid/posuv. Oblouk se registruje tětivou,
  // stejně jako ho registroval plán.
  const noteCutMove = (x1, z1, x2, z2) => {
    if (!rapidStock) return;
    if (Math.hypot(x2 - x1, z2 - z1) < 1e-6) return;
    noteCutPts([{ x: x1, z: z1 }, { x: x2, z: z2 }]);
  };
  // Oblouk se do modelu NESMÍ zapsat tětivou. Tětiva leží u vypuklého tvaru
  // hlouběji v materiálu než skutečná dráha, takže model „odebere" pásek
  // o výšce sagitty, který ve skutečnosti stojí — a to je nebezpečný směr
  // (podle modelu se pouští rychloposuvy). Změřeno na fixtures: právě tohle
  // dělalo 0,30–0,47 mm rozdílu proti realitě, ne domnělý přídavek.
  // Vzorkuje se po ~0,1 mm tětivy; bez středu/úhlů (cizí producent segmentu)
  // zůstane tětiva jako dřív.
  const noteCutArc = (seg, fx, fz) => {
    if (!rapidStock) return;
    if (!Number.isFinite(seg.cx) || !Number.isFinite(seg.cz) || !(seg.r > 0)
      || !Number.isFinite(seg.startAngle) || !Number.isFinite(seg.endAngle)) {
      noteCutMove(fx, fz, seg.x2, seg.z2);
      return;
    }
    const a0 = seg.startAngle;
    let a1 = seg.endAngle;
    if (seg.dir === 'G2' && a1 > a0) a1 -= 2 * Math.PI;
    if (seg.dir === 'G3' && a1 < a0) a1 += 2 * Math.PI;
    const n = Math.max(2, Math.min(64, Math.ceil(Math.abs(a1 - a0) * seg.r / 0.1)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
    }
    noteCutPts(pts);
  };
  // Odebere z modelu materiál TĚLA průchodu (vjezd/rampa → dno).
  // Rychloposuvy a odskoky se nezapočítávají — falešný „řez" by model
  // podřezal a pustil rychloposuv skutečným materiálem.
  //
  // TRASOVANÉ NÁJEZDY A DOJEZDY (`contourLeadIn`/`contourLeadOut`) SE SEM
  // NEPOČÍTAJÍ (12. 8. 2026). Plánovaná podoba leadu není ta vydaná: před
  // emisí se ještě ořezává na hranu materiálu (`trimLeadOutToStock`,
  // `holderTrimLeadIn/Out`) a rozsekává na rychloposuv/posuv
  // (`airSplitAxial`), takže model „odebíral" i to, co se nikdy neprojelo.
  // Změřeno na fixtures: povrch v modelu ležel až o 0,30–0,47 mm níž, než
  // po hrubování reálně zůstal — a to je NEBEZPEČNÝ směr, protože podle
  // tohohle modelu se pouští rychloposuvy. Bez leadů spadla ta odchylka
  // pod 0,01 mm. Leady se proto registrují až v místě emise přes
  // `noteCutMove` (viz emitLeadOutLine a smyčky leadIn/leadOut níž).
  // Skutečná hloubka, na které se tělo průchodu projelo — liší se od
  // `pass.x` jen tam, kde trasovaný nájezd skončí nad vrstvou a držák
  // nepustí sjezd na ni (viz „kapsa po kontuře" v emisi níž). Model zbytku
  // pak MUSÍ odečíst tu skutečnou, ne plánovanou.
  const emitBodyX = new Map();
  let holderShallowBodies = 0;
  // Obrys držáku zeštíhlený o 0,05 mm — týž, jakým měří validátor (a blok
  // dokončování níž). Lazy, protože bez „Hlídat geometrii" se nepoužije.
  let holderShrunkRef;
  const holderShrunkLoop = () => {
    if (holderShrunkRef === undefined) {
      const hl = prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__
        ? holderWorldLoop(prms, roughingKey(S) === 'backside') : null;
      holderShrunkRef = hl ? (polyOffset([hl], -0.05)[0] || hl) : null;
    }
    return holderShrunkRef;
  };
  // Narazí držák do zbytku, když nástroj projede úsek `pts`? (Stejný práh
  // 0,5 mm² jako u `rapidHitsStock` i ve validátoru.)
  const holderHitsStock = (pts) => {
    const h = holderShrunkLoop();
    if (!h || !rapidStock) return false;
    try {
      return Math.abs(polyArea(rapidStock.collide(toolSweep(h, pts)))) > 0.5;
    } catch { return false; }
  };
  // Táž otázka pro PŘEJEZD (dvěma body) — stejná signatura jako
  // `rapidHitsStock`, aby se daly v podmínce střídat.
  //
  // Proč to `rapidHitsStock` nestačí: ten testuje jen STOPU DESTIČKY. Držák
  // je ale v ose Z tlustý (±šířka/2) a radiálně sahá stovky mm ven, takže
  // přejezd, kterým špička projede vzduchem vyříznuté kapsy, může držákem
  // orat sousední stojící materiál. Validátor (`validateToolpath`) to hlásí
  // jako ⛔ „Rychloposuv materiálem" už od 16. 7. 2026, ale emise se řídila
  // pouze destičkou — aplikace tedy uměla kolizi NAJÍT, ale generátor ji
  // neuměl OBEJÍT. Naměřeno na holder-region-roughing: destička 0,0 mm²,
  // držák 135,3 mm² na dvou po sobě jdoucích G0.
  //
  // POZOR na záměnu s tím, co bylo 18. 7. 2026 zamítnuto: tehdy šlo o
  // PARALELNÍ detekci nad `passCutPts` (předemisní geometrie průchodu), která
  // se rozcházela se skutečně vydaným simPath → false positives. Tohle je
  // opak: ptáme se na KONKRÉTNÍ PRÁVĚ EMITOVANÝ pohyb proti živému
  // `rapidStock`, tedy na týž vstup, jaký uvidí validátor.
  const holderHitsRapid = (x1, z1, x2, z2) =>
    holderHitsStock([{ x: x1, z: z1 }, { x: x2, z: z2 }]);
  // Týž obrys, ale BEZ PROSTORU DESTIČKY — pro ŘEZNÉ pohyby. U hrotu se
  // držák s destičkou překrývá, jenže materiál, který tam je, ŘEŽE DESTIČKA;
  // hlásit ho jako náraz držáku je falešný poplach (táž dělba jako
  // `holderCutShrunk` ve validátoru). U čelního odskoku je to nutnost, ne
  // kosmetika: řezné pohyby průchodu se do modelu zapisují až `noteCutPass`
  // AŽ PO odskoku, takže bez odečtení destičky by test narazil do drážky,
  // kterou týž průchod právě vyřízl.
  let holderCutShrunkRef;
  const holderCutShrunkLoop = () => {
    if (holderCutShrunkRef === undefined) {
      const hl = prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__
        ? holderWorldLoop(prms, roughingKey(S) === 'backside') : null;
      let cut = hl;
      if (hl) {
        const ins = toolFootprintVisual(prms);
        if (ins && ins.length >= 3) {
          try { cut = polyDifference([hl], [ins])[0] || hl; } catch { cut = hl; }
        }
      }
      holderCutShrunkRef = cut ? (polyOffset([cut], -0.05)[0] || cut) : null;
    }
    return holderCutShrunkRef;
  };
  // Kolik PLÁNOVACÍHO (vůlí-posunutého) zbytku drží držák pod sebou, když
  // špička stojí na (x, z)? Vrací plochu [mm²], null když se ptát nejde.
  //
  // ABSOLUTNÍ číslo z tohohle modelu NEMÁ SMYSL srovnávat s nulou. Plánovací
  // zbytek se ubírá `toolFootprint` (stadion pro plánování) po ÚSEČCE
  // průchodu, kdežto skutečně řeže celá destička po skutečné dráze — mezi
  // vrstvami tak v modelu zůstávají fantomové zbytky, kterých se držák
  // „dotýká" úplně běžně (zkusmo: práh 0,02 mm² proti nule překlopil na
  // svislý výjezd VŠECHNY čelní odskoky na pěti fixtures).
  //
  // Použitelný je ROZDÍL dvou poloh téhož obrysu nad týmž modelem: fantom je
  // v obou stejný a vykrátí se.
  const holderPlanAreaAt = (x, z) => {
    const h = holderCutShrunkLoop();
    if (!h || !rapidStockPlan) return null;
    try {
      return Math.abs(polyArea(rapidStockPlan.collide([h.map(p => ({ x: x + p.x, z: z + p.z }))])));
    } catch { return null; }
  };
  const noteCutPass = (pass) => {
    if (!rapidStock) return;
    const pts = [];
    const push = (x, z) => {
      const l = pts[pts.length - 1];
      if (Number.isFinite(x) && Number.isFinite(z)
        && (!l || Math.hypot(l.x - x, l.z - z) > 1e-6)) pts.push({ x, z });
    };
    if (pass.type === 'face') {
      push(pass.xStart, pass.z);
      push(pass.xEnd, pass.z);
    } else {
      const bodyX = emitBodyX.get(pass) ?? pass.x;
      // PRŮCHOD S NULOVÝM DNEM (zStart == zEnd) NEMÁ CO PŘEDPOVÍDAT. Zápis
      // z PLÁNU tu má smysl jen u průchodu, který opravdu jede rampu a za ní
      // dno: model pak zná odebraný pás dřív, než se rozhodne o navazujícím
      // rychloposuvu. U degenerovaného průchodu (dno nulové šířky — vzniká
      // dobráním zbytku menšího než ap) ale žádné dno není a EMISE k němu
      // najíždí úplně jinudy, než kudy vede plánovaná rampa: na `part-8`
      // plán tvrdil úsečku (20,12; 193,70) → (17,622; 184,37), kdežto program
      // přijel od Z 220 a zapíchl se radiálně až dole. Model tím „odebral"
      // klín, který ve skutečnosti stojí — na Z 189 o 6,13 mm víc, než kolik
      // dráha ubrala (`tests/cam-residual-model`, mez 0,05 mm).
      //
      // Nic se tím neztrácí: skutečně projeté řezy si model zapisuje sám
      // (`noteCutMove`/`noteCutArc` u každého emitovaného pohybu), takže
      // degenerovaný průchod je pokrytý tou cestou.
      const noFloor = Math.abs(pass.zStart - pass.zEnd) < 1e-6;
      if (!noFloor) {
        if (pass.rampFeedFrom) {
          push(pass.rampFeedFrom.x, pass.rampFeedFrom.z);
        } else if (pass.ramp) {
          push(pass.ramp.x0, pass.ramp.z0);
        }
      }
      push(bodyX, pass.zStart);
      push(bodyX, pass.zEnd);
    }
    noteCutPts(pts);
  };
  const xDia = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
  // Max X offsetových segmentů na svislici Z (null = tam žádný segment neleží).
  const maxXOnSegsAt = (segs, z) => {
    let m = null;
    for (const s of segs) {
      if (!s || s.isDegenerate) continue;
      if (s.type === 'line') {
        const x = intersectVerticalLineSegment(z, s.p1, s.p2);
        if (x !== null && (m === null || x > m)) m = x;
      } else {
        for (const x of intersectVerticalLineArc(z, { x: s.cx, z: s.cz }, s.r)) {
          const a = Math.atan2(x - s.cx, z - s.cz);
          if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2') && (m === null || x > m)) m = x;
        }
      }
    }
    return m;
  };
  // Max X hrubovacího offsetu na svislici Z (pro kontrolu odskoku u stěny).
  const gcOffsetXAt = (z) => {
    return maxXOnSegsAt(calc.offsetPath || [], z);
  };
  const cur = { x: null, z: null };
  const setPos = (x, z) => { cur.x = x; cur.z = z; };
  // Jedna ÚSEČKA dojezdu „bez schodků". Šikmý úsek (mění se X = sledování
  // kontury) jde vždy posuvem. Čistě AXIÁLNÍ úsek (konstantní X = rovné
  // pokračování vrstvy) se rozseká na rychloposuv(vzduch)/posuv(materiál)
  // podle siluety odlitku — stejné pravidlo jako u těla průchodu
  // (`airSplitAxial` níž; definice až po planCrossZ, volá se ale jen
  // za běhu emise, takže na pořadí nezáleží).
  const emitLeadOutLine = (seg) => {
    const axial = Math.abs(seg.x2 - seg.x1) < 1e-6;
    const segs = axial ? airSplitAxial(seg.x2, seg.z1, seg.z2, Math.sign(seg.z2 - seg.z1) || 1) : null;
    // KONCOVÝ vzduch se nejezdí vůbec: dojezd končí na hraně materiálu
    // (vůlí-posunuté siluetě) a odtud rovnou odjíždí odskok — rychloposuv
    // „doprostřed vzduchu" těsně před odskokem je jen zbytečný řádek.
    if (segs) while (segs.length > 1 && segs[segs.length - 1].kind === 'G0') segs.pop();
    // Bez rozdělení (celý úsek jedním druhem pohybu) zůstává původní jediný
    // posuv na konec úsečky — i když by vyšel „vzduch": ořez celého úseku
    // řeší trimLeadOutToStock výš, ne tenhle rozklad.
    if (!segs || segs.length === 0 || (segs.length === 1 && segs[0].kind === 'G0')) {
      const fx = cur.x, fz = cur.z;
      simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
      noteCutMove(fx, fz, seg.x2, seg.z2);
      return;
    }
    for (const s of segs) {
      const fx = cur.x, fz = cur.z;
      simCounter += 1;
      addN(s.kind === 'G0'
        ? `G0 X${xDia(seg.x2)} Z${s.z.toFixed(3)}`
        : `G1 X${xDia(seg.x2)} Z${s.z.toFixed(3)} F${prms.feed}`, simCounter);
      setPos(seg.x2, s.z);
      // Rychloposuvem vzduchem se nic neodebírá — do modelu jde jen posuv.
      if (s.kind !== 'G0') noteCutMove(fx, fz, seg.x2, s.z);
    }
  };
  // Výchozí poloha = bezpečná poloha z úvodního G0 (programované souř.).
  setPos((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);
  // Sjezd v ose X na hloubku `tx` (na Z = tz) z výšky `fromX`. Rychloposuv
  // NIKDY nedojede až na materiál: buď narazí na zbytek (pak zastaví na jeho
  // povrchu + Vůle a zbytek dojede posuvem — radiální zápich), nebo se
  // s `touch` zastaví o Vůli nad cílem a poslední kousek dojede posuvem.
  // Nájezdová vůle je „vzduch" jen vůči KONTUŘE — odlitkový obal tam může být
  // ještě plný, takže rychloposuv na cílovou hloubku by vjel do materiálu
  // (na part-10-zapich ~13 mm² grazing). Práh `rapidHitsStock` je stejný jako
  // jinde → skin-grazing pod ním se nechytá (part-1..9 beze změny).
  // Polohu si volající nastaví sám (setPos).
  const emitDescendX = (fromX, tx, tz, touch) => {
    const emit = (txt) => { simCounter += 1; addN(txt, simCounter); };
    if (fromX - tx > 1e-6 && (rapidHitsStock(fromX, tz, tx, tz) || rapidHitsPlan(fromX, tz, tx, tz))) {
      const surf = rapidStopXAt(tz);
      if (surf !== null) {
        const floorX = Math.min(fromX, Math.max(tx, surf));
        if (fromX - floorX > 1e-6) emit(`G0 X${xDia(floorX)}`);
        if (floorX - tx > 1e-6) emit(`G1 X${xDia(tx)} F${prms.feed}`);
        return;
      }
    }
    if (touch && fromX - tx > 1e-6) {
      if (fromX - tx > rapidStopX + 1e-6) emit(`G0 X${xDia(tx + rapidStopX)}`);
      emit(`G1 X${xDia(tx)} F${prms.feed}`);
    } else if (Math.abs(fromX - tx) > 1e-6) {
      emit(`G0 X${xDia(tx)}`);
    }
  };
  // ZDVIH v ose X (radiálně ven) z `fromX` na `toX` na Z = `z` — ZRCADLO
  // `emitDescendX`. Svislý výjezd předpokládá nad nástrojem vzduch, jenže
  // u odlitku může vést stojící kůrou: materiál nad nástrojem se ještě
  // neobrobil (order-dependent). Když zdvih na zbytek naráží, jede se POSUVEM
  // až nad jeho povrch (+ vůle) a teprve zbytek rychloposuvem. Endpoint se
  // nemění — mění se jen JAK se k němu dojede.
  //
  // `rapidNote` = popiska čistě rychloposuvové varianty; volající, kteří ji
  // dosud nepsali, předají prázdnou (jinak by se přepsaly snapshoty jen kvůli
  // komentáři). `feedThroughStock=false` = zdvih nechat rychloposuvem i přes
  // zbytek (čelní přejezdy, kde je dotyk sousedního Z inherentní šířkou nosu).
  const emitLiftX = (fromX, toX, z, { feedThroughStock = true, rapidNote = '' } = {}) => {
    if (!(toX > fromX + 1e-6)) return;
    const emit = (txt) => { simCounter += 1; addN(txt, simCounter); };
    const surf = feedThroughStock && rapidStock && rapidHitsStock(fromX, z, toX, z)
      ? residualTopXAtZ(z) : null;
    if (surf !== null && surf > fromX + 1e-6) {
      const feedTop = Math.min(toX, surf + rapidStopX);
      emit(`G1 X${xDia(feedTop)} F${prms.feed}${note('', 'Výjezd materiálem posuvem')}`);
      if (toX > feedTop + 1e-6) emit(`G0 X${xDia(toX)}${rapidNote ? note('', rapidNote) : ''}`);
    } else if (surf !== null) {
      // Zbytek zdvih protíná, ale povrch na tomto Z je neznámý/pod nástrojem
      // → celý zdvih konzervativně posuvem (feed vzduchem je jen pomalý).
      emit(`G1 X${xDia(toX)} F${prms.feed}${note('', 'Výjezd materiálem posuvem')}`);
    } else {
      emit(`G0 X${xDia(toX)}${rapidNote ? note('', rapidNote) : ''}`);
    }
  };
  // touch = true: cíl leží na kontuře/materiálu — poslední úsek sjezdu
  // (Vůle nad polotovarem) se jede pracovním posuvem, ne rychloposuvem.
  // forceUp = vždy vyjet NAD polotovar, přejet v Z a teprve najet (nikdy
  // diagonála mezi dvěma body kontury). Dokončování ho zapíná pro přejezd
  // mezi nedosažitelnými „ostrovy": rychloposuv podél čela je sice offsetově
  // 0,8 mm nad plochou (segmentHitsPath ho nevidí jako kolizi), ale vede
  // šikmo přes hlídanou zónu — dráha tam nesmí (jen kontura↔polotovar).
  // feedThroughStock: povolit exit-split (výjezd skrz stojící zbytek POSUVEM).
  // Default true pro order-dependent podélné retrakty (výjezd z hluboké kapsy/
  // zápichu skrz odlitkovou kůru). Čelní PŘEJEZDY ho vypínají (false) — tam je
  // dotyk se sousedním neobrobeným Z INHERENTNÍ šířkou nosu, ne order-dependent
  // kolize, a konverze na posuv by jen nafoukla čas (viz Fáze 4, face-casting).
  const safeRapidTo = (tx, tz, touch = false, forceUp = false, feedThroughStock = true) => {
    const sameX = Math.abs(tx - cur.x) < 1e-6;
    const sameZ = Math.abs(tz - cur.z) < 1e-6;
    if (sameX && sameZ) { setPos(tx, tz); return; }
    const emit = (txt) => { simCounter += 1; addN(txt, simCounter); };
    // Sjezd v X na cíl: s touch zastaví rychloposuv o vůli výš a dojede G1.
    // Fáze 4: sjezd na hloubku v SOLIDNÍM odlitku posuvem, ne rychloposuvem
    // (sdíleno s přesunem v kapse — viz `emitDescendX` výš).
    const descendTo = (fromX) => emitDescendX(fromX, tx, tz, touch);
    // Rychloposuvová část cíle: s touch končí rapid o vůli výš (zbytek
    // sjede posuvem) — proti zbytkovému polotovaru se testuje jen ona.
    const rTx = touch ? tx + rapidStopX : tx;
    // KDE RYCHLOPOSUV OPRAVDU SKONČÍ. `rTx` je jen „cíl + vůle"; sjezd v X ale
    // dojede `descendTo` → `emitDescendX`, a ten při náraze na zbytek zastaví
    // rychloposuv už na povrchu (+ Stop rychlop. před čarou) a zbytek dojede
    // POSUVEM. Guard, který testoval `rTx`, se tak ptal na bod, kam se nikdy
    // nejede — a kvůli „kolizi" v něm poslal nástroj na zbytečnou cestu nad
    // konturu a hned zpátky dolů.
    // Nález uživatele 27. 8. 2026 (`N2340 G0 X68.478 ; Výjezd nad konturu`):
    // vydaný rychloposuv končí na X 21,150 a je čistý (0,00 mm² proti oběma
    // obrysům), kdežto testovaný bod X 18,345 hlásil 1,27 mm².
    const surfStop = (cur.x - tx > 1e-6) ? rapidStopXAt(tz) : null;
    const rTxReal = surfStop === null ? rTx : Math.min(cur.x, Math.max(rTx, surfStop));
    if (forceUp || segmentHitsPath({ x: cur.x, z: cur.z }, { x: tx, z: tz }, rapidBlockers)
        // DESTIČKA: stačí testovat rychloposuvovou část — zbytek dojede
        // `descendTo` posuvem. DRŽÁK: testuje se CELÝ sjezd až na `tx`, protože
        // `emitDescendX` držák neřeší vůbec; bez toho zmizel zdvih, který na
        // `part-8` s náhradním držákem opravdu chránil (56,6 mm² rychloposuvu
        // + 121,9 mm² držáku v materiálu, změřeno cam_sweep).
        || rapidHitsStock(cur.x, cur.z, rTxReal, tz)
        || holderHitsRapid(cur.x, cur.z, tx, tz)) {
      // JAK VYSOKO. `rapidTopX` je vrch CELÉHO polotovaru, takže zdvih
      // „Výjezd nad konturu“ jezdil pokaydé až nad nejvyšší místo dílu, i když
      // přejezd v Z potřeboval překonat jen nízký schod (nález uživatele
      // 27. 8. 2026: „skoro pořád to vyjíždí až nahoru, i když nemusí“).
      // Stejný vzor jako u čelní strategie níž: navzorkovat strop podle
      // `travelTopXAtZ` PO CELÉM rozpětí přejezdu, zvednout jen tam — a
      // výsledek OVĚŘIT týmiž predikáty (destička, plánovací obrys, držák).
      // Když nižší zdvih neprojde, platí dál vrch polotovaru.
      const capUpX = Math.max(rapidTopX + rapidStopX, cur.x, tx);
      let xUp = capUpX;
      if (Math.abs(tz - cur.z) > 1e-6) {
        let top = null;
        const nTop = 24;
        for (let i = 0; i <= nTop; i++) {
          const t = travelTopXAtZ(cur.z + (tz - cur.z) * (i / nTop));
          if (t !== null && (top === null || t > top)) top = t;
        }
        if (top !== null) {
          // KVANTIZACE na 0,01 mm: `top` pochází z navzorkované offsetové smyčky,
          // a při zrcadlení (hrubování zleva) padnou vzorky na zrcadlená Z → výška
          // vyšla o 1 µm jinak a parita zrcadlení se rozesšla (X46.170 × X46.169).
          const cand = Math.min(capUpX, Math.max(cur.x, tx, quantizeUp(top + rapidStopX)));
          if (cand < capUpX - 1e-6
              && !segmentHitsPath({ x: cand, z: cur.z }, { x: cand, z: tz }, rapidBlockers)
              && !rapidHitsStock(cand, cur.z, cand, tz)
              && !holderHitsRapid(cand, cur.z, cand, tz)) xUp = cand;
        }
      }
      // Diagnostický seam (guarded, v produkci no-op — stejný vzor jako
      // `__REGION_LOG__`): svislý zdvih „Výjezd nad konturu" v X předpokládá nad
      // nástrojem vzduch, ale u odlitku (kůra nad zápichem / sousední neobrobené
      // Z u čela) může vést stojícím materiálem. Nastav `globalThis.__RAPID_LIFT
      // _LOG__ = []` a spusť pipeline v IZOLOVANÉM procesu (per fixture — singleton
      // S kontaminuje!) → plocha každého zdvihu skrz `rapidStock`. Změřené baseliny
      // a metoda: docs/geometry-libs-migration.md (Fáze 4). part-10 ~16 mm² =
      // order-dependent cíl budoucího plánovače, face-casting ~267 = inherentní.
      if (globalThis.__RAPID_LIFT_LOG__ && rapidStock && xUp > cur.x + 1e-6) {
        try {
          const sweep = toolSweep(rapidFootSlim, [{ x: cur.x, z: cur.z }, { x: xUp, z: cur.z }]);
          const a = Math.abs(polyArea(rapidStock.collide(sweep)));
          if (a > 0.3) globalThis.__RAPID_LIFT_LOG__.push({ fromX: +cur.x.toFixed(2), toX: +xUp.toFixed(2), z: +cur.z.toFixed(2), area: +a.toFixed(1) });
        } catch { /* seam je jen pro měření — chybu spolknout */ }
      }
      // Fáze 4 — exit-split (zrcadlo `descendTo`): svislý zdvih „Výjezd nad
      // konturu" (radiálně ven) předpokládá nad nástrojem vzduch, ale u odlitku
      // může vést stojící kůrou nad zápichem (order-dependent — materiál nad
      // nástrojem se ještě neobrobil; viz seam výše). Když zdvih reálně naráží na
      // zbytek (STEJNÝ práh `rapidHitsStock` jako descendTo → skin-grazing pod
      // prahem se nechytá, cylindry/part-1..9 bez konfliktu beze změny), vyjeď
      // POSUVEM až nad povrch zbytku (+ vůle), teprve pak zbytek rychloposuvem
      // vzduchem. Endpoint (xUp) i následný přejezd v Z beze změny — mění se jen
      // JAK se k xUp dojede (posuv místo rapidu skrz materiál).
      emitLiftX(cur.x, xUp, cur.z, { feedThroughStock, rapidNote: 'Výjezd nad konturu' });
      if (Math.abs(tz - cur.z) > 1e-6) emit(`G0 Z${tz.toFixed(3)}`);
      // Fáze 4: čistě-Z přejezd, který se musel kvůli materiálu zvednout, se
      // NESMÍ sjet zpět na původní X — to X je přes tento Z právě to nebezpečné
      // (proto zvednutí), sjezd zpět by projel stojícím materiálem (odlitek za
      // zápichem) a hned by ho další nájezd zase zvedl. Nástroj zůstane nahoře;
      // navazující přejezd sjede rovnou na skutečnou hloubku (bod „nikdy
      // nejezdit dolů do materiálu, když se má jen přejet v Z“).
      if (sameX && xUp > tx + 1e-6) { setPos(xUp, tz); return; }
      descendTo(xUp);
    } else if (sameX) {
      emit(`G0 Z${tz.toFixed(3)}`);
    } else if (sameZ) {
      descendTo(cur.x);
    } else if (touch && cur.x - tx > 1e-6) {
      // Diagonální sjezd k materiálu: rychloposuvem jen na vůli nad cíl.
      // NEJDŘÍV Z, PAK X. Diagonála je bezpečná jen podle testu ÚSEČKY
      // (rapidHitsStock/holderHitsRapid výš), jenže mezi hloubkami umí projet
      // polotovarem — nález uživatele 21. 8. 2026 na `G0 X19.543 Z175.282`
      // („jede zešikma na další vrstvu a protne polotovar").
      // Rozdělení je VŽDYCKY bezpečnější, ne jen jiné: přejezd v Z se udělá
      // na PŮVODNÍ, tedy větší hloubce, takže leží celý nad diagonálou, a
      // teprve pak se sjíždí svisle na cílovém Z.
      if (cur.x - tx > rapidStopX + 1e-6) {
        emit(`G0 Z${tz.toFixed(3)}`);
        emit(`G0 X${xDia(tx + rapidStopX)}`);
        emit(`G1 X${xDia(tx)} F${prms.feed}`);
      } else {
        // ZBYTEK V X je kratší než vůle → ten opravdu patří posuvu. PŘEJEZD
        // V Z ale ne: „zbytek" se měří jen v X a v Z může jít o milimetry,
        // takže se celá diagonála vydávala pracovním posuvem. Reálný nález
        // uživatele 1. 9. 2026: `N3520 G1 X16.925 Z83.432 F0.25` — 1,79 mm
        // sjezdu v X (těsně pod vůlí 1,8) a k tomu 5,6 mm cesty v Z, celé
        // posuvem 0,25 mm/ot. a vzhledem k směru „dozadu" to na plátně
        // vypadá jako řez.
        // Rozdělení je i tady BEZPEČNĚJŠÍ, ne jen jiné (týž argument jako ve
        // větvi nad ní): přejezd v Z se udělá na PŮVODNÍ, tedy větší hloubce,
        // takže leží celý nad diagonálou, kterou guard výš prověřil.
        if (Math.abs(tz - cur.z) > 1e-6) emit(`G0 Z${tz.toFixed(3)}`);
        emit(`G1 X${xDia(tx)} F${prms.feed}`);
      }
    } else if (cur.x - tx > 1e-6) {
      // Čistý rychloposuv DO menšího průměru — táž úvaha: napřed přejet v Z
      // nahoře, pak teprve sjet.
      emit(`G0 Z${tz.toFixed(3)}`);
      emit(`G0 X${xDia(tx)}`);
    } else {
      // Ven z materiálu: opačné pořadí — nejdřív se zvednout, pak přejet.
      emit(`G0 X${xDia(tx)}`);
      emit(`G0 Z${tz.toFixed(3)}`);
    }
    setPos(tx, tz);
  };

  // Emise HRUBOVÁNÍ — celá operace v ops/roughEmit.js. `E` je sdílené
  // emisní prostředí; z něj se vrací jen to, co musí přetéct do dokončování.
  const _E = {
    calc, prms, addCmt, addN, note, arcR, flipArc, xDia,
    cur, setPos, clipZGc, clipFaceRetractZ, safeRapidTo,
    emitDescendX, emitBodyX, emitLiftX, emitLeadOutLine, airSplitAxial,
    offsetExitZ, gcOffsetXAt, planTopXAtZ, travelTopXAtZ, trimLeadOutToStock,
    rapidStock, rapidBlockers, rapidHitsStock, rapidHitsPlan, rapidTopX,
    rapidStopX, rapidStopZ, rapidClrZGc,
    holderHitsStock, holderPlanAreaAt,
    noteCutMove, noteCutArc, noteCutPass,
    entryAngleDegGc, stepGc, tipRGc, rDist, rDistZ,
    simCounter, holderShallowBodies,
  };
  ({ simCounter, holderShallowBodies } = emitRoughing(_E));

  // Emise DOKONČOVÁNÍ — celá operace v ops/finishEmit.js.
  emitFinish({
    S, calc, prms, addCmt, addN, note, arcR, flipArc, xDia, clipZGc,
    safeRapidTo, setPos, cur, rapidStock, rapidFoot, residualTopXAtZ,
    maxXOnSegsAt, entryRadGc, simCounter,
  });

  buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
  addCmt('--- KONTURA (Pro referenci) ---');
  S.contourPoints.forEach(p => {
    const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
    let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
    if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
    addCmt(line);
  });
  // Vrstva, na kterou trasovaný nájezd nedojel a držák nepustil sjezd na ni,
  // se projede mělcéji — uživatel se to musí dozvědět (tiché zahazování
  // hloubek už jednou stálo dlouhé hledání, viz docs/geometry-libs-migration).
  if (holderShallowBodies > 0 && S.genNotes) {
    S.genNotes.push({ type: 'warning', msg: `Hlídání geometrie (držák): ${holderShallowBodies} průchod(ů) po kontuře zůstal(y) na hloubce nájezdu — sjezd na plnou hloubku vrstvy by zavezl držák do materiálu. Ten zbytek patří jinému upnutí/nástroji.` });
  }
  // Diagnostický seam (v produkci no-op, vzor `__REGION_LOG__`): model
  // zbytkového polotovaru, podle kterého se rozhodovaly rychloposuvy.
  // Test `cam-residual-model` ho porovnává s reálně projetou dráhou —
  // rozejít se smějí jen tam, kde je to změřené a přišpendlené.
  if (globalThis.__RAPID_STOCK_DUMP__ && rapidStock) {
    globalThis.__RAPID_STOCK_DUMP__.push(rapidStock.loops.map(l => l.map(q => ({ x: q.x, z: q.z }))));
  }
  // ── POJISTKA: program bez JEDINÉHO řezného pohybu ─────────────────────
  // Hlášení výš mluví o „N vynechaných úsecích", ale že jich bylo VŠECHNO
  // a na stroj by odjel program, který nic neobrobí, z nich poznat nejde:
  // hlavička, `--- DOKONCOVANI ---` i M30 se vypíšou úplně stejně.
  // Reálný nález 26. 8. 2026: „jen dokončení" (Hot.) nad NEOBROBENÝM odlitkem
  // vynechá všech 17 dokončovacích úseků (stojí tam víc materiálu než hloubka
  // třísky), takže vznikne prázdný program — a uživatel to pozná až na stroji.
  if (S.genNotes) {
    const cutMoves = lines.filter(l => /^N\d+\s+G0?[123]\b/.test(l.text || '')).length;
    if (cutMoves === 0) {
      S.genNotes.push({ type: 'warning', msg: prms.finishOnly
        ? 'Program NEOBSAHUJE ŽÁDNÝ ŘEZNÝ POHYB — všechny dokončovací úseky vypadly (viz hlášení výš). „Jen dokončovací operace" počítá s tím, že díl je už vyhrubovaný: nastavte polotovar na tvar PO hrubování (nebo použijte ➕ Operace), jinak není co dokončovat.'
        : 'Program NEOBSAHUJE ŽÁDNÝ ŘEZNÝ POHYB — všechny dráhy vypadly (viz hlášení výš). Zkontrolujte nástroj, polotovar a rozsah obrábění.' });
    }
  }
  // ── SLUČOVÁNÍ NAVAZUJÍCÍCH PŘÍMÝCH BLOKŮ (cam/gcodeCollapse.js) ────
  // AŽ ÚPLNĚ NAKONEC: hlášení výš počítají řezné pohyby a některá se vážou
  // na pořadí etap emise — sloučení je post-úprava textu, která na dráze
  // nemění vůbec nic (nájezd + řez + doběh po jedné přímce = jeden blok).
  const merged = mergeCollinearMoves(lines);
  const renumbered = renumberGCodeLines(merged.map(l => l.text), 10, 10);
  return merged.map((l, i) => ({ ...l, text: renumbered[i] }));
}

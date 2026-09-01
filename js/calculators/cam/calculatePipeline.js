// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – výpočetní jádro (calculate pipeline)                     ║
// ╚══════════════════════════════════════════════════════════════╝
// Vytaženo z camSimulator.js (Fáze B). computeCalculation(S, lightOnly)
// je bývalé calculate() — čte/zapisuje sdílený stav S a vrací calc objekt.
// V camSimulator.js zůstává tenký wrapper calculate() → computeCalculation(S).

import { bridge } from '../../bridge.js';
import { _locateOnContour, dropTinyArcs, fitArcsToPolyline, getArcParams, getNormal, intersectSegAtZ, samplePartingEnvelope, segEndPoint, segStartPoint, syncArcEndpoints } from './camMath.js';
import { buildMachinableContour, extendOffsetStartToAxis, machinableRangeOf, foldContourToMachiningSide, getToolClearanceRange, normalizeContourDirection, removeContourSelfIntersections, resolveOuterProfile, resolvePointsToAbsolute, segInterferesWithTool, spliceBridgeSegments, trimAndRemoveLoops } from './contourBuild.js';
import { buildRawOffsets } from './toolOffset.js';
import { parseManualGCodeToPath } from './gcodeParser.js';
import { pathTimeSeconds } from './feedRates.js';
import { computeInterferenceGuides } from './interferenceGuides.js';
import { hIntersect, makePassHelpers, maxXAt } from './passHelpers.js';
import { planQuality, HOLDER_INTRUSION_TOL } from './ops/long/holderCheck.js';
import { ROUGHING_STRATEGIES } from './roughingStrategies.js';
import { partOffGeom } from './threadHelpers.js';
import { makeHolderClamp, makeFinishTipGuard } from './toolEnvelope.js';
import { buildFinishPath, clipFinishBand, finishPartingEnvelope } from './ops/finish.js';
import { mirrorCalcZ, mirrorParamsZ, mirrorPointChain, mirrorZLimits } from './zMirror.js';

// Typ (podélně/čelně) × směr (zprava/zleva) → klíč strategie v registru.
//   podélně + zprava → longitudinal     podélně + zleva → backside
//   čelně   + zprava → face             čelně   + zleva → face (zatím
//   bez zrcadlené varianty — TODO genFaceLeft).
export function roughingKey(S) {
  const type = S.params.roughingStrategy || 'longitudinal';
  const left = (S.params.roughingSide || 'right') === 'left';
  if (type === 'longitudinal') return left ? 'backside' : 'longitudinal';
  return 'face';
}

// Seznam operací hrubování (operations[] model). Dokud neexistuje
// persistentní S.operations (+ UI), odvodí se z typu × směru jako jediná
// operace — zachovává dosavadní chování.
export function getRoughingOperations(S) {
  if (Array.isArray(S.operations) && S.operations.length > 0) return S.operations;
  return [{ kind: roughingKey(S) }];
}

// ── CALCULATED DATA (memoized) ──
/**
 * Simulovaná dráha (+ čas a délka) SAMOTNÁ, bez plánování průchodů.
 *
 * Plán dráh na TEXTU programu nezávisí — `S.manualGCode` do něj vstupuje
 * jediným místem, a to až tady, na konci. Po přegenerování programu proto
 * stačí obnovit tuhle stopu a nechat plán stát (viz `fullUpdate()` v panelu).
 *
 * @param {object} S    stav simulátoru
 * @param {object} prms už vyřešené parametry (zrcadlené u „zleva“); dopočítají
 *                      se samy, když se nepředají
 */
export function computeSimPath(S, prms = null) {
  const p = prms || (roughingKey(S) === 'backside' ? mirrorParamsZ(S.params) : S.params);
  const simPath = parseManualGCodeToPath(S.manualGCode, p, S.flipX !== S.flipZ);
  const { seconds, length } = pathTimeSeconds(simPath, p);
  return { simPath, estimatedTimeSeconds: seconds, totalPathLength: length };
}

export function computeCalculation(S, lightOnly = false, skipRoughing = false) {
  // „Dobrat naráz" odstraněno z UI (Fáze 5): kapsu je vždy potřeba
  // dobrat až na dno (postupné dotahování mělčími průchody dno hluboké
  // úzké kapsy nedosáhne — rampa z rohu je omezená šířkou kapsy). Proto
  // je „dobrání kapsy" nyní VŽDY zapnuté; schodky uvnitř kapsy zahlazuje
  // dokončovací průchod po kontuře (sledování offsetu, bez kolmého
  // zajetí — vjezdy rampou od hranice polotovaru). Staré projekty se
  // normalizují zde — jediné hrdlo, kterým teče každá generace.
  S.params.pocketFinishAtOnce = true;
  // ── Druhá strana (podélně zleva) = TÝŽ výpočet v Z-ZRCADLE ────────────
  // Vstup se překlopí (z → −z), celý zbytek funkce pak řeší obyčejné
  // hrubování zprava se standardním pravým nožem a hotový výsledek se před
  // returnem překlopí zpátky (mirrorCalcZ). Detaily a konvence: zMirror.js.
  // Pravá strana projde s mirZ=false doslova beze změny.
  const mirZ = roughingKey(S) === 'backside';
  const prms = mirZ ? mirrorParamsZ(S.params) : S.params;
  const zLimits = mirZ ? mirrorZLimits(S.zLimits) : S.zLimits;
  const mirPts = (pts) => mirZ ? mirrorPointChain(pts) : pts;
  const absContour = mirPts(resolvePointsToAbsolute(S.contourPoints));
  const absStock = mirPts(resolvePointsToAbsolute(S.stockPoints));
  let worldPoints = absContour.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));
  const stockWorldPoints = absStock.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));
  // Oboustranně nakreslenou konturu (vrch i zrcadlený spodek) složit na stranu
  // polotovaru — jinak by se offsetovala a obráběla i zrcadlená −X půlka.
  worldPoints = foldContourToMachiningSide(worldPoints, stockWorldPoints);

  // Lehký přepočet pro PLYNULÉ tažení bodů: spočítá jen body kontury/
  // polotovaru (z nich draw() kreslí konturu) + obrys polotovaru. Dráhy/
  // offsety/hrubování/simulace se NEpočítají — to je drahé a přepočítá se
  // až po puštění myši. Po dobu tažení se proto dráhy SKRYJÍ (prázdná pole
  // níže) a po puštění (handleMouseUp → plný calculate()) se zase ukážou.
  if (lightOnly) {
    const stockPathSegments = [];
    for (let i = 0; i < stockWorldPoints.length - 1; i++) {
      const p1 = stockWorldPoints[i], p2 = stockWorldPoints[i + 1], type = p2.type;
      if (type === 'G1') {
        stockPathSegments.push({ type: 'line', p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal } });
      } else if (type === 'G2' || type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, type);
        const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        stockPathSegments.push({ type: 'arc', ...arc, dir: type, startAngle, endAngle });
      }
    }
    let stockTopX = (parseFloat(prms.stockDiameter) || 0) / 2;
    if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
      stockTopX = -9999;
      stockWorldPoints.forEach(p => { if (p.xReal > stockTopX) stockTopX = p.xReal; });
    }
    const lightCalc = {
      worldPoints, stockWorldPoints, contourSegments: [], machinableContour: null,
      offsetPath: [], finishOffsetPath: [], finishRefPath: [], finishUnreachablePath: [], stockPathSegments,
      passes: [], simPath: [], retractDist: parseFloat(prms.retractDistance) || 2.0,
      totalPathLength: 0, estimatedTimeSeconds: 0,
      interferenceSegments: [], flankSegments: [], interferenceGuides: [], stockTopX,
    };
    return mirZ ? mirrorCalcZ(lightCalc) : lightCalc;
  }

  const tipR = parseFloat(prms.toolRadius) || 0;
  const allowanceX = parseFloat(prms.allowanceX) || 0;
  const allowanceZ = parseFloat(prms.allowanceZ) || 0;
  const finishAllowance = parseFloat(prms.finishAllowance) || 0;
  const totalOffset = tipR + Math.max(allowanceX, allowanceZ) + finishAllowance;
  const retractDist = parseFloat(prms.retractDistance) || 2.0;

  let contourSegments = [];
  let finishOffsetPath = [];
  // Dokončovací offset úseků, kam destička nedosáhne (Hlídat geometrii):
  // nestrojí se, ale vykreslí se tečkovaně a blokuje rychloposuvy.
  let finishUnreachablePath = [];
  let stockPathSegments = [];
  const foundErrors = [];

  // Upichnutí (part-off): polygonální destička nemá definovaný zápichový
  // profil → varovat a nevytvářet dráhy (viz partOffGeom / generateAutoGCode).
  if (prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ)) && prms.toolShape === 'polygon') {
    foundErrors.push({ type: 'warning', msg: 'Upichnutí: polygonální (kosočtvercová) destička není podporována — zvol kulatý nebo upichovací plátek. Dráhy nevygenerovány.' });
  }

  for (let i = 0; i < worldPoints.length - 1; i++) {
    const p1 = worldPoints[i], p2 = worldPoints[i + 1], type = p2.type;
    // G0 = export vygeneroval pouze "přesun" mezi dvěma nesouvisejícími
    // entitami (mezera mezi nimi v CADu nic nemá nakresleno) — takový
    // segment NENÍ součástí kontury a nesmí se obrábět ani zobrazovat
    // jako spojnice (viz removeContourSelfIntersections/chainBreak níže).
    if (type === 'G1') {
      contourSegments.push({ type: 'line', p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal }, orig: p2, origIdx: i + 1 });
    } else if (type === 'G2' || type === 'G3') {
      const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, type);
      if (arc.error) foundErrors.push(`Řádek ${i + 2}: Rádius R${p2.r} je příliš malý.`);
      else if (arc.r < totalOffset) foundErrors.push(`KOLIZE (Řádek ${i + 2}): Rádius kontury menší než nástroj.`);
      const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
      const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
      contourSegments.push({ type: 'arc', ...arc, p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal }, dir: type, startAngle, endAngle, origIdx: i + 1 });
    }
  }
  // Odfiltrovat degenerované (nulové délky) segmenty dříve než normalizeContourDirection:
  // segment G0→G1 na stejném bodě (kreslení záměrně začíná na bodu bez pohybu)
  // by způsobil, že slepá-odbočka check zahodí správně otočené čelní segmenty —
  // konec degenerátu = konec otočeného čela → detekováno jako slepá odbočka.
  contourSegments = contourSegments.filter(s => {
    const p1 = s.type === 'line' ? s.p1 : null;
    const p2 = s.type === 'line' ? s.p2 : null;
    if (!p1 || !p2) return true; // arcs kept
    return Math.hypot(p2.x - p1.x, p2.z - p1.z) > 1e-4;
  });
  // Sjednotit směr průchodu kontury (otočit pozpátku nakreslené entity, např.
  // oblouk) — jinak je offsetový trimmer nenaváže a zahodí (chybějící dráhy).
  normalizeContourDirection(contourSegments);
  // Snapshot PŘED přemostěním/odstraněním smyček — spliceBridgeSegments
  // může segmenty (např. malý zaoblovací rádius pod mostem) z kontury
  // úplně odstranit, protože dráha tam nepojede. Pro detekci kolize
  // tvaru destičky (interferenceSegments níže) ale potřebujeme i tyto
  // odstraněné segmenty — i když se neobrábí, destička by je při
  // přejezdu mostu mohla narážet, takže uživatel o nich má vědět.
  const rawContourForInterference = contourSegments.map(s => structuredClone(s));
  // Nejprve "mostové" segmenty (nově nakreslený úsek, který oběma konci
  // dopadá doprostřed jiných segmentů přes G0 mezeru) zařadíme na jejich
  // geometrické místo v kontuře — nahradí úsek, který přemosťují.
  if (contourSegments.length > 2) {
    contourSegments = spliceBridgeSegments(contourSegments);
  }
  // Odstranění samoprotnutí (global loop-removal) se dělá nad CELOU
  // konturou napříč G0 mezerami — nový segment může "podjet" pod
  // stávající konturu i přes místo, kde CAD export vložil G0 přeskok
  // (segmenty na sebe geometricky nenavazují, ale protnutí mezi nimi
  // pořád určuje, kde se má vnitřní smyčka vyříznout).
  // Profilování: průchod grafem — v každém uzlu se dvěma výstupy
  // vybere vnější (vyšší X) větev, nebo větev z Hlídání geometrie (fromInsert).
  // Snapshot originálu se použije pro kreslení ztlumeného pozadí.
  const rawContourForProfile = contourSegments.map(s => structuredClone(s));
  let profileModeActive = false;
  // Výběr vnější větve běží VŽDY (nezávisle na přepínači „Auto profil") —
  // aktivuje se jen u kontur s větvením (z bodu vychází víc segmentů) nebo
  // se samoprotnutím, čistých kontur se nedotkne. Tím se uzavřené tvary
  // a zpětné úsečky vyloučí jak pro generování drah, tak pro hlídání
  // geometrie destičky (profileModeActive níže přepočítá interference).
  if (contourSegments.length > 2) {
    const { segs: outerSegs, hadBranches } = resolveOuterProfile(contourSegments);
    if (hadBranches) {
      contourSegments = outerSegs;
      profileModeActive = true;
    }
  }
  // Klasické odstranění smyček (self-intersection) jako fallback.
  if (contourSegments.length > 2) {
    const lenBefore = contourSegments.length;
    contourSegments = removeContourSelfIntersections(contourSegments);
    if (!profileModeActive && contourSegments.length < lenBefore)
      profileModeActive = true;
  }
  // Až po vyříznutí smyček označíme zbývající skutečné mezery (G0
  // přeskoky, které se nepodařilo/nemělo spojit ořezem) jako chainBreak —
  // tam dráha najede rychloposuvem místo spojovacího řezu/čáry.
  for (let i = 1; i < contourSegments.length; i++) {
    const prevEnd = segEndPoint(contourSegments[i - 1]);
    const curStart = segStartPoint(contourSegments[i]);
    if (Math.hypot(curStart.x - prevEnd.x, curStart.z - prevEnd.z) > 1e-4) {
      contourSegments[i].chainBreak = true;
    }
  }
  // Slepá odbočka: chainBreak segment, jehož KONEC se vrací do bodu, kde
  // kontura už pokračuje (= konec předchozího segmentu). Dráha by sem
  // musela rychloposuvem zajet a zase se vrátit na stejné místo —
  // typicky zbytkový/duplicitní úsek z CADu uvnitř kontury, který nejde
  // obrobit. Odstranit a nahlásit jako varování.
  for (let i = contourSegments.length - 1; i >= 1; i--) {
    const seg = contourSegments[i];
    if (!seg.chainBreak) continue;
    const segEnd = segEndPoint(seg);
    const prevEnd = segEndPoint(contourSegments[i - 1]);
    if (Math.hypot(segEnd.x - prevEnd.x, segEnd.z - prevEnd.z) < 1e-4) {
      foundErrors.push({ type: 'warning', msg: `POZNÁMKA: Uzavřená odbočka kontury u X${segEnd.x.toFixed(2)} Z${segEnd.z.toFixed(2)} nelze obrobit — vynechána.` });
      contourSegments.splice(i, 1);
      if (i < contourSegments.length) {
        const nextSeg = contourSegments[i];
        const nextStart = segStartPoint(nextSeg);
        nextSeg.chainBreak = Math.hypot(nextStart.x - prevEnd.x, nextStart.z - prevEnd.z) > 1e-4;
      }
    }
  }
  for (let i = 0; i < stockWorldPoints.length - 1; i++) {
    const p1 = stockWorldPoints[i], p2 = stockWorldPoints[i + 1], type = p2.type;
    if (type === 'G1') {
      stockPathSegments.push({ type: 'line', p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal } });
    } else if (type === 'G2' || type === 'G3') {
      const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, type);
      const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
      const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
      stockPathSegments.push({ type: 'arc', ...arc, dir: type, startAngle, endAngle });
    }
  }

  // Detekce kolize tvaru destičky s konturou (vrcholový úhel / natočení) —
  // segmenty, jejichž normála leží mimo úhlový rozsah, který destička
  // bez záběru bočním ostřím pokryje.
  const clearance = getToolClearanceRange(prms, S.flipX);
  const interferenceSegments = [];   // hrot nedosáhne → ovlivňuje dráhy
  const flankSegments = [];           // hřbet koliduje → jen varování + vizualizace
  if (clearance) {
    rawContourForInterference.forEach(seg => {
      const itype = segInterferesWithTool(seg, clearance);
      if (itype === 'tip') interferenceSegments.push(seg);
      else if (itype === 'flank') flankSegments.push(seg);
    });
  }

  // Automatické mezní čáry: jen při zapnutém Hlídání geometrie (jinak by
  // zůstaly vykreslené i po vypnutí). Ruční čáry (S.guideLines) netknuté.
  let interferenceGuides = (clearance && prms.respectInsertGeometry)
    ? computeInterferenceGuides(interferenceSegments, rawContourForInterference, clearance, prms, worldPoints, stockWorldPoints)
    : [];


  // Kontura PŘED vložením mostů z hlídání destičky/držáku. Mostové čáry
  // (fromInsert) jsou POUZE HRANICE hlídání, ne obráběná plocha — po nich
  // se nesmí generovat dokončovací dráha (jela by vzduchem podél mezní
  // čáry). Dokončování proto sleduje TUTO skutečnou konturu a nedosažitelné
  // úseky přeskočí (segInterferesWithTool). Hrubování naopak jede po
  // machinable kontuře (mosty určují, kde má zastavit).
  const preBridgeContour = contourSegments.map(s => structuredClone(s));

  // Automatické profilování: při zapnutém Hlídání geometrie se nedosažitelné
  // úseky kontury nahradí mostovou úsečkou z geometrie destičky a tahle
  // obrobitelná kontura se použije pro offsety/dráhy/CNC.
  let machinableContour = null;
  if (clearance && prms.respectInsertGeometry && !profileModeActive && interferenceGuides.length > 0) {
    // Normální (non-profil) mód. Čáry končící na polotovaru (downOnStock)
    // řeší buildMachinableContour zvlášť: ČELNÍ čára kotvící u kraje kontury
    // zakončí konturu podél sebe (zahodí nedosažitelné čelo k ose), ostatní
    // downOnStock uvnitř kontury zůstanou jen vizualizace (dráhy se nemění).
    const bridgeGuides = interferenceGuides.filter(g => !g._dominated);
    machinableContour = buildMachinableContour(contourSegments, bridgeGuides);
    contourSegments = machinableContour;
    interferenceGuides = interferenceGuides.filter(g =>
      !g._dominated && (
        g.downOnStock || g.downClipped ||
        (_locateOnContour(machinableContour, { x: g.x1, z: g.z1 }) &&
         _locateOnContour(machinableContour, { x: g.x2, z: g.z2 }))));
  } else if (clearance && prms.respectInsertGeometry && profileModeActive) {
    // Profil mód: vypočítat interference PŘÍMO Z OUTER PROFILU (ne z rawContourForInterference).
    // Tím guides odpovídají segmentům outer profilu a buildMachinableContour
    // správně přemostí nedosažitelné části (oblouk) bez přepsání celé kontury.
    const profileInterferenceSegs = [];
    contourSegments.forEach(seg => {
      const itype = segInterferesWithTool(seg, clearance);
      if (itype === 'tip') profileInterferenceSegs.push(seg);
    });
    if (profileInterferenceSegs.length > 0) {
      const profileGuides = computeInterferenceGuides(
        profileInterferenceSegs, contourSegments.map(s => structuredClone(s)),
        clearance, prms, worldPoints, stockWorldPoints
      );
      if (profileGuides.length > 0) {
        const bridgeProfileGuides = profileGuides.filter(g => !g._dominated);
        machinableContour = buildMachinableContour(contourSegments, bridgeProfileGuides);
        contourSegments = machinableContour;
        // Táž podmínka jako u větve bez profilu: čára, jejíž dolní konec sedí
        // na POLOTOVARU (downOnStock / downClipped), na kontuře z definice
        // neleží — a přesto platí. Dřív ji profilová větev zahodila, takže
        // u kontur s VĚTVENÍM (a jen ty sem chodí) zmizelo hlídání všude, kde
        // čára končí až na hraně materiálu: u čela vlevo nezůstala ani jedna
        // mezní čára, ačkoli se tam destička zavalí.
        interferenceGuides = profileGuides.filter(g =>
          !g._dominated && (
            g.downOnStock || g.downClipped ||
            (_locateOnContour(machinableContour, { x: g.x1, z: g.z1 }) &&
             _locateOnContour(machinableContour, { x: g.x2, z: g.z2 }))));
      }
    }
  }

  // 1. raw offsets — per-axis pro lines (alX v X, alZ v Z), uniformní pro arcs
  const rough = buildRawOffsets(contourSegments, tipR, allowanceX, allowanceZ, finishAllowance);
  let incompleteMachiningCount = rough.incompleteCount;

  // 2. trimming + loop removal (shared helper handles all segment combos)
  const offsetPath = dropTinyArcs(trimAndRemoveLoops(rough.rawOffsets));

  // ── Referenční HOTOVNÍ offset (jen rádius plátku, bez přídavků) ──
  // Čistě GEOMETRICKÁ čára „kam dojede střed plátku na hotovo" — kreslí se
  // v náhledu tečkovaně kolem celé kontury, stejně jako u mezních čar
  // hlídání destičky (ty svoje dva offsety měly vždycky). Nezávisí na
  // zapnutém Dokončování: `finishOffsetPath` je skutečná DRÁHA (ořezaná
  // podle dosažitelnosti destičky/držáku, gouge-clamp, Z-limity) a bez
  // zaškrtnutého „Dokončování" vůbec nevzniká — tahle čára je jen
  // reference, do G-kódu nevstupuje.
  const finishRefPath = (tipR > 0 && (allowanceX > 1e-9 || allowanceZ > 1e-9 || finishAllowance > 1e-9))
    ? dropTinyArcs(trimAndRemoveLoops(buildRawOffsets(contourSegments, tipR, 0, 0, 0).rawOffsets))
    : [];

  // ── Fáze 3a/3b (Clipper2): obálka držáku ──────────────────────
  // Zakázaná oblast špičky = silueta offsetu ⊕ (−obrys držáku)
  // (Minkowski). Hrubování: scanIntervals průchody zkrátí, aby držák
  // nikdy nevjel do materiálu, který po hrubování zůstává (silueta =
  // minimum toho, co v okamžiku průchodu stojí → bezpečně konzervativní
  // vůči guides; nikdy neprodlužuje, jen zkracuje). Dokončování (3b):
  // úseky se špičkou v zakázané oblasti se přeskočí (isForbidden).
  // Jen se zapnutým „Hlídat geometrii" a definovaným držákem.
  let holderClampZEnd = null;
  if (prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__) {
    try {
      holderClampZEnd = makeHolderClamp(prms, offsetPath, { backside: false, stockPathSegments });
    } catch (err) {
      console.warn('CAM: obálku držáku se nepodařilo sestavit:', err);
    }
  }

  // Dokončovací dráha — celá operace v ops/finish.js.
  if (prms.doFinishing || prms.finishOnly) {
    finishOffsetPath = buildFinishPath({
      prms, clearance, contourSegments, preBridgeContour, machinableContour,
      rawContourForInterference, stockPathSegments, tipR,
      finishUnreachablePath, foundErrors,
    });
  }

  // Protáhnout obě offsetové čáry až k ose, když kontura začíná na X0
  // (čelo do středu). Korekce R jinak nechá u osy neobrobený zbytek.
  if (worldPoints.length > 0 && Math.abs(worldPoints[0].xReal) < 1e-3) {
    extendOffsetStartToAxis(offsetPath);
    extendOffsetStartToAxis(finishOffsetPath);
    extendOffsetStartToAxis(finishRefPath);
  }

  if (incompleteMachiningCount > 0)
    foundErrors.push({ type: 'warning', msg: `POZNÁMKA: V ${incompleteMachiningCount} místech nedojde ke kompletnímu obrobení.` });

  if (interferenceSegments.length > 0)
    foundErrors.push({ type: 'warning', msg: `Tvar destičky (vrchol ${prms.toolTipAngle}°, natočení ${prms.toolAngle}°) nedosáhne na ${interferenceSegments.length} úsek(ů) kontury (viz zvýrazněná místa na výkrese).` });
  if (flankSegments.length > 0)
    foundErrors.push({ type: 'warning', msg: `Hřbet destičky (α=${prms.toolClearanceAngle}°): ${flankSegments.length} úsek(ů) je dostupných jen díky vůli hřbetu — hřbet bude v kontaktu s materiálem, riziko otěru (viz oranžové zvýraznění).` });

  // Passes
  const passes = [];
  const step = parseFloat(prms.depthOfCut) || 1;
  const sRad = (parseFloat(prms.stockDiameter) || 100) / 2;
  const stockFace = parseFloat(prms.stockFace) || 0;

  // Rozsah obrábění Z (📐) — aktivní jen když uživatel zaškrtne políčko.
  const rS = zLimits.rangeStart, rE = zLimits.rangeEnd;
  const machiningRange = (zLimits.rangeActive && typeof rS === 'number' && isFinite(rS)
    && typeof rE === 'number' && isFinite(rE))
    ? { zLo: Math.min(rS, rE), zHi: Math.max(rS, rE) } : null;
  // Rozsah obrábění X (📐) — aktivní jen když uživatel zaškrtne políčko.
  const xRn = S.xLimits.rangeXMin, xRx = S.xLimits.rangeXMax;
  const machiningRangeX = (S.xLimits.active && typeof xRn === 'number' && isFinite(xRn)
    && typeof xRx === 'number' && isFinite(xRx))
    ? { xLo: Math.min(xRn, xRx), xHi: Math.max(xRn, xRx) } : null;
  // Čelisti (levý konec v upínači) — backside nesmí řezat pod chuck.
  const chuckZ = (zLimits.chuckActive && typeof zLimits.chuck === 'number' && isFinite(zLimits.chuck))
    ? zLimits.chuck : null;

  // ── Sdílené helpery pro offsetPath (čelní i podélné hrubování) ──
  // Geometrické dotazy žijí v cam/passHelpers.js — hrubování zleva si z téže
  // továrny staví sadu nad ZRCADLENÝM offsetem (viz genBacksidePasses).
  const { offsetXAt, traceOffsetPath, findPocketExitZ, findLeadOutEndZ } = makePassHelpers(offsetPath);

  // Dokončování upichovákem po obálce plátku — viz ops/finish.js.
  finishOffsetPath = finishPartingEnvelope(prms, finishOffsetPath);

  // ── Strategie hrubování (cam/roughingStrategies.js) ──
  // passCtx = sdílený kontext: data + pass-helpery z calculate().
  const passCtx = {
    prms, sRad, stockFace, step, offsetPath, stockPathSegments,
    stockWorldPoints, worldPoints, passes, foundErrors,
    offsetXAt, traceOffsetPath, findPocketExitZ,
    findLeadOutEndZ, hIntersect, machiningRange, machiningRangeX, chuckZ,
    holderClampZEnd, interferenceGuides,
  };
  // operations[] model: seznam operací hrubování, každá naplní passes
  // přes svou strategii z registru. Zatím odvozeno z prms.roughingStrategy
  // (= 1 operace); persistentní seznam + UI přijdou s druhou stranou.
  // Jen dokončení („Hot."): hrubovací průchody se negenerují — passes zůstane
  // prázdné a objede se jen dokončovací offset (finishOffsetPath).
  //
  // `skipRoughing` dělá totéž dočasně: geometrie (kontura, offsety, mezní
  // čáry) stojí 51 ms, samé hrubování 740 (měřeno na part-11), takže dokud
  // uživatel dráhy nepřepočítá, počítá panel jen tu levnou část.
  if (!prms.finishOnly && !skipRoughing) {
    const operations = getRoughingOperations(S);
    const runOps = () => {
      for (const op of operations) {
        const strategy = ROUGHING_STRATEGIES[op.kind] || ROUGHING_STRATEGIES.longitudinal;
        strategy.genPasses(passCtx, op);
      }
    };
    runOps();
    // ── DĚLENÍ NA ÚSEKY PODLE HRBŮ KONTURY ─────────────────────────────
    // Hrb kontury přeruší vrstvu → každá strana je vlastní úsek a dodělá se
    // celá, než se přejede na druhou (`docs/cam-pravidla-drah.md` §6.0).
    //
    // TADY BÝVAL GATE. Od 27. 8. 2026 se plánovalo DVAKRÁT — s dělením a bez
    // něj — a `planQuality` rozhodla, který plán se nechá: když dělení
    // zhoršilo vnoření držáku nebo zbytek materiálu, zahodilo se. Na dílu
    // uživatele (⌀111 × 350, podélně zleva) tím pravidlo padalo pokaždé:
    // dělení se spočítalo (8 úseků, zlomy Z 4,1 / 67,2 / 127,2 / 228,1)
    // a pak se vyhodilo, protože držák vyšel 30,10 proti 4,78 mm². Výsledek
    // uživatel viděl jako 24 návratů „vlevo–vpravo–vlevo" kolem každého hrbu.
    //
    // ZRUŠENO 1. 9. 2026 na jeho pokyn: §6.0 je PODMÍNKA, ne optimalizace —
    // měřicí heuristika ji přebíjet nesmí (totéž rozhodnutí jako 28. 8. 2026,
    // kdy padly tři gaty před ním). Správná odpověď na „s dělením se držák
    // nevejde" je opravit PŘÍČINU (držák nesmí zajet do úseku, který se ještě
    // nehruboval — viz `pendingRegions` v ops/roughLong.js), ne vrátit se
    // k plánu, který pravidlo porušuje.
    //
    // Odpadlo tím i druhé plánování celého dílu (dřív se `runOps()` volalo
    // dvakrát na každém díle, kde nějaký hrb je).
    // POJISTKA, ne gate: plán s dělením se zahodí JEN tehdy, když by držák
    // vjel do stojícího materiálu — tedy když je pravidlo fyzicky
    // neproveditelné, ne když je jen „dražší". Rozhoduje TÁŽ dvojice čísel
    // jako dřív, ale plán s dělením k ní teď přichází OPRAVENÝ (duplicitní
    // okna regionů, viz ops/roughLong.js) — na dílu uživatele proto projde
    // a §6.0 platí, kdežto dřív padal na vlastní vadě.
    if (passCtx.usedPeakSplit) {
      const withSplit = planQuality(passes, prms, stockPathSegments);
      const keptPasses = passes.slice(), keptErrors = foundErrors.slice();
      passes.length = 0; foundErrors.length = 0;
      passCtx.usedPeakSplit = false;
      prms.__noPeakSplits = true;
      try {
        runOps();
        const without = planQuality(passes, prms, stockPathSegments);
        // VETO SMÍ MÍT JEN DRŽÁK. Zbytek materiálu (`residual`) tu do
        // 1. 9. 2026 vetoval taky — a právě na něm §6.0 padalo: plán
        // s dělením je z principu o něco „dražší" (každý úsek se dodělá do
        // své hloubky a u hranic zůstane materiál, který dobere jiná
        // operace), takže ho kritérium úběru zamítlo, i když byl čistý.
        // Na dílu uživatele to bylo −399 mm² proti NULE kolizí; pravidlo
        // se tím zahazovalo kvůli ceně, ne kvůli proveditelnosti.
        if (withSplit.holder <= without.holder + HOLDER_INTRUSION_TOL) {
          passes.length = 0; passes.push(...keptPasses);
          foundErrors.length = 0; foundErrors.push(...keptErrors);
        }
      } finally { delete prms.__noPeakSplits; }
    }
  }

  // Pásový ořez dokončovací dráhy (rozsah 📐 i čelisti/koník) — ops/finish.js.

  if ((machiningRange || machiningRangeX) && finishOffsetPath.length > 0) {
    const res = clipFinishBand(finishOffsetPath, {
      zLo: machiningRange ? machiningRange.zLo : -Infinity,
      zHi: machiningRange ? machiningRange.zHi : Infinity,
      xLo: machiningRangeX ? machiningRangeX.xLo : -Infinity,
      xHi: machiningRangeX ? machiningRangeX.xHi : Infinity,
    });
    if (res.trimmed > 0 || res.dropped > 0) {
      finishOffsetPath = res.path;
      foundErrors.push({
        type: 'warning',
        msg: `Rozsah obrábění (📐): dokončování ořezáno na zadaný úsek — ${res.trimmed} úsek(ů) zkráceno, ${res.dropped} vynecháno. Zbytek kontury dodělá operace pro sousední úsek.`,
      });
    }
  }

  // ── Z-limity (čelisti / koník): ořez drah aby nezasáhly do zóny ──
  // Pravidla: cut (G1) musí zůstat uvnitř [chuck, tail]:
  //   long:    zEnd >= chuck (nejet pod čelisti), zStart <= tail (nejet za koník)
  //   face:    pass.z musí být v [chuck, tail], jinak průchod vyhodíme
  //   finish:  finishOffsetPath se ořízne na lineární clip / drop arc
  // Pokud po ořezu nezbude smysluplný řez, segment se zahodí celý.
  // Clamping je aktivní jen když uživatel zobrazí čelisti/koník (fixtures
  // nebo both). 'off' a 'range' chuck/tail ignorují, takže lze přepínat
  // chování bez mazání čísel v parametrech.
  const chuckLim = (zLimits.chuckActive && typeof zLimits.chuck === 'number' && isFinite(zLimits.chuck)) ? zLimits.chuck : null;
  const tailLim  = (zLimits.tailActive  && typeof zLimits.tail  === 'number' && isFinite(zLimits.tail))  ? zLimits.tail  : null;
  if (chuckLim !== null || tailLim !== null) {
    const EPS = 0.05;
    let droppedCount = 0;
    let clampedCount = 0;
    const clamped = [];
    for (const pass of passes) {
      if (pass.type === 'long') {
        let zS = pass.zStart, zE = pass.zEnd;
        const origZS = zS, origZE = zE;
        if (chuckLim !== null && zE < chuckLim) zE = chuckLim;
        if (tailLim  !== null && zS > tailLim)  zS = tailLim;
        if (pass.ramp) {
          // Zanořovací průchod (sledování kontury + rampa) nelze zkrátit
          // zprava — limit by rozbil návaznost na konturu. Pokud limity
          // stahují zStart, nebo vršek sledování kontury/rampy leží za
          // tailLim, celý vynech.
          const leadInTopZ = (pass.contourLeadIn && pass.contourLeadIn.length > 0) ? pass.contourLeadIn[0].z1 : pass.ramp.z0;
          if (zS !== origZS || (tailLim !== null && leadInTopZ > tailLim)) { droppedCount++; continue; }
          // Floor může mít nulovou šířku (čistá rampa bez floor-u) — to
          // je v pořádku, zahodit jen pokud limit ořezal zEnd až za
          // začátek rampy (zS).
          if (zS - zE < -EPS) { droppedCount++; continue; }
          zE = Math.min(zE, zS);
        } else if (zS - zE < EPS) {
          // Dokončovací průchod kapsy (pocketClean) i jiné „lead-only" pasy
          // mají nulovou šířku zStart→zEnd — jejich řez je v contourLeadIn/Out
          // (sledování offsetu kolem kapsy). Nezahazovat kvůli nulové šířce,
          // jinak zmizí dobrání schodků v kapse (leady sledují konturu uvnitř
          // dílu, tj. v mezích čelistí/koníku). Bez leadů = opravdu prázdný.
          if (!pass.contourLeadIn && !pass.contourLeadOut) { droppedCount++; continue; }
        }
        if (zS !== origZS || zE !== origZE) clampedCount++;
        clamped.push({ ...pass, zStart: zS, zEnd: zE });
      } else if (pass.type === 'face') {
        if (chuckLim !== null && pass.z < chuckLim) { droppedCount++; continue; }
        if (tailLim  !== null && pass.z > tailLim)  { droppedCount++; continue; }
        clamped.push(pass);
      } else {
        clamped.push(pass);
      }
    }
    passes.length = 0;
    for (const p of clamped) passes.push(p);

    // Ořez finishOffsetPath na dovolený PÁS [chuck, tail] — týž ořez jako
    // u rozsahu obrábění (clipFinishBand výš). Tady byla vada, kterou opravuje
    // právě přechod na pásový ořez:
    //
    // Dřív se na PRVNÍM ořezaném segmentu zvedl příznak „pastLimit" a všechno
    // za ním se zahodilo, ať byl na vině kterýkoli z limitů. To dává smysl jen
    // pro limit na KONCI jízdy: dokončování jede od velkého Z k malému, takže
    // ČELISTI (levý konec) potká naposled — a ty se ořezávaly správně. KONÍK
    // (pravý konec) ale dráha potká hned na začátku, takže se zahodila CELÁ.
    // Změřeno na part-15 (dokončování Z −1,3…235,0):
    //   koník Z200        → 0 úseků  (správně 5, zkrácené na Z ≤ 200)
    //   čelisti Z100      → 5 úseků, Z 125,5…235,0  ✓
    //   čelisti 100 + koník 200 → 0 úseků
    // Uživatel přitom dostal jen obecné „dokončování ořezáno", takže zmizení
    // celé operace vypadalo jako normální ořez.
    //
    // Pásový ořez pojem „za hranicí" vůbec nezná — ptá se jen „uvnitř, nebo
    // venku?" — takže na pořadí limitů ani na směru jízdy nezáleží. Navíc
    // oblouk na hranici TRIMUJE místo zahození (dřív padl celý, i když z něj
    // uvnitř zůstávala většina).
    const finLim = clipFinishBand(finishOffsetPath, {
      zLo: chuckLim !== null ? chuckLim : -Infinity,
      zHi: tailLim !== null ? tailLim : Infinity,
    });
    const finishClipped = finLim.trimmed;
    const finishDropped = finLim.dropped;
    if (finishClipped > 0 || finishDropped > 0) finishOffsetPath = finLim.path;
    if (droppedCount > 0 || clampedCount > 0 || finishDropped > 0 || finishClipped > 0) {
      const parts = [];
      if (clampedCount > 0) parts.push(`${clampedCount} hrubovacích zkráceno`);
      if (droppedCount > 0) parts.push(`${droppedCount} hrubovacích vynecháno`);
      if (finishClipped > 0) parts.push(`dokončování ořezáno`);
      if (finishDropped > 0) parts.push(`${finishDropped} dokončovacích segmentů vynecháno`);
      foundErrors.push({
        type: 'warning',
        msg: `Z-limity (čelisti/koník): ${parts.join(', ')}.`
      });
    }
  }

  // Sim path
  // Simulační dráha se vždy počítá z (ručně editovatelného) G-kódu —
  // viz [[feedback_flip-axis-gcode]] a tlačítko "🔄 Autorefresh drah",
  // které přepíše S.manualGCode čerstvě vygenerovaným kódem z kontury/parametrů.
  // Čas i délka ze skutečných rychlostí pohybu (rychloposuv z parametrů,
  // řezný posuv F × otáčky v daném průměru) — stejný výpočet pohání
  // přehrávání simulace v reálném čase, viz cam/feedRates.js.
  const { simPath, estimatedTimeSeconds, totalPathLength } = computeSimPath(S, prms);

  // Vrch polotovaru v X (pro bezpečné rapid přejezdy nad materiálem).
  let stockTopX = sRad;
  if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
    stockTopX = -9999;
    stockWorldPoints.forEach(p => { if (p.xReal > stockTopX) stockTopX = p.xReal; });
  }

  S.errors = foundErrors;
  // profileModeActive = výpočet drah/hlídání běží po vyřešeném profilu (vždy).
  // profileViewActive = VYKRESLENÍ vyřešeného profilu (ztlumená originál kontura
  //   + zvýrazněný číslovaný profil) — ovládá tlačítko „Auto profil". Bez něj
  //   se ukáže normální kontura se všemi body, dráhy ale jedou po profilu.
  const profileViewActive = profileModeActive && (prms.autoProfile !== false);
  const calcOut = { worldPoints, stockWorldPoints, contourSegments, machinableContour, offsetPath, finishOffsetPath, finishRefPath, finishUnreachablePath, stockPathSegments, passes, simPath, retractDist, totalPathLength, estimatedTimeSeconds, interferenceSegments, flankSegments, interferenceGuides, stockTopX, profileModeActive, profileViewActive, rawContourForProfile: profileViewActive ? rawContourForProfile : null };
  // Zpět do reálného světa (simPath se nezrcadlí — je z reálného G-kódu).
  return mirZ ? mirrorCalcZ(calcOut) : calcOut;
}

// ── G-Code Editor Content ────────────────────────────────────
// G-kód editor je vždy ručně editovatelný (viz "🔄 Autorefresh drah").

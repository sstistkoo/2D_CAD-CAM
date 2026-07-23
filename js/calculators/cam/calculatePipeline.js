// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – výpočetní jádro (calculate pipeline)                     ║
// ╚══════════════════════════════════════════════════════════════╝
// Vytaženo z camSimulator.js (Fáze B). computeCalculation(S, lightOnly)
// je bývalé calculate() — čte/zapisuje sdílený stav S a vrací calc objekt.
// V camSimulator.js zůstává tenký wrapper calculate() → computeCalculation(S).

import { bridge } from '../../bridge.js';
import { _locateOnContour, dropTinyArcs, fitArcsToPolyline, getArcParams, getNormal, intersectHorizontalLineArc, intersectHorizontalLineSegment, intersectSegAtZ, isAngleBetween, samplePartingEnvelope, segEndPoint, segStartPoint } from './camMath.js';
import { arcReachableSpan, buildMachinableContour, extendOffsetStartToAxis, foldContourToMachiningSide, getToolClearanceRange, normalizeContourDirection, removeContourSelfIntersections, resolveOuterProfile, resolvePointsToAbsolute, segInterferesWithTool, spliceBridgeSegments, trimAndRemoveLoops } from './contourBuild.js';
import { parseManualGCodeToPath } from './gcodeParser.js';
import { computeInterferenceGuides } from './interferenceGuides.js';
import { ROUGHING_STRATEGIES } from './roughingStrategies.js';
import { partOffGeom } from './threadHelpers.js';
import { makeHolderClamp } from './toolEnvelope.js';

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
export function computeCalculation(S, lightOnly = false) {
  const prms = S.params;
  // „Dobrat naráz" odstraněno z UI (Fáze 5): kapsu je vždy potřeba
  // dobrat až na dno (postupné dotahování mělčími průchody dno hluboké
  // úzké kapsy nedosáhne — rampa z rohu je omezená šířkou kapsy). Proto
  // je „dobrání kapsy" nyní VŽDY zapnuté; schodky uvnitř kapsy zahlazuje
  // dokončovací průchod po kontuře (sledování offsetu, bez kolmého
  // zajetí — vjezdy rampou od hranice polotovaru). Staré projekty se
  // normalizují zde — jediné hrdlo, kterým teče každá generace.
  prms.pocketFinishAtOnce = true;
  const absContour = resolvePointsToAbsolute(S.contourPoints);
  const absStock = resolvePointsToAbsolute(S.stockPoints);
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
    return {
      worldPoints, stockWorldPoints, contourSegments: [], machinableContour: null,
      offsetPath: [], finishOffsetPath: [], finishUnreachablePath: [], stockPathSegments,
      passes: [], simPath: [], retractDist: parseFloat(prms.retractDistance) || 2.0,
      totalPathLength: 0, estimatedTimeSeconds: 0,
      interferenceSegments: [], flankSegments: [], interferenceGuides: [], stockTopX,
    };
  }

  const tipR = parseFloat(prms.toolRadius) || 0;
  const allowanceX = parseFloat(prms.allowanceX) || 0;
  const allowanceZ = parseFloat(prms.allowanceZ) || 0;
  const finishAllowance = parseFloat(prms.finishAllowance) || 0;
  const totalOffset = tipR + Math.max(allowanceX, allowanceZ) + finishAllowance;
  const retractDist = parseFloat(prms.retractDistance) || 2.0;

  let contourSegments = [];
  let rawOffsets = [];
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
        machinableContour = buildMachinableContour(contourSegments, profileGuides);
        contourSegments = machinableContour;
        interferenceGuides = profileGuides.filter(g =>
          !g._dominated &&
          _locateOnContour(machinableContour, { x: g.x1, z: g.z1 }) &&
          _locateOnContour(machinableContour, { x: g.x2, z: g.z2 }));
      }
    }
  }

  let incompleteMachiningCount = 0;
  // 1. raw offsets — per-axis pro lines (alX v X, alZ v Z), uniformní pro arcs
  for (let i = 0; i < contourSegments.length; i++) {
    const seg = contourSegments[i];
    let offSeg = null;
    if (seg.type === 'line') {
      const n = getNormal(seg.p1, seg.p2);
      const tx = n.x * (tipR + allowanceX + finishAllowance);
      const tz = n.z * (tipR + allowanceZ + finishAllowance);
      offSeg = { type: 'line', p1: { x: seg.p1.x + tx, z: seg.p1.z + tz }, p2: { x: seg.p2.x + tx, z: seg.p2.z + tz } };
    } else if (seg.type === 'arc') {
      // Autodetekce směru z geometrie — nezávisle na G2/G3 z exportu.
      // Důvod: pokud byl arc nakreslen s "obrácenou" CW/CCW volbou
      // (canvas má flipnutou Y), export má prohozený G2/G3 a offset by
      // se pak posílal na špatnou stranu.
      // OUTER (konvexní): |center.x| < |chord_midpoint.x| → offset ven.
      // INNER (konkávní): |center.x| > |chord_midpoint.x| → offset dovnitř.
      const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
      const centerAbsX = Math.abs(seg.cx);
      const isOuter = centerAbsX < midAbsX;
      // Per-axis offset stejně jako u úseček: bod oblouku s normálou
      // (sin a, cos a) se posouvá o (R+aX) v X a (R+aZ) v Z → poloosy.
      // Při aX == aZ je to obyčejný oblouk (rx == rz); při různých
      // přídavcích ELIPSA — jinak konce nesedí na offsety sousedních
      // úseček a trimmer z krátkých úseků dělá trojúhelníkové artefakty
      // (oblouk byl navíc celý odsazen o max(aX, aZ) i v ose s menším
      // přídavkem).
      const rx = isOuter ? seg.r + tipR + allowanceX + finishAllowance
        : seg.r - (tipR + allowanceX + finishAllowance);
      const rz = isOuter ? seg.r + tipR + allowanceZ + finishAllowance
        : seg.r - (tipR + allowanceZ + finishAllowance);
      // Pouze geometricky nemožné (poloosa <= 0) zahodíme. Malé ale kladné
      // je legitimní — nástroj sleduje miniaturní oblouk kolem rohu.
      if (Math.min(rx, rz) <= 0.05) { incompleteMachiningCount++; offSeg = null; }
      else if (Math.abs(rx - rz) < 1e-9) {
        const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
        const endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
        offSeg = { type: 'arc', cx: seg.cx, cz: seg.cz, r: rx, dir: seg.dir, refP1: seg.p1, refP2: seg.p2, startAngle, endAngle };
      } else {
        // Elipsu navzorkovat (hustě, chord error << tol) a proložit zpět
        // oblouky/úsečkami (fitArcsToPolyline, tol 0,02) — G-kód zůstane
        // kompaktní (G2/G3) a konce sedí na offsety sousedních úseček.
        let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
        let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        const rMax = Math.max(rx, rz);
        const dTheta = Math.sqrt(8 * 0.002 / rMax);
        const steps = Math.max(4, Math.min(256, Math.ceil(Math.abs(eA - sA) / dTheta)));
        const pts = [];
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          pts.push({ x: seg.cx + Math.sin(a) * rx, z: seg.cz + Math.cos(a) * rz });
        }
        const fitted = fitArcsToPolyline(pts, 0.02);
        fitted.forEach((fs, fi) => {
          if (fi === 0 && seg.chainBreak) fs.chainBreak = true;
          rawOffsets.push(fs);
        });
        offSeg = null;   // segmenty už jsou vložené
      }
    }
    if (offSeg) {
      if (seg.chainBreak) offSeg.chainBreak = true;
      rawOffsets.push(offSeg);
    }
  }

  // 2. trimming + loop removal (shared helper handles all segment combos)
  const offsetPath = dropTinyArcs(trimAndRemoveLoops(rawOffsets));

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

  // finishing offset
  if (prms.doFinishing || prms.finishOnly) {
    // Hlídání destičky: úseky, kam destička bočním ostřím nedosáhne,
    // dokončování vynechá — následující segment dostane chainBreak,
    // takže se přes mezeru přejede rychloposuvem.
    const respectFin = prms.respectInsertGeometry && clearance;
    let finSkipped = 0;
    let finHolderSkipped = 0;
    // Fáze 3b: vzorkování dokončovacího segmentu pro test proti zakázané
    // oblasti špičky (držák) — body po ~0,5 mm včetně konců.
    const segSamplePts = (fs) => {
      const pts = [];
      if (fs.type === 'line') {
        const n = Math.max(2, Math.min(64, Math.ceil(Math.hypot(fs.p2.x - fs.p1.x, fs.p2.z - fs.p1.z) / 0.5) + 1));
        for (let k = 0; k < n; k++) {
          const t = k / (n - 1);
          pts.push({ x: fs.p1.x + (fs.p2.x - fs.p1.x) * t, z: fs.p1.z + (fs.p2.z - fs.p1.z) * t });
        }
      } else {
        let sA = fs.startAngle, eA = fs.endAngle;
        if (fs.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (fs.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        const n = Math.max(3, Math.min(64, Math.ceil(fs.r * Math.abs(eA - sA) / 0.5) + 1));
        for (let k = 0; k < n; k++) {
          const a = sA + (eA - sA) * (k / (n - 1));
          pts.push({ x: fs.cx + Math.sin(a) * fs.r, z: fs.cz + Math.cos(a) * fs.r });
        }
      }
      return pts;
    };
    const holderBlocks = (fs) => holderClampZEnd && holderClampZEnd.isForbidden
      && segSamplePts(fs).some(p => holderClampZEnd.isForbidden(p.x, p.z));
    let pendingBreak = false;
    // Přeryv kvůli NEDOSAŽITELNÉMU úseku (hlídání destičky) — na rozdíl od
    // mikro-přeskoku znamená „tady je díra, další dosažitelný úsek je
    // samostatný ostrov": musí dostat tvrdý chainBreak (rychloposuv k němu)
    // a NESMÍ ho spolknout heuristika zpětného řezu (jinak se sousední
    // stěny natáhnou k sobě do artefaktu — dřív monstrum až za polotovar).
    let unreachBreak = false;
    let finRaw = [];
    // Dokončování jede po SKUTEČNÉ kontuře (bez mostů hlídání) — mostové
    // čáry jsou jen hranice, ne obráběná plocha. Nedosažitelné úseky se
    // přeskočí (blocked). Bez hlídání = machinable == pre-bridge, žádný rozdíl.
    const finContour = respectFin ? preBridgeContour : contourSegments;
    for (let i = 0; i < finContour.length; i++) {
      const seg = finContour[i];
      let blocked = respectFin && segInterferesWithTool(seg, clearance);
      let finSeg = null;
      let trailingBreak = false;   // nedosažitelný konec ZA obloukem → přerušit další segment
      if (seg.type === 'line') {
        const n = getNormal(seg.p1, seg.p2);
        finSeg = { type: 'line', p1: { x: seg.p1.x + n.x * tipR, z: seg.p1.z + n.z * tipR }, p2: { x: seg.p2.x + n.x * tipR, z: seg.p2.z + n.z * tipR } };
      } else if (seg.type === 'arc') {
        // Autodetekce směru z geometrie — viz komentář u rough offsetu.
        const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
        const centerAbsX = Math.abs(seg.cx);
        const isOuter = centerAbsX < midAbsX;
        let rNew = isOuter ? seg.r + tipR : seg.r - tipR;
        if (rNew > 0.05) {
          const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
          const endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
          // Mikro-oblouk z nepatrného rohu (offsetová tětiva < ~0.12 mm) =
          // degenerát; zahodit, jinak vznikne smyčka/„čtyřhran" v offsetu.
          // Sousední segmenty (stěna × most) se pak napojí přímo v průsečíku.
          const ex1 = seg.cx + Math.sin(startAngle) * rNew, ez1 = seg.cz + Math.cos(startAngle) * rNew;
          const ex2 = seg.cx + Math.sin(endAngle) * rNew, ez2 = seg.cz + Math.cos(endAngle) * rNew;
          if (Math.hypot(ex2 - ex1, ez2 - ez1) > 0.12)
            finSeg = { type: 'arc', cx: seg.cx, cz: seg.cz, r: rNew, dir: seg.dir, refP1: seg.p1, refP2: seg.p2, startAngle, endAngle };
        }
      }
      if (!finSeg) { pendingBreak = true; continue; }
      // Částečně nedosažitelný oblouk: špička dojede po vrchol vypuklého rohu,
      // ale ne až do navazující strmé stěny. Místo zahození CELÉHO oblouku ho
      // ořízni na dosažitelnou část (obrobí se) a jako nedosažitelný označ jen
      // konec/začátek za mezí (tečkovaně). Trim je vždy PODMNOŽINA dosažitelné
      // zóny → nikdy nezajede (bezpečné).
      if (blocked && finSeg.type === 'arc') {
        const span = arcReachableSpan(seg, clearance);
        if (span && (span.a1 - span.a0) > 0.03) {
          const s0 = finSeg.startAngle, e0 = finSeg.endAngle;
          // Cíp pod GAP (≈1°) je uvnitř tolerance špičky a končí u sousedního
          // úseku/mostu — přimázne se k obrobené části, nezahazuje se zvlášť.
          const GAP = 0.02;
          const beforeGap = Math.abs(span.a0 - s0) > GAP;
          const afterGap = Math.abs(span.a1 - e0) > GAP;
          const a0use = beforeGap ? span.a0 : s0;
          const a1use = afterGap ? span.a1 : e0;
          const mkUnreach = (aA, aB) => ({
            type: 'arc', cx: finSeg.cx, cz: finSeg.cz, r: finSeg.r, dir: finSeg.dir,
            startAngle: aA, endAngle: aB,
            refP1: { x: seg.cx + Math.sin(aA) * seg.r, z: seg.cz + Math.cos(aA) * seg.r },
            refP2: { x: seg.cx + Math.sin(aB) * seg.r, z: seg.cz + Math.cos(aB) * seg.r },
            unreachable: true,
          });
          if (beforeGap) { finishUnreachablePath.push(mkUnreach(s0, span.a0)); finSkipped++; }
          if (afterGap) { finishUnreachablePath.push(mkUnreach(span.a1, e0)); finSkipped++; }
          // Ořízni obráběný oblouk na dosažitelný podinterval (podmnožina
          // dosažitelné zóny → nikdy nezajede).
          finSeg.startAngle = a0use; finSeg.endAngle = a1use;
          finSeg.refP1 = { x: seg.cx + Math.sin(a0use) * seg.r, z: seg.cz + Math.cos(a0use) * seg.r };
          finSeg.refP2 = { x: seg.cx + Math.sin(a1use) * seg.r, z: seg.cz + Math.cos(a1use) * seg.r };
          if (beforeGap) finSeg.chainBreak = true;   // od předchozího přes nedosažitelný začátek
          if (afterGap) trailingBreak = true;         // další segment přes nedosažitelný konec
          blocked = false;
        }
      }
      if (blocked) {
        // Nedosažitelný úsek: neobrábí se (přerušení dráhy), ale uchová
        // se pro tečkované vykreslení a jako překážka pro rychloposuvy.
        finSkipped++;
        finSeg.unreachable = true;
        finishUnreachablePath.push(finSeg);
        pendingBreak = true;
        unreachBreak = true;
        continue;
      }
      // Fáze 3b: úsek, kde by DRŽÁK jel ve zbývajícím materiálu (špička
      // v zakázané oblasti silueta ⊕ −držák), dokončování přeskočí
      // stejně jako nedosažitelné úseky destičky — typicky čelo u osy,
      // kam se držák přes osazení nevejde.
      if (holderBlocks(finSeg)) {
        finHolderSkipped++;
        finSeg.unreachable = true;
        finishUnreachablePath.push(finSeg);
        pendingBreak = true;
        unreachBreak = true;
        continue;
      }
      // Po přeskočeném oblouku (pendingBreak): přeskočit přechodný čelní
      // řez, jehož offset začíná na menším X než skončil předchozí segment
      // (nástroj by musel jet dovnitř — vznik trojúhelníkového artefaktu).
      // pendingBreak se smaže, aby se trim mohl spojit přímo s dalším segmentem.
      // VÝJIMKA: mostový úsek z geometrie destičky (fromInsert = konstrukční
      // čára dojezd/zanoření) je ZÁMĚRNÁ dráha — nikdy ho nezahazovat, jinak
      // dokončování zajede ZA konstrukční čáru (oblouk by začal moc brzy).
      // Přeryv po NEDOSAŽITELNÉM úseku (unreachBreak) se neaplikuje: další
      // dosažitelný úsek je samostatný ostrov (rychloposuv k němu), ne zpětný
      // řez ke spolknutí.
      if (!unreachBreak && pendingBreak && finSeg.type === 'line' && !seg.fromInsert && finRaw.length > 0) {
        const prev = finRaw[finRaw.length - 1];
        if (prev.type === 'line' && finSeg.p1.x < prev.p2.x - 0.05) {
          if (finSeg.p2.x < prev.p2.x - 0.05) {
            // Celý segment leží dovnitř → skutečný zpětný řez → zahodit.
            pendingBreak = false;
            continue;
          }
          // p1 dovnitř, p2 vně → reálné osazení/čelo. Trim ho napojí na
          // předchozí segment průsečíkem. Vymazat pendingBreak PŘED chainBreak
          // testem, aby trim spojil plynule bez G0.
          pendingBreak = false;
        }
      }
      // Mostový úsek (fromInsert) nikdy nepřerušovat: jeho konce LEŽÍ na
      // kontuře (spojitý), takže ho trim napojí v průsečíku s předchozím
      // úsekem. Bez výjimky by ho přeskočený mikro/degenerovaný oblouk před
      // ním označil jako chainBreak → dokončování by k němu skočilo G0 a
      // oblouk by začal moc brzy (zajetí za konstrukční čáru).
      if ((seg.chainBreak || pendingBreak) && !seg.fromInsert) finSeg.chainBreak = true;
      // Ostrov za nedosažitelnou dírou: tvrdý přeryv (rapid), ať trim
      // sousední úseky nespojí natažením do artefaktu.
      if (unreachBreak) { finSeg.chainBreak = true; unreachBreak = false; }
      pendingBreak = false;
      finRaw.push(finSeg);
      // Oříznutý oblouk nechal za sebou nedosažitelný konec → další segment
      // se k němu nesmí plynule napojit (přejezd G0 přes nedosažitelný kus).
      if (trailingBreak) pendingBreak = true;
    }
    finishOffsetPath = dropTinyArcs(trimAndRemoveLoops(finRaw));
    // Sanitace: když je R nástroje větší než konkávní rádius kontury
    // (nebo selže ořez), může segment zůstat s null/NaN souřadnicí —
    // zahodit, aby se neemitoval „XNaN", a označit přejezd (chainBreak).
    const finFinite = (s) => s.type === 'line'
      ? [s.p1 && s.p1.x, s.p1 && s.p1.z, s.p2 && s.p2.x, s.p2 && s.p2.z].every(Number.isFinite)
      : [s.cx, s.cz, s.r, s.startAngle, s.endAngle].every(Number.isFinite);
    let finDropped = 0;
    for (let i = finishOffsetPath.length - 1; i >= 0; i--) {
      if (!finFinite(finishOffsetPath[i])) {
        finDropped++;
        finishOffsetPath.splice(i, 1);
        if (i < finishOffsetPath.length) finishOffsetPath[i].chainBreak = true;
      }
    }
    if (finDropped > 0)
      foundErrors.push({ type: 'warning', msg: `Dokončování: ${finDropped} úsek(ů) vynecháno — nástroj (R${tipR}) se nevejde do tvaru kontury (malý poloměr). Přejezd G0.` });
    if (finSkipped > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání destičky: dokončování vynechá ${finSkipped} úsek(ů), kam destička nedosáhne (přejezd G0).` });
    if (finHolderSkipped > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání geometrie (držák): dokončování vynechá ${finHolderSkipped} úsek(ů) — držák by narazil do materiálu (přejezd G0). Zbytek obrobte jiným nástrojem/upnutím.` });

    // ── No-gouge pojistka dokončování („dojet co nejblíž, ale bez zajetí") ──
    // Při soustružení zvenčí musí střed nástroje zůstat na vzduchové straně:
    // X ≥ nejvyšší X kontury na daném Z. Když dokončovací úsek (typicky most
    // z geometrie destičky u úzkého zápichu, kam se destička bokem nevejde)
    // tuhle mez přejede, oříznout ho přesně na hranici a zajíždějící zbytek
    // přesunout do nedosažitelných (tečkovaně, bez řezu). Mez se počítá vůči
    // SKUTEČNÉ kontuře (rawContourForInterference), ne přemostěné.
    const profileXAt = (z) => {
      let mx = -Infinity;
      for (const s of rawContourForInterference) {
        if (s.isDegenerate) continue;
        for (const x of intersectSegAtZ(s, z)) if (x > mx) mx = x;
      }
      return mx;
    };
    const GOUGE_EPS = 0.02;
    const gougeAt = (p) => { const mx = profileXAt(p.z); return mx > -Infinity && p.x < mx - GOUGE_EPS; };
    let finClamped = 0;
    for (let i = finishOffsetPath.length - 1; i >= 0; i--) {
      const s = finishOffsetPath[i];
      if (s.type !== 'line' || !s.p1 || !s.p2) continue;
      // Vzorkovat CELÝ úsek, ne jen konce: dlouhý most z geometrie destičky
      // (přes nedosažitelný stín destičky) má konce ve vzduchu, ale STŘEDEM
      // může proříznout konturu. Kontrola jen koncových bodů to propustí →
      // dráha zajede do materiálu. Úsek se rozseká na nezajíždějící části,
      // zajíždějící střed se přesune do nedosažitelných (tečkovaně, bez řezu).
      const ptAt = (t) => ({ x: s.p1.x + (s.p2.x - s.p1.x) * t, z: s.p1.z + (s.p2.z - s.p1.z) * t });
      const segLen = Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z);
      const N = Math.max(20, Math.ceil(segLen / 0.5));
      const flags = [];
      let anyGouge = false, allGouge = true;
      for (let k = 0; k <= N; k++) { const g = gougeAt(ptAt(k / N)); flags.push(g); if (g) anyGouge = true; else allGouge = false; }
      if (!anyGouge) continue;
      finClamped++;
      // Přesná hranice (v parametru t) mezi vzorkem t0 a t1 s opačným stavem.
      const boundary = (t0, t1) => {
        let lo = t0, hi = t1; const gLo = gougeAt(ptAt(t0));
        for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (gougeAt(ptAt(m)) === gLo) lo = m; else hi = m; }
        return (lo + hi) / 2;
      };
      if (allGouge) {
        finishUnreachablePath.push({ type: 'line', p1: { ...s.p1 }, p2: { ...s.p2 }, unreachable: true });
        finishOffsetPath.splice(i, 1);
        if (i < finishOffsetPath.length) finishOffsetPath[i].chainBreak = true;
        continue;
      }
      // Nezajíždějící (keep) i zajíždějící (gouge) intervaly v t.
      const keepRuns = [], gougeRuns = [];
      let kStart = flags[0] ? null : 0, gStart = flags[0] ? 0 : null;
      for (let k = 1; k <= N; k++) {
        if (flags[k] === flags[k - 1]) continue;
        const b = boundary((k - 1) / N, k / N);
        if (flags[k - 1]) { gougeRuns.push([gStart, b]); gStart = null; kStart = b; }
        else { keepRuns.push([kStart, b]); kStart = null; gStart = b; }
      }
      if (kStart !== null) keepRuns.push([kStart, 1]);
      if (gStart !== null) gougeRuns.push([gStart, 1]);
      gougeRuns.filter(([a, b]) => b - a > 1e-4).forEach(([a, b]) =>
        finishUnreachablePath.push({ type: 'line', p1: ptAt(a), p2: ptAt(b), unreachable: true }));
      const replacement = keepRuns.filter(([a, b]) => b - a > 1e-3).map(([a, b], idx) => {
        const seg = { type: 'line', p1: ptAt(a), p2: ptAt(b) };
        // Přejezd (G0) před úsek, když mu předchází vyříznutá mezera nebo
        // měl-li přejezd už původní úsek.
        if (a > 1e-6 || idx > 0 || s.chainBreak) seg.chainBreak = true;
        return seg;
      });
      // Konec úseku zajíždí → další segment v řetězu potřebuje přejezd.
      if (flags[N] && i + 1 < finishOffsetPath.length) finishOffsetPath[i + 1].chainBreak = true;
      finishOffsetPath.splice(i, 1, ...replacement);
    }
    if (finClamped > 0)
      foundErrors.push({ type: 'warning', msg: `Dokončování: ${finClamped} úsek(ů) zkráceno, aby dráha nezajela do kontury (zbytek nedosažitelný — viz tečkovaně).` });
  }

  // Protáhnout obě offsetové čáry až k ose, když kontura začíná na X0
  // (čelo do středu). Korekce R jinak nechá u osy neobrobený zbytek.
  if (worldPoints.length > 0 && Math.abs(worldPoints[0].xReal) < 1e-3) {
    extendOffsetStartToAxis(offsetPath);
    extendOffsetStartToAxis(finishOffsetPath);
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
  const rS = S.zLimits.rangeStart, rE = S.zLimits.rangeEnd;
  const machiningRange = (S.zLimits.rangeActive && typeof rS === 'number' && isFinite(rS)
    && typeof rE === 'number' && isFinite(rE))
    ? { zLo: Math.min(rS, rE), zHi: Math.max(rS, rE) } : null;
  // Rozsah obrábění X (📐) — aktivní jen když uživatel zaškrtne políčko.
  const xRn = S.xLimits.rangeXMin, xRx = S.xLimits.rangeXMax;
  const machiningRangeX = (S.xLimits.active && typeof xRn === 'number' && isFinite(xRn)
    && typeof xRx === 'number' && isFinite(xRx))
    ? { xLo: Math.min(xRn, xRx), xHi: Math.max(xRn, xRx) } : null;
  // Čelisti (levý konec v upínači) — backside nesmí řezat pod chuck.
  const chuckZ = (S.zLimits.chuckActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck))
    ? S.zLimits.chuck : null;

  // ── Sdílené helpery pro offsetPath (čelní i podélné hrubování) ──
  // Horizontální průsečíky segmentů (s kolinárním fallbackem).
  const hIntersect = (segs, xLine, checkDegen) => {
    const out = [];
    for (const seg of segs) {
      if (checkDegen && seg.isDegenerate) continue;
      if (seg.type === 'line') {
        const z = intersectHorizontalLineSegment(xLine, seg.p1, seg.p2);
        if (z !== null) out.push(z);
        else if (Math.abs(seg.p1.x - xLine) < 0.01 && Math.abs(seg.p2.x - xLine) < 0.01) {
          out.push(seg.p1.z, seg.p2.z);
        }
      } else if (seg.type === 'arc') {
        const res = intersectHorizontalLineArc(xLine, { x: seg.cx, z: seg.cz }, seg.r);
        for (const z of res) {
          const angle = Math.atan2(xLine - seg.cx, z - seg.cz);
          if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2')) out.push(z);
        }
      }
    }
    return out;
  };

  // Max X segmentů na zadaném Z. Null pokud Z mimo Z-rozsah segmentů.
  const maxXAt = (segs, z) => {
    let maxX = null;
    for (const seg of segs) {
      if (seg.isDegenerate) continue;
      if (seg.type === 'line') {
        const zMin = Math.min(seg.p1.z, seg.p2.z);
        const zMax = Math.max(seg.p1.z, seg.p2.z);
        if (z < zMin - 0.01 || z > zMax + 0.01) continue;
        const dz = seg.p2.z - seg.p1.z;
        const x = Math.abs(dz) < 1e-6
          ? Math.max(seg.p1.x, seg.p2.x)
          : seg.p1.x + ((z - seg.p1.z) / dz) * (seg.p2.x - seg.p1.x);
        if (maxX === null || x > maxX) maxX = x;
      } else if (seg.type === 'arc') {
        const cosA = (z - seg.cz) / seg.r;
        if (cosA < -1.001 || cosA > 1.001) continue;
        const cosC = Math.max(-1, Math.min(1, cosA));
        const a1 = Math.acos(cosC);
        for (const a of [a1, -a1]) {
          if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) {
            const x = seg.cx + Math.sin(a) * seg.r;
            if (maxX === null || x > maxX) maxX = x;
          }
        }
      }
    }
    return maxX;
  };
  const offsetXAt = (z) => maxXAt(offsetPath, z);

  // ── Dokončování upichovákem: dráha po OBÁLCE ──
  // Upichovák má šířku — dokončovací dráha po samotném offsetu by na
  // úsecích stoupajících k obrobené straně (zprava = doprava) zajela
  // tělem plátku do tvaru. Obálka x(z) = max offsetu pod celou rovnou
  // částí dna: na stoupajících úsecích tak finální povrch řeže DRUHÝ
  // rádius plátku, na klesajících aktivní roh; vršky přejíždí rovné dno.
  // Do úzkých kapes (užší než plátek) obálka nezajede — zbytek je
  // nedosažitelný stejně jako u hlídání geometrie destičky.
  if (prms.toolShape === 'parting' && (prms.doFinishing || prms.finishOnly) && finishOffsetPath.length > 0) {
    const wInsF = parseFloat(prms.toolLength) || 0;
    const rInsF = Math.min(parseFloat(prms.toolRadius) || 0, wInsF / 2);
    const w2RF = Math.max(0, wInsF - 2 * rInsF);
    const dirMF = (prms.roughingSide === 'left') ? -1 : 1;
    let fzMin = Infinity, fzMax = -Infinity;
    finishOffsetPath.forEach(s => {
      if (s.isDegenerate) return;
      if (s.type === 'line') { fzMin = Math.min(fzMin, s.p1.z, s.p2.z); fzMax = Math.max(fzMax, s.p1.z, s.p2.z); }
      else { fzMin = Math.min(fzMin, s.cz - s.r); fzMax = Math.max(fzMax, s.cz + s.r); }
    });
    if (isFinite(fzMin) && fzMax - fzMin > 0.05) {
      const finXAt = (z) => maxXAt(finishOffsetPath, z);
      // jízdní pořadí = klesající Z (zprava doleva) — jako offsetPath.
      // Kruhové úseky obálky se zpětně proloží G2/G3 (fitArcsToPolyline),
      // ať dokončování není rozsekané na stovky mikro-úseček.
      const pts = samplePartingEnvelope(finXAt, fzMax, fzMin, w2RF, dirMF, 0.4, 0.003);
      if (pts.length >= 2) {
        const fitted = fitArcsToPolyline(pts, 0.02);
        finishOffsetPath = fitted.map(s => s.type === 'line'
          ? { type: 'line', p1: { x: s.p1.x, z: s.p1.z }, p2: { x: s.p2.x, z: s.p2.z }, chainBreak: false }
          : { type: 'arc', p1: { x: s.p1.x, z: s.p1.z }, p2: { x: s.p2.x, z: s.p2.z }, refP1: { x: s.p1.x, z: s.p1.z }, refP2: { x: s.p2.x, z: s.p2.z }, cx: s.cx, cz: s.cz, r: s.r, dir: s.dir, startAngle: s.startAngle, endAngle: s.endAngle, chainBreak: false });
      }
    }
  }

  // Úhel oblouku offsetPath na zadaném Z (jen v rozsahu segmentu).
  const arcAngleAtZ = (seg, z) => {
    const cosA = (z - seg.cz) / seg.r;
    if (cosA < -1.001 || cosA > 1.001) return null;
    const cosC = Math.max(-1, Math.min(1, cosA));
    const a1 = Math.acos(cosC);
    for (const a of [a1, -a1]) {
      if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return a;
    }
    return null;
  };

  // Kopie segmentů offsetPath oříznuté na Z∈[zLo,zHi], v pořadí jízdy
  // (od vyššího Z k nižšímu) — podklad pro G1/G2/G3 sledování kontury
  // přes "kapsu"/"schod" místo odskoku a rychloposuvu nad polotovarem.
  const traceOffsetPath = (zHi, zLo) => {
    const out = [];
    // offsetPath je v jízdním pořadí (klesající Z); procházíme dopředu,
    // ať výsledek vyjde také v jízdním pořadí (vysoké Z → nízké Z).
    // Každý segment uvnitř drží x1/z1 = vyšší Z, x2/z2 = nižší Z, takže
    // dopředný průchod = spojitá dráha bez zpětných skoků/oblouků.
    for (let i = 0; i < offsetPath.length; i++) {
      const seg = offsetPath[i];
      if (seg.isDegenerate) continue;
      if (seg.type === 'line') {
        const zA = seg.p1.z, zB = seg.p2.z;
        // Čelní (konstantní-Z) úsek — radiální pohyb v X. Z-klipování by ho
        // zahodilo (clipHi==clipLo), proto ho zařadíme zvlášť v jízdním
        // pořadí (p1→p2), pokud jeho Z leží v rozsahu [zLo, zHi].
        if (Math.abs(zA - zB) < 1e-6) {
          // Uzavírací čelo protínající osu (jede k X≈0) NENÍ soustružnický
          // schod — hrubovací dojezd (leadOut) ho nesmí přejíždět až na osu,
          // jinak vznikne dlouhá radiální dráha přes celé čelo do středu
          // (a odskok pak startuje z osy). Náběhové čelo se sleduje OPAČNĚ
          // (od osy ven), to necháváme — dílo se u něj obrábí normálně.
          const towardAxis = seg.p2.x < seg.p1.x - 1e-6 && seg.p2.x < 0.05;
          if (!towardAxis && zA <= zHi + 1e-6 && zA >= zLo - 1e-6)
            out.push({ type: 'line', x1: seg.p1.x, z1: zA, x2: seg.p2.x, z2: zB });
          continue;
        }
        const hiPt = zA >= zB ? seg.p1 : seg.p2;
        const loPt = zA >= zB ? seg.p2 : seg.p1;
        const clipHi = Math.min(zHi, hiPt.z);
        const clipLo = Math.max(zLo, loPt.z);
        if (clipHi <= clipLo + 1e-6) continue;
        const dz = hiPt.z - loPt.z;
        const xAt = (z) => Math.abs(dz) < 1e-9 ? hiPt.x : loPt.x + (z - loPt.z) / dz * (hiPt.x - loPt.x);
        out.push({ type: 'line', x1: xAt(clipHi), z1: clipHi, x2: xAt(clipLo), z2: clipLo });
      } else if (seg.type === 'arc') {
        const zAtStart = seg.cz + Math.cos(seg.startAngle) * seg.r;
        const zAtEnd = seg.cz + Math.cos(seg.endAngle) * seg.r;
        const reversed = zAtStart < zAtEnd;
        const aAtHiOrig = reversed ? seg.endAngle : seg.startAngle;
        const aAtLoOrig = reversed ? seg.startAngle : seg.endAngle;
        const zSegHi = Math.max(zAtStart, zAtEnd);
        const zSegLo = Math.min(zAtStart, zAtEnd);
        const clipHi = Math.min(zHi, zSegHi);
        const clipLo = Math.max(zLo, zSegLo);
        if (clipHi <= clipLo + 1e-6) continue;
        const aAtClipHi = arcAngleAtZ(seg, clipHi) ?? aAtHiOrig;
        const aAtClipLo = arcAngleAtZ(seg, clipLo) ?? aAtLoOrig;
        const outDir = reversed ? (seg.dir === 'G2' ? 'G3' : 'G2') : seg.dir;
        out.push({
          type: 'arc', cx: seg.cx, cz: seg.cz, r: seg.r, dir: outDir,
          startAngle: aAtClipHi, endAngle: aAtClipLo,
          x1: seg.cx + Math.sin(aAtClipHi) * seg.r, z1: clipHi,
          x2: seg.cx + Math.sin(aAtClipLo) * seg.r, z2: clipLo
        });
      }
    }
    return out;
  };

  // Konec leadOutu z kapsy: na rozdíl od findLeadOutEndZ se NEzastaví,
  // když offset stoupá — sleduje druhou (odvrácenou) stěnu kapsy nahoru
  // (G2/G3) až dokud znovu neklesne na řeznou hloubku depthX (tam pokračuje
  // hlubší průchod), nebo dokud kontura nekončí. Tím se obrobí celá druhá
  // stěna kapsy přímo po obrysu místo odskoku.
  const findPocketExitZ = (zFrom, depthX, zFloor) => {
    const h = 0.05;
    let z = zFrom, leftPocket = false;
    for (let i = 0; i < 8000; i++) {
      const zNext = z - h;
      if (zNext < zFloor - 1e-6) break;
      const x = offsetXAt(zNext);
      if (x === null) break;                       // konec kontury
      if (x > depthX + 0.01) leftPocket = true;    // stoupáme po druhé stěně
      else if (leftPocket && x <= depthX + 1e-6) return zNext; // zpět na hloubku
      z = zNext;
    }
    return z;
  };

  // Konec leadOutu otevřeného (podélného) průchodu pro hrubování bez
  // schodků: po dojezdu na konturu se po ní jede dál, dokud offset buď
  // neklesne na hloubku DALŠÍHO (hlubšího) průchodu nextX — tam to převezme
  // další pas — NEBO nestoupne zpět na hloubku PŘEDCHOZÍHO (mělčího)
  // průchodu prevX — tam je vršek schodu, který už mělčí pas obrobil. Tím
  // se schod mezi sousedními zabery obrobí přímo po obrysu (žádný zbytek).
  const findLeadOutEndZ = (zFrom, prevX, nextX, zFloor) => {
    const h = 0.05;
    let z = zFrom;
    for (let i = 0; i < 8000; i++) {
      const zNext = z - h;
      if (zNext < zFloor - 1e-6) break;
      const x = offsetXAt(zNext);
      if (x === null) break;                                  // konec kontury
      if (x <= nextX + 1e-6) return zNext;                    // klesla na hlubší zaber
      if (prevX !== null && x >= prevX - 1e-6) return zNext;   // stoupla na vršek schodu
      z = zNext;
    }
    return z;
  };

  // ── Strategie hrubování (cam/roughingStrategies.js) ──
  // passCtx = sdílený kontext: data + pass-helpery z calculate().
  const passCtx = {
    prms, sRad, stockFace, step, offsetPath, stockPathSegments,
    stockWorldPoints, worldPoints, passes, foundErrors,
    offsetXAt, traceOffsetPath, findPocketExitZ,
    findLeadOutEndZ, hIntersect, machiningRange, machiningRangeX, chuckZ,
    holderClampZEnd,
  };
  // operations[] model: seznam operací hrubování, každá naplní passes
  // přes svou strategii z registru. Zatím odvozeno z prms.roughingStrategy
  // (= 1 operace); persistentní seznam + UI přijdou s druhou stranou.
  // Jen dokončení („Hot."): hrubovací průchody se negenerují — passes zůstane
  // prázdné a objede se jen dokončovací offset (finishOffsetPath).
  if (!prms.finishOnly) {
    const operations = getRoughingOperations(S);
    for (const op of operations) {
      const strategy = ROUGHING_STRATEGIES[op.kind] || ROUGHING_STRATEGIES.longitudinal;
      strategy.genPasses(passCtx, op);
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
  const chuckLim = (S.zLimits.chuckActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) ? S.zLimits.chuck : null;
  const tailLim  = (S.zLimits.tailActive  && typeof S.zLimits.tail  === 'number' && isFinite(S.zLimits.tail))  ? S.zLimits.tail  : null;
  if (chuckLim !== null || tailLim !== null) {
    const EPS = 0.05;
    const zInBounds = (z) => {
      if (chuckLim !== null && z < chuckLim - 0.0001) return false;
      if (tailLim  !== null && z > tailLim  + 0.0001) return false;
      return true;
    };
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

    // Ořez finishOffsetPath: lineární clip endpointu k limitu, oblouky
    // překračující limit se zahodí. Vše po prvním ořezu se dropne, aby
    // dráha nepokračovala do zakázané zóny.
    let finishDropped = 0;
    let finishClipped = 0;
    let pastLimit = false;
    for (const seg of finishOffsetPath) {
      if (seg.isDegenerate) continue;
      if (pastLimit) { seg.isDegenerate = true; finishDropped++; continue; }
      if (seg.type === 'line') {
        const inP1 = zInBounds(seg.p1.z);
        const inP2 = zInBounds(seg.p2.z);
        if (inP1 && inP2) continue;
        if (!inP1 && !inP2) { seg.isDegenerate = true; finishDropped++; pastLimit = true; continue; }
        // Jeden bod uvnitř, druhý venku → clip na limit.
        const outZ = inP1 ? seg.p2.z : seg.p1.z;
        const limit = (chuckLim !== null && outZ < chuckLim) ? chuckLim
                     : (tailLim !== null && outZ > tailLim ? tailLim : null);
        if (limit === null) { seg.isDegenerate = true; finishDropped++; pastLimit = true; continue; }
        const dz = seg.p2.z - seg.p1.z;
        const t = Math.abs(dz) > 1e-9 ? (limit - seg.p1.z) / dz : 0;
        const tt = Math.max(0, Math.min(1, t));
        const cx = seg.p1.x + tt * (seg.p2.x - seg.p1.x);
        if (inP1) {
          seg.p2 = { x: cx, z: limit };
        } else {
          seg.p1 = { x: cx, z: limit };
        }
        finishClipped++;
        pastLimit = true;
      } else {
        // Arc: Z-rozsah SKUTEČNÉHO výseku (koncové body + extrém cz±r jen
        // když úhel extrému leží ve výseku) — bounding box celé kružnice
        // by u téměř rovných oblouků s velkým R (arc-fit obálky) zahazoval
        // vše, i když výsek limity vůbec nepřekračuje.
        const zS = seg.cz + Math.cos(seg.startAngle) * seg.r;
        const zE = seg.cz + Math.cos(seg.endAngle) * seg.r;
        let zMin = Math.min(zS, zE), zMax = Math.max(zS, zE);
        if (isAngleBetween(0, seg.startAngle, seg.endAngle, seg.dir === 'G2')) zMax = seg.cz + seg.r;
        if (isAngleBetween(Math.PI, seg.startAngle, seg.endAngle, seg.dir === 'G2')) zMin = seg.cz - seg.r;
        if (!zInBounds(zMin) || !zInBounds(zMax)) {
          seg.isDegenerate = true; finishDropped++; pastLimit = true;
        }
      }
    }
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
  let simPath = [];
  let totalPathLength = 0;
  let estimatedTimeSeconds = 0;
  const addToPath = (x1, z1, x2, z2, type) => {
    const d = Math.hypot(x2 - x1, z2 - z1);
    totalPathLength += d;
    if (type === 'G0') { estimatedTimeSeconds += (d / 5000) * 60; }
    else {
      const feed = parseFloat(prms.feed) || 0.1;
      const speed = parseFloat(prms.speed) || 200;
      let avgX = Math.abs((x1 + x2) / 2);
      if (avgX < 1) avgX = 1;
      let rpm = (speed * 1000) / (Math.PI * avgX * 2);
      const limsMatch = (prms.machineType || '').match(/LIMS=(\d+)/);
      const maxRpm = limsMatch ? parseInt(limsMatch[1], 10) : 2000;
      if (rpm > maxRpm) rpm = maxRpm;
      const mmPerMin = feed * rpm;
      if (mmPerMin > 0) estimatedTimeSeconds += (d / mmPerMin) * 60;
    }
    return { x: x2, z: z2, type };
  };

  // Simulační dráha se vždy počítá z (ručně editovatelného) G-kódu —
  // viz [[feedback_flip-axis-gcode]] a tlačítko "🔄 Autorefresh drah",
  // které přepíše S.manualGCode čerstvě vygenerovaným kódem z kontury/parametrů.
  simPath = parseManualGCodeToPath(S.manualGCode, prms, S.flipX !== S.flipZ);
  for (let i = 0; i < simPath.length - 1; i++)
    addToPath(simPath[i].x, simPath[i].z, simPath[i + 1].x, simPath[i + 1].z, simPath[i + 1].type);

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
  return { worldPoints, stockWorldPoints, contourSegments, machinableContour, offsetPath, finishOffsetPath, finishUnreachablePath, stockPathSegments, passes, simPath, retractDist, totalPathLength, estimatedTimeSeconds, interferenceSegments, flankSegments, interferenceGuides, stockTopX, profileModeActive, profileViewActive, rawContourForProfile: profileViewActive ? rawContourForProfile : null };
}

// ── G-Code Editor Content ────────────────────────────────────
// G-kód editor je vždy ručně editovatelný (viz "🔄 Autorefresh drah").

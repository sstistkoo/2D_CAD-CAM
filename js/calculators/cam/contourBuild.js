import {
  normalizeAngle, getNormal, vecAngle, intersectLineCircle, isAngleBetween,
  intersectLinesInfinite, findSegIntersection, getSegEnd, getSegStart,
  setSegEnd, setSegStart, isOnSegBounds, isWithinSegStrict, segEndPoint,
  segStartPoint, syncArcEndpoints, reverseSeg, pointOnSegInterior,
  _locateOnContour, TRIM_TOL, LOOP_INTERIOR_MIN,
} from './camMath.js';
import { guidePolyPoints, guideBridgePts, mkBridgeSegs } from './interferenceGuides.js';

// Úhlový rozsah normál kontury, který destička daného tvaru pokryje bez
// záběru bočním ostřím (vrcholový úhel ε omezuje, jak moc se může povrch
// odklánět od osy destičky). Pro kulatou destičku (toolShape !== 'polygon')
// omezení neplatí.
export function getToolClearanceRange(prms, flipX) {
  if (prms.toolShape !== 'polygon') return null;
  const toolAngleRad = (parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
  const tipRad = (parseFloat(prms.toolTipAngle) || 90) * Math.PI / 180;
  const bisector = flipX ? (-toolAngleRad - tipRad / 2) : (toolAngleRad + tipRad / 2);
  const halfRange = (Math.PI - tipRad) / 2;
  const clearRad = (parseFloat(prms.toolClearanceAngle) || 0) * Math.PI / 180;
  return { bisector, halfRange, clearRad };
}
// Test jednoho segmentu kontury proti úhlovému rozsahu destičky —
// true = destička by při sledování segmentu špičkou zajela bočním
// ostřím do materiálu (normála segmentu mimo pokrytý rozsah).
// Malá tolerance, aby tečné body PŘESNĚ na hranici dosažitelnosti (typicky
// začátek oblouku navázaného na mostovou čáru profilu) nezhodily celý jinak
// dosažitelný oblouk jako "nedosažitelný" (hraniční false-positive ~0.1°).
const INSERT_REACH_TOL = 1.5 * Math.PI / 180;
// Vrací: 'tip'   = ani s vůlí hřbetu hrot nedosáhne (mimo halfRange + clearRad),
//        'flank' = hrot dosáhne díky vůli hřbetu (halfRange < diff ≤ halfRange+clearRad),
//                  ale hřbet bude v kontaktu s materiálem — riziko otěru,
//        false   = zcela v bezpečné zóně.
// Model: clearRad rozšiřuje efektivní dosah destičky za geometrické halfRange,
// ale v tomto "bonusovém" pásmu koliduje hřbet s materiálem.
// clearRad = 0 (negativní plátka, α=0) → chování beze změny, žádná flank zóna.
export function segInterferesWithTool(seg, clearance) {
  const { bisector, halfRange, clearRad = 0 } = clearance;
  // Bez vůle: geometrická mez + tolerance. S vůlí: rozšířeno o clearRad.
  const tipLim   = halfRange + clearRad + INSERT_REACH_TOL;  // za touto mezí ani s α nedosáhne
  const flankLim = halfRange + INSERT_REACH_TOL;             // bez α nedosáhne, s α dosáhne (flank zóna)

  function checkNormal(normAngle) {
    const diff = Math.abs(normalizeAngle(normAngle - bisector));
    if (diff > tipLim) return 'tip';
    if (clearRad > 0 && diff > flankLim) return 'flank';
    return null;
  }

  if (seg.type === 'line') {
    const n = getNormal(seg.p1, seg.p2);
    if (n.x === 0 && n.z === 0) return false;
    return checkNormal(vecAngle(n.x, n.z)) || false;
  }
  if (seg.type === 'arc') {
    const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
    const isOuter = Math.abs(seg.cx) < midAbsX;
    const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
    let endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
    if (seg.dir === 'G2' && endAngle > startAngle) endAngle -= 2 * Math.PI;
    if (seg.dir === 'G3' && endAngle < startAngle) endAngle += 2 * Math.PI;
    const steps = 8;
    let worstType = null;
    for (let s = 0; s <= steps; s++) {
      const a = startAngle + (endAngle - startAngle) * (s / steps);
      const normAngle = isOuter ? normalizeAngle(a) : normalizeAngle(a + Math.PI);
      const t = checkNormal(normAngle);
      if (t === 'tip') return 'tip';
      if (t === 'flank') worstType = 'flank';
    }
    return worstType || false;
  }
  return false;
}
// Pro oblouk vrátí SOUVISLÝ podinterval úhlu {a0,a1} (v parametru oblouku,
// tj. atan2(x−cx, z−cz), orientovaný start→end), kde špička destičky DOSÁHNE
// (normála uvnitř úhlového rozsahu i s vůlí hřbetu). Vrací null, když nedosáhne
// nikde. Slouží k oříznutí ČÁSTEČNĚ nedosažitelného oblouku — obrobí se
// dosažitelná část místo zahození celého oblouku (jinak vypuklý roh, na který
// špička dojede, zůstane bez dokončovací dráhy).
export function arcReachableSpan(seg, clearance) {
  const { bisector, halfRange, clearRad = 0 } = clearance;
  const tipLim = halfRange + clearRad + INSERT_REACH_TOL;
  const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
  const isOuter = Math.abs(seg.cx) < midAbsX;
  const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
  let endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
  if (seg.dir === 'G2' && endAngle > startAngle) endAngle -= 2 * Math.PI;
  if (seg.dir === 'G3' && endAngle < startAngle) endAngle += 2 * Math.PI;
  const steps = 64;
  let a0 = null, a1 = null;
  for (let s = 0; s <= steps; s++) {
    const a = startAngle + (endAngle - startAngle) * (s / steps);
    const normAngle = isOuter ? normalizeAngle(a) : normalizeAngle(a + Math.PI);
    const reachable = Math.abs(normalizeAngle(normAngle - bisector)) <= tipLim;
    if (reachable) { if (a0 === null) a0 = a; a1 = a; }
    else if (a0 !== null) break; // souvislý dosažitelný běh skončil
  }
  if (a0 === null) return null;
  return { a0, a1, startAngle, endAngle };
}
// Test, jestli úsečka (p1→p2, reálné souřadnice X = rádius) protíná
// segmenty offsetové dráhy — pro kontrolu bezpečnosti rychloposuvů.
// Doteky v koncových bodech (najetí přesně na dráhu) se nepočítají.
export function segmentHitsPath(p1, p2, segs) {
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return false;
  for (const seg of segs) {
    if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const d = (p1.x - p2.x) * (seg.p1.z - seg.p2.z) - (p1.z - p2.z) * (seg.p1.x - seg.p2.x);
      if (Math.abs(d) < 1e-12) continue; // rovnoběžné/kolineární — neprotíná příčně
      const t = ((p1.x - seg.p1.x) * (seg.p1.z - seg.p2.z) - (p1.z - seg.p1.z) * (seg.p1.x - seg.p2.x)) / d;
      const u = ((p1.x - seg.p1.x) * (p1.z - p2.z) - (p1.z - seg.p1.z) * (p1.x - p2.x)) / d;
      if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) return true;
    } else if (seg.type === 'arc') {
      const hits = intersectLineCircle(p1, p2, { x: seg.cx, z: seg.cz }, seg.r);
      if (!hits) continue;
      for (const q of hits) {
        const t = ((q.x - p1.x) * dx + (q.z - p1.z) * dz) / len2;
        if (t <= 0.001 || t >= 0.999) continue;
        const ang = Math.atan2(q.x - seg.cx, q.z - seg.cz);
        if (isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return true;
      }
    }
  }
  return false;
}
// Hlídat geometrii destičky: nahradí nedosažitelné úseky kontury rovnou
// "mostovou" úsečkou z geometrie destičky (mezní/tečná čára). Konce mostu
// jsou body, kde mezní čára protíná konturu (A=spodní, B=horní) — leží na
// kontuře (camRayIntersection). Úsek kontury mezi nimi se vyřízne a nahradí
// G1 úsečkou; sousední/rozdělený oblouk se zkrátí a pokračuje dál stejným
// tvarem. Funguje i když oba konce leží na TÉŽE entitě (rozdělení oblouku).
// Mostové úseky dostanou fromInsert=true (jiná barva, jinak normální G1).
// Drážka/kapsa ohraničená DVĚMA mezními čarami (zanoření na vjezdu + dojezd
// na výjezdu) — nahradit „V" v PRŮSEČÍKU obou čar: dolů po jedné dosažitelné
// hraně do dna V, nahoru po druhé ven k otevřenému rohu. Bez tohoto by se obě
// čáry zpracovaly samostatně a konfliktovaly (vjezdový most smaže dno, na které
// se výjezdová čára váže → výjezd se neudělá a dráha skončí dole v kontuře).
// Vrací { result, consumed:Set indexů spotřebovaných guides }.
export function mergePocketGuides(segs, guides) {
  let result = segs.map(s => ({ ...s }));
  const consumed = new Set();
  // Vrchol kontury (roh) nejblíž bodu pt do tolerance → {segIdx, at, pt}.
  const vertexNear = (pt) => {
    let best = null, bestD = 0.3;
    for (let i = 0; i < result.length; i++) {
      const s = result[i]; if (s.isDegenerate) continue;
      const a = segStartPoint(s), b = segEndPoint(s);
      const da = Math.hypot(pt.x - a.x, pt.z - a.z); if (da < bestD) { bestD = da; best = { segIdx: i, at: 'start', pt: a }; }
      const db = Math.hypot(pt.x - b.x, pt.z - b.z); if (db < bestD) { bestD = db; best = { segIdx: i, at: 'end', pt: b }; }
    }
    return best;
  };
  // Rozliší u mezní čáry vrcholový (rohový) konec od „hloubkového" (uvnitř
  // entity). Vrací null, když je to nejednoznačné (oba/žádný na rohu).
  const splitGuide = (g) => {
    const e = [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }];
    const v0 = vertexNear(e[0]), v1 = vertexNear(e[1]);
    if (v0 && !v1) return { vtx: v0.pt, deep: e[1], loc: v0 };
    if (v1 && !v0) return { vtx: v1.pt, deep: e[0], loc: v1 };
    return null;
  };
  const cutIdx = (loc) => loc.at === 'start' ? loc.segIdx : loc.segIdx + 1;
  // U lomené čáry (hlídání držáku, g.via) je pro párování do „V" rozhodující
  // jen PRVNÍ úsek od rohu — hrana destičky. Když průsečík V padne až za její
  // konec, dno V destička nedosáhne hranou, ale kapsa je dost široká na
  // zanoření držákem → NEpárovat; každá čára pak přemostí svou stěnu zvlášť
  // a dno kapsy mezi nimi zůstane obrobitelné.
  const firstPtAfterVtx = (g, sp) => {
    if (!g.via || !g.via.length) return null;
    const isUpEnd = Math.hypot(sp.vtx.x - g.x2, sp.vtx.z - g.z2) <= Math.hypot(sp.vtx.x - g.x1, sp.vtx.z - g.z1);
    return isUpEnd ? g.via[0] : g.via[g.via.length - 1];
  };
  for (let zi = 0; zi < guides.length; zi++) {
    if (consumed.has(zi) || guides[zi].kind !== 'zanoreni') continue;
    const zg = splitGuide(guides[zi]); if (!zg) continue;
    for (let di = 0; di < guides.length; di++) {
      if (consumed.has(di) || di === zi || guides[di].kind !== 'dojezd') continue;
      const dg = splitGuide(guides[di]); if (!dg) continue;
      if (Math.hypot(zg.vtx.x - dg.vtx.x, zg.vtx.z - dg.vtx.z) < 0.3) continue;
      const zNext = firstPtAfterVtx(guides[zi], zg), dNext = firstPtAfterVtx(guides[di], dg);
      const V = intersectLinesInfinite(zg.vtx, zNext || zg.deep, dg.vtx, dNext || dg.deep);
      if (!V) continue;
      // Dno V musí být hlubší (menší X) než oba otevřené rohy, ne za osou.
      if (!(V.x < zg.vtx.x - 0.05 && V.x < dg.vtx.x - 0.05) || V.x < -0.01) continue;
      // Dno V musí ležet UVNITŘ obou mezních čar (mezi rohem a hloubkovým
      // koncem), ne na jejich dalekém prodloužení — to spolehlivě odmítne
      // spárování čar ze dvou různých prvků (např. zaoblení + drážka).
      // Lomená čára: rozsah se měří jen po konec hranového úseku (bez rezervy
      // do hloubky — za ním už pokračuje silueta držáku).
      const paramOf = (P, A, B) => { const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz; return L2 < 1e-9 ? 0 : ((P.x - A.x) * dx + (P.z - A.z) * dz) / L2; };
      const tz = paramOf(V, zg.vtx, zNext || zg.deep), td = paramOf(V, dg.vtx, dNext || dg.deep);
      if (tz < -0.2 || tz > (zNext ? 1.05 : 1.3) || td < -0.2 || td > (dNext ? 1.05 : 1.3)) continue;
      // Rohy seřadit podle pozice v kontuře (klíč = segIdx + at).
      const aFirst = cutIdx(zg.loc) <= cutIdx(dg.loc);
      const a = aFirst ? zg : dg, b = aFirst ? dg : zg;
      const i0 = cutIdx(a.loc), i1 = cutIdx(b.loc);
      if (i1 - i0 < 1) continue;            // mezi rohy nic není
      // Kontrola, že úsek mezi rohy je RECESS (zapadá dovnitř, ne ven).
      const openX = Math.min(a.vtx.x, b.vtx.x);
      let dipsIn = false, bulgesOut = false;
      for (let k = i0; k < i1; k++) {
        const s = result[k]; const ax = segStartPoint(s).x, bx = segEndPoint(s).x;
        if (Math.min(ax, bx) < openX - 0.3) dipsIn = true;
        if (Math.max(ax, bx) > Math.max(a.vtx.x, b.vtx.x) + 0.3) bulgesOut = true;
      }
      if (!dipsIn || bulgesOut) continue;
      // Nahradit úsek mezi rohy „V": roh A → dno V → roh B (oba fromInsert).
      const before = result.slice(0, i0);
      const after = result.slice(i1);
      result = [...before,
        { type: 'line', p1: { ...a.vtx }, p2: { x: V.x, z: V.z }, fromInsert: true },
        { type: 'line', p1: { x: V.x, z: V.z }, p2: { ...b.vtx }, fromInsert: true },
        ...after];
      if (after[0]) delete after[0].chainBreak;
      consumed.add(zi); consumed.add(di);
      break;
    }
  }
  return { result, consumed };
}
// ── Horní obálka náběhových stínů ──
// 'zanoreni' čáry (spodní hrana destičky) jsou navzájem ROVNOBĚŽNÉ (stejný
// sklon = úhel spodní hrany). Když čára G leží celá ve stínu jiné G' (G' je
// nad G v jejich společném Z-rozsahu), generuje ji vrchol, který je sám
// zastíněný vyšším vrcholem → je nadbytečná. Bez potlačení by nižší čára
// (od hlubšího/čelního vrcholu) přemostila konturu POD vyšším vrcholem a
// uřízla ho (uživatel: „udělalo dráhy z bodu 8, i když bod 6 leží nad ním").
// Pocketem spárované čáry (drážky) se nepotlačují — řeší je mergePocketGuides.
// Vrací Set indexů potlačených čar; potlačené navíc dostanou _dominated=true.
export function markDominatedGuides(guides, consumed) {
  const dominated = new Set();
  const gZLo = (g) => Math.min(g.z1, g.z2), gZHi = (g) => Math.max(g.z1, g.z2);
  // Výška čáry v daném Z — po částech přes lomené (via) vrcholy; svislý
  // úsek / degenerát → max X koncových bodů (jako dřív).
  const gXAtZ = (g, z) => {
    const pts = guidePolyPoints(g);
    let best = -Infinity;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      if (Math.abs(b.z - a.z) < 1e-9) {
        if (Math.abs(z - a.z) < 1e-6) best = Math.max(best, a.x, b.x);
        continue;
      }
      const t = (z - a.z) / (b.z - a.z);
      if (t >= -1e-6 && t <= 1 + 1e-6) best = Math.max(best, a.x + (b.x - a.x) * t);
    }
    return best === -Infinity ? Math.max(g.x1, g.x2) : best;
  };
  for (let i = 0; i < guides.length; i++) {
    if (guides[i].kind !== 'zanoreni' || consumed.has(i)) continue;
    for (let j = 0; j < guides.length; j++) {
      if (j === i || guides[j].kind !== 'zanoreni' || consumed.has(j)) continue;
      const lo = Math.max(gZLo(guides[i]), gZLo(guides[j]));
      const hi = Math.min(gZHi(guides[i]), gZHi(guides[j]));
      if (hi - lo < 0.1) continue; // bez překryvu v Z = jiná oblast dílce
      const zm = (lo + hi) / 2;
      if (gXAtZ(guides[j], zm) > gXAtZ(guides[i], zm) + 0.05) {
        dominated.add(i);
        guides[i]._dominated = true; // ať se nekreslí jako „zbytečná" čára ve stínu
        break;
      }
    }
  }
  return dominated;
}
// Most mezi DVĚMA body ležícími na kontuře (A, B; lokace lA, lB z
// _locateOnContour): vyřízne úsek kontury mezi nimi a nahradí ho přímým
// mostem (fromInsert). Vrací novou konturu (nebo beze změny, když jsou body
// prakticky totožné). Nemutuje vstup kromě případu splice na jedné entitě
// (result je pracovní kopie z volajícího).
export function bridgeBetweenContourPoints(result, A, B, lA, lB, g) {
  let f, s, fPt, sPt;
  if (lA.key <= lB.key) { f = lA; fPt = A; s = lB; sPt = B; }
  else { f = lB; fPt = B; s = lA; sPt = A; }
  if (s.key - f.key < 1e-4) return result;
  // Most = lomená čára podle mezní čáry g (via z hlídání držáku); bez via
  // jediná přímá úsečka jako dřív. Hranový úsek (od HORNÍHO konce čáry) se
  // pozná podle orientace fPt vůči koncům g.
  const pts = guideBridgePts(g, fPt, sPt);
  const fIsUp = !g || Math.hypot(fPt.x - g.x2, fPt.z - g.z2) <= Math.hypot(fPt.x - g.x1, fPt.z - g.z1);
  const bridges = mkBridgeSegs(pts, fIsUp);
  if (!bridges.length) return result;
  if (f.segIdx === s.segIdx) {
    // Oba konce na jedné entitě → rozdělit: [start..fPt] + most + [sPt..end].
    const seg = result[f.segIdx];
    const head = { ...seg }; setSegEnd(head, fPt); syncArcEndpoints(head);
    const tail = { ...seg }; setSegStart(tail, sPt); syncArcEndpoints(tail); delete tail.chainBreak;
    result.splice(f.segIdx, 1, head, ...bridges, tail);
    return result;
  }
  const before = result.slice(0, f.segIdx + 1).map(x => ({ ...x }));
  setSegEnd(before[before.length - 1], fPt); syncArcEndpoints(before[before.length - 1]);
  const after = result.slice(s.segIdx).map(x => ({ ...x }));
  setSegStart(after[0], sPt); syncArcEndpoints(after[0]); delete after[0].chainBreak;
  return [...before, ...bridges, ...after];
}
// Most z JEDNOHO bodu na kontuře (loc) k druhému konci MIMO konturu (na
// polotovaru). Tři topologie mezní čáry:
//   • downOnStock (ČELNÍ čára u kraje): zahodí nedosažitelné čelo za kotvou a
//     zakončí konturu podél mezní čáry k hraně polotovaru;
//   • NÁBĚHOVÝ STÍN (off míří hluboko do polotovaru, kotva na vnitřním vrcholu):
//     úsek kontury ve stínu destičky se nahradí jedním mostem podél čáry;
//   • PRODLOUŽENÍ K OKRAJI (kotva na krajní entitě): kontura se protáhne k off.
// Vrací novou konturu; při čáře, která nesedí na žádný případ, vrací beze změny.
export function bridgeFromContourToStock(result, g, A, B, lA, lB) {
  const loc = lA || lB, locPt = lA ? A : B, offPt = lA ? B : A;
  // Mostové úsečky z bodu from do to podél mezní čáry (respektuje lomené
  // via vrcholy z hlídání držáku; bez nich jediná přímá úsečka).
  const segsFromTo = (from, to) => mkBridgeSegs(guideBridgePts(g, from, to),
    Math.hypot(from.x - g.x2, from.z - g.z2) <= Math.hypot(from.x - g.x1, from.z - g.z1));
  // ── ČELNÍ mezní čára (downOnStock) ──
  // Kotví na rohu čela u KRAJE kontury a míří k hraně polotovaru. Segment čela
  // za kotvou (k ose) je nedosažitelný — zahodí se a kontura se zakončí podél
  // mezní čáry. Kotva u KONCE: ponech [start..kotva] + most k offPt; u ZAČÁTKU
  // zrcadlově. Kotva uvnitř kontury → jen vizualizace (beze změny).
  // Sem patří i ČELNÍ DOJEZDOVÁ čára bez downOnStock: natočená destička dojíždí
  // na čelo u kraje kontury a nechá ho ŠIKMÉ. Kotva je roh čela (start/konec
  // kontury) a volný konec míří DOPŘEDU (za čelo, větší Z) k ose — stejné
  // zakončení jako downOnStock. Bez tohoto by čára spadla do „náběhového stínu"
  // níže a vrátila se beze změny (práh 5 mm překročí každé čelo nad ~19 mm ⌀),
  // takže by se čelo neobrobilo podle geometrie plátku.
  const frontFaceDojezd = !g.downOnStock && g.kind === 'dojezd'
    && offPt.z > locPt.z + 0.5
    && (loc.segIdx <= 1 || loc.segIdx >= result.length - 2);
  if (g.downOnStock || frontFaceDojezd) {
    // _locateOnContour vrací key = segIdx + t (t≈0 začátek entity, ≈1 konec).
    const tPos = loc.key - loc.segIdx;
    const atEnd = tPos > 0.5;
    // cut = index PRVNÍHO segmentu ZA kotvou (na straně zahozeného čela).
    const cut = atEnd ? loc.segIdx + 1 : loc.segIdx;
    const nearEnd = loc.segIdx >= result.length - 2;
    const nearStart = loc.segIdx <= 1;
    if (nearEnd) {
      const before = result.slice(0, cut).map(x => ({ ...x }));
      if (before.length) {
        if (atEnd) { setSegEnd(before[before.length - 1], locPt); syncArcEndpoints(before[before.length - 1]); }
        return [...before, ...segsFromTo({ ...locPt }, { ...offPt })];
      }
    } else if (nearStart) {
      const after = result.slice(cut).map(x => ({ ...x }));
      if (after.length) {
        if (!atEnd) { setSegStart(after[0], locPt); syncArcEndpoints(after[0]); delete after[0].chainBreak; }
        return [...segsFromTo({ ...offPt }, { ...locPt }), ...after];
      }
    }
    return result;
  }
  // ── STÍN POD KOTVOU (mezní čára oříznutá polotovarem) ──
  // Kotva NAHOŘE na kontuře, dolní konec oříznutý na hranici polotovaru
  // (výstup siluety do vzduchu údolí). Nedosažitelná stěna POD kotvou se
  // nahradí mostem podél čáry; kontura pokračuje prvním segmentem hlubším
  // než konec čáry — navázání přes chainBreak (mezi nimi je VZDUCH,
  // spojnice přes údolí by se chovala jako falešná kontura).
  if (g.downClipped && g.kind === 'zanoreni' && offPt.x < locPt.x + 0.5) {
    const tPos = loc.key - loc.segIdx;
    const ci = tPos < 0.5 ? loc.segIdx : loc.segIdx + 1;
    let keepFrom = -1;
    for (let k = ci; k < result.length; k++) {
      if (segStartPoint(result[k]).z <= offPt.z + 1e-6) { keepFrom = k; break; }
    }
    const before = result.slice(0, ci).map(x => ({ ...x }));
    if (before.length && tPos >= 0.5) {
      setSegEnd(before[before.length - 1], locPt);
      syncArcEndpoints(before[before.length - 1]);
    }
    const bridge = segsFromTo({ ...locPt }, { ...offPt });
    if (keepFrom === -1) return [...before, ...bridge];
    const tail = result.slice(keepFrom).map(x => ({ ...x }));
    tail[0] = { ...tail[0], chainBreak: true };
    return [...before, ...bridge, ...tail];
  }
  const startPt = segStartPoint(result[0]);
  const endPt = segEndPoint(result[result.length - 1]);
  const dStart = Math.hypot(offPt.x - startPt.x, offPt.z - startPt.z);
  const dEnd = Math.hypot(offPt.x - endPt.x, offPt.z - endPt.z);
  if (Math.min(dStart, dEnd) > 5) {
    // ── Náběhový stín destičky ──
    // Off konec míří hluboko do POLOTOVARU a loc kotví na vnitřním vrcholu.
    // Zanořovací čára říká, že úsek kontury od loc dál je ve STÍNU destičky
    // (jede shora, dojede jen k čáře) → nahradí se jedním mostem podél čáry;
    // zbytek kontury hlubší než off (upínací oblast) zůstane.
    if (g.kind !== 'zanoreni' || offPt.x < locPt.x + 0.5) return result;
    // ci = první segment ZA kotvou. _locateOnContour vrací key = segIdx + t
    // (t≈0 začátek entity, ≈1 konec) — pozn.: NEmá pole `at`. Kotva na konci
    // entity (t≥0.5) → stín začíná až další entitou; na začátku → touto.
    const ci = (loc.key - loc.segIdx) < 0.5 ? loc.segIdx : loc.segIdx + 1;
    if (ci >= result.length) return result;
    // Výška mezní čáry v daném Z — po částech přes lomené (via) vrcholy;
    // mimo rozsah lomené čáry extrapolace krajního úseku (jako přímka dřív).
    const shadowPts = guideBridgePts(g, { x: locPt.x, z: locPt.z }, { x: offPt.x, z: offPt.z });
    const lineXAtZ = (z) => {
      let best = null;
      for (let k = 0; k + 1 < shadowPts.length; k++) {
        const a = shadowPts[k], b = shadowPts[k + 1];
        if (Math.abs(b.z - a.z) < 1e-9) { if (Math.abs(z - a.z) < 1e-6) best = Math.max(best ?? -Infinity, a.x, b.x); continue; }
        const t = (z - a.z) / (b.z - a.z);
        const inRange = t >= -1e-6 && t <= 1 + 1e-6;
        const isEdgeSpan = k === 0 || k === shadowPts.length - 2;
        if (inRange || isEdgeSpan && (shadowPts.length === 2 || (k === 0 ? t < 0 : t > 1)))
          best = Math.max(best ?? -Infinity, a.x + (b.x - a.x) * t);
      }
      return best ?? locPt.x;
    };
    // Konec stínu = první segment začínající hlouběji než off (Z ≤ off.z).
    // Cestou ověřit, že je celý stín POD čarou (jinak by most zajel do
    // vystupujícího prvku → přeskočit).
    let keepFrom = -1, ok = true;
    for (let k = ci; k < result.length; k++) {
      const sp = segStartPoint(result[k]), ep = segEndPoint(result[k]);
      if (sp.z <= offPt.z + 1e-6) { keepFrom = k; break; }
      const cap = Math.max(ep.z, offPt.z);
      if (sp.x > lineXAtZ(sp.z) + 0.3 || ep.x > lineXAtZ(cap) + 0.3) { ok = false; break; }
    }
    if (!ok) return result;
    const before = result.slice(0, ci).map(x => ({ ...x }));
    const bridge = segsFromTo({ ...locPt }, { ...offPt });
    if (keepFrom === -1) return [...before, ...bridge];
    const tail = result.slice(keepFrom).map(x => ({ ...x }));
    const connector = { type: 'line', p1: { ...offPt }, p2: segStartPoint(tail[0]), fromInsert: true };
    delete tail[0].chainBreak;
    return [...before, ...bridge, connector, ...tail];
  }
  // ── Prodloužení k okraji ── smí navazovat JEN na krajní entitu kontury.
  // Když loc leží uvnitř kontury (např. spodní konec dopadl paprskem na osu
  // odlitku X=0), tahle větev by smazala celý „ocas" kontury → přeskočit.
  const extendStart = dStart <= dEnd;
  if (extendStart ? loc.segIdx !== 0 : loc.segIdx !== result.length - 1) return result;
  if (extendStart) {
    const after = result.slice(loc.segIdx).map(x => ({ ...x }));
    setSegStart(after[0], locPt); syncArcEndpoints(after[0]); delete after[0].chainBreak;
    return [...segsFromTo({ ...offPt }, { ...locPt }), ...after];
  }
  const before = result.slice(0, loc.segIdx + 1).map(x => ({ ...x }));
  setSegEnd(before[before.length - 1], locPt); syncArcEndpoints(before[before.length - 1]);
  return [...before, ...segsFromTo({ ...locPt }, { ...offPt })];
}
export function buildMachinableContour(segs, guides) {
  if (!guides || guides.length === 0) return segs;
  // Nejdřív drážky/kapsy ohraničené dvojicí mezních čar (V), pak jednotlivé.
  const pocket = mergePocketGuides(segs, guides);
  let result = pocket.result;
  // Potlačit náběhové čáry ležící ve stínu vyšší (rovnoběžné) čáry.
  const dominated = markDominatedGuides(guides, pocket.consumed);
  for (let gi = 0; gi < guides.length; gi++) {
    if (pocket.consumed.has(gi) || dominated.has(gi)) continue;
    const g = guides[gi];
    const A = { x: g.x1, z: g.z1 }, B = { x: g.x2, z: g.z2 };
    if (Math.hypot(A.x - B.x, A.z - B.z) < 0.5) continue;
    const lA = _locateOnContour(result, A), lB = _locateOnContour(result, B);
    if (lA && lB) {
      // Oba konce na kontuře → vyříznout úsek mezi nimi a nahradit mostem.
      result = bridgeBetweenContourPoints(result, A, B, lA, lB, g);
    } else if (lA || lB) {
      // Jeden konec mostu leží MIMO konturu (na polotovaru) — čelní zakončení,
      // náběhový stín, nebo prodloužení k okraji (viz bridgeFromContourToStock).
      result = bridgeFromContourToStock(result, g, A, B, lA, lB);
    }
  }
  // Odstranit nulové úsečky, které vzniknou split-em mostu PŘESNĚ na styku
  // dvou entit (setSegStart/End srazí dotčenou entitu na nulovou délku).
  // Bez toho kolem nich trimAndRemoveLoops vyrobí zpětný „trojúhelník"
  // (projevilo se na hrubování i dokončování u čela). chainBreak přeneseme
  // na následující úsek, ať se nepřeruší řetěz.
  for (let k = result.length - 1; k >= 0; k--) {
    const s = result[k];
    const sp = segStartPoint(s), ep = segEndPoint(s);
    if (Math.hypot(ep.x - sp.x, ep.z - sp.z) <= 1e-3) {
      if (s.chainBreak && k + 1 < result.length) result[k + 1].chainBreak = true;
      result.splice(k, 1);
    }
  }
  return result;
}
// Sjednotí SMĚR průchodu kontury: každý segment se orientuje tak, aby jeho
// začátek navazoval na konec předchozího. Entita nakreslená „pozpátku" (konec
// blíž k předchozímu konci než začátek) se otočí. Bez toho offsetový trimmer
// (spojuje konec→začátek) takovou entitu nenaváže a zahodí ji — typicky oblouk
// nakreslený obráceným směrem zmizí z dráhy. Mění jen orientaci, ne geometrii;
// správně nakreslené kontury (start už navazuje) nechá beze změny. TOL malá,
// ať se nepřeklopí samostatný řetěz (G0 mezera) — tam navazuje až další pas.
export function normalizeContourDirection(segs) {
  const TOL = 0.05;
  // Pass 1: otočení segmentu, jehož KONEC je blíž k předchozímu konci než START
  for (let i = 1; i < segs.length; i++) {
    const prevEnd = segEndPoint(segs[i - 1]);
    const st = segStartPoint(segs[i]);
    const en = segEndPoint(segs[i]);
    const dStart = Math.hypot(prevEnd.x - st.x, prevEnd.z - st.z);
    const dEnd = Math.hypot(prevEnd.x - en.x, prevEnd.z - en.z);
    if (dEnd + 1e-9 < dStart && dEnd < TOL) reverseSeg(segs[i]);
  }
  // Pass 2: "sdílený start" — segment[i] začíná NA STEJNÉM BODĚ jako segment[i-1],
  // ale nenavazuje na jeho KONEC. Typický případ: čelní úsek nakreslený dovnitř
  // od téhož rohu, odkud vychází zkosení. Otočení čelního úseku + přesun před
  // zkosení vytvoří průběžný řetěz: čelo_ven → zkosení → tělo.
  // Pass 2 — rozšířený look-back: kromě segs[i-1] kontrolujeme i segs[i-2].
  // Případ: rozděleného čela (dvě úsečky na stejné ose). Po otočení první
  // poloviny a jejím přesunutí před zeď se druhá polovina ocitne dvě pozice
  // za otočenou první, takže segs[i-1] je zeď a shoda se nenajde. Pohled na
  // segs[i-2] (= právě přesunutá první polovina) ji odhalí a opraví.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < segs.length; i++) {
      const st = segStartPoint(segs[i]);
      const en = segEndPoint(segs[i]);
      // Segment jdoucí k NIŽŠÍMU Z (klesající Z = správný směr chodu kontury
      // od čela k lunete). Takový segment neobracej — je správně orientován.
      // Příklad: bridge čára (5,46)→(9.287,30) sdílí start s wall1 (5,46),
      // ale je to záměrná dráha klouzající k hloubce → neobrátit.
      if (en.z < st.z - TOL) continue;
      // Zkontrolovat segs[i-1] a případně segs[i-2]
      const maxBack = Math.min(2, i);
      for (let back = 1; back <= maxBack; back++) {
        const prevSt = segStartPoint(segs[i - back]);
        const prevEn = segEndPoint(segs[i - back]);
        const dStartToPrevStart = Math.hypot(st.x - prevSt.x, st.z - prevSt.z);
        const dStartToPrevEnd   = Math.hypot(st.x - prevEn.x, st.z - prevEn.z);
        if (dStartToPrevStart < TOL && dStartToPrevEnd > TOL) {
          reverseSeg(segs[i]);
          const seg = segs.splice(i, 1)[0];
          segs.splice(i - back, 0, seg); // vložit před segment, jehož start sdílíme
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return segs;
}
// Vyhledá "mostové" segmenty — nově nakreslené úseky, které na konturu
// nenavazují v pořadí kreslení (G0 mezera před i po), ale oba jejich konce
// geometricky dopadají do vnitřku dvou jiných segmentů kontury. Takový
// segment se vloží na své geometrické místo místo úseku, který "přemosťuje" —
// ten (a segmenty mezi ním) se z hlavní kontury odstraní.
export function spliceBridgeSegments(segs) {
  let result = segs.map(s => structuredClone(s));
  for (let bi = 0; bi < result.length; bi++) {
    if (result.length < 2) break;
    const bridge = result[bi];
    if (bridge.isDegenerate) continue;
    const bStart = segStartPoint(bridge);
    const bEnd = segEndPoint(bridge);
    const prevConnected = bi > 0 &&
      Math.hypot(segEndPoint(result[bi - 1]).x - bStart.x, segEndPoint(result[bi - 1]).z - bStart.z) < 1e-4;
    const nextConnected = bi < result.length - 1 &&
      Math.hypot(segStartPoint(result[bi + 1]).x - bEnd.x, segStartPoint(result[bi + 1]).z - bEnd.z) < 1e-4;
    if (prevConnected && nextConnected) continue;

    let aIdx = -1, bIdx = -1;
    for (let k = 0; k < result.length; k++) {
      if (k === bi) continue;
      if (!prevConnected && aIdx === -1 && pointOnSegInterior(bStart, result[k])) aIdx = k;
      if (!nextConnected && bIdx === -1 && pointOnSegInterior(bEnd, result[k])) bIdx = k;
    }
    if (prevConnected) aIdx = bi - 1;
    if (nextConnected) bIdx = bi + 1;
    if (aIdx === -1 || bIdx === -1 || aIdx === bIdx) continue;

    const segA = result[aIdx], segB = result[bIdx];
    if (!prevConnected) { setSegEnd(segA, bStart); syncArcEndpoints(segA); }
    if (!nextConnected) { setSegStart(segB, bEnd); syncArcEndpoints(segB); }

    const lo = Math.min(aIdx, bIdx), hi = Math.max(aIdx, bIdx);
    const newArr = [];
    for (let k = 0; k < result.length; k++) {
      if (k === bi) continue;
      if (k > lo && k < hi) continue;
      newArr.push(result[k]);
      if (k === aIdx) newArr.push(bridge);
    }
    return spliceBridgeSegments(newArr);
  }
  return result;
}
// Profilování kontury průchodem grafem — v každém bodě kde z něj vychází
// dvě cesty vybere tu vnější (vyšší X = větší poloměr na soustruhu).
// Fotky/případy uživatele:
//   1. Bod se dvěma výstupy: nahoru (vyšší X) vs dolů → vybere nahoru.
//   2. Bod 21→20 vs 21→dolu → vybere 20 (vyšší X).
//   3. Bod 23: větev po mezní čáře destičky (fromInsert) vs oblouk → vybere mezní čáru.
//   4. Bod 24: oblouk nahoru (vyšší X na start) vs dolů → vybere nahoru.
// Vrací { segs: výsledné segmenty, hadBranches: zda byly větvení }.
export function resolveOuterProfile(segs) {
  if (!segs || segs.length <= 2) return { segs, hadBranches: false };
  const TOL = 0.02;
  const ptKey = (p) => `${Math.round(p.x / TOL)},${Math.round(p.z / TOL)}`;
  const segSt = (s) => s.type === 'line' ? s.p1
    : { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
  const segEn = (s) => s.type === 'line' ? s.p2
    : { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };

  // Pre-split: pokud endpoint jiného segmentu padá na interior LINE segmentu,
  // rozdělíme ho tam — aby traversal mohl pokračovat z bridgových koncových bodů.
  // Příklad: bridge (5,46)→(9.287,30) končí uvnitř face_bot (8,30)→(10,30).
  // Face_bot se splitne na (8,30)→(9.287,30) + (9.287,30)→(10,30),
  // takže traversal po bridge najde cestu (9.287,30)→(10,30).
  const splitSegs = [];
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    if (seg.isDegenerate || seg.type !== 'line') { splitSegs.push(seg); continue; }
    let cur2 = seg;
    for (let sj = 0; sj < segs.length; sj++) {
      if (sj === si) continue;
      const endPt = segEn(segs[sj]);
      const dx = cur2.p2.x - cur2.p1.x, dz = cur2.p2.z - cur2.p1.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-10) continue;
      const t = ((endPt.x - cur2.p1.x) * dx + (endPt.z - cur2.p1.z) * dz) / len2;
      if (t < 0.05 || t > 0.95) continue;
      const cross = Math.abs((endPt.x - cur2.p1.x) * dz - (endPt.z - cur2.p1.z) * dx) / Math.sqrt(len2);
      if (cross > TOL * 2) continue;
      // endPt leží uvnitř cur2 — split na dvě části
      const snap = { x: cur2.p1.x + t * dx, z: cur2.p1.z + t * dz };
      splitSegs.push({ ...cur2, p2: snap });
      cur2 = { ...cur2, p1: snap };
    }
    splitSegs.push(cur2);
  }

  // Sestavit mapu: klíč počátečního bodu → [segmenty odcházející z něho].
  // Degenerované segmenty (start == konec, např. duplicitní bod z CADu)
  // vynechat — jinak by v uzlu vystupovaly jako falešná větev.
  const startMap = new Map();
  const endKeys = new Set();
  for (const seg of splitSegs) {
    const stK = ptKey(segSt(seg)), enK = ptKey(segEn(seg));
    if (seg.isDegenerate || stK === enK) continue;
    if (!startMap.has(stK)) startMap.set(stK, []);
    startMap.get(stK).push(seg);
    endKeys.add(enK);
  }
  const hadBranches = [...startMap.values()].some(arr => arr.length > 1);
  if (!hadBranches) return { segs, hadBranches: false };

  // X na začátku segmentu (pro výběr vnější větve):
  // u oblouku vezmeme X v 10 % délky, aby šlo detekovat směr zakřivení
  const getInitX = (s) => {
    if (s.type === 'arc') {
      const a = s.startAngle + (s.endAngle - s.startAngle) * 0.1;
      return s.cx + Math.sin(a) * s.r;
    }
    return segEn(s).x;
  };

  // Seedy řetězců: body, které NEJSOU koncem žádného segmentu = začátek
  // souvislého řetězce (první bod kontury nebo bod hned za G0 mezerou).
  // Kontura bývá rozdělená G0 přeskoky na víc nesouvislých řetězců —
  // každý profilujeme zvlášť a spojíme (jinak by se traversal utnul na
  // první mezeře a vrátil jen pár prvních segmentů).
  const seedKeys = [];
  const seenSeed = new Set();
  for (const seg of splitSegs) {
    const stK = ptKey(segSt(seg));
    if (seg.isDegenerate || stK === ptKey(segEn(seg))) continue;
    if (!endKeys.has(stK) && !seenSeed.has(stK)) { seenSeed.add(stK); seedKeys.push(stK); }
  }
  // Fallback: pokud nemá kontura žádný „volný" začátek (čistě uzavřená
  // smyčka), startovat od prvního segmentu jako dřív.
  if (seedKeys.length === 0) seedKeys.push(ptKey(segSt(segs[0])));

  // Průchod grafem od daného bodu, výběr vnější větve v každém uzlu
  const result = [];
  const visited = new Set();
  const maxSteps = splitSegs.length * 2 + 5;
  let firstChain = true;
  for (const seedK of seedKeys) {
    if (visited.has(seedK) || !startMap.has(seedK)) continue;
    let cur = seedK;
    let firstOfChain = true;
    for (let step = 0; step < maxSteps; step++) {
      const k = cur;
      if (visited.has(k)) break;
      visited.add(k);
      const cands = startMap.get(k) || [];
      if (!cands.length) break;

      let chosen;
      if (cands.length === 1) {
        chosen = cands[0];
      } else {
        // Pravidlo 0: vyloučit větve jejichž cílový bod je již navštívený
        // — takový segment vede zpátky do uzavřené smyčky/kapsy a ne ven
        // na vnější profil (platí i když má vyšší X než správná větev).
        const nonCycling = cands.filter(s => !visited.has(ptKey(segEn(s))));
        const pool = nonCycling.length > 0 ? nonCycling : cands;
        // Pravidlo 1: upřednostnit segment z Hlídání geometrie (fromInsert)
        const insertSeg = pool.find(s => s.fromInsert);
        if (insertSeg) {
          chosen = insertSeg;
        } else {
          // Pravidlo 2: vybrat větev s nejvyšším X (vnějšek soustruhu)
          chosen = pool.reduce((best, s) => getInitX(s) > getInitX(best) ? s : best);
        }
      }
      // První segment řetězce za G0 mezerou označit chainBreak — dráha
      // sem najede rychloposuvem (mezi řetězci se neřeže spojnice).
      if (firstOfChain && !firstChain) chosen = { ...chosen, chainBreak: true };
      result.push(chosen);
      cur = ptKey(segEn(chosen));
      firstOfChain = false;
    }
    firstChain = false;
  }

  return { segs: result.length > 0 ? result : segs, hadBranches: true };
}

// protnutí dvou nesousedních segmentů znamená, že úsek mezi nimi leží
// "pod" výslednou konturou a CAM dráhy by ho neměly brát v potaz.
export function removeContourSelfIntersections(segs) {
  if (segs.length < 3) return segs;
  const result = segs.map(s => structuredClone(s));
  let loopFound = true, iterations = 0;
  while (loopFound && iterations < 10) {
    loopFound = false; iterations++;
    outerLoop:
    for (let i = 0; i < result.length - 2; i++) {
      for (let j = i + 2; j < result.length; j++) {
        const s1 = result[i], s2 = result[j];
        const pt = findSegIntersection(s1, s2);
        if (pt && isWithinSegStrict(pt, s1) && isWithinSegStrict(pt, s2)) {
          const s1End = segEndPoint(s1);
          const s2Start = segStartPoint(s2);
          const d1 = Math.hypot(pt.x - s1End.x, pt.z - s1End.z);
          const d2 = Math.hypot(pt.x - s2Start.x, pt.z - s2Start.z);
          if (d1 < LOOP_INTERIOR_MIN || d2 < LOOP_INTERIOR_MIN) continue;
          // Přeskočit sdílené krajní body: průsečík na ZAČÁTKU s1 nebo KONCI s2
          // = uzavřený polygon sdílí počáteční bod (ne skutečné samoprotnutí).
          const s1St = segStartPoint(s1), s2En = segEndPoint(s2);
          const ds1 = Math.hypot(pt.x - s1St.x, pt.z - s1St.z);
          const ds2 = Math.hypot(pt.x - s2En.x, pt.z - s2En.z);
          if (ds1 < LOOP_INTERIOR_MIN || ds2 < LOOP_INTERIOR_MIN) continue;
          setSegEnd(s1, pt);
          setSegStart(s2, pt);
          syncArcEndpoints(s1);
          syncArcEndpoints(s2);
          result.splice(i + 1, j - (i + 1));
          loopFound = true;
          break outerLoop;
        }
      }
    }
  }
  return result;
}
export function trimAndRemoveLoops(rawSegs, opts = {}) {
  // opts.bridgeCollinear: pokud true, přemostí nesousední LINE segmenty
  // ležící na stejné nekonečné přímce (potlačí drážky/štěrbiny užší než
  // přídavek). Default false — vhodné pro stock generation, ne pro cutting.
  if (rawSegs.length === 0) return [];
  const result = [structuredClone(rawSegs[0])];
  // 1. local trimming
  for (let i = 0; i < rawSegs.length - 1; i++) {
    const prevOff = result[result.length - 1];
    const nextOff = structuredClone(rawSegs[i + 1]);
    // chainBreak = mezi předchozím a tímto segmentem v raw konturě nic
    // nebylo nakresleno (G0 přeskok mezi nesouvisejícími entitami) — žádné
    // trimování ani spojovací přemostění, dráha sem najede samostatně.
    if (nextOff.chainBreak) {
      result.push(nextOff);
      continue;
    }
    const intersection = findSegIntersection(prevOff, nextOff);
    if (intersection) {
      setSegEnd(prevOff, intersection);
      setSegStart(nextOff, intersection);
      syncArcEndpoints(prevOff);
      syncArcEndpoints(nextOff);
      // Přeskočit úsek, jehož počátek byl trimem posunut za jeho konec
      // (obrácený segment = nástroj by musel jet zpět přes již obrobený materiál).
      // VÝJIMKA: průsečík padl ZA raw konec segmentu (tRaw > 1) — segment není
      // skutečně obrácený, jen zatím "přetažený". Peek-ahead: ověřit, zda příští
      // trim segment opraví dopředu. Pokud by zůstal obrácený (průsečík příliš
      // blízko rohu čela → nástroj by zajel do kontury), přeskočit i jeho.
      if (nextOff.type === 'line') {
        const ox = rawSegs[i + 1].p2.x - rawSegs[i + 1].p1.x;
        const oz = rawSegs[i + 1].p2.z - rawSegs[i + 1].p1.z;
        const dx = nextOff.p2.x - nextOff.p1.x, dz = nextOff.p2.z - nextOff.p1.z;
        if (dx * ox + dz * oz < 0) {
          const rawLen2 = ox * ox + oz * oz;
          if (rawLen2 > 1e-12) {
            const tRaw = ((nextOff.p1.x - rawSegs[i + 1].p1.x) * ox +
                          (nextOff.p1.z - rawSegs[i + 1].p1.z) * oz) / rawLen2;
            if (tRaw <= 1 + 1e-6) { continue; } // průsečík uvnitř → skutečný zpětný řez
            // tRaw > 1: průsečík za koncem. Peek-ahead: příští trim napraví?
            if (i + 2 < rawSegs.length && !rawSegs[i + 2].chainBreak &&
                rawSegs[i + 2].type === 'line') {
              const nn = rawSegs[i + 2];
              const c2 = intersectLinesInfinite(nextOff.p1, nextOff.p2, nn.p1, nn.p2);
              if (c2) {
                const dx2 = c2.x - nextOff.p1.x, dz2 = c2.z - nextOff.p1.z;
                if (dx2 * ox + dz2 * oz < 0) continue; // stále obrácený → přeskočit
              }
            }
          } else { continue; }
        }
      }
      result.push(nextOff);
    } else {
      let corner = null;
      if (prevOff.type === 'line' && nextOff.type === 'line') {
        corner = intersectLinesInfinite(prevOff.p1, prevOff.p2, nextOff.p1, nextOff.p2);
      }
      if (corner) {
        prevOff.p2 = corner; nextOff.p1 = corner;
      } else {
        const pStart = getSegEnd(prevOff);
        const pEnd = getSegStart(nextOff);
        result.push({ type: 'line', p1: pStart, p2: { x: pEnd.x, z: pStart.z } });
        if (Math.abs(pEnd.z - pStart.z) > 0.001)
          result.push({ type: 'line', p1: { x: pEnd.x, z: pStart.z }, p2: pEnd });
      }
      result.push(nextOff);
    }
  }
  // 2. global loop removal (handles all segment type combos)
  if (result.length > 2) {
    let loopFound = true, iterations = 0;
    while (loopFound && iterations < 5) {
      loopFound = false; iterations++;
      outerLoop:
      for (let i = 0; i < result.length - 2; i++) {
        for (let j = i + 2; j < result.length; j++) {
          const s1 = result[i], s2 = result[j];
          if (s1.isDegenerate || s2.isDegenerate) continue;
          // Smyčka nesmí spláchnout přechod mezi samostatnými řetězy (subpath) —
          // ty zůstávají oddělené, i kdyby se jejich offsety geometricky kryly.
          let crossesChainBreak = false;
          for (let k = i + 1; k <= j; k++) if (result[k].chainBreak) { crossesChainBreak = true; break; }
          if (crossesChainBreak) continue;
          const pt = findSegIntersection(s1, s2);
          if (pt && isOnSegBounds(pt, s1) && isOnSegBounds(pt, s2)) {
            // True loop musí mít průsečík dostatečně uvnitř s1 i s2.
            const s1End = segEndPoint(s1);
            const s2Start = segStartPoint(s2);
            const d1 = Math.hypot(pt.x - s1End.x, pt.z - s1End.z);
            const d2 = Math.hypot(pt.x - s2Start.x, pt.z - s2Start.z);
            if (d1 < LOOP_INTERIOR_MIN || d2 < LOOP_INTERIOR_MIN) continue;
            // Skutečná smyčka = směry segmentů jsou ~opačné (path se vrací).
            // Fillet (segment mezi ~kolmými lines/arcs) má směry pod úhlem
            // ~90° → není loop, jen rounded corner.
            const exitDir = (seg) => {
              if (seg.type === 'line') {
                const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
                const l = Math.hypot(dx, dz);
                return l > 1e-6 ? { x: dx / l, z: dz / l } : null;
              }
              const sign = seg.dir === 'G2' ? -1 : 1;
              return { x: sign * Math.cos(seg.endAngle), z: -sign * Math.sin(seg.endAngle) };
            };
            const entryDir = (seg) => {
              if (seg.type === 'line') {
                const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
                const l = Math.hypot(dx, dz);
                return l > 1e-6 ? { x: dx / l, z: dz / l } : null;
              }
              const sign = seg.dir === 'G2' ? -1 : 1;
              return { x: sign * Math.cos(seg.startAngle), z: -sign * Math.sin(seg.startAngle) };
            };
            const e1 = exitDir(s1), n2 = entryDir(s2);
            if (e1 && n2) {
              const dot = e1.x * n2.x + e1.z * n2.z;
              if (dot > -0.5) continue; // ne dost opačné → není loop
            }
            setSegEnd(s1, pt);
            setSegStart(s2, pt);
            syncArcEndpoints(s1);
            syncArcEndpoints(s2);
            result.splice(i + 1, j - (i + 1));
            loopFound = true;
            break outerLoop;
          }
        }
      }
    }
  }
  // 3. collinear bridging — řeší případ, kdy dva nesousední LINE segmenty
  // leží na stejné nekonečné přímce (typicky dvě OD strany drážky, jejichž
  // ofsety se po překlopení přídavkem překrývají). Vložky mezi nimi
  // (drážka, štěrbina) se nahradí přímým spojením po té přímce.
  // POUZE pokud volající explicitně požádá (opt-in) — pro cutting paths
  // by mohlo zakrýt skutečně dosažitelné feature.
  if (opts.bridgeCollinear && result.length > 2) {
    let bridged = true, iter = 0;
    while (bridged && iter < 5) {
      bridged = false; iter++;
      outerB:
      for (let i = 0; i < result.length - 2; i++) {
        const s1 = result[i];
        if (s1.type !== 'line' || s1.isDegenerate) continue;
        const d1x = s1.p2.x - s1.p1.x, d1z = s1.p2.z - s1.p1.z;
        const l1 = Math.hypot(d1x, d1z);
        if (l1 < 1e-6) continue;
        for (let j = i + 2; j < result.length; j++) {
          const s2 = result[j];
          if (s2.type !== 'line' || s2.isDegenerate) continue;
          const d2x = s2.p2.x - s2.p1.x, d2z = s2.p2.z - s2.p1.z;
          const l2 = Math.hypot(d2x, d2z);
          if (l2 < 1e-6) continue;
          // paralelní (cross ≈ 0) a stejný směr (dot > 0)
          const cross = (d1x / l1) * (d2z / l2) - (d1z / l1) * (d2x / l2);
          if (Math.abs(cross) > 1e-3) continue;
          const dot = (d1x / l1) * (d2x / l2) + (d1z / l1) * (d2z / l2);
          if (dot < 0.99) continue;
          // s2.p1 leží na nekonečné přímce s1
          const px = s2.p1.x - s1.p1.x, pz = s2.p1.z - s1.p1.z;
          const perpDist = Math.abs(px * (d1z / l1) - pz * (d1x / l1));
          if (perpDist > TRIM_TOL) continue;
          // alespoň jeden meziostřední segment musí od přímky odbočit (= skutečný „výlet")
          let hasExcursion = false;
          for (let k = i + 1; k < j; k++) {
            const sk = result[k];
            const ptK = sk.type === 'line' ? sk.p2 : { x: sk.cx + Math.sin(sk.endAngle) * sk.r, z: sk.cz + Math.cos(sk.endAngle) * sk.r };
            const dKx = ptK.x - s1.p1.x, dKz = ptK.z - s1.p1.z;
            const perp = Math.abs(dKx * (d1z / l1) - dKz * (d1x / l1));
            if (perp > TRIM_TOL * 5) { hasExcursion = true; break; }
          }
          if (!hasExcursion) continue;
          // sloučit i..j do jedné přímky s1.p1 → s2.p2 (po stejné přímce)
          result[i] = { type: 'line', p1: { x: s1.p1.x, z: s1.p1.z }, p2: { x: s2.p2.x, z: s2.p2.z } };
          result.splice(i + 1, j - i);
          bridged = true;
          break outerB;
        }
      }
    }
  }
  return result;
}

// Když kontura začíná na ose (čelo do středu, X≈0), offsetová dráha se kvůli
// korekci R od osy odlepí (první bod má malé X>0). Protáhnout první úsek
// offsetu po jeho směru zpět až na X=0, ať nástroj dojede až do středu.
// Volá se na hrubovací i dokončovací offset (požadavek uživatele: obě čáry
// k ose). Bezpečné: pokud první úsek na ose už je (čelní offset), nedělá nic.
export function extendOffsetStartToAxis(path) {
  if (!path || path.length === 0) return;
  const s = path[0];
  if (s.type !== 'line' || !s.p1 || !s.p2) return;
  if (Math.abs(s.p1.x) < 1e-6) return;            // už na ose
  const dx = s.p2.x - s.p1.x, dz = s.p2.z - s.p1.z;
  if (Math.abs(dx) < 1e-9) return;                // svislý úsek — protažení v X nedává smysl
  const t = -s.p1.x / dx;                          // parametr, kde úsek protne X=0
  if (t >= 0) return;                              // X=0 leží ve směru jízdy (uvnitř/za) → neprotahovat zpět
  s.p1 = { x: 0, z: s.p1.z + t * dz };
}

// ── resolvePointsToAbsolute ────────────────────────────────────
export function resolvePointsToAbsolute(pts) {
  let lastX = 0, lastZ = 0;
  return pts.map(p => {
    let valX = parseFloat(p.x); if (isNaN(valX)) valX = 0;
    let valZ = parseFloat(p.z); if (isNaN(valZ)) valZ = 0;
    let absX, absZ;
    if (p.mode === 'INC') { absX = lastX + valX; absZ = lastZ + valZ; }
    else { absX = valX; absZ = valZ; }
    lastX = absX; lastZ = absZ;
    let rVal = parseFloat(p.r); if (isNaN(rVal)) rVal = 0;
    return { ...p, xAbs: absX, zAbs: absZ, rVal };
  });
}

// ── Složení oboustranné kontury na jednu stranu ────────────────
// Soustružnická kontura je JEDNOSTRANNÁ (profil poloměru, jen jedna strana
// osy rotace). Když uživatel v CADu nakreslí CELÝ obrys (vrch i zrcadlený
// spodek), kontura střídá +X a −X úseky přes osu (každá entita je v exportu
// uvozena G0 na svůj počátek, pak přijde její zrcadlo). CAM by jinak offsetoval
// a obráběl i spodní (zrcadlenou) půlku → dráhy v materiálu, přejezdy pod osu
// a falešné offsetové oblouky ze záporných X.
//
// Funkce takovou oboustrannou konturu složí na stranu polotovaru: body na
// opačné straně osy zahodí. Protože každá +X entita je uvozena G0 na svůj
// počátek, po odstranění −X bodů zůstane plně navázaný jednostranný profil.
// Jednostranné kontury (běžný případ) vrací beze změny.
export function foldContourToMachiningSide(points, stockPoints) {
  const eps = 0.01;
  let hasPos = false, hasNeg = false;
  for (const p of points) {
    if (p.xReal > eps) hasPos = true;
    else if (p.xReal < -eps) hasNeg = true;
  }
  if (!(hasPos && hasNeg)) return points; // jednostranná → beze změny

  // Strana obrábění = strana osy, kde leží polotovar (jinak strana kontury
  // s největším dosahem od osy).
  let machSign = 0, maxAbs = 0;
  for (const p of (stockPoints || [])) {
    if (Math.abs(p.xReal) > maxAbs) { maxAbs = Math.abs(p.xReal); machSign = Math.sign(p.xReal); }
  }
  if (machSign === 0) {
    maxAbs = 0;
    for (const p of points) {
      if (Math.abs(p.xReal) > maxAbs) { maxAbs = Math.abs(p.xReal); machSign = Math.sign(p.xReal); }
    }
  }
  if (machSign === 0) machSign = 1;

  // Ponech body na ose (X≈0) i na straně obrábění; zrcadlo za osou zahoď —
  // VYJMA úsečky protínající osu (typicky čelo / upíchnutí, které uživatel
  // nakreslil přes celý průměr od +X k −X). Tu na ose (X=0) oříznout, ať
  // kontura dojede až do středu, místo aby celé čelo vypadlo.
  const kept = [];
  for (let idx = 0; idx < points.length; idx++) {
    const p = points[idx];
    if (p.xReal * machSign >= -eps) { kept.push(p); continue; }
    const prev = points[idx - 1];
    if (p.type === 'G1' && prev && prev.xReal * machSign > eps) {
      const dx = p.xReal - prev.xReal;
      if (Math.abs(dx) > 1e-9) {
        const t = (0 - prev.xReal) / dx;           // parametr, kde úsečka protne osu
        const zAxis = prev.zReal + t * (p.zReal - prev.zReal);
        kept.push({ ...p, x: 0, xAbs: 0, xReal: 0, z: zAxis, zAbs: zAxis, zReal: zAxis });
      }
    }
    // ostatní body za osou zahodit
  }
  return kept.length >= 2 ? kept : points;
}

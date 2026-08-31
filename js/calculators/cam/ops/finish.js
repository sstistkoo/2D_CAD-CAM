// ╔═════════════════════════════╗
// ║  OPERACE: DOKONČOVÁNÍ            ║
// ╚═════════════════════════════╝
// Vyňato z `cam/calculatePipeline.js` (rozdělení podle OPERACÍ, plán §3.A).
// Staví DOKONČOVACÍ dráhu: offset kontury o rádius plátku, ořezaný
//   • hlídáním DESTIČKY (kam boční ostří nedosáhne),
//   • hlídáním DRŽÁKU (`makeFinishTipGuard` — překážkou je skutečný materiál,
//     ne silueta hrubovacího offsetu),
//   • pravidlem „CELÝ, NEBO VŮBEC" (rozhodnutí uživatele 11. 8. 2026).
//
// Vynechané úseky nezmizí: putují do `finishUnreachablePath` (tečkovaně
// v náhledu a jako překážka pro rychloposuvy).
//
// `finishUnreachablePath` a `foundErrors` se předávají jako ŽIVÁ POLE —
// funkce do nich zapisuje. Vrací se `finishOffsetPath`, protože ten se
// uvnitř PŘIŘAZUJE (ne mutuje).
//
// Protažení offsetů k ose (`extendOffsetStartToAxis`) sem NEPATŘÍ: dělá se
// pro hrubovací i dokončovací čáru najednou, takže zůstalo v pipeline.

import { dropTinyArcs, getNormal, intersectSegAtZ, syncArcEndpoints } from '../camMath.js';
import { machinableRangeOf, segInterferesWithTool, trimAndRemoveLoops } from '../contourBuild.js';
import { makeFinishTipGuard } from '../toolEnvelope.js';
import { fitArcsToPolyline, samplePartingEnvelope } from '../camMath.js';
import { maxXAt } from '../passHelpers.js';

/**
 * @param ctx  vstupy z `computeCalculation()` — viz destrukturace níž
 * @returns    `finishOffsetPath` (dokončovací dráha)
 */
export function buildFinishPath(ctx) {
  const {
    prms, clearance, contourSegments, preBridgeContour, machinableContour,
    rawContourForInterference, stockPathSegments, tipR,
    finishUnreachablePath, foundErrors,
  } = ctx;
  let finishOffsetPath = [];
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
  // Vlastní obálka držáku pro dokončování: překážkou je SKUTEČNÝ materiál
  // (silueta finální kontury), ne silueta hrubovacího offsetu z
  // holderClampZEnd — po té dokončovací dráha z definice jede uvnitř,
  // takže by tvrdý test zakázal úplně všechno (viz makeFinishTipGuard).
  let finHolderGuard = null;
  if (prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__) {
    try {
      finHolderGuard = makeFinishTipGuard(prms, preBridgeContour, { backside: false, stockPathSegments });
    } catch (err) {
      console.warn('CAM: obálku držáku pro dokončování se nepodařilo sestavit:', err);
    }
  }
  const holderBlocks = (fs) => !!finHolderGuard
    && segSamplePts(fs).some(p => finHolderGuard.isForbidden(p.x, p.z));
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
    // MEZ DOJEZDU Z HLÍDÁNÍ DESTIČKY. Mezní čára neomezuje jen CELÉ úseky:
    // stín nedosažitelné strmé stěny ořízne i sousední, jinak dosažitelný
    // válec. `buildMachinableContour` to zná (hrubování po ní jede), ale
    // dokončování jelo po syrové kontuře až do rohu — na dílu uživatele
    // válec X9,117 pokračoval na Z243,123, i když mezní čára „dojezd" ho
    // končí na Z245,966, a poslední 2,9 mm bralo naráz materiál, který tam
    // hrubování nechalo stát (naměřeno 29 mm², tříska až 14 mm).
    //
    // Pravidlo „CELÝ, NEBO VŮBEC" (rozhodnutí uživatele 11. 8. 2026) platí
    // i tady, a to i pro ÚSEČKY: úsek, na který se kvůli mezní čáře nedá
    // dojet celý, se neobrábí vůbec — ani zkrácený. Jinak zůstane na hotové
    // ploše přechod mezi dokončenou a nedokončenou částí uprostřed úsečky.
    if (!blocked && respectFin && machinableContour) {
      const r = machinableRangeOf(seg, machinableContour);
      if (!r || r.t0 > 1e-4 || r.t1 < 1 - 1e-4) blocked = true;
    }
    // CELÝ, NEBO VŮBEC (pravidlo uživatele, 11. 8. 2026). Částečně
    // dosažitelný oblouk (špička dojede po vrchol vypuklého rohu, ale ne
    // do navazující strmé stěny) se dřív ořízl na dosažitelnou část a ta
    // se obrobila. Geometricky to bezpečné je, ale technologicky ne:
    // v půlce rádiusu vznikne přechod mezi dokončenou a nedokončenou
    // plochou = viditelný schod/ryska přesně tam, kde je díl vidět.
    // Kus, který nejde udělat celý, se proto vynechá celý; navazující
    // materiál se místo toho dobere ROVNÝM PRŮMĚREM (přímý výjezd v ose
    // Z na konci řetězu, viz `finRunOut` v gcodeEmit.js).
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
  // NULOVÉ ÚSEKY (p1 ≡ p2) — vznikají ořezem dvou kolineárních segmentů
  // (kontura z CADu mívá na přímce zbytečný bod). Neobrábějí nic, ale
  // projdou všemi filtry a v emisi kolem sebe vyrobí NÁJEZD I ODJEZD:
  // nástroj sjede rampou do materiálu, neudělá nic a vyjede ven — přesně
  // to na dílu uživatele zůstalo, když sousední (skutečné) úseky vypadly
  // kvůli držáku a osiřelý nulový úsek jako jediný přežil.
  // chainBreak se dědí, jen když ho nulový úsek měl (jinak jsou sousedi
  // spojití a přejezd by se vyrobil zbytečně).
  for (let i = finishOffsetPath.length - 1; i >= 0; i--) {
    const s = finishOffsetPath[i];
    if (s.type !== 'line' || Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z) > 1e-3) continue;
    finishOffsetPath.splice(i, 1);
    if (s.chainBreak && i < finishOffsetPath.length) finishOffsetPath[i].chainBreak = true;
  }
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
  return finishOffsetPath;
}

/**
 * Dokončování UPICHOVÁKEM: dráha po obálce plátku místo po holém
 * offsetu. Vrací (případně přepsanou) dokončovací dráhu.
 */
export function finishPartingEnvelope(prms, finishOffsetPath) {
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
  return finishOffsetPath;
}

/**
 * Pásový ořez dokončovací dráhy (rozsah 📐 i čelisti/koník).
 * @returns { path, trimmed, dropped }
 */
export const __X = 0; // Díl se obrábí po ÚSECÍCH — hrubování pás respektuje (podélné i čelní),
// dokončování jelo pořád přes celý díl. Hrubovací strategie si rozsah
// vyzvedávají z `passCtx`, dokončovací dráha vzniká tady, takže se ořezává
// tady.
//
// NA ROZDÍL OD ČELISTÍ/KONÍKU NENÍ ROZSAH POLOROVINA, ALE PÁS: může uříznout
// oba konce a nechat kus uprostřed, případně z jednoho segmentu vyrobit dva.
// Proto se jde segment po segmentu a hledají se souvislé úseky uvnitř pásu,
// ne „všechno za první hranicí" jako u limitů níž.
//
// OŘEZÁVÁ SE, NEZAHAZUJE. Pravidlo „celý, nebo vůbec" (rozhodnutí uživatele
// 11. 8. 2026) tu neplatí: to řeší úseky NEDOSAŽITELNÉ pro nástroj, kde by
// zkrácení nechalo schod uprostřed hotové plochy. Hranice pásu je naproti
// tomu volba uživatele — „tady končí tenhle úsek, zbytek dodělá jiná
// operace" — a hrubování se na ní ořezává úplně stejně.
//
// TÝŽ OŘEZ POUŽÍVAJÍ I ČELISTI S KONÍKEM (viz volání níž) — [chuck, tail] je
// taky pás, jen postavený z jiných čísel. Dokud měly vlastní implementaci,
// platilo v ní pravidlo „za prvním ořezem už jsme v zakázané zóně", což je
// pravda jen pro limit na KONCI jízdy: dokončování jede od velkého Z
// k malému, takže koník potká jako PRVNÍ — a smazal celou operaci místo
// zkrácení zprava (part-15 + koník Z200: 8 úseků → 0, čelisti Z100 přitom
// ořezaly správně na 5). Pásový ořez to řeší z principu: nezná pojem
// „za hranicí", jen „uvnitř / venku".
export const clipFinishBand = (path, { zLo = -Infinity, zHi = Infinity, xLo = -Infinity, xHi = Infinity }) => {
  const inBand = (p) => p.z >= zLo - 1e-6 && p.z <= zHi + 1e-6
    && p.x >= xLo - 1e-6 && p.x <= xHi + 1e-6;
  // Rozvinutí oblouku do jízdního směru — táž normalizace jako u segSamplePts.
  const sweepOf = (s) => {
    let a0 = s.startAngle, a1 = s.endAngle;
    if (s.dir === 'G2' && a1 > a0) a1 -= 2 * Math.PI;
    if (s.dir === 'G3' && a1 < a0) a1 += 2 * Math.PI;
    return [a0, a1];
  };
  const ptOn = (s, t) => {
    if (s.type === 'line') return { x: s.p1.x + (s.p2.x - s.p1.x) * t, z: s.p1.z + (s.p2.z - s.p1.z) * t };
    const [a0, a1] = sweepOf(s);
    const a = a0 + (a1 - a0) * t;
    return { x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r };
  };
  const lenOf = (s) => {
    if (s.type === 'line') return Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z);
    const [a0, a1] = sweepOf(s);
    return Math.abs(a1 - a0) * s.r;
  };
  const out = [];
  let trimmed = 0, dropped = 0;
  let bandBreak = false;   // předchozí kus vypadl → další je samostatný ostrov
  for (const seg of path) {
    if (seg.isDegenerate) { out.push(seg); continue; }
    const L = lenOf(seg);
    const N = Math.max(8, Math.min(256, Math.ceil(L / 0.25)));
    const flags = [];
    let anyIn = false, allIn = true;
    for (let k = 0; k <= N; k++) {
      const f = inBand(ptOn(seg, k / N));
      flags.push(f);
      if (f) anyIn = true; else allIn = false;
    }
    if (allIn) {
      if (bandBreak) { seg.chainBreak = true; bandBreak = false; }
      out.push(seg);
      continue;
    }
    if (!anyIn) { dropped++; bandBreak = true; continue; }
    trimmed++;
    // Přesná hranice v parametru t mezi dvěma vzorky s opačným stavem.
    const bound = (t0, t1) => {
      let lo = t0, hi = t1;
      const s0 = inBand(ptOn(seg, t0));
      for (let k = 0; k < 24; k++) {
        const m = (lo + hi) / 2;
        if (inBand(ptOn(seg, m)) === s0) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
    const runs = [];
    let runStart = flags[0] ? 0 : null;
    for (let k = 1; k <= N; k++) {
      if (flags[k] === flags[k - 1]) continue;
      const b = bound((k - 1) / N, k / N);
      if (flags[k - 1]) { runs.push([runStart, b]); runStart = null; } else runStart = b;
    }
    if (runStart !== null) runs.push([runStart, 1]);
    const keep = runs.filter(([a, b]) => (b - a) * L > 0.05);
    if (keep.length === 0) { trimmed--; dropped++; }
    keep.forEach(([a, b], i) => {
      const seg2 = { ...seg };
      if (seg.type === 'line') {
        seg2.p1 = ptOn(seg, a);
        seg2.p2 = ptOn(seg, b);
      } else {
        const [a0, a1] = sweepOf(seg);
        seg2.startAngle = a0 + (a1 - a0) * a;
        seg2.endAngle = a0 + (a1 - a0) * b;
        syncArcEndpoints(seg2);
        if (seg.refP1 && seg.refP2) { seg2.refP1 = { ...seg2.p1 }; seg2.refP2 = { ...seg2.p2 }; }
      }
      if (a > 1e-6 || i > 0 || bandBreak || seg.chainBreak) seg2.chainBreak = true;
      out.push(seg2);
    });
    bandBreak = keep.length === 0 || !flags[N];
  }
  return { path: out, trimmed, dropped };
};

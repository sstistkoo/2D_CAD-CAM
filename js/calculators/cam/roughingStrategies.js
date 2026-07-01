// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – strategie hrubování (generování průchodů / passes)      ║
// ╚══════════════════════════════════════════════════════════════╝
// Každá strategie dostane `ctx` (data + pass-helpery z calculate()) a
// naplní pole ctx.passes. Přidání další strategie (zápichy, druhá strana):
//   1. nová export funkce genXxxPasses(ctx) sem,
//   2. záznam do ROUGHING_STRATEGIES (klíč + genPasses + label) dole,
//   3. (pokud strategie zavádí nový pass.type) obsloužit ho ve třech
//      dispatch místech v camSimulator.js: ořez Z-limitů a emise G-kódu
//      (generateAutoGCode) a vykreslení (draw). long/face passes sdílejí
//      tvar, takže pro ně tyto změny nejsou potřeba.
//
// ctx (sestavený v calculate()):
//   data:         prms, sRad, stockFace, step, offsetPath, stockPathSegments,
//                 stockWorldPoints, worldPoints, passes, foundErrors
//   pass-helpery: offsetXAt, traceOffsetPath, findOffsetXCrossing,
//                 findPocketExitZ, findLeadOutEndZ, hIntersect

import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc } from './camMath.js';

// Ořízne „bez schodků" dojezd (leadOut) tak, aby VODOROVNÉ čelo (konstantní Z)
// nepřejelo za sousední (mělčí) hloubku maxX — tam je materiál obroben už mělčím
// průchodem. Segmenty drží x1/z1 (vyšší Z) → x2/z2 (nižší Z). Šikmé úseky se
// nechávají (ty ořezal findLeadOutEndZ v ose Z); mění se pole na místě.
function clipLeadOutToDepth(segs, maxX) {
  const eps = 0.02;
  const out = [];
  for (const s of segs) {
    if (s.type === 'line' && Math.abs(s.z1 - s.z2) < 1e-6) {
      if (s.x1 > maxX + eps && s.x2 > maxX + eps) break;         // celé čelo za sousedem
      if (s.x2 > maxX + eps && s.x2 > s.x1) { out.push({ ...s, x2: maxX }); break; } // ven přes souseda
      out.push(s);
    } else {
      out.push(s);
    }
  }
  segs.length = 0;
  segs.push(...out);
}

// ČELNÍ HRUBOVÁNÍ (od povrchu polotovaru −X k ose / kontuře).
export function genFacePasses(ctx) {
  const { prms, sRad, stockFace, step, offsetPath, stockPathSegments, stockWorldPoints, worldPoints, passes, foundErrors, traceOffsetPath } = ctx;
  // ── ČELNÍ HRUBOVÁNÍ (od povrchu polotovaru −X k ose / kontuře) ──
  // Pro každou hloubku Z od (stockFace − step) po minZPart:
  //   1. xStart = stockOuter + rapidClr (= rapid-bezpečná X nad povrchem)
  //   2. xEnd = max X průsečíku offsetu se svislicí v currentZ (= místo,
  //      kde kontura blokuje řez jdoucí −X k ose). Pokud žádný blok,
  //      řezáme až k X=0.
  //
  // Nájezd: G0 X za polotovar → G0 Z na hloubku → G1 −X řez → G1 retract 45°.
  // 45° retract po čelním řezu jede do už odřezané zóny (slab nad
  // currentZ byl plně odebrán předchozími pasy + aktuálním), takže
  // bezpečné.
  const rapidClrFC = Math.max(0.05, parseFloat(prms.rapidClearance) || 1);
  // Helper: max X polotovaru (skutečná pravá hrana materiálu) na zadané Z.
  // Pro cylinder = konstantní sRad. Pro casting = max X všech průsečíků
  // svislice v Z s outline polotovaru → per-Z, takže rapid nemusí jezdit
  // až na globální sRad+clearance, ale jen těsně nad lokální povrch.
  const castingOuterAtZ = (z) => {
    if (prms.stockMode !== 'casting' || stockPathSegments.length === 0) return sRad;
    let maxX = -9999;
    stockPathSegments.forEach(seg => {
      if (seg.isDegenerate) return;
      if (seg.type === 'line') {
        const x = intersectVerticalLineSegment(z, seg.p1, seg.p2);
        if (x !== null && x > maxX) maxX = x;
      } else if (seg.type === 'arc') {
        const res = intersectVerticalLineArc(z, { x: seg.cx, z: seg.cz }, seg.r);
        res.forEach(x => {
          const angle = Math.atan2(x - seg.cx, z - seg.cz);
          if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2') && x > maxX) maxX = x;
        });
      }
    });
    return maxX > -9999 ? maxX : sRad;
  };
  const minZPart = worldPoints.length > 0 ? Math.min(...worldPoints.map(p => p.z)) : -1000;
  // Start na pravé hraně polotovaru: pro cylinder = stockFace, pro casting =
  // max(stockWorldPoints.zReal). Bez tohoto fixu casting s default stockFace=2
  // ihned vyletí ze smyčky (currentZ-step <= minZPart=0) a žádný pas se neemituje.
  let faceStartZ = stockFace;
  if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
    faceStartZ = -9999;
    stockWorldPoints.forEach(p => { if (p.zReal > faceStartZ) faceStartZ = p.zReal; });
  }
  // Z-rozsah kontury (pro detekci „za konturou" – tam stop, jinak by
  // se cuty pouštěly i do chuck-stub oblasti).
  let maxOZ = -9999, minOZ = 9999;
  offsetPath.forEach(p => {
    if (p.isDegenerate) return;
    const z1 = p.type === 'line' ? p.p1.z : p.cz + p.r;
    const z2 = p.type === 'line' ? p.p2.z : p.cz - p.r;
    maxOZ = Math.max(maxOZ, z1, z2);
    minOZ = Math.min(minOZ, z1, z2);
  });
  // Směr marche (nabírání ap v Z) podle strany:
  //   zprava (right) = od pravého čela DOLEVA (−Z),
  //   zleva  (left)  = od levého konce DOPRAVA (+Z).
  // Dojíždění schodu (leadOut) jde VŽDY opačně než march = k už obrobené
  // straně (předchozí, mělčí průchod), aby se jen sloupl hřebínek a nezajelo
  // se do dosud neobrobeného polotovaru.
  const faceLeft = (prms.roughingSide === 'left');
  const zList = [];
  if (!faceLeft) { for (let z = faceStartZ - step; z >= minZPart - 0.01; z -= step) zList.push(z); }
  else { for (let z = minZPart + step; z <= faceStartZ + 0.01; z += step) zList.push(z); }
  // Marchování začíná na marchStartZ (reference pro clamp leadOutu — zachováno
  // pro L/R symetrii, ale clamp byl odstraněn: první průchod smí také dojíždět
  // po offsetu nahoru, jinak by jeho krok nad ním zůstal neobrobený).
  const marchStartZ = zList.length ? zList[0] : faceStartZ;
  // Otočení trasy kontury (pro jízdu opačným směrem): obrátí pořadí, koncové
  // body i směr oblouku.
  const reverseTrace = (segs) => segs.slice().reverse().map(s => s.type === 'line'
    ? { type: 'line', x1: s.x2, z1: s.z2, x2: s.x1, z2: s.z1 }
    : { type: 'arc', cx: s.cx, cz: s.cz, r: s.r, dir: s.dir === 'G2' ? 'G3' : 'G2', startAngle: s.endAngle, endAngle: s.startAngle, x1: s.x2, z1: s.z2, x2: s.x1, z2: s.z1 });

  for (const currentZ of zList) {
    let xsEnd = [];
    offsetPath.forEach(os => {
      if (os.isDegenerate) return;
      if (os.type === 'line') {
        const x = intersectVerticalLineSegment(currentZ, os.p1, os.p2);
        if (x !== null) xsEnd.push(x);
      } else if (os.type === 'arc') {
        const res = intersectVerticalLineArc(currentZ, { x: os.cx, z: os.cz }, os.r);
        res.forEach(x => {
          const angle = Math.atan2(x - os.cx, currentZ - os.cz);
          if (isAngleBetween(angle, os.startAngle, os.endAngle, os.dir === 'G2')) xsEnd.push(x);
        });
      }
    });
    xsEnd.sort((a, b) => a - b);
    let xEnd;
    let xEndBlocked = false;
    if (xsEnd.length > 0) {
      // Kontura na tomto Z protíná svislici → vyber NEJVĚTŠÍ X (= outermost
      // kontura, ten první narazíme jdoucí −X od povrchu). Filtruj jen
      // průsečíky uvnitř polotovaru.
      const validXs = xsEnd.filter(x => x < sRad + 1);
      if (validXs.length === 0) continue; // všechny mimo polotovar
      xEnd = validXs[validXs.length - 1];
      xEndBlocked = true;
    } else {
      // Bez průsečíku:
      //   currentZ > maxOZ → jsme za pravým koncem kontury (face-stub
      //     nad konturou), řezáme až k ose
      //   currentZ < minOZ → jsme za levým koncem kontury (chuck-stub),
      //     skip (nesmíme řezat do držáku)
      //   uvnitř → unusual, skip pro safety
      if (currentZ > maxOZ + 0.01) xEnd = 0;
      else continue;
    }
    // Per-Z casting outer (pro casting). Pro cylinder = sRad konstantní.
    const xSurface = castingOuterAtZ(currentZ);
    const xStartLocal = xSurface + rapidClrFC;
    if (xEnd >= xStartLocal - 0.01) continue; // řez nulové délky
    const pass = { type: 'face', z: currentZ, xStart: xStartLocal, xSurface, xEnd, blocked: xEndBlocked };
    if (faceLeft) pass.faceLeft = true;
    passes.push(pass);
    if (prms.noStepRoughing && prms.noStepRoughingFace && xEndBlocked) {
      // Schod se dojíždí OPAČNĚ než march, k předchozímu (mělčímu) průchodu:
      //   zprava → DOPRAVA (+Z), zleva → DOLEVA (−Z). Ta strana je už obrobená,
      //   takže se jen sloupne hřebínek; opačně by se zajelo do polotovaru.
      // traceOffsetPath vrací úseky vysoké→nízké Z; pro jízdu doprava (+Z) je
      // otočíme, doleva (−Z) jdou v původním pořadí.
      const leadOut = faceLeft
        ? traceOffsetPath(currentZ, currentZ - step)
        : reverseTrace(traceOffsetPath(currentZ + step, currentZ));
      if (leadOut.length > 0) pass.contourLeadOut = leadOut;
    }
  }

  // ── Hlídání geometrie destičky (čelně) ──
  // Spodní hrana destičky se naklání pod vodorovnou o |natočení|
  // (při čelním hrubování bývá natočení záporné) → průchody končící
  // u kontury se zastavují postupně výš, jinak by hrana vpravo od
  // špičky zajela do už obrobeného osazení (vzniká schodiště).
  if (prms.respectInsertGeometry && prms.toolShape === 'polygon') {
    const phiFaceDeg = -(parseFloat(prms.toolAngle) || 0);
    if (phiFaceDeg > 0.01) {
      const tanPhiF = Math.tan(Math.min(89.5, phiFaceDeg) * Math.PI / 180);
      const faceWalls = passes.filter(p => p.type === 'face' && p.blocked).map(p => ({ z: p.z, xEnd: p.xEnd }));
      let faceAdjusted = 0;
      for (let pi = passes.length - 1; pi >= 0; pi--) {
        const p = passes[pi];
        if (p.type !== 'face') continue;
        let xE = p.xEnd;
        for (const w of faceWalls) {
          // Jen stěny na UŽ OBROBENÉ straně (zprava +Z, zleva −Z) — tam by
          // spodní hrana destičky zajela do hotového osazení.
          const machined = faceLeft ? (w.z < p.z - 1e-6) : (w.z > p.z + 1e-6);
          if (!machined) continue;
          const cand = w.xEnd + Math.abs(w.z - p.z) * tanPhiF;
          if (cand > xE) xE = cand;
        }
        if (xE > p.xEnd + 0.01) {
          faceAdjusted++;
          if (xE >= p.xStart - 0.05) { passes.splice(pi, 1); continue; }
          p.xEnd = xE;
          // leadOut byl spočítán pro NEzvednutý xEnd (po reálné kontuře). Po
          // zvednutí mezní čárou destičky by sledoval konturu POD limit, kam
          // boční ostří nedosáhne → zahodit (schod tam destička neobrobí).
          if (p.contourLeadOut) delete p.contourLeadOut;
        }
      }
      if (faceAdjusted > 0)
        foundErrors.push({ type: 'warning', msg: `Hlídání destičky: ${faceAdjusted} čelních průchodů zkráceno, aby spodní hrana destičky nezajela do kontury.` });
    }
  }
}

// PODÉLNÉ HRUBOVÁNÍ (RIGHT → LEFT, standardní soustružení).
export function genLongPasses(ctx) {
  const { prms, sRad, stockFace, step, offsetPath, stockWorldPoints, stockPathSegments, passes, foundErrors, offsetXAt, traceOffsetPath, findOffsetXCrossing, findPocketExitZ, findLeadOutEndZ, hIntersect, machiningRange, machiningRangeX } = ctx;
  // ── PODÉLNÉ HRUBOVÁNÍ (RIGHT → LEFT, standard soustružení) ─────
  // Pro každou hloubku currentX od (maxStockX − step) po minPartX:
  //   1. Najdi všechny Z-hranice na této hloubce (krajní stocku +
  //      průsečíky offsetu s horizontálou v currentX).
  //   2. Mezi každými dvěma sousedními hranicemi vzorkuj midpoint:
  //        — Je nad námi polotovar?  (stockOuter(zMid) >= currentX)
  //        — Je pod námi offset?      (offset(zMid) <= currentX nebo není)
  //      Když obojí → cut zone v tomto Z-intervalu.
  //   3. Sloučit sousední intervaly. Pas má zStart > zEnd
  //      (zStart = pravá hrana = max Z, typicky stockFace;
  //       zEnd = levá hrana = kde kontura zvedá offset nad currentX,
  //              nebo levý okraj polotovaru).
  //
  // Nájezd je rampovaný (G1 pod prms.entryAngle), ne svislý G0 plunge.
  // Pro monotonní tvar (kužel + rovný úsek) vyjde 1 průjezd na hloubku.

  const cylStockZ = (parseFloat(prms.stockLength) || 100) * -1;

  // X-bounds offsetu
  let minPartX = 9999, maxPartX = -9999;
  offsetPath.forEach(os => {
    if (os.isDegenerate) return;
    if (os.type === 'line') {
      minPartX = Math.min(minPartX, os.p1.x, os.p2.x);
      maxPartX = Math.max(maxPartX, os.p1.x, os.p2.x);
    } else {
      minPartX = Math.min(minPartX, os.cx - os.r);
      maxPartX = Math.max(maxPartX, os.cx + os.r);
    }
  });

  // Vrch polotovaru v X
  let maxStockX = sRad;
  if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
    maxStockX = -9999;
    stockWorldPoints.forEach(p => { if (p.xReal > maxStockX) maxStockX = p.xReal; });
  }

  // Z-rozsah polotovaru na zadané hloubce X.
  // Pro casting: rightmost/leftmost intersection řetězce + otevřené konce.
  // Pro válec: [cylStockZ, stockFace].
  // Vrací { zMax, zMin, all } nebo null pokud na této X polotovar není.
  const stockZRangeAt = (X) => {
    if (prms.stockMode === 'casting') {
      const zs = hIntersect(stockPathSegments, X, false);
      const startP = stockWorldPoints[0];
      const endP = stockWorldPoints[stockWorldPoints.length - 1];
      if (startP && startP.xReal > X + 0.01) zs.push(startP.zReal);
      if (endP && endP.xReal > X + 0.01) zs.push(endP.zReal);
      if (zs.length < 2) return null;
      zs.sort((a, b) => b - a);
      return { zMax: zs[0], zMin: zs[zs.length - 1], all: zs };
    }
    if (X > sRad + 0.01) return null;
    return { zMax: stockFace, zMin: cylStockZ, all: [stockFace, cylStockZ] };
  };

  // Posloupnost hloubek: maxStockX−step, …, ≥ minPartX, vždy s vynuceným
  // posledním průjezdem PŘESNĚ na minPartX (nedořezaný hřebínek).
  const depths = [];
  for (let d = maxStockX - step; d > minPartX + 0.005; d -= step) depths.push(d);
  if (depths.length === 0 || Math.abs(depths[depths.length - 1] - minPartX) > 0.005) {
    depths.push(minPartX);
  }
  // X-rozsah obrábění (📐): omezit hloubky průchodů na daný interval poloměrů.
  if (machiningRangeX) {
    const filtered = depths.filter(d => d >= machiningRangeX.xLo - 0.005 && d <= machiningRangeX.xHi + 0.005);
    if (filtered.length === 0 && depths.length > 0)
      foundErrors.push({ type: 'warning', msg: `X-rozsah obrábění (${machiningRangeX.xLo}–${machiningRangeX.xHi} mm): žádné hloubky průchodů neleží v zadaném intervalu — dráhy nebyly generovány.` });
    depths.splice(0, depths.length, ...filtered);
  }

  const effPlungeDegL = getEffectivePlungeAngle(prms);
  const effPlungeTanL = Math.tan(effPlungeDegL * Math.PI / 180);
  let plungeShallowed = 0;

  // Najde bod na offsetPath, kde sklon dX/dZ ve směru jízdy (klesající Z)
  // dosáhne úhlu zanoření effPlungeDegL — odtud se opouští kontura a
  // jede se rampou na currentX. Skenuje od zFrom dolů k zStop. Vrací
  // {x,z}, nebo null, pokud sklon prahu nikdy nedosáhne.
  const findPlungeCorner = (zFrom, zStop) => {
    const h = 0.05;
    for (let z = zFrom; z > zStop + h; z -= h) {
      const xa = offsetXAt(z), xb = offsetXAt(z - h);
      if (xa === null || xb === null) continue;
      const slope = (xa - xb) / h;
      if (slope >= effPlungeTanL) return { x: xa, z };
    }
    return null;
  };

  // ── Dobírání kapsy „najednou" (pocketFinishAtOnce) ──
  // Když je zapnuté, kapsa se vykope celá hned (viz blok níže), a její
  // Z-zóna se zapíše sem. Hlavní smyčka hloubek X pak tutéž kapsu už
  // nezpracovává (přeskočí pocket-interval, jehož střed leží v zóně) a
  // otevřené průchody do ní nezajíždějí (leadOut se ořízne na vršek zóny).
  // DŮLEŽITÉ: blockedAt() je VŽDY čistá geometrie (žádné „potlačení"
  // uvnitř) — jinak by se kapsa jevila jako otevřená a otevřený řez by ji
  // pohltil do jednoho dlouhého průjezdu skrz materiál.
  const pocketDoneRanges = [];
  const dzScan = 0.2;
  const blockedAt = (X, z) => {
    const offX = offsetXAt(z);
    return offX !== null && offX > X + 0.01;
  };
  // Mezi otevřeným krokem (offset ≤ X) a zablokovaným (offset > X) najdi
  // PŘESNÉ Z dotyku kontury (offset = X), aby průchod skončil rovnou na
  // kontuře a nemusel pak zajíždět pod průměr ("dip") před navazujícím
  // obloukem.
  const refineEngageZ = (X, zOpen, zBlocked) => {
    let hi = zOpen, lo = zBlocked;
    for (let k = 0; k < 24; k++) {
      const m = (hi + lo) / 2;
      const x = offsetXAt(m);
      // null = vzduch (nad čelní stěnou) → patří na otevřenou stranu (hi),
      // aby dotyk konvergoval na první Z, kde kontura skutečně začíná.
      if (x === null) { hi = m; continue; }
      if (x > X + 1e-6) lo = m; else hi = m;
    }
    return hi;
  };
  // Skenem zprava doleva najde všechny volné intervaly (offset nepřekračuje
  // X) v Z∈[zLoBound,zHiBound]. První interval (od pravé hrany polotovaru) =
  // klasický otevřený vjezd. Každý další interval je kapsa za "bossem"
  // kontury. Sdíleno hlavní smyčkou hloubek X i dobíráním kapsy najednou.
  const scanIntervals = (X, zHiBound, zLoBound) => {
    const intervals = [];
    let zScan = zHiBound;
    let inRun = !blockedAt(X, zScan);
    const firstOpen = inRun;
    let runStartZ = zScan;
    while (zScan > zLoBound + dzScan) {
      zScan -= dzScan;
      const blocked = blockedAt(X, zScan);
      if (inRun && blocked) {
        intervals.push({ zStart: runStartZ, zEnd: refineEngageZ(X, zScan + dzScan, zScan), blocked: true });
        inRun = false;
      } else if (!inRun && !blocked) {
        runStartZ = zScan;
        inRun = true;
      }
    }
    if (inRun) intervals.push({ zStart: runStartZ, zEnd: zLoBound, blocked: false });
    return { intervals, firstOpen };
  };

  for (let depthIdx = 0; depthIdx < depths.length; depthIdx++) {
    const currentX = depths[depthIdx];
    const sz = stockZRangeAt(currentX);
    if (!sz) continue;

    // Rozsah obrábění (📐): ořízne Z-zónu na uživatelem zadaný interval.
    const effZMax = machiningRange ? Math.min(sz.zMax, machiningRange.zHi) : sz.zMax;
    const effZMin = machiningRange ? Math.max(sz.zMin, machiningRange.zLo) : sz.zMin;
    if (effZMax - effZMin < 0.1) continue;

    // Skenem zprava doleva najdeme všechny volné intervaly (offset
    // nepřekračuje currentX). První interval (od pravé hrany
    // polotovaru) = klasický otevřený vjezd. Každý další interval je
    // kapsa za "bossem" kontury — vede se k ní sledováním kontury
    // (G1/G2/G3) a rampou pod úhlem zanoření, jen se zapnutým
    // zanořováním.
    //
    // Stock outline NEPROFILUJE řez (i kdyby měl casting přerušení /
    // dolíky uprostřed) — fyzický nástroj projíždí mezerou ve vzduchu
    // bez problému. Stopuje JEN kontura.
    const { intervals, firstOpen } = scanIntervals(currentX, effZMax, effZMin);

    intervals.forEach((iv, idx) => {
      // Vynech triviálně krátké průchody (nic neuříznou).
      if (iv.zStart - iv.zEnd < dzScan) return;
      if (idx === 0 && firstOpen) {
        // Otevřený vjezd zprava přes hranu polotovaru.
        const passObj = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
        // Dobrat kapsu najednou: následuje-li za bossem kapsa, kterou
        // teď vykope blok dobírání, otevřený řez NEDĚLÁ leadOut do ní —
        // navázání řeší leadIn prvního zanoření (noRetract). Jinak by se
        // kontura sledovala dvakrát. POZOR: jen když kapsa JEŠTĚ NENÍ
        // vykopaná — na hlubších hloubkách už je potlačená, a tam otevřený
        // řez naopak MUSÍ dojet svůj schod po obrysu (jinak schody na
        // náběhovém kuželu zůstanou neobrobené).
        const nextIv = idx + 1 < intervals.length ? intervals[idx + 1] : null;
        const nextMidZ = nextIv ? (nextIv.zStart + nextIv.zEnd) / 2 : null;
        const nextPocketDug = nextMidZ !== null && pocketDoneRanges.some(r => nextMidZ <= r.zHi + 0.1 && nextMidZ >= r.zLo - 0.1);
        const pocketFollowsNow = prms.plungeRoughing && prms.pocketFinishAtOnce
          && nextIv && nextIv.blocked && !nextPocketDug;
        if (prms.noStepRoughing && iv.blocked && !pocketFollowsNow) {
          // Bez schodků: místo odskoku se dál sleduje kontura (G1/G2/G3),
          // aby se obrobil schod vůči sousedním zaberum a nezůstal materiál.
          const nextX = (depthIdx + 1 < depths.length) ? depths[depthIdx + 1] : -Infinity;
          // ŽIVÁ kapsa za bossem = ještě nevykopaná (inkrementální režim) →
          // schod dolů na hlubší zaber řeší až pas té kapsy. Pokud za bossem
          // žádná živá kapsa není (jediný interval, NEBO kapsu už vykopal
          // blok dobírání → potlačená), dojeď schod po obrysu k sousedním
          // zaberum (jinak na náběhovém kuželu zůstanou schody neobrobené).
          const livePocketAfter = intervals.length > 1 && nextIv && nextIv.blocked && !nextPocketDug;
          const prevX = depthIdx > 0 ? depths[depthIdx - 1] : null;
          let zEndOut;
          if (!livePocketAfter) {
            zEndOut = findLeadOutEndZ(iv.zEnd, prevX, nextX, cylStockZ);
          } else {
            zEndOut = findOffsetXCrossing(iv.zEnd, nextX, cylStockZ);
          }
          // Dobrat kapsu najednou: neořezávat schod DO už vykopané kapsy —
          // zastav sledování na vršku potlačené zóny.
          for (const r of pocketDoneRanges) {
            if (r.zHi <= iv.zEnd + 1e-6 && r.zHi > zEndOut) zEndOut = r.zHi;
          }
          const leadOut = traceOffsetPath(iv.zEnd, zEndOut);
          // Zahoď úvodní úseky pod aktuální hloubkou: kvůli diskretizaci /
          // zaoblenému rohu může trasa hned na začátku klesnout pod
          // currentX (krátký "dip"). Průchod nesmí řezat pod svou hloubku —
          // sledování kontury začne až tam, kde se zvedne na currentX.
          while (leadOut.length > 0 && leadOut[0].x2 <= currentX + 0.02) leadOut.shift();
          // „Bez schodků" smí obrobit schod jen k SOUSEDNÍ (mělčí) hloubce
          // (prevX) — dál (X > prevX) je materiál už obroben mělčím průchodem.
          // U šikmé kontury to řeší findLeadOutEndZ (v ose Z), ale VODOROVNÉ
          // čelo (konstantní Z) vydá traceOffsetPath celé až k bossu → oříznout
          // na prevX (jinak dojezd zbytečně přejede celé čelo ven až na buben).
          if (prevX !== null && Number.isFinite(prevX)) clipLeadOutToDepth(leadOut, prevX);
          if (leadOut.length > 0) passObj.contourLeadOut = leadOut;
        }
        passes.push(passObj);
        return;
      }
      // Kapsa za bossem kontury — sledování kontury (G1/G2/G3) a rampa
      // pod úhlem zanoření, jen se zapnutým zanořováním.
      if (!prms.plungeRoughing) return;
      // Když je úplně první interval blokovaný (idx===0, !firstOpen),
      // neexistuje předchozí interval → horní hranice mezery = okraj
      // polotovaru (sz.zMax). Bez fallbacku by intervals[-1] spadlo.
      const zGapHi = idx > 0 ? intervals[idx - 1].zEnd : effZMax;
      // Dobrat kapsu najednou: tuhle kapsu už vykopal dřívější blok →
      // hlavní smyčka ji na hlubších hloubkách znovu nezpracovává.
      if (iv.blocked && prms.pocketFinishAtOnce) {
        const midZ = (iv.zStart + iv.zEnd) / 2;
        if (pocketDoneRanges.some(r => midZ <= r.zHi + 0.1 && midZ >= r.zLo - 0.1)) return;
      }
      if (!iv.blocked) {
        // Poslední interval bez protistěny (konec polotovaru) — žádná
        // kapsa s druhou stěnou, takže žádná rampa. Jen se sleduje
        // kontura z konce předchozího průchodu na currentX.
        passes.push({
          type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked,
          contourLeadIn: traceOffsetPath(zGapHi, iv.zStart)
        });
        return;
      }
      const corner = findPlungeCorner(zGapHi, iv.zStart);
      if (!corner) {
        // Sklon kontury nikdy nedosáhne úhlu zanoření — celá mezera se
        // projede po kontuře na currentX, žádná rampa.
        passes.push({
          type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked,
          contourLeadIn: traceOffsetPath(zGapHi, iv.zStart)
        });
        return;
      }
      // Sledování kontury (G1/G2/G3) z (currentX, zGapHi) do "rohu"
      // (corner) a odtud rampa pod úhlem zanoření na currentX. Pokud se
      // rampa do plné cílové hloubky nevejde do dostupné šířky kapsy,
      // sjede aspoň tak hluboko, jak to jde (částečně), a zbytek
      // dorampuje až příští hloubka (nebo, s pocketFinishAtOnce, hned v
      // dalším kroku bursteu níže).
      // withLeadIn: false vynechá sledování kontury od gapHi (kus stěny
      // PŘED kapsou, např. kužel) — používá se pro druhý a další zákrok
      // bursteu (dobrat kapsu najednou), kde tahle stěna je už hotová z
      // prvního zákroku a opakovat ji znovu by bylo zbytečné jezdění po
      // už obrobeném povrchu. withLeadOut: false vynechá sledování druhé
      // stěny kapsy ven (findPocketExitZ) — dráha tak zůstane omezená
      // jen na samotnou kapsu, místo aby zajížděla za ni do navazujícího
      // úseku kontury.
      const buildPocketPass = (X, gapHi, ivLocal, cornerLocal, withLeadIn, withLeadOut) => {
        const leadIn = withLeadIn ? traceOffsetPath(gapHi, cornerLocal.z) : [];
        const dzRampFull = (cornerLocal.x - X) / effPlungeTanL;
        const availWidth = cornerLocal.z - ivLocal.zEnd;
        const dzRamp = Math.min(dzRampFull, availWidth);
        const xReached = cornerLocal.x - dzRamp * effPlungeTanL;
        if (xReached > X + 0.001) plungeShallowed++;
        const pocketPass = {
          type: 'long', x: xReached,
          zStart: cornerLocal.z - dzRamp, zEnd: ivLocal.zEnd, blocked: ivLocal.blocked,
          ramp: { x0: cornerLocal.x, z0: cornerLocal.z }
        };
        if (leadIn.length > 0) pocketPass.contourLeadIn = leadIn;
        if (withLeadOut && prms.noStepRoughing) {
          // Bez schodků: po dně kapsy se dál sleduje kontura (G1/G2/G3)
          // až na hloubku dalšího průchodu (nebo až na konec kontury)
          // místo okamžitého odskoku — druhá stěna kapsy se obrobí přímo.
          const zExitOut = findPocketExitZ(ivLocal.zEnd, X, cylStockZ);
          const leadOut = traceOffsetPath(ivLocal.zEnd, zExitOut);
          if (leadOut.length > 0) pocketPass.contourLeadOut = leadOut;
        }
        return { pocketPass, leadIn };
      };
      // Navázání: předchozí (otevřený) průchod končí přesně v bodě, odkud
      // začíná leadIn téhle kapsy → nesmí odskočit, plynule pokračuje po
      // kontuře (G3) do kapsy.
      const linkToPrev = (leadIn) => {
        const prevPass = passes[passes.length - 1];
        if (prevPass && prevPass.type === 'long' && !prevPass.contourLeadOut && leadIn.length > 0
            && Math.abs(prevPass.zEnd - leadIn[0].z1) < 0.05
            && Math.abs(prevPass.x - leadIn[0].x1) < step + 0.1) {
          prevPass.noRetract = true;
        }
      };

      if (!prms.pocketFinishAtOnce) {
        const { pocketPass, leadIn } = buildPocketPass(currentX, zGapHi, iv, corner, true, true);
        if (prms.noStepRoughing) linkToPrev(leadIn);
        passes.push(pocketPass);
        return;
      }

      // ── Dobrat kapsu najednou ──
      // Kapsa se vykope CELÁ hned, ve dvou fázích:
      //   1) Rampované zanořovací zákroky (odběr bulku) — krok po kroku
      //      ap. První zákrok najede po kontuře (leadIn, navázaný na
      //      předchozí otevřený řez). Další zákroky se jen ODSKOČÍ a
      //      PŘEJEDOU V KAPSE na pozici dalšího zanoření (žádný výjezd nad
      //      polotovar) a zarampují hlouběji. Každý zákrok = rampa + dno,
      //      bez sledování kontury kolem (to dělá až fáze 2).
      //   2) Dokončovací průchod po kontuře — objede schodky obou stěn a
      //      dojede až NA DNO (sleduje offset, takže dosáhne i tam, kam se
      //      rampa pod úhlem zanoření kvůli šířce nedostala) a vyjede ven
      //      druhou stěnou (G2/G3 → úsečka).
      // Celá Z-zóna kapsy se zapíše do pocketDoneRanges — hlavní smyčka ji
      // na dalších hloubkách X přeskočí (a otevřené řezy do ní nezajedou).

      // Dno kapsy = minimum offsetu uvnitř Z-rozsahu kapsy.
      let pocketBottomX = Infinity, pocketBottomZ = (iv.zStart + iv.zEnd) / 2;
      for (let z = zGapHi; z >= iv.zEnd - 0.3; z -= 0.1) {
        const ox = offsetXAt(z);
        if (ox !== null && ox < pocketBottomX) { pocketBottomX = ox; pocketBottomZ = z; }
      }

      // Fáze 1 — rampované zanořovací zákroky.
      let localX = currentX, curGapHi = zGapHi, curIv = iv, curCorner = corner;
      let firstPlunge = true, bestX = Infinity, safety = 0;
      let prevRampEnd = null;   // konec rampy předchozího zákroku (na sdílené přímce rampy)
      const CORNER_TOL = 1.5;
      while (safety++ < 500) {
        const { pocketPass, leadIn } = buildPocketPass(localX, curGapHi, curIv, curCorner, firstPlunge, false);
        // Monotonní progres: u zakřivené (zužující se) stěny dává rampa na
        // hlubší cíl s posunutým rohem někdy MĚLČÍ dosah — takový zákrok
        // zahoď a ukonči bulk, zbytek dna dořeže fáze 2 (sledování kontury).
        if (!firstPlunge && pocketPass.x >= bestX - 0.05) break;
        // Zanořovací zákroky se NEODSKAKUJÍ 45° — řetězí se: nástroj zůstane
        // na dně zápichu a další zákrok ho rychloposuvem zvedne NAHORU PO
        // ZÁPICHU (po ose Z, ve vyříznutém vzduchu) ke konci rampy
        // předchozího zákroku a odtud ramuje jen nový úsek. Žádný výjezd nad
        // kapsu/roh (ten by jel skrz boss nad zápichem).
        pocketPass.noRetract = true;
        if (firstPlunge) { pocketPass.pocketEntry = true; if (prms.noStepRoughing) linkToPrev(leadIn); }
        else {
          pocketPass.pocketReposition = true;
          // rampFeedFrom = vršek zápichu předchozího zákroku (konec jeho
          // rampy) na sdílené přímce rampy — sem se zvedne rychloposuvem.
          if (prevRampEnd && prevRampEnd.x > pocketPass.x + 0.01) pocketPass.rampFeedFrom = prevRampEnd;
        }
        passes.push(pocketPass);
        prevRampEnd = { x: pocketPass.x, z: pocketPass.zStart };
        bestX = pocketPass.x;
        firstPlunge = false;

        if (pocketPass.x <= pocketBottomX + 0.1) break;   // dno (skoro) dosaženo

        localX = Math.max(pocketBottomX, localX - step);
        // Najdi tutéž kapsu na nové hloubce (roh se s hloubkou mírně posouvá).
        const rescan = scanIntervals(localX, effZMax, effZMin);
        let found = null;
        for (let j = 1; j < rescan.intervals.length; j++) {
          const cIv = rescan.intervals[j];
          if (!cIv.blocked) continue;
          const cGapHi = rescan.intervals[j - 1].zEnd;
          const cCorner = findPlungeCorner(cGapHi, cIv.zStart);
          if (cCorner && Math.abs(cCorner.x - curCorner.x) < CORNER_TOL && Math.abs(cCorner.z - curCorner.z) < CORNER_TOL) {
            found = { iv: cIv, gapHi: cGapHi, corner: cCorner }; break;
          }
        }
        if (!found) break;
        curIv = found.iv; curGapHi = found.gapHi; curCorner = found.corner;
      }

      // Fáze 2 — dokončovací průchod po kontuře (objede schodky + dojede na
      // dno + ven druhou stěnou). leadIn = blízká stěna z rohu DOLŮ na dno;
      // leadOut = druhá stěna ze dna VEN (G2/G3 → úsečka) — sleduje konturu,
      // dokud se po druhé stěně nevrátí na vstupní hloubku (u kapsy
      // uprostřed), případně až ke konci kontury (u kapsy na konci dílu).
      const exitZ = findPocketExitZ(pocketBottomZ, currentX, cylStockZ);
      // Zahoď degenerované mikro-úseky (< 0,05 mm) — vznikají na švu
      // můstku a oblouku machinable kontury; jinak by se v G-kódu objevil
      // nulový oblouk (např. CR=8.5 přes 0,02 mm) a simulace by na něm
      // „zamrzla".
      const dropMicro = (segs) => segs.filter(s => Math.hypot(s.x2 - s.x1, s.z2 - s.z1) > 0.05);
      // Horní část blízké stěny už obrobily zanořovací rampy (jedou po ní pod
      // úhlem zanoření). Dokončovací průchod proto NEmusí sledovat stěnu od
      // rohu (corner.z) — začne až tam, kam dosáhla poslední rampa
      // (prevRampEnd), jen ODSKOČÍ ode dna a přisune se k tomu bodu, místo
      // výjezdu nad boss a přejezdu přes už obrobenou stěnu. POJISTKA: jen
      // když poslední rampa opravdu dosedla na stěnu (offset v tom Z ≈ dosažené
      // X) — jinak by nad ní zůstal materiál a čistí se celá stěna od rohu.
      let cleanStartZ = corner.z;
      let cleanApproach = null;
      if (prevRampEnd && prevRampEnd.z < corner.z - 0.05 && prevRampEnd.z >= pocketBottomZ - 0.05) {
        const wallXThere = offsetXAt(prevRampEnd.z);
        if (wallXThere !== null && Math.abs(wallXThere - prevRampEnd.x) < 0.2) {
          // Rampy dojely na stěnu — dokončení začne až u posledního zákroku
          // (nebo rovnou na dně, když ho poslední rampa dosáhla) a navazuje
          // odskokem, ne výjezdem nad boss.
          cleanStartZ = Math.max(prevRampEnd.z, pocketBottomZ);
          cleanApproach = { x: prevRampEnd.x, z: cleanStartZ };
        }
      }
      const cleanLeadIn = dropMicro(traceOffsetPath(cleanStartZ, pocketBottomZ));
      const cleanLeadOut = dropMicro(traceOffsetPath(pocketBottomZ, exitZ));
      if (cleanLeadIn.length > 0 || cleanLeadOut.length > 0) {
        const cleanPass = {
          type: 'long', pocketClean: true,
          x: pocketBottomX, zStart: pocketBottomZ, zEnd: pocketBottomZ, blocked: true,
        };
        if (cleanLeadIn.length > 0) cleanPass.contourLeadIn = cleanLeadIn;
        if (cleanLeadOut.length > 0) cleanPass.contourLeadOut = cleanLeadOut;
        if (cleanApproach) cleanPass.cleanApproach = cleanApproach;
        passes.push(cleanPass);
      }

      // Potlačení: celou Z-zónu kapsy hlavní smyčka znovu nezpracuje.
      pocketDoneRanges.push({ zHi: corner.z, zLo: exitZ });
      return;
    });
  }
  if (plungeShallowed > 0)
    foundErrors.push({ type: 'warning', msg: `POZNÁMKA: Zanořování — ${plungeShallowed} průchodů do kapsy nedosáhlo plné cílové hloubky v jednom kroku (rampa pod ${effPlungeDegL.toFixed(1)}° pokračuje dalším krokem).` });

  // ── Hlídání geometrie destičky (podélně) ──
  // Čelní hrana destičky se nad špičkou naklání o φ = natočení + ε − 90
  // za svislici → průchody končící u zdi (levé stěny) se zastavují
  // postupně dál vpravo, takže boční ostří nezajede do kontury
  // (zbytek tvoří schodiště pod úhlem hrany). Spodní hrana (natočení)
  // totéž zrcadlově u pravých stěn kapes při zanořování.
  if (prms.respectInsertGeometry && prms.toolShape === 'polygon') {
    const rotDeg = parseFloat(prms.toolAngle) || 0;
    const tipDeg = parseFloat(prms.toolTipAngle) || 90;
    let adjusted = 0;
    const phiDeg = rotDeg + tipDeg - 90;
    if (phiDeg > 0.01) {
      // Dojezd se počítá přesně proti offsetové dráze: rohy (koncové
      // body segmentů) klasicky přes tanφ, oblouky navíc TEČNOU čelní
      // hrany na kružnici — jinak by hrana mezi vzorky zajela do
      // vyduté/vypouklé stěny oblouku.
      const phiRad = Math.min(89.5, phiDeg) * Math.PI / 180;
      const tanPhi = Math.tan(phiRad);
      const betaRad = phiRad + Math.PI / 2;          // směr čelní hrany (od +Z)
      const eX = Math.sin(betaRad), eZ = Math.cos(betaRad); // hrana míří nahoru-doleva
      for (let pi = passes.length - 1; pi >= 0; pi--) {
        const p = passes[pi];
        if (p.type !== 'long') continue;
        // Průchody sledující konturu (leadOut) zeď obrábějí přímo po
        // obrysu — posun zEnd by jen rozsynchronizoval navazující dráhu.
        if (p.contourLeadOut) continue;
        // Dobrat kapsu najednou: zanořovací/dokončovací průchody kapsy už
        // respektují úhel zanoření i konturu — post-hoc posun by je
        // rozsynchronizoval s navazujícím přejezdem v kapse.
        if (p.pocketEntry || p.pocketReposition || p.pocketClean) continue;
        let zE = p.zEnd;
        for (const seg of offsetPath) {
          if (seg.isDegenerate) continue;
          if (seg.type === 'line') {
            for (const q of [seg.p1, seg.p2]) {
              if (q.x <= p.x + 0.05 || q.z > p.zStart + 0.01) continue;
              const cand = q.z + (q.x - p.x) * tanPhi;
              if (cand > zE) zE = cand;
            }
          } else {
            const a1 = { x: seg.cx + Math.sin(seg.startAngle) * seg.r, z: seg.cz + Math.cos(seg.startAngle) * seg.r };
            const a2 = { x: seg.cx + Math.sin(seg.endAngle) * seg.r, z: seg.cz + Math.cos(seg.endAngle) * seg.r };
            for (const q of [a1, a2]) {
              if (q.x <= p.x + 0.05 || q.z > p.zStart + 0.01) continue;
              const cand = q.z + (q.x - p.x) * tanPhi;
              if (cand > zE) zE = cand;
            }
            // Tečna hrany na oblouk: přímka hrany špičky (p.x, zT) se
            // směrem e musí mít od středu vzdálenost r. Dotyk musí
            // ležet nad špičkou, vlevo od startu pasu a v rozsahu oblouku.
            for (const sgn of [1, -1]) {
              const zT = seg.cz - ((seg.cx - p.x) * eZ - sgn * seg.r) / eX;
              const t = (seg.cx - p.x) * eX + (seg.cz - zT) * eZ; // projekce středu na hranu
              if (t <= 0.05) continue;
              const Px = p.x + eX * t, Pz = zT + eZ * t;
              if (Px <= p.x + 0.05 || Pz > p.zStart + 0.01) continue;
              const ang = Math.atan2(Px - seg.cx, Pz - seg.cz);
              if (!isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) continue;
              if (zT > zE) zE = zT;
            }
          }
        }
        if (zE > p.zEnd + 0.01) {
          adjusted++;
          if (zE >= p.zStart - 0.05) { passes.splice(pi, 1); continue; }
          p.zEnd = zE;
        }
      }
    }
    // Pravé stěny kapes: spodní hrana destičky stoupá od špičky pod
    // úhlem natočení — hlubší zanořovací průchody musí začínat o
    // dx/tan(natočení) víc vlevo, jinak by hrana nad špičkou zajela
    // do pravé stěny kapsy.
    // Průchody s contourLeadIn mají rampu zavěšenou na pevném
    // tečném bodě kontury (stejný pro všechny hloubky) — ten je už
    // sledováním kontury bezkolizní, tato heuristika by ho jen
    // chybně prodloužila, takže se na ně nevztahuje.
    if (rotDeg > 0.01) {
      const tanRot = Math.tan(Math.min(89.5, rotDeg) * Math.PI / 180);
      const rightWalls = passes.filter(p => p.type === 'long' && p.ramp && !p.contourLeadIn && !p.pocketReposition).map(p => ({ x: p.x, z: p.ramp.z0 }));
      for (let pi = passes.length - 1; pi >= 0; pi--) {
        const p = passes[pi];
        if (p.type !== 'long' || !p.ramp || p.contourLeadIn) continue;
        // Dobrat kapsu najednou: zanořovací zákroky kapsy se neupravují (viz výše).
        if (p.pocketEntry || p.pocketReposition || p.pocketClean) continue;
        let z0 = p.ramp.z0;
        for (const w of rightWalls) {
          if (w.x <= p.x + 1e-6) continue;
          const cand = w.z - (w.x - p.x) / tanRot;
          if (cand < z0) z0 = cand;
        }
        if (z0 < p.ramp.z0 - 0.01) {
          adjusted++;
          const dzRamp = p.ramp.z0 - p.zStart;
          p.ramp.z0 = z0;
          p.zStart = z0 - dzRamp;
          if (p.zStart - p.zEnd < 0.05) passes.splice(pi, 1);
        }
      }
    }
    if (adjusted > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání destičky: ${adjusted} hrubovacích průchodů zkráceno, aby boční ostří nezajelo do kontury.` });
  }
}

// PODÉLNÉ HRUBOVÁNÍ ZLEVA — „druhá strana", STEJNÉ upnutí (levý konec
// v čelistech). Nájezd od levé strany, obrábí se opačným Z směrem.
// Omezeno rozsahem obrábění (📐 machiningRange); bez rozsahu se vezme celý
// profil. v1: celý rozsah nahrubo zleva (zrcadlo pravé strany), bez kapes/
// rampování — passes mají type 'long' + backside:true (emise/retrakt zleva).
export function genBacksidePasses(ctx, op) {
  const { sRad, step, offsetPath, passes, foundErrors, offsetXAt, worldPoints, stockFace, machiningRange, machiningRangeX, chuckZ } = ctx;

  // Z-zóna obrábění: primárně z rozsahu (📐), jinak celý profil po čelo.
  let zLo, zHi;
  if (machiningRange) { zLo = machiningRange.zLo; zHi = machiningRange.zHi; }
  else {
    const zs = worldPoints.map(p => p.z);
    zLo = zs.length ? Math.min(...zs) : -100;
    zHi = stockFace;
  }
  // Levý konec v čelistech — nezajíždět pod chuck.
  if (chuckZ !== null) zLo = Math.max(zLo, chuckZ);
  if (zHi - zLo < 0.5) {
    foundErrors.push({ type: 'warning', msg: 'Druhá strana (zleva): prázdná zóna — nastavte 📐 Rozsah obrábění.' });
    return;
  }

  // X-meze offsetu (hloubky průchodů jako u pravého podélného).
  let minPartX = 9999;
  offsetPath.forEach(os => {
    if (os.isDegenerate) return;
    const xs = os.type === 'line' ? [os.p1.x, os.p2.x] : [os.cx - os.r, os.cx + os.r];
    minPartX = Math.min(minPartX, ...xs);
  });
  if (minPartX === 9999) minPartX = 0;

  const maxStockX = sRad; // v1: válec
  const depths = [];
  for (let d = maxStockX - step; d > minPartX + 0.005; d -= step) depths.push(d);
  if (depths.length === 0 || Math.abs(depths[depths.length - 1] - minPartX) > 0.005) depths.push(minPartX);
  // X-rozsah obrábění (📐): omezit hloubky průchodů na daný interval poloměrů.
  if (machiningRangeX) {
    const filtered = depths.filter(d => d >= machiningRangeX.xLo - 0.005 && d <= machiningRangeX.xHi + 0.005);
    if (filtered.length === 0 && depths.length > 0)
      foundErrors.push({ type: 'warning', msg: `X-rozsah obrábění (${machiningRangeX.xLo}–${machiningRangeX.xHi} mm): žádné hloubky průchodů neleží v zadaném intervalu — dráhy nebyly generovány.` });
    depths.splice(0, depths.length, ...filtered);
  }

  const dz = 0.2;
  const isOpen = (z, currentX) => { const x = offsetXAt(z); return x === null || x <= currentX + 0.01; };

  for (const currentX of depths) {
    // Otevřené Z-intervaly (offset nepřesahuje currentX) uvnitř [zLo,zHi],
    // vzorkováno zleva doprava.
    const intervals = [];
    let runStart = isOpen(zLo, currentX) ? zLo : null;
    let prevOpen = runStart !== null;
    for (let z = zLo + dz; z <= zHi + 1e-9; z += dz) {
      const o = isOpen(z, currentX);
      if (o && !prevOpen) runStart = z;
      else if (!o && prevOpen) { intervals.push({ a: runStart, b: z - dz }); runStart = null; }
      prevOpen = o;
    }
    if (prevOpen && runStart !== null) intervals.push({ a: runStart, b: zHi });

    intervals.forEach(iv => {
      if (iv.b - iv.a < dz) return;
      // zStart = pravý (vyšší Z) konec, zEnd = levý (nižší Z). Nájezd zleva
      // řeší emise podle backside:true.
      passes.push({ type: 'long', x: currentX, zStart: iv.b, zEnd: iv.a, blocked: true, backside: true });
    });
  }
}

// Registr strategií hrubování. Klíč = prms.roughingStrategy.
// genPasses(ctx) naplní ctx.passes; label se použije v hlavičce G-kódu.
// Cílově sem přibudou zápichy ('grooving').
export const ROUGHING_STRATEGIES = {
  longitudinal: { genPasses: genLongPasses, label: 'PODELNE' },
  face: { genPasses: genFacePasses, label: 'CELNI' },
  backside: { genPasses: genBacksidePasses, label: 'PODELNE ZLEVA' },
};

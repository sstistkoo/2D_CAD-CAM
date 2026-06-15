// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – strategie hrubování (generování průchodů / passes)      ║
// ╚══════════════════════════════════════════════════════════════╝
// Každá strategie dostane `ctx` (data + pass-helpery z calculate()) a
// naplní pole ctx.passes. Přidání další strategie (zápichy, druhá strana)
// = nová export funkce sem + větev v dispatchi v camSimulator.calculate().
//
// ctx (sestavený v calculate()):
//   data:         prms, sRad, stockFace, step, offsetPath, stockPathSegments,
//                 stockWorldPoints, worldPoints, passes, foundErrors
//   pass-helpery: offsetXAt, traceOffsetPath, findOffsetXCrossing,
//                 findPocketExitZ, findLeadOutEndZ, hIntersect

import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc } from './camMath.js';

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
  let currentZ = faceStartZ;
  let safe = 0;
  // Iterace: ukončíme, jakmile by další step šel pod minZPart (= nejlevější
  // Z bodu kontury). Tím se vyhneme řezu za konturou do držákové oblasti.
  while ((currentZ - step) >= minZPart - 0.01 && safe < 500) {
    currentZ -= step; safe++;
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
    passes.push({ type: 'face', z: currentZ, xStart: xStartLocal, xSurface, xEnd, blocked: xEndBlocked });
    if (prms.noStepRoughing && prms.noStepRoughingFace && xEndBlocked) {
      // Bez schodků: po dojezdu na xEnd se dál sleduje kontura
      // (G1/G2/G3) v pásu Z∈[currentZ−step, currentZ] — schod, který
      // by jinak zůstal po hraně, se obrobí přímo po obrysu.
      const leadOut = traceOffsetPath(currentZ, currentZ - step);
      if (leadOut.length > 0) passes[passes.length - 1].contourLeadOut = leadOut;
    }
    if (currentZ < -200) break;
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
          if (w.z <= p.z + 1e-6) continue;
          const cand = w.xEnd + (w.z - p.z) * tanPhiF;
          if (cand > xE) xE = cand;
        }
        if (xE > p.xEnd + 0.01) {
          faceAdjusted++;
          if (xE >= p.xStart - 0.05) { passes.splice(pi, 1); continue; }
          p.xEnd = xE;
        }
      }
      if (faceAdjusted > 0)
        foundErrors.push({ type: 'warning', msg: `Hlídání destičky: ${faceAdjusted} čelních průchodů zkráceno, aby spodní hrana destičky nezajela do kontury.` });
    }
  }
}

// PODÉLNÉ HRUBOVÁNÍ (RIGHT → LEFT, standardní soustružení).
export function genLongPasses(ctx) {
  const { prms, sRad, stockFace, step, offsetPath, stockWorldPoints, stockPathSegments, passes, foundErrors, offsetXAt, traceOffsetPath, findOffsetXCrossing, findPocketExitZ, findLeadOutEndZ, hIntersect } = ctx;
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

  for (let depthIdx = 0; depthIdx < depths.length; depthIdx++) {
    const currentX = depths[depthIdx];
    const sz = stockZRangeAt(currentX);
    if (!sz) continue;

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
    const dzScan = 0.2;
    const blockedAt = (z) => {
      const offX = offsetXAt(z);
      return offX !== null && offX > currentX + 0.01;
    };
    // Mezi otevřeným krokem (offset ≤ currentX) a zablokovaným (offset >
    // currentX) najdi PŘESNÉ Z dotyku kontury (offset = currentX), aby
    // průchod skončil rovnou na kontuře a nemusel pak zajíždět pod
    // průměr ("dip") před navazujícím obloukem.
    const refineEngageZ = (zOpen, zBlocked) => {
      let hi = zOpen, lo = zBlocked;
      for (let k = 0; k < 24; k++) {
        const m = (hi + lo) / 2;
        const x = offsetXAt(m);
        // null = vzduch (nad čelní stěnou) → patří na otevřenou stranu (hi),
        // aby dotyk konvergoval na první Z, kde kontura skutečně začíná.
        if (x === null) { hi = m; continue; }
        if (x > currentX + 1e-6) lo = m; else hi = m;
      }
      return hi;
    };
    const intervals = [];
    let zScan = sz.zMax;
    let inRun = !blockedAt(zScan);
    const firstOpen = inRun;
    let runStartZ = zScan;
    while (zScan > sz.zMin + dzScan) {
      zScan -= dzScan;
      const blocked = blockedAt(zScan);
      if (inRun && blocked) {
        // přesný dotyk kontury mezi posledním volným a prvním blok. krokem
        intervals.push({ zStart: runStartZ, zEnd: refineEngageZ(zScan + dzScan, zScan), blocked: true });
        inRun = false;
      } else if (!inRun && !blocked) {
        runStartZ = zScan;
        inRun = true;
      }
    }
    if (inRun) intervals.push({ zStart: runStartZ, zEnd: sz.zMin, blocked: false });

    intervals.forEach((iv, idx) => {
      // Vynech triviálně krátké průchody (nic neuříznou).
      if (iv.zStart - iv.zEnd < dzScan) return;
      if (idx === 0 && firstOpen) {
        // Otevřený vjezd zprava přes hranu polotovaru.
        const passObj = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
        if (prms.noStepRoughing && iv.blocked) {
          // Bez schodků: místo odskoku se dál sleduje kontura (G1/G2/G3),
          // aby se obrobil schod vůči sousedním zaberum a nezůstal materiál.
          const nextX = (depthIdx + 1 < depths.length) ? depths[depthIdx + 1] : -Infinity;
          let zEndOut;
          if (intervals.length === 1) {
            // Jediný interval (žádná kapsa za bossem) → sleduj konturu buď
            // dolů na hlubší zaber, nebo nahoru na vršek schodu (předchozí
            // mělčí zaber). Tím se schod obrobí přímo po obrysu.
            const prevX = depthIdx > 0 ? depths[depthIdx - 1] : null;
            zEndOut = findLeadOutEndZ(iv.zEnd, prevX, nextX, cylStockZ);
          } else {
            // Za bossem následuje kapsa (další interval) — konturu nahoru
            // řeší až pas kapsy + návaznost (noRetract); tady jen klasický
            // schod dolů na hlubší zaber.
            zEndOut = findOffsetXCrossing(iv.zEnd, nextX, cylStockZ);
          }
          const leadOut = traceOffsetPath(iv.zEnd, zEndOut);
          // Zahoď úvodní úseky pod aktuální hloubkou: kvůli diskretizaci /
          // zaoblenému rohu může trasa hned na začátku klesnout pod
          // currentX (krátký "dip"). Průchod nesmí řezat pod svou hloubku —
          // sledování kontury začne až tam, kde se zvedne na currentX.
          while (leadOut.length > 0 && leadOut[0].x2 <= currentX + 0.02) leadOut.shift();
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
      const zGapHi = idx > 0 ? intervals[idx - 1].zEnd : sz.zMax;
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
      // dorampuje až příští hloubka.
      const leadIn = traceOffsetPath(zGapHi, corner.z);
      const dzRampFull = (corner.x - currentX) / effPlungeTanL;
      const availWidth = corner.z - iv.zEnd;
      const dzRamp = Math.min(dzRampFull, availWidth);
      const xReached = corner.x - dzRamp * effPlungeTanL;
      if (xReached > currentX + 0.001) plungeShallowed++;
      const pocketPass = {
        type: 'long', x: xReached,
        zStart: corner.z - dzRamp, zEnd: iv.zEnd, blocked: iv.blocked,
        contourLeadIn: leadIn, ramp: { x0: corner.x, z0: corner.z }
      };
      if (prms.noStepRoughing) {
        // Bez schodků: po dně kapsy se dál sleduje kontura (G1/G2/G3)
        // až na hloubku dalšího průchodu (nebo až na konec kontury)
        // místo okamžitého odskoku — druhá stěna kapsy se obrobí přímo.
        const zExitOut = findPocketExitZ(iv.zEnd, currentX, cylStockZ);
        const leadOut = traceOffsetPath(iv.zEnd, zExitOut);
        if (leadOut.length > 0) pocketPass.contourLeadOut = leadOut;
        // Navázání: předchozí (otevřený) průchod končí přesně v bodě,
        // odkud začíná leadIn téhle kapsy → nesmí odskočit, plynule
        // pokračuje po kontuře (G3) do kapsy.
        const prevPass = passes[passes.length - 1];
        if (prevPass && prevPass.type === 'long' && !prevPass.contourLeadOut && leadIn.length > 0
            && Math.abs(prevPass.zEnd - leadIn[0].z1) < 0.05
            && Math.abs(prevPass.x - leadIn[0].x1) < step + 0.1) {
          prevPass.noRetract = true;
        }
      }
      passes.push(pocketPass);
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
      const rightWalls = passes.filter(p => p.type === 'long' && p.ramp && !p.contourLeadIn).map(p => ({ x: p.x, z: p.ramp.z0 }));
      for (let pi = passes.length - 1; pi >= 0; pi--) {
        const p = passes[pi];
        if (p.type !== 'long' || !p.ramp || p.contourLeadIn) continue;
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

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
//   pass-helpery: offsetXAt, traceOffsetPath, findPocketExitZ,
//                 findLeadOutEndZ, hIntersect

import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc, samplePartingEnvelope, fitArcsToPolyline, stockClearances, stockClearanceIsZero, stockOuterXAtZ } from './camMath.js';
import { buildStockLoop, offsetStockLoop, insertBodyZ } from './materialRemoval.js';
import { sampleOffsetRegion, buildResidual, layerZIntervalsAtX, computeResidualRegions } from './booleanRoughing.js';
import { pointInLoop, polyIntersect } from '../../geom/geomCore.js';
import { holderWorldLoop } from './collisionValidator.js';
import { HOLDER_CLAMP_MARGIN, holderBottomProfile, insertReachZ } from './toolEnvelope.js';

// Volný prostor (mm) mezi držákem a vůlí-posunutou siluetou polotovaru
// („tečkovanou" offsetovou čarou v náhledu) při hledání stropu vjezdu —
// viz holderEntryCapZ v genLongPasses.
const HOLDER_STOCK_GAP = 1.0;
// Bezpečnostní odstup DRŽÁKU od offsetové čáry polotovaru při hledání kotvy
// zanoření (přání uživatele 10. 8. 2026: „ať je držák tak 2 mm od té čáry").
const HOLDER_ENTRY_STOCK_GAP = 2.0;

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
  const { prms, sRad, stockFace, step, offsetPath, stockPathSegments, stockWorldPoints, worldPoints, passes, foundErrors, traceOffsetPath, offsetXAt } = ctx;
  // ── ČELNÍ HRUBOVÁNÍ (od povrchu polotovaru −X k ose / kontuře) ──
  // Pro každou hloubku Z od (stockFace − step) po marchEndZ:
  //   1. xStart = stockOuter + rapidClr (= rapid-bezpečná X nad povrchem)
  //   2. xEnd = max X průsečíku offsetu se svislicí v currentZ (= místo,
  //      kde kontura blokuje řez jdoucí −X k ose). Pokud žádný blok,
  //      řezáme až k X=0.
  //
  // Nájezd: G0 X za polotovar → G0 Z na hloubku → G1 −X řez → G1 retract 45°.
  // 45° retract po čelním řezu jede do už odřezané zóny (slab nad
  // currentZ byl plně odebrán předchozími pasy + aktuálním), takže
  // bezpečné.
  // Vůle od HRANY nástroje: nos špičky (R) předbíhá střed — viz rapidStartXAt.
  // Helper: max X polotovaru (skutečná pravá hrana materiálu) na zadané Z.
  // Pro cylinder = konstantní sRad. Pro casting = max X všech průsečíků
  // svislice v Z s outline polotovaru → per-Z, takže rapid nemusí jezdit
  // až na globální sRad+clearance, ale jen těsně nad lokální povrch.
  // `…OrNull` verze vrací null tam, kde svislice obrys polotovaru MINE
  // (za čelem, za upnutým koncem) — „materiál neznámé výšky" a „žádný
  // materiál" jsou pro hlídání držáku dvě různé věci a fallback na sRad
  // by z prázdna udělal stěnu vysokou jako jmenovitý polotovar.
  const castingOuterOrNull = (z) => {
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
    return maxX > -9999 ? maxX : null;
  };
  const castingOuterAtZ = (z) => castingOuterOrNull(z) ?? sRad;
  // Rapid-bezpečná X pro STŘED špičky na zadané Z. Nos je kruh rádiusu R:
  // ve vzdálenosti dz od středu sahá o √(R²−dz²) níž než střed, takže
  // „povrch v tomhle jediném Z + R" nestačí — nad stoupajícím sousedstvím
  // (kužel odlitku, stěna) vjede BOK nosu do materiálu dřív, než na něj
  // dosedne špička. Okno se bere jen do NEOBROBENÉ strany (proti směru
  // marche); na obrobené straně už syrový obrys neplatí a clearance nad ním
  // by hnala rychloposuv zbytečně vysoko.
  // U R 0,8 mm je okno neznatelné, u R 8 mm je to reálná kolize (rychloposuv
  // na xStart projel kuželem polotovaru).
  const rTipFC = Math.max(parseFloat(prms.toolRadius) || 0, 0);
  const clrXFC = stockClearances(prms).x;
  const rapidStartXAt = (z, xHere, dirUncut) => {
    let need = xHere + rTipFC;
    const n = 8;
    for (let i = 1; i <= n && rTipFC > 1e-6; i++) {
      const dz = rTipFC * (i / n);
      const cand = castingOuterAtZ(z + dirUncut * dz) + Math.sqrt(Math.max(0, rTipFC * rTipFC - dz * dz));
      if (cand > need) need = cand;
    }
    return need + clrXFC;
  };
  // Mez DOTYKU pro střed nosu: nad ní průchod v tomto Z už nic neodebere
  // (nos se nedotkne polotovaru ani bokem). Táž geometrie jako rapidStartXAt,
  // jen bez vůle a na obě strany. Programovaný bod je střed nosu, takže mez
  // leží o rádius NAD povrchem — porovnávat konec řezu se samotným povrchem
  // (natož s jmenovitým sRad) je záměna soustav.
  const xTouchAt = (z) => {
    let m = castingOuterAtZ(z) + rTipFC;
    const n = 8;
    for (let i = 1; i <= n && rTipFC > 1e-6; i++) {
      const dz = rTipFC * (i / n);
      const bulge = Math.sqrt(Math.max(0, rTipFC * rTipFC - dz * dz));
      m = Math.max(m, castingOuterAtZ(z - dz) + bulge, castingOuterAtZ(z + dz) + bulge);
    }
    return m;
  };
  const minZPart = worldPoints.length > 0 ? Math.min(...worldPoints.map(p => p.z)) : -1000;
  // Konec marche v Z: konec DÍLCE není konec MATERIÁLU. Polotovar za čelem
  // pokračuje (přídavek na čelo, upínací zbytek) a vrstvy tam mají jet dál —
  // dřív se marchovalo jen po `minZPart`, takže u dílu končícího na Z0 nad
  // polotovarem sahajícím na Z−8 zůstalo posledních 8 mm materiálu navždy
  // neobrobených (reálný nález uživatele: poslední vrstva Z2,932 a pod ní
  // plný průměr polotovaru). Marchuje se tedy po nejnižší Z POLOTOVARU.
  //
  // Co se v konkrétním Z opravdu ubere, rozhoduje až blokáda offsetem níž:
  // za koncem offsetu (`currentZ < minOZ`) se průchod přeskočí, takže se do
  // OSY v této zóně nezajíždí — obrobek by se uřízl.
  const minZStock = (prms.stockMode === 'casting' && stockWorldPoints.length > 0)
    ? Math.min(...stockWorldPoints.map(p => p.zReal))
    : -(parseFloat(prms.stockLength) || 0);
  const marchEndZ = Math.min(minZPart, minZStock);
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
  if (!faceLeft) { for (let z = faceStartZ - step; z >= marchEndZ - 0.01; z -= step) zList.push(z); }
  else { for (let z = marchEndZ + step; z <= faceStartZ + 0.01; z += step) zList.push(z); }
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
    // Per-Z casting outer (pro casting). Pro cylinder = sRad konstantní.
    const xSurface = castingOuterAtZ(currentZ);
    const xTouch = xTouchAt(currentZ);
    let xEnd;
    let xEndBlocked = false;
    if (xsEnd.length > 0) {
      // Kontura na tomto Z protíná svislici → vyber NEJVĚTŠÍ X (= outermost
      // kontura, ten první narazíme jdoucí −X od povrchu). Filtruj jen
      // průsečíky uvnitř polotovaru — mezí je LOKÁLNÍ dotyk nosu, ne
      // jmenovitý poloměr `sRad` (ten je u odlitku jen jmenovka a bývá
      // MENŠÍ než skutečný obrys: s velkým rádiusem nosu se offsetová čára
      // přes sRad přehoupne a celý úsek průchodů tiše vypadl — reálný nález,
      // 30 mm neobrobené stěny a kolize držáku v prvním průchodu pod ní).
      const validXs = xsEnd.filter(x => x < xTouch + 1);
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
    const xStartLocal = rapidStartXAt(currentZ, xSurface, faceLeft ? 1 : -1);
    if (xEnd >= xTouch - 0.01) continue;   // nos se polotovaru nedotkne = řez vzduchem
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
  //
  // Hrana ale existuje jen po DÉLKU BŘITU (insertReachZ). Za koncem destičky
  // přebírá hlídání držák (holderBottomProfile níž), který má vlastní, mnohem
  // mírnější sklon. Bez téhle meze se přímka extrapolovala donekonečna: stěna
  // 33 mm daleko zvedla průchod o 8,8 mm, každý další ještě víc, a celá levá
  // polovina dílu se přestala obrábět (reálný nález uživatele — 76 průchodů
  // zahozeno, program končil v půlce dílu).
  if (prms.respectInsertGeometry && prms.toolShape === 'polygon') {
    const phiFaceDeg = -(parseFloat(prms.toolAngle) || 0);
    const insReach = insertReachZ(prms, faceLeft);
    if (phiFaceDeg > 0.01 && insReach > 1e-6) {
      const tanPhiF = Math.tan(Math.min(89.5, phiFaceDeg) * Math.PI / 180);
      const faceWalls = passes.filter(p => p.type === 'face' && p.blocked).map(p => ({ z: p.z, xEnd: p.xEnd }));
      let faceAdjusted = 0, faceDropped = 0;
      for (let pi = passes.length - 1; pi >= 0; pi--) {
        const p = passes[pi];
        if (p.type !== 'face') continue;
        let xE = p.xEnd;
        for (const w of faceWalls) {
          // Jen stěny na UŽ OBROBENÉ straně (zprava +Z, zleva −Z) — tam by
          // spodní hrana destičky zajela do hotového osazení.
          const machined = faceLeft ? (w.z < p.z - 1e-6) : (w.z > p.z + 1e-6);
          if (!machined) continue;
          const dz = Math.abs(w.z - p.z);
          if (dz > insReach + 1e-6) continue;   // za koncem břitu — hlídá držák
          const cand = w.xEnd + dz * tanPhiF;
          if (cand > xE) xE = cand;
        }
        if (xE > p.xEnd + 0.01) {
          // Zvednutí NAD mez dotyku = průchod by jel vzduchem nad polotovarem;
          // to není zkrácení, ale vynechání (viz totéž u hlídání držáku).
          if (xE >= p.xStart - 0.05 || xE >= xTouchAt(p.z) - 0.01) {
            passes.splice(pi, 1);
            faceDropped++;
            continue;
          }
          faceAdjusted++;
          p.xEnd = xE;
          // leadOut byl spočítán pro NEzvednutý xEnd (po reálné kontuře). Po
          // zvednutí mezní čárou destičky by sledoval konturu POD limit, kam
          // boční ostří nedosáhne → zahodit (schod tam destička neobrobí).
          if (p.contourLeadOut) delete p.contourLeadOut;
        }
      }
      if (faceAdjusted + faceDropped > 0)
        foundErrors.push({ type: 'warning', msg: `Hlídání destičky: ${faceAdjusted} čelních průchodů zkráceno`
          + (faceDropped > 0 ? `, ${faceDropped} vynecháno` : '')
          + `, aby spodní hrana destičky nezajela do kontury.` });
    }
  }

  // ── Hlídání geometrie destičky (čelně, upichovák) — vždy zapnuto ──
  // Upichovák má šířku (toolLength); programovaný bod = střed rádiusu
  // PRACOVNÍ strany (zprava = levý roh plátku, zleva = pravý). Tělo plátku
  // zasahuje šířkou do už obrobené zóny — když tam kontura stoupá (stěna
  // tvaru/kapsy, viz pravá strana zápichu), průchod se zastaví výš, aby
  // druhá strana plátku (dno + rádius + hrana) nevjela do kontury.
  // Aktivní rádius chrání offset sám (kruh R kolem bodu); zbytek těla se
  // hlídá konzervativně jako rovné dno proti offsetu.
  if (prms.toolShape === 'parting') {
    const wIns = parseFloat(prms.toolLength) || 0;
    const rIns = Math.min(parseFloat(prms.toolRadius) || 0, wIns / 2);
    if (wIns > 0.01) {
      // Natočení plátku: kladné = druhá strana výš (šikmé dno stoupá směrem
      // od aktivního rohu), záporné = níž → přísnější mez. Vzorkuje se mezi
      // STŘEDY obou rádiusů (rozpětí (w−2r)·cosθ) — offsetová čára je přesná
      // mez pro střed kružnice R; hranu za druhým rádiusem už kruhová
      // kontrola v krajním vzorku pokrývá (viz offset = kontura + R).
      const rotRad = (parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
      const span = Math.max(0, wIns - 2 * rIns) * Math.cos(rotRad);
      const tanT = Math.tan(rotRad);
      let partAdjusted = 0;
      for (let pi = passes.length - 1; pi >= 0; pi--) {
        const p = passes[pi];
        if (p.type !== 'face') continue;
        // Tělo od aktivního rohu do už obrobené zóny: zprava +Z, zleva −Z.
        const zFar = faceLeft ? p.z - span : p.z + span;
        const zLo = Math.min(p.z, zFar), zHi = Math.max(p.z, zFar);
        let xE = p.xEnd;
        const h = Math.max(0.05, (zHi - zLo) / 60 || 0.05);
        for (let z = zLo; z <= zHi + 1e-9; z += h) {
          const x = offsetXAt(z);
          if (x === null) continue;
          // Šikmé dno: v horizontální vzdálenosti d od aktivního rohu je dno
          // o d·tanθ výš (θ>0) / níž (θ<0) → mez pro programovaný bod.
          const need = x - Math.abs(z - p.z) * tanT;
          if (need > xE) xE = need;
        }
        if (xE > p.xEnd + 0.01) {
          partAdjusted++;
          if (xE >= p.xStart - 0.05) { passes.splice(pi, 1); continue; }
          p.xEnd = xE;
          p.partClamped = true;   // u stěny — viz zarovnání schodků níže
          // leadOut byl spočítán pro původní (hlubší) xEnd — zahodit.
          if (p.contourLeadOut) delete p.contourLeadOut;
        }
      }
      if (partAdjusted > 0)
        foundErrors.push({ type: 'warning', msg: `Hlídání upichováku: ${partAdjusted} čelních průchodů zkráceno/odebráno, aby tělo plátku (šířka ${wIns}) nevjelo do kontury.` });

      // ── Dojezdy upichováku po OBÁLCE (Hrub. bez schodků i u čelního) ──
      // Zkrácené průchody (partClamped) jen zapichují a vyjíždějí v X
      // (svislý výjezd řeší kontrola odskoku v generateAutoGCode) — jejich
      // dojezdy jsou smazané. KAŽDÝ zbylý dojezd se nahradí lomenou čárou
      // OBÁLKY: x(z) = max offsetu pod celou rovnou částí dna plátku
      // (tělo k obrobené straně). Na stoupající kontuře tak po povrchu
      // jede DRUHÝ rádius plátku (tělo negouguje — původní dojezd šplhal
      // aktivním rohem a tělo za ním řezalo do tvaru); na klesající se
      // obálka kryje s offsetem (původní chování, jen po úsečkách).
      // Dlouhé dojezdy „bez schodků" tím zarovnají schodky za runem
      // zkrácených průchodů najednou.
      {
        const w2R = Math.max(0, wIns - 2 * rIns);
        const dirM = faceLeft ? -1 : 1;   // směr k obrobené straně
        // Runy zkrácených průchodů (partClamped) nechávají na stěně schody —
        // dojezd PRVNÍHO nezkráceného průchodu za runem se prodlouží tak,
        // aby DRUHÝ rádius plátku dojel až na vršek stěny (zarovnání
        // schodků najednou), tj. programovaný konec = vršek − dir·(w−2r).
        const faceArr = passes.filter(p => p.type === 'face');
        const extEnd = new Map();
        // Zarovnávací prodloužení dojezdu za runem zkrácených průchodů JEN
        // s „Hrub. bez schodků i u čelního" — bez něj upichovák jen zapichuje
        // v X a posouvá se v Z (schodky zůstávají, bere jen jednou stranou).
        if (prms.noStepRoughing && prms.noStepRoughingFace) {
          let runFirst = null;
          for (let i = 0; i <= faceArr.length; i++) {
            const p = faceArr[i];
            if (p && p.partClamped) { if (!runFirst) runFirst = p; continue; }
            if (runFirst) { if (p) extEnd.set(p, runFirst.z + dirM * (step - w2R)); runFirst = null; }
          }
        }
        for (const p of faceArr) {
          const lo = p.contourLeadOut;
          let zEnd = (lo && lo.length > 0) ? lo[lo.length - 1].z2 : p.z;
          const ext = extEnd.get(p);
          if (ext !== undefined && (dirM > 0 ? ext > zEnd : ext < zEnd)) zEnd = ext;
          if (Math.abs(zEnd - p.z) < 0.02) { if (lo) delete p.contourLeadOut; continue; }
          // Jemnější kolineární tolerance — body na obloucích si nechá pro
          // zpětné proložení G2/G3 (fitArcsToPolyline), ať kód není rozsekaný
          // na stovky mikro-úseček.
          const pts = samplePartingEnvelope(offsetXAt, p.z, zEnd, w2R, dirM, 0.4, 0.003);
          const fitted = fitArcsToPolyline(pts, 0.02);
          const segs = [];
          // Napojení ode dna zápichu svisle v X na start obálky.
          if (pts.length > 0 && pts[0].x > p.xEnd + 0.02)
            segs.push({ type: 'line', x1: p.xEnd, z1: p.z, x2: pts[0].x, z2: pts[0].z });
          for (const s of fitted) {
            if (s.type === 'line') segs.push({ type: 'line', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z });
            else segs.push({ type: 'arc', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z, cx: s.cx, cz: s.cz, r: s.r, dir: s.dir, startAngle: s.startAngle, endAngle: s.endAngle });
          }
          if (segs.length > 0) p.contourLeadOut = segs;
          else if (lo) delete p.contourLeadOut;
        }
      }
    }
  }

  // ── Hlídání destičky: NIKDY HLOUB NEŽ PŘEDCHOZÍ VRSTVA ──
  // Nakloněná destička má spodní hranu klesající od špičky k obrobené straně
  // pod úhlem natočení. Průchod proto nesmí jít hlouběji než ten předchozí:
  // v axiální vzdálenosti dz za ním leží hrana o dz·tan(natočení) NÍŽ, takže
  // hlubší řez by hranou zajel do už hotové vrstvy.
  //
  // PROČ AŽ TADY: hlídání výš běží PŘED hlídáním DRŽÁKU. Cokoli držák potom
  // zvedne (a zvedá to po vlastním sklonu), už žádná kontrola destičky
  // nevidí — a přesně tak vznikaly sestupné série „škrábanců", kde každý
  // další průchod jel o 0,26 mm HLOUB než ten před ním (nález uživatele:
  // N1730 X20,219 → N1780 X19,955 na Ø21,8). Tohle je poslední slovo nad
  // hotovým seznamem průchodů, takže ho nemá co přebít.
  //
  // Mimo dosah břitu (insertReachZ) hrana nesahá — tam se řetěz resetuje a
  // hlídání přebírá držák (holderBottomProfile výš).
  const enforceLayerDepth = () => {
    if (!(prms.respectInsertGeometry && prms.toolShape === 'polygon')) return;
    const phiDeg = -(parseFloat(prms.toolAngle) || 0);
    const reachM = insertReachZ(prms, faceLeft);
    if (phiDeg > 0.01 && reachM > 1e-6) {
      const tanM = Math.tan(Math.min(89.5, phiDeg) * Math.PI / 180);
      const byZ = new Map(passes.filter(p => p.type === 'face').map(p => [p.z.toFixed(3), p]));
      const dropM = new Set();
      const done = [];            // { z, x } hotové vrstvy v dosahu břitu
      let raisedM = 0, droppedM = 0;
      // Jde se po CELÉ marche mřížce, ne jen po existujících průchodech: kde
      // průchod není (vypadl dřív — mimo polotovar, držák, nulový řez), stojí
      // syrový materiál v úrovni povrchu a hrana destičky do něj zajede úplně
      // stejně. Bez toho se první průchod pod takovým pásem tvářil jako volný.
      for (const zGrid of zList) {
        const p = byZ.get(zGrid.toFixed(3));
        if (!p) {
          const raw = xTouchAt(zGrid);
          if (Number.isFinite(raw)) {
            done.push({ z: zGrid, x: raw });
            while (done.length > 0 && Math.abs(zGrid - done[0].z) > reachM + step) done.shift();
          }
          continue;
        }
        let need = -Infinity;
        for (const q of done) {
          const dz = Math.abs(p.z - q.z);
          if (dz > reachM + 1e-6) continue;
          const cand = q.x + dz * tanM;
          if (cand > need) need = cand;
        }
        if (need > p.xEnd + 0.01) {
          // Zvednutí nad mez dotyku = průchod by jel vzduchem → vynechat
          // (týž rozdíl „zkráceno × vynecháno" jako u ostatních hlídání).
          if (need >= p.xStart - 0.05 || need >= xTouchAt(p.z) - 0.01) {
            dropM.add(p);
            droppedM++;
            // Vynechaný pás zůstává neobrobený — pro další vrstvy je to
            // materiál v úrovni povrchu, ne vzduch.
            done.push({ z: p.z, x: xTouchAt(p.z) });
            continue;
          }
          p.xEnd = need;
          raisedM++;
          // Dojezd byl spočítaný pro hlubší dno — po zvednutí by šel pod mez.
          if (p.contourLeadOut) delete p.contourLeadOut;
        }
        done.push({ z: p.z, x: p.xEnd });
        while (done.length > 0 && Math.abs(p.z - done[0].z) > reachM + step) done.shift();
      }
      if (dropM.size > 0) {
        for (let i = passes.length - 1; i >= 0; i--) if (dropM.has(passes[i])) passes.splice(i, 1);
      }
      if (raisedM + droppedM > 0) {
        foundErrors.push({ type: 'warning', msg: `Hlídání destičky (hloubka vrstev): ${raisedM} průchodů zkráceno`
          + (droppedM > 0 ? `, ${droppedM} vynecháno` : '')
          + ` — natočená destička (${phiDeg.toFixed(0)}°) nesmí jet hlouběji než předchozí vrstva, jinak by spodní hrana zajela do už obrobeného.` });
      }
    }
  };
  // Volá se DVAKRÁT a je to nutné:
  //   • před hlídáním držáku, aby držák počítal schody z konečných hloubek
  //     (jinak si postaví `stair` z průchodů, které pak stejně zmizí, a jeho
  //     rozhodnutí neodpovídají výsledku → kolize),
  //   • po něm, protože držák zvedá po SVÉM sklonu a tím pravidlo poruší.
  // Obě hlídání smí hloubku jen ZVEDAT, takže se střídavým voláním nerozhoupou.
  enforceLayerDepth();

  // ── Hlídání DRŽÁKU (čelně) ────────────────────────────────────────
  // Čelní průchod jede radiálně k ose a držák se veze na UŽ OBROBENÉ
  // straně (zprava +Z, zleva −Z); jeho spodní hrana stoupá od špičky pod
  // úhlem hřbetu (holderBottomProfile). Průchod proto smí jít jen tak
  // hluboko, aby pod držákem prošlo všechno, co na té straně stojí:
  //   (a) KONTURA dílu (offsetová čára — trvalá překážka),
  //   (b) DNA sousedních, dřív hotových průchodů (schodiště). Clamp jen
  //       proti statické kontuře si schody sám vyrábí a kolize po
  //       zkrácení ROSTOU — poučení z makeHolderClamp (viz
  //       docs/geometry-libs-migration.md, Fáze 3a).
  // Pás, který si vyčistí sama destička (insertBodyZ), se přeskakuje —
  // tam držák jede v kerfu po vlastním řezu.
  //
  // Důsledek je fyzikální, ne konzervativní odhad: nástroj se může
  // zanořovat nejvýš pod úhlem hřbetu držáku. Kde kontura klesá strměji
  // (stěna, kužel), se průchody zkrátí a materiál pod nimi zůstane —
  // ta oblast se čelně zprava tímhle nožem obrobit NEDÁ (hlásí ⚠).
  if (prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__) {
    const hb = holderBottomProfile(prms);
    const faceArr = hb ? passes.filter(p => p.type === 'face') : [];
    if (hb && faceArr.length > 0) {
      const dirM = faceLeft ? -1 : 1;           // směr k obrobené straně
      const kerf = Math.max(insertBodyZ(prms), 0);
      const hStep = Math.max(0.2, hb.reach / 60);
      // Schodiště: rovné dno nechává jen průchod BEZ dojezdu (s dojezdem
      // „bez schodků" jde dno po kontuře, tu pokrývá offsetXAt) a průchod
      // vynechaný — tam stojí SYROVÝ polotovar (`raw`, vzorkuje se až
      // v dotazu: přes šířku pásu se obrys odlitku může zlomit o desítky
      // mm — reálný nález, hrana Ø129 uprostřed pásu jinak propadla).
      const stair = [];                          // { zLo, zHi, x } | { zLo, zHi, raw }
      const stairAt = (zq) => {
        let top = null;
        for (const s of stair) {
          if (zq < s.zLo - 1e-9 || zq > s.zHi + 1e-9) continue;
          const x = s.raw ? castingOuterOrNull(zq) : s.x;
          if (x !== null && (top === null || x > top)) top = x;
        }
        return top;
      };
      // Z-pásy BEZ průchodu se do evidence schodů nedostanou jinudy: `faceArr`
      // je nezná (vypadly už v generování — mimo polotovar, nulový řez) a clamp
      // by pod nimi viděl jen konturu, tedy vzduch. Stojí tam přitom SYROVÝ
      // polotovar v plné výšce a právě do něj najel držák prvního průchodu pod
      // takovým pásem (reálný nález: 30 mm neobrobené stěny, 91 mm² kolize).
      {
        const have = new Set(faceArr.map(p => p.z.toFixed(3)));
        for (const z of zList) {
          if (have.has(z.toFixed(3))) continue;
          const zB = z + dirM * step;
          stair.push({ zLo: Math.min(z, zB), zHi: Math.max(z, zB), raw: true });
        }
      }
      // Nejmenší programovaná hloubka (X) na Z, při které držák projde.
      // POZOR na soustavy: `offsetXAt` je dráha STŘEDU špičky, materiál pod
      // ní leží o rádius níž (offset = kontura + R + přídavek), a držák míjí
      // MATERIÁL, ne dráhu. Bez odečtení R je clamp o celý rádius přísnější,
      // než je fyzikálně nutné, a to už se pozná na dokončování (bere pak
      // víc než přídavek). `stairAt` naopak vrací rovné dno = skutečný
      // povrch (tělo destičky ho zarovnává v úrovni programovaného bodu),
      // takže se z něj NEODEČÍTÁ.
      const tipR = Math.max(parseFloat(prms.toolRadius) || 0, 0);
      const minTipX = (z) => {
        let need = -Infinity;
        for (let d = kerf; d <= hb.reach + 1e-9; d += hStep) {
          const hx = hb.bottomAt(d);
          if (hx === null) continue;
          const zq = z + dirM * d;
          const oc = offsetXAt(zq);
          let floor = oc === null ? null : oc - tipR;
          const st = stairAt(zq);
          if (st !== null && (floor === null || st > floor)) floor = st;
          if (floor === null) continue;
          const cand = floor - hx + HOLDER_CLAMP_MARGIN;
          if (cand > need) need = cand;
        }
        return need;
      };
      // Odskok po řezu jede o `rDist` v X a `rDistZ` v Z K OBROBENÉ STRANĚ —
      // tam se okno držáku posune o rDistZ dál, takže konec průchodu musí
      // projít i v té poloze (o rDist výš). Bez toho průchod dosedne na mez
      // a teprve odskok zaveze držák do stěny (reálný nález: 50 mm² na
      // odskoku, když samotný řez byl čistý).
      const rDist = Math.max(parseFloat(prms.retractDistance) || 0, 0);
      const rAngDeg = Math.max(5, Math.min(90, parseFloat(prms.retractAngle) || 45));
      const rDistZ = rAngDeg >= 89.95 ? 0 : rDist / Math.tan(rAngDeg * Math.PI / 180);
      const minTipXFull = (z) => rDistZ > 1e-9
        ? Math.max(minTipX(z), minTipX(z + dirM * rDistZ) - rDist)
        : minTipX(z);
      // Dojezd „bez schodků" šplhá po kontuře k obrobené straně — přesně
      // tam, kde se veze držák. Ořízne se v prvním bodě, kde by narazil.
      const trimLeadOut = (p) => {
        if (!p.contourLeadOut) return false;
        const keep = [];
        for (const s of p.contourLeadOut) {
          if (s.x2 + 1e-9 < minTipX(s.z2)) break;
          keep.push(s);
        }
        if (keep.length === p.contourLeadOut.length) return false;
        if (keep.length > 0) p.contourLeadOut = keep; else delete p.contourLeadOut;
        return true;
      };
      let holderAdjusted = 0, holderDropped = 0, holderTrimmed = 0;
      const drop = new Set();
      for (const p of faceArr) {
        const need = minTipXFull(p.z);
        if (need > p.xEnd + 0.01) {
          // Zvednutí NAD mez dotyku nosu je stejné vynechání jako zvednutí nad
          // nájezdovou X — průchod by jen projel vzduchem nad polotovarem
          // (a dojel by tam, kde držák stejně nemá místo). Bez téhle větve
          // zůstal v programu „řez", který nic neodebral, ale kolidoval.
          if (need >= p.xStart - 0.05 || need >= xTouchAt(p.z) - 0.01) {
            drop.add(p);
            holderDropped++;
          } else {
            p.xEnd = need;
            p.holderClamped = true;
            holderAdjusted++;
            // Dojezd byl spočítaný pro hlubší (původní) dno — po zvednutí
            // by sledoval konturu POD mezí držáku.
            if (p.contourLeadOut) delete p.contourLeadOut;
          }
        } else if (trimLeadOut(p)) {
          holderTrimmed++;
        }
        // Evidence schodu pro další (hlubší, více vlevo) průchody.
        const zA = p.z, zB = p.z + dirM * step;
        const entry = { zLo: Math.min(zA, zB), zHi: Math.max(zA, zB) };
        if (drop.has(p)) stair.push({ ...entry, raw: true });
        else if (!p.contourLeadOut) stair.push({ ...entry, x: p.xEnd });
      }
      if (drop.size > 0) {
        for (let i = passes.length - 1; i >= 0; i--) if (drop.has(passes[i])) passes.splice(i, 1);
      }
      if (holderAdjusted + holderDropped > 0) {
        foundErrors.push({ type: 'warning', msg: `Hlídání držáku (čelně): ${holderAdjusted} průchodů zkráceno`
          + (holderDropped > 0 ? `, ${holderDropped} vynecháno` : '')
          + ` — hlouběji by držák (šířka ${hb.reach.toFixed(0)} mm) narazil do materiálu na obrobené straně. Materiál pod mezí obrobte jinou strategií (podélně / zleva) nebo štíhlejším nožem.` });
      } else if (holderTrimmed > 0) {
        foundErrors.push({ type: 'warning', msg: `Hlídání držáku (čelně): ${holderTrimmed} dojezdů zkráceno, aby držák nenarazil do stoupající kontury.` });
      }
    }
  }
  enforceLayerDepth();
}

// PODÉLNÉ HRUBOVÁNÍ (RIGHT → LEFT, standardní soustružení).
export function genLongPasses(ctx) {
  const { prms, sRad, stockFace, step, offsetPath, stockWorldPoints, stockPathSegments, passes, foundErrors, offsetXAt, traceOffsetPath, findPocketExitZ, findLeadOutEndZ, hIntersect, machiningRange, machiningRangeX, holderClampZEnd, interferenceGuides } = ctx;
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
  // Konec rozsahu obrábění 📐 je TVRDÉ dno pro KAŽDÝ řezný pohyb, ne jen pro
  // samotný řez vrstvy. Ten drží effZMin (viz níž), ale sledování obrysu
  // (findLeadOutEndZ) i cíl rampy (findRampOutTarget) si za dno braly polotovar
  // / siluetu odlitku — dojezd schodu a dokončení rampy pak rozsah přejely
  // o desítky mm (reálný nález na díle uživatele: dojezd na Z42 a rampa až na
  // Z21 při konci rozsahu Z61,1).
  const rangeZLoL = machiningRange ? machiningRange.zLo : -Infinity;
  const traceFloorL = Math.max(cylStockZ, rangeZLoL);

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

  // ── Rozsah obrábění 📐 ořezává i GEOMETRII, ze které se plánuje ────────
  // Díl se obrábí po ÚSECÍCH: co je mimo rozsah, se v téhle operaci neobrábí,
  // a nesmí proto ani ovlivňovat plánování drah. Bez ořezu odlitkový hrb ZA
  // hranicí rozsahu protahoval hloubkovou posloupnost (`maxStockX`) a vjezdy
  // mířily na povrch, který v rozsahu vůbec není — reálný nález na díle
  // uživatele: rozsah Z 108–195,6 (polotovar tam sahá do X≈48) vygeneroval
  // průchody na X≈65 a X≈59, tedy řez vzduchem.
  //
  // Kolize se dál hlídají proti CELÉMU polotovaru: obálka držáku se staví
  // v calculatePipeline.js z neořezaných `stockPathSegments`, stejně tak
  // validátor kolizí a model úběru. Ořez je JEN o tom, co se plánuje.
  const rangeClipZ = machiningRange
    ? { zLo: machiningRange.zLo, zHi: machiningRange.zHi } : null;
  // Vrch polotovaru v X — jen z části, která leží v rozsahu.
  let maxStockX = sRad;
  if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
    maxStockX = -9999;
    stockWorldPoints.forEach(p => {
      if (rangeClipZ && (p.zReal < rangeClipZ.zLo - 0.01 || p.zReal > rangeClipZ.zHi + 0.01)) return;
      if (p.xReal > maxStockX) maxStockX = p.xReal;
    });
    // Body obrysu můžou být řídké (dlouhý segment přes celý rozsah): dobrat
    // ještě průsečíky obrysu s oběma hranicemi rozsahu.
    if (rangeClipZ) {
      for (const zB of [rangeClipZ.zLo, rangeClipZ.zHi]) {
        const xB = stockOuterXAtZ(prms, sRad, stockPathSegments, zB);
        if (xB !== null && xB > maxStockX) maxStockX = xB;
      }
    }
    if (maxStockX < 0) maxStockX = sRad;    // v rozsahu není polotovar vůbec
  }

  // Z-rozsah polotovaru na zadané hloubce X (ořezaný rozsahem 📐 — viz výš).
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
      if (!rangeClipZ) return { zMax: zs[0], zMin: zs[zs.length - 1], all: zs };
      // Ořez na rozsah: hranice se přidají jako průsečíky tam, kde přes ně
      // materiál pokračuje, aby parita v passEntryZ zůstala konzistentní.
      const inR = zs.filter(z => z >= rangeClipZ.zLo - 1e-9 && z <= rangeClipZ.zHi + 1e-9);
      for (const zB of [rangeClipZ.zHi, rangeClipZ.zLo]) {
        const xB = stockOuterXAtZ(prms, sRad, stockPathSegments, zB);
        if (xB !== null && xB > X + 0.01) inR.push(zB);
      }
      if (inR.length < 2) return null;      // v rozsahu na téhle hloubce nic není
      inR.sort((a, b) => b - a);
      return { zMax: inR[0], zMin: inR[inR.length - 1], all: inR };
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

  // Uzavřená smyčka polotovaru (odlitek) — zvedání rampových kotev kapes
  // na hranici materiálu + vůli X; null = válec (rampy kotví postaru).
  // `stockLoopFullL` = CELÝ polotovar (hlídání kolizí držáku, viz
  // holderEntryCapZ níž), `stockLoopL` = ořezaný rozsahem 📐 (plánování drah,
  // viz rangeClipZ výš).
  const stockLoopFullL = prms.stockMode === 'casting' ? buildStockLoop(prms, stockPathSegments) : null;
  // Ořez smyčky Z-pásem rozsahu (Clipper). Víc komponent = polotovar je
  // v pásu přerušený; bere se ta s největším rozpětím X (hlavní kus).
  const clipLoopToRange = (loop) => {
    if (!loop || !rangeClipZ) return loop;
    let xTop = -Infinity;
    for (const p of loop) if (p.x > xTop) xTop = p.x;
    const band = [
      { x: -10, z: rangeClipZ.zLo }, { x: xTop + 10, z: rangeClipZ.zLo },
      { x: xTop + 10, z: rangeClipZ.zHi }, { x: -10, z: rangeClipZ.zHi },
    ];
    let parts = [];
    try { parts = polyIntersect([loop], [band]); } catch { return loop; }
    if (parts.length === 0) return null;
    let best = null, bestSpan = -Infinity;
    for (const pt of parts) {
      let lo = Infinity, hi = -Infinity;
      for (const p of pt) { if (p.x < lo) lo = p.x; if (p.x > hi) hi = p.x; }
      if (hi - lo > bestSpan) { bestSpan = hi - lo; best = pt; }
    }
    return best;
  };
  const stockLoopL = clipLoopToRange(stockLoopFullL);
  // PLÁNOVACÍ (vůlí-posunutá) silueta odlitku — „tečkovaná" offsetová čára
  // z náhledu. Sdílená implementace: offsetStockLoop v materialRemoval.js
  // (tam i důvod, proč se posouvá přes polyOffset a ne ad-hoc odečtením
  // vůle na konci zjištěné přímky — na diagonále to není totéž co posun
  // KOLMO k hranici; reálný nález na díle uživatele: dojezd „bez schodků"
  // u strmé stěny systematicky minul offsetovou čáru).
  const offsetLoopOf = (loop) => offsetStockLoop(loop, prms);
  const stockLoopOffsetL = offsetLoopOf(stockLoopL);
  // Táž čára nad CELÝM polotovarem (bez ořezu rozsahem) — hlídání kolize
  // držáku musí vidět i materiál za hranicí rozsahu (holderEntryCapZ níž).
  const stockLoopOffsetFullL = (stockLoopFullL === stockLoopL)
    ? stockLoopOffsetL : offsetLoopOf(stockLoopFullL);
  // Max X vůlí-posunuté siluety na dané Z (stejný vzor jako
  // planTopXAtZ v gcodeEmit.js, nad stockLoopOffsetL místo
  // stockLoop0OffsetRef) — offsetová čára pro vjezd na hranici rozsahu Z.
  const topXOnLoop = (loop, z) => {
    if (!loop) return null;
    let top = null;
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i], b = loop[(i + 1) % n];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
        if (top === null || x > top) top = x;
      }
    }
    return top;
  };
  const offsetStockTopXAtZ = (z) => topXOnLoop(stockLoopOffsetL, z);

  // ── Kde smí ZAČÍT zanořovací rampa (strop podle držáku) ───────────────
  // Vjezd průchodu se dosud řídil jen tím, kde na dané hloubce začíná
  // polotovar (passEntryZ), plus ručním „Startem rozsahu Z" (📐). U odlitku,
  // kde NAPRAVO od obráběné zóny stojí hrb (velký průměr), byla kotva rampy
  // na povrchu TOHO hrbu — rampa odtud na hloubku vyšla desítky mm dlouhá,
  // nevešla se do intervalu a celý průchod se zahodil. Menší průměry pak
  // zůstaly nehrubované a obejít se to dalo jen ručním posunutím Startu
  // rozsahu Z doleva, až za hrb (reálný nález na díle uživatele).
  //
  // Tenhle helper takové místo najde sám: nejpravější Z, kde
  //   (a) nástroj stojí na povrchu (vůlí-posunutá silueta = „tečkovaná"
  //       offsetová čára, Přídavek X/Z polotovaru) a rampa odtud na hloubku
  //       ještě dosáhne nad dno intervalu,
  //   (b) vedle se vejde DRŽÁK — v celém svém axiálním dosahu od špičky
  //       (+ HOLDER_STOCK_GAP volného prostoru) nestojí materiál VYŠŠÍ, než
  //       je povrch v místě vjezdu.
  // Výsledek se pak zanořuje rampou úplně stejně jako vjezd na hranici
  // rozsahu Z — sdílí s ním i celý řetěz kotev (entryRampAnchor níž).
  const holderLoopL = (prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__)
    ? holderWorldLoop(prms, false) : null;
  const DZ_CAP = 0.25;
  // Axiální dosah držáku od špičky + volný prostor; DZ_CAP navíc kryje
  // zaokrouhlení skenu (hranu hrbu vzorky můžou minout o krok).
  const holderZLoL = holderLoopL ? Math.min(...holderLoopL.map(p => p.z)) - HOLDER_STOCK_GAP - DZ_CAP : 0;
  const holderZHiL = holderLoopL ? Math.max(...holderLoopL.map(p => p.z)) + HOLDER_STOCK_GAP + DZ_CAP : 0;
  // Tabulka výšky offsetové čáry (lookup — sken okna držáku by jinak volal
  // offsetStockTopXAtZ statisíckrát).
  // Tabulka se staví nad CELÝM polotovarem (stockLoopOffsetFullL) — držák
  // narazí i do materiálu za hranicí rozsahu 📐, ten se jen neobrábí.
  let capZ0 = 0, capTab = null;
  if (holderLoopL && stockLoopOffsetFullL && holderZHiL - holderZLoL > 0.05) {
    let tLo = Infinity, tHi = -Infinity;
    for (const p of stockLoopOffsetFullL) { if (p.z < tLo) tLo = p.z; if (p.z > tHi) tHi = p.z; }
    const n = Math.ceil((tHi - tLo) / DZ_CAP) + 1;
    if (n > 1 && n < 40000) {
      capZ0 = tLo;
      capTab = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const t = topXOnLoop(stockLoopOffsetFullL, tLo + i * DZ_CAP);
        capTab[i] = (t === null) ? -Infinity : t;
      }
    }
  }
  // Výška offsetové čáry z tabulky; null = mimo polotovar (vzduch).
  const stockTopTab = (z) => {
    if (!capTab) return null;
    const i = Math.round((z - capZ0) / DZ_CAP);
    if (i < 0 || i >= capTab.length || capTab[i] === -Infinity) return null;
    return capTab[i];
  };
  // Spodní hrana obrysu DRŽÁKU v axiální vzdálenosti `dz` od špičky
  // (relativně k hrotu, tedy 0 u špičky a rostoucí dozadu). Tabulka, protože
  // sken okna držáku ji volá statisíckrát.
  let holderBotTab = null;
  if (holderLoopL) {
    const n = Math.ceil((holderZHiL - holderZLoL) / DZ_CAP) + 1;
    if (n > 1 && n < 40000) {
      holderBotTab = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const zz = holderZLoL + i * DZ_CAP;
        let bot = Infinity;
        for (let k = 0; k < holderLoopL.length; k++) {
          const a = holderLoopL[k], b = holderLoopL[(k + 1) % holderLoopL.length];
          if ((a.z <= zz && b.z > zz) || (b.z <= zz && a.z > zz)) {
            const x = a.x + (b.x - a.x) * ((zz - a.z) / (b.z - a.z));
            if (x < bot) bot = x;
          }
        }
        holderBotTab[i] = (bot === Infinity) ? Infinity : bot;
      }
    }
  }
  const holderBottomAt = (dz) => {
    if (!holderBotTab) return 0;
    const i = Math.round((dz - holderZLoL) / DZ_CAP);
    if (i < 0 || i >= holderBotTab.length) return Infinity;   // mimo držák = volno
    return holderBotTab[i];
  };
  // Vejde se držák, když špička stojí na (X_tip = `top`) v axiální poloze `z`?
  //
  // Dřív se držák modeloval PLOCHÝM blokem v úrovni špičky (`t > top + 0,05`
  // blokovalo) — jenže reálný obrys stoupá (u tohoto držáku z 0 na 20 mm už
  // po 6,5 mm dozadu), takže se plochý model bránil i tam, kde by držák
  // pohodlně přeletěl. Teď se bere SKUTEČNÁ spodní hrana obrysu a od ní se
  // ubere `HOLDER_ENTRY_STOCK_GAP` jako bezpečnostní odstup od offsetové
  // čáry polotovaru (přání uživatele: „ať je držák tak 2 mm od té čáry").
  // U špičky (spodní hrana ≈ 0) zůstává původní práh 0,05 mm — tam se
  // nástroj materiálu dotýká z podstaty.
  const holderFitsAt = (z, top) => {
    for (let s = z + holderZLoL; s <= z + holderZHiL + 1e-9; s += DZ_CAP) {
      const t = stockTopTab(s);
      if (t === null) continue;
      const room = Math.max(holderBottomAt(s - z) - HOLDER_ENTRY_STOCK_GAP, 0.05);
      if (t > top + room) return false;
    }
    return true;
  };
  const holderEntryCapZ = (X, zHi, zFloor) => {
    if (!capTab || zHi - zFloor < 0.1) return -Infinity;
    for (let z = zHi; z > zFloor; z -= DZ_CAP) {
      const top = stockTopTab(z);
      if (top === null || top <= X + 0.05) continue;              // vzduch / už pod hloubkou
      if (z - (top - X) / effPlungeTanL <= zFloor + 0.05) continue;   // (a) rampa se nevejde
      if (holderFitsAt(z, top)) return z;                          // (b) držák se vejde
    }
    return -Infinity;
  };
  // Protipól `holderEntryCapZ`: kam až se kotva zanoření smí posunout ZA
  // hranici úseku, aby sebrala co nejvíc materiálu.
  //
  // Hranice úseku leží ve STŘEDU dna údolí, takže kotva na ní vjíždí
  // doprostřed volného prostoru a půlka údolí zůstane stát — opakovaný nález
  // uživatele („bere to od prostředka"). Posunout SAMOTNOU HRANICI se dvakrát
  // nepovedlo (viz „ZBÝVÁ — hranice úseku" v docs/geometry-libs-migration.md):
  // hranice určuje, komu materiál PATŘÍ, a její posun rozbíjel pokrytí jinde.
  // Tohle vlastnictví nemění — posouvá jen KOTVU RAMPY. Je to bezpečné, protože
  // úseky jdou po řadě odshora: materiál za hranicí (větší z) UŽ JE OBROBENÝ,
  // takže rampa tudy jede vzduchem a do vrstvy vjede od kraje údolí místo
  // z jeho středu.
  const holderEntryReachZ = (X, zFrom, zCeil, zFloor) => {
    if (!capTab || !(zCeil > zFrom)) return zFrom;
    let best = zFrom;
    for (let z = zFrom + DZ_CAP; z <= zCeil + 1e-9; z += DZ_CAP) {
      const top = stockTopTab(z);
      if (top === null || top <= X + 0.05) break;      // vzduch / pod hloubkou → dál nemá smysl
      if (z - (top - X) / effPlungeTanL <= zFloor + 0.05) break;   // rampa by se nevešla
      if (!holderFitsAt(z, top)) break;                // dál už na držák není místo
      best = z;
    }
    return best;
  };

  // Rampa od hranice polotovaru: když vstup průchodu leží v KŮŘE odlitku,
  // kotva se zvedne po přímce zanoření až NA PLÁNOVACÍ OBRYS (vůlí-posunutou
  // siluetu) — posuv začíná na tečkované hranici a kůra se řeže pod úhlem
  // zanoření (žádný kolmý sjezd doprostřed kůry). Null = vstup je ve vzduchu.
  //
  // Testuje se přímo proti OFFSETOVÉ smyčce, žádné ruční přičtení vůle na
  // konci nalezené přímky: to na diagonále není totéž co posun KOLMO
  // k hranici (přesně stejná oprava jako u zrcadlového findRampOutTarget
  // níž). Konec se dopřesní půlením, ať kotva sedne PŘESNĚ na čáru, ne
  // o krok skenu (0,5 mm) dál.
  const stockEntryRamp = (X, zEntry) => {
    if (!stockLoopOffsetL) return null;
    if (pointInLoop({ x: X + 0.05, z: zEntry - 0.05 }, stockLoopOffsetL) !== 'inside') return null;
    const at = (t) => ({ x: X + t * effPlungeTanL, z: zEntry + t });
    let t = 0;
    for (let i = 0; i < 300; i++) {
      const tPrev = t;
      t += 0.5;
      const p = at(t);
      // HRANICÍ JE I HOTOVNÍ KONTURA (stejně jako u findRampOutTarget níž):
      // stoupá-li přímka zanoření do materiálu, který po hrubování ZŮSTÁVÁ
      // (boss mezi vstupem a povrchem), vedla by rampa skrz díl. Dřív se
      // testovala jen silueta polotovaru — u kapsy za bossem to dalo rampu
      // zajíždějící 15 mm pod konturu (pocket-wall-at-plunge-angle).
      // Taková rampa neexistuje: null, ať volající zvolí jinou cestu.
      if (blockedAt(p.x, p.z)) return null;
      if (pointInLoop(p, stockLoopOffsetL) === 'outside') {
        let lo = tPrev, hi = t;
        for (let k = 0; k < 24; k++) {
          const m = (lo + hi) / 2;
          if (pointInLoop(at(m), stockLoopOffsetL) === 'outside') hi = m; else lo = m;
        }
        const q = at(hi);
        return { x0: q.x, z0: q.z };
      }
    }
    return null;
  };
  // Zrcadlo stockEntryRamp: z rohu (kde sklon obrysu dosáhl úhlu zanoření,
  // viz findSteepCorner níže) se pokračuje DOLŮ/DOVNITŘ přímkou pod úhlem
  // zanoření, dokud neopustí VŮLÍ-POSUNUTOU siluetu odlitku (stockLoopOffsetL
  // — stejnou offsetovou čáru jako v náhledu/simulátoru, viz
  // planTopXAtZ v gcodeEmit.js). Používá se pro dojezd „bez
  // schodků" u strmé stěny, kde by sledování PŘESNÉHO obrysu
  // (traceOffsetPath) muselo kopírovat celou výšku stěny (reálný nález na
  // díle uživatele — stěna skoro svislá desítky mm, teprve při dně strmě
  // padá). Testuje se přímo proti OFFSETOVÉ siluetě (žádné ruční odečítání
  // vůle na konci) — dřívější verze počítala proti syrové siluetě a na
  // konci odečetla skalární vůli, což na diagonále není totéž co posun
  // KOLMO k hranici → systematicky minula offsetovou čáru.
  // HRANICÍ RAMPY JE I HOTOVNÍ KONTURA: dřív se testovala JEN silueta
  // polotovaru, takže na dílu, kde za údolím kontura zase stoupá, rampa
  // (a navazující dokončovací kroky) vedla přímkou SKRZ díl — reálný nález na
  // díle uživatele: zajezd až 18 mm pod offsetovou čáru hotovní kontury.
  // Latentní od zavedení dojezdu rampou; naplno se projeví, až když rampa může
  // přejet celé údolí (sloučené regiony). Konec se dopřesní půlením, ať rampa
  // dosedne PŘESNĚ na konturu, ne o krok skenu dřív.
  const findRampOutTarget = (cx, cz) => {
    if (!stockLoopOffsetL) return null;
    if (pointInLoop({ x: cx - 0.05, z: cz - 0.05 }, stockLoopOffsetL) !== 'inside') return null;
    const at = (t) => ({ x: cx - t * effPlungeTanL, z: cz - t });
    // Konec rozsahu obrábění 📐 je stejná zeď jako kontura: rampa se na něm
    // zastaví (a dál pokračuje leda rovný úsek uvnitř rozsahu), místo aby ho
    // přejela.
    const tMax = cz - rangeZLoL;
    let t = 0;
    for (let i = 0; i < 300; i++) {
      const tPrev = t;
      t += 0.5;
      if (t >= tMax) return tMax > 1e-6 ? at(tMax) : null;
      const p = at(t);
      if (blockedAt(p.x, p.z)) {
        let lo = tPrev, hi = t;
        for (let k = 0; k < 24; k++) {
          const m = (lo + hi) / 2;
          const q = at(m);
          if (blockedAt(q.x, q.z)) hi = m; else lo = m;
        }
        return lo > 1e-6 ? at(lo) : null;
      }
      if (pointInLoop(p, stockLoopOffsetL) === 'outside') return p;
    }
    return null;
  };
  // Bod, kde sklon OBRYSU (ne naivní sken po 0,05 mm — viz komentář u volání)
  // dosáhne úhlu zanoření a VYDRŽÍ (min. 1 mm), ne jen okrajový hrot na
  // vstupu (napojení currentX → offset kontury bývá krátký a strmý samo o
  // sobě — zaoblení/přechod).
  // Mez sklonu se porovnává s malou tolerancí, a to NENÍ kosmetika: stěna
  // vzniklá GEOMETRIÍ PLÁTKU (mezní čára „stínu" břitu, kterou vkládá
  // buildMachinableContour místo nedosažitelného oblouku) klesá PŘESNĚ pod
  // úhlem zanoření — u automatického úhlu je totiž effPlungeDeg = |Natočení|
  // plátku (getEffectivePlungeAngle), tedy TÝŽ úhel, pod kterým se mezní čára
  // konstruuje. Ostré porovnání (>=) na ní kvůli zaokrouhlení dopadalo o ~1e-5
  // relativně POD mez, takže se roh nenašel NIKDY a dojezd „bez schodků" sjel
  // celou stěnu jedním nekontrolovaným úsekem místo rampy ořízlé na Hloubku
  // (ap) — reálný nález na díle uživatele: zajezd 4,5 mm v X pod hloubku
  // vrstvy a záběr proti polotovaru přes ap. Tolerance 0,1 % tangenty ≈ 0,06°
  // při 15°, tj. fyzikálně nic, ale okrajový případ spolehlivě chytí.
  const steepTanTol = effPlungeTanL * 1e-3;
  const findSteepCorner = (zFrom, zStop) => {
    const h = 0.05, minRun = 20; // 20×0,05 = 1 mm trvalého sklonu
    let runLen = 0, runX = null, runZ = null;
    for (let z = zFrom; z > zStop + h; z -= h) {
      const xa = offsetXAt(z), xb = offsetXAt(z - h);
      if (xa === null || xb === null) { runLen = 0; continue; }
      if ((xa - xb) / h >= effPlungeTanL - steepTanTol) {
        if (runLen === 0) { runX = xa; runZ = z; }
        if (++runLen >= minRun) return { x: runX, z: runZ };
      } else {
        runLen = 0;
      }
    }
    return null;
  };

  // ── Fáze 3b: ořez sledování kontury (leadIn/leadOut) obálkou držáku ──
  // traceOffsetPath umí vydat trasu přes celou konturu (např. nájezd kapsy
  // od osy přes čelo) — úseky, kde by špička ležela v zakázané oblasti
  // (silueta ⊕ −držák), se z trasy vyříznou: leadIn (končí v cíli) zahodí
  // PREFIX po poslední blokovaný úsek, leadOut (začíná na konci řezu)
  // zahodí SUFFIX od prvního blokovaného. Vzorkování po ~0,5 mm (tětiva).
  // Test úseku trasy proti zakázané oblasti. `soft` = měkká oblast
  // (erodovaná o dosah špičky + 1 mm): drhnutí o přídavkovou slupku
  // podél stěn toleruje — používá se JEN pro dočišťovací trasy kapes
  // (guides v2 tam vědomě pouští držák těsně podél stěn, dno musí
  // zůstat dosažitelné). Vše ostatní testuje tvrdou oblast.
  const _traceSegBlocked = (s, soft) => {
    const test = soft ? holderClampZEnd?.isForbiddenSoft : holderClampZEnd?.isForbidden;
    if (!test) return false;
    const n = Math.max(1, Math.min(32, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.5)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (test(s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t)) return true;
    }
    return false;
  };
  const holderTrimLeadIn = (li, soft = false) => {
    if (globalThis.__DISABLE_HOLDER_TRIMS__) return li;
    if (!holderClampZEnd || !holderClampZEnd.isForbidden || li.length === 0) return li;
    let lastBad = -1;
    for (let i = 0; i < li.length; i++) if (_traceSegBlocked(li[i], soft)) lastBad = i;
    if (globalThis.__HOLDER_CLAMP_DEBUG__ && lastBad >= 0)
      console.log(`[trimIn${soft ? '/soft' : ''}] ${li.length} segů → ${li.length - lastBad - 1} (od (${li[0].x1?.toFixed(1)},${li[0].z1?.toFixed(1)}))`);
    return lastBad >= 0 ? li.slice(lastBad + 1) : li;
  };
  const holderTrimLeadOut = (lo, soft = false) => {
    if (globalThis.__DISABLE_HOLDER_TRIMS__) return lo;
    if (!holderClampZEnd || !holderClampZEnd.isForbidden || lo.length === 0) return lo;
    for (let i = 0; i < lo.length; i++) {
      if (_traceSegBlocked(lo[i], soft)) {
        if (globalThis.__HOLDER_CLAMP_DEBUG__)
          console.log(`[trimOut${soft ? '/soft' : ''}] ${lo.length} segů → ${i} (blok u (${lo[i].x1?.toFixed(1)},${lo[i].z1?.toFixed(1)}))`);
        return lo.slice(0, i);
      }
    }
    return lo;
  };
  // Jemné dělení úseček (~0,4 mm) pro ořez obálkou po částech — dlouhá čára
  // dna kapsy se tak zahodí jen v zablokované části, ne celá. Oblouky (krátké
  // rohové blendy) se nedělí, ořežou se celé.
  const subdivideLineSegs = (segs, h = 0.4) => {
    const out = [];
    for (const s of segs) {
      if (s.type !== 'line') { out.push(s); continue; }
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      const n = Math.max(1, Math.ceil(len / h));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        out.push({ ...s,
          x1: s.x1 + (s.x2 - s.x1) * t0, z1: s.z1 + (s.z2 - s.z1) * t0,
          x2: s.x1 + (s.x2 - s.x1) * t1, z2: s.z1 + (s.z2 - s.z1) * t1 });
      }
    }
    return out;
  };
  // Sloučení navazujících kolineárních úseček po ořezu (jinak sekaný G-kód).
  const mergeCollinearSegs = (segs) => {
    const out = [];
    for (const s of segs) {
      const p = out[out.length - 1];
      if (p && p.type === 'line' && s.type === 'line'
          && Math.hypot(p.x2 - s.x1, p.z2 - s.z1) < 1e-6) {
        const cr = (p.x2 - p.x1) * (s.z2 - s.z1) - (p.z2 - p.z1) * (s.x2 - s.x1);
        const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
        if (Math.abs(cr) / len < 1e-3) { p.x2 = s.x2; p.z2 = s.z2; continue; }
      }
      out.push({ ...s });
    }
    return out;
  };
  let plungeShallowed = 0;

  // ── Upichovák (parting) v podélném hrubování ──
  // Zanoření je svislé a tělo plátku (šířka wIns) zasahuje od programovaného
  // bodu (střed rádiusu levého rohu) DOPRAVA. Roh kapsy se neurčuje sklonem
  // kontury (findPlungeCorner s tan90° nikdy nenajde), ale pravým okrajem
  // kapsy posunutým o (w−2r) — druhý rádius plátku pak přesně lícuje pravou
  // stěnu. Sjezdy/dojezdy po kontuře jedou po OBÁLCE (viz post-process níže).
  const isParting = prms.toolShape === 'parting';
  const wInsL = isParting ? (parseFloat(prms.toolLength) || 0) : 0;
  const rInsL = isParting ? Math.min(parseFloat(prms.toolRadius) || 0, wInsL / 2) : 0;
  const w2RL = Math.max(0, wInsL - 2 * rInsL);
  // Bez „Hrub. bez schodků": upichovák bere jen jednou stranou — žádné
  // sledování kontury (leadIn/leadOut/dokončení kapsy), jen svislé zápichy
  // a jízda v Z; schodky zůstávají.
  const partingNoDress = isParting && !prms.noStepRoughing;
  let partingNarrowPockets = 0;
  // Kapsy, jejichž DNO leží v tvrdé obálce držáku (dobrání se vynechá).
  let pocketHolderSkips = 0;
  // Kapsy, do kterých se mezi stěny nevejde DRŽÁK (clamp.span) — vynechané.
  // Hloubky, na kterých obálka DRŽÁKU něco zastavila. Tiché zahození je
  // horší než samo vynechání: uživatel nepozná, jestli jde o fyzikální mez
  // (držák se prostě nevejde), nebo o chybu — a hledá to v geometrii
  // (reálný nález: pravá strana part-13-zleva-flange, 17 průchodů pryč bez
  // jediného hlášení; jeden z counterů se dokonce plnil, ale nikdo ho
  // nehlásil — osiřel).
  //
  // Počítají se HLOUBKY, ne pokusy: zastavený interval ještě neznamená
  // ztrátu — táž hloubka bývá obsloužena jiným intervalem nebo přeskenováním
  // (na range-end-leadout dělalo počítání pokusů 17 „vynechaných průchodů",
  // ačkoli reálně chyběly 4). Ztráta = hloubka, na které nakonec NEVZNIKL
  // žádný průchod; vyhodnotí se až po smyčce proti skutečně vydaným
  // průchodům, takže na tom nezávisí, kolika `continue` se tam došlo.
  const holderBlockedDepths = new Set();
  const depthKey = (x) => Math.round(x * 1000);
  // Z-ZÓNY, které obálka držáku zahodila celé. Počítání po HLOUBKÁCH
  // (holderBlockedDepths výš) tuhle ztrátu neuvidí: stačí, aby táž hloubka
  // vydala průchod někde jinde, a zóna zmizí bez jediného slova — přesně tak
  // se u dílu uživatele potichu vypařila CELÁ pravá strana (Z 265→367,
  // 101 mm), protože držák by musel přes klín, na který nedosáhne destička.
  // Vyhodnotí se až proti skutečně vydaným průchodům (níž), aby zóny
  // dobrané dojezdem („bez schodků" sledování obrysu) nehlásily falešně.
  const holderDroppedZones = [];

  // Navázání: předchozí průchod končí přesně v bodě, odkud začíná leadIn
  // dalšího → nesmí odskočit (žádný zbytečný trojúhelník odskok+návrat),
  // plynule pokračuje po kontuře. Sdíleno kapsovou větví i fallbacky.
  const linkToPrev = (leadIn) => {
    const prevPass = passes[passes.length - 1];
    if (prevPass && prevPass.type === 'long' && !prevPass.contourLeadOut && leadIn.length > 0
        && Math.abs(prevPass.zEnd - leadIn[0].z1) < 0.05
        && Math.abs(prevPass.x - leadIn[0].x1) < step + 0.1) {
      prevPass.noRetract = true;
    }
  };

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
  // Rohy strmé stěny, které už dojezd „bez schodků" (otevřený vjezd, idx===0)
  // sám sešel rampou dolů (viz findSteepCorner/findRampOutTarget níž). Kapsa
  // za bossem na HLUBŠÍ hloubce narazí na TENTÝŽ roh znovu (roh je vlastnost
  // obrysu, nezávislá na currentX) — bez téhle evidence by ho sledovala
  // (contourLeadIn) a rampovala odznova, i když tu stěnu už jednou prošel
  // jiný průchod (reálný nález na díle uživatele — doslovný duplicitní
  // úsek G-kódu). Tolerance 2 mm (roh se s hloubkou nepatrně posouvá).
  const rampedOutCorners = [];
  // reachedX = hloubka (X), na kterou ramp-out od tohoto rohu skutečně
  // sjel (rampTarget.x). Suppress smí platit jen když ramp POKRYL i
  // hloubku AKTUÁLNĚ zpracovávaného průchodu (reachedX <= depthX) — jinak
  // by se roh mylně považoval za "hotový" i po velkém skoku hloubek
  // (několik depthIdx bez viditelné kapsy za bossem), kde ramp sjel jen o
  // kousek (typicky jeden krok) a zbytek stěny až k aktuální hloubce
  // zůstal neobrobený (reálný nález na díle uživatele: schod bez dojezdu —
  // kapsa se kvůli téhle shodě celá potlačila, i leadOut otevřeného řezu
  // ustoupil ve prospěch téže — potlačené — kapsy).
  const cornerAlreadyRampedOut = (cx, cz, depthX) =>
    rampedOutCorners.some(c => Math.abs(c.x - cx) < 2 && Math.abs(c.z - cz) < 2 && c.reachedX <= depthX + 0.5);
  // Bez „dobrat najednou": sdílená rampa z rohu kapsy nemusí dosáhnout dál
  // (strmá stěna z hlídání držáku, úzké dno) — hlubší vrstvy by pak emitovaly
  // STEJNÝ zákrok znovu a znovu (nulový progres). Pamatuj si nejlepší
  // dosaženou hloubku na roh a duplicitní zákroky potlač.
  const pocketBestX = new Map();
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
  // Dojezd po obrysu se smí použít, jen když NAVAZUJE na aktuální polohu:
  // u ZÁPICHU/kapsy má kontura na tomtéž Z víc větví a traceOffsetPath může
  // začít na jiné z nich — mezi ně by se emitoval svislý sjezd SKRZ materiál
  // (reálný nález na part-10: 6 mm pod hotovní konturu).
  const traceIfContinuous = (segs, x0, z0) => {
    const f = segs[0];
    if (!f) return [];
    return (Math.abs(f.x1 - x0) < 0.1 && Math.abs(f.z1 - z0) < 0.1) ? segs : [];
  };
  // Kam až smí jet ROVNĚ (na hloubce X) směrem doleva z bodu zFrom: po první
  // stěnu kontury, jinak na dno okna (zFloor). Stejná sémantika jako konec
  // běžného průchodu ve scanIntervals, jen z jiného výchozího Z — používá
  // dojezd „bez schodků" po dosednutí rampy.
  const straightRunEndZ = (X, zFrom, zFloor) => {
    let z = zFrom;
    while (z > zFloor + dzScan) {
      const zn = z - dzScan;
      if (blockedAt(X, zn)) return refineEngageZ(X, z, zn);
      z = zn;
    }
    // NIKDY ZPÁTKY: dno okna může ležet ZA výchozím bodem (rampa dosedne až
    // za koncem polotovaru — na dílu uživatele dosedla na Z−8,473, zatímco
    // dno okna je Z−8,000). Bez clampu vrátí funkce dno a volající z toho
    // postaví rovný úsek PROTI směru řezu: `G1 Z−8.473` a hned zpátky
    // `G1 Z−8.000`. Řež jede zprava doleva, takže konec nesmí být výš než
    // začátek; když už není kam pokračovat, vrátí se výchozí bod (nulová
    // délka) a volající takový úsek zahodí.
    return Math.min(zFloor, zFrom);
  };
  const stockRunEndZ = (X, zFrom, zFloor) => {
    const solid = (z) => { const t = topXOnLoop(stockLoopOffsetFullL, z); return t !== null && t > X; };
    if (!stockLoopOffsetFullL) return zFloor;
    let prev = zFrom;
    for (let z = zFrom - dzScan; z > zFloor + dzScan; z -= dzScan) {
      if (!solid(z)) {
        let lo = z, hi = prev;                       // lo = vzduch, hi = materiál
        for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (solid(m)) hi = m; else lo = m; }
        return hi;
      }
      prev = z;
    }
    return zFloor;
  };

  // ── „Hrub. bez schodků | i u čelního" v PODÉLNÉM hrubování ────────────
  // Dojezd po ČELNÍ (radiální) stěně je jiná práce než dojezd po kuželu:
  // nástroj šplhá v X a v Z se skoro neposune — tedy přesně to, co dělá
  // ČELNÍ hrubování. Přepínač „i u čelního" proto platí i tady (dřív se
  // vztahoval jen na čelní strategii a v podélné se nedal vypnout jinak než
  // vypnutím celého „bez schodků").
  // Test: dojezd stoupne v X víc, než ujede v Z (stěna strmější než 45°).
  // Rampované dojezdy strmých stěn (roh + rampa pod úhlem zanoření) tím
  // NEPROJDOU — ty ujedou v Z podstatně víc a zůstávají zapnuté, protože
  // jinak by pod nimi zůstal stát klín materiálu.
  // Typicky je takové „čelo" navíc jen MEZNÍ ČÁRA hlídání destičky (stěna má
  // přesně úhel plátku, viz buildMachinableContour) — dojezd po ní kopíruje
  // limit destičky a nic neubere; schod tam dobere až čelní operace.
  const isFaceLeadOut = (segs) => {
    if (!segs || segs.length === 0) return false;
    const a = segs[0], b = segs[segs.length - 1];
    return Math.abs(b.x2 - a.x1) > Math.abs(b.z2 - a.z1);
  };

  // ── Vjezd průchodu tam, kde SKUTEČNĚ začíná polotovar ─────────────────
  // Okno REGIONU (odlitek, viz níž) i rozsah obrábění 📐 můžou začínat ve
  // VZDUCHU — nad údolím odlitku nebo v mezeře mezi hrby. Průchod pak „vjížděl"
  // desítky mm mimo materiál: emise ten kus sice přeletí rychloposuvem
  // (dynamický rapidStock v gcodeEmit.js), ale obálka DRŽÁKU posuzovala vjezd
  // v místě, kam nástroj vůbec nesjede — a fyzicky v pořádku průchod zahodila
  // (reálný nález na díle uživatele: celá vrstva u NEJVĚTŠÍHO průměru vypadla).
  // Region bez materiálu na dané hloubce navíc vydával prázdný průchod, z něhož
  // v G-kódu zbyl jen dojezd = „trojúhelník" uprostřed údolí.
  //
  // Měří se na VŮLÍ-POSUNUTÉ siluetě (stockLoopOffsetL — tečkovaná hranice
  // v náhledu, přesně tam začíná posuv, viz planTopXAtZ v
  // gcodeEmit.js). Syrový obrys by vjezd posadil až ZA vůli a průchod by u
  // šikmé stěny začal řezat o vůli později → klínek stojícího materiálu
  // (ověřeno na holder-region-roughing). Bez posunuté siluety fallback na
  // průsečíky syrového obrysu (sz.all).
  // Parita: obrys je uzavřený, takže lichý počet průsečíků NAD zHi znamená, že
  // zHi leží v materiálu. Null = v okně na téhle hloubce materiál není.
  const stockCrossingsAt = (X, sz) => {
    if (!stockLoopOffsetL) return (sz && sz.all) || [];
    const zs = [];
    const n = stockLoopOffsetL.length;
    for (let i = 0; i < n; i++) {
      const a = stockLoopOffsetL[i], b = stockLoopOffsetL[(i + 1) % n];
      if ((a.x <= X && b.x > X) || (b.x <= X && a.x > X))
        zs.push(a.z + (b.z - a.z) * ((X - a.x) / (b.x - a.x)));
    }
    if (zs.length < 2) return (sz && sz.all) || [];
    zs.sort((p, q) => q - p);
    return zs;
  };
  const passEntryZ = (zHiRaw, zLo, sz, X) => {
    if (prms.stockMode !== 'casting') return zHiRaw;
    const all = stockCrossingsAt(X, sz);
    if (all.length < 2) return zHiRaw;
    let above = 0;
    for (const z of all) if (z > zHiRaw + 1e-9) above++;
    if (above % 2 === 1) return zHiRaw;                    // vjezd je v materiálu
    for (const z of all) {
      if (z > zHiRaw + 1e-9 || z <= zLo + 1e-9) continue;
      // Materiál začíná až ZA stěnou kontury (offset nad hloubkou průchodu):
      // vjet se tam nedá, ale průchod má pořád smysl jako dojezd „bez schodků"
      // po stěně — nechá se původní kraj okna, jako dřív.
      return blockedAt(X, z) ? zHiRaw : z;
    }
    return null;
  };
  // Skenem zprava doleva najde všechny volné intervaly (offset nepřekračuje
  // X) v Z∈[zLoBound,zHiBound]. První interval (od pravé hrany polotovaru) =
  // klasický otevřený vjezd. Každý další interval je kapsa za "bossem"
  // kontury. Sdíleno hlavní smyčkou hloubek X i dobíráním kapsy najednou.
  // Obálka držáku (Fáze 3a, Clipper2) — společné post-zpracování intervalů
  // pro obě cesty hledání (scan-line i booleovskou). Špička nesmí vjet do
  // zakázané oblasti (silueta offsetu ⊕ −držák): interval se zkrátí na první
  // vstup do ní. U hlavního otevřeného vjezdu navíc schodová podmínka
  // (mainStair) — držák nesmí najet do materiálu, který nechaly stát zkrácené
  // MĚLČÍ průchody. holderClamped potlačí sledování kontury z konce průchodu
  // (leadOut). Bez definovaného držáku vrací vstup beze změny.
  const applyHolderClamp = (intervals, firstOpen, X, mainScan) => {
    if (!holderClampZEnd) return { intervals, firstOpen };
    const out = [];
    let firstSurvived = firstOpen;
    for (let k = 0; k < intervals.length; k++) {
      const iv = intervals[k];
      if (k === 0 && firstOpen) {
        // OTEVŘENÝ vjezd: zakázaný start = nelze bezpečně vjet → vynechat;
        // jinak jen zkrátit hluboký konec (+ schodová podmínka).
        const nz = holderClampZEnd(X, iv.zStart, iv.zEnd, { mainStair: mainScan });
        if (nz === null) {
          firstSurvived = false;
          if (mainScan && iv.zStart - iv.zEnd >= dzScan) holderBlockedDepths.add(depthKey(X));
          continue;
        }
        // Rezerva obálky (HOLDER_CLAMP_MARGIN) patří DRŽÁKU, ne špičce:
        // clamp vrací „první vstup do zakázané oblasti + rezerva", a protože
        // tou oblastí je i samotná silueta offsetu, vyšlo to i tam, kde
        // průchod stejně končí — na STĚNĚ KONTURY. Každý zablokovaný průchod
        // pak končil o rezervu (0,1 mm) dřív, než kam na offsetovou čáru
        // dojet smí (reálný nález na díle uživatele: dráhy u čela nedojely
        // k offsetové čáře a nechávaly 0,1 mm navíc). Zkrátit se proto smí,
        // jen když MÍSTO překážky (nz − rezerva) leží ZA koncem intervalu, a
        // to o víc než řezná tolerance (0,01 mm jako v blockedAt — hranice
        // zakázané oblasti a offsetová silueta se po Clipperu liší v řádu
        // 1e-3 mm). Uvnitř tolerance jde o TUTÉŽ stěnu → konec zůstane přesný.
        if (nz - HOLDER_CLAMP_MARGIN > iv.zEnd + 0.01) { iv.zEnd = nz; iv.blocked = true; iv.holderClamped = true; }
        if (iv.zStart - iv.zEnd < dzScan) { firstSurvived = false; continue; }
      }
      // KAPSY (k>0 / zanoření) obálka NEOŘEZÁVÁ: lomené mezní čáry guides v2
      // („stěna − holderWidth") už drží držák uvnitř kapsy a jsou zapracované
      // do obrobitelné kontury. Druhá (statická) restrikce přes span by přes
      // přídavkovou slupku zkracovala rampy a bránila digu na dno (široká
      // kapsa, cam-holder test). Nájezd/výjezd kapes hlídá holderTrimLeadIn/Out;
      // zbytek pokryje validátor (⚠ panel).
      out.push(iv);
    }
    return { intervals: out, firstOpen: firstSurvived };
  };
  const scanIntervals = (X, zHiBound, zLoBound, mainScan = false) => {
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
    return applyHolderClamp(intervals, firstOpen, X, mainScan);
  };

  // ── Booleovská cesta hledání intervalů (migrace Fáze 3, za příznakem) ──
  // Zbytkový materiál = polotovar − oblast dílce (offset kontury uzavřený
  // k ose, booleanRoughing.js). Řezné intervaly na hloubce X = průnik zbytku
  // s vodorovnou čárou x=X, oříznuté na [zLoBound, zHiBound] (rozsah obrábění
  // / region / polotovar). blocked/firstOpen se klasifikují STEJNÝMI helpery
  // (blockedAt) jako scan-line, takže navazující emise (rampy, leadIn/Out,
  // obálka držáku) funguje beze změny. Spočte se JEDNOU (memoizace zbytku).
  let _residualLoops = null;
  const getResidualLoops = () => {
    if (_residualLoops !== null) return _residualLoops;
    const stockLoop = stockLoopL;
    if (!stockLoop) { _residualLoops = []; return _residualLoops; }
    // Z-rozsah z obrysu polotovaru; radiální rozsah do maxStockX (vrch
    // polotovaru). Zbytek se počítá proti PLNÉMU obdélníkovému POLOTOVAROVÉMU
    // OBALU [0..maxStockX] × [zMin..zMax], NE proti skutečné siluetě odlitku:
    // scan-line záměrně obrys polotovaru IGNORUJE („Stopuje JEN kontura",
    // rychloposuv vzduchem tam, kde odlitek chybí) — proti siluetě by se
    // intervaly u úzkých míst rozpadly na nesmyslné vnitřní „kapsy", které
    // emise neobrobí → zůstal by stát materiál. Oblast dílce vzorkuje offsetXAt
    // (přesně jako scan-line blockedAt) → intervaly SEDÍ se scan-line.
    let zMax = -Infinity, zMin = Infinity;
    for (const p of stockLoop) { if (p.z > zMax) zMax = p.z; if (p.z < zMin) zMin = p.z; }
    const envelope = [
      { x: 0, z: zMax }, { x: maxStockX, z: zMax },
      { x: maxStockX, z: zMin }, { x: 0, z: zMin },
    ];
    const region = sampleOffsetRegion(offsetXAt, zMax, zMin, dzScan);
    _residualLoops = buildResidual(envelope, region);
    return _residualLoops;
  };
  const booleanScanIntervals = (X, zHiBound, zLoBound, mainScan = false) => {
    const residual = getResidualLoops();
    // Pojistka: bez zbytku (chybí polotovar/offset) zpět na scan-line.
    if (!residual || residual.length === 0) return scanIntervals(X, zHiBound, zLoBound, mainScan);
    const eps = 1e-4;
    const intervals = [];
    for (const iv of layerZIntervalsAtX(residual, X)) {
      const zHi = Math.min(iv.zStart, zHiBound);
      const zLo = Math.max(iv.zEnd, zLoBound);
      if (zHi - zLo < dzScan) continue;
      // blocked = levý konec bounduje kontura (nedosáhl spodní meze rozsahu) —
      // stejná sémantika jako u scan-line (jen poslední otevřený běh je false).
      intervals.push({ zStart: zHi, zEnd: zLo, blocked: zLo > zLoBound + eps });
    }
    const firstOpen = !blockedAt(X, zHiBound);
    return applyHolderClamp(intervals, firstOpen, X, mainScan);
  };
  // Výběr cesty dle příznaku (default scan-line → snapshoty beze změny).
  const scan = prms.booleanRoughing ? booleanScanIntervals : scanIntervals;

  // ── Regiony (opt-in, jen odlitek) ──────────────────────────────────────
  // Polotovar odlitku má „výstupky" (bosses) oddělené „údolími", kde se
  // povrch blíží kontuře. Bez regionů jede sweep po hloubkách přes CELÝ
  // Z-rozsah → mělký průchod se táhne po kontuře napříč dílem (uživatel:
  // „přejíždí po kontuře"). S regiony se každý výstupek vyhrubuje shora
  // dolů SAMOSTATNĚ (Z-okno regionu), mezi regiony rychloposuv nad polotovar.
  // Split = střed údolí (lokální minimum X mezi dvěma výstupky).
  const FULL_REGION = [{ zHi: Infinity, zLo: -Infinity }];
  // Sestavení Z-oken regionů z bodů dělení `splits = [{ z, xSurf }]`
  // (seřazené shora dolů). Sdíleno ruční i booleovskou detekcí — každý split
  // je horní hranice regionu POD ním a dolní hranice regionu NAD ním; xSurf =
  // povrch dna údolí (hranice platí jen NAD ním, v kůře regiony splynou).
  // `zHiValleyTop` = VZDÁLENĚJŠÍ ústí údolí, ve kterém leží horní hranice
  // regionu (`zHi`). Tam až smí dojet KOTVA ZANOŘENÍ — viz holderEntryReachZ.
  // `zHiMouth`/`zLoMouth` = ÚSTÍ téhož údolí (kde sestup začíná / kde se
  // vrací na protistěnu). Hranice totiž nese DVĚ role, které se nad dnem
  // údolí a v jeho kůře rozcházejí — viz regZHi/regZLo v hloubkové smyčce:
  // střed dna dělí SOUVISLÝ materiál, ústí ohraničuje VZDUCH nad údolím.
  // Region NAD údolím končí u ústí na své straně (`s.zHi`), region POD ním
  // začíná u ústí na té své (`s.zLo`).
  const assembleRegions = (splits) => {
    if (!splits || splits.length === 0) return FULL_REGION;
    const regions = [];
    let hi = Infinity, hiSurf, hiMouth, hiValleyTop;
    for (const s of splits) {
      regions.push({
        zHi: hi, zHiSurf: hiSurf, zHiMouth: hiMouth, zHiValleyTop: hiValleyTop,
        zLo: s.z, zLoSurf: s.xSurf, zLoMouth: s.zHi,
      });
      hi = s.z; hiSurf = s.xSurf; hiMouth = s.zLo; hiValleyTop = s.zHi;
    }
    regions.push({
      zHi: hi, zHiSurf: hiSurf, zHiMouth: hiMouth, zHiValleyTop: hiValleyTop,
      zLo: -Infinity, zLoSurf: undefined, zLoMouth: undefined,
    });
    return regions;
  };
  // ── Detekce údolí — JEDNA implementace pro obě cesty (ÚKLID bod 2) ─────
  // Údolí = lokální minima horní hrany SILUETY polotovaru
  // (`computeResidualRegions` v booleanRoughing.js). Dřív to byly DVĚ funkce:
  // ruční `manualRegionSplits` chodila po vrcholech `stockWorldPoints`,
  // booleovská vzorkovala smyčku po `dzScan`. Nejlepší důkaz, že duplicita
  // škodila: obě měly identickou chybu (hranice = střed dna údolí místo ústí)
  // a záplata by dopadla jen na jednu kopii.
  //
  // Sloučeno na VZORKOVANOU verzi, protože ta určuje ÚSTÍ údolí přesněji:
  // vrcholová heuristika brala jako ústí SOUSEDNÍ VRCHOL obrysu, což je na
  // dlouhé šikmé stěně až její druhý konec (na part-11/12 se ústí lišilo tak,
  // že `splitIsNeeded` níž rozhodl opačně — 23 vs 31 průchodů). Ústí je přitom
  // to, podle čeho se k údolí přiřadí mezní čára destičky.
  //
  // POZOR (proč silueta, ne zbytek stock−dílec): legacy model regionů
  // (zHiSurf/zLoSurf) umí vyjádřit JEN odlitkový hrb — region oddělen MĚLCE
  // (X > xSurf) a v kůře dna splyne. Komponenty ZBYTKU (stock − dílec) mají
  // ale i OPAČNÝ směr (kapsa/hrb dílu = oddělen hluboko, splyne mělko), který
  // tenhle model neumí — složení celého zbytku pak nechává stát materiál
  // (ověřeno na holder-region-roughing: +121 mm² pod z≈22.9). Obecné
  // residual-komponentové regiony patří až do restrukturace emisní smyčky.
  const regionSplits = () => {
    if (!stockLoopL || stockLoopL.length < 3) return [];
    let zMax = -Infinity, zMin = Infinity;
    for (const p of stockLoopL) { if (p.z > zMax) zMax = p.z; if (p.z < zMin) zMin = p.z; }
    return computeResidualRegions([stockLoopL], zMax, zMin, dzScan);
  };
  // ── Dělí to údolí opravdu díl na úseky? (mezní čára hlídání destičky) ──
  // PRVNÍ (a nejlevnější) test, který `splitIsNeeded` níž pouští na každý
  // kandidátní split. Údolí odlitku samo o sobě hranici NEDĚLÁ. Signál je DOSAH
  // DESTIČKY: mezní čára hlídání geometrie (`interferenceGuides`, kind
  // 'zanoreni') vede od místa, kam se destička ještě dostane, ven — a teprve
  // když její volný konec VYJEDE Z POLOTOVARU do vzduchu, je za ní materiál
  // z téhle strany nedostupný a začíná další úsek. Čára, která začíná i končí
  // UVNITŘ polotovaru, končí ve stojícím materiálu: ten se dá vzít dál týmž
  // sweepem, jen se přes vzduch nad údolím přeletí rychloposuvem.
  //
  // Reálný nález na díle uživatele (part-11/12-zleva, údolí Z≈35): mezní čára
  // v tom údolí končí na hotovní kontuře, tedy uvnitř polotovaru. Přesto se
  // tam řezalo na dva úseky — nejdřív celá pravá strana údolí až na dno, pak
  // teprve levá. Protože hranice úseku se v kůře dna rozpouští, zajížděly
  // hluboké průchody pravého úseku do Z-zóny toho levého, kde nad nimi ještě
  // stál neodebraný materiál → záběr rampy/oblouku přes Hloubku (ap).
  // Zprava doleva na TÉMŽE dílu přitom `splitIsNeeded` níž hranici zahodí
  // (sweep tam údolí projede vcelku) — asymetrie čistě jen podle toho, jestli
  // sweep narazí na stěnu kontury před údolím, nebo až za ním.
  //
  // Vyhodnocuje se na CELÉM polotovaru (`stockLoopFullL`, bez ořezu rozsahem
  // 📐): jestli čára vyjede do vzduchu, je vlastnost dílu, ne zvoleného
  // úseku obrábění. Bez hlídání geometrie (`respectInsertGeometry` vypnuto)
  // je pole prázdné → nic se nezahazuje, chování beze změny.
  const guideStaysInStock = (s) => {
    if (!stockLoopFullL || !Array.isArray(interferenceGuides) || interferenceGuides.length === 0) return false;
    if (s.zHi === undefined || s.zLo === undefined) return false;
    const inStock = (p) => { try { return pointInLoop(p, stockLoopFullL) !== 'outside'; } catch { return true; } };
    let found = false;
    for (const g of interferenceGuides) {
      // Jen čáry zanoření (kam destička nedosáhne při sjíždění do údolí);
      // 'dojezd' je opačná strana břitu a o dělení úseků nevypovídá.
      if (g.kind !== 'zanoreni') continue;
      const a = { x: g.x1, z: g.z1 }, b = { x: g.x2, z: g.z2 };
      // Leží čára v ústí TOHOTO údolí?
      if (Math.max(a.z, b.z) < s.zLo - 1e-9 || Math.min(a.z, b.z) > s.zHi + 1e-9) continue;
      if (!inStock(a) || !inStock(b)) return false;   // vyjíždí ven → hranice platí
      found = true;
    }
    return found;
  };
  // ── Který split je opravdu potřeba ────────────────────────────────────
  // Druhý test: i údolí, které destička nedělí, je jen SIGNÁL, ne důvod dělit
  // dráhy. Hranice regionu dává smysl jedině tehdy, když se materiál POD
  // splitem nedá vzít týmž zátahem jako materiál NAD ním — tedy když vrstvu
  // mezi nimi něco ZASTAVÍ (stěna hotovní kontury nebo obálka držáku).
  // Nezastaví-li nic, hranice jen rozřízne souvislý zátah: nejdřív se dodělá
  // celá PRAVÁ strana a teprve pak levá — i když je vlevo VĚTŠÍ průměr (reálný
  // nález na díle uživatele: údolí vzniklé obloukem na odlitku, hrb vlevo Ø77
  // se hruboval až po hrbu vpravo Ø70). Vzduch nad údolím přitom průchod
  // přeletí rychloposuvem, takže sloučený zátah po vrstvách jde odshora dolů
  // přesně tak, jak má: od největšího průměru a doleva až tam, kam pustí
  // kontura.
  //
  // Test (čte jen geometrii, žádné vedlejší efekty): pro každou hloubku, kde
  // region POD splitem ještě něco bere, se zkusí SLOUČENÝ sken od okna nad
  // splitem po dno okna pod ním. Když sloučený zátah pokaždé dojede aspoň tak
  // hluboko jako samostatný region, split se zahodí. POZOR: tenhle test je
  // jednosměrný (porovnává jen PRVNÍ interval), takže sám o sobě odpoví jinak
  // zprava doleva než zleva doprava — proto je nad ním `guideStaysInStock`.
  const splitIsNeeded = (splits, i) => {
    const s = splits[i];
    if (guideStaysInStock(s)) return false;
    const zTop = i > 0 ? splits[i - 1].z : Infinity;
    const zBot = i + 1 < splits.length ? splits[i + 1].z : -Infinity;
    for (const X of depths) {
      if (X <= s.xSurf + 0.01) continue;          // tady hranice stejně splývá
      const sz = stockZRangeAt(X);
      if (!sz) continue;
      const zHiWin = Math.min(machiningRange ? Math.min(sz.zMax, machiningRange.zHi) : sz.zMax, zTop);
      const zLoWin = Math.max(machiningRange ? Math.max(sz.zMin, machiningRange.zLo) : sz.zMin, zBot);
      if (zHiWin - zLoWin < 0.1) continue;
      // Vzal by samostatný region pod splitem na téhle hloubce vůbec něco?
      const zEntryLo = passEntryZ(Math.min(s.z, zHiWin), zLoWin, sz, X);
      if (zEntryLo === null) continue;
      const low = scan(X, zEntryLo, zLoWin, false);
      const ivLow = low.firstOpen ? low.intervals[0] : null;
      if (!ivLow || ivLow.zStart - ivLow.zEnd < dzScan) continue;
      // Dojede tam sloučený zátah shora? Schválně se bere jen PRVNÍ interval:
      // za stěnou kontury uvnitř okna už další interval není otevřený vjezd,
      // ale KAPSA (dosažitelná jen rampou a jen se zapnutým zanořováním) —
      // brát její dosah jako důkaz, že sloučený zátah stačí, by vedlo
      // k zahození hranice a ztrátě materiálu (ověřeno na range-end-leadout:
      // vypadly celé průchody Z 61–82).
      const zEntryAll = passEntryZ(zHiWin, zLoWin, sz, X);
      if (zEntryAll === null) return true;
      const all = scan(X, zEntryAll, zLoWin, false);
      const ivAll = all.firstOpen ? all.intervals[0] : null;
      if (!ivAll || ivAll.zEnd > ivLow.zEnd + 0.05) return true;
    }
    return false;
  };
  const computeRegions = () => {
    if (!prms.regionRoughing || prms.stockMode !== 'casting' || stockWorldPoints.length < 3) return FULL_REGION;
    const rawSplits = regionSplits();
    const splits = rawSplits.filter((_, i) => splitIsNeeded(rawSplits, i));
    const regions = assembleRegions(splits);
    // Diagnostický test seam (guarded, v produkci no-op): tests/boolean-region-
    // roughing.test.js jím ověřuje separaci regionů ruční vs booleovské cesty.
    if (globalThis.__REGION_LOG__) globalThis.__REGION_LOG__.push({
      bool: !!prms.booleanRoughing,
      raw: rawSplits.map(s => ({ z: +s.z.toFixed(1), xSurf: +s.xSurf.toFixed(1) })),
      splits: splits.map(s => ({ z: +s.z.toFixed(1), xSurf: +s.xSurf.toFixed(1) })),
      // Ústí údolí (zHi/zLo) — hranice úseku je nad dnem právě u nich.
      mouths: splits.map(s => ({ zHi: +(s.zHi ?? NaN).toFixed(1), zLo: +(s.zLo ?? NaN).toFixed(1) })),
      regions,
    });
    return regions;
  };
  const _regions = computeRegions();

  for (const _region of _regions) {
  // Schodová evidence obálky držáku platí v rámci jednoho regionu —
  // jiný region hrubuje jinou stěnu, jeho schody sem nepatří.
  if (holderClampZEnd && holderClampZEnd.resetStair) holderClampZEnd.resetStair();
  // Strmé stěny, kde rampa (viz níž) byla oříznuta na currentX (Hloubka
  // ap) — po skončení hloubkové smyčky TOHOTO regionu se sem doplní
  // dokončovací zákrok, který strmou stěnu dorampuje na její původní
  // (neořízlý) cíl, než se přejede na další region (reálný nález na díle
  // uživatele: bez toho zůstal klín materiálu pod ořízlou rampou navždy
  // neobrobený — nic dalšího už tam nezajíždí).
  const pendingRampCompletions = [];
  // ── Kam už někdo sjel po TÉŽE přímce zanoření ──────────────────────────────
  // Ořízlá rampa dojezdu (pendingRampCompletions výš) a kapsa za bossem
  // (buildPocketPass níž) se v údolí potkávají na JEDNÉ přímce zanoření: roh
  // strmé stěny je pro obě týž bod. Kapsa ho ale sjíždí UVNITŘ hloubkové
  // smyčky (na hlubší vrstvě), zatímco dokončení rampy až po ní — takže se
  // tentýž klín vyřízl DVAKRÁT (reálný nález na díle uživatele: „Průchod 9
  // jede od začátku zanoření místo aby pokračoval tam, kde zanoření
  // skončilo"; průchody 9/10 byly doslovná kopie 4/5).
  // Přímku identifikuje její konstanta c = z − x/tg(úhel zanoření): všechny
  // body jednoho zanořování ji mají stejnou. Evidují se ale celé X-INTERVALY,
  // ne jen nejhlubší dosah: po jedné a téže nekonečné přímce mohou ležet DVA
  // nesouvislé útvary (naměřeno na holder-casting-slanted-face — kapsa sjela
  // po úseku X 39–45, dokončovací krok patřil úseku X 52,3–53,0 nad ním).
  // „Sjelo se hlouběji" by ten druhý úsek chybně smazalo.
  // `lineX/lineZ` = kterýkoli bod přímky, `fromX`..`toX` = úsek, který se po ní
  // OPRAVDU vyřezal. Rozdíl je podstatný: rampa kapsy se kotví nejvýš o Hloubku
  // (ap) nad svým dnem (viz „Jeden průchod nesmí sebrat víc než Hloubka (ap)"),
  // takže sjíždí jen KUS přímky vedoucí od rohu — hlásit celý rozsah od rohu by
  // smazalo dobírací krok, který patří jinému (mělčímu) úseku téže přímky
  // (naměřeno na holder-casting-slanted-face: zmizel krok X 52,3–53,0,
  // přestože kapsa sjížděla až od X 45).
  const plungeLineRuns = [];
  const plungeLineC = (x, z) => z - x / effPlungeTanL;
  const notePlungeRun = (lineX, lineZ, fromX, toX) => {
    const c = plungeLineC(lineX, lineZ);
    const lo = Math.min(fromX, toX), hi = Math.max(fromX, toX);
    const hit = plungeLineRuns.find(e => Math.abs(e.c - c) < 0.1
      && lo <= e.hi + 0.05 && hi >= e.lo - 0.05);            // navazuje/překrývá
    if (hit) { hit.lo = Math.min(hit.lo, lo); hit.hi = Math.max(hit.hi, hi); }
    else plungeLineRuns.push({ c, lo, hi });
  };
  // Je krok rampy (od curX dolů na stepX) už celý pokrytý dřívějším sjezdem
  // po TÉŽE přímce?
  const plungeRunCovers = (x0, z0, stepX, curX) => {
    const c = plungeLineC(x0, z0);
    return plungeLineRuns.some(e => Math.abs(e.c - c) < 0.1
      && stepX >= e.lo - 0.05 && curX <= e.hi + 0.05);
  };
  // Začátek průchodů TOHOTO regionu — odložené zanoření se řadí na konec
  // svého regionu, ne až za celý program (viz konec smyčky regionů).
  const regionMark = passes.length;
  // Vjezd na hranici rozsahu Z (machiningRange.zHi): kotva rampy se
  // ŘETĚZÍ mezi hloubkami (viz níž), ne restartuje pokaždé od povrchu —
  // jinak by každá hlubší vrstva znovu rampovala i tu ČÁST, kterou už
  // vyřízla vrstva PŘEDCHOZÍ (reálný nález na díle uživatele — druhá
  // rampa mířila zpátky nad povrch místo napojení na konec první).
  let entryRampAnchor = null;
  // Jakmile řetěz narazí na hranici (kontura/blokace), zbytek MÉNĚ než
  // Hloubka (ap) do skutečné cílové kontury se dořeže jedním kratším
  // krokem (níž), ne zahodí — pak se řetěz uzavře (nezkoušet znovu na
  // každé další, ještě hlubší vrstvě).
  let entryRampClosed = false;
  // Stojí nástroj OPRAVDU na kotvě řetězu? `pocketReposition` emituje přesun
  // z AKTUÁLNÍ polohy uvnitř kapsy (odskok → G0 Z → sjezd), ne nájezd zvenčí —
  // je bezpečný jen tehdy, když je kotva koncem PRÁVĚ VYDANÉHO průchodu.
  // Řetěz vjezdové rampy běží napříč hloubkami, takže se mezi jeho kroky může
  // vklínit průchod odjinud (typicky zanoření do kapsy na téže hloubce). Pak
  // kotva osiří a týž rychloposuv vede skrz stojící materiál — v takovém
  // případě se krok vydá jako normální vjezd (rampa od kotvy zůstává, jen se
  // k ní najede zvenčí). Hlídá tests/cam-ramp-chain.test.js.
  const chainTipIs = (anchor) => {
    const last = passes[passes.length - 1];
    return !!last && last.zStart !== undefined
      && Math.abs(last.x - anchor.x) < 0.01 && Math.abs(last.zStart - anchor.z) < 0.01;
  };
  // ── Obálka DRŽÁKU pro kapsový SPAN (Fáze 3b) ───────────────────────────────
  // Scan intervaly kapes vědomě neořezává (`holderClampZEnd` platí pro
  // jednostranně otevřený řez), takže by se do kapsy mezi dvě stěny pustil celý
  // interval a držák by se opřel o stěnu nad sebou. `clamp.span` vrací okno,
  // kam se držák mezi stěny opravdu vejde; null = kapsa je pro něj moc úzká
  // (patří jinému nástroji, ne podélnému hrubování).
  // MUSÍ se volat na KAŽDÉM místě, kde se kapsový interval bere ze `scan()` —
  // tedy i uvnitř bursteu „dobrat kapsu najednou", který si intervaly na každé
  // nové hloubce skenuje ZNOVU. Bez toho burst sjížděl ap po ap do kapsy širší
  // než držák a opíral se o stěnu (naměřeno na tests/cam-holder: 7 kolizí,
  // 12–32 mm² každá).
  const holderSpanClamp = (X, iv) => {
    if (!iv || !iv.blocked || !holderClampZEnd || !holderClampZEnd.span) return iv;
    const sp = holderClampZEnd.span(X, iv.zStart, iv.zEnd);
    if (!sp) return null;
    const out = { ...iv, zStart: Math.min(iv.zStart, sp.zStart), zEnd: Math.max(iv.zEnd, sp.zEnd) };
    return (out.zStart - out.zEnd < dzScan) ? null : out;
  };
  // Nejmělčí… vlastně naposledy ÚSPĚŠNÁ hloubka tohohle regionu — proti ní se
  // pozná, že posloupnost přestřelila nedosažitelnou hranici (viz uzavírací
  // vrstva na konci hloubkové smyčky).
  let lastDepthWithPasses = null;
  for (let depthIdx = 0; depthIdx < depths.length; depthIdx++) {
    const currentX = depths[depthIdx];
    const sz = stockZRangeAt(currentX);
    if (!sz) continue;

    // Rozsah obrábění (📐): ořízne Z-zónu na uživatelem zadaný interval;
    // + Z-okno regionu (region roughing).
    // Hranice regionu platí jen NAD povrchem svého údolí (zHiSurf/zLoSurf):
    // v hloubce kůry dna se sousední regiony spojí — průchod jede přes celé
    // údolí od skutečného kraje materiálu (žádné kolmé sjezdy doprostřed kůry).
    // Po rozpuštění HORNÍ hranice patří hloubka regionu NAD ní (ten už ji
    // vzal se svou rozpuštěnou dolní hranicí) — jinak duplicitní průchody.
    // Rozpouštění hranice platí jen BEZ zanořování: kolmo do kůry dna se sjet
    // nedá, takže hloubku přebere region NAD ní — jenže ten na ni dosáhne jen
    // svým prvním intervalem a materiál za hranicí (dno vybrání) zůstane stát
    // (reálný nález na díle uživatele: pod vrstvou Ø19,5 se ve vybrání už nic
    // nevzalo). Se zapnutým Zanořováním hranice DRŽÍ a vjezd na ni se řeší
    // RAMPOU pod úhlem zanoření (entryCapped níž) — přesně jako na hranici
    // rozsahu 📐, kterou si uživatel dosud musel nastavovat ručně.
    //
    // ZKOUŠENO A ZAMÍTNUTO (10. 8. 2026) — posunout hranici na ÚSTÍ údolí
    // (`zHiMouth`/`zLoMouth`, dnes jen v diagnostickém logu) tam, kde je nad
    // dnem uvnitř údolí vzduch, a střed dna nechat jen pro kůru. Vypadá to
    // jako správné rozdělení dvou rolí, ale měření to nepotvrdilo — detaily
    // a čísla v docs/geometry-libs-migration.md, sekce „ZBÝVÁ — hranice úseku
    // leží ve STŘEDU údolí". Krátce: symptom uživatele („bere to od
    // prostředka") je u hloubek POD dnem, kam tahle změna nesahá, a vjezd na
    // ústí se bez capu držáku stane nehlídaným → nové kolize držáku na
    // 5 fixtures. NEZKOUŠET ZNOVU BEZ ŘEŠENÍ VLASTNICTVÍ ÚDOLÍ.
    const dissolveEdge = !prms.plungeRoughing;
    if (dissolveEdge && _region.zHi !== Infinity && _region.zHiSurf !== undefined && currentX <= _region.zHiSurf + 0.01) continue;
    const regZHi = (!dissolveEdge || _region.zHiSurf === undefined || currentX > _region.zHiSurf + 0.01) ? _region.zHi : Infinity;
    const regZLo = (!dissolveEdge || _region.zLoSurf === undefined || currentX > _region.zLoSurf + 0.01) ? _region.zLo : -Infinity;
    const effZMin = Math.max(machiningRange ? Math.max(sz.zMin, machiningRange.zLo) : sz.zMin, regZLo);
    // Vjezd patří tam, kde v tomto Z-okně SKUTEČNĚ začíná polotovar
    // (passEntryZ výš) — okno regionu i rozsah 📐 můžou začínat ve vzduchu.
    // Null = na téhle hloubce v okně žádný materiál není.
    const effZMax = passEntryZ(
      Math.min(machiningRange ? Math.min(sz.zMax, machiningRange.zHi) : sz.zMax, regZHi), effZMin, sz, currentX);
    if (effZMax === null || effZMax - effZMin < 0.1) continue;
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
    const passMark = passes.length;
    let entryZ = effZMax;
    let { intervals, firstOpen } = scan(currentX, entryZ, effZMin, true);
    // ── Zanořování (📥 „Zanořování"): najdi, KDE se dá začít ──────────────
    // Na tuhle hloubku se nedá vjet zprava — vjezd zahodila obálka DRŽÁKU
    // (napravo stojí materiál, do kterého by narazil) nebo se do okna
    // nevejde rampa od povrchu nad vjezdem (odlitkový hrb NAPRAVO od
    // obráběné zóny; rampa by vyšla delší než celé Z-okno). Vjezd se proto
    // posune doleva na nejpravější místo, kde zanoření opravdu MŮŽE začít:
    // nástroj tam stojí na offsetové čáře polotovaru, rampa odtud dosáhne a
    // vedle se vejde držák (holderEntryCapZ výš). Bez toho taková hloubka
    // vypadla celá a materiál zůstal stát — obejít se to dalo jen ručním
    // posunutím Startu rozsahu Z (reálný nález na díle uživatele).
    // Geometrie DESTIČKY je v tom už zahrnutá: mezní čáry hlídání jsou
    // zapracované do obrobitelné kontury, kterou sken respektuje.
    // Vjezd na hranici REGIONU je pro držák stejně nebezpečný jako posunutý
    // start zanoření: hranice leží UPROSTŘED materiálu (napravo od ní stojí
    // sousední region), takže se tam rampa musí posunout tam, kam držák pustí
    // — jinak vjede bokem do neobrobeného odlitku (reálný nález na díle
    // uživatele: oranžová kolize držáku uprostřed vybrání).
    // POZOR, ten holder cap NENÍ jen opatrnost: pokus vyjmout z něj hranici
    // ležící na ústí údolí (10. 8. 2026, „za ústím je přece vzduch") vyrobil
    // NOVÉ kolize držáku na 5 fixtures — držák je široký a dosáhne přes údolí
    // na protilehlý hrb, i když přímo za hranicí vzduch je.
    const regionCappedRaw = regZHi !== Infinity && Math.abs(effZMax - regZHi) < 1e-6;
    if (prms.plungeRoughing) {
      const surf0 = offsetStockTopXAtZ(entryZ);
      const rampReach = surf0 !== null ? entryZ - (surf0 - currentX) / effPlungeTanL : Infinity;
      if (!firstOpen || intervals.length === 0 || rampReach <= effZMin + 0.05 || regionCappedRaw) {
        const zCap = holderEntryCapZ(currentX, entryZ, effZMin);
        // Zanoření na hranici REGIONU smí vzniknout jen tam, kde se vedle
        // vjezdu vejde DRŽÁK. Hranice leží uprostřed materiálu (napravo od ní
        // stojí sousední region), takže bez takového místa by rampa vjela
        // bokem do neobrobeného odlitku — reálný nález na díle uživatele:
        // zanoření uprostřed vybrání mezi dvěma hrby, oranžová kolize držáku
        // 87 mm². Tam se hloubka v tomhle regionu radši vynechá (jako před
        // zavedením zanořování na hranici); zanoření zůstane jen tam, kde je
        // pro držák prokazatelně místo.
        if (regionCappedRaw && !isFinite(zCap)) { holderBlockedDepths.add(depthKey(currentX)); continue; }
        if (isFinite(zCap) && zCap < entryZ - 1e-6) {
          const reScan = scan(currentX, zCap, effZMin, true);
          if (reScan.firstOpen && reScan.intervals.length > 0) {
            entryZ = zCap; intervals = reScan.intervals; firstOpen = reScan.firstOpen;
          }
        }
      }
    }
    // Vjezd stojí na UMĚLÉ hranici — rozsah 📐 nebo posunutý start zanoření —
    // takže napravo od něj materiál dál stojí a kolmý zápich by do něj sjel;
    // zanořuje se rampou (níž).
    // Hranice REGIONU je umělá stejně jako hranice rozsahu 📐: napravo od ní
    // materiál dál stojí (patří sousednímu regionu), takže se na ni nesmí
    // kolmo zapíchnout — vjezd tam patří rampě.
    const regionCapped = regionCappedRaw;
    const entryCapped = (entryZ !== effZMax)
      || (machiningRange && Math.abs(effZMax - machiningRange.zHi) < 1e-6)
      || regionCapped;
    intervals.forEach((iv, idx) => {
      // Vynech triviálně krátké průchody (nic neuříznou).
      if (iv.zStart - iv.zEnd < dzScan) return;
      if (idx === 0 && firstOpen) {
        // Otevřený vjezd zprava přes hranu polotovaru.
        const passObj = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
        // ── Vjezd na hranici rozsahu Z rampou (Fáze 4) ──────
        // Když rozsah obrábění začíná UVNITŘ polotovaru (napravo od
        // hranice ještě stojí materiál), kolmý zápich na hloubku
        // nahrazuje rampa pod úhlem zanoření na OFFSETOVOU čáru
        // (offsetStockTopXAtZ — vůlí-posunutá silueta, stejná jako
        // planTopXAtZ v gcodeEmit.js). Kotva rampy se ŘETĚZÍ mezi
        // hloubkami (entryRampAnchor) — první hloubka najede z povrchu,
        // každá další jen odskočí a napojí se na konec rampy PŘEDCHOZÍ
        // hloubky (pocketReposition, stejný vzor jako dojezd strmé stěny
        // výš) — ne restart od povrchu pokaždé znovu (reálný nález na
        // díle uživatele: to zbytečně přejíždělo/dobíralo už hotovou
        // horní část rampy a po pár hloubkách se úplně vzdalo, zbytek
        // Z-rozsahu zůstal bez jakéhokoli dojezdu).
        if (entryCapped
            && iv.zStart >= entryZ - 1e-6) {
          // Kotva rampy = povrch nad vjezdem. Ještě NEPOUŽITÁ kotva (first)
          // z jiného Z se přepíše: vjezd se mezitím mohl posunout doleva na
          // místo, kde zanořování opravdu začíná (entryZ výš).
          if (!entryRampAnchor
              || (entryRampAnchor.first && Math.abs(entryRampAnchor.z - entryZ) > 1e-6)) {
            // Kotvu posuň ZA hranici úseku, kam až pustí držák — jinak rampa
            // vjede doprostřed údolí a jeho druhá půlka zůstane stát
            // (holderEntryReachZ výš; strop = vzdálenější ústí údolí).
            const anchorZ = (_region.zHiValleyTop !== undefined && Math.abs(entryZ - _region.zHi) < 1e-6)
              ? holderEntryReachZ(currentX, entryZ, _region.zHiValleyTop, iv.zEnd)
              : entryZ;
            const surfX = offsetStockTopXAtZ(anchorZ);
            if (surfX !== null && surfX > currentX + 0.05) {
              entryRampAnchor = { x: surfX, z: anchorZ, first: true };
              // Jiné Z = jiný řetěz zanořování: uzavření toho předchozího
              // (dokončený zbytek pod Hloubku ap) se na nový nevztahuje.
              entryRampClosed = false;
            }
          }
          let rampOk = false;
          if (entryRampAnchor && entryRampAnchor.x > currentX + 0.05) {
            const zS = entryRampAnchor.z - (entryRampAnchor.x - currentX) / effPlungeTanL;
            if (zS > iv.zEnd + 0.05) {
              passObj.ramp = { x0: entryRampAnchor.x, z0: entryRampAnchor.z };
              passObj.entryRangeRamp = true;
              if (!entryRampAnchor.first && chainTipIs(entryRampAnchor)) {
                passObj.pocketReposition = true;
                passObj.rampFeedFrom = { x: entryRampAnchor.x, z: entryRampAnchor.z };
              }
              passObj.zStart = zS;
              entryRampAnchor = { x: currentX, z: zS, first: false };
              rampOk = true;
            }
          }
          if (!rampOk) {
            // Rampa (ani zřetězená, ani nová) se sem nevejde nebo se
            // nenašla — NEPOKRAČOVAT běžným vjezdem: ten by hledal
            // skutečnou hranu polotovaru napříč celou siluetou odlitku
            // (Standardní podélné hrubování v gcodeEmit.js), a ta u
            // odlitku s bosem/hrbolem sahá výš než Start rozsahu Z — vjezd
            // by tak řezal materiál NAD (mimo) aktivní rozsah, kudy
            // nástroj/držák nepočítá s kolizí (reálný nález na díle
            // uživatele: oranžová kolize držáku v polotovaru). Tahle
            // hloubka se raději úplně vynechá — dál se zanořuje jen po
            // vrstvách, kam rampa doopravdy dosáhne. Zbytek pod Hloubku
            // (ap) dokončí zákrok po skončení celého scanu níž (viz
            // entryRampClosed).
            return;
          }
        }
        // Otevřený řez VŽDY dojíždí svůj vlastní schod po obrysu (níž), i
        // když za bossem případně navazuje kapsa, kterou zvlášť dokope blok
        // „dobrat najednou" — otevřený řez se na to nespoléhá (nedetekuje,
        // co je za bossem, ani se tam nesnaží dojet předem) a nic tam
        // nepředstírá. Riziko doslovného duplicitního úseku G-kódu (kdyby
        // otevřený řez i navazující kapsa sešly stejnou rampou stejného
        // rohu) hlídá cornerAlreadyRampedOut (níž) — ten teď navíc ověřuje
        // dosaženou hloubku (reachedX), takže potlačí kapsu jen když ji
        // ramp opravdu vyřešil celou.
        if (prms.noStepRoughing && iv.blocked) {
          // Bez schodků: místo odskoku se dál sleduje kontura (G1/G2/G3),
          // aby se obrobil schod vůči sousedním zaberum a nezůstal materiál.
          // iv.holderClamped (konec zkrácen obálkou držáku, ne skutečnou
          // stěnou) NEBLOKUJE celý dojezd — holderTrimLeadOut níž trasu
          // stejně ořízne na to, kam držák smí, takže dřívější plošné
          // potlačení jen zbytečně mazalo i bezpečnou část dojezdu.
          const nextX = (depthIdx + 1 < depths.length) ? depths[depthIdx + 1] : -Infinity;
          const prevX = depthIdx > 0 ? depths[depthIdx - 1] : null;
          // Dojezd je vždy KRÁTKÝ a LOKÁLNÍ: sleduje obrys jen do sousední
          // hloubky (nextX, dolů) nebo zpátky na vršek schodu (prevX,
          // nahoru) — nikdy nezajíždí hloub jen proto, že za stěnou čeká
          // kapsa (o tu se stará samostatně blok „dobrat najednou" níž).
          let zEndOut = findLeadOutEndZ(iv.zEnd, prevX, nextX, traceFloorL);
          // Nezávislé na pořadí zpracování kapes (na rozdíl od zEndOut níž) —
          // jen z prevX/nextX/obrysu, stejné ve scan i booleovské cestě.
          // Používá se pro spouštěcí podmínku a mez hledání rohu rampy, ať
          // stejná strmá stěna nespustí rampu v jednom režimu a v druhém ne
          // (rozjelo by materiál-paritu mezi režimy — ověřeno testem).
          const zEndOutRaw = zEndOut;
          // Dobrat kapsu najednou: neořezávat schod DO už vykopané kapsy —
          // zastav sledování na vršku potlačené zóny.
          for (const r of pocketDoneRanges) {
            if (r.zHi <= iv.zEnd + 1e-6 && r.zHi > zEndOut) zEndOut = r.zHi;
          }
          // Strmá skoro svislá stěna (bos): sledování PŘESNÉHO obrysu k
          // zEndOut by muselo kopírovat celou výšku stěny, než by X kleslo
          // na nextX (reálný nález na díle uživatele: schod jen pár mm v X,
          // ale zEndOut vyjde desítky mm hluboko). To se stává jen PRVNÍMU
          // (nejmělčímu) průchodu, který na stěnu narazí — jeho prevX leží
          // NAD stěnou (žádný mělčí soused ji ještě neuřízl), takže sken
          // nezastaví „vršek schodu" a musí čekat na pád k nextX. Hlubší
          // sousední průchody mají prevX už u/ve stěně → zEndOut vyjde
          // krátce, beze změny (viz podmínka níže). V tom vzácném případě
          // se místo dojezdu po obrysu jede od rohu (findSteepCorner) rampou
          // pod úhlem zanoření — stejný vzor jako kapsa za bossem — až tam,
          // kde ramp opustí vůlí-posunutou siluetu odlitku (findRampOutTarget
          // — offsetová čára, stejná jako v náhledu/simulátoru).
          const rampSpan = 2 * step + 10;
          const corner = (iv.zEnd - zEndOutRaw > rampSpan) ? findSteepCorner(iv.zEnd, zEndOutRaw) : null;
          const rampTargetRaw = corner ? findRampOutTarget(corner.x, corner.z) : null;
          // Rampa nesmí sjet POD aktuální hloubku průchodu (currentX) — víc
          // materiálu, než odpovídá nastavené Hloubce (ap), by se odebralo
          // po úhlu zanoření v jednom záběru (reálný nález na díle
          // uživatele). Ořízni cíl na TÉŽE přímce zanoření přesně na
          // X=currentX a odtud pokračuj ROVNĚ (jako běžný řez vrstvy) až
          // tam, kam původně mířila celá rampa (rampTargetRaw.z) — dojezd
          // tak pokryje STEJNÝ Z-rozsah (žádný schod), jen ho pod currentX
          // dohoní až následující (hlubší) průchod svým vlastním dojezdem.
          const rampTarget = (rampTargetRaw && rampTargetRaw.x < currentX)
            ? { x: currentX, z: corner.z - (corner.x - currentX) / effPlungeTanL }
            : rampTargetRaw;
          // Rovné pokračování na hloubce currentX vede až tam, kde vrstvu
          // zastaví STĚNA KONTURY (nebo dno okna) — ne jen k Z, kam mířila
          // rampa. Rampa je jen VJEZD do vrstvy; po dosednutí má dojezd dobrat
          // schodek přes celé údolí na druhou stranu a teprve pak odjet
          // (reálný nález na díle uživatele: dojezd končil hned po dosednutí
          // rampy a materiál za údolím zůstal stát).
          const straightContinueZ = (rampTarget && rampTarget !== rampTargetRaw)
            ? straightRunEndZ(currentX, rampTarget.z, effZMin)
            : null;
          if (rampTarget) rampedOutCorners.push({ x: corner.x, z: corner.z, reachedX: rampTarget.x });
          // Ořízlá rampa nechala pod currentX klín materiálu, který žádná
          // hlubší vrstva sama nenajde (leží mimo její vlastní Z-interval) —
          // dokončí se až po skončení hloubkové smyčky tohoto regionu.
          if (straightContinueZ !== null) {
            pendingRampCompletions.push({ resumeX: rampTarget.x, resumeZ: rampTarget.z, targetX: rampTargetRaw.x, targetZ: rampTargetRaw.z });
          }
          // Konec rovného pokračování je STEJNÁ situace jako konec běžného
          // zablokovaného průchodu: vrstva dosedla na stěnu kontury a schod
          // vůči MĚLČÍMU sousedovi se dobírá sledováním obrysu. Bez tohohle
          // dojezdu končila vrstva v údolí nasucho a mezi ní a hotovní konturou
          // zůstal stát klín (reálný nález na díle uživatele — dvě vrstvy
          // v údolí „nedojeté").
          const tailTrace = (straightContinueZ !== null && straightContinueZ > effZMin + 1e-6)
            ? traceIfContinuous(
                traceOffsetPath(straightContinueZ,
                  findLeadOutEndZ(straightContinueZ, prevX, nextX, traceFloorL)),
                rampTarget.x, straightContinueZ)
            : [];
          const leadOut = rampTarget
            ? holderTrimLeadOut(traceOffsetPath(iv.zEnd, corner.z)
                .filter(s => s.type !== 'line' || Math.abs(s.z1 - s.z2) > 1e-6)
                .concat([{ type: 'line', x1: corner.x, z1: corner.z, x2: rampTarget.x, z2: rampTarget.z }])
                .concat(straightContinueZ !== null && rampTarget.z - straightContinueZ > 1e-6
                  ? [{ type: 'line', x1: rampTarget.x, z1: rampTarget.z, x2: rampTarget.x, z2: straightContinueZ }]
                  : [])
                .concat(tailTrace), true)
            : holderTrimLeadOut(traceOffsetPath(iv.zEnd, zEndOut), true);
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
          // „i u čelního" (viz isFaceLeadOut výš): bez zaškrtnutí se dojezd
          // po čelní/radiální stěně vynechá — průchod skončí u stěny a
          // odskočí, schod dobere čelní operace.
          if (!prms.noStepRoughingFace && isFaceLeadOut(leadOut)) leadOut.length = 0;
          if (leadOut.length > 0) passObj.contourLeadOut = leadOut;
        }
        passes.push(passObj);
        // Schodová evidence (Fáze 3a): JEN ZKRÁCENÉ konce. Nezkrácený
        // průchod končí na stěně offsetu — ta už je v siluetě zakázané
        // oblasti a evidovat ji znovu by přes bbox držáku falešně škrtala
        // vzdálené intervaly (např. pásy u čela). Zkrácený konec ale nechal
        // stát materiál NAD siluetou — hlubší průchody podle něj drží
        // levou hranu držáku před schodem.
        if (holderClampZEnd && holderClampZEnd.noteMainEnd && iv.holderClamped) {
          holderClampZEnd.noteMainEnd(currentX, currentX + step, iv.zEnd);
        }
        return;
      }
      // Kapsa za bossem kontury — sledování kontury (G1/G2/G3) a rampa pod
      // úhlem zanoření. Kapsa se bez rampy vjet nedá (kolmý zápich do plného
      // materiálu), takže celá tahle větev patří pod „Zanořování".
      //
      // Sem chodí i PRVNÍ interval, když je blokovaný (idx===0, !firstOpen):
      // typicky hrubování ZLEVA za přírubou u čela — vjezd zprava neexistuje,
      // materiál v údolí za ní ale ano (reálný nález na díle uživatele:
      // příruba Ø170 na Z 0–38 zahodila všechny hloubky pod ní).
      if (!prms.plungeRoughing) return;
      // Když je úplně první interval blokovaný (idx===0, !firstOpen),
      // neexistuje předchozí interval → horní hranice mezery = okraj
      // polotovaru (sz.zMax). Bez fallbacku by intervals[-1] spadlo.
      const zGapHi = idx > 0 ? intervals[idx - 1].zEnd : entryZ;
      // Dobrat kapsu najednou: tuhle kapsu už vykopal dřívější blok →
      // hlavní smyčka ji na hlubších hloubkách znovu nezpracovává.
      if (iv.blocked && prms.pocketFinishAtOnce) {
        const midZ = (iv.zStart + iv.zEnd) / 2;
        if (pocketDoneRanges.some(r => midZ <= r.zHi + 0.1 && midZ >= r.zLo - 0.1)) return;
      }
      // Víc oddělených kapes za sebou na TÉŽE hloubce (idx>1): dobrání
      // najednou pro tu DRUHOU (a další) je order-dependent kolize držáku —
      // boss NAD ní ještě není doobrobený (na to dojde až hlavní smyčka
      // hloubek, pokračující po tomhle bloku), takže se tam držák při
      // zanoření do hloubky opře o materiál, který teprve zmizí. Ověřeno
      // validátorem kolizí na reálném díle (holder-kolize přesně v místě
      // dojezdu druhé kapsy). První (idx===1) kapsa dobrání najednou
      // bezpečně snese (leží hned za právě dokončeným bossem). Zbytek
      // (další kapsy) zůstává pro pozdější restrukturalizaci pořadí
      // (dokončit celý boss/čelo, teprve pak kapsy) — POTLAČIT jen EMISI
      // (passes.push níž), ne celý blok: pocketDoneRanges se MUSÍ
      // zaregistrovat i tak (níž, beze změny), jinak by tuhle „nedobranou"
      // kapsu hlavní smyčka na KAŽDÉ další (mělčí) hloubce zkoušela znovu
      // — a kolidovala by tam taky (ověřeno: bez téhle poznámky se kolize
      // jen přesunula o pár hloubek dál, misto aby zmizela).
      let skipRiskyPocketEmit = iv.blocked && prms.pocketFinishAtOnce && idx > 1;
      // Obálka držáku pro kapsový span (viz holderSpanClamp výš). Bez tohohle
      // ořezu dělá zapnutá kapsová větev na range-chain fixtures 11 kolizí
      // držáku / 500–670 mm² tam, kde bylo čisto.
      if (iv.blocked) {
        const clamped = holderSpanClamp(currentX, iv);
        if (!clamped) {
          holderBlockedDepths.add(depthKey(currentX));
          holderDroppedZones.push({ zHi: iv.zStart, zLo: iv.zEnd, x: currentX });
          return;
        }
        iv = clamped;
      }
      if (!iv.blocked) {
        // Poslední interval bez protistěny (konec polotovaru) — žádná
        // kapsa s druhou stěnou, takže žádná rampa. Jen se sleduje
        // kontura z konce předchozího průchodu na currentX.
        // Obálka držáku (Fáze 3a): tenhle interval je OTEVŘENÝ pokračující
        // řez (jednostranně, bez protistěny) — stejná situace jako hlavní
        // vjezd (idx===0), ale scanIntervals ho neořezává (komentář výše
        // „KAPSY obálka NEOŘEZÁVÁ" platí pro SPAN mezi dvěma stěnami u
        // kapes, ne pro jednostranně otevřené pokračování). Bez ořezu tu
        // rovný záběr může projet držákem mimo dosah tipu, typicky dlouhý
        // přejezd v ose Z hlouběji v odlitku (reálný nález: kolize držáku
        // u „kapsa po kontuře" mezi regiony, dosud nekryté).
        let zEndEff = iv.zEnd;
        if (holderClampZEnd) {
          const nz = holderClampZEnd(currentX, iv.zStart, iv.zEnd, {});
          // Celý interval zakázaný. POČÍTAT: tohle byl hlavní zdroj TICHÉHO
          // zahazování — na `part-13-zleva-flange` tudy zmizelo 17 průchodů
          // celé pravé strany (držák 20 mm radiálně by musel přes přírubu
          // Ø199,7) a v ⚠ panelu nebylo ani slovo, takže to vypadalo jako
          // chyba geometrie.
          // POZOR: „posunout vjezd dál do úseku, kde už držák místo má" se
          // 10. 8. 2026 zkoušelo TŘEMI způsoby; nejlépe vypadající varianta
          // (nechat interval propadnout do KAPSOVÉ větve) dělá na dílu
          // uživatele 0 → 10 kolizí držáku / 1034 mm² — měřeno
          // `validateToolpath` se SPRÁVNÝM příznakem `backside`. Kapsová větev
          // totiž předpokládá kapsu mezi DVĚMA stěnami. NEZKOUŠET znovu bez
          // toho, že (a) vjezd i celá jeho rampa se prověří tou samou
          // Minkowského obálkou, kterou počítá validátor, a (b) kapsová větev
          // umí jednostranně otevřený interval.
          if (nz === null) {
            holderBlockedDepths.add(depthKey(currentX));
            holderDroppedZones.push({ zHi: iv.zStart, zLo: iv.zEnd, x: currentX });
            return;
          }
          if (nz > iv.zEnd + 1e-9) zEndEff = nz;
        }
        if (iv.zStart - zEndEff < dzScan) {
          // obálka ho zkrátila až pod řezný krok
          if (zEndEff > iv.zEnd + 1e-9) holderBlockedDepths.add(depthKey(currentX));
          holderDroppedZones.push({ zHi: iv.zStart, zLo: iv.zEnd, x: currentX });
          return;
        }
        const holderClampedOpen = zEndEff > iv.zEnd + 1e-9;
        const passOpen = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: zEndEff, blocked: iv.blocked };
        if (holderClampedOpen) passOpen.holderClamped = true;
        const erOpen = stockEntryRamp(currentX, iv.zStart);
        if (erOpen) {
          // Vstup leží v kůře odlitku → rampa od tečkované hranice
          // (sledování kontury by vedlo kůrou — vynechá se).
          passOpen.ramp = erOpen;
        } else if (!partingNoDress) {
          const liOpen = holderTrimLeadIn(traceOffsetPath(zGapHi, iv.zStart));
          linkToPrev(liOpen);   // bez zbytečného odskoku+návratu (všechny tvary)
          passOpen.contourLeadIn = liOpen;
        }
        passes.push(passOpen);
        if (holderClampZEnd && holderClampZEnd.noteMainEnd && holderClampedOpen) {
          holderClampZEnd.noteMainEnd(currentX, currentX + step, zEndEff);
        }
        return;
      }
      // Upichovák: svislý zápich — roh = pravý okraj kapsy − (w−2r), druhý
      // rádius plátku lícuje pravou stěnu. Užší kapsa než plátek se přeskočí.
      let corner;
      if (isParting) {
        const cz = iv.zStart - w2RL;
        if (cz <= iv.zEnd + 0.05) { partingNarrowPockets++; return; }
        corner = { x: Math.min(maxStockX, currentX + step), z: cz };
      } else {
        corner = findPlungeCorner(zGapHi, iv.zStart);
      }
      // Tenhle roh (strmá stěna) už jednou sešel rampou dolů dojezd „bez
      // schodků" otevřeného vjezdu na MĚLČÍ hloubce (viz rampedOutCorners
      // výš) — kapsa za bossem by ho sledováním kontury (leadIn) i rampou
      // jen zopakovala, doslovně stejný úsek G-kódu podruhé (reálný nález
      // na díle uživatele). Emisi potlačit stejně jako u druhé+ kapsy
      // (skipRiskyPocketEmit) — pocketDoneRanges se zaregistruje dál beze
      // změny, aby to hlubší hloubky nezkoušely znovu.
      if (!isParting && corner && cornerAlreadyRampedOut(corner.x, corner.z, currentX)) skipRiskyPocketEmit = true;
      if (!corner) {
        // Sklon kontury nikdy nedosáhne úhlu zanoření — celá mezera se
        // projede po kontuře na currentX, žádná rampa.
        const passFlat = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
        const erFlat = stockEntryRamp(currentX, iv.zStart);
        if (erFlat) {
          // Vstup leží v kůře odlitku → rampa od tečkované hranice.
          passFlat.ramp = erFlat;
        } else if (!partingNoDress) {
          const liFlat = holderTrimLeadIn(traceOffsetPath(zGapHi, iv.zStart));
          linkToPrev(liFlat);   // bez zbytečného odskoku+návratu (všechny tvary)
          passFlat.contourLeadIn = liFlat;
        }
        passes.push(passFlat);
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
        const leadIn = withLeadIn ? holderTrimLeadIn(traceOffsetPath(gapHi, cornerLocal.z)) : [];
        const dzRampFull = (cornerLocal.x - X) / effPlungeTanL;
        const availWidth = cornerLocal.z - ivLocal.zEnd;
        const dzRamp = Math.min(dzRampFull, availWidth);
        const xReached = cornerLocal.x - dzRamp * effPlungeTanL;
        if (xReached > X + 0.001) plungeShallowed++;
        // Rampa nesmí přejet hranici kapsy na dosažené hloubce: u KONKÁVNÍ
        // stěny (údolí), která se pod rohem pokládá pod úhel zanoření, by
        // sdílená přímka rampy podjela offset a dno by řezalo skrz stěnu.
        //
        // KOLIK se přímka pod plným úhlem zanoření smí dostat pod offsetovou
        // (hrubovací) čáru: offset = hotovní kontura + PŘÍDAVEK, takže mělké
        // zajetí do přídavku dílu NEUBLÍŽÍ — zůstane tam jen o něco tenčí
        // slupka pro dokončování. Práh je proto POLOVINA přídavku (na hotovní
        // konturu se tím nedá dojet), ne pevných 0,05 mm.
        // PROČ: leží-li stěna údolí sama TĚSNĚ pod úhlem zanoření (na dílu
        // uživatele 14,6° proti nastaveným 15°), zajede přímka pod offset
        // o ~0,12 mm — s pevnou tolerancí se rampa zploštila na začátek vrstvy
        // a jela 13,6° místo 15°. S nulovým přídavkem vyjde práh 0,05 → jako
        // dřív.
        const rampDipTol = Math.max(0.05, 0.5 * Math.min(
          parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0));
        // Max zajetí tětivy (roh → dosažená hloubka) pod offset.
        const rampDip = (zCand) => {
          let worst = 0;
          for (let t = 0.1; t < 0.999; t += 0.09) {
            const z = cornerLocal.z + (zCand - cornerLocal.z) * t;
            const xl = cornerLocal.x + (xReached - cornerLocal.x) * t;
            const off = offsetXAt(z);
            if (off !== null && off - xl > worst) worst = off - xl;
          }
          return worst;
        };
        let zS = cornerLocal.z - dzRamp;
        // Zploštit (protáhnout na začátek vrstvy) JEN když plný úhel opravdu
        // zajede do přídavku hlouběji, než je bezpečné.
        if (zS > ivLocal.zStart + 1e-6 && rampDip(zS) > rampDipTol) zS = ivLocal.zStart;
        // Tětiva rampy (roh → začátek dna) proti offsetu: když i tak někde
        // podjede (konvexní vyboulení stěny), rampa se nahradí sledováním
        // kontury po stěně dolů — přesné, bez zajetí.
        const rampPierces = rampDip(zS) > rampDipTol;
        const pocketPass = {
          type: 'long', x: xReached,
          zStart: zS, zEnd: ivLocal.zEnd, blocked: ivLocal.blocked,
        };
        let leadInFinal = leadIn;
        if (rampPierces) {
          const wallTrace = traceOffsetPath(cornerLocal.z, zS);
          leadInFinal = holderTrimLeadIn(leadIn.concat(wallTrace));
          if (leadInFinal.length === 0) {
            // Sledování stěny padlo celé za ořez (držák/kůra) → vstup by
            // zůstal holý kolmý sjezd. Vstup v kůře odlitku dostane rampu
            // od tečkované hranice polotovaru (táž přímka zanoření).
            const erP = stockEntryRamp(X, zS);
            if (erP) pocketPass.ramp = erP;
          }
        } else {
          // Vjezd rampou od hranice polotovaru (odlitek): roh kotví na
          // kontuře POD kůrou — kotva se zvedne po TÉŽE rampové přímce nad
          // polotovar + vůli X, takže posuv začíná na tečkované hranici a
          // kůra se řeže pod úhlem zanoření (ne kolmým vjezdem).
          // stockEntryRamp zvedání zastaví i na HOTOVNÍ KONTUŘE: u kapsy za
          // bossem vede přímka zanoření od rohu k povrchu skrz ten boss
          // (reálný nález: zajezd 15,3 mm pod konturu). Nejde-li to, kotva
          // zůstane v rohu a hloubku dobere až řetěz vrstev.
          const anchorUp = stockEntryRamp(cornerLocal.x, cornerLocal.z);
          pocketPass.ramp = anchorUp || { x0: cornerLocal.x, z0: cornerLocal.z };
        }
        // Jeden průchod nesmí sebrat víc než Hloubka (ap). Kotva zvednutá až
        // na kůru polotovaru leží u kapsy za bossem klidně 2× ap nad dosaženou
        // hloubkou (roh kotví hluboko pod povrchem) — rampa by pak jedním
        // záběrem projela celý ten rozdíl (naměřeno 9,8 mm při ap 5 na
        // range-chain-insert-shadow). Kotva se proto po TÉŽE rampové přímce
        // spustí zpátky na ap nad dno průchodu; materiál nad ní vzala mělčí
        // vrstva (hloubková smyčka jde odshora dolů) nebo ho vezme další krok
        // řetězu. Hlídá tests/cam-leadout-step.test.js.
        if (pocketPass.ramp && pocketPass.ramp.x0 > pocketPass.x + step + 1e-6) {
          const dx = pocketPass.ramp.x0 - (pocketPass.x + step);
          pocketPass.ramp = { x0: pocketPass.x + step, z0: pocketPass.ramp.z0 - dx / effPlungeTanL };
        }
        if (leadInFinal.length > 0) pocketPass.contourLeadIn = leadInFinal;
        if (withLeadOut && prms.noStepRoughing && !ivLocal.holderClamped) {
          // Bez schodků: po dně kapsy se dál sleduje kontura (G1/G2/G3)
          // až na hloubku dalšího průchodu (nebo až na konec kontury)
          // místo okamžitého odskoku — druhá stěna kapsy se obrobí přímo.
          // (holderClamped: konec zkrácen obálkou držáku — pokračovat po
          // stěně by znamenalo vjet držákem do materiálu.)
          const zExitOut = findPocketExitZ(ivLocal.zEnd, X, traceFloorL);
          const leadOut = holderTrimLeadOut(traceOffsetPath(ivLocal.zEnd, zExitOut), true);
          if (leadOut.length > 0) pocketPass.contourLeadOut = leadOut;
        }
        return { pocketPass, leadIn };
      };
      if (!prms.pocketFinishAtOnce) {
        const { pocketPass, leadIn } = buildPocketPass(currentX, zGapHi, iv, corner, !partingNoDress, true);
        // Nulový progres proti dřívější vrstvě u TÉHOŽ rohu → duplicitní
        // zákrok po stejné rampě, nic neodebere — vynech.
        const pbKey = `${corner.x.toFixed(1)},${corner.z.toFixed(1)}`;
        const pbBest = pocketBestX.get(pbKey);
        if (pbBest !== undefined && pocketPass.x >= pbBest - 0.05) return;
        pocketBestX.set(pbKey, pocketPass.x);
        linkToPrev(leadIn);   // navázání nezávisí na „bez schodků"
        passes.push(pocketPass);
        if (pocketPass.ramp) notePlungeRun(corner.x, corner.z, pocketPass.ramp.x0, pocketPass.x);
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
        // withLeadOut: dřív `false` — dojezd měla obstarat až fáze 2. Jenže ta
        // jede JEDINOU trasou po nejhlubší stěně, takže konce jednotlivých
        // kroků (druhá stěna kapsy, každý o ap jinde) zůstávaly nedojeté a
        // mezi nimi stály schodky (reálný nález na díle uživatele: `N420
        // G1 Z262.425` a další konce bez dojezdu). Se zapnutým „Hrub. bez
        // schodků" proto každý krok dojede svůj schod po kontuře sám —
        // stejně jako to dělá otevřený průchod.
        const { pocketPass, leadIn } = buildPocketPass(localX, curGapHi, curIv, curCorner, firstPlunge && !partingNoDress, true);
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
        if (firstPlunge) { pocketPass.pocketEntry = true; linkToPrev(leadIn); }
        else {
          pocketPass.pocketReposition = true;
          // rampFeedFrom = vršek zápichu předchozího zákroku (konec jeho
          // rampy) na sdílené přímce rampy — sem se zvedne rychloposuvem.
          // Upichovák: přesun jde v úrovni PŘEDCHOZÍHO dna (vzduch vykopaný
          // minulým zákrokem) na NOVÉ zápichové Z a odtud svisle dolů — šikmý
          // přejezd po sdílené rampě by tělem hoblovat pravou stěnu.
          if (prevRampEnd && pocketPass.ramp && prevRampEnd.x > pocketPass.x + 0.01) {
            pocketPass.rampFeedFrom = isParting
              ? { x: prevRampEnd.x, z: pocketPass.zStart }
              : prevRampEnd;
          }
        }
        if (!skipRiskyPocketEmit) {
          passes.push(pocketPass);
          // Tenhle zákrok sjel po přímce zanoření od své KOTVY (ne od rohu —
          // kotva bývá o Hloubku ap níž) na pocketPass.x; dokončení ořízlé
          // rampy po témž ÚSEKU už tudy nemusí jezdit znovu (plungeLineRuns).
          if (pocketPass.ramp) notePlungeRun(curCorner.x, curCorner.z, pocketPass.ramp.x0, pocketPass.x);
        }
        prevRampEnd = { x: pocketPass.x, z: pocketPass.zStart };
        bestX = pocketPass.x;
        firstPlunge = false;

        if (pocketPass.x <= pocketBottomX + 0.1) break;   // dno (skoro) dosaženo

        localX = Math.max(pocketBottomX, localX - step);
        // Najdi tutéž kapsu na nové hloubce (roh se s hloubkou mírně posouvá).
        const rescan = scan(localX, entryZ, effZMin);
        let found = null;
        // Kapsa může být i PRVNÍ interval (`firstOpen === false`) — to je právě
        // hrubování zleva za přírubou u čela, kde vjezd zprava neexistuje.
        // Sken od j=1 takovou kapsu na nové hloubce NENAŠEL, burst hned skončil
        // a zbytek kapsy zůstal na jediném dokončovacím průchodu, který ji
        // projel diagonálou přes celé údolí (reálný nález na díle uživatele:
        // jeden `G1 X50.9 Z171.5` ze Ø171 dolů = 985 mm² kolize držáku).
        // S otevřeným vjezdem je interval 0 ten otevřený řez, ne kapsa → j=1.
        for (let j = rescan.firstOpen ? 1 : 0; j < rescan.intervals.length; j++) {
          // Obálka držáku i tady (viz holderSpanClamp): burst si intervaly na
          // každé hloubce skenuje znovu, takže by jinak sjel ap po ap do kapsy,
          // do které se držák mezi stěny už nevejde.
          const cIv = holderSpanClamp(localX, rescan.intervals[j]);
          if (!cIv || !cIv.blocked) continue;
          const cGapHi = j > 0 ? rescan.intervals[j - 1].zEnd : entryZ;
          // Upichovák: roh = pravý okraj − (w−2r); s hloubkou se posouvá po
          // pravé stěně, tolerance shody proto v Z povolí až step + 2 (šikmá
          // stěna posune okraj o step/tg(sklonu) na vrstvu), X se nesrovnává.
          //
          // Roh hledáme jen do curCorner.z + CORNER_TOL (ne od celého cGapHi):
          // je-li stěna kapsy přesně pod úhlem zanoření (typicky navazovací
          // čára z hlídání destičky), sken od vysokého cGapHi by chytil PRVNÍ
          // strmou stěnu nad kapsou (jiný útvar) a roh by „uskočil" o desítky
          // mm → shoda selže a burst skončí předčasně (zbytek klínu pak dobere
          // jeden hluboký nájezd). Omezení na okolí známého rohu drží sken na
          // TÉŽE stěně, takže rampované zákroky dojdou ap po ap až na dno.
          const cCorner = isParting
            ? (cIv.zStart - w2RL > cIv.zEnd + 0.05 ? { x: localX + step, z: cIv.zStart - w2RL } : null)
            : findPlungeCorner(Math.min(cGapHi, curCorner.z + CORNER_TOL), cIv.zStart);
          const zTol = isParting ? step + 2 : CORNER_TOL;
          if (cCorner && (isParting || Math.abs(cCorner.x - curCorner.x) < CORNER_TOL) && Math.abs(cCorner.z - curCorner.z) < zTol) {
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
      const exitZ = findPocketExitZ(pocketBottomZ, currentX, traceFloorL);
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
      // Bez „Hrub. bez schodků": žádné dokončení kapsy — zůstávají schodky
      // (dojíždění tvaru patří jen k „bez schodků"; platí pro všechny tvary).
      let cleanStartZ = corner.z;
      let cleanApproach = null;
      // Vede přisunutí UVNITŘ kapsy (odskok 45° → přejezd v Z → sjezd) celou
      // dobu vzduchem? Přejezd jde v úrovni ODSKOKU nad koncem posledního
      // průchodu, takže kdekoli mezi ním a bodem přisunutí smí offset sahat
      // nejvýš tam. V údolí s vyšší protistěnou (u dílu uživatele kontura Ø27
      // na Z 55–68 proti přejezdu na Ø26,5) by rychloposuv projel HOTOVNÍ
      // KONTUROU — v takovém případě se přisunutí nepoužije a dokončení kapsy
      // najede klasicky výjezdem nad konturu.
      const approachTraverseFree = (zTo) => {
        const lastP = passes[passes.length - 1];
        if (!lastP || lastP.zEnd === undefined) return false;
        let endX = lastP.x, endZ = lastP.zEnd;
        const lo = lastP.contourLeadOut;
        if (lo && lo.length) { endX = lo[lo.length - 1].x2; endZ = lo[lo.length - 1].z2; }
        const travX = endX + (parseFloat(prms.retractDistance) || 0);
        const zA = Math.min(endZ, zTo), zB = Math.max(endZ, zTo);
        for (let z = zA; z <= zB + 1e-9; z += dzScan) {
          const o = offsetXAt(z);
          if (o !== null && o > travX - 0.05) return false;
        }
        return true;
      };
      if (prms.noStepRoughing && prevRampEnd && prevRampEnd.z < corner.z - 0.05 && prevRampEnd.z >= pocketBottomZ - 0.05) {
        // POZOR (změřeno 8. 8. 2026): zkoušelo se tuhle pevnou toleranci
        // nahradit kritériem „projely rampy celou stěnu?" (offset nikde
        // neklesne pod přímku rampového řetězu), aby dokončovací průchod
        // nezačínal od rohu a neopakoval už projetou stěnu. Na díle uživatele
        // to sice ubralo 0,6 mm² kolize a jeden dlouhý pohyb, ale NECHALO
        // STÁT 64 mm² materiálu navíc — ten dlouhý `G1` po stěně tedy NENÍ
        // duplicita, je to dokončovací řez, který bere ~0,5 mm, co po sobě
        // nechaly rampy krokované po ap. Vráceno; nesnažit se to „optimalizovat"
        // bez měření odebraného materiálu.
        const wallXThere = offsetXAt(prevRampEnd.z);
        const startCand = Math.max(prevRampEnd.z, pocketBottomZ);
        if (wallXThere !== null && Math.abs(wallXThere - prevRampEnd.x) < 0.2
            && approachTraverseFree(startCand)) {
          // Rampy dojely na stěnu — dokončení začne až u posledního zákroku
          // (nebo rovnou na dně, když ho poslední rampa dosáhla) a navazuje
          // odskokem, ne výjezdem nad boss.
          cleanStartZ = startCand;
          cleanApproach = { x: prevRampEnd.x, z: cleanStartZ };
        }
      }
      // POZOR NA POJMENOVÁNÍ (uživatel 8. 8.: „nemám danou dokončovací
      // operaci, tohle by dělat nemělo"): `pocketClean` NENÍ dokončování.
      // Visí na „Hrub. bez schodků" (`noStepRoughing` níž), ne na
      // `doFinishing`, a to správně — změřeno, že jeho vypnutí nechá stát
      // 64 mm², protože dobírá ~0,5 mm hřebínky, které po sobě nechaly rampy
      // krokované po ap. Je to tedy HRUBOVACÍ dobrání schodku. Matoucí byl
      // jen popisek v G-kódu („dokončení kapsy“) — přejmenován na „kapsa bez
      // schodků“, ať je z výstupu poznat, ke kterému přepínači patří.
      //
      // Fáze 3b: dočišťovací trasy ořezat na OKNO kapsového intervalu —
      // scanIntervals ho už zúžil komponentovým spanem obálky держáku
      // (curIv.zStart/zEnd = kam se держák mezi stěny vejde). Úseky mimo
      // okno (konce dna u stěn, kam держák nesmí) se vypustí; úzká kapsa
      // bez okna nemá interval vůbec (burst sem ani nevejde).
      const clipToHolderWindow = (segs) => {
        if (!holderClampZEnd || !curIv || !curIv.holderClamped) return segs;
        const zHi = curIv.zStart + 0.05, zLo = curIv.zEnd - 0.05;
        return segs.filter(s => Math.max(s.z1, s.z2) <= zHi && Math.min(s.z1, s.z2) >= zLo);
      };
      // Obálka držáku (měkká — dočišťovací trasa dna smí těsně drhnout o
      // přídavkovou slupku, viz holderTrimLeadIn/Out výše): clipToHolderWindow
      // ořízne jen na komponentové okno span (u kapes mezi dvěma stěnami,
      // curIv.holderClamped), holderTrim navíc useřízne konec/začátek, kde by
      // trasa dna sama vjela do zakázané oblasti (curIv bez span okna —
      // typicky kapsa s jednou otevřenou stranou — by jinak zůstala bez
      // jakékoli ochrany držáku).
      // holderTrimLeadIn/Out ořezává po CELÝCH segmentech — dno kapsy je ale
      // jedna dlouhá úsečka (od čisté oblasti u dna po zablokovanou stěnu),
      // kterou by zahodilo celou. Před ořezem ji jemně rozdělíme (~0,4 mm),
      // po ořezu kolineární kousky zase slijeme (jinak sekaný G-kód).
      const _rawLeadIn = prms.noStepRoughing ? clipToHolderWindow(dropMicro(traceOffsetPath(cleanStartZ, pocketBottomZ))) : [];
      const _rawLeadOut = prms.noStepRoughing ? clipToHolderWindow(dropMicro(traceOffsetPath(pocketBottomZ, exitZ))) : [];
      const cleanLeadIn = mergeCollinearSegs(holderTrimLeadIn(subdivideLineSegs(_rawLeadIn), true));
      const cleanLeadOut = mergeCollinearSegs(holderTrimLeadOut(subdivideLineSegs(_rawLeadOut), true));
      // ── DNO kapsy vs. TVRDÁ obálka držáku ──────────────────────────
      // Trasy výš hlídá jen MĚKKÁ oblast (držák smí drhnout o přídavkovou
      // slupku podél stěn — jinak by se dno široké kapsy stalo
      // nedosažitelným). Samotné DNO je ale jiná otázka: leží-li ve TVRDÉ
      // oblasti, nůž se do té prohlubně reálně nevejde a dokončování ji
      // stejně přeskočí (`finishUnreachablePath` → přemostí ji rovným
      // průměrem). Hrubovací dobrání tam pak jen zaveze držák do materiálu,
      // aniž by na tom kdokoli vydělal.
      // Reálný nález (díl uživatele, upichovák š. 3): vyduté údolí R24,5
      // hluboké 8 mm — dobrání sjelo na dno (X20,43 = kontura + přídavek,
      // tedy „správně"), ale držák drhnul o přídavek na protilehlé stěně,
      // 40 mm² oranžové / 3 nálezy validátoru; dokončování tu prohlubeň
      // přemosťovalo rovným průměrem X27,85.
      if (!skipRiskyPocketEmit && holderClampZEnd?.isForbidden?.(pocketBottomX, pocketBottomZ)) {
        skipRiskyPocketEmit = true;
        pocketHolderSkips++;
      }
      if (cleanLeadIn.length > 0 || cleanLeadOut.length > 0) {
        const cleanPass = {
          type: 'long', pocketClean: true,
          x: pocketBottomX, zStart: pocketBottomZ, zEnd: pocketBottomZ, blocked: true,
        };
        if (cleanLeadIn.length > 0) cleanPass.contourLeadIn = cleanLeadIn;
        if (cleanLeadOut.length > 0) cleanPass.contourLeadOut = cleanLeadOut;
        if (cleanApproach) cleanPass.cleanApproach = cleanApproach;
        if (!skipRiskyPocketEmit) {
          passes.push(cleanPass);
          // Dobrání schodku dojede po kontuře od konce POSLEDNÍ rampy až na
          // DNO kapsy — ten úsek přímky zanoření je tím pádem venku a
          // dokončení ořízlé rampy ho nemá opakovat (plungeLineRuns).
          if (prevRampEnd) notePlungeRun(corner.x, corner.z, prevRampEnd.x, pocketBottomX);
        }
      }

      // Potlačení: celou Z-zónu kapsy hlavní smyčka znovu nezpracuje.
      pocketDoneRanges.push({ zHi: corner.z, zLo: exitZ });
      return;
    });
    // Pokud je Z-rozsah aktivní a jeho horní hrana je uvnitř polotovaru
    // (scanIntervals nevrátí žádné intervaly), vygenerujte rampový
    // vjezd od hranice rozsahu z povrchu polotovaru.
    if (entryCapped
        && intervals.length === 0 && !entryRampAnchor) {
      // Válcová obdoba offsetové čáry (bez smyčky není co offsetovat).
      // Přídavky (polo.) = 0 → povrchem je přímo poloměr polotovaru.
      const stockSurfX = sRad + (stockClearanceIsZero(prms) ? 0 : stockClearances(prms).x);
      // Kotvu posuň ZA hranici úseku, kam až pustí držák (holderEntryReachZ) —
      // jinak rampa vjíždí doprostřed údolí a jeho druhá půlka zůstane stát.
      // Strop je ÚSTÍ údolí (`zHiMouth`): dál už údolí není, tam by se kotva
      // šplhala na sousední hrb. Bez ústí (rozsah 📐, ne region) se nikam
      // neposouvá — hranici zvolil uživatel a ta má platit.
      const anchorZ = (_region.zHiValleyTop !== undefined && Math.abs(entryZ - _region.zHi) < 1e-6)
        ? holderEntryReachZ(currentX, entryZ, _region.zHiValleyTop, effZMin)
        : entryZ;
      const surfX = stockLoopL ? offsetStockTopXAtZ(anchorZ) : stockSurfX;
      if (surfX !== null && surfX > currentX + 0.05) {
        entryRampAnchor = { x: surfX, z: anchorZ, first: true };
        const zS = entryRampAnchor.z - (entryRampAnchor.x - currentX) / effPlungeTanL;
        if (zS > effZMin - 0.05) {
          const passObj = { type: 'long', x: currentX, zStart: zS, zEnd: effZMin, blocked: true };
          passObj.ramp = { x0: entryRampAnchor.x, z0: entryRampAnchor.z };
          passObj.entryRangeRamp = true;
          passObj.zStart = zS;
          entryRampAnchor = { x: currentX, z: zS, first: false };
          passes.push(passObj);
        }
      }
    }
    // Zbytek MÉNĚ než Hloubka (ap): řetěz (entryRampAnchor) se na tomhle
    // kroku dál neposunul (currentX ho zablokovala kontura, obálka držáku
    // — firstOpen false — nebo ramp na téhle hloubce už nedosáhne
    // interval.zEnd) — ale řetěz ještě neskončil PŘESNĚ na dosažitelné
    // hranici. Místo úplného zahození najdi bisekcí největší X mezi
    // currentX (nejde) a posledním úspěšným krokem (jde), kde scan() (TÝŽ
    // helper co hlavní smyčka — kontura i obálka držáku) ještě pustí, a
    // dokonči tam poslední, kratší úsek — reálný nález na díle uživatele:
    // zbytek pod Hloubku (ap) po posledním úspěšném kroku řetězu zůstal
    // neobrobený.
    if (entryCapped
        && entryRampAnchor && !entryRampClosed && entryRampAnchor.x - currentX > 0.05) {
      entryRampClosed = true;
      // Bisekce hledá NEJMENŠÍ (nejhlubší) X mezi currentX (selže) a
      // entryRampAnchor.x (poslední úspěšný krok, triviálně projde) —
      // udržuje invariant loX=selže, hiX=projde a sbíhá k hranici odshora.
      let loX = currentX, hiX = entryRampAnchor.x;
      let bestCiv = null, bestX = null;
      for (let k = 0; k < 20; k++) {
        const mid = (loX + hiX) / 2;
        const midScan = scan(mid, entryZ, effZMin, true);
        const midIv = (midScan.firstOpen && midScan.intervals.length > 0) ? midScan.intervals[0] : null;
        const zSmid = midIv ? entryRampAnchor.z - (entryRampAnchor.x - mid) / effPlungeTanL : null;
        if (midIv && zSmid > midIv.zEnd + 0.05) {
          bestCiv = midIv; bestX = mid; hiX = mid;
        } else {
          loX = mid;
        }
      }
      if (bestCiv && entryRampAnchor.x - bestX > 0.05) {
        const zS2 = entryRampAnchor.z - (entryRampAnchor.x - bestX) / effPlungeTanL;
        const finalPass = { type: 'long', x: bestX, zStart: zS2, zEnd: bestCiv.zEnd, blocked: true };
        finalPass.ramp = { x0: entryRampAnchor.x, z0: entryRampAnchor.z };
        finalPass.entryRangeRamp = true;
        // Uzavírací krok řetězu přichází až PO celé hloubkové smyčce, takže se
        // mezi něj a kotvu mohlo vklínit zanoření do kapsy z některé hloubky —
        // pak nástroj na kotvě nestojí a přesun uvnitř kapsy by vedl skrz
        // materiál (viz chainTipIs výš).
        if (!entryRampAnchor.first && chainTipIs(entryRampAnchor)) {
          finalPass.pocketReposition = true;
          finalPass.rampFeedFrom = { x: entryRampAnchor.x, z: entryRampAnchor.z };
        }
        // Poslední (kratší než Hloubka ap) krok řetězu dosedl na konturu —
        // schod vůči kroku NAD ním se dobere sledováním obrysu, stejně jako
        // u běžného průchodu „bez schodků" a u dokončení ořízlé rampy níž.
        // Bez toho průchod končil nasucho a hned odskočil (reálný nález na
        // díle uživatele: poslední schod na kuželu u čela zůstal nedojetý).
        // Napojení se NEtestuje přes traceIfContinuous (jako u dokončení
        // ořízlé rampy níž): konec tohohle průchodu bere booleovská větev ze
        // VZORKOVANÉ geometrie, takže na STRMÉ stěně leží o desetinu mm v Z
        // jinam než analytický dotyk offsetu — a desetina v Z je na stěně se
        // sklonem ~3,7 skoro půl mm v X, tedy nad pevnou tolerancí 0,1 mm.
        // Dojezd se pak zahodil celý a schod zůstal stát (reálný nález na díle
        // uživatele: „dojelo to přímo pod zanořováním k čelu a odskok").
        // Proti nebezpečnému případu (jiná větev kontury u zápichu, part-10:
        // sjezd 6 mm pod hotovní konturu) chrání shift níž — emise stejně jede
        // jen KONCOVÉ body segmentů, takže rozhoduje první koncový bod, a ten
        // musí ležet NAD hloubkou průchodu.
        if (prms.noStepRoughing) {
          const lo = holderTrimLeadOut(
            traceOffsetPath(bestCiv.zEnd, findLeadOutEndZ(bestCiv.zEnd, entryRampAnchor.x, -Infinity, traceFloorL)), true);
          while (lo.length > 0 && lo[0].x2 <= bestX + 0.02) lo.shift();
          clipLeadOutToDepth(lo, entryRampAnchor.x);
          if (lo.length > 0) finalPass.contourLeadOut = lo;
        }
        passes.push(finalPass);
      }
    }
    // ── Poslední (kratší) vrstva před nedosažitelnou hranicí ───────────────
    // Hloubková posloupnost jde po celé Hloubce (ap) od povrchu, takže
    // poslední krok obvykle PŘESTŘELÍ hranici, za kterou už geometrie
    // nepustí. Typicky schodiště u čela: čelní hrana destičky se s hloubkou
    // vzdaluje od zdi (mezní čára „dojezd"), až okno vyjde nulové — hloubka
    // pak nevydá NIC a mezi poslední vrstvou a skutečnou hranicí zůstane
    // stát celý schod ap (reálný nález na díle uživatele: „chybí mi tam
    // jedna vrstva" pod poslední vrstvou u čela).
    // Bisekce najde nejhlubší X, kde sken ještě pustí použitelný vjezd, a
    // vrstvu tam dokončí — týž princip jako uzavření řetězu rampy výš, jen
    // pro obyčejný otevřený vjezd (tam žádný řetěz neběží).
    // JEN u nezakrytého vjezdu zprava (`!entryCapped`): stojí-li vjezd na
    // umělé hranici (rozsah 📐 / hranice úseku / posunutý start zanoření),
    // patří tam RAMPA a uzavření řetězu si řeší entryRampClosed výš — obyčejná
    // vrstva by se do neobrobeného materiálu zapíchla svisle.
    if (passes.length === passMark && !entryCapped && lastDepthWithPasses !== null
        && lastDepthWithPasses - currentX > 0.1) {
      let loX = currentX, hiX = lastDepthWithPasses;   // loX = nepustí, hiX = pustí
      let bestIv = null, bestX = null;
      for (let k = 0; k < 20; k++) {
        const mid = (loX + hiX) / 2;
        const ms = scan(mid, entryZ, effZMin, true);
        const iv0 = (ms.firstOpen && ms.intervals.length > 0) ? ms.intervals[0] : null;
        if (iv0 && iv0.zStart - iv0.zEnd >= dzScan) { bestIv = iv0; bestX = mid; hiX = mid; }
        else loX = mid;
      }
      if (bestIv && lastDepthWithPasses - bestX > 0.1) {
        const closePass = { type: 'long', x: bestX, zStart: bestIv.zStart, zEnd: bestIv.zEnd, blocked: bestIv.blocked };
        if (prms.noStepRoughing && bestIv.blocked) {
          // Schod vůči vrstvě NAD ní se dobere sledováním obrysu, stejně
          // jako u běžného průchodu „bez schodků".
          const lo = holderTrimLeadOut(
            traceOffsetPath(bestIv.zEnd, findLeadOutEndZ(bestIv.zEnd, lastDepthWithPasses, -Infinity, traceFloorL)), true);
          while (lo.length > 0 && lo[0].x2 <= bestX + 0.02) lo.shift();
          clipLeadOutToDepth(lo, lastDepthWithPasses);
          if (!prms.noStepRoughingFace && isFaceLeadOut(lo)) lo.length = 0;
          if (lo.length > 0) closePass.contourLeadOut = lo;
        }
        passes.push(closePass);
      }
    }
    if (passes.length > passMark) lastDepthWithPasses = currentX;
    // Zanoření se stropem držáku (entryZ posunutý doleva, viz výš) bere
    // MENŠÍ průměr, než na jaký v tomhle Z-okně dosáhly ostatní regiony —
    // v pořadí se proto odloží až za ně, ať hrubování jde odshora dolů
    // a nezačíná zanořením (reálný požadavek uživatele).
    // Zanoření na hranici REGIONU se odkládá stejně jako posunutý vjezd:
    // „co je nahoře, má přednost" — nejdřív se odeberou všechny větší průměry
    // a teprve pak se rampou sjede pod hranicí do menšího (jinak by nad
    // zanořeným nástrojem stál materiál, který se teprve bude brát).
    if (entryZ !== effZMax || regionCapped) {
      for (let i = passMark; i < passes.length; i++) passes[i].__deferEntry = true;
    }
  }
  // Dokončení ořízlých ramp (viz pendingRampCompletions výš) — teprve TEĎ,
  // po celé hloubkové smyčce tohoto regionu, je jisté, že žádná další
  // (hlubší) vrstva ten klín materiálu sama nenajde. Rozděleno na kroky
  // ≤ Hloubka (ap) — jeden souvislý záběr přes celou rampu by zase sebral
  // víc materiálu, než odpovídá nastavené hloubce (reálný nález na díle
  // uživatele). První krok najede bezpečně nad konturou (`pass.ramp` →
  // safeRapidTo), další kroky se jen ODSKOČÍ (`pocketReposition`,
  // stejný vzor jako „dobrat kapsu najednou") a rychloposuvem se vrátí na
  // konec předchozího kroku — odtud pracovní rampa řeže jen nový úsek.
  // Kam až sahá SOUVISLÝ materiál na hloubce X směrem doleva od zFrom: doběh
  // končí tam, kde vůlí-posunutá silueta polotovaru klesne pod hloubku kroku.
  // Za takovou mezerou je jiné místo dílu — vcelku se bere jen materiál, který
  // je V KUSE (stejné pravidlo jako u hranic úseků; reálný nález na díle
  // uživatele: doběh přeletěl celé údolí a dodělával vrstvu na druhé straně).
  //
  // Měří se na CELÉ vůlí-posunuté siluetě (`stockLoopOffsetFullL`, bez ořezu
  // rozsahem 📐): jestli je materiál v kuse, je vlastnost DÍLU, ne zvoleného
  // úseku obrábění. Hranice se dopočítá PŮLENÍM, ne po krocích vzorkování:
  // konec doběhu musí sednout PŘESNĚ na offsetovou čáru. O krok vzorkování
  // vedle by ho emise (`airSplitAxial`) už nesměla dotáhnout — prodloužení
  // výjezdu nesmí přejet konec průchodu — a řez by skončil o vůli dřív
  // (hlídá tests/cam-leadout-step na range-chain-insert-shadow).

  for (const rc of pendingRampCompletions) {
    let curX = rc.resumeX, curZ = rc.resumeZ, first = true;
    const rcSteps = [];
    while (curX > rc.targetX + 1e-6) {
      const stepX = Math.max(rc.targetX, curX - step);
      const stepZ = curZ - (curX - stepX) / effPlungeTanL;
      const isLastStep = stepX <= rc.targetX + 1e-6;
      // Tenhle úsek přímky zanoření už jednou sjela kapsa za bossem z hlubší
      // vrstvy (plungeLineRuns výš) — roh strmé stěny je pro obě týž bod.
      // Bez tohohle testu se týž klín vyřízl DVAKRÁT: „Průchod 9/10" byl
      // doslovná kopie „Průchodu 4/5" a začínal znovu od vršku zanoření
      // (reálný nález na díle uživatele).
      if (plungeRunCovers(rc.resumeX, rc.resumeZ, stepX, curX)) {
        curX = stepX; curZ = stepZ;   // posuň se po přímce dál (kdyby hlubší krok ještě chyběl)
        continue;
      }
      // Meziкrok nekončí hned po rampě — pokračuje ROVNĚ (jako běžná
      // vrstva) až na společný cíl rc.targetZ (konec polotovaru v tomhle
      // regionu), stejně jako u prvního (nerozděleného) dojezdu. Poslední
      // krok už tam doletí přímo rampou (stepZ === rc.targetZ), navíc
      // rovný úsek nepotřebuje.
      // Rovný úsek mezikroku končí na STĚNĚ KONTURY (straightRunEndZ) — na
      // téhle (mělčí) hloubce může kontura stoupnout dřív než na cílové, tam
      // musí zastavit, aby nepodjel hotovní konturu. Doběh se ale NEomezuje
      // společným cílem rc.targetZ: leží-li stěna až ZA ním, mezikrok tam
      // dojede a schod dobere svým dojezdem (níž). Se stropem na rc.targetZ
      // končil nasucho uprostřed materiálu, přestože vrstva nad ním
      // (o Hloubku ap mělčí) byla obrobená až daleko za tím bodem — reálný
      // nález na díle uživatele.
      // Doběh končí tím, co přijde DŘÍV: stěna hotovní kontury (straightRunEndZ),
      // nebo konec souvislého materiálu (stockRunEndZ výš).
      const stepEndZ = isLastStep ? stepZ : Math.max(
        straightRunEndZ(stepX, stepZ, traceFloorL),
        stockRunEndZ(stepX, stepZ, traceFloorL));
      const stepPass = { type: 'long', x: stepX, zStart: stepZ, zEnd: stepEndZ, blocked: true };
      // Řetěz dorampování strmé stěny — stejná povaha jako entryRangeRamp:
      // kroky leží NAD SEBOU podél TÉŽE stěny, nejsou to nezávislé bossy.
      // Značka je vyloučí z heuristiky „pravých stěn kapes" níž (viz tam).
      stepPass.rampCompletion = true;
      if (first) {
        stepPass.ramp = { x0: curX, z0: curZ };
        first = false;
      } else {
        stepPass.ramp = { x0: curX, z0: curZ };
        stepPass.pocketReposition = true;
        stepPass.rampFeedFrom = { x: curX, z: curZ };
      }
      // Poslední krok smí normálně odjet (retrakt); mezikroky se ŘETĚZÍ
      // beze změny polohy (noRetract) — návaznost řeší odskok+reposition
      // NÁSLEDUJÍCÍHO kroku (pocketReposition výš), ne odjezd tohoto.
      if (stepX > rc.targetX + 1e-6) stepPass.noRetract = true;
      if (prms.noStepRoughing) {
        // Krok dosedl na konturu — schod vůči kroku NAD ním se dobere
        // sledováním obrysu, stejně jako u běžného průchodu „bez schodků"
        // (jinak zůstane mezi rampou a hotovní konturou klín; reálný nález
        // na díle uživatele v údolí). Platí i pro MEZIKROKY řetězu: každý
        // z nich je plnohodnotná vrstva na své hloubce a schod vůči vrstvě
        // nad sebou si dobírá sám (dřív dojížděl jen poslední krok, takže
        // mezikrok skončil nasucho na stěně — reálný nález na díle
        // uživatele). Návaznost řetězu to nerozbíjí: následující krok se
        // stejně odskočí a rychloposuvem vrátí na konec rampy toho
        // předchozího (`pocketReposition`/`rampFeedFrom` výš).
        const lo = holderTrimLeadOut(traceIfContinuous(
          traceOffsetPath(stepEndZ, findLeadOutEndZ(stepEndZ, curX, -Infinity, traceFloorL)),
          stepX, stepEndZ), true);
        while (lo.length > 0 && lo[0].x2 <= stepX + 0.02) lo.shift();
        clipLeadOutToDepth(lo, curX);
        if (lo.length > 0) stepPass.contourLeadOut = lo;
      }
      rcSteps.push(stepPass);
      curX = stepX; curZ = stepZ;
    }
    if (rcSteps.length === 0) continue;
    // ── Kam v pořadí ten dobírací řetěz patří ─────────────────────────────
    // Rozhodnout SE MUSÍ až tady (dřív není jisté, že klín nevezme některá
    // hlubší vrstva sama), ale VYDAT se nemusí až tady. Přišitý na konec
    // regionu skočil mělký dobírák (např. Ø44,5) až za nejhlubší vrstvy
    // (Ø19,5) — program pak „dodělával nakonec" místo aby šel po vrstvách
    // dolů (reálná stížnost uživatele). Blok se proto vloží hned za poslední
    // průchod, který je ještě stejně hluboký nebo mělčí; hloubková
    // posloupnost tak zůstane monotónní.
    const deepestStepX = rcSteps[rcSteps.length - 1].x;
    let at = passes.length;
    while (at > regionMark && passes[at - 1].x < deepestStepX - 1e-6) at--;
    // Řetěz se nesmí rozříznout: `pocketReposition`/`noRetract` počítají
    // s tím, že nástroj stojí na konci PŘEDCHOZÍHO průchodu. Vložit blok mezi
    // ně by ten rychloposuv poslal skrz materiál — v takovém případě zůstane
    // dobírák na konci regionu (bezpečné, jen dřívější pořadí).
    if (at < passes.length
        && (passes[at].pocketReposition || passes[at].cleanApproach
            || (at > regionMark && passes[at - 1].noRetract))) at = passes.length;
    passes.splice(at, 0, ...rcSteps);
  }
  // Přesun odloženého zanoření na konec TOHOTO REGIONU (stabilně, pořadí
  // uvnitř skupin zůstává) — „co je nahoře, má přednost". Region je vlastní
  // Z-zóna dílu: odsouvat zanoření až za VŠECHNY ostatní regiony nemá důvod
  // (materiál nad ním vzaly vrstvy tohohle regionu) a jen to zbytečně tříští
  // pořadí — zanoření patří hned za poslední vrstvu svého místa (reálný nález
  // na díle uživatele: zanoření se dělalo úplně nakonec programu).
  if (passes.length > regionMark) {
    const head = [], tail = [];
    for (let i = regionMark; i < passes.length; i++) {
      const p = passes[i];
      (p.__deferEntry ? tail : head).push(p);
      delete p.__deferEntry;
    }
    passes.length = regionMark;
    for (const p of head) passes.push(p);
    for (const p of tail) passes.push(p);
  }
  } // konec smyčky regionů
  if (plungeShallowed > 0)
    foundErrors.push({ type: 'warning', msg: `POZNÁMKA: Zanořování — ${plungeShallowed} průchodů do kapsy nedosáhlo plné cílové hloubky v jednom kroku (rampa pod ${effPlungeDegL.toFixed(1)}° pokračuje dalším krokem).` });
  if (partingNarrowPockets > 0)
    foundErrors.push({ type: 'warning', msg: `Upichovák: ${partingNarrowPockets} kapsa/kapes užších než plátek (${wInsL} mm) vynechána — plátek se do nich nevejde.` });
  if (pocketHolderSkips > 0)
    foundErrors.push({ type: 'warning', msg: `Hlídání držáku: ${pocketHolderSkips} prohlubeň/prohlubní se nedobírá až na dno — držák se tam nevejde. Dokončování je ze stejného důvodu přemostí rovným průměrem; dno patří jinému nástroji.` });
  // Ztracené hloubky = ty, kde obálka držáku něco zastavila a nakonec z nich
  // NEVZNIKL žádný průchod. Vyhodnocuje se až tady, proti skutečně vydaným
  // průchodům — počítat pokusy uvnitř smyčky nafukuje číslo (viz komentář
  // u holderBlockedDepths).
  if (holderBlockedDepths.size > 0) {
    const machined = new Set();
    for (const p of passes) if (p.type === 'long') machined.add(depthKey(p.x));
    const lost = [...holderBlockedDepths].filter(k => !machined.has(k)).length;
    if (lost > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání geometrie (držák): ${lost} hloubka/hloubek se nedá obrobit — držák by narazil do materiálu (čelo u osy, úzká kapsa, prostor za přírubou). Zbytek obrobte jiným nástrojem/upnutím.` });
  }
  // Zóny zahozené obálkou držáku, kam nakonec NIC nezajelo (viz
  // holderDroppedZones výš). Pokrytí se bere z vydaných průchodů VČETNĚ
  // sledování obrysu (leadIn/leadOut) — právě tím se většina zahozených
  // intervalů dobere (dojezd „bez schodků" projede celé údolí za bossem),
  // takže bez téhle kontroly by hlášení křičelo skoro vždy.
  if (holderDroppedZones.length > 0) {
    const spans = [];
    for (const p of passes) {
      if (p.type !== 'long') continue;
      let lo = Math.min(p.zStart, p.zEnd), hi = Math.max(p.zStart, p.zEnd);
      for (const key of ['contourLeadIn', 'contourLeadOut']) {
        for (const s of p[key] || []) {
          lo = Math.min(lo, s.z1, s.z2); hi = Math.max(hi, s.z1, s.z2);
        }
      }
      spans.push({ lo, hi });
    }
    const uncovered = (z) => !spans.some(s => z >= s.lo - 0.2 && z <= s.hi + 0.2);
    // Zóna se pokládá za neobrobenou, když je bez pokrytí většina její délky
    // (vzorkuje se v pětinách) — okrajové překryvy dojezdů nic nezachrání.
    let worst = 0, cnt = 0;
    for (const zn of holderDroppedZones) {
      const len = Math.abs(zn.zHi - zn.zLo);
      if (len < 1) continue;
      let miss = 0;
      for (let i = 1; i <= 5; i++) if (uncovered(zn.zLo + (zn.zHi - zn.zLo) * i / 6)) miss++;
      if (miss >= 3) { cnt++; if (len > worst) worst = len; }
    }
    if (cnt > 0)
      foundErrors.push({ type: 'warning', msg: `Hlídání geometrie (držák): ${cnt} úsek(ů) polotovaru zůstalo NEOBROBENO (nejdelší ${worst.toFixed(0)} mm) — držák se k nim nedostane (klín za bossem/přírubou, na který nedosáhne destička). Obrobte je z druhé strany (Hrubování zprava/zleva) nebo jiným nástrojem.` });
  }

  // ── Sjezdy/dojezdy upichováku po OBÁLCE (podélně) ──
  // Sledování kontury (leadIn do kapsy, leadOut „bez schodků") jede u
  // upichováku po obálce x(z) = max offsetu pod rovnou částí dna (tělo
  // doprava): na klesající kontuře (sjezd do kapsy, dojezd schodu doleva)
  // tak dráha zůstane výš, dokud tělo nemine pravou stěnu — jinak by
  // aktivní roh sledoval konturu a tělo za ním řezalo do tvaru. Na
  // stoupající (levé stěny) se obálka kryje s offsetem. Kruhové úseky se
  // zpětně prokládají G2/G3 (fitArcsToPolyline).
  if (isParting) {
    // X původní trasy na axiální souřadnici z (max přes segmenty, které tam
    // zasahují). Slouží jako PODLAHA obálky — viz envify níž.
    // OBLOUK SE MUSÍ VYHODNOTIT PŘESNĚ (průsečík kružnice se svislicí, jen
    // úhlově platná větev): „konzervativně vyšším koncem" zvedne podlahu na
    // maximum přes CELÉ rozpětí oblouku, takže obálka nad ním vyjde vodorovná
    // a z oblouku se v G-kódu stane ÚSEČKA (reálný nález uživatele:
    // `G1 X31.766 Z−1.261` místo `G3 … CR=11.344`).
    const traceXAt = (segs, z) => {
      let top = null;
      const bump = (x) => { if (Number.isFinite(x) && (top === null || x > top)) top = x; };
      for (const s of segs) {
        const zLo = Math.min(s.z1, s.z2), zHi = Math.max(s.z1, s.z2);
        if (z < zLo - 1e-9 || z > zHi + 1e-9) continue;
        if (s.type === 'line') {
          const dz = s.z2 - s.z1;
          bump(Math.abs(dz) < 1e-9 ? Math.max(s.x1, s.x2) : s.x1 + (s.x2 - s.x1) * ((z - s.z1) / dz));
        } else if (Number.isFinite(s.cx) && Number.isFinite(s.cz) && s.r > 0) {
          const d = z - s.cz;
          if (Math.abs(d) > s.r) { bump(Math.max(s.x1, s.x2)); continue; }   // svislice mimo kružnici
          const h = Math.sqrt(Math.max(0, s.r * s.r - d * d));
          let hit = false;
          for (const x of [s.cx + h, s.cx - h]) {
            const a = Math.atan2(x - s.cx, z - s.cz);
            if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) { bump(x); hit = true; }
          }
          if (!hit) bump(Math.max(s.x1, s.x2));
        } else {
          bump(Math.max(s.x1, s.x2));
        }
      }
      return top;
    };
    const envify = (segs) => {
      if (!segs || segs.length === 0) return segs;
      const zFrom = segs[0].z1, zTo = segs[segs.length - 1].z2;
      if (Math.abs(zTo - zFrom) < 0.02) return segs;
      const pts = samplePartingEnvelope(offsetXAt, zFrom, zTo, w2RL, 1, 0.4, 0.003);
      if (pts.length < 2) return segs;
      // Obálka smí dráhu jen ZVEDNOUT. Počítá se ze syrového `offsetXAt`,
      // jenže původní trasa už prošla podlahou hloubky vrstvy, ořezem na
      // sousední (mělčí) průchod i obálkou držáku — její X je proto závazné
      // MINIMUM. Bez tohohle stropu se z rovného dojezdu ve výšce vrstvy
      // stal sjezd po kontuře až na dno dílu: na díle uživatele dojezd
      // z X49,5 sjel na X7,9 (41 mm pod svou vrstvu) a držák jel 20 mm
      // v bossu — hlídání držáku přitom trasu VIDĚLO jako čistou, protože
      // testovalo tu původní, rovnou (2589 mm² kolizí).
      for (const p of pts) {
        const floor = traceXAt(segs, p.z);
        if (floor !== null && floor > p.x) p.x = floor;
      }
      const fitted = fitArcsToPolyline(pts, 0.02);
      const out = [];
      for (const s of fitted) {
        if (s.type === 'line') out.push({ type: 'line', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z });
        else out.push({ type: 'arc', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z, cx: s.cx, cz: s.cz, r: s.r, dir: s.dir, startAngle: s.startAngle, endAngle: s.endAngle });
      }
      return out.length > 0 ? out : segs;
    };
    for (const p of passes) {
      if (p.type !== 'long') continue;
      if (p.contourLeadIn) p.contourLeadIn = envify(p.contourLeadIn);
      if (p.contourLeadOut) p.contourLeadOut = envify(p.contourLeadOut);
    }
  }

  // ── Doběh přes KONEC PROFILU do konce polotovaru ───────────────────
  // Kontura končí čelem (poslední prvek profilu), takže offsetová čára
  // skončí v jeho rohu — jenže polotovar tam ještě pokračuje (odřezek
  // ve sklíčidle). Průchod, který na ten roh dojel, tam nechá stát
  // prstenec: reálný nález uživatele — dráhy končily na Z−1,3, zatímco
  // sousední (ničím nezablokované) průchody jedou přes celý zbytek na
  // Z−9. Prstenec pak navíc drží i DOKONČOVÁNÍ, protože jeho doběh
  // (`finRunOut` v gcodeEmit) couvne, když nad hotovní čarou stojí víc
  // než jedna tříska.
  //
  // Doběh se přidá jen tam, kde profil OPRAVDU končí (dál v Z už žádná
  // offsetová čára není) a v té hloubce ještě stojí materiál. Konec
  // určuje `stockRunEndZ` — táž funkce, jakou používá doběh mezikroků
  // rampy, takže se skončí na vůlí-posunuté siluetě polotovaru.
  {
    const zFloorEnd = Math.max(
      stockLoopOffsetFullL ? Math.min(...stockLoopOffsetFullL.map(p => p.z)) - 1 : -1e4,
      rangeZLoL);
    for (const p of passes) {
      if (p.type !== 'long' || p.noRetract) continue;
      const lo = p.contourLeadOut;
      const end = (lo && lo.length > 0)
        ? { x: lo[lo.length - 1].x2, z: lo[lo.length - 1].z2 }
        : (Number.isFinite(p.x) && Number.isFinite(p.zEnd) ? { x: p.x, z: p.zEnd } : null);
      if (!end || !Number.isFinite(end.x) || !Number.isFinite(end.z)) continue;
      if (end.z <= zFloorEnd + 0.05) continue;              // už je na dně okna
      if (offsetXAt(end.z - 0.2) !== null) continue;        // profil pokračuje dál
      const zRun = stockRunEndZ(end.x, end.z, zFloorEnd);
      if (!(end.z - zRun > 0.2)) continue;                  // za koncem už není materiál
      const seg = { type: 'line', x1: end.x, z1: end.z, x2: end.x, z2: zRun };
      if (lo && lo.length > 0) lo.push(seg); else p.contourLeadOut = [seg];
    }
  }

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
      // Vjezd na hranici rozsahu Z (entryRangeRamp) ani dorampování strmé
      // stěny (rampCompletion) NENÍ pravá stěna kapsy — obojí je řetězená
      // posloupnost ramp NAD SEBOU podél téže hranice/stěny, ne nezávislý
      // boss. Bez vyloučení tahle heuristika brala mělčí krok řetězu jako
      // „pravou stěnu" hlubšího kroku, umělé zúžení smazalo z0 pod zEnd a
      // celý krok zmizel (reálný nález na díle uživatele — první krok řetězu
      // chyběl; u rampCompletion navíc přes CELÝ díl: krok řetězu v jednom
      // údolí smazal krok řetězu v jiném, o 120 mm dál, a osiřelý
      // `pocketReposition` pak přejel rychloposuvem skrz polotovar).
      const rightWalls = passes.filter(p => p.type === 'long' && p.ramp && !p.contourLeadIn && !p.pocketReposition && !p.entryRangeRamp && !p.rampCompletion).map(p => ({ x: p.x, z: p.ramp.z0 }));
      for (let pi = passes.length - 1; pi >= 0; pi--) {
        const p = passes[pi];
        if (p.type !== 'long' || !p.ramp || p.contourLeadIn || p.entryRangeRamp || p.rampCompletion) continue;
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

// Registr strategií hrubování. Klíč = prms.roughingStrategy.
// genPasses(ctx) naplní ctx.passes; label se použije v hlavičce G-kódu.
// Cílově sem přibudou zápichy ('grooving').
//
// „PODELNE ZLEVA" (druhá strana) NENÍ vlastní algoritmus: je to přesné
// zrcadlo podélného hrubování, takže se celý CAM svět překlopí v ose Z
// (calculatePipeline.js + zMirror.js) a použije se TÝŽ genLongPasses —
// v zrcadle jede standardně zprava doleva. Zleva tak platí beze zbytku
// všechno, co umí pravá strana: kapsy, zanořovací rampy, dojezdy „bez
// schodků", hlídání geometrie destičky i obálka držáku.
export const ROUGHING_STRATEGIES = {
  longitudinal: { genPasses: genLongPasses, label: 'PODELNE' },
  face: { genPasses: genFacePasses, label: 'CELNI' },
  backside: { genPasses: genLongPasses, label: 'PODELNE ZLEVA' },
};

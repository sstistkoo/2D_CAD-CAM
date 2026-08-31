// ČELNÍ HRUBOVÁNÍ (osa X od povrchu k ose/kontuře) — generátor průchodů.

import { getInsert } from '../inserts/index.js';
import { topXOnLoop, rapidFeedGap, quantizeUp, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc, samplePartingEnvelope, stockClearances, stockClearanceIsZero } from '../camMath.js';
import { offsetStockLoop, stockPlanLoop, insertBodyZ, toolFootprint } from '../materialRemoval.js';
import { insertReachZ } from '../toolEnvelope.js';
import { SKIM_MIN_LAYER } from './shared.js';
import { guardInsertFace } from './face/insertGuard.js';
import { makeEnforceLayerDepth } from './face/layerDepth.js';
import { makeRegionRunOut } from './face/regionRunOut.js';
import { makeHolderGuardFace } from './face/holderGuard.js';

export function genFacePasses(ctx) {
  // Pravidla PLÁTKU (cam/inserts/*) — generátor se jich ptá místo toho, aby
  // sám věděl, co který tvar dělá. Změna pro jeden plátek pak nemůže sáhnout
  // na jiný (viz hlavička inserts/index.js).
  const ins = getInsert(ctx.prms);
  const { prms, sRad, stockFace, step, offsetPath, stockPathSegments, stockWorldPoints, worldPoints, passes, foundErrors, traceOffsetPath, offsetXAt, machiningRange, machiningRangeX } = ctx;
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
  // Rádius nosu + doběh kužele: musí být nad `castingOuterAtZ`, které je čte.
  const rTipFC = Math.max(parseFloat(prms.toolRadius) || 0, 0);
  const faceOffsetOut = rTipFC
    + Math.max(parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0)
    + (parseFloat(prms.finishAllowance) || 0);
  // Doběh (NATOČENÁ destička nebo UPICHOVÁK). Spodní hrana se táhne dz·tan(natočení)
  // ZA nosem, takže poslední vrstva za sebou nechá 15° kužel. Když march skončí
  // dřív, než kužel vyjede nad offsetovou čáru polotovaru, zůstane na jeho konci
  // SCHODEK — a ten by ještě jedna vrstva vzala (nález uživatele 19. 8. 2026:
  // „nemusí to dobrat úplně doleva, jen ať tam nezůstane schodek"). Vrstvy
  // pokračují po kuželu (nikdy hlouběji, pravidlo „ne pod předchozí vrstvu"),
  // dokud řez nevyjede za offsetovou čáru polotovaru; dál ne — tam už je vzduch.
  // Platí pro NATOČENOU destičku (tam končí řez kuželem) i pro UPICHOVÁK: ten má
  // břit 5 mm široký a natočení 0°, takže žádný kužel netvoří — vrstva navíc smí
  // být ve STEJNÉ hloubce (`tanR` = 0) a přesto něco vezme: dojede tím dál v Z, kam
  // se při marchování po `ap` žádná mřížková vrstva nedostala.
  const faceRunOut = (prms.respectInsertGeometry
    && (ins.tiltedFlank || ins.cutsFullWidth)
    && insertReachZ(prms, prms.roughingSide === 'left') > 1e-6) ? faceOffsetOut : 0;

  // V zóně DOBĚHU (za koncem polotovaru, viz `faceRunOut`) svislice obrys MINE.
  // Jmenovitý `sRad` je tam nesmysl — u odlitku bývá úplně jinde než skutečná
  // hrana, takže rychloposuv i mez dotyku skáčou o desítky mm a poslední vrstva
  // pak jede dlouhý kus vzduchem. Vezme se povrch na nejbližším Z, kde polotovar
  // ještě JE (= hrana, o kterou se řez opře). Jen pro doběh: bez něj (kulatá /
  // nenatočená destička) se `sRad` chová přesně jako dřív.
  let stockZLo = null, stockZHi = null;
  if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
    stockZLo = Math.min(...stockWorldPoints.map(p => p.zReal));
    stockZHi = Math.max(...stockWorldPoints.map(p => p.zReal));
  }
  const castingOuterAtZ = (z) => {
    const v = castingOuterOrNull(z);
    if (v !== null) return v;
    if (stockZLo !== null && faceRunOut > 0) {
      const zc = Math.min(stockZHi, Math.max(stockZLo, z));
      if (zc !== z) {
        const w = castingOuterOrNull(zc);
        if (w !== null) return w;
      }
    }
    return sRad;
  };
  // Rapid-bezpečná X pro STŘED špičky na zadané Z. Nos je kruh rádiusu R:
  // ve vzdálenosti dz od středu sahá o √(R²−dz²) níž než střed, takže
  // „povrch v tomhle jediném Z + R" nestačí — nad stoupajícím sousedstvím
  // (kužel odlitku, stěna) vjede BOK nosu do materiálu dřív, než na něj
  // dosedne špička. Okno se bere jen do NEOBROBENÉ strany (proti směru
  // marche); na obrobené straně už syrový obrys neplatí a clearance nad ním
  // by hnala rychloposuv zbytečně vysoko.
  // U R 0,8 mm je okno neznatelné, u R 8 mm je to reálná kolize (rychloposuv
  // na xStart projel kuželem polotovaru).
  const clrXFC = stockClearances(prms).x;
  // Plánovací (vůlí-posunutá) silueta — táž „tečkovaná" čára, jakou kreslí náhled
  // a proti které plánuje emise. Odlitek může být až u ní, takže rychloposuv
  // nesmí končit V ní (uživatel 20. 8. 2026: „N2160 G0 X46.344 — příjezd
  // rychloposuvem končí již v té offsetové čáře“).
  const planLoopFC = (() => {
    try { return stockPlanLoop(prms, stockPathSegments); } catch { return null; }
  })();
  const feedGapFC = rapidFeedGap(prms);
  const rapidStartXAt = (z, xHere, dirUncut) => {
    let need = xHere + rTipFC;
    const n = 8;
    for (let i = 1; i <= n && rTipFC > 1e-6; i++) {
      const dz = rTipFC * (i / n);
      const cand = castingOuterAtZ(z + dirUncut * dz) + Math.sqrt(Math.max(0, rTipFC * rTipFC - dz * dz));
      if (cand > need) need = cand;
    }
    need += clrXFC;
    // ODSTUP NAD OFFSETOVOU ČÁROU. `xHere` je SYROVÝ povrch a `clrXFC` se k němu
    // přičítá SVISLE — na šikmé stěně je ale offsetová čára v X výš (posouvá se
    // KOLMO), takže takhle spočtený start ležel POD ní. Měří se proto přímo
    // proti plánovací smyčce: střed nosu na `čára + R + gap`, a to i pro nos
    // vysunutý o R do stran (táž obalová geometrie jako výš).
    if (planLoopFC) {
      for (let i = 0; i <= n; i++) {
        const dz = rTipFC * (i / n);
        const pt = topXOnLoop(planLoopFC, z + dirUncut * dz);
        if (pt === null) continue;
        const cand = quantizeUp(pt + Math.sqrt(Math.max(0, rTipFC * rTipFC - dz * dz)) + feedGapFC);
        if (cand > need) need = cand;
      }
    }
    return need;
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
  let minOZx = null;              // X offsetu na jeho LEVÉM konci
  offsetPath.forEach(p => {
    if (p.isDegenerate) return;
    const z1 = p.type === 'line' ? p.p1.z : p.cz + p.r;
    const z2 = p.type === 'line' ? p.p2.z : p.cz - p.r;
    maxOZ = Math.max(maxOZ, z1, z2);
    if (Math.min(z1, z2) < minOZ) {
      minOZ = Math.min(z1, z2);
      if (p.type === 'line') minOZx = (p.p1.z <= p.p2.z) ? p.p1.x : p.p2.x;
      else minOZx = p.cx;
    }
  });
  // Směr marche (nabírání ap v Z) podle strany:
  //   zprava (right) = od pravého čela DOLEVA (−Z),
  //   zleva  (left)  = od levého konce DOPRAVA (+Z).
  // Dojíždění schodu (leadOut) jde VŽDY opačně než march = k už obrobené
  // straně (předchozí, mělčí průchod), aby se jen sloupl hřebínek a nezajelo
  // se do dosud neobrobeného polotovaru.
  const faceLeft = (prms.roughingSide === 'left');
  // SKIM VRSTVA NAD NAKRESLENÝM ČELEM — táž oprava jako u hloubkové
  // posloupnosti podélného hrubování, jen v ose Z. March je kotvený na hraně
  // NAKRESLENÉHO polotovaru, jenže materiál může sahat až na offsetovou čáru,
  // takže první vrstva ukousla `ap + VůleZ` (změřeno: part-16 / part-18 /
  // part-19 při ap 3 → tříska 3,999, tedy o třetinu víc). Přičtení Vůle Z je
  // EXAKTNÍ ze stejného důvodu jako u `planTopX`: offset je Minkowského součet
  // s elipsou o poloose `clrZ` v Z, takže krajní Z roste přesně o `clrZ`.
  //
  // Vrstva se PŘIDÁVÁ, mřížka se NEPOSOUVÁ (posun celé posloupnosti je
  // měřitelně horší — viz `planTopX` v genLongPasses).
  //
  // MEZ: vrstvy, které by ležely až ZA nakresleným čelem (nastane jen při
  // Vůli Z > Hloubka záběru), se nepřidávají — `castingOuterAtZ` tam obrys
  // MINE a vrátil by jmenovitý `sRad`, který u odlitku bývá úplně jinde.
  const clrZPlanF = stockClearanceIsZero(prms) ? 0 : stockClearances(prms).z;
  const faceEdgeZ = faceLeft ? marchEndZ : faceStartZ;
  const planEdgeZ = faceEdgeZ + (faceLeft ? -clrZPlanF : clrZPlanF);
  //
  // Skim se ROZDĚLÍ ROVNOMĚRNĚ tak, aby dosedl PŘESNĚ na první vrstvu hlavní
  // mřížky — táž oprava, jakou dostala hloubková posloupnost podélného
  // hrubování 21. 8. 2026 (`planTopX` v genLongPasses). Dokud skim šel po `ap`
  // od plánovací hrany, obě mřížky se o Vůli Z rozešly a na jejich styku
  // zbyla tenká vrstva: part-16/18/19 při ap 3 → 369,932 → 366,932 (3,0)
  // → 365,932 (jen 1,0), pak už zase 3,0. Rovnoměrné dělení dá 2 × 2,0.
  //
  // POČET vrstev se tím nemění, jen se posunou: `nSkim` se zapíná na TÉŽE
  // hranici, na jaké se dřív zapínal ten jeden skim průchod. Zbytek tenčí než
  // `SKIM_MIN_LAYER` se NEODDĚLUJE a sebere ho první vrstva mřížky najednou —
  // vezme `ap + zbytek`, tedy nejvýš 1,1 × ap (viz `SKIM_MIN_LAYER`).
  const sgnF = faceLeft ? 1 : -1;          // směr marche v ose Z
  const firstMainZ = faceEdgeZ + sgnF * step;
  const skimSpan = Math.abs(firstMainZ - planEdgeZ);   // = ap + Vůle Z
  const nSkim = skimSpan > step * (1 + SKIM_MIN_LAYER)
    ? Math.ceil(skimSpan / step - 1e-9)
    : 1;
  const zListAll = [];
  for (let k = 1; k < nSkim; k++) {
    const z = planEdgeZ + sgnF * k * (skimSpan / nSkim);
    // MEZ: vrstva, která by ležela až ZA nakresleným čelem (nastane jen při
    // Vůli Z > Hloubka záběru), se nepřidává — `castingOuterAtZ` tam obrys
    // MINE a vrátil by jmenovitý `sRad`, který u odlitku bývá úplně jinde.
    if (sgnF * (z - faceEdgeZ) >= -0.01) zListAll.push(z);
  }
  if (!faceLeft) {
    for (let z = faceStartZ - step; z >= marchEndZ - faceRunOut - 0.01; z -= step) zListAll.push(z);
  } else {
    for (let z = marchEndZ + step; z <= faceStartZ + faceRunOut + 0.01; z += step) zListAll.push(z);
  }
  // ── Rozsah obrábění Z (📐) ─────────────────────────────────────────────
  // Marchovací osa čelního hrubování je Z, takže rozsah tady vybírá VRSTVY —
  // přesně tak, jak rozsah X vybírá hloubky v podélném hrubování. Díl se
  // obrábí po úsecích: co je mimo pás, dělá tahle operace vzduchem.
  //
  // DVĚ MŘÍŽKY: `zList` = co tahle operace obrábí, `zListAll` = celá marche
  // od kraje polotovaru. Dělba mezi nimi kopíruje pravidlo podélného
  // hrubování (docs/user-guide.md § Obrábění po úsecích) — rozsah ořezává
  // PLÁNOVÁNÍ, kolize se hlídají proti celému polotovaru:
  //   • generování průchodů a doběh úseků → `zList` (jen pás),
  //   • hlídání DRŽÁKU (`holderGuardFace`) → `zListAll`, protože za hranicí
  //     pásu stojí polotovar v plné výšce a spodek držáku do něj zajede
  //     úplně stejně jako do pásu bez průchodu.
  // `enforceLayerDepth` (hrana destičky nesmí pod předchozí vrstvu) čte
  // naopak `zList`: popisuje SCHODIŠTĚ, které vyrábí tahle operace, a se
  // syrovým povrchem za hranicí pásu jako „hotovou vrstvou" se pás
  // s natočenou destičkou skoro celý zahodil (změřeno: part-19 pás 300–360
  // → 0 průchodů, pás 250–320 → 7 místo 9; face-casting → 0 průchodů
  // v každém pásu). Že je to bezpečné, drží validátor: všech 25 měřených
  // kombinací dílu × pásu jede na nulu proti syrové siluetě i offsetové čáře.
  const zList = machiningRange
    ? zListAll.filter(z => z >= machiningRange.zLo - 0.005 && z <= machiningRange.zHi + 0.005)
    : zListAll;
  if (machiningRange && zList.length === 0 && zListAll.length > 0)
    foundErrors.push({ type: 'warning', msg: `Rozsah obrábění Z (${machiningRange.zLo}–${machiningRange.zHi} mm): žádná vrstva čelního hrubování neleží v zadaném intervalu — dráhy nebyly generovány.` });
  // ── HRANICE PÁSU SE MĚŘÍ NA ŘEZU, NE NA PROGRAMOVANÉM BODU ────────────
  // Dvě věci najednou, obě o tomtéž: kam až sahá OBROBENÁ PLOCHA.
  //
  // 1) DOJEZD. Mřížka vrstev je kotvená na kraji polotovaru, takže na hranici
  //    rozsahu skoro nikdy nesedí — mezi poslední vrstvou a hranicí zůstával
  //    stát neobrobený proužek až `ap` široký (face-cylinder, pás 25…45:
  //    marche končí na Z26, na Z25 stojí polotovar). Přidá se proto vrstva
  //    navíc; poslední tříska je tenčí než `ap`, takže nic nepřetěžuje.
  //
  // 2) ŠÍŘKA DESTIČKY. Řez sahá o rádius nosu PŘED programovaný bod a o tělo
  //    destičky ZA něj (`insertBodyZ`: u upichováku šířka plátku bez rádiusu,
  //    jinak `ap`) — přesně ta stopa, kterou ubírá `toolFootprint`, takže se
  //    plánování drží téhož modelu jako úběr a validátor. Průchod postavený
  //    přesně na hranici by tedy řezal ještě
  //    kus za ní, do sousedního úseku, který je buď hotový, nebo přijde na
  //    řadu s vlastním nastavením. Vrstvy se proto posadí tak, aby na hranici
  //    dosedl ŘEZ: na konci marche jeho čelo, na začátku jeho záď.
  //    Nález uživatele 26. 8. 2026 (upichovák 5 mm, pás od Z311,76): první
  //    průchod na Z308,932 řezal až na Z313,932, tedy 2,17 mm za startem.
  //
  // Obojí se nasadí, jen když pás v dané ose OPRAVDU ukrajuje: na konci když
  // za hranicí leží vrstva, kterou tahle operace nedělá, na začátku když
  // hranice leží uvnitř materiálu (před čelem polotovaru). Pás, který díl celý
  // obsáhne — typicky ten uložený s výkresem — tím pádem nemění nic; na tom
  // stojí stabilita čelních snapshotů (táž logika jako `faceRetractCapZ` níž).
  if (machiningRange && zList.length > 0) {
    const rNose = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05);
    const lead = rNose;                                 // řez před programovaným bodem
    const trail = Math.max(rNose, insertBodyZ(prms, rNose));   // řez za ním (tělo destičky)
    const bndStart = faceLeft ? machiningRange.zLo : machiningRange.zHi;
    const bndEnd = faceLeft ? machiningRange.zHi : machiningRange.zLo;
    const zStartLim = bndStart + sgnF * trail;   // blíž ke startu pásu už průchod nesmí
    const zEndLim = bndEnd - sgnF * lead;        // dál v marchi už průchod nesmí
    // Kraj polotovaru na straně STARTU marche je `faceEdgeZ` (zleva je to
    // druhý konec dílu, ne `faceStartZ` — na tom se dá snadno seknout).
    const startBites = sgnF * (bndStart - faceEdgeZ) > 1e-6;
    const endClips = zListAll.some(z => sgnF * (z - bndEnd) > 1e-6);
    // Pás užší než stopa destičky se dodržet NEDÁ — řez z něj přeteče tak jako
    // tak. Radši to řekni, než aby uživatel čekal, že hranice platí.
    if (startBites && endClips && (machiningRange.zHi - machiningRange.zLo) < lead + trail - 1e-6)
      foundErrors.push({ type: 'warning', msg: `Rozsah obrábění Z (${machiningRange.zLo}–${machiningRange.zHi} mm) je užší než stopa destičky (${(lead + trail).toFixed(2)} mm) — řez přesáhne za hranici pásu.` });
    const clamped = zList.map(z => {
      if (startBites && sgnF * (z - zStartLim) < 0) z = zStartLim;
      if (endClips && sgnF * (zEndLim - z) < 0) z = zEndLim;
      return z;
    });
    if (endClips) clamped.push(zEndLim);
    // Setřídit ve směru marche (klamp může vrstvu přesunout za sousední)
    // a slít ty, co po posunu splynuly.
    clamped.sort((a, b) => sgnF * (a - b));
    const eps = Math.max(0.02, step * 0.02);
    const out = [];
    for (const z of clamped) if (!out.length || Math.abs(out[out.length - 1] - z) >= eps) out.push(z);
    zList.splice(0, zList.length, ...out);
  }
  // MEZ ODSKOKU NA KRAJI PÁSU. Krajní vrstva odskakuje 45° k obrobené straně,
  // jenže za pásem tahle operace neobrábí — materiál tam stojí v plné výšce
  // a diagonála do něj zajede (změřeno na face-cylinder, pás Z 10…30: odskok
  // na Z32 a navazující výjezd 5,7 mm² skrz polotovar).
  //
  // Mez je KRAJNÍ VRSTVA, ne hranice pásu: mřížka na hranici většinou nesedí,
  // takže mezi poslední vrstvou a hranicí zůstává neobrobený proužek (pás
  // 25…45: vrstvy končí na Z44, na Z45 stojí polotovar — 2,8 mm²). Za krajní
  // vrstvu se odskok nesmí, protože dál nástroj v téhle operaci nebyl.
  //
  // Mez se nasadí JEN když rozsah opravdu ořízl mřížku na obrobené straně.
  // Rozsah, který díl celý obsáhne (typicky uložený s výkresem), tím pádem
  // nic nemění — jinak by se svislým výjezdem přepsal každý čelní snapshot.
  let faceRetractCapZ = null;
  if (machiningRange && zList.length > 0) {
    let edge = zList[0];
    for (const z of zList) edge = faceLeft ? Math.min(edge, z) : Math.max(edge, z);
    const clippedOnCutSide = zListAll.some(z => faceLeft ? z < edge - 1e-6 : z > edge + 1e-6);
    if (clippedOnCutSide) faceRetractCapZ = edge;
  }
  // Marchování začíná na marchStartZ (reference pro clamp leadOutu — zachováno
  // pro L/R symetrii, ale clamp byl odstraněn: první průchod smí také dojíždět
  // po offsetu nahoru, jinak by jeho krok nad ním zůstal neobrobený).
  const marchStartZ = zList.length ? zList[0] : faceStartZ;
  // Otočení trasy kontury (pro jízdu opačným směrem): obrátí pořadí, koncové
  // body i směr oblouku.
  const reverseTrace = (segs) => segs.slice().reverse().map(s => s.type === 'line'
    ? { type: 'line', x1: s.x2, z1: s.z2, x2: s.x1, z2: s.z1 }
    : { type: 'arc', cx: s.cx, cz: s.cz, r: s.r, dir: s.dir === 'G2' ? 'G3' : 'G2', startAngle: s.endAngle, endAngle: s.startAngle, x1: s.x2, z1: s.z2, x2: s.x1, z2: s.z1 });

  // NORMÁLNÍ CÍL průchodu na daném Z = největší průsečík offsetové kontury pod
  // mezí dotyku nosu (táž volba jako v hlavní smyčce níž). null = kontura tam
  // svislici neprotíná.
  const contourTargetAt = (z) => {
    const xs = [];
    for (const os of offsetPath) {
      if (os.isDegenerate) continue;
      if (os.type === 'line') {
        const x = intersectVerticalLineSegment(z, os.p1, os.p2);
        if (x !== null) xs.push(x);
      } else if (os.type === 'arc') {
        for (const x of intersectVerticalLineArc(z, { x: os.cx, z: os.cz }, os.r)) {
          const a = Math.atan2(x - os.cx, z - os.cz);
          if (isAngleBetween(a, os.startAngle, os.endAngle, os.dir === 'G2')) xs.push(x);
        }
      }
    }
    const valid = xs.filter(x => x < xTouchAt(z) + 1).sort((a, b) => a - b);
    return valid.length > 0 ? valid[valid.length - 1] : null;
  };

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
      else if (currentZ < minOZ - 0.01 && minOZx !== null) {
        // ZA LEVÝM KONCEM KONTURY. Kontura tam končí, ale materiál ne —
        // polotovar pokračuje (přídavek na čelo, upínací zbytek) a uživatel
        // má nastavené rozsahy (čelisti / rozsah Z), které říkají, kam se smí.
        // Dřív se tahle zóna přeskakovala úplně, takže úplně vlevo zůstávaly
        // poslední vrstvy neobrobené (nález uživatele: „chybí dvě vrstvy").
        // Hloubka = POSLEDNÍ PRŮMĚR kontury: pahýl zůstane stejně silný jako
        // díl. K ose se tu nejede — tím by se obrobek uřízl.
        xEnd = minOZx;
        xEndBlocked = true;
      } else continue;
    }
    // ── Rozsah obrábění X (📐) ────────────────────────────────────────
    // Řezná osa čelního průchodu je X, takže rozsah tady ořezává HLOUBKU:
    // pod dolní mez se nejede, `xEnd` se zvedne na `xLo`. Zvednutí `xEnd` je
    // táž operace, jakou dělá hlídání držáku i destičky níž, takže se s nimi
    // skládá bez pořadové závislosti.
    //
    // HORNÍ MEZ SE ČELNĚ VYNUTIT NEDÁ a nepokoušíme se o to. Podélně jde
    // hloubku prostě přeskočit (řez jede v konstantním X), čelně ne — řez jde
    // RADIÁLNĚ od povrchu, takže materiál nad horní mezí nástroj projede tak
    // jako tak. Zkoušeno a ZAMÍTNUTO: vynechat vrstvy, jejichž řez celý leží
    // nad pásem (`xEnd >= xHi`), nechá uprostřed dílu stát neobrobené plátky
    // a nos je při nájezdu ořízne — na part-18 (R8) přesně 11,8 mm² kolize
    // rychloposuvu na `N2810 G0 X46.450`, kde bez toho byla nula.
    let rangeXClamped = false;
    if (machiningRangeX && xEnd < machiningRangeX.xLo - 1e-9) {
      xEnd = machiningRangeX.xLo;
      xEndBlocked = true;
      rangeXClamped = true;
    }
    const xStartLocal = rapidStartXAt(currentZ, xSurface, faceLeft ? 1 : -1);
    if (xEnd >= xTouch - 0.01) continue;   // nos se polotovaru nedotkne = řez vzduchem
    const pass = { type: 'face', z: currentZ, xStart: xStartLocal, xSurface, xEnd, blocked: xEndBlocked };
    if (faceLeft) pass.faceLeft = true;
    if (faceRetractCapZ !== null) pass.retractCapZ = faceRetractCapZ;
    passes.push(pass);
    // Dojezd „bez schodků" jde po KONTUŘE, a ta leží pod dolní mezí rozsahu X —
    // u zkráceného průchodu by tedy sjel přesně tam, kam se nesmí. Vynechat.
    if (prms.noStepRoughing && prms.noStepRoughingFace && xEndBlocked && !rangeXClamped) {
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

  // Hlídání geometrie DESTIČKY (čelně) — viz ops/face/insertGuard.js.
  guardInsertFace({
    prms, ins, passes, foundErrors, faceLeft, step, offsetXAt, xTouchAt });
  // Hloubka vrstev (nikdy hloub než předchozí) — viz ops/face/layerDepth.js.
  const enforceLayerDepth = makeEnforceLayerDepth({
    prms, ins, passes, foundErrors, faceLeft, step, zList, xTouchAt,
    castingOuterAtZ, castingOuterOrNull, faceOffsetOut });
  // Doběh na konci úseku — viz ops/face/regionRunOut.js.
  const appendRegionRunOut = makeRegionRunOut({
    prms, ins, passes, faceLeft, step, zList, xTouchAt, castingOuterAtZ,
    faceOffsetOut, faceRunOut, clrXFC, rTipFC, contourTargetAt,
    rapidStartXAt, enforceLayerDepth });
  // Hlídání DRŽÁKU (čelně) — viz ops/face/holderGuard.js.
  const holderGuardFace = makeHolderGuardFace({
    prms, passes, foundErrors, faceLeft, step, zListAll, xTouchAt,
    offsetXAt, castingOuterOrNull, clrXFC, planLoopFC, enforceLayerDepth });
  const runOutAdded = appendRegionRunOut();
  if (runOutAdded > 0) foundErrors.push({ type: 'warning', msg: `Doběh na konci úseku: ${runOutAdded} průchodů přidáno, aby na koncích úseků nezůstal schodek.` });
  holderGuardFace(true);
  enforceLayerDepth();

  // ── Dojezd se zastaví v ROHU (kde zahne do stěny rovnoběžné s osou) ──
  // Dojezd „bez schodků“ sleduje konturu k obrobené straně, aby sloupl schod
  // po předchozím průchodu. Jak ale kontura zahne do stěny ROVNOBĚŽNÉ S OSOU
  // (úsek s konstantním X, pohyb jen v Z), schod tam už žádný není — ten kus
  // už obrobil průchod v tom Z sám a nůž po něm jen tře bokem nosu. Dojezd se
  // proto v tom rohu utne (nález uživatele 19. 8. 2026).
  {
    let cornerTrim = 0;
    for (const p of passes) {
      if (p.type !== 'face' || !p.contourLeadOut) continue;
      const at = p.contourLeadOut.findIndex(sg => sg.type === 'line'
        && Math.abs(sg.x2 - sg.x1) < 0.01 && Math.abs(sg.z2 - sg.z1) > 0.01);
      // Jen ROH, tedy osový úsek AŽ ZA sloupnutím schodu. Dojezd, který je
      // osový už od začátku, je jiný případ: tam žádný schod není sloupnutý
      // a běh po plášti materiál ODEBÍRÁ (změřeno modelem úběru: zahození
      // všech = +75 mm² zbytku na part-16, včetně vyhozeného výjezdu po kuželu,
      // který na osový úsek na Z233,932 navazuje).
      if (at < 1) continue;
      const keep = p.contourLeadOut.slice(0, at);
      // NEUTÍNAT PŘESNĚ V ROHU — nechá se PŘESAH 0,4 mm. Není to obráběcí
      // pravidlo, ale numerická rezerva pro dynamický model polotovaru
      // (`rapidStock` v gcodeEmit): když dráha skončí přesně na rohu offsetu,
      // stopy sousedních průchodů se jen DOTKNOU a v modelu zůstane JEHLA —
      // na part-16 vyskakuje zbytek na Z243,5 z 10,41 na 16,17 mm (sousedí
      // 11,06 a 9,67) a `finDeepCut` na ni zahodí CELÝ dokončovací úsek po
      // kuželu: 19 mm² neobrobeného a falešné ⚠. 0,4 mm = krok vzorkování
      // obálky (`samplePartingEnvelope`); náhodných 0,226 mm před opravou (b)
      // stačilo, takže je to rezerva s margínem, ne těsná hodnota. Rádius nosu
      // se na to NEHODÍ: u kulaté destičky R8 by přesah spolkl celý osový úsek
      // a ořez by na part-18 nikdy nenastal.
      const sg = p.contourLeadOut[at];
      const dz = Math.sign(sg.z2 - sg.z1) * Math.min(Math.abs(sg.z2 - sg.z1), 0.4);
      if (Math.abs(dz) > 0.05) keep.push({ ...sg, x2: sg.x1, z2: sg.z1 + dz });
      p.contourLeadOut = keep;
      cornerTrim++;
    }
    if (cornerTrim > 0)
      foundErrors.push({ type: 'warning', msg: `Dojezd bez schodků: ${cornerTrim} dojezdů zastaveno v rohu — dál kontura běží rovnoběžně s osou, kde žádný schod není a nůž by jen třel.` });
  }

  // ── Dojezd na VLASTNÍM kuželu destičky je zbytečný ──
  // Dojezd „bez schodků" sleduje konturu k obrobené straně, aby sloupl schod.
  // Kde ale kontura stoupá přesně pod úhlem natočení destičky, žádný schod
  // není: spodní hrana ten tvar udělala už samotným řezem, takže dojezd jen
  // tře po hotovém povrchu a nic neubere (nález uživatele 19. 8. 2026 —
  // „samotné nastavení úhlu plátku udělá spodní stranou požadovaný tvar").
  // Dojezd se proto zahodí, jen když je CELÝ na tomhle kuželu; jakmile v něm
  // je oblouk nebo úsek s jiným sklonem, schod tam zůstává a dojezd jede.
  if (prms.respectInsertGeometry && ins.hasFlankGeometry) {
    const phiL = -(parseFloat(prms.toolAngle) || 0);
    if (phiL > 0.01) {
      const tanL = Math.tan(Math.min(89.5, phiL) * Math.PI / 180);
      let idleLead = 0;
      for (const p of passes) {
        if (p.type !== 'face' || !p.contourLeadOut) continue;
        // Znaménko rozhoduje: kužel po destičce KLESÁ ve směru jízdy dojezdu
        // (x ubývá o tan φ). Úsek, který naopak stoupá, je schod, který hrana
        // NEUDĚLALA — ten se dojet musí, takže `Math.abs` na sklonu by byl
        // tichý omyl.
        const onCone = p.contourLeadOut.every(sg => sg.type === 'line'
          && Math.abs(sg.z2 - sg.z1) > 1e-9
          && Math.abs((sg.x2 - sg.x1) / Math.abs(sg.z2 - sg.z1) + tanL) < 0.01);
        if (onCone) { delete p.contourLeadOut; idleLead++; }
      }
      if (idleLead > 0)
        foundErrors.push({ type: 'warning', msg: `Dojezd bez schodků: ${idleLead} dojezdů vynecháno — kontura tam stoupá pod úhlem natočení destičky (${phiL.toFixed(0)}°), takže schod nevzniká a dojezd by jen třel po hotovém povrchu.` });
    }
  }
}

// PODÉLNÉ HRUBOVÁNÍ (RIGHT → LEFT, standardní soustružení).

// ČELNÍ HRUBOVÁNÍ (osa X od povrchu k ose/kontuře) — generátor průchodů.

import { getInsert } from '../inserts/index.js';
import { topXOnLoop, rapidFeedGap, quantizeUp, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc, samplePartingEnvelope, fitArcsToPolyline, stockClearances, stockClearanceIsZero } from '../camMath.js';
import { offsetStockLoop, stockPlanLoop, insertBodyZ, toolFootprint } from '../materialRemoval.js';
import { HOLDER_CLAMP_MARGIN, holderBottomProfile, insertReachZ } from '../toolEnvelope.js';
import { SKIM_MIN_LAYER } from './shared.js';

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
  if (prms.respectInsertGeometry && ins.hasFlankGeometry) {
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
  if (ins.cutsFullWidth) {
    const wIns = ins.widthZ;
    const rIns = ins.cornerR;
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
          // Zlomy předlohy: `lo` přišlo z `traceOffsetPath`, takže jeho konce
          // úseků JSOU zlomy offsetu. Bez nich mrížka 0,4 mm rovnou úsečku čela
          // překryla tětivou a dráha z offsetu vyjela (viz samplePartingEnvelope).
          const brkZ = [];
          for (const sg of lo || []) { brkZ.push(sg.z1); brkZ.push(sg.z2); }
          const pts = samplePartingEnvelope(offsetXAt, p.z, zEnd, w2R, dirM, 0.4, 0.003, brkZ);
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
    if (!(prms.respectInsertGeometry && ins.hasFlankGeometry)) return;
    const phiDeg = -(parseFloat(prms.toolAngle) || 0);
    const reachM = insertReachZ(prms, faceLeft);
    if (phiDeg > 0.01 && reachM > 1e-6) {
      const tanM = Math.tan(Math.min(89.5, phiDeg) * Math.PI / 180);
      const AXIS_NO_MAT = 0.5;   // dno u osy = vzduch, ne stěna
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
          // Materiál na neobrobeném pásu = POVRCH polotovaru. `xTouchAt` je
          // mez pro STŘED nosu (o rádius výš) — jako „stěna" by nafoukla
          // požadavek o rádius a série pak padala jedna za druhou.
          const raw = castingOuterAtZ(zGrid);
          if (Number.isFinite(raw)) {
            done.push({ z: zGrid, x: raw, raw: true });
            while (done.length > 0 && Math.abs(zGrid - done[0].z) > reachM + step) done.shift();
          }
          continue;
        }
        let need = -Infinity;
        for (const q of done) {
          // OSA NENÍ MATERIÁL. Když předchozí vrstva dojela až k ose, za
          // destičkou nic nezbylo a není co hlídat — další vrstva smí taky
          // až na X0. Bez tohohle si pravidlo vyrobilo schodiště i tam, kde
          // se čelo obrábí naplno (nález uživatele: průchody na Ø21,8
          // končily 0,8 / 1,6 / 2,4 … místo X0).
          if (q.x < AXIS_NO_MAT) continue;
          if (q.raw) {
            // SYROVÝ pás — dvě opravy proti dřívějšku (nález uživatele
            // 19. 8. 2026, pás Z 150–197 u čela příruby):
            //  (a) vzorkuje se po CELÉ šířce kroku, ne jen v mřížkovém Z:
            //      krok 3 mm mine dosah břitu (8,68 mm u b10/−15°) a zadní
            //      hrana pak plavala 0,7 mm POD povrchem polotovaru;
            //  (b) mezí je OFFSETOVÁ ČÁRA polotovaru, ne holý povrch —
            //      programovaný bod je střed nosu, takže tělo destičky
            //      leží o offset níž. („aby pravá strana plátku nezajížděla
            //      pod offsetovou čáru od polotovaru")
            for (let t = -0.5; t <= 0.5001; t += 0.25) {
              const zq = q.z + t * step;
              const dz = Math.abs(p.z - zq);
              if (dz > reachM + 1e-6) continue;
              const sf = castingOuterOrNull(zq);
              if (sf === null || sf < AXIS_NO_MAT) continue;
              const cand = sf + faceOffsetOut + dz * tanM;
              if (cand > need) need = cand;
            }
            continue;
          }
          const dz = Math.abs(p.z - q.z);
          if (dz > reachM + 1e-6) continue;
          const cand = q.x + dz * tanM;
          if (cand > need) need = cand;
        }
        if (need > p.xEnd + 0.01) {
          // Zvednutí nad mez dotyku = průchod by jel vzduchem → vynechat
          // (týž rozdíl „zkráceno × vynecháno" jako u ostatních hlídání).
          if (!p.runOut && (need >= p.xStart - 0.05 || need >= xTouchAt(p.z) - 0.01)) {
            dropM.add(p);
            droppedM++;
            // Vynechaný pás zůstává neobrobený — pro další vrstvy je to
            // materiál v úrovni povrchu, ne vzduch.
            done.push({ z: p.z, x: castingOuterAtZ(p.z), raw: true });
            continue;
          }
          p.xEnd = need;
          raisedM++;
          // Dojezd byl spočítaný pro hlubší dno — po zvednutí by šel pod mez.
          if (p.contourLeadOut) delete p.contourLeadOut;
        }
        // Doběh na HRANĚ MATERIÁLU řeže (nos je v materiálu) → platí jeho `xEnd`.
        // Doběh NAD POVRCHEM na svém Z nic neubral (konec leží na kuželu
        // předchozího průchodu, tedy nad povrchem; sloupl jen hřebínek na
        // obrobené straně) → pod ním stojí materiál v úrovni POVRCHU. Zapsat
        // tam `xEnd` by udělalo falešnou stěnu, která srazí začátek dalšího
        // úseku (změřeno: úsek od Z29,932 celý vypadl).
        const runOutAir = p.runOut && p.xEnd >= xTouchAt(p.z) - 0.01;
        // Dojezd „bez schodků" jede po kontuře k OBROBENÉ straně — platí pro
        // něj totéž pravidlo jako pro konec řezu: nesmí pod kužel spodní hrany
        // destičky. Bez toho sjede pod předchozí vrstvu (nález uživatele
        // 19. 8. 2026: „ta poslední dráha je níže než ta předchozí" — dojezd
        // šel na X21,62, kužel z předchozích vrstev je přitom na X22,32).
        // Ořezává se stejně jako u držáku: úsečka se USEKNE v místě průsečíku.
        if (p.contourLeadOut) {
          const coneAt = (z) => {
            let need = -Infinity;
            for (const q of done) {
              if (q.x < AXIS_NO_MAT) continue;
              const dz = Math.abs(z - q.z);
              if (dz > reachM + 1e-6) continue;
              let cand;
              if (q.raw) {
                const sf = castingOuterOrNull(q.z);
                if (sf === null || sf < AXIS_NO_MAT) continue;
                cand = sf + faceOffsetOut + dz * tanM;
              } else cand = q.x + dz * tanM;
              if (cand > need) need = cand;
            }
            return need;
          };
          const keepL = [];
          for (const sg of p.contourLeadOut) {
            if (sg.x2 + 1e-9 >= coneAt(sg.z2)) { keepL.push(sg); continue; }
            if (sg.type !== 'line') break;
            let tOk = 0;
            const N = Math.max(20, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) / 0.05));
            for (let k = 1; k <= N; k++) {
              const t = k / N;
              const x = sg.x1 + (sg.x2 - sg.x1) * t, z = sg.z1 + (sg.z2 - sg.z1) * t;
              if (x + 1e-9 < coneAt(z)) break;
              tOk = t;
            }
            if (tOk > 1e-6) keepL.push({ ...sg, x2: sg.x1 + (sg.x2 - sg.x1) * tOk, z2: sg.z1 + (sg.z2 - sg.z1) * tOk });
            break;
          }
          if (keepL.length > 0) p.contourLeadOut = keepL; else delete p.contourLeadOut;
        }
        done.push(runOutAir ? { z: p.z, x: castingOuterAtZ(p.z), raw: true } : { z: p.z, x: p.xEnd });
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

  // ── Doběh na KONCI ÚSEKU (natočená destička nebo upichovák) ──
  // Poslední průchod úseku dosedne na kužel spodní hrany. Hned za ním materiál
  // pokračuje (stěna, čelo příruby), ale NOS už je nad povrchem, takže se další
  // vrstva zahodí jako „řez vzduchem" — jenže řeže HRANA za nosem a ta by ten
  // schodek ještě sebrala (nález uživatele 19. 8. 2026: „tady mi to nedojíždí
  // a chtělo by to ještě jednu vrstvu", N3450 a N2820).
  // Přidá se PRÁVĚ JEDNA vrstva na konec každého úseku, o `krok·tan φ` MĚLČEJI
  // než předchozí — pravidlo „nikdy hlouběji než předchozí vrstva" tím platí
  // z definice. Druhá vrstva už ne: ta by jela vzduchem.
  const appendRegionRunOut = () => {
    if (faceRunOut <= 0) return;
    // `Math.max(0, …)`: kladný `toolAngle` (a u upichováku nula) by dal ZÁPORNÝ
    // tangens, tedy vrstvu HLOUBĚJI — to je pravidlo „nikdy hlouběji“ naruby.
    const tanR = Math.tan(Math.max(0, Math.min(89.5, -(parseFloat(prms.toolAngle) || 0))) * Math.PI / 180);
    const insReachRO = insertReachZ(prms, faceLeft);
    const byZ = new Map(passes.filter(p => p.type === 'face').map(p => [p.z.toFixed(3), p]));
    const add = [];
    // Mřížka je tu ta OŘEZANÁ rozsahem (`zList`, ne `zListAll`): doběh přidává
    // vrstvu ZA poslední průchod úseku, takže s celou mřížkou by na hranici
    // rozsahu 📐 vyrobil vrstvu mimo pás. Konec pásu tím doběh nedostane —
    // stejně jako ho nedostává konec marche (smyčka končí na předposledním).
    for (let i = 0; i < zList.length - 1; i++) {
      const p = byZ.get(zList[i].toFixed(3));
      if (!p || p.runOut) continue;                       // řetězit doběh na doběh ne
      if (byZ.has(zList[i + 1].toFixed(3))) continue;     // úsek pokračuje sám
      if (p.xEnd >= xTouchAt(p.z) - 0.01) continue;       // předchozí sám nic neubral
      const dirRO = Math.sign(zList[i + 1] - zList[i]);   // směr marche, ne k obrobené straně
      // AP SE MUSÍ DODRŽET. Krok doběhu se skladá z hrany materiálu a ještě
      // `faceOffsetOut` — součet může ap překročit a vrstva pak bere víc, než
      // plátek na jeden záběr unese (nález uživatele 20. 8. 2026: Z197,932 na
      // Z193,982 = 3,95 mm při ap 3). Krok se proto vždy utíná na ap — bez
      // ohledu na to, jak se hrana našla.
      const clampAp = (zq) => zList[i] + dirRO * Math.min(Math.abs(zq - zList[i]), step);
      let edgeZ = null;
      let z = zList[i + 1];
      let xEnd = p.xEnd + Math.abs(z - zList[i]) * tanR;
      // DRUHÁ STRANA DESTIČKY NESMÍ DO POLOTOVARU JAKO PRVNÍ.
      // V doběhu je nos nad povrchem a řeže HRANA za ním — ta ale dosáhne jen
      // `délka břitu · tan φ` pod nos. Když konec řezu leží nad povrchem víc,
      // destička už nad materiálem VISÍ a jako první se ho dotkne to, co je za
      // ní (druhá strana plátku, držák) — takový průchod se vynechá.
      // (Uživatel 19. 8. 2026: „aby strana co je na druhé straně než je rádius
      // nezajížděla do polotovaru jako první — ta dráha se má vynechat.")
      // Změřeno na čele příruby: konec řezu X62,06 nad povrchem X16,74 = 45 mm
      // nad materiálem → validátor tam hlásil kolizi držáku i rychloposuvu.
      if (xEnd - castingOuterAtZ(z) > insReachRO * tanR + 0.01) {
        // Nad MŘÍŽKOVÝM Z už destička nad materiálem visí. Materiál ale nemusí
        // končit na mřížce: mezi posledním průchodem a hranou materiálu (čelo
        // příruby končí na Z196,278, poslední vrstva sedí na Z197,932) zůstane
        // proužek, na který nos ještě dosáhne. Poslední vrstva se proto posadí
        // na HRANU MATERIÁLU, ne na mřížku. (Uživatel 19. 8. 2026: „je tam
        // kousek nedojetý … měl by dodělat až za tu offsetovou čáru co je
        // zleva.") Krok 0,05 mm je pod přesností, na kterou se cokoli emituje.
        let edge = null;
        const span = Math.abs(zList[i + 1] - zList[i]);
        for (let t = 0.05; t <= span + 1e-9; t += 0.05) {
          const zq = zList[i] + dirRO * t;
          if (castingOuterAtZ(zq) <= p.xEnd + t * tanR + 0.01) break;   // materiál skončil
          edge = zq;
        }
        if (edge === null) continue;
        // Kam vrstvu posadit: co NEJDÁL za hranu materiálu, ale ne tak daleko,
        // aby mezi ní a předchozím průchodem vznikla mezera — nos je kruh
        // rádiusu R, takže sousední průchody se překrývají jen do vzdálenosti
        // 2R. Dál už by proužek jen podjel a zůstal by tam celý (změřeno:
        // posazení nosu STŘEDEM až na offsetovou čáru = 3 kolize destičky
        // i rychloposuvu, o 0,5 mm blíž ještě 1; tohle je poslední čisté).
        const zc = clampAp(zList[i] + dirRO * Math.min(2 * rTipFC, Math.abs(edge - zList[i]) + rTipFC));
        if (Math.abs(zc - zList[i]) < 0.1) continue;   // nos to pokryl už sám
        z = zc; xEnd = p.xEnd + Math.abs(zc - zList[i]) * tanR; edgeZ = edge;
      }
      // ŠÍŘKA ZÁBĚRU V Z. Programovaný bod je vedení břitu na straně, kde se
      // řeže; tělo nástroje se táhne k obrobené straně. U UPICHOVÁKU řeže celá
      // šířka plátku, u nosu (kulatá / natočená destička) jen jeho stopa ≈ 2R.
      const insCover = ins.faceCoverZ(rTipFC);
      // Povrch pod CELÝM záběrem, ne jen na programovaném Z. Široký plátek se
      // opre o to nejvyšší, co pod ním stojí — u čela příruby je na
      // programovaném Z povrch 16,7 (za schodem), ale plátek svým tělem leží
      // nad velkým čelem s povrchem 64,4. Bez toho vyšel nájezd jen 1 mm nad
      // koncem řezu (`G0 X47.376` → `G1 X46.376`) a přejezd v Z se vedl POD
      // offsetovou čarou — uživatel 20. 8. 2026: „zanořování udělej jako ten
      // levý konec, jede to tam nahoru".
      const surfaceUnderInsert = (zq) => {
        let m = castingOuterAtZ(zq);
        const n = Math.max(1, Math.ceil(insCover / 0.4));
        for (let k = 1; k <= n; k++) {
          const v = castingOuterAtZ(zq - dirRO * insCover * (k / n));
          if (v > m) m = v;
        }
        return m;
      };
      // JEDNA VRSTVA MÍSTO DVOU, když na to šířka záběru stačí. Konec úseku
      // potřebuje dvě věci: odříznout proužek na HRANĚ materiálu a sjet po
      // OFFSETOVÉ ČÁŘE (mez, kam až může sahat skutečný odlitek). Nos je na to
      // moc úzký (2R = 1,6 mm) a musí to udělat na dvakrát — změřeno na
      // part-19: vynechání prostřední vrstvy tam nechalo celý prstenec 3,7 mm
      // + 3 kolize. Upichovák šírky 5 mm ale obojí zvládne najednou
      // (uživatel 20. 8. 2026: „udělej to jako ten levý konec, vezme to
      // najednou když to jde" — ty dvě vrstvy jsou od sebe 2,95 mm).
      // Sloučit smí jen UPICHOVÁK: u něj řeže celá šířka plátku a je to
      // změřené. U nosu je `insCover` jen šířka pro vzorkování povrchu —
      // slíbit podle něj sloučení by u kulaté R8 dalo 16 mm záběru, což nikdo
      // nezměřil (a stopa nosu v hloubče ap je mnohem užší než 2R).
      // NORMÁLNÍ CÍL, když destička netvoří kužel (upichovák, natočení 0 stupňů).
      // Doběh dostával hloubku PŘEDCHOZÍ vrstvy — a předchozí vrstvy přitom
      // klesaly, protoze je tak hluboko pustil DRŽÁK. Doběh se tak jako jediný
      // nezanořoval dál, i když by směl (nález uživatele 20. 8. 2026). Dostane
      // proto týž cíl jako každý jiný průchod a hloubku mu určí hlídání držáku,
      // které běží ZA ním. U NATOČENÉ destičky se nemění nic: tam hloubku dává
      // kužel spodní hrany (`tanR`) a pravidlo nikdy hlouběji je tabu.
      if (tanR < 1e-9) {
        const tgt = contourTargetAt(z);
        if (tgt !== null && tgt < xEnd) xEnd = tgt;
      }
      const zFar = edgeZ !== null ? clampAp(edgeZ + dirRO * faceOffsetOut) : null;
      const mergeOne = zFar !== null && ins.cutsFullWidth
        && Math.abs(zFar - zList[i]) <= insCover + 0.01;
      if (!mergeOne) {
        const xSurface = surfaceUnderInsert(z);
        // NÁJEZD se počítá z PŘEDCHOZÍ hloubky, ne z nového (hlubšího) cíle:
        // `xStart` je odkud se přijíždí a hlídání držáku podle něj rozhoduje
        // zvednout, nebo vynechat (`need >= p.xStart`). Když se počítal z cíle
        // kontury, spadl až k němu a průchod se tím celý VYNECHAL (změřeno).
        const xStart = Math.max(rapidStartXAt(z, xSurface, faceLeft ? 1 : -1), p.xEnd + clrXFC);
        const np = { type: 'face', z, xStart, xSurface, xEnd, blocked: true, runOut: true };
        if (faceLeft) np.faceLeft = true;
        add.push({ after: p, pass: np });
      }
      // Za hranou materiálu je PRÁZDNO, takže tam střed nosu ještě smí sjet po
      // OFFSETOVÉ ČÁŘE polotovaru. Není to řez naprázdno: offsetová čára je
      // mez, kam až může sahat SKUTEČNÝ odlitek (nadměrný kus se přes ni
      // „nafoukne"), takže na jmenovitém kuse neubere nic a na větším ano.
      // U úZKÉHO nosu musí jít AŽ ZA průchod na hraně materiálu — ten proužek
      // napřed odřízne; při jízdě rovnou sem jel držák nad syrovým (3 kolize).
      if (zFar !== null) {
        const zf = zFar;
        // Bez kuželu platí NORMÁLNÍ CÍL — dopočítávat ho znovu z `p.xEnd` by ho
        // zahodilo a doběh by zůstal v hloubce předchozí vrstvy.
        let xf = tanR < 1e-9 ? xEnd : p.xEnd + Math.abs(zf - zList[i]) * tanR;
        if (tanR < 1e-9) {
          const tgtF = contourTargetAt(zf);
          if (tgtF !== null && tgtF < xf) xf = tgtF;
        }
        const sf = surfaceUnderInsert(zf);
        const pf = { type: 'face', z: zf, xEnd: xf, xSurface: sf, blocked: true, runOut: true,
          xStart: Math.max(rapidStartXAt(zf, sf, faceLeft ? 1 : -1), p.xEnd + clrXFC) };
        if (faceLeft) pf.faceLeft = true;
        add.push({ after: p, pass: pf });
      }
    }
    for (let k = add.length - 1; k >= 0; k--) {
      const at = passes.indexOf(add[k].after);
      if (at >= 0) passes.splice(at + 1, 0, add[k].pass);
    }
    return add.length;
  };

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
  // Volá se DVAKRÁT (před doběhem úseků i za ním, viz níž). `report` říká, jestli
  // se mají vypsat varování — jen z posledního volání, jinak by se pushla dvakrát.
  // Opakování je bezpečné ze stejného důvodu jako u `enforceLayerDepth()`: clamp
  // hloubku jen ZVEDÁ (`need > p.xEnd`), takže se střídavým voláním nerozhoupou.
  // Počítadla jsou MIMO funkci: druhé volání už obvykle nemá co zvedat (clamp je
  // idempotentní), takže s počítadly vevnitř by varování „Materiál pod mezí obrobte
  // jinou strategií“ z prvního volání zmizelo úplně (změřeno: 30 zkrácených,
  // 16 vynechaných průchodů uživateli přestalo hlásit ⚠).
  let holderAdjusted = 0, holderDropped = 0, holderTrimmed = 0;
  const holderGuardFace = (report) => {
    if (!prms.respectInsertGeometry || globalThis.__DISABLE_HOLDER_CLAMP__) return;
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
          // SYROVÝ pás se měří na OFFSETOVÉ ČÁŘE, ne na povrchu: přídavek X/Z
          // (polo.) je v zadání právě proto, že odlitek MŮŽE být až u té čáry.
          // Bez toho držák „projde“ 0,1 mm nad syrovým povrchem a přitom je
          // 1 mm v pásu — nález uživatele 20. 8. 2026 na dojezdu prvního
          // průchodu nového úseku (`N3530 G1 X18.043 Z175.932`: spodek držáku
          // X16,85 proti povrchu 16,743, ale offsetová čára je 17,74).
          // HOTOVÉ dno průchodu zůstává svým `x` — to je skutečný povrch,
          // žádný přídavek tam nepatří (táž dělba jako u `enforceLayerDepth`).
          //
          // Čte se PŘÍMO plánovací smyčka, ne „syrový povrch + Vůle X“: to
          // druhé je svislý posun, kdežto offset se posouvá KOLMO k hranici
          // (týž antivzor jako u `rapidStartXAt` výš, viz offsetStockLoop).
          // Před SVISLÝM ČELEM je rozdíl řádový: offsetová čára tam leží
          // o Vůli Z PŘED čelem v celé jeho výšce, takže svislice těsně před
          // přírubou protne plánovací obrys až na jejím vnějším průměru.
          // Změřeno na part-16: v pásu Z 175,93–195,93 sahá plánovací obrys
          // do X(r) 65,3, ale „povrch + Vůle X“ tam vydá 17,74 — držák tudy
          // projel a validátor to hlásil jako 11,9 mm².
          let x;
          if (s.raw) {
            x = planLoopFC ? topXOnLoop(planLoopFC, zq) : null;
            if (x === null) {
              const surf = castingOuterOrNull(zq);
              x = surf === null ? null : surf + clrXFC;
            }
          } else x = s.x;
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
        for (const z of zListAll) {
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
        let clipped = false;
        for (const s of p.contourLeadOut) {
          if (s.x2 + 1e-9 >= minTipX(s.z2)) { keep.push(s); continue; }
          // Úsek mez držáku PROTÍNÁ. Zahodit ho celý znamená zastavit dojezd
          // už na začátku úseku, i když po něm ještě kus volně projede —
          // na strmém čele (jeden úsek přes 23 mm v X) tím zůstal schodek,
          // ačkoli držák brání až dole (nález uživatele 19. 8. 2026: dojezd
          // končil na X39,48, mez držáku je přitom až na X21,60).
          // Úsečka se proto USEKNE v místě, kde mez protne; oblouk se dál
          // řeší celý (ořez oblouku by změnil jeho střed i poloměr).
          if (s.type !== 'line') break;
          let tOk = 0;
          const N = Math.max(20, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.05));
          for (let k = 1; k <= N; k++) {
            const t = k / N;
            const x = s.x1 + (s.x2 - s.x1) * t, z = s.z1 + (s.z2 - s.z1) * t;
            if (x + 1e-9 < minTipX(z)) break;
            tOk = t;
          }
          if (tOk > 1e-6) { keep.push({ ...s, x2: s.x1 + (s.x2 - s.x1) * tOk, z2: s.z1 + (s.z2 - s.z1) * tOk }); clipped = true; }
          break;
        }
        // POZOR: porovnávat jen POČTY nestačí. Když se ořízne poslední úsek a
        // žádný nevypadne, je počet stejný jako předtím — a ořez by se tiše
        // zahodil. Proto vlastní příznak.
        if (!clipped && keep.length === p.contourLeadOut.length) return false;
        if (keep.length > 0) p.contourLeadOut = keep; else delete p.contourLeadOut;
        return true;
      };
      const drop = new Set();
      for (const p of faceArr) {
        const need = minTipXFull(p.z);
        if (need > p.xEnd + 0.01) {
          // Zvednutí NAD mez dotyku nosu je stejné vynechání jako zvednutí nad
          // nájezdovou X — průchod by jen projel vzduchem nad polotovarem
          // (a dojel by tam, kde držák stejně nemá místo). Bez téhle větve
          // zůstal v programu „řez", který nic neodebral, ale kolidoval.
          // `need >= xTouchAt` = na TOMHLE Z už nos na materiál nedosáhne. U DOBĚHU
          // to ale neznamená řez vzduchem: plátek je široký a řeže svou VZDÁLENOU
          // stranou nad materiálem, který stojí dál — právě proto doběh existuje.
          // Lokální mez dotyku by ho zahodila.
          if (need >= p.xStart - 0.05 || (need >= xTouchAt(p.z) - 0.01 && !p.runOut)) {
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
        // Doběh nad povrchem nechává na svém Z syrový povrch (viz výš) — do
        // schodiště držáku patří jako `raw`. Doběh na hraně materiálu ale řeže,
        // ten platí svým dnem; jinak držák nad ním vidí syrový kus a zahodí
        // následující průchod po offsetové čáře.
        const roAir = p.runOut && p.xEnd >= xTouchAt(p.z) - 0.01;
        if (drop.has(p) || roAir) stair.push({ ...entry, raw: true });
        else if (!p.contourLeadOut) stair.push({ ...entry, x: p.xEnd });
      }
      if (drop.size > 0) {
        for (let i = passes.length - 1; i >= 0; i--) if (drop.has(passes[i])) passes.splice(i, 1);
      }
      if (!report) return;
      if (holderAdjusted + holderDropped > 0) {
        foundErrors.push({ type: 'warning', msg: `Hlídání držáku (čelně): ${holderAdjusted} průchodů zkráceno`
          + (holderDropped > 0 ? `, ${holderDropped} vynecháno` : '')
          + ` — hlouběji by držák (šířka ${hb.reach.toFixed(0)} mm) narazil do materiálu na obrobené straně. Materiál pod mezí obrobte jinou strategií (podélně / zleva) nebo štíhlejším nožem.` });
      } else if (holderTrimmed > 0) {
        foundErrors.push({ type: 'warning', msg: `Hlídání držáku (čelně): ${holderTrimmed} dojezdů zkráceno, aby držák nenarazil do stoupající kontury.` });
      }
    }
  };
  // POŘADÍ: hlídání držáku MUSÍ běžet UŽ PŘED doběhem. Doběh se rozhoduje podle
  // toho, jestli na dalším Z ještě průchod JE („úsek pokračuje sám“) — a právě ty
  // průchody držák zahazuje. Když běžel doběh první, viděl konce úseků o vrstvu
  // (i o několik) dál, než kam se reálně dojede, a na ty skutečné konce se pak už
  // nikdo nevrátil (nález uživatele 19. 8. 2026 s upichovákem: tři nedojeté konce —
  // čelo příruby, konec úseku, levý konec). U natočené destičky to vycházelo
  // náhodou: `enforceLayerDepth()` (polygon-only) ty průchody zahodilo dřív, takže
  // doběh viděl správný konec úseku; u upichováku hloubka vrstev neběží vůbec.
  // Druhé volání není kosmetika: průchod přidaný ZA držákem bez jeho kontroly jsou
  // změřené 3 kolize (rapid@X66,2 Z195,0; holder@X62,0 Z195,0; rapid@X64,0
  // Z197,0), takže přidané průchody musí jít držákem zkontrolovat ještě jednou.
  holderGuardFace(false);
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

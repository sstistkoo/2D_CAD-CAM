// ╔═══════════════════════════════╗
// ║  OPERACE: EMISE HRUBOVÁNÍ           ║
// ╚═══════════════════════════════╝
// Vyňato z `cam/gcodeEmit.js` (rozdělení podle OPERACÍ, plán §3.A).
// Projde `calc.passes` a vydá z nich G-kód; končí odjezdem na bezpečnou
// polohu. Dokončování (`ops/finishEmit.js`) na to navazuje.
//
// PROČ JEDEN PARAMETR `E`: stejný důvod jako u `finishEmit`. Emise je jedna
// souvislá procedura nad sdíleným prostředím — poloha nástroje (`cur`),
// číslování bloků, DVA modely materiálu (`rapidStock` = skutečný zbytek,
// plánovací obrys) a jejich dotazy. Rozepsat to na čtyřicet parametrů by tu
// vazbu jen zamaskovalo; `E` ji přiznává.
//
// VRACÍ dvě hodnoty, které musí přetéct do dokončování:
//   • `simCounter`          — číslování simulačních bodů pokračuje,
//   • `holderShallowBodies` — počítadlo pro závěrečnou poznámku.
// Všechno ostatní se mutuje na místě (`cur` je objekt, modely materiálu taky).

import { segmentHitsPath } from '../contourBuild.js';

/**
 * @param E  sdílené emisní prostředí z `generateAutoGCode()`
 * @returns  { simCounter, holderShallowBodies }
 */
export function emitRoughing(E) {
  const {
    S, calc, prms, addCmt, addN, note, arcR, flipArc, xDia,
    cur, setPos, clipZGc, clipFaceRetractZ, safeRapidTo,
    emitDescendX, emitBodyX, emitLiftX, emitLeadOutLine, airSplitAxial,
    offsetExitZ, gcOffsetXAt, planTopXAtZ, travelTopXAtZ, trimLeadOutToStock,
    rapidStock, rapidBlockers, rapidHitsStock, rapidHitsPlan, rapidTopX,
    rapidStopX, rapidStopZ, rapidClrZGc,
    holderHitsStock, holderPlanAreaAt,
    noteCutMove, noteCutArc, noteCutPass,
    entryAngleDegGc, entryRadGc, stepGc, tipRGc, rDist, rDistZ,
  } = E;
  let simCounter = E.simCounter;
  let holderShallowBodies = E.holderShallowBodies;
calc.passes.forEach((pass, i) => {
  addCmt(`Průchod ${i + 1}${pass.pocketClean ? ' (kapsa bez schodků)' : pass.pocketReposition ? ' (zanoření v kapse)' : pass.ramp ? ' (oblouk G3)' : pass.contourLeadIn ? ' (kapsa po kontuře)' : pass.contourLeadOut ? ' (bez schodků)' : ''}`);
  // Směr řezu v ose Z: −1 = standard (zprava doleva), +1 = druhá strana
  // (zleva doprava, `backside`). Nájezd před řez a odskok po řezu jdou
  // vždy PROTI směru řezu (−zDir), dojezd „do vzduchu" za koncem po směru.
  const zDir = pass.backside ? 1 : -1;
  if (pass.type === 'long' && (pass.contourLeadIn || pass.ramp || pass.pocketClean)) {
    // Kapsa za bossem kontury: namísto odskoku a rychloposuvu přes
    // vršek polotovaru se kopíruje samotná kontura (G1/G2/G3) až k
    // bodu, kde její sklon dosáhne úhlu zanoření, odtud rampa pod
    // tímto úhlem na aktuální zaběr, dno kapsy a odskok.
    const li = pass.contourLeadIn || [];
    const entry = li.length > 0
      ? { x: li[0].x1, z: li[0].z1 }
      : (pass.ramp ? { x: pass.ramp.x0, z: pass.ramp.z0 } : { x: pass.x, z: pass.zStart });
    if (pass.pocketReposition) {
      // Dobrat kapsu najednou — návrat v kapse na pokračování rampy:
      //   1) ODSKOK pod 45° pryč od kontury o vzdálenost Odskok (stejně
      //      jako mimo kapsu) — zvednutí z řezu do už vyříznutého vzduchu,
      //   2) přejezd v ose Z NAD bod, kde má rampa pokračovat
      //      (rampFeedFrom = vršek minulého zápichu / konec minulé rampy),
      //   3) přísun v ose X na ten bod
      // a odtud pracovní rampa řeže jen nový úsek pod ním. Žádný výjezd
      // nad polotovar ani na roh (ten by jel skrz boss nad zápichem).
      const tgt = pass.rampFeedFrom || entry;
      const odskokZ = clipZGc(cur.z - zDir * rDistZ);
      simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${odskokZ.toFixed(3)}`, simCounter); setPos(cur.x + rDist, odskokZ);
      // Odskok o „Odskok" (rDist) NEMUSÍ nástroj dostat nad materiál: při
      // Hloubce (ap) větší než Odskok zůstane pod úrovní předchozí vrstvy
      // a přejezd v Z by projel stojícím materiálem (reálný nález na díle
      // uživatele: ap 5 mm, Odskok 2 mm → `G0 Z` skrz odlitek). Zvedni se
      // proto po ÚROVNÍCH PŘEDCHOZÍCH VRSTEV (krok = Hloubka ap), dokud
      // přejezd nevede volně — tam už nad nástrojem materiál není, protože
      // tu vrstvu vzal dřívější průchod. Strop je výjezd nad konturu.
      if (rapidStock && Math.abs(cur.z - tgt.z) > 1e-6) {
        const capX = rapidTopX + rapidStopX;
        let travX = cur.x;
        while (travX < capX - 1e-6 && rapidHitsStock(travX, cur.z, travX, tgt.z)) {
          travX = Math.min(capX, travX + Math.max(stepGc, rDist));
        }
        // Smyčka výš hledá, jak VYSOKO se zvednout, aby byl volný PŘEJEZD
        // V Z. Sám ZDVIH na tu výšku se ale netestoval, a to je vlastní
        // stěna kapsy: nástroj po odskoku pořád stojí v ní. Změřeno na
        // `part-4` s ap 1 mm — `N2590 G0 X39.977` hned po odskoku
        // `G1 X33.977 Z42.434` jel 1,8 mm² skrz stěnu (a s ap 2 ne, takže
        // to vypadalo jako čisté). Zdvih proto přes `emitLiftX`, stejně
        // jako výjezd nad konturu v `safeRapidTo`.
        emitLiftX(cur.x, travX, cur.z);
        if (travX > cur.x + 1e-6) setPos(travX, cur.z);
      }
      if (Math.abs(cur.z - tgt.z) > 1e-6) { simCounter += 1; addN(`G0 Z${tgt.z.toFixed(3)}`, simCounter); setPos(cur.x, tgt.z); }
      // Sjezd zpátky na pokračování rampy: poslední kousek (Vůle nad
      // materiálem) pracovním posuvem, ne rychloposuvem až na materiál.
      emitDescendX(cur.x, tgt.x, tgt.z, true); setPos(tgt.x, tgt.z);
    } else if (pass.pocketClean) {
      const needMove = Math.abs(cur.x - entry.x) > 1e-6 || Math.abs(cur.z - entry.z) > 1e-6;
      if (pass.cleanApproach && needMove) {
        // Dokončení navazuje na poslední zanořovací zákrok: horní stěnu už
        // obrobily rampy, takže se jen ODSKOČÍ ode dna, přejede v Z nad
        // začátek nedobraného zbytku a přisune se k němu — žádný výjezd nad
        // boss ani přejezd přes už obrobenou stěnu.
        const odskokZ = clipZGc(cur.z - zDir * rDistZ);
        simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${odskokZ.toFixed(3)}`, simCounter); setPos(cur.x + rDist, odskokZ);
        if (Math.abs(cur.z - entry.z) > 1e-6) { simCounter += 1; addN(`G0 Z${entry.z.toFixed(3)}`, simCounter); setPos(cur.x, entry.z); }
        if (Math.abs(cur.x - entry.x) > 1e-6) { simCounter += 1; addN(`G0 X${xDia(entry.x)}`, simCounter); setPos(entry.x, entry.z); }
      } else if (needMove) {
        // Dokončení kapsy bez navázání: nájezd na začátek kontury (roh u
        // náběhu) musí jít BEZPEČNĚ NAD bossem — z dna kapsy přímo nahoru
        // by se řezalo skrz materiál. safeRapidTo zvedne v X nad konturu,
        // přejede v Z a teprve pak sjede k rohu.
        safeRapidTo(entry.x, entry.z, true);
      }
    } else if (Math.abs(cur.x - entry.x) > 1e-6 || Math.abs(cur.z - entry.z) > 1e-6) {
      // Sem se dostaneme jen když cur ≠ entry, tj. NEJDE o plynulé navázání
      // na předchozí otevřený řez (u toho by cur == entry a podmínka výše je
      // nepravdivá). Je to skok z odjezdu předchozího průchodu → nájezd musí
      // jít BEZPEČNĚ NAD konturou (safeRapidTo), ne řezným G1 přímo na entry —
      // ten by protnul konturu („kapsa po kontuře" projíždí konturou).
      safeRapidTo(entry.x, entry.z, true);
    }
    for (const seg of li) {
      const fx = cur.x, fz = cur.z;
      if (seg.type === 'line') {
        simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
        noteCutMove(fx, fz, seg.x2, seg.z2);
      } else {
        simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
        noteCutArc(seg, fx, fz);
      }
    }
    if (pass.ramp) {
      // Rampa je DIAGONÁLNÍ feed (X i Z zároveň) pod úhlem zanoření — na
      // rozdíl od svislého řezu výše ji silueta odlitku může křížit VÍCKRÁT
      // podél délky (materiál-vzduch-materiál u odlitku s údolím pod rampou).
      // Vzorkuje se po ~0,2 mm (konvence dzScan) podél přímky (x0,z0)→(pass.x,
      // pass.zStart), segmenty stejného druhu (rapid/posuv) se slévají →
      // diagonální G0/G1 (stejný vzor jako safeRapidTo). Bez křížení siluety
      // (rampa celá v materiálu) vydá PŘESNĚ původní jeden `G1 X.. Z..`.
      const x0 = cur.x, z0 = cur.z, x1 = pass.x, z1 = pass.zStart;
      // Musí rampa DOLETĚT přesně na (pass.x, pass.zStart)? Jen když na ni
      // navazuje tělový řez (zStart≠zEnd) nebo leadOut — ty čtou `cur` a
      // potřebují přesnou polohu. Landing-only rampa (degenerovaná, žádný
      // leadOut, noRetract) nemá NIC, co by na přesném doletu záviselo —
      // příští průchod si stejně najede vlastním safeRapidTo odjinud
      // (jiná kapsa), takže dojíždět zbytek diagonály VZDUCHEM nad
      // drážkou je zbytečné: zkrátit na konec posledního řezného úseku.
      const needsExactLanding = Math.abs(pass.zStart - pass.zEnd) > 1e-6 || !!pass.contourLeadOut;
      // Popisek musí říkat SKUTEČNÝ sklon vydané přímky, ne nastavený úhel
      // zanoření. Rampa se totiž smí ZPLOŠTIT: leží-li stěna údolí sama
      // těsně pod úhlem zanoření, přímka pod plným úhlem by podjela
      // offsetovou čáru (řezala by do přídavku), takže se protáhne až tam,
      // kde vrstva opravdu začíná (viz zS v buildPocketPass). Dokud tu stál
      // pevně nastavený úhel, výstup tvrdil „Rampa 15,0°" u dráhy, která
      // jela 13,6° — reálná stížnost uživatele („tahle dráha je vypočítaná
      // špatně"), přitom čísla byla správná a lhal jen komentář.
      const rampDeg = Math.abs(Math.atan2(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 180 / Math.PI);
      const rampNote = `Rampa ${(Math.abs(rampDeg - entryAngleDegGc) < 0.05 ? entryAngleDegGc : rampDeg).toFixed(1)}°`;
      if (Math.abs(z1 - z0) < 1e-6) {
        simCounter += 1; addN(`G1 X${xDia(x1)} Z${z1.toFixed(3)}${note('', `Rampa ${entryAngleDegGc.toFixed(1)}°`)}`, simCounter); setPos(x1, z1);
      } else {
        const steps = Math.max(4, Math.ceil(Math.abs(z1 - z0) / 0.2));
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
        }
        let segs = [];
        for (let s = 1; s < pts.length; s++) {
          const midX = (pts[s - 1].x + pts[s].x) / 2, midZ = (pts[s - 1].z + pts[s].z) / 2;
          // Hranice pro touch = PLÁNOVACÍ obrys (silueta posunutá o Vůli X/Z,
          // tečkovaná hranice z náhledu), ne holá kůra odlitku — diagonální
          // posuv sahá až k vůli-zóně kolem materiálu (souhlasí s tím, kde končí
          // rychloposuv jinde: descendTo/safeRapidTo, exit-split u increment 1).
          const ct = planTopXAtZ(midZ);
          const air = !(ct !== null && (midX - tipRGc) <= ct + 1e-4);
          const kind = air ? 'G0' : 'G1';
          if (segs.length && segs[segs.length - 1].kind === kind) segs[segs.length - 1].pt = pts[s];
          else segs.push({ kind, pt: pts[s] });
        }
        const g1RunCount = segs.filter(s => s.kind === 'G1').length;
        if (needsExactLanding && g1RunCount > 1) {
          // Reálná mezera v odlitku (materiál-vzduch-materiál), ne jen
          // vzorkovací šum na konci — diagonální rapid mezerou by vedl přes
          // 3D geometrii, kterou per-Z obálka (planTopXAtZ) nevidí.
          // Dojet k PRVNÍMU dotyku, pak vyjet nad konturu (stejný vzor jako
          // jinde — „Výjezd nad konturu") a bezpečně najet na cíl (x1,z1)
          // přes safeRapidTo — místo hádání zbytku diagonály. Tahle větev
          // běží JEN když opravdu něco navazujícího čte přesnou polohu
          // (tělový řez/leadOut) — landing-only rampa (viz níž) nikdy dál
          // nejede, natož skáče jinam.
          const firstG1Idx = segs.findIndex(s => s.kind === 'G1');
          const headSegs = segs.slice(0, firstG1Idx + 1);
          headSegs.forEach((s, idx) => {
            simCounter += 1;
            const cmt = idx === firstG1Idx ? note('', rampNote) : '';
            addN(s.kind === 'G0'
              ? `G0 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`
              : `G1 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`, simCounter);
            setPos(s.pt.x, s.pt.z);
          });
          safeRapidTo(x1, z1, true, true);
        } else {
          if (!needsExactLanding) {
            // Landing-only rampa (žádný tělový řez, žádný leadOut,
            // noRetract) — nic dál nepotřebuje přesnou polohu (x1,z1).
            // Zkrátit VŽDY na konec PRVNÍHO řezného úseku (ne posledního a
            // NIKDY jízdou/rychloposuvem přes safeRapidTo jinam) —
            // pokračovat dál diagonálou (nebo přeskočit na vzdálený cíl
            // x1/z1) by porušilo jednotné odebírání po vrstvách a
            // přejíždělo/dobíralo materiál, který patří JINÉMU, pozdějšímu
            // průchodu (reálný nález na díle uživatele — nechtěný skok na
            // vzdálenou kapsu uprostřed hrubování čela, navíc s kolizním
            // „upichovacím" doletem).
            const firstG1Idx = segs.findIndex(s => s.kind === 'G1');
            segs = firstG1Idx >= 0 ? segs.slice(0, firstG1Idx + 1) : [];
          } else if (segs.length && segs[segs.length - 1].kind === 'G0') {
            // Musí doletět přesně: poslední VZOREK (~0,2 mm krok z `pts`) vždy
            // posuv (touch), i vyjde-li vzduch — pass.x/zStart je cíl z PROFILU
            // dílu (offsetXAt), ne ze siluety odlitku, může padnout do „díry" v
            // odlitku. Navazující tělový řez/leadOut (vždy G1) by jinak splynul
            // přes hranici run s TÍMTO rapidem v jeden „dip". Cena je jen
            // poslední vzorkovací krok — pracuje se přímo s `pts`, ne se
            // smergovaným segmentem (ten může sahat přes víc kroků vzduchu).
            const lastPt = segs[segs.length - 1].pt; // == pts[pts.length - 1]
            const preLandPt = pts[pts.length - 2];
            const segStart = segs.length > 1 ? segs[segs.length - 2].pt : pts[0];
            const canShorten = Math.abs(segStart.x - preLandPt.x) > 1e-9 || Math.abs(segStart.z - preLandPt.z) > 1e-9;
            if (canShorten) {
              segs[segs.length - 1].pt = preLandPt;
              segs.push({ kind: 'G1', pt: lastPt });
            } else {
              segs[segs.length - 1].kind = 'G1';
            }
          }
          // Komentář „Rampa" patří na první ŘEZNÝ (G1) úsek, ne na vedoucí
          // rapid — jinak by na rapid řádku matoucně naznačoval řezání.
          const labelIdx = segs.findIndex(s => s.kind === 'G1');
          segs.forEach((s, idx) => {
            simCounter += 1;
            const cmt = idx === (labelIdx >= 0 ? labelIdx : segs.length - 1) ? note('', rampNote) : '';
            addN(s.kind === 'G0'
              ? `G0 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`
              : `G1 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`, simCounter);
            setPos(s.pt.x, s.pt.z);
          });
        }
      }
    }
    if (Math.abs(pass.zStart - pass.zEnd) > 1e-6) {
      // Trasovaný nájezd po kontuře NEMUSÍ dojet až na hloubku vrstvy:
      // `traceOffsetPath` sleduje konturu, a leží-li ta v místě vjezdu výš
      // než plánovaná vrstva, lead skončí NAD ní. Tělo se přitom emituje
      // jako `G1 Z…` BEZ X (modálně), takže se projelo o ten rozdíl
      // mělčeji — a `setPos(pass.x, …)` níž přitom tvrdil, že nástroj na
      // hloubce JE. Naměřeno na part-8: lead končí na X26,974, průchod
      // plánuje X24,478 (přesně o jedno ap) → vrstva zůstala neodebraná,
      // ale model zbytku si ji odečetl (3,3 mm rozdíl proti realitě, tedy
      // na nebezpečnou stranu — podle modelu se pouští rychloposuvy).
      // Sjezd jde přes `emitDescendX`, takže platí totéž pravidlo jako
      // všude jinde: rychloposuv končí nad povrchem zbytku a poslední kus
      // se dojede posuvem.
      // Sjezd se ale nesmí udělat naslepo: na part-8 se do té hloubky
      // nevejde DRŽÁK (změřeno — vynucený sjezd tam vyrobil 2 kolize).
      // Testuje se týmž zeštíhleným obrysem a proti témuž zbytku jako ve
      // validátoru. Když se nevejde, zůstane se na hloubce leadu a tělo
      // pojede TAM — a hlavně se to tak i zapíše do modelu (`emitBodyX`),
      // takže si zbytek nepřipíše vrstvu, která se neodebrala.
      let bodyX = pass.x;
      if (cur.x - pass.x > 1e-6) {
        const deep = [{ x: pass.x, z: pass.zStart }, { x: pass.x, z: pass.zEnd }];
        if (holderHitsStock(deep)) {
          bodyX = cur.x;
          holderShallowBodies += 1;
        } else {
          emitDescendX(cur.x, pass.x, cur.z, true);
          setPos(pass.x, cur.z);
        }
        emitBodyX.set(pass, bodyX);
      }
      // Rovné dno za rampou — stejně jako tělo otevřeného průchodu se seká
      // na rychloposuv(vzduch)/posuv(materiál) podle siluety odlitku: krok
      // řetězu dorampování běží až na stěnu kontury a po cestě může přejet
      // celé údolí, kde nástroj nemá co řezat.
      const rampBody = airSplitAxial(bodyX, pass.zStart, pass.zEnd, Math.sign(pass.zEnd - pass.zStart) || zDir);
      // KONCOVÝ vzduch se nejezdí (stejně jako u otevřeného průchodu níž):
      // za posledním řezem už polotovar nesahá a cíl kroku může ležet
      // desítky mm v prázdnu (reálný nález na díle uživatele: `G0 Z349`
      // až na čelo polotovaru). Krok končí na hraně materiálu — přesněji
      // na vůlí-posunuté siluetě, kam ho dotáhne airSplitAxial.
      while (rampBody.length > 1 && rampBody[rampBody.length - 1].kind === 'G0') rampBody.pop();
      for (const s of rampBody) {
        simCounter += 1;
        // Táž pojistka jako u těla otevřeného průchodu níž: „vzduch" podle
        // statické siluety nemusí být vzduch proti AKTUÁLNÍMU zbytku
        // (po zanoření do kapsy tu stojí materiál, který silueta nezná).
        // Ptá se OBOU zbytků — syrového i PLÁNOVACÍHO (vůlí-posunutého):
        // polotovar končí až na offsetové čáře, takže `G0` pod ní je na
        // nadměrném kuse náraz.
        const hitsStock = s.kind === 'G0'
          && (rapidHitsStock(bodyX, cur.z, bodyX, s.z) || rapidHitsPlan(bodyX, cur.z, bodyX, s.z));
        addN(s.kind === 'G0' && !hitsStock
          ? `G0 Z${s.z.toFixed(3)}`
          : `G1 Z${s.z.toFixed(3)} F${prms.feed}${hitsStock ? ' ; Přejezd materiálem posuvem' : ''}`, simCounter);
        setPos(bodyX, s.z);
      }
    }
    if (pass.contourLeadOut) {
      // Bez schodků / dobrání kapsy: po dně dál po kontuře (G1/G2/G3)
      // místo odskoku — druhá stěna se obrobí přímo po obrysu. Ořez na
      // hranu materiálu (`trimLeadOutToStock`) je tu ze stejného důvodu
      // jako u otevřeného průchodu níž: dojezd kroku dorampování může po
      // kontuře dojet až tam, kde nad nástrojem polotovar dávno nesahá.
      for (const seg of trimLeadOutToStock(pass.contourLeadOut, tipRGc)) {
        if (seg.type === 'line') {
          emitLeadOutLine(seg);
        } else {
          const fx = cur.x, fz = cur.z;
          simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          noteCutArc(seg, fx, fz);
        }
      }
    }
    if (!pass.noRetract) {
      const zRetractVal = clipZGc(cur.z - zDir * rDistZ);
      simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
    }
  } else if (pass.type === 'long') {
    // Otevřený podélný průchod (standardně vpravo → vlevo, u druhé strany
    // zrcadlově vlevo → vpravo — směr drží zDir). Přijezd (sjezd v X) jde na
    // ZAČÁTEK POLOTOVARU — na Z, kde silueta odlitku reálně dosáhne hloubky
    // pass.x — NE na pass.zStart, který může ležet uprostřed drážky (intervaly
    // z obdélníkového obalu ignorují siluetu odlitku). Nad drážkou by se jinak
    // sjíždělo do vzduchu a teprve pak najíždělo k materiálu.
    //   G0 Z<hrana polotovaru + clearance>  ; rapid v Z nad ZAČÁTEK polotovaru
    //   G0 X<hloubka>                         ; sjezd k průměru U POLOTOVARU
    //   G1 Z<hrana> ; ... ; G1 Z<zEnd>        ; bezpečný dotek + řez (segmentovaný)
    //   G1 X<hloubka+odskok> Z<zEnd+odskok>   ; retract pod 45°
    // Řez zStart→zEnd navíc rozseká vnitřní drážky odlitku na rapid(vzduch)/
    // posuv(materiál). Bez drážek (řez celý v materiálu) = PŘESNĚ původní
    // `G1 Z zStart` + `G1 Z zEnd` → snapshoty bez drážek beze změny.
    const dir = zDir;
    const segs = airSplitAxial(pass.x, pass.zStart, pass.zEnd, dir);
    // Vedoucí vzduch (segs[0]=='G0') se NEřeže ani nepřejíždí uprostřed drážky —
    // přijede se rovnou na jeho konec = HRANA POLOTOVARU. Bez vedoucího vzduchu
    // je hrana = pass.zStart (původní chování, snapshoty beze změny).
    const leadAir = segs.length > 0 && segs[0].kind === 'G0';
    const firstCutZ = leadAir ? segs[0].z : pass.zStart;
    const emitSegs = leadAir ? segs.slice(1) : segs;
    // KONCOVÝ vzduch se stejně tak nejezdí: za posledním řezem už polotovar
    // nesahá a interval sám o sobě může končit až na hranici okna (regionu /
    // rozsahu 📐) desítky mm v prázdnu. Průchod tedy končí na HRANĚ MATERIÁLU
    // a odtud ho dojezd níž (offsetExitZ) posune na vůlí-posunutou siluetu —
    // „tečkovanou" čáru z náhledu. Bez toho vznikl po řezu rychloposuv přes
    // celý vzduch, tam ještě posuv o Vůli Z a teprve pak odskok, takže
    // nástroj odjížděl desítky mm za dílem (reálný nález na díle uživatele).
    while (emitSegs.length > 0 && emitSegs[emitSegs.length - 1].kind === 'G0') emitSegs.pop();
    const bodyEndZ = emitSegs.length > 0 ? emitSegs[emitSegs.length - 1].z : firstCutZ;
    let zApproachVal = clipZGc(firstCutZ - zDir * rapidStopZ);
    // ODSTUP V Z POSOUVÁ I DRŽÁK. Rychloposuv se zastaví `rapidStopZ` před
    // hranou materiálu, aby sjezd v X proběhl ve vzduchu — jenže tím se
    // o tentýž kus posune na NEOBROBENOU stranu celý držák, a ten je v Z
    // přes 20 mm dlouhý. Průchod, který se svou vlastní polohou vejde, tak
    // může na odstupu narazit tělem o 20 mm dál: změřeno na
    // `range-end-leadout` při ap 2,5 — sjezd `G0 X16.881` na Z 85,268 dal
    // 2,48 mm² držáku v materiálu na Z 103,8–105,2, kdežto na vlastním
    // `firstCutZ` 83,468 je čistý.
    //
    // ZDVIH NAD KONTURU TOMU NEPOMŮŽE: kolize je POLOHOVÁ, ne trasová —
    // držák drží týchž 2,47 mm² i staticky na cíli, ať se k němu přijede
    // odkudkoli. `safeRapidTo` ji sice pozná (`holderHitsRapid`), ale
    // odpoví jediným, co umí: zdvihem. Vznikne zbytečná dvojice „nahoru na
    // X68 a hned zpátky dolů" a následný sjezd do ní vjede stejně
    // (`emitDescendX` držák netestuje — a testovat by ho tam nemělo smysl,
    // protože kolizi držáku nejde vyřešit tím, že se pojede pomaleji).
    //
    // Odstup se proto ZKRÁTÍ tak daleko, aby se držák vešel — nejvýš na
    // `firstCutZ`, tedy tam, kde stejně bude tělo průchodu. Nájezd tím
    // nikdy nepostaví držák nikam, kam průchod sám nejde. Když ani na
    // `firstCutZ` místo není, nemá zkracování co získat a odstup zůstává.
    if (cur.x - pass.x > 1e-6 && Math.abs(zApproachVal - firstCutZ) > 1e-6) {
      const holderAt = (z) => holderHitsStock([{ x: cur.x, z }, { x: pass.x, z }]);
      if (holderAt(zApproachVal) && !holderAt(firstCutZ)) {
        const full = zApproachVal - firstCutZ;
        let shortened = firstCutZ;
        for (let k = 3; k >= 1; k--) {
          const zTry = clipZGc(firstCutZ + full * k / 4);
          if (!holderAt(zTry)) { shortened = zTry; break; }
        }
        zApproachVal = shortened;
      }
    }
    // Přejezd v Z nad začátek polotovaru + sjezd v X (s kontrolou kolize —
    // po zanoření do kapsy může nástroj stát hluboko, přímý přejezd by řízl stěnu).
    safeRapidTo(cur.x, zApproachVal);
    safeRapidTo(pass.x, zApproachVal);
    // Bezpečný dotek: sjezd přes clearance na hranu polotovaru pracovním posuvem.
    simCounter += 1; addN(`G1 Z${firstCutZ.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, firstCutZ);
    for (const s of emitSegs) {
      simCounter += 1;
      // „Vzduch" podle STATICKÉ siluety odlitku nemusí být vzduch doopravdy:
      // silueta nezná materiál, který v tom místě nechal stát dřívější
      // průchod, a práh `x − tipR` (dosah NOSU, viz airSplitAxial) navíc
      // nepočítá s tělem destičky za nosem. Když přejezd prokazatelně naráží
      // do AKTUÁLNÍHO zbytku, jede se posuvem — táž politika „safe-but-slow"
      // jako u descendTo a exit-splitu, stejný práh 0,5 mm².
      // Práh siluety se NEMĚNÍ (dosah nosu je zvolený vědomě kvůli materiálu
      // grazovanému nosem, +16 mm² na part-8) — tohle je jen pojistka navíc.
      // Ptá se OBOU zbytků — syrového i PLÁNOVACÍHO (vůlí-posunutého):
      // polotovar končí až na offsetové čáře, takže `G0` pod ní je na
      // nadměrném kuse náraz (změřeno: 17 takových přejezdů na 7 fixtures,
      // 12,1 mm² v offsetovém standardu; cena 29–84 mm posuvu navíc na díl).
      const hitsStock = s.kind === 'G0'
        && (rapidHitsStock(pass.x, cur.z, pass.x, s.z) || rapidHitsPlan(pass.x, cur.z, pass.x, s.z));
      addN(s.kind === 'G0' && !hitsStock
        ? `G0 Z${s.z.toFixed(3)}`
        : `G1 Z${s.z.toFixed(3)} F${prms.feed}${hitsStock ? ' ; Přejezd materiálem posuvem' : ''}`, simCounter);
      setPos(pass.x, s.z);
    }
    // Fáze 4: výjezd z materiálu do vzduchu — posuvem ještě o Vůli Z
    // za konec řezu, teprve pak odskok/rychloposuv. Jen u otevřeného
    // konce, za kterým skutečně NENÍ materiál (hrana polotovaru; stěnu
    // ani hranici rozsahu ověří test proti zbytkovému modelu).
    // Model se pro TENHLE test musí odříznout HNED (ne až generickým
    // noteCutPass na konci průchodu) — jinak `rapidStock` ještě obsahuje
    // materiál, který PRÁVĚ TENTO řez (výše) odebral, a kontrola kolize
    // narazí na fantomový zbytek vlastního (ještě „nenote'ovaného")
    // záběru, ne na skutečnou překážku (reálný nález na díle uživatele:
    // dojezd o Vůli Z se kvůli tomu zbytečně netiskl, i když za koncem
    // řezu byl prokazatelně vzduch).
    if (rapidStock) noteCutPass(pass);
    const leadOutSegs = pass.contourLeadOut ? trimLeadOutToStock(pass.contourLeadOut, tipRGc) : null;
    const hasLeadOut = !!(leadOutSegs && leadOutSegs.length > 0);
    if (!pass.blocked && !hasLeadOut && rapidStock) {
      // Dál ve směru řezu: buď o Vůli Z, nebo až na vůlí-posunutou siluetu —
      // co je dál (u druhé strany se „dál" počítá v +Z, proto max místo min).
      // Bez nalezené hrany zůstane jen odsazení o Vůli Z (neutrální prvek
      // pro min/max je opačný nekonečno než směr řezu).
      const zExitEdge = offsetExitZ(pass.x, bodyEndZ, zDir) ?? -zDir * Infinity;
      const zExit = clipZGc(zDir < 0
        ? Math.min(bodyEndZ - rapidClrZGc, zExitEdge)
        : Math.max(bodyEndZ + rapidClrZGc, zExitEdge));
      if (zDir * (zExit - bodyEndZ) > 1e-6 && !rapidHitsStock(pass.x, bodyEndZ, pass.x, zExit)) {
        simCounter += 1; addN(`G1 Z${zExit.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, zExit);
      }
    }
    if (hasLeadOut) {
      // Bez schodků: dál po kontuře (G1/G2/G3) až na hloubku dalšího
      // průchodu místo okamžitého odskoku — schod se obrobí přímo.
      for (const seg of leadOutSegs) {
        if (seg.type === 'line') {
          // AXIÁLNÍ úsek (konstantní hloubka — typicky rovné pokračování
          // vrstvy přes údolí za dosednutím rampy) se stejně jako tělo
          // průchodu rozseká na rychloposuv(vzduch)/posuv(materiál): nad
          // údolím odlitku, kam nástroj nedosáhne, není co řezat a posuv
          // by tam jel desítky mm naprázdno (reálný nález na díle
          // uživatele). Sledování KONTURY (šikmé úseky, oblouky) se nedělí
          // — to se drží dílu, tam žádný vzduch nepřipadá v úvahu.
          emitLeadOutLine(seg);
        } else {
          const fx = cur.x, fz = cur.z;
          simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          noteCutArc(seg, fx, fz);
        }
      }
      // Dojezd končící AXIÁLNĚ (rovný úsek na hloubce průchodu, typicky
      // pokračování po dosednutí rampy) vyjíždí ven hranou polotovaru
      // stejně jako otevřený konec — dojede posuvem na vůlí-posunutou
      // siluetu. Šikmý/obloukový konec dojezdu leží na STĚNĚ KONTURY
      // (vršek schodu), tam by pokračování v −Z řezalo do dílu — proto
      // jen čistě axiální poslední úsek. Kontrolu, že za koncem je
      // opravdu vzduch, dělá rapidHitsStock (model už má odečtený
      // i tenhle průchod, viz noteCutPass výš).
      const lastSeg = leadOutSegs[leadOutSegs.length - 1];
      const axialEnd = lastSeg.type === 'line'
        && Math.abs(lastSeg.x2 - lastSeg.x1) < 0.01 && zDir * (lastSeg.z2 - lastSeg.z1) > 1e-6;
      const zOffExit = axialEnd && rapidStock ? offsetExitZ(lastSeg.x2, lastSeg.z2, zDir) : null;
      if (zOffExit !== null) {
        const zExitLo = clipZGc(zOffExit);
        if (zDir * (zExitLo - lastSeg.z2) > 1e-6 && !rapidHitsStock(lastSeg.x2, lastSeg.z2, lastSeg.x2, zExitLo)) {
          simCounter += 1; addN(`G1 Z${zExitLo.toFixed(3)} F${prms.feed}`, simCounter); setPos(lastSeg.x2, zExitLo);
        }
      }
    }
    if (!pass.noRetract) {
      const zRetractVal = clipZGc(cur.z - zDir * rDistZ);
      simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
    }
  } else {
    // Čelní hrubování (vzor shodný se sim cestou). Per-Z hodnoty:
    //   xStart = lokální casting outer + rapidClr (rapid-safe v tomto Z)
    //   xSurface = lokální casting outer (povrch polotovaru tady)
    //   G0 X<xStart>           ; rapid za polotovar v X (per-Z clearance)
    //   G0 Z<z>                ; rapid na cílovou hloubku
    //   G1 X<xSurface>         ; sjezd přes clearance na povrch polotovaru
    //                            už pracovním posuvem (bezpečný dotek)
    //   G1 X<xEnd> F<f>        ; čelní řez −X k bloku kontury
    //   G1 X<xEnd+odskok> Z<z+odskok>  ; retract pod 45°
    // Přejezd na další průchod se emituje PŘÍMO (ne dvěma safeRapidTo):
    // výška přejezdu v Z se musí rozhodnout JEDNOU. `xStart` je totiž
    // rapid-safe jen nad CÍLOVÝM Z — když cesta v Z vede přes vyšší
    // materiál, dvojice „výjezd na xStart" + „přejezd v Z" se dohadovala
    // po řádcích: první ho zvedla na xStart, druhá hned nad konturu, a
    // u sameZ dokonce nahoru a zpátky po téže svislici (reálný nález
    // uživatele: `G0 X42.543` → `G0 X69.217`, resp. nahoru–dolů–nahoru).
    //
    // Strop zdvihu je LOKÁLNÍ povrch zbytku mezi výchozím a cílovým Z, ne
    // globální vršek kontury: u dílu s velkým osazením (Ø129 u čela)
    // by se nástroj zvedal přes celý polotovar, i když stačí přejet nad
    // Ø33 v místě přejezdu. Když ani lokální strop nestačí, jde se nad
    // konturu jako dřív.
    // feedThroughStock se tu neuplatní: čelní graze sousedního Z je
    // inherentní (šířka nosu), ne order-dependent — zůstává rychloposuv.
    {
      const zFrom = cur.z, zTo = pass.z;
      const travelBlocked = (x) => segmentHitsPath({ x, z: zFrom }, { x, z: zTo }, rapidBlockers)
        || rapidHitsStock(x, zFrom, x, zTo)
        || rapidHitsPlan(x, zFrom, x, zTo);
      const capX = Math.max(rapidTopX + rapidStopX, pass.xStart);
      let xTrav = pass.xStart;
      if (Math.abs(zTo - zFrom) > 1e-6 && travelBlocked(xTrav)) {
        let top = null;
        const n = 24;
        for (let i = 0; i <= n; i++) {
          const t = travelTopXAtZ(zFrom + (zTo - zFrom) * (i / n));
          if (t !== null && (top === null || t > top)) top = t;
        }
        xTrav = top !== null ? Math.min(capX, Math.max(pass.xStart, top + rapidStopX)) : capX;
        if (travelBlocked(xTrav)) xTrav = capX;
      }
      if (xTrav > cur.x + 1e-6) {
        simCounter += 1;
        addN(`G0 X${xDia(xTrav)}${xTrav > pass.xStart + 1e-6 ? note('', 'Výjezd nad konturu') : ''}`, simCounter);
        setPos(xTrav, cur.z);
      }
      if (Math.abs(zTo - cur.z) > 1e-6) { simCounter += 1; addN(`G0 Z${zTo.toFixed(3)}`, simCounter); setPos(cur.x, zTo); }
      // Sjezd na rapid-safe hloubku nad povrchem (emitDescendX zastaví na
      // zbytku a poslední kousek dojede posuvem, když je pod ním materiál).
      if (cur.x - pass.xStart > 1e-6) { emitDescendX(cur.x, pass.xStart, pass.z, false); setPos(pass.xStart, pass.z); }
    }
    // Dotyk povrchu polotovaru posuvem — ale NIKDY hlouběji, než kam má
    // průchod dojet. Programovaný bod je STŘED nosu, materiál pod ním leží
    // o rádius níž: u odlitku odsazeného zhruba o rádius nosu vyjde cíl
    // (xEnd = offset kontury) NAD povrch polotovaru a sjezd „na povrch" by
    // nos zavezl o celý rádius hlouběji — až na hotovou konturu, tj. i
    // přes celý přídavek (reálný nález s R 8 mm).
    const xTouch = Math.max(pass.xSurface, pass.xEnd);
    if (cur.x - xTouch > 1e-6) { simCounter += 1; addN(`G1 X${xDia(xTouch)} F${prms.feed}`, simCounter); setPos(xTouch, pass.z); }
    if (Math.abs(cur.x - pass.xEnd) > 1e-6) { simCounter += 1; addN(`G1 X${xDia(pass.xEnd)} F${prms.feed}`, simCounter); setPos(pass.xEnd, pass.z); }
    if (pass.contourLeadOut) {
      // Bez schodků: dál po kontuře (G1/G2/G3) v pásu Z∈[z−ap, z]
      // místo okamžitého odskoku — schod se obrobí přímo po obrysu.
      for (const seg of pass.contourLeadOut) {
        const fx = cur.x, fz = cur.z;
        if (seg.type === 'line') {
          simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          noteCutMove(fx, fz, seg.x2, seg.z2);
        } else {
          simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          noteCutArc(seg, fx, fz);
        }
      }
    }
    // Retract pod úhlem odskoku do už obrobené strany: zprava +Z,
    // zleva −Z (drží pass.faceLeft). Když by diagonála zajela do kontury
    // NEBO do materiálu, který sousední (mělčí/zkrácený) průchod nechal
    // stát (stěna kapsy, hlídání destičky) → vyjet svisle jen v X.
    const dirZR = pass.faceLeft ? -1 : 1;
    // Sklon diagonály: na Z-posun dz připadá X-zdvih dz·(rDist/rDistZ);
    // u 90° (rDistZ=0) je odskok svislý a kontrola bezpředmětná.
    const rTan = rDistZ > 1e-9 ? rDist / rDistZ : Infinity;
    let retractGouges = false;
    for (let i = 1; i <= 8 && rDistZ > 1e-9 && !retractGouges; i++) {
      const dz = rDistZ * i / 8;
      const ox = gcOffsetXAt(cur.z + dirZR * dz);
      if (ox !== null && ox > cur.x + dz * rTan - 0.02) retractGouges = true;
    }
    // Zbytek materiálu na sousedních čelních rovinách (xEnd > offset).
    if (!retractGouges && rDistZ > 1e-9) {
      for (const p2 of calc.passes) {
        if (p2.type !== 'face') continue;
        const dz = dirZR * (p2.z - cur.z);
        if (dz <= 1e-6 || dz > rDistZ + 1e-6) continue;
        if (p2.xEnd > cur.x + dz * rTan - 0.02) { retractGouges = true; break; }
      }
    }
    const zRetractVal = clipZGc(clipFaceRetractZ(cur.z + (pass.faceLeft ? -rDistZ : rDistZ), pass));
    // …a nakonec DRŽÁK. Obě kontroly výš znají jen ŠPIČKU: hotovou konturu
    // pod diagonálou a zbytek na sousedních čelních rovinách do rDistZ
    // (tedy 2 mm). Držák je ale v Z přes 20 mm tlustý a radiálně sahá
    // stovky mm ven, takže stěna, o kterou jde, leží desítky mm daleko —
    // mimo dosah obojího.
    //
    // Mechanismus (nález uživatele 25. 8. 2026, `N4750 G1 X18.641 Z82.932`):
    // hlídání držáku sesadí hloubku průchodu tak, aby se držák VEŠEL NA
    // POLOZE PRŮCHODU. Odskok pod 45° pak posune celý držák o rDistZ dál na
    // obrobenou stranu a jen o rDist ven — u stěny strmější než úhel odskoku
    // (tady dx/dz ≈ 2,8) tím tu právě vyměřenou rezervu sní. Že to vystřelí,
    // závisí na tom, kolik rezervy hlídání zrovna nechalo, takže se to chová
    // nemonotónně: při Virt. zvětšení držáku 0 a 2 mm je to čisté, při 1 mm
    // se roh držáku otře o 0,09 mm².
    //
    // Náprava stojí NULA materiálu: hloubka průchodu zůstává, jen se místo
    // diagonály vyjede svisle v X — tedy zpátky do vlastní, právě vyříznuté
    // stopy. Vůči stěně na obrobené straně je svislý výjezd vždy alespoň
    // tak dobrý jako diagonála (roh držáku jde o rDist ven a v Z nikam).
    //
    // Ptá se na PŘÍRŮSTEK, ne na dotyk: kolik zbytku drží držák na konci
    // odskoku PROTI TOMU, kolik ho držel na poloze průchodu, kterou
    // hlídání schválilo. Absolutní dotyk je v plánovacím modelu běžný
    // (fantomy mezi vrstvami, viz `holderPlanAreaAt`), přírůstek ne.
    // Průchod je v obou souřadnicích monotónní a překážka leží na obrobené
    // straně, takže nejhorší bod je koncový — stačí porovnat konce.
    if (!retractGouges && Math.abs(zRetractVal - cur.z) > 1e-6) {
      const aNow = holderPlanAreaAt(cur.x, cur.z);
      const aEnd = aNow === null ? null : holderPlanAreaAt(cur.x + rDist, zRetractVal);
      if (aEnd !== null && aEnd > aNow + 0.02) retractGouges = true;
    }
    if (retractGouges) {
      simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)}${note('', 'Výjezd v X (stěna)')}`, simCounter); setPos(cur.x + rDist, cur.z);
    } else {
      simCounter += 1;
      if (Math.abs(zRetractVal - cur.z) < 1e-6) {
        // Odskok by vyjel z pásu 📐 → svisle v X, zpátky do vlastní stopy.
        addN(`G1 X${xDia(cur.x + rDist)}${note('', 'Výjezd v X (hranice rozsahu)')}`, simCounter);
        setPos(cur.x + rDist, cur.z);
      } else {
        addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter);
        setPos(cur.x + rDist, zRetractVal);
      }
    }
  }
  // Fáze 4: průchod je odsimulovaný — odebrat jeho materiál z modelu,
  // ať další rychloposuvy počítají s aktuálním zbytkem polotovaru.
  noteCutPass(pass);
});

// Návrat na bezpečnou polohu VŽDY přes výjezd v ose X a teprve pak přejezd
// v Z (`forceUp`) — nikdy diagonálou. Kontrola kolize sice diagonálu pustí
// jen tam, kde v tu chvíli nic nestojí, ale odjezd z dílu je poslední pohyb
// programu a šikmý pohyb přes celý díl je zbytečné riziko (upnutí, zbytek
// po předchozí operaci, ruční zásah). Cena je jeden řádek navíc.
safeRapidTo((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1),
  parseFloat(prms.safeZ) || 0, false, true);
  return { simCounter, holderShallowBodies };
}

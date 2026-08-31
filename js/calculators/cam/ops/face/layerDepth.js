// ╔═══════════════════════════════════════════╗
// ║  ČELNÍ HRUBOVÁNÍ — hloubka VRSTEV              ║
// ╚═══════════════════════════════════════════╝
// Vyňato z `ops/roughFace.js` (rozdělení generátoru, plán §3.A).
// Post-proces nad hotovým polem `passes` — pořadí volání v generátoru
// je závazné: destička → hloubka vrstev → doběh úseku → držák.

import { insertReachZ } from '../../toolEnvelope.js';

export function makeEnforceLayerDepth(deps) {
  const {
    prms, ins, passes, foundErrors, faceLeft, step, zList, xTouchAt,
    castingOuterAtZ, castingOuterOrNull, faceOffsetOut,
  } = deps;
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

  return enforceLayerDepth;
}

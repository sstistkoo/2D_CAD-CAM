// ╔═══════════════════════════════════════════╗
// ║  ČELNÍ HRUBOVÁNÍ — hlídání geometrie DESTIČKY  ║
// ╚═══════════════════════════════════════════╝
// Vyňato z `ops/roughFace.js` (rozdělení generátoru, plán §3.A).
// Post-proces nad hotovým polem `passes` — pořadí volání v generátoru
// je závazné: destička → hloubka vrstev → doběh úseku → držák.

import { fitArcsToPolyline, samplePartingEnvelope, partingEnvelopeAt } from '../../camMath.js';
import { insertReachZ } from '../../toolEnvelope.js';

export function guardInsertFace(deps) {
  const {
    prms, ins, passes, foundErrors, faceLeft, step, offsetXAt, xTouchAt,
    castingOuterAtZ, rapidStartXAt,
  } = deps;
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
        // ZAROVNÁNÍ SCHODU ZA ČELEM DÍLU = SVISLÝ ZÁPICH, NE DOJEZD. Kde pod
        // tělem plátku u zápichu kontura není (za čelem dílu), obálka začíná
        // až tam, kde tělo k čelu dojede (`zS`). Vzorky před tím se dřív
        // zahodily a napojení ode dna zápichu vedlo ŠIKMO na první vzorek
        // s konturou: `N9300 G1 X31.866 Z-4.468` (uživatel 8. 10. 2026,
        // `projekt_2026-10-08 (1)`) — výjezd nahoru k hotovému čelu Z 0, pravý
        // roh 0,17 mm v přídavku. Dojezd po dně a pak nahoru podél čela by zase
        // řezal BOKEM plátku přes celou výšku schodu (part-18: 1,36 mm v hloubce
        // 11 mm). Upichovák zanořuje kolmo (pravidlo 6): průchod odjede bez
        // dojezdu a schod mezi jeho tělem a přídavkem čela vezme hned za ním
        // zápich v `zS` (0,02 mm před dotekem čela) — řeže čelní hranou, šířka
        // třísky = šířka schodu < ap (pravidlo 3). Šikmé čelo (part-20) pak
        // zápich dojede po obálce jako dřív; svislé čelo vzal celé sám.
        if (partingEnvelopeAt(offsetXAt, p.z, w2R, dirM, 0.4) === null) {
          let zS = null;
          const n = Math.max(1, Math.ceil(Math.abs(zEnd - p.z) / 0.05));
          let za = p.z;
          for (let i = 1; i <= n && zS === null; i++) {
            const zb = p.z + (zEnd - p.z) * (i / n);
            if (partingEnvelopeAt(offsetXAt, zb, w2R, dirM, 0.4) !== null) {
              let lo = za, hi = zb;
              for (let k = 0; k < 30; k++) {
                const m = (lo + hi) / 2;
                if (partingEnvelopeAt(offsetXAt, m, w2R, dirM, 0.4) === null) lo = m; else hi = m;
              }
              zS = lo;
            }
            za = zb;
          }
          if (zS !== null) {
            if (lo) delete p.contourLeadOut;
            const zP = zS - dirM * 0.02, zIn = zS + dirM * 0.02;
            const env = dirM * (zEnd - zIn) > 0.02
              ? samplePartingEnvelope(offsetXAt, zIn, zEnd, w2R, dirM, 0.4, 0.003, brkZ) : [];
            if (env.length > 0 && env[0].x > p.xEnd + 0.02 && Math.abs(zP - p.z) > 0.05
              && castingOuterAtZ && rapidStartXAt && p.xEnd < xTouchAt(zP) - 0.01) {
              // Nad schodem je vybráno (mělčí průchody, tělo průchodu `p`) —
              // rychloposuv až nad vršek schodu, posuvem jen schod.
              const xRaw = castingOuterAtZ(zP);
              const clr = rapidStartXAt(zP, xRaw, faceLeft ? 1 : -1) - xRaw;
              const xTop = Math.min(xRaw, Math.max(...env.map(t => t.x)));
              const q = { type: 'face', z: zP, xStart: xTop + clr, xSurface: xTop, xEnd: p.xEnd, blocked: p.blocked, stairPlunge: true };
              if (p.faceLeft) q.faceLeft = true;
              if (p.retractCapZ !== undefined) q.retractCapZ = p.retractCapZ;
              // Šikmé čelo: za zápichem po obálce nahoru (svislý kus u `zS`
              // je vlastní stopa zápichu). Napojení rovnou na začátek obálky —
              // osový kousek mezi `zP` a `zIn` by ořez „dojezd v rohu" níž
              // (roughFace.js) vzal za roh a dojezd uťal.
              if (env.some(t => t.x > env[0].x + 0.05)) {
                const segs = [{ type: 'line', x1: p.xEnd, z1: zP, x2: env[0].x, z2: env[0].z }];
                for (const s of fitArcsToPolyline(env, 0.02)) {
                  if (s.type === 'line') segs.push({ type: 'line', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z });
                  else segs.push({ type: 'arc', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z, cx: s.cx, cz: s.cz, r: s.r, dir: s.dir, startAngle: s.startAngle, endAngle: s.endAngle });
                }
                q.contourLeadOut = segs;
              }
              passes.splice(passes.indexOf(p) + 1, 0, q);
            }
            continue;
          }
        }
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

}

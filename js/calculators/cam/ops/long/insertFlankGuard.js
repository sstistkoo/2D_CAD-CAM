// ╔══════════════════════════════════════════════════════════╗
// ║  Hlídání geometrie destičky při podélném hrubování             ║
// ╚══════════════════════════════════════════════════════════╝
// ── Hlídání geometrie destičky (podélně) ──
// Čelní hrana destičky se nad špičkou naklání o φ = natočení + ε − 90
// za svislici → průchody končící u zdi (levé stěny) se zastavují
// postupně dál vpravo, takže boční ostří nezajede do kontury
// (zbytek tvoří schodiště pod úhlem hrany). Spodní hrana (natočení)
// totéž zrcadlově u pravých stěn kapes při zanořování.

import { isAngleBetween } from '../../camMath.js';

/**
 * Zkrátí konce průchodů a kotvy ramp tak, aby boční a hřbetní hrana destičky
 * nezajela do kontury. Mění pole průchodů na místě; vrací počet úprav.
 * Volá se jen pro plátky s bokem/hřbetem (cam/inserts → hasFlankGeometry).
 * `hasStock(x, zHi, zLo)` = stojí v tom okně na té hloubce materiál (plánovací
 * silueta); posun kotvy nesmí průchod odsunout mimo záběr — viz níž.
 */
export function guardInsertFlankLong(passes, prms, offsetPath, hasStock) {

  let adjusted = 0;
  const rotDeg = parseFloat(prms.toolAngle) || 0;
  const tipDeg = parseFloat(prms.toolTipAngle) || 90;
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
    const rotRad = Math.min(89.5, rotDeg) * Math.PI / 180;
    const tanRot = Math.tan(rotRad);
    // ── STĚNA MUSÍ BÝT NA DOSAH HRANY (30. 9. 2026) ─────────────────────
    // Hrana je dlouhá jen `toolLength`, radiálně tedy sahá od kotvy rampy
    // `toolLength · sin(natočení)` nahoru (10 mm při 15° = 2,59 mm), a
    // stoupá od špičky DOPRAVA — stěna za koncem průchodu (níž než zEnd)
    // do jeho kapsy nepatří. Bez obojího se „stěna" hledala přes celý díl.
    // Dosah se měří VÝŠKAMI (kotva hrany × rozsah rampy stěny), ne rozdílem
    // hloubek průchodů: při ap 3 by rozdíl hloubek 3 > 2,59 vyřadil i
    // sousední vrstvu, na jejíž rampu hrana z kotvy (o ap výš) dosáhne.
    //
    // Nález uživatele 30. 9. 2026 (podélně zleva, „Generovat" celého
    // programu): rampy X 48,045 / 45,545 v úseku 3 (Z 235 / 248) posunuly
    // kotvu vrstvy X 29,566 v úseku 1 na Z 317 — průchod zdegeneroval
    // a zmizel; stejně vrstva X 39,118 u Z 141 v úseku 2 a nejhlubší
    // vrstvy X 9,44 … 4,44 u čela v úseku 4. „✂ Po úsecích" je mělo, protože
    // tam cizí úsek v poli průchodů není. (Stejná mez byla v 145799b ze
    // 4. 9. — zmizela s hromadným revertem 709e87b, ne kvůli sobě.)
    const flankReachX = Math.max(0.5, (parseFloat(prms.toolLength) || 0) * Math.sin(rotRad));
    // Vjezd na hranici rozsahu Z (entryRangeRamp) ani dorampování strmé
    // stěny (rampCompletion) NENÍ pravá stěna kapsy — obojí je řetězená
    // posloupnost ramp NAD SEBOU podél téže hranice/stěny, ne nezávislý
    // boss. Bez vyloučení tahle heuristika brala mělčí krok řetězu jako
    // „pravou stěnu" hlubšího kroku, umělé zúžení smazalo z0 pod zEnd a
    // celý krok zmizel (reálný nález na díle uživatele — první krok řetězu
    // chyběl; u rampCompletion navíc přes CELÝ díl: krok řetězu v jednom
    // údolí smazal krok řetězu v jiném, o 120 mm dál, a osiřelý
    // `pocketReposition` pak přejel rychloposuvem skrz polotovar).
    // Stěnu tvoří RAMPA mělčího průchodu — přímka z jejího začátku
    // (x0, z0) pod úhlem natočení, rovnoběžná se spodní hranou. Hrana
    // hlubšího průchodu z jeho kotvy (x0, z0) do ní nezajede, když kotva
    // leží na té přímce nebo vlevo od ní: z0 ≤ w.z0 − (w.x0 − p.x0)/tan.
    // Dřív se místo začátků ramp dosazovaly HLOUBKY průchodů; rampa mělčí
    // vrstvy ale začíná o 2,48 (ap − 0,02) nad svou hloubkou, ne o ap, a
    // hlubší krok řetězu, který navazoval PŘESNĚ na její konec, se odsunul
    // o 0,02/tan 15° = 0,07 mm doprava. Další rampa pak začala před koncem
    // téhle a nájezd do ní svisle řezal (P6 „90°", díl uživatele 30. 9.
    // 2026, úsek 4: `G1 X6.940` po `G0 Z359.323`).
    const rampTop = (p) => (Number.isFinite(p.ramp.x0) ? p.ramp.x0 : p.x);
    const rightWalls = passes.filter(p => p.type === 'long' && p.ramp && !p.contourLeadIn && !p.pocketReposition && !p.entryRangeRamp && !p.rampCompletion).map(p => ({ x: p.x, x0: rampTop(p), z: p.ramp.z0 }));
    for (let pi = passes.length - 1; pi >= 0; pi--) {
      const p = passes[pi];
      if (p.type !== 'long' || !p.ramp || p.contourLeadIn || p.entryRangeRamp || p.rampCompletion) continue;
      // Dobrat kapsu najednou: zanořovací zákroky kapsy se neupravují (viz výše).
      if (p.pocketEntry || p.pocketReposition || p.pocketClean) continue;
      let z0 = p.ramp.z0;
      const px0 = rampTop(p);
      for (const w of rightWalls) {
        if (w.x <= p.x + 1e-6 || w.z <= p.zEnd) continue;
        // Rampa stěny (výšky w.x … w.x0) a hrana (px0 … px0 + dosah) se míjí.
        if (w.x0 <= px0 + 1e-6 || w.x >= px0 + flankReachX) continue;
        const cand = w.z - (w.x0 - px0) / tanRot;
        if (cand < z0) z0 = cand;
      }
      if (z0 < p.ramp.z0 - 0.01) {
        adjusted++;
        const dzRamp = p.ramp.z0 - p.zStart;
        p.ramp.z0 = z0;
        p.zStart = z0 - dzRamp;
        // Posun kotvy TAHÁ S SEBOU CELOU RAMPU, takže o `dzRamp` odjede
        // doleva i `zStart` — a s ním celý průchod. Když ho to odsune ZA
        // materiál, zůstane sice dlouhý, ale jede vzduchem.
        //
        // Nález uživatele 7. 9. 2026 („Průchod 11", r 44,545): kotva se
        // posunula Z 220,848 → 211,518 a zStart s ní 195,812 → 186,654.
        // Materiál na té hloubce přitom končí na Z 195,3 — v novém okně
        // 186,654…172,532 má odlitek jen r 17,74. Vyšel z toho rychloposuv
        // nad konturu, rampa 16 mm vzduchem, řez 0,05 mm a přejezd údolí:
        // „Nemá to tam co dělat, mají být jenom vrstvy."
        //
        // Stará pojistka `< 0.05` hlídala jen GEOMETRICKÝ kolaps rozpětí,
        // kterým 14 mm prošlo. Rozšířeno na „zbylo vůbec co brát" — týž
        // důvod, jen měřený materiálem místo délkou.
        //  • rozpětí zkolabovalo            → průchod zahodit (stará pojistka),
        //  • nebere ani rovný úsek, ani rampa → zahodit,
        //  • nebere rovný úsek, ale RAMPA ANO → nechat, ale UKONČIT na konci
        //    rampy. Tohle je ta správná třetí možnost: mazat celý průchod
        //    vezme i rampu (uživatel 7. 9. 2026: *„nesjelo to po rampě tu
        //    poslední, není tam dráha"*), nechat ho celý zase znamená, že
        //    dojede do údolí jen proto, aby se tam odjel.
        if (p.zStart - p.zEnd < 0.05) { passes.splice(pi, 1); continue; }
        if (typeof hasStock === 'function' && !hasStock(p.x, p.zStart, p.zEnd)) {
          if (!hasStock(p.x, p.zStart, p.zEnd, p.ramp)) passes.splice(pi, 1);
          else p.zEnd = p.zStart;
        }
      }
    }
  }
  
  return adjusted;
}

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
 */
export function guardInsertFlankLong(passes, prms, offsetPath) {

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
    // ── DOSAH BOČNÍ HRANY JE KONEČNÝ (4. 9. 2026) ───────────────────────
    // Hrana se promítala přes CELÝ díl. Je ale dlouhá jen `toolLength`,
    // takže radiálně sahá `toolLength · sin(natočení)` — u destičky 10 mm
    // natočené o 15° jsou to **2,59 mm**, ne 56.
    //
    // Nález uživatele 4. 9. 2026 (rozsah Z 226,35): „stěna" na Ø63,545
    // v Z 233,5 posunula kotvu průchodu na Ø7,545 u ČELA (Z ≈ 358) až na
    // Z 24,5 — tedy o 334 mm — průchod tím zdegeneroval a byl SMAZÁN.
    // Totéž potkalo Ø4,545. V panelu se to hlásilo jako „2 průchody
    // ZKRÁCENY", ačkoli zmizely celé, a na výkrese to vypadalo, že se konec
    // dílu prostě neobrobil.
    //
    // Komentář níž tenhle jev popisuje („krok řetězu v jednom údolí smazal
    // krok řetězu v jiném, o 120 mm dál") a řešil ho tehdy vyloučením
    // `rampCompletion` z „pravých stěn" — jenže neomezený dosah zůstal
    // a chytal i obyčejné průchody.
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
    const rightWalls = passes.filter(p => p.type === 'long' && p.ramp && !p.contourLeadIn && !p.pocketReposition && !p.entryRangeRamp && !p.rampCompletion).map(p => ({ x: p.x, z: p.ramp.z0 }));
    for (let pi = passes.length - 1; pi >= 0; pi--) {
      const p = passes[pi];
      if (p.type !== 'long' || !p.ramp || p.contourLeadIn || p.entryRangeRamp || p.rampCompletion) continue;
      // Dobrat kapsu najednou: zanořovací zákroky kapsy se neupravují (viz výše).
      if (p.pocketEntry || p.pocketReposition || p.pocketClean) continue;
      let z0 = p.ramp.z0;
      for (const w of rightWalls) {
        if (w.x <= p.x + 1e-6 || w.x - p.x > flankReachX) continue;
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
  
  return adjusted;
}

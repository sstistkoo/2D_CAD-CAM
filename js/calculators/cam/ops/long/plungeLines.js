// ╔════════════════════════════════════════╗
// ║  Paměť PŘÍMEK ZANOŘENÍ (kdo kudy už sjel)              ║
// ╚════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.
//
// `plungeLineRuns` se vrací jako ŽIVÉ POLE: generátor ho čte i resetuje
// (`length = 0`) mezi regiony, proto ne kopie.

/** @param effPlungeTanL tangenta efektivního úhlu zanoření */
export function makePlungeLines({ effPlungeTanL }) {
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

  return { plungeLineRuns, notePlungeRun, plungeRunCovers };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  DOJEZD Z KAPSY NEPŘEJÍŽDÍ HRB — pravidlo 7 (docs/cam-pravidla.md) ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Kapsový průchod (údolí) dojíždí „bez schodků" po protější stěně nahoru
// (`findPocketExitZ`) — a ta ho dřív vezla dál: přes vrchol hrbu a po jeho
// druhé straně dolů, do úseku ZA hrbem. Tím se přes hrb přejelo dřív, než
// bylo údolí hotové (pravidlo 7: „Přes hrb se nepřejíždí, dokud strana před
// ním není hotová"), a za hrbem se ubírala hlubší vrstva, zatímco v údolí
// ještě stál materiál.
//
// Nález uživatele 25. 9. 2026 (projekt_2026-09-25 (16).camprog, zleva,
// úsek 1): `N1140 … Rampa / N1150 G1 Z47.780` — průchod X24,566 po zahlazení
// schodku pokračoval po obrobené stěně přes hrb Z55–68 a sjel za něj
// (`G1 X24.851 Z81.881`); údolí (šikmá čára 15°) se dobíralo až potom.
// *„místo aby se zastavil po zahlazení schodku a udělal odskok"*.
//
// Tady se dojezd takového průchodu ROZDĚLÍ:
//   • hlava zůstane průchodu: stěna nahoru jen po hloubku mělčí vrstvy
//     (schodek je zahlazený), nebo — když ji stěna nedosáhne — po vrchol
//     hrbu; pak odskok,
//   • zbytek (vrchol hrbu a sjezd za ním) se vydá jako SAMOSTATNÝ průchod
//     s nájezdem po kontuře; `orderByHumps` ho zařadí za hrb, tedy až po
//     dokončení údolí. Když za hrbem jede vlastní průchod TÉŽE vrstvy (kus
//     s nájezdem po kontuře, nebo zanoření do dalšího údolí), zbytek se
//     nevydává — byl by jeho kopií (part-1: dojezd sjížděl do druhého
//     údolí, které má vlastní rampy; zbytek tam jel vzduchem a v nesprávném
//     pořadí bral víc než ap).
//
// Souřadnice: vnitřní svět strategie (jízda k nižšímu Z).

const HUMP_MIN = 1;      // o kolik musí dojezd za vrcholem klesnout, aby to byl hrb
const TOL = 0.02;
const N_SAMPLE = 24;

const segAt = (s, t) => {
  if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
    const a = s.startAngle + (s.endAngle - s.startAngle) * t;
    return { x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r };
  }
  return { x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t };
};

/** Část segmentu mezi parametry t0 < t1. */
const subSeg = (s, t0, t1) => {
  const p0 = segAt(s, t0), p1 = segAt(s, t1);
  if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
    const a0 = s.startAngle + (s.endAngle - s.startAngle) * t0;
    const a1 = s.startAngle + (s.endAngle - s.startAngle) * t1;
    return { ...s, startAngle: a0, endAngle: a1, x1: p0.x, z1: p0.z, x2: p1.x, z2: p1.z };
  }
  return { ...s, x1: p0.x, z1: p0.z, x2: p1.x, z2: p1.z };
};

/**
 * Najde místo, kde má dojezd skončit: první dosažení `prevX`, jinak vrchol,
 * za kterým dojezd klesne aspoň o HUMP_MIN. Vrací `{ k, t }` nebo null
 * (dojezd přes hrb nevede — nechat, jak je).
 */
function findCut(lo, prevX) {
  const pts = [];
  lo.forEach((s, k) => {
    for (let i = k === 0 ? 0 : 1; i <= N_SAMPLE; i++) {
      const t = i / N_SAMPLE;
      pts.push({ k, t, ...segAt(s, t) });
    }
  });
  if (pts.length < 2) return null;
  let peak = pts[0], peakIdx = 0, prevHit = -1;
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    if (prevHit < 0 && Number.isFinite(prevX) && q.x >= prevX - TOL) prevHit = i;
    if (q.x > peak.x + TOL) { peak = q; peakIdx = i; }
    else if (q.x < peak.x - HUMP_MIN) {
      // Za vrcholem dojezd sjíždí za hrb → přejezd. Když ale za hrbem zase
      // stoupá (vede přes DALŠÍ údolí — dokončení kapsy objíždí zbytek obrysu
      // až na konec dílu), je to jiná věc než přejezd jednoho hrbu a nechá
      // se být: zbytek by vjel do údolí, jehož vrstvy ještě nejely (part-8:
      // tříska 6 mm).
      let low = q.x;
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[j].x < low) low = pts[j].x;
        else if (pts[j].x > low + HUMP_MIN) return null;
      }
      // Střih na mělčí vrstvě (když ji stěna dosáhla dřív), jinak na
      // začátku vrcholu.
      const at = prevHit >= 0 && prevHit <= peakIdx ? prevHit : peakIdx;
      if (at === 0) return null;
      // Přesné místo dosažení `prevX` půlením uvnitř segmentu.
      const c = pts[at];
      if (at === prevHit) {
        const s = lo[c.k], tPrev = pts[at - 1].k === c.k ? pts[at - 1].t : 0;
        let a = tPrev, b = c.t;
        for (let n = 0; n < 30; n++) { const m = (a + b) / 2; if (segAt(s, m).x >= prevX - TOL) b = m; else a = m; }
        return { k: c.k, t: b };
      }
      return { k: c.k, t: c.t };
    }
  }
  return null;
}

/** Zahodí z nájezdu `q` všechno před `zCut` (jízda k nižšímu Z). */
function trimLeadInBefore(q, zCut) {
  const li = q.contourLeadIn;
  if (!(li[0].z1 > zCut + 0.05)) return;
  const out = [];
  for (const s of li) {
    if (Math.max(s.z1, s.z2) <= zCut + 1e-6) { out.push(s); continue; }
    if (Math.min(s.z1, s.z2) >= zCut - 1e-6) continue;       // celý před střihem
    let a = 0, b = 1;                                         // z klesá s t
    for (let n = 0; n < 30; n++) { const m = (a + b) / 2; if (segAt(s, m).z > zCut) a = m; else b = m; }
    out.push(subSeg(s, b, 1));
  }
  if (out.length > 0) q.contourLeadIn = out;
}

/**
 * Rozdělí dojezdy kapsových průchodů přes hrb. Mění průchody na místě a
 * vrací nové pole: původní pořadí + zbytky přejezdů na konci (od mělkých
 * k hlubokým, ať hlubší sjezd nejede pod ještě stojící mělčí vrstvou).
 *
 * @param list  průchody regionu v pořadí plánování
 * @param step  hloubka záběru (ap) — mělčí vrstva = x + step
 */
export function splitPocketLeadOutsOverHumps(list, step) {
  if (!Array.isArray(list) || !(step > 0)) return list;
  const rems = [];
  for (const p of list) {
    if (!p || p.type !== 'long' || !Number.isFinite(p.x)) continue;
    if (!(p.pocketEntry || p.pocketReposition || p.pocketClean)) continue;
    const lo = p.contourLeadOut;
    if (!Array.isArray(lo) || lo.length === 0) continue;
    // Dokončení kapsy (`pocketClean`) nemá „mělčí vrstvu" — jeho x je dno.
    const cut = findCut(lo, p.pocketClean ? NaN : p.x + step);
    if (!cut) continue;
    const s = lo[cut.k];
    const head = lo.slice(0, cut.k);
    const tail = [];
    if (cut.t > 1e-6) head.push(subSeg(s, 0, cut.t));
    if (cut.t < 1 - 1e-6) tail.push(subSeg(s, cut.t, 1));
    tail.push(...lo.slice(cut.k + 1));
    const dropTiny = (segs) => segs.filter(q => Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 0.01);
    const h = dropTiny(head), tl = dropTiny(tail);
    if (tl.length === 0) continue;
    if (h.length > 0) p.contourLeadOut = h; else delete p.contourLeadOut;
    p.humpLeadOutCut = true;
    const end = tl[tl.length - 1];
    const cutZ = tl[0].z1;
    // Za hrbem jede vlastní kus téže vrstvy s nájezdem po kontuře → přejezd
    // udělá on; zbytek by byl jeho doslovnou kopií.
    const own = list.find(q => q !== p && q && q.type === 'long' && Number.isFinite(q.x)
      && Math.abs(q.x - end.x2) <= 0.05
      && Number.isFinite(q.zStart) && q.zStart < cutZ - 1);
    if (own) {
      if (!Array.isArray(own.contourLeadIn) || own.contourLeadIn.length === 0) continue;
      // Jeho nájezd začíná dole u konce těla průchodu `p` a jede po stěně,
      // kterou `p` právě dojel (hlava dojezdu) — posuvem po obrobeném
      // (pravidlo 5). Začne proto až tam, kde hlava skončila.
      if (!own.ramp) trimLeadInBefore(own, cutZ);
      continue;
    }
    rems.push({ type: 'long', x: end.x2, zStart: end.z2, zEnd: end.z2, blocked: true,
      contourLeadIn: tl, humpCrossing: true });
  }
  if (rems.length === 0) return list;
  rems.sort((a, b) => b.x - a.x);
  return list.concat(rems);
}

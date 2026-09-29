// ╔══════════════════════════════════════════════════════════════╗
// ║  PRAVIDLO 7 — VRSTVA JEDE PŘES HRB VCELKU AŽ NA KONEC           ║
// ╚══════════════════════════════════════════════════════════════╝
// docs/cam-pravidla.md, pravidlo 7: „Každá vrstva jede až na konec, dokud
// nenarazí na hotovní konturu. Když kontura vystoupí (hrb), vrstva kopíruje
// její tvar a pokračuje dál až na konec."
//
// Ověřitelná podmínka (na skutečné dráze nástroje, ne na plánu):
//   Pro každý hrb — úsek offsetové dráhy nad hloubkou vrstvy X, za kterým
//   offset zase klesne pod X — a pro PRVNÍ vrstvu pod jeho vrcholem (žádná
//   jiná vrstva programu neleží mezi ní a vrcholem): když ta vrstva řeže
//   před hrbem i za ním, musí existovat SOUVISLÝ úsek dráhy z bodu na X před
//   hrbem do bodu na X za hrbem, který celou dobu kopíruje čáru
//   y(z) = max(X, offset(z)): nikde pod X (dojezd o vrstvu níž) a nikde nad ní
//   (odskok, výjezd nad polotovar).
//
// Nález uživatele 29. 9. 2026 (kulatá R 10, zleva, úsek 1): vrstva X 36,618
// jela vybráním, přes hrb a dojezdem po oblouku až na X 34,095 (`N960`), pak
// odjela; za hrbem ji dojel jiný průchod (`N1300 Z106.017`).

const HUG_BELOW = 0.05;   // mm pod vrstvou, co se ještě bere jako „na vrstvě"
const HUG_ABOVE = 0.15;   // mm nad čarou kopírování (numerika oblouků)

/**
 * @param sp        simPath (body { x, z, type })
 * @param offsetXAt offset dráhy (střed nosu) na z, null = mimo
 * @returns [{ i, x, h0, h1, top }] — i = index pohybu, kde vrstva za hrbem začala zvlášť
 */
export function checkHumpContinuity(sp, offsetXAt) {
  const out = [];
  // Vrstvy = hloubky vodorovných posuvů delších než 1 mm; směr jízdy z nich.
  const depthSet = new Map();
  let zMin = Infinity, zMax = -Infinity, dirSum = 0;
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    if (b.type === 'G0') continue;
    zMin = Math.min(zMin, a.z, b.z); zMax = Math.max(zMax, a.z, b.z);
    if (Math.abs(b.x - a.x) < 1e-6 && Math.abs(b.z - a.z) > 1) {
      depthSet.set(b.x.toFixed(3), b.x);
      dirSum += Math.sign(b.z - a.z) * Math.abs(b.z - a.z);
    }
  }
  const depths = [...depthSet.values()].sort((p, q) => q - p);
  if (depths.length === 0 || !Number.isFinite(zMin)) return out;
  const dir = dirSum >= 0 ? 1 : -1;
  const H = 0.25;
  const hugY = (x, z) => { const o = offsetXAt(z); return o === null ? x : Math.max(x, o); };
  const onLayer = (p, x) => Math.abs(p.x - x) <= HUG_BELOW;

  for (const x of depths) {
    // Hrby na hloubce x (offset nad x, z obou stran pod ní).
    const humps = [];
    let run = null, seenBelow = false;
    for (let z = zMin; z <= zMax + 1e-9; z += H) {
      const o = offsetXAt(z);
      const above = o !== null && o > x + 0.05;
      if (above) {
        if (!run && seenBelow) run = { h0: z, h1: z, top: o };
        else if (run) { run.h1 = z; run.top = Math.max(run.top, o); }
      } else {
        if (run) { humps.push(run); run = null; }
        seenBelow = true;
      }
    }
    for (const h of humps) {
      // Jen PRVNÍ vrstva pod vrcholem.
      if (depths.some(d => d > x + 1e-3 && d < h.top - 0.05)) continue;
      const before = (p) => dir > 0 ? p.z < h.h0 : p.z > h.h1;
      const after = (p) => dir > 0 ? p.z > h.h1 : p.z < h.h0;
      // Řeže vrstva z obou stran hrbu?
      const idxBefore = [], idxAfter = [];
      for (let i = 1; i < sp.length; i++) {
        const a = sp[i - 1], b = sp[i];
        if (b.type === 'G0' || !onLayer(a, x) || !onLayer(b, x) || Math.abs(b.z - a.z) < 0.5) continue;
        if (before(a) && before(b)) idxBefore.push(i);
        if (after(a) && after(b)) idxAfter.push(i);
      }
      if (idxBefore.length === 0 || idxAfter.length === 0) continue;
      // Souvislý úsek od konce vrstvy před hrbem až na POSUV PO VRSTVĚ za hrbem
      // (vodorovně ≥ 0,5 mm) — pouhé protnutí úrovně X cestou dolů (dojezd
      // po oblouku o vrstvu níž) se za pokračování vrstvy nepočítá.
      let ok = false;
      for (const i0 of idxBefore) {
        for (let k = i0 + 1; k < sp.length; k++) {
          const p = sp[k], q = sp[k - 1];
          if (p.x < x - HUG_BELOW || p.x > hugY(x, p.z) + HUG_ABOVE) break;
          if (p.type !== 'G0' && onLayer(p, x) && onLayer(q, x) && after(p) && after(q)
              && Math.abs(p.z - q.z) >= 0.5) { ok = true; break; }
        }
        if (ok) break;
      }
      if (!ok) out.push({ i: idxAfter[0], x, h0: h.h0, h1: h.h1, top: h.top });
    }
  }
  return out;
}

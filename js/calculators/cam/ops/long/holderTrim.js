// ╔═════════════════════════════════════════════╗
// ║  Ořez sledování kontury obálkou držáku (Fáze 3b)           ║
// ╚═════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.

/** @param holderClampZEnd obálka držáku (`isForbidden` / `isForbiddenSoft`) */
export function makeHolderTrim({ holderClampZEnd }) {
  // ── Fáze 3b: ořez sledování kontury (leadIn/leadOut) obálkou držáku ──
  // traceOffsetPath umí vydat trasu přes celou konturu (např. nájezd kapsy
  // od osy přes čelo) — úseky, kde by špička ležela v zakázané oblasti
  // (silueta ⊕ −držák), se z trasy vyříznou: leadIn (končí v cíli) zahodí
  // PREFIX po poslední blokovaný úsek, leadOut (začíná na konci řezu)
  // zahodí SUFFIX od prvního blokovaného. Vzorkování po ~0,5 mm (tětiva).
  // Test úseku trasy proti zakázané oblasti. `soft` = měkká oblast
  // (erodovaná o dosah špičky + 1 mm): drhnutí o přídavkovou slupku
  // podél stěn toleruje — používá se JEN pro dočišťovací trasy kapes
  // (guides v2 tam vědomě pouští držák těsně podél stěn, dno musí
  // zůstat dosažitelné). Vše ostatní testuje tvrdou oblast.
  const _traceSegBlocked = (s, soft) => {
    const test = soft ? holderClampZEnd?.isForbiddenSoft : holderClampZEnd?.isForbidden;
    if (!test) return false;
    const n = Math.max(1, Math.min(32, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.5)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (test(s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t)) return true;
    }
    return false;
  };
  const holderTrimLeadIn = (li, soft = false) => {
    if (globalThis.__DISABLE_HOLDER_TRIMS__) return li;
    if (!holderClampZEnd || !holderClampZEnd.isForbidden || li.length === 0) return li;
    let lastBad = -1;
    for (let i = 0; i < li.length; i++) if (_traceSegBlocked(li[i], soft)) lastBad = i;
    if (globalThis.__HOLDER_CLAMP_DEBUG__ && lastBad >= 0)
      console.log(`[trimIn${soft ? '/soft' : ''}] ${li.length} segů → ${li.length - lastBad - 1} (od (${li[0].x1?.toFixed(1)},${li[0].z1?.toFixed(1)}))`);
    return lastBad >= 0 ? li.slice(lastBad + 1) : li;
  };
  const holderTrimLeadOut = (lo, soft = false) => {
    if (globalThis.__DISABLE_HOLDER_TRIMS__) return lo;
    if (!holderClampZEnd || !holderClampZEnd.isForbidden || lo.length === 0) return lo;
    for (let i = 0; i < lo.length; i++) {
      if (_traceSegBlocked(lo[i], soft)) {
        if (globalThis.__HOLDER_CLAMP_DEBUG__)
          console.log(`[trimOut${soft ? '/soft' : ''}] ${lo.length} segů → ${i} (blok u (${lo[i].x1?.toFixed(1)},${lo[i].z1?.toFixed(1)}))`);
        return lo.slice(0, i);
      }
    }
    return lo;
  };

  return { holderTrimLeadIn, holderTrimLeadOut };
}

// ╔══════════════════════════════════════════════╗
// ║  CO UŽ JE PROJETÉ — evidence hotových úseků dráhy         ║
// ╚══════════════════════════════════════════════╝
// Hrubovací generátor si dosud pamatoval jen PŘÍMKY ZANOŘENÍ
// (`plungeLineRuns`), ROHY sjeté rampou (`rampedOutCorners`) a KAPSY
// (`pocketDoneRanges`). Dvě věci evidenci neměly, a obojí se proto vydávalo
// dvakrát (nález uživatele 2. 9. 2026, 85,8 mm z 1 604 mm řezné dráhy):
//
//   1. ROVNÝ ŘEZ NA HLOUBCE VRSTVY. Dobrání ořízlé rampy jede „až kam sahá
//      materiál" a zastaví se o stěnu kontury — jenže tu stěnu už mohl
//      obrobit průchod na TÉŽE hloubce z jiného úseku/regionu.
//   2. ŘETĚZ PO KONTUŘE (`contourLeadIn`/`contourLeadOut`). `traceOffsetPath`
//      je VÝŘEZ SDÍLENÉ `offsetPath` podle Z, takže dva řetězy s překrytým
//      Z-pásmem nevydají podobnou dráhu, ale DOSLOVA TUTÉŽ. Nezáleží na
//      hloubce ani na tom, který průchod je vyrobil.
//
// Obojí je čistá funkce nad `passes` / nad seznamem projetých řetězů — žádný
// skrytý stav mimo to, co si volající sám drží.

/** Sloučí [lo,hi] intervaly (setříděné podle lo) do nepřekrývajících se. */
function mergeSpans(spans) {
  if (spans.length === 0) return spans;
  spans.sort((a, b) => a[0] - b[0]);
  const out = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const last = out[out.length - 1];
    if (spans[i][0] <= last[1] + 1e-6) last[1] = Math.max(last[1], spans[i][1]);
    else out.push(spans[i]);
  }
  return out;
}

/**
 * Z-úseky, které už NĚJAKÝ průchod projel PŘESNĚ na hloubce `X`.
 * Bere tělo průchodu i ty úseky jeho řetězů, které na té hloubce leží
 * (dojezd „bez schodků" končívá dlouhým rovným kusem na hloubce vrstvy).
 */
export function depthCutSpans(passes, X, tol = 0.02) {
  const spans = [];
  const addSeg = (x1, z1, x2, z2) => {
    if (Math.abs(x1 - X) > tol || Math.abs(x2 - X) > tol) return;
    spans.push([Math.min(z1, z2), Math.max(z1, z2)]);
  };
  for (const p of passes) {
    if (!p || p.type !== 'long') continue;
    if (Math.abs(p.x - X) <= tol && Number.isFinite(p.zStart) && Number.isFinite(p.zEnd))
      spans.push([Math.min(p.zStart, p.zEnd), Math.max(p.zStart, p.zEnd)]);
    for (const key of ['contourLeadIn', 'contourLeadOut']) {
      const chain = p[key];
      if (!Array.isArray(chain)) continue;
      for (const s of chain) addSeg(s.x1, s.z1, s.x2, s.z2);
    }
  }
  return mergeSpans(spans);
}

/**
 * Dno pro rovný řez na hloubce `X` z `zFrom` do `zEnd`, když KONEC toho řezu
 * padne doprostřed úseku, který na téhle hloubce UŽ NĚKDO projel: vrátí horní
 * hranu takového úseku (dál se jet nemá — zbytek je hotový). Jinak
 * `-Infinity`.
 *
 * ROZHODUJE, KDE ŘEZ KONČÍ, ne jestli po cestě něco potká. Ostrůvek uprostřed
 * dlouhé jízdy stopku nedělá: za ním leží materiál, na který se jinak nikdo
 * nedostane. Změřeno — „zastav u čehokoli, co je hotové" utne na `part-8`
 * 108mm doběh kvůli 1,36mm ostrůvku a stojí 153,7 mm² úběru.
 */
export function depthCutClampZ(passes, X, zFrom, zEnd, tol = 0.02) {
  let stop = -Infinity;
  for (const [lo, hi] of depthCutSpans(passes, X, tol)) {
    if (hi >= zFrom - tol) continue;                 // leží nad výchozím bodem
    if (zEnd < lo - tol || zEnd > hi + tol) continue; // řez v něm nekončí
    if (hi > stop) stop = hi;
  }
  return stop;
}

// ── Řetězy po kontuře ─────────────────────────────────────────────────────

/** Bod na segmentu řetězu v parametru t∈⟨0,1⟩ (oblouk po úhlu). */
function chainPointAt(s, t) {
  if (s.type === 'arc') {
    const a = s.startAngle + (s.endAngle - s.startAngle) * t;
    return { x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r };
  }
  return { x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t };
}

/** Délka segmentu řetězu (oblouk po oblouku, ne po tětivě). */
function chainSegLen(s) {
  if (s.type === 'arc') return Math.abs(s.endAngle - s.startAngle) * s.r;
  return Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
}

/**
 * Evidence PROJETÝCH ŘETĚZŮ po kontuře. Segment se považuje za projetý,
 * když už některý zapsaný řetěz vede po téže dráze — a protože všechny
 * vznikají z jedné `offsetPath`, stačí porovnat Z-pásmo a ověřit, že se
 * v něm shoduje i X (na kontuře leží na jednom Z klidně dvě větve — dno
 * kapsy a její protistěna).
 */
export function makeChainRegistry(tol = 0.05) {
  const ridden = [];     // { zLo, zHi, seg }

  const xOnSegAtZ = (s, z) => {
    const zLo = Math.min(s.z1, s.z2), zHi = Math.max(s.z1, s.z2);
    if (z < zLo - 1e-6 || z > zHi + 1e-6) return null;
    if (s.type === 'arc') {
      const term = s.r * s.r - (z - s.cz) * (z - s.cz);
      if (term < 0) return null;
      const d = Math.sqrt(term);
      // Větev vybere shoda s koncovými body (oblouky řetězu jsou monotónní v Z).
      for (const x of [s.cx + d, s.cx - d]) {
        const tEnd = Math.abs(z - s.z1) < Math.abs(z - s.z2) ? s.x1 : s.x2;
        if (Math.abs(x - tEnd) <= s.r + 1e-6) return x;
      }
      return null;
    }
    if (Math.abs(s.z2 - s.z1) < 1e-9) return s.x1;
    return s.x1 + (z - s.z1) / (s.z2 - s.z1) * (s.x2 - s.x1);
  };

  /** Leží bod (x,z) na některém zapsaném řetězu? */
  const hasPoint = (x, z) => ridden.some(r => {
    if (z < r.zLo - tol || z > r.zHi + tol) return false;
    const xr = xOnSegAtZ(r.seg, Math.max(r.zLo, Math.min(r.zHi, z)));
    return xr !== null && Math.abs(xr - x) <= tol;
  });

  return {
    /** Zapiš řetěz jako projetý. */
    note(segs) {
      if (!Array.isArray(segs)) return;
      for (const s of segs) {
        if (!s || !Number.isFinite(s.z1) || !Number.isFinite(s.z2)) continue;
        ridden.push({ zLo: Math.min(s.z1, s.z2), zHi: Math.max(s.z1, s.z2), seg: s });
      }
    },
    /**
     * Kolik z `segs` (od začátku) vede po už projeté dráze. Vrací počet
     * segmentů k zahození — ořezává se JEN SOUVISLÝ PREFIX nebo SUFIX,
     * aby v řetězu nevznikla díra.
     */
    duplicatePrefix(segs) {
      let n = 0;
      while (n < segs.length && isDuplicate(segs[n])) n++;
      return n;
    },
    duplicateSuffix(segs) {
      let n = 0;
      while (n < segs.length && isDuplicate(segs[segs.length - 1 - n])) n++;
      return n;
    },
    isDuplicate,
  };

  /** Vede segment CELÝ po už projeté dráze? (vzorkuje po ~0,3 mm) */
  function isDuplicate(s) {
    if (!s || !Number.isFinite(s.z1) || !Number.isFinite(s.z2)) return false;
    const L = chainSegLen(s);
    if (L < 1e-6) return true;                 // mikrosegment nikoho nestojí
    const n = Math.max(2, Math.ceil(L / 0.3));
    for (let k = 0; k <= n; k++) {
      const p = chainPointAt(s, k / n);
      if (!hasPoint(p.x, p.z)) return false;
    }
    return true;
  }
}

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

/**
 * Segment řetězu jako lomená čára (~0,2 mm). Oblouk se vzorkuje PO ÚHLU, aby
 * seděla i větev — řešit `x(z)` analyticky nestačí: kružnice má na jednom Z
 * dvě řešení a rozhodnout mezi nimi podle koncových bodů se nedá, jakmile
 * konec oblouku leží blízko jeho středu v X (změřeno: záměna větve o 8,7 mm
 * na oblouku končícím v z-extrému). Bez úhlů (segment odjinud než
 * z `traceOffsetPath`) zbývá tětiva — ta je vždy na správné straně.
 */
function sampleSeg(s, maxStep = Infinity) {
  const arc = s.type === 'arc'
    && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle) && Number.isFinite(s.r);
  const len = arc
    ? Math.abs(s.endAngle - s.startAngle) * s.r
    : Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  // ÚSEČKA SE NEVZORKUJE: vzdálenost bodu od úsečky je přesná, takže dva body
  // stačí. Oblouk se dělí podle SAGITTY (L ≤ √(8·r·tol)) — týž vzorec, jakým
  // `residualTracker.pushArcOrChord` krotí počet vzorků. Vzorkovat všechno po
  // 0,2 mm znamená u dlouhých dojezdů desetitisíce úseček v evidenci, a
  // `hasPoint` je lineární sken: rostlo by to kvadraticky s délkou programu.
  const step = arc
    ? Math.min(maxStep, Math.max(0.2, Math.min(2, Math.sqrt(8 * s.r * 0.02))))
    : maxStep;
  const n = Number.isFinite(step) ? Math.max(1, Math.ceil(len / step)) : 1;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (arc) {
      const a = s.startAngle + (s.endAngle - s.startAngle) * t;
      pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
    } else {
      pts.push({ x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t });
    }
  }
  return { pts, len };
}

/** Vzdálenost bodu od úsečky. */
function distPtSeg(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  if (L2 < 1e-12) return Math.hypot(px - a.x, pz - a.z);
  let t = ((px - a.x) * dx + (pz - a.z) * dz) / L2;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
}

/**
 * Evidence PROJETÝCH ŘETĚZŮ po kontuře. Segment se považuje za projetý,
 * když už některý zapsaný řetěz vede po téže dráze — a protože všechny
 * vznikají z jedné `offsetPath`, stačí porovnat Z-pásmo a ověřit, že se
 * v něm shoduje i X (na kontuře leží na jednom Z klidně dvě větve — dno
 * kapsy a její protistěna).
 */
export function makeChainRegistry(tol = 0.05) {
  const ridden = [];     // ploché úsečky projetých řetězů: { a, b, zLo, zHi }

  /** Leží bod (x,z) na některém zapsaném řetězu? */
  const hasPoint = (x, z) => ridden.some(r =>
    z >= r.zLo - tol && z <= r.zHi + tol && distPtSeg(x, z, r.a, r.b) <= tol);

  return {
    /** Zapiš řetěz jako projetý. */
    note(segs) {
      if (!Array.isArray(segs)) return;
      for (const s of segs) {
        if (!s || !Number.isFinite(s.z1) || !Number.isFinite(s.z2)) continue;
        if (!Number.isFinite(s.x1) || !Number.isFinite(s.x2)) continue;
        const { pts } = sampleSeg(s);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          ridden.push({ a, b, zLo: Math.min(a.z, b.z), zHi: Math.max(a.z, b.z) });
        }
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

  /** Vede segment CELÝ po už projeté dráze? */
  function isDuplicate(s) {
    if (!s || ![s.x1, s.z1, s.x2, s.z2].every(Number.isFinite)) return false;
    // KANDIDÁT se vzorkuje HUSTĚ (0,3 mm) — na rozdíl od zápisu tady nejde
    // o tvar segmentu, ale o to, jestli ho zapsané řetězy pokrývají PO CELÉ
    // DÉLCE; dvěma koncovými body by dlouhá úsečka přeskočila mezeru mezi nimi.
    const { pts, len } = sampleSeg(s, 0.3);
    if (len < 1e-6) return true;               // mikrosegment nikoho nestojí
    return pts.every(p => hasPoint(p.x, p.z));
  }
}

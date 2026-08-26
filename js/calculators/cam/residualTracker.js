// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – model ZBYTKU se znalostí pořadí obrábění               ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Krok 1 plánu `docs/cam-order-aware-holder.md`.
//
// Strategie dnes rozhoduje o vjezdech a zanořeních podle VÝŠKOVÉHO POLE
// (`cutFloorTab` v roughingStrategies.js): jedno číslo na svislici Z, do
// kterého se zapisuje MINIMUM přes všechny dosud naplánované průchody.
// To je levné a pro běžné vrstvení správné, ale neumí popsat TUNEL: když
// zanoření nebo dojezd po kontuře podjede pod stojícím materiálem, výškové
// pole srazí celý sloupec na hloubku tunelu a tvrdí, že nad ním nic není.
//
// Změřeno (`tests/cam-strategy-residual`, 26. 8. 2026):
//   part-8                        model až 11,2 mm POD realitou, pás Z 117,5–183
//   holder-casting-slanted-face   model až 13,6 mm POD realitou, pás Z 68,8–100,3
// Obě jsou přesně ty fixtures, na kterých zůstávají doložené kolize držáku
// (part-8 4 nálezy / 33,4 mm²; holder-casting 2 / 2,3 mm²) — a obě chyby jsou
// v NEBEZPEČNÉM směru: model tvrdí, že je vykopáno, tak tam hlídání držák
// pustí. Rozdíl NENÍ v hlídání držáku, ale v modelu materiálu.
//
// Tenhle tracker drží zbytek jako POLYGONY (`StockModel`), takže tunel i
// převis popsat umí. Stojí za to jen tam, kde na tom někdo staví rozhodnutí —
// proto se seed i footprint sdílí s `materialRemoval.js` a `gcodeEmit.js`,
// aby v repu nevznikl třetí, vlastní model polotovaru.
//
// ── CENA ──────────────────────────────────────────────────────────────────
// Cenu nese `toolSweep`, tedy POČET BODŮ dráhy, ne velikost modelu:
// `polySimplify` po 1 / 4 / 8 / 24 řezech vyšel na týž čas (±3 %). Proto se
// oblouky vzorkují sagittou (viz `pushArcOrChord`) — změřeno na `noteAll`:
//
//   tolerance   part-8              part-15            part-13
//   0,001 mm    459 bodů /  82 ms   233 / 33 ms        163 / 18 ms
//   0,01  mm    249 bodů /  30 ms   157 / 24 ms         88 /  7 ms
//   0,04  mm    203 bodů /  22 ms   140 / 20 ms         71 /  5 ms
//
// a přesnost (model pod realitou, mez testu 0,05 mm): 0,013 / 0,035 / 0,304
// při 0,01 mm, ale 0,030 / **0,057** / 0,304 při 0,04 — část-15 by mez
// přetekla. Proto `ARC_SAGITTA_TOL = 0,01`.
//
// Celý přepočet se zapnutým `orderAwareHolder` (5 opakování, minimum):
//   part-8 −12 %, part-16 +0 %, part-15 +17 %, part-13 +25 %
// (před přechodem na sagittu to bylo +6 / +72 / +124 %.)
import { StockModel, toolSweep, polySimplify } from '../../geom/geomCore.js';
import { buildStockLoopRaw, offsetStockLoop, toolFootprint } from './materialRemoval.js';

// Jak přesně se vzorkují OBLOUKY v nájezdech/dojezdech [mm]: nejvyšší
// dovolená SAGITTA mezi vzorkem a skutečným obloukem. Viz `pushArcOrChord`.
export const ARC_SAGITTA_TOL = 0.01;

/** Body průchodu ve stejné konvenci, jakou má `noteCutPass` v gcodeEmit.js. */
export function passCutPolylines(pass, arcTol = ARC_SAGITTA_TOL) {
  if (!pass) return [];
  const out = [];
  const chain = [];
  const push = (x, z) => {
    const l = chain[chain.length - 1];
    if (Number.isFinite(x) && Number.isFinite(z)
      && (!l || Math.hypot(l.x - x, l.z - z) > 1e-6)) chain.push({ x, z });
  };
  if (pass.type === 'face') {
    push(pass.xStart, pass.z);
    push(pass.xEnd, pass.z);
  } else {
    // PRŮCHOD S NULOVÝM DNEM NEMÁ CO PŘEDPOVÍDAT — táž výjimka jako
    // v `noteCutPass` i v `notePassInto`. Degenerovaný průchod (dno nulové
    // šířky) žádné dno nemá a emise k němu najíždí jinudy, než kudy vede
    // plánovaná rampa; zápis z plánu by odebral klín, který ve skutečnosti
    // stojí. Co si takový průchod opravdu vykope, popíšou jeho vlastní
    // nájezd/dojezd po kontuře níž.
    const noFloor = Number.isFinite(pass.zStart) && Number.isFinite(pass.zEnd)
      && Math.abs(pass.zStart - pass.zEnd) < 1e-6;
    if (!noFloor) {
      if (pass.rampFeedFrom) push(pass.rampFeedFrom.x, pass.rampFeedFrom.z);
      else if (pass.ramp) push(pass.ramp.x0, pass.ramp.z0);
      push(pass.x, pass.zStart);
      push(pass.x, pass.zEnd);
    }
  }
  if (chain.length >= 2) out.push(chain);
  // Sledování kontury je taky řez. V emisi ho model dostane přes
  // `noteCutMove`/`noteCutArc` u každého vydaného pohybu; tady je to jediné
  // místo, kde se o něm ví.
  for (const key of ['contourLeadIn', 'contourLeadOut']) {
    const segs = pass[key];
    if (!Array.isArray(segs) || segs.length === 0) continue;
    const run = [];
    for (const s of segs) {
      if (![s.z1, s.x1, s.z2, s.x2].every(Number.isFinite)) continue;
      const l = run[run.length - 1];
      if (!l || Math.hypot(l.x - s.x1, l.z - s.z1) > 1e-6) run.push({ x: s.x1, z: s.z1 });
      pushArcOrChord(run, s, arcTol);
    }
    if (run.length >= 2) out.push(run);
  }
  return out;
}

/**
 * Oblouk se do modelu NESMÍ zapsat tětivou — u vypuklého tvaru leží hlouběji
 * v materiálu než skutečná dráha, takže model „odebere" pásek o výšce sagitty,
 * který ve skutečnosti stojí. Táž oprava, jakou dostal `noteCutArc`
 * v gcodeEmit.js 12. 8. 2026 (tam to dělalo 0,30–0,47 mm); v trackeru to
 * na fixtures dělalo 0,30–0,74 mm. Bez středu/úhlů zůstane tětiva.
 *
 * Krok dělí SAGITTA, ne pevná délka tětivy. `noteCutArc` v emisi vzorkuje po
 * 0,1 mm nezávisle na rádiusu, takže na velkém oblouku sype vzorky, které
 * nikomu nic nepřinesou (sagitta 0,1 mm tětivy na r 50 je 0,000025 mm),
 * a na malém jich má málo. Z L²/(8r) ≤ tol plyne L ≤ √(8·r·tol) — chyba je
 * tím shora omezená a počet vzorků klesá s druhou odmocninou rádiusu.
 * Cena `toolSweep` je přitom lineární v počtu bodů dráhy.
 */
function pushArcOrChord(run, s, arcTol = ARC_SAGITTA_TOL) {
  if (s.type !== 'arc' || !Number.isFinite(s.cx) || !Number.isFinite(s.cz) || !(s.r > 0)
    || !Number.isFinite(s.startAngle) || !Number.isFinite(s.endAngle)) {
    run.push({ x: s.x2, z: s.z2 });
    return;
  }
  const a0 = s.startAngle;
  let a1 = s.endAngle;
  if (s.dir === 'G2' && a1 > a0) a1 -= 2 * Math.PI;
  if (s.dir === 'G3' && a1 < a0) a1 += 2 * Math.PI;
  const maxChord = Math.sqrt(8 * s.r * Math.max(arcTol, 1e-6));
  const n = Math.max(2, Math.min(64, Math.ceil(Math.abs(a1 - a0) * s.r / maxChord)));
  for (let i = 1; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    run.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
  }
}

export class ResidualTracker {
  /**
   * @param {object} prms parametry CAM
   * @param {Array} stockPathSegments silueta odlitku (u válce se ignoruje)
   * @param {{seedLoop?: Array, raw?: boolean, footprint?: Array, arcTol?: number}} [opts]
   *   `seedLoop` — hotová výchozí smyčka (strategie si drží vlastní, přes
   *     CELÝ polotovar bez ořezu rozsahem 📐: držák narazí i do materiálu za
   *     hranicí rozsahu, ten se jen neobrábí).
   *   `raw` — základem je SYROVÁ silueta místo offsetové čáry. Výchozí je
   *     offsetová: odlitek může být až u ní, takže pro hlídání je to jediná
   *     bezpečná strana (rozhodnutí 20. 8. 2026, viz collisionValidator.js).
   *     Plán psal `buildStockLoopRaw`; syrový základ by byl MÉNĚ přísný než
   *     dnešní výškové pole, které se staví nad offsetovou čarou.
   *   `arcTol` — nejvyšší dovolená SAGITTA při vzorkování oblouků
   *     (výchozí `ARC_SAGITTA_TOL`). Hrubší = rychlejší, ale model se vzdálí
   *     realitě; mez hlídá `tests/cam-strategy-residual`.
   */
  constructor(prms, stockPathSegments, opts = {}) {
    this.arcTol = Number.isFinite(opts.arcTol) ? opts.arcTol : ARC_SAGITTA_TOL;
    let seed = opts.seedLoop || null;
    if (!seed) {
      const raw = buildStockLoopRaw(prms, stockPathSegments);
      seed = raw ? (opts.raw ? raw : (offsetStockLoop(raw, prms) || raw)) : null;
    }
    this.seedLoop = seed;
    this.foot = opts.footprint || toolFootprint(prms);
    this.model = seed ? new StockModel([seed]) : null;
    this.count = 0;      // kolik průchodů je zapsáno
    this._cuts = 0;      // počítadlo řezů kvůli periodickému simplify
  }

  get valid() { return !!this.model; }

  /** Aktuální zbytek jako smyčky (prázdné pole, když model není). */
  get loops() { return this.model ? this.model.loops : []; }

  /**
   * Zapíše JEDEN průchod v pořadí, v jakém se bude obrábět.
   * Vrací `true`, když se něco odebralo.
   */
  notePass(pass) {
    if (!this.model) return false;
    const runs = passCutPolylines(pass, this.arcTol);
    if (runs.length === 0) return false;
    const cutLoops = [];
    for (const r of runs) {
      // Model je jen měřidlo — jeden nevydařený sweep nesmí shodit výpočet.
      try { cutLoops.push(...toolSweep(this.foot, r)); } catch { /* dál */ }
    }
    if (cutLoops.length === 0) return false;
    try { this.model.cut(cutLoops); } catch { return false; }
    this.count++;
    // Rozdíly postupně přidávají vrcholy — periodicky zjednodušit, ať další
    // řezy i dotazy zůstanou rychlé (ε hluboko pod řeznou tolerancí).
    if (++this._cuts % 24 === 0) this.model.loops = polySimplify(this.model.loops, 0.002);
    return true;
  }

  /** Postaví model znovu z celého pole průchodů (pořadí = pořadí v poli). */
  noteAll(passes) {
    if (!this.model) return this;
    this.model = new StockModel([this.seedLoop]);
    this.count = 0; this._cuts = 0;
    for (const p of passes || []) this.notePass(p);
    return this;
  }

  /**
   * Nejvyšší materiál na svislici Z (null = zbytek tam nesahá).
   * Na rozdíl od výškového pole vrací SKUTEČNÝ povrch i nad tunelem.
   */
  topAt(z) {
    let top = null;
    for (const loop of this.loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
          const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
          if (top === null || x > top) top = x;
        }
      }
    }
    return top;
  }
}

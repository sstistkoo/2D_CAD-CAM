// Reálné rychlosti pohybu [mm/min] — JEDEN zdroj pravdy pro odhad času
// programu (⏱ overlay) i pro časově věrné přehrávání simulace (1× = reálná
// rychlost stroje).
//
// Rychlost segmentu vychází z toho, co je v G-kódu MODÁLNĚ platné na jeho
// řádku (F/S/G94…G99 sbírá do bodů dráhy parseManualGCodeToPath):
//   G0                → rychloposuv (parametr „Rychloposuv", výchozí 6000)
//   G95 / G99 (mm/ot) → F · n, kde n = otáčky vřetene v daném průměru
//   G94 / G98 (mm/min)→ přímo F
// Otáčky pod G96 (konst. řezná rychlost) = Vc·1000/(π·D) omezené LIMS,
// pod G97 platí naprogramované otáčky přímo (závitování).
//
// `mod` = bod simPath s modálním kontextem řádku:
//   { type, feed, feedMode:'G94'|'G95', spindleMode:'G96'|'G97', spindleVal, lims }
// Chybějící položky se doplní z CAM parametrů (prms).

export const DEFAULT_RAPID_FEED = 6000;   // mm/min
export const DEFAULT_MAX_RPM = 2000;      // když v kódu ani v machineType není LIMS

/** Limit otáček stroje [1/min] — z „LIMS=…" v machineType. */
export function machineLimitRpm(prms) {
  const m = String(prms?.machineType || '').match(/LIMS\s*=\s*(\d+)/i);
  const v = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_RPM;
}

/** Rychloposuv G0 [mm/min] z parametrů. */
export function rapidFeedMmMin(prms) {
  const v = parseFloat(prms?.rapidFeed);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_RAPID_FEED;
}

/**
 * Otáčky vřetene [1/min] na daném POLOMĚRU (ne průměru) obrobku.
 * @param {number} xRadius poloměr [mm]
 */
export function spindleRpmAt(xRadius, prms, mod) {
  const lims = (mod && mod.lims > 0) ? mod.lims : machineLimitRpm(prms);
  const sVal = (mod && Number.isFinite(mod.spindleVal) && mod.spindleVal > 0) ? mod.spindleVal : null;
  // G97 = konstantní otáčky: S je rovnou v ot/min (LIMS se neuplatní).
  if (mod && mod.spindleMode === 'G97') return sVal || lims;
  const vc = sVal ?? (parseFloat(prms?.speed) || 0);
  if (vc <= 0) return lims;
  const dia = Math.max(Math.abs(xRadius || 0) * 2, 1e-3);
  const rpm = (vc * 1000) / (Math.PI * dia);
  return Math.min(rpm, lims);   // u osy (D→0) jede stroj na limitu otáček
}

/**
 * Rychlost pohybu [mm/min] pro cílový bod dráhy na daném poloměru.
 * Řezný posuv se shora omezuje rychloposuvem — rychleji stroj neumí.
 */
export function moveRateMmMin(pt, xRadius, prms) {
  const rapid = rapidFeedMmMin(prms);
  if (!pt || pt.type === 'G0') return rapid;
  const f = (Number.isFinite(pt.feed) && pt.feed > 0) ? pt.feed : (parseFloat(prms?.feed) || 0.1);
  if (pt.feedMode === 'G94') return Math.min(Math.max(f, 0.001), rapid);
  const rpm = spindleRpmAt(xRadius, prms, pt);
  return Math.min(Math.max(f * rpm, 0.001), rapid);
}

/** Rychlost [mm/min] segmentu p1→p2 (modální stav nese cílový bod p2). */
export function segmentRateMmMin(p1, p2, prms) {
  const xMid = ((p1?.x || 0) + (p2?.x || 0)) / 2;
  return moveRateMmMin(p2, xMid, prms);
}

/**
 * Čas a délka celé dráhy.
 * @returns {{seconds:number, length:number}}
 */
export function pathTimeSeconds(path, prms) {
  let seconds = 0, length = 0;
  for (let i = 0; i < (path?.length || 0) - 1; i++) {
    const p1 = path[i], p2 = path[i + 1];
    const d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    length += d;
    if (d <= 0) continue;
    const rate = segmentRateMmMin(p1, p2, prms);
    if (rate > 0) seconds += (d / rate) * 60;
  }
  return { seconds, length };
}

/**
 * Posun po dráze o `dtSec` sekund STROJNÍHO času — každý segment se ujíždí
 * svojí skutečnou rychlostí. Vstup i výstup je podíl 0..1 v INDEXECH bodů
 * dráhy (v téhle konvenci žije simProgress i progress bar).
 */
export function advanceAlongPath(path, progress, dtSec, prms) {
  const total = (path?.length || 0) - 1;
  if (total <= 0) return 1;
  let pos = Math.max(0, Math.min(total, (progress || 0) * total));
  let budgetMin = Math.max(0, dtSec) / 60;
  let guard = total + 2;                      // pojistka proti zacyklení
  while (budgetMin > 0 && pos < total && guard-- > 0) {
    const i = Math.min(Math.floor(pos), total - 1);
    const frac = pos - i;
    const p1 = path[i], p2 = path[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (segLen <= 1e-9) { pos = i + 1; continue; }   // nulový segment: rovnou dál
    const rate = segmentRateMmMin(p1, p2, prms);
    const restMin = (segLen * (1 - frac)) / rate;
    if (restMin > budgetMin) { pos = i + frac + (budgetMin * rate) / segLen; budgetMin = 0; }
    else { budgetMin -= restMin; pos = i + 1; }
  }
  return Math.min(1, pos / total);
}

/**
 * Kumulativní čas [s] od začátku dráhy do každého jejího bodu.
 * Počítá se jednou na dráhu (ne každý snímek) — z profilu se pak ubíhající
 * čas dopočítá lineárně, protože rychlost je uvnitř segmentu konstantní.
 */
export function buildTimeProfile(path, prms) {
  const n = path?.length || 0;
  const prof = new Float64Array(Math.max(n, 1));
  for (let i = 0; i < n - 1; i++) {
    const p1 = path[i], p2 = path[i + 1];
    const d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const rate = d > 0 ? segmentRateMmMin(p1, p2, prms) : 1;
    prof[i + 1] = prof[i] + (d > 0 ? (d / rate) * 60 : 0);
  }
  return prof;
}

/** Ubíhající čas [s] v daném podílu dráhy (0..1 v indexech bodů). */
export function elapsedAtProgress(profile, progress) {
  const total = profile.length - 1;
  if (total <= 0) return 0;
  const pos = Math.max(0, Math.min(total, (progress || 0) * total));
  const i = Math.min(Math.floor(pos), total - 1);
  return profile[i] + (pos - i) * (profile[i + 1] - profile[i]);
}

/** Formát stopek „1:05" / „1:02:30". */
export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const mm = Math.floor(s / 60) % 60, ss = s % 60, hh = Math.floor(s / 3600);
  const tail = `${String(mm).padStart(hh > 0 ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
  return hh > 0 ? `${hh}:${tail}` : tail;
}

/** Formát času „6m 20s" / „12s". */
export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

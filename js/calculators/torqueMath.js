// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Utahovací momenty (výpočty a orientační data)       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čisté funkce bez DOM – testy v tests/torqueMath.test.js.
// 1) orientační momenty upínacích šroubů VBD (Torx) – rozsah z katalogů,
// 2) šroub metrický hrubý podle VDI 2230 (90 % meze kluzu), např. upínky
//    a čelisti na desce karuselu,
// 3) korekce nastavení momentového klíče s prodloužením, převody jednotek.

/**
 * Upínací šrouby VBD s Torx hlavou – rozsah momentu [Nm] podle katalogů.
 * Zdroje: Kennametal „Torque Recommendations" (řada MS…), Denitool
 * „Tightening torque". Výrobci se liší (např. M3,5: 1,7 vs 3,4 Nm), proto
 * jen orientačně – platí hodnota na držáku / obalu šroubu / v katalogu.
 * [závit, klíč, Nm min, Nm max, typické použití]
 */
export const INSERT_SCREWS = [
  ['M2', 'T6', 0.47, 0.6, 'malé VBD, vyvrtávací tyče'],
  ['M2,2', 'T7', 1.0, 1.0, 'malé VBD'],
  ['M2,5', 'T7 / T8', 1.0, 1.3, 'malé VBD'],
  ['M3', 'T8 / T9', 1.7, 2.2, 'střední VBD'],
  ['M3,5', 'T15', 1.7, 3.4, 'střední VBD'],
  ['M4', 'T15', 2.6, 5.1, 'střední VBD'],
  ['M4,5', 'T15 / T20', 3.8, 3.8, 'větší VBD'],
  ['M5', 'T20', 5.1, 5.1, 'větší VBD'],
  ['M6', 'T25', 8.8, 9.0, 'velké VBD – karusel'],
  ['M8', 'T30', 21, 21, 'velké hrubovací VBD – karusel'],
];

/**
 * Kennametal Kenloc – upínací čep negativních VBD s otvorem (CNMG, DNMG, TNMG, WNMG, SNMG),
 * dotahuje se imbusem. Zdroj: Kennametal „Torque Recommendations" (řada KLM…).
 * Číslice v označení = vepsaná kružnice IC v osminách palce (KLM-46 → ½" = 12,7 mm).
 * [imbus mm, čep, závit, Nm, IC mm, příklady VBD]
 */
export const KENLOC_PINS = [
  [2, 'KLM-33 / KLM-34', 'M5', 1.7, 9.525, 'CNMG 09, DNMG 11, TNMG 16, WNMG 06'],
  [2.5, 'KLM-44 / KLM-46', 'M6,3', 3.3, 12.7, 'CNMG 12, DNMG 15, TNMG 22, WNMG 08, SNMG 12'],
  [3, 'KLM-56 / KLM-58', 'M8', 5.5, 15.875, 'CNMG 16, SNMG 15'],
];

/** ISO / ANSI označení VBD → vepsaná kružnice IC [mm] a zda je negativní (2. písmeno N). */
const IC_ISO = {
  C09: 9.525, C12: 12.7, C16: 15.875, C19: 19.05, C25: 25.4,
  D11: 9.525, D15: 12.7, D19: 15.875,
  S09: 9.525, S12: 12.7, S15: 15.875, S19: 19.05, S25: 25.4,
  T16: 9.525, T22: 12.7, T27: 15.875, T33: 19.05,
  W06: 9.525, W08: 12.7, V16: 9.525,
};
export function insertIC(code) {
  const c = String(code || '').toUpperCase().replace(/[\s-]/g, '');
  let m = c.match(/^([CDSTWV])([A-Z])[A-Z]{2}(\d{2})[\dT]\d{3}/);          // ISO: CNMG120412
  if (m) return IC_ISO[m[1] + m[3]] ? { ic: IC_ISO[m[1] + m[3]], neg: m[2] === 'N' } : null;
  m = c.match(/^([CDSTWV])([A-Z])[A-Z]{2}(\d)\d\d/);                 // ANSI: CNMG433
  if (m) return { ic: +m[3] * 25.4 / 8, neg: m[2] === 'N' };
  return null;
}

/** Text klíče → průměr imbusu v mm (např. „imbus 2,5", „2.5", „SW3"), Torx → null. */
export function hexKeyOf(text) {
  const m = String(text || '').trim().match(/^(?:imbus|inbus|hex|sw|šestihran)?\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?$/i);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

/** Pevnostní třídy: [klíč, název, Rp0,2 MPa do M16, Rp0,2 MPa nad M16]. */
export const STRENGTH_CLASSES = [
  ['8.8', '8.8', 640, 660],
  ['10.9', '10.9', 940, 940],
  ['12.9', '12.9', 1100, 1100],
  ['A2-70', 'A2-70 (nerez)', 450, 450],
  ['A4-80', 'A4-80 (nerez)', 600, 600],
];

/** Součinitel tření μ (závit = hlava) podle stavu povrchu (VDI 2230, orientačně). */
export const FRICTION = [
  ['0.10', '0,10 – mazáno (MoS₂, pasta)'],
  ['0.12', '0,12 – lehce naolejováno (výchozí)'],
  ['0.14', '0,14 – černěno / zinek, olej'],
  ['0.16', '0,16 – suché, bez mazání'],
];

/**
 * Metrický hrubý závit: [d mm, stoupání P, rozměr hlavy dw mm (hex/imbus), díra dh mm (střední ISO 273)].
 */
export const METRIC_BOLTS = [
  [4, 0.7, 7, 4.5], [5, 0.8, 8, 5.5], [6, 1, 10, 6.6], [8, 1.25, 13, 9],
  [10, 1.5, 16, 11], [12, 1.75, 18, 13.5], [14, 2, 21, 15.5], [16, 2, 24, 17.5],
  [18, 2.5, 27, 20], [20, 2.5, 30, 22], [22, 2.5, 32, 24], [24, 3, 36, 26],
  [27, 3, 41, 30], [30, 3.5, 46, 33], [36, 4, 55, 39],
];

/**
 * Montážní moment a předpětí šroubu podle VDI 2230 (využití meze kluzu ν).
 * @param {{d:number, P:number, dw:number, dh:number, Rp:number, mu:number, muK?:number, nu?:number}} p
 * @returns {{FM:number, MA:number, As:number, d2:number}|null} FM v N, MA v Nm
 */
export function boltTorque({ d, P, dw, dh, Rp, mu, muK = mu, nu = 0.9 }) {
  if (!(d > 0 && P > 0 && dw > dh && Rp > 0 && mu > 0 && muK > 0 && nu > 0 && nu <= 1)) return null;
  const d2 = d - 0.649519 * P;                                   // střední průměr závitu
  const d3 = d - 1.226869 * P;                                   // malý průměr šroubu
  const d0 = (d2 + d3) / 2;
  const As = Math.PI / 4 * d0 * d0;                              // výpočtový průřez
  const k = 1.5 * (d2 / d0) * (P / (Math.PI * d2) + 1.155 * mu); // krut v závitu
  const FM = nu * Rp * As / Math.sqrt(1 + 3 * k * k);
  const DKm = (dw + dh) / 2;                                     // střední Ø dosedací plochy hlavy
  const MA = FM * (0.16 * P + 0.58 * d2 * mu + DKm / 2 * muK) / 1000;
  return { FM, MA, As, d2 };
}

/** Rp0,2 pevnostní třídy pro daný průměr (8.8 má nad M16 vyšší mez). */
export function yieldOf(cls, d) {
  const c = STRENGTH_CLASSES.find(r => r[0] === cls);
  if (!c) return null;
  return d > 16 ? c[3] : c[2];
}

/**
 * Nastavení momentového klíče s prodloužením (nástavec v ose klíče).
 * L = účinná délka klíče (střed rukojeti → osa čtyřhranu), a = přesah nástavce.
 * Nástavec otočený o 90° moment nemění (a = 0).
 */
export function wrenchSetting(target, L, a) {
  if (!(target > 0 && L > 0) || !Number.isFinite(a) || L + a <= 0) return null;
  return target * L / (L + a);
}

/** Převody jednotek momentu na Nm. */
export const TORQUE_UNITS = [
  ['Nm', 'Nm', 1],
  ['cNm', 'cNm', 0.01],
  ['kgfm', 'kgf·m', 9.80665],
  ['kgfcm', 'kgf·cm', 0.0980665],
  ['lbfft', 'lbf·ft', 1.3558179],
  ['lbfin', 'lbf·in', 0.11298483],
];

export function convertTorque(value, from, to) {
  const f = TORQUE_UNITS.find(u => u[0] === from), t = TORQUE_UNITS.find(u => u[0] === to);
  if (!f || !t || !Number.isFinite(value)) return null;
  return value * f[2] / t[2];
}

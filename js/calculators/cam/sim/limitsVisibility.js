// ╔══════════════════════════════════════════════════════════════╗
// ║  Schovat / ukázat meze (čelisti, koník, rozsahy 📐) ikonou       ║
// ╚══════════════════════════════════════════════════════════════╝
// Uživatel 4. 11. 2026: „když je schovám přes tu ikonu, ať nejsou aktivní,
// ale zachovají si souřadnice v nastavení". Schování proto vypne příznaky
// aktivity (dráhy se počítají bez mezí) a uloží si je do
// `S.zLimits.hiddenFlags` — ukládá se tak s projektem. Zobrazení je vrátí.
// Souřadnice (chuck, tail, rangeStart/End, rangeXMin/Max) se nemění nikdy.

const Z_KEYS = ['chuckActive', 'tailActive', 'rangeActive'];
const X_KEYS = ['active', 'minActive', 'maxActive'];

/** Schovat: uložit, které meze platily, a vypnout je. */
export function hideLimits(S) {
  const zl = S.zLimits || (S.zLimits = {}), xl = S.xLimits || (S.xLimits = {});
  if (zl.hiddenFlags) return;   // už schované
  const flags = { z: {}, x: {} };
  for (const k of Z_KEYS) { flags.z[k] = !!zl[k]; zl[k] = false; }
  for (const k of X_KEYS) { if (k in xl) flags.x[k] = !!xl[k]; xl[k] = false; }
  zl.hiddenFlags = flags;
}

/** Ukázat: vrátit meze, které platily před schováním. */
export function showLimits(S) {
  const zl = S.zLimits || {}, xl = S.xLimits || {};
  const flags = zl.hiddenFlags;
  if (!flags) return;
  for (const k of Z_KEYS) if (k in flags.z) zl[k] = flags.z[k];
  for (const k of X_KEYS) if (k in flags.x) xl[k] = flags.x[k];
  delete zl.hiddenFlags;
}

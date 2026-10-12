// ╔══════════════════════════════════════════════════════════════╗
// ║  Nůž podle strategie hrubování (polygon PSKNR ↔ PSBNR)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 12. 10. 2026: u polygonového plátku se po přepnutí Čelně → Podélně
// změnilo jen natočení plátku, držák zůstal čelní (PSKNR) a musel se měnit
// ručně. Výchozí sada zásobníku má pro každou strategii svůj držák
// (magazineDefaults.js): čelně PSKNR 2525M12, podélně PSBNR 2525M12.
// Přepnutí strategie proto vymění i nůž — ze 🔧 Zásobníku.
//
// Mění se JEN nůž, který je sám jedním z této dvojice; vlastní / jiný
// polygonový držák se strategií nehýbe.

const STRATEGY_PREFIX = { face: 'PSKNR', longitudinal: 'PSBNR' };
const PAIR_PREFIXES = Object.values(STRATEGY_PREFIX);

/**
 * Index slotu zásobníku, na který se má vyměnit nůž při přepnutí na `strategy`;
 * −1 = nic neměnit (jiný tvar, cizí držák, už je správný, ve slotech chybí).
 * @param {Array} magazine  S.toolMagazine
 * @param {{toolShape?: string, toolName?: string}} params
 * @param {string} strategy 'face' | 'longitudinal'
 */
export function strategyKnifeSlot(magazine, params, strategy) {
  const want = STRATEGY_PREFIX[strategy];
  if (!want || !params || params.toolShape !== 'polygon' || !Array.isArray(magazine)) return -1;
  const cur = String(params.toolName || '').toUpperCase();
  if (cur.startsWith(want) || !PAIR_PREFIXES.some((p) => cur.startsWith(p))) return -1;
  return magazine.findIndex((s) => s && (s.shape || 'round') === 'polygon' && String(s.name || '').toUpperCase().startsWith(want));
}

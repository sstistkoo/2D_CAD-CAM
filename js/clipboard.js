// Zápis do schránky se zálohou.
// navigator.clipboard chybí mimo zabezpečený kontext (http v síti LAN, starší
// WebView) a může zápis odmítnout (oprávnění). Pak zkusí skrytou textareu
// + execCommand('copy'). Když se nepovede nic, Promise se odmítne – volající
// tak může ukázat chybu místo tichého selhání.

/**
 * @param {string} text
 * @returns {Promise<void>} splněno po zápisu, odmítnuto když schránka není dostupná
 */
export async function writeClipboard(text) {
  const s = String(text ?? '');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return;
    }
  } catch (_) { /* zkusit zálohu */ }
  if (!fallbackCopy(s)) throw new Error('Schránka není dostupná');
}

function fallbackCopy(text) {
  if (typeof document === 'undefined' || !document.body) return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  ta.remove();
  try { prevFocus?.focus?.(); } catch (_) { /* nic */ }
  return ok;
}

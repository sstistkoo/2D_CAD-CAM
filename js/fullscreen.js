// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – celá obrazovka (schová adresní řádek prohlížeče)    ║
// ╚══════════════════════════════════════════════════════════════╝
// Fullscreen API jde spustit jen z kliku. Nainstalovaná PWA se řídí
// `display: fullscreen` v manifest.json – tohle je pro běh v záložce prohlížeče.

export function fullscreenSupported() {
  return !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
}

export function isFullscreen() {
  return !!document.fullscreenElement;
}

/** Přepne celou obrazovku; vrací Promise<boolean> = zda je po přepnutí zapnutá. */
export async function toggleFullscreen() {
  if (!fullscreenSupported()) return false;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* prohlížeč odmítl – stav se jen přečte níž */ }
  return isFullscreen();
}

/** HTML tlačítka do Nastavení (prázdné, když to prohlížeč neumí). */
export function fullscreenButtonHTML(style) {
  if (!fullscreenSupported()) return '';
  return `<button class="calc-btn" id="settFullscreen" style="${style}" title="Schová adresní řádek prohlížeče – výkres přes celý displej">⛶ Celá obrazovka</button>`;
}

export function wireFullscreenButton(root) {
  const btn = root.querySelector('#settFullscreen');
  if (!btn) return;
  const sync = () => { btn.textContent = isFullscreen() ? '⛶ Ukončit celou obrazovku' : '⛶ Celá obrazovka'; };
  sync();
  btn.addEventListener('click', async () => { await toggleFullscreen(); sync(); });
}

const UNDO_DOUBLE_TAP_MS = 350;
let lastUndoTap = 0;

/**
 * Dvojklep na mobilní ↩ končí celou obrazovku. Volá se při KAŽDÉM klepnutí
 * PŘED undo(); vrátí true = je to druhý klep, volající si první (už provedené)
 * undo vezme zpět přes redo() a další undo už nedělá.
 */
export function undoDoubleTapExitsFullscreen(now = Date.now()) {
  const dbl = isFullscreen() && now - lastUndoTap < UNDO_DOUBLE_TAP_MS;
  lastUndoTap = dbl ? 0 : now;
  if (dbl) document.exitFullscreen().catch(() => {});
  return dbl;
}

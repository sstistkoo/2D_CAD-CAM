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

// ── Okraje v celé obrazovce ──
// V celé obrazovce se kreslí i pod výřez kamery. Prohlížeč hlásí jeho okraj přes
// env(safe-area-inset-*) ne vždy, proto se na straně kamery drží pevná rezerva
// (css/landscape-mobile.css: html.fs-cam-left / fs-cam-right). Naležato leží
// kamera na straně, kam míří vršek telefonu: landscape-primary = vlevo.
function inFullscreen() {
  return isFullscreen() || (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
}

export function syncFullscreenState() {
  const root = document.documentElement;
  const landscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
  const on = inFullscreen() && landscape;
  const secondary = screen.orientation && screen.orientation.type === 'landscape-secondary';
  root.classList.toggle('fs-cam-left', on && !secondary);
  root.classList.toggle('fs-cam-right', on && secondary);
  const btn = document.getElementById('sidebarFullscreenBtn');
  if (btn) btn.classList.toggle('active', isFullscreen());
}

/** ⛶ v horní liště bočního panelu (zobrazí se jen tam, kde to prohlížeč umí). */
function wireSidebarButton() {
  const btn = document.getElementById('sidebarFullscreenBtn');
  if (!btn || !fullscreenSupported()) return;
  btn.hidden = false;
  btn.addEventListener('click', async (e) => { e.stopPropagation(); await toggleFullscreen(); syncFullscreenState(); });
}

/** Volá se jednou při startu aplikace (js/app.js) – modul sám nic nevěší. */
export function initFullscreen() {
  document.addEventListener('fullscreenchange', syncFullscreenState);
  window.addEventListener('resize', syncFullscreenState);
  window.addEventListener('orientationchange', syncFullscreenState);
  wireSidebarButton();
  syncFullscreenState();
}

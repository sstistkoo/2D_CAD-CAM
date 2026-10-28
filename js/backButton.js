// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Tlačítko „Zpět" (Android/prohlížeč) = o jeden krok  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Bez tohoto modulu tlačítko Zpět ukončí PWA, resp. na webu vrátí na
// předchozí stránku. Tady se místo toho vrací o JEDEN krok v aplikaci:
//
//   1. zavře nejvyšší modální okno / dialog
//   2. zavře nápovědu
//   3. zavře boční panel / rozbalenou lištu (mobil)
//   4. zruší rozdělanou práci (kreslení, výběr) – stejně jako Escape
//   5. zavře nejvyšší plovoucí okno (VK, CAM… s data-keep-on-esc)
//   6. přepne zpět na nástroj Výběr
//   7. nic nezbývá → toast „stiskněte Zpět znovu"; druhé Zpět do 2 s skončí
//
// Technika: v historii prohlížeče leží jeden „zarážkový" záznam navíc.
// Zpět ho odebere (událost popstate), aplikace provede krok a zarážku
// hned vrátí. Zarážka se vkládá až po první interakci uživatele – Chrome
// na Androidu jinak záznamy bez gesta při Zpět přeskakuje.

import { state, showToast } from './state.js';
import { bridge } from './bridge.js';

/** Do kolika ms musí přijít druhé Zpět na nejvyšší úrovni, aby aplikace skončila. */
export const EXIT_WINDOW_MS = 2000;

const MODAL_SELECTOR = '.input-overlay:not([data-keep-on-esc]), .calc-overlay:not([data-keep-on-esc])';
const FLOATING_SELECTOR = '.input-overlay[data-keep-on-esc], .calc-overlay[data-keep-on-esc]';
const CLOSE_BTN_SELECTOR = '.calc-close-btn, [data-close], .modal-close, .dlg-close';

/** Klíče `state`, jejichž neprázdná hodnota znamená rozdělaný nástroj (viz resetDrawingState). */
const PENDING_KEYS = [
  '_tangentMode', '_trimLine', '_extendLine', '_offsetPendingSide', '_filletFirstLine',
  '_dimFirstLine', '_dimSecondLine', '_dimPlacing', '_dimAnglePlacing', '_mirrorObj',
  '_copyPlaceObjects', '_rotateObjects', '_toolCleanup',
];

let armed = false;
let leaving = false;
let lastRootBack = 0;

function zIndexOf(el) {
  return parseInt(getComputedStyle(el).zIndex, 10) || 0;
}

/** Prvek s nejvyšším z-indexem; při shodě vyhrává ten, co je v DOM později. */
function topmost(list) {
  let top = list[0];
  let topZ = zIndexOf(top);
  for (const el of list) {
    const z = zIndexOf(el);
    if (z >= topZ) { top = el; topZ = z; }
  }
  return top;
}

/** Zavře okno jeho vlastním křížkem (aby proběhl úklid), jinak ho odstraní. */
function closeOverlay(overlay) {
  const btn = overlay.querySelector(CLOSE_BTN_SELECTOR);
  if (btn) btn.click();
  else overlay.remove();
}

function hasWorkInProgress() {
  if (state.drawing || state._rectSelecting) return true;
  if (state.tempPoints && state.tempPoints.length > 0) return true;
  if (state.selected != null || state.selectedSegment != null || state.selectedPoint) return true;
  if (state.multiSelected && state.multiSelected.size > 0) return true;
  if (state.multiSelectedSegments && state.multiSelectedSegments.size > 0) return true;
  if (state._chainDimCount > 0) return true;
  return PENDING_KEYS.some(k => state[k]);
}

/**
 * Provede jeden krok zpět.
 * @returns {boolean} `true` = něco se zavřelo/zrušilo, `false` = není kam jít
 */
export function stepBack() {
  const modals = document.querySelectorAll(MODAL_SELECTOR);
  if (modals.length) { closeOverlay(topmost([...modals])); return true; }

  const help = document.getElementById('helpOverlay');
  if (help && help.classList.contains('visible')) { help.classList.remove('visible'); return true; }

  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    const btn = document.getElementById('sidebarCloseBtn');
    if (btn) btn.click();
    else sidebar.classList.remove('mobile-open');
    return true;
  }
  const topbar = document.getElementById('topbar');
  if (topbar && topbar.classList.contains('mobile-open')) {
    const btn = document.getElementById('mobileToolbarClose');
    if (btn) btn.click();
    else topbar.classList.remove('mobile-open');
    return true;
  }

  if (hasWorkInProgress()) {
    // Globální Escape v events.js zruší kreslení i výběr jedním krokem.
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    }));
    return true;
  }

  const floating = document.querySelectorAll(FLOATING_SELECTOR);
  if (floating.length) { closeOverlay(topmost([...floating])); return true; }

  if (state.tool && state.tool !== 'select' && bridge.setTool) {
    bridge.setTool('select');
    return true;
  }
  return false;
}

function pushSentinel() {
  try { history.pushState({ skica: 'top' }, ''); } catch { /* sandbox bez History API */ }
}

/** Reakce na tlačítko Zpět – zarážka už je odebrána, ať aplikace ostane. */
export function onPopState() {
  if (!armed || leaving) return;
  if (stepBack()) {
    lastRootBack = 0;
    pushSentinel();
    return;
  }
  const now = Date.now();
  if (lastRootBack && now - lastRootBack < EXIT_WINDOW_MS) {
    leaving = true;      // druhé Zpět: zarážku nevracíme, aplikace může skončit
    history.back();
    return;
  }
  lastRootBack = now;
  pushSentinel();
  showToast('Pro ukončení stiskněte Zpět znovu', EXIT_WINDOW_MS);
}

/** Vloží zarážku do historie (jednou, po první interakci). */
function arm() {
  if (armed) return;
  armed = true;
  if (history.state && history.state.skica === 'top') return; // po reloadu už tam je
  try { history.replaceState({ skica: 'root' }, ''); } catch { /* ignorovat */ }
  pushSentinel();
}

/** Zapne obsluhu tlačítka Zpět. Volat jednou při startu aplikace. */
export function initBackButton() {
  if (typeof window === 'undefined' || !window.history || typeof history.pushState !== 'function') return;
  window.addEventListener('popstate', onPopState);
  // Zarážka až po gestu uživatele (Chrome jinak záznam při Zpět přeskočí).
  for (const type of ['pointerdown', 'touchstart', 'keydown']) {
    window.addEventListener(type, arm, { once: true, capture: true, passive: true });
  }
}

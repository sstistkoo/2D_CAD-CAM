/**
 * Kreslicí lišta editoru G-kódu (editor z Kalkulaček) – přepínače a šipky
 * (uživatel 13. 11. 2026):
 *  – G90/G91 je jedno tlačítko: ukazuje režim platný na řádku s kurzorem,
 *    klik zapíše na řádek ten druhý,
 *  – ✎K / ✎P = zadávám konturu / polotovar, barvou kreslení (modrá / červená),
 *  – šipky ← ↑ ↓ → a ⇤ ⇥ (začátek / konec řádku) posouvají kurzor;
 *    podržením se posun opakuje.
 */
import { contourDefaultColor, stockDefaultColor } from '../drawColorPrefs.js';
import { ensureCaretVisible } from './cncCaretVisible.js';
import { caretInStock, toggleStock } from './cncStockMarkers.js';
import { wireLineTools } from './cncLineTools.js';

export { caretInStock };

/** Klik na ✎K / ✎P (cncStockMarkers.js): značka / dvojice značek, nebo zrušení té poslední. */
export function applyStockToggle(editor, snapshot, after) {
  const r = toggleStock(editor.value, editor.selectionStart ?? 0);
  const { scrollTop, scrollLeft } = editor;
  editor.readOnly = false;
  snapshot('Značka', r.label);
  editor.value = r.value;
  editor.selectionStart = editor.selectionEnd = r.caret;
  editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
  editor.focus({ preventScroll: true });
  ensureCaretVisible(editor);
  after();
}

/**
 * G90 / G91 platné na řádku s pozicí `pos` (poslední výskyt do konce řádku,
 * poznámky za středníkem se nepočítají). Bez zápisu platí G90.
 */
export function activeCoordG(v, pos) {
  let le = v.indexOf('\n', pos ?? 0); if (le < 0) le = v.length;
  let g = 'G90';
  for (const line of v.slice(0, le).split('\n')) {
    const code = line.split(';')[0];
    const all = code.match(/\bG9[01]\b/gi);
    if (all) g = all[all.length - 1].toUpperCase();
  }
  return g;
}

/** Druhý režim než ten platný – ten zapíše klik na přepínač. */
export function nextCoordG(editor) {
  return activeCoordG(editor.value, editor.selectionStart) === 'G90' ? 'G91' : 'G90';
}

/** Překreslí přepínače lišty podle polohy kurzoru. */
export function syncQuickKeys(root, editor) {
  const pos = editor.selectionStart ?? 0;
  const stockBtn = root.querySelector('[data-el="stockToggleBtn"]');
  if (stockBtn) {
    const inStock = caretInStock(editor.value, pos);
    stockBtn.innerHTML = `✎<b>${inStock ? 'P' : 'K'}</b>`;
    stockBtn.style.setProperty('--mode-c', inStock ? stockDefaultColor() : contourDefaultColor());
    stockBtn.title = (inStock ? 'Zadávám POLOTOVAR' : 'Zadávám KONTURU')
      + ' – klik ' + (inStock ? 'ukončí polotovar (STOCK_END)' : 'začne polotovar (STOCK_START)');
  }
  const gBtn = root.querySelector('[data-el="lineGBtn"]');
  if (gBtn) {
    const g = activeCoordG(editor.value, pos);
    gBtn.textContent = g;
    gBtn.classList.toggle('cne-conv-active', g === 'G91');
    gBtn.title = `Platí ${g} (${g === 'G90' ? 'absolutní' : 'přírůstkové'}) – klik zapíše na řádek s kurzorem ${g === 'G90' ? 'G91' : 'G90'}`;
  }
}

/**
 * Nová poloha kurzoru po šipce (čistá funkce).
 * @param {string} v  text
 * @param {number} pos  kurzor
 * @param {'left'|'right'|'up'|'down'|'home'|'end'} dir
 * @param {number|null} goal  sloupec, který drží ↑ ↓ (null = aktuální)
 * @returns {{pos: number, goal: number|null}}
 */
export function moveCaret(v, pos, dir, goal = null) {
  const ls = v.lastIndexOf('\n', pos - 1) + 1;
  let le = v.indexOf('\n', pos); if (le < 0) le = v.length;
  const col = pos - ls;
  switch (dir) {
    case 'left': return { pos: Math.max(0, pos - 1), goal: null };
    case 'right': return { pos: Math.min(v.length, pos + 1), goal: null };
    case 'home': return { pos: ls, goal: null };
    case 'end': return { pos: le, goal: null };
    case 'up': {
      const g = goal ?? col;
      if (ls === 0) return { pos: 0, goal: g };
      const pls = v.lastIndexOf('\n', ls - 2) + 1;
      return { pos: Math.min(pls + g, ls - 1), goal: g };
    }
    case 'down': {
      const g = goal ?? col;
      if (le >= v.length) return { pos: v.length, goal: g };
      let nle = v.indexOf('\n', le + 1); if (nle < 0) nle = v.length;
      return { pos: Math.min(le + 1 + g, nle), goal: g };
    }
    default: return { pos, goal };
  }
}

const HOLD_MS = 380, REPEAT_MS = 70;

/**
 * Napojí šipky `[data-caret]` v liště. Po posunu pošle editoru `select` (přepočet údajů).
 * Režim „Výběr" (⬚ v proužku ≡): šipky místo posunu kurzoru rozšiřují výběr –
 * jeden konec (kotva) stojí, druhý jede. Napojí i akce s řádky (cncLineTools.js).
 * @param {HTMLElement} root
 * @param {HTMLTextAreaElement} editor
 * @param {{snapshot?: Function, after?: Function}} [hooks]  pro akce s řádky (Zpět, přepočet)
 */
export function wireCaretKeys(root, editor, hooks = {}) {
  let timer = 0, goal = null, lastPos = -1;
  let selMode = false, anchor = 0, focusPos = 0;
  const step = (dir) => {
    const ss = editor.selectionStart ?? 0, se = editor.selectionEnd ?? ss;
    if (selMode) {
      // Výběr mezitím změněn jinak (klepnutí do textu) → nová kotva.
      if (Math.min(anchor, focusPos) !== ss || Math.max(anchor, focusPos) !== se) { anchor = ss; focusPos = se; goal = null; }
      if (focusPos !== lastPos) goal = null;
      const r = moveCaret(editor.value, focusPos, dir, goal);
      goal = r.goal; lastPos = focusPos = r.pos;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(focusPos, focusPos);      // ať je vidět pohyblivý konec výběru
      ensureCaretVisible(editor);
      editor.setSelectionRange(Math.min(anchor, focusPos), Math.max(anchor, focusPos), focusPos < anchor ? 'backward' : 'forward');
    } else {
      if (ss !== lastPos) goal = null;              // kurzor mezitím přesunut jinak
      const r = moveCaret(editor.value, ss, dir, goal);
      goal = r.goal; lastPos = r.pos;
      editor.selectionStart = editor.selectionEnd = r.pos;
      editor.focus({ preventScroll: true });
      ensureCaretVisible(editor);
    }
    editor.dispatchEvent(new Event('select'));
  };
  const toggleSelect = () => {
    selMode = !selMode;
    root.classList.toggle('cne-selmode', selMode);
    root.querySelector('[data-line-act="bar"]')?.classList.toggle('sel-on', selMode);
    if (selMode) { anchor = editor.selectionStart ?? 0; focusPos = editor.selectionEnd ?? anchor; }
    else {                                           // konec výběru: kurzor zůstane na pohyblivém konci
      const p = Math.min(Math.max(focusPos, 0), editor.value.length);
      editor.setSelectionRange(p, p);
      editor.dispatchEvent(new Event('select'));
    }
    goal = null;
    return selMode;
  };
  wireLineTools(root, editor, { ...hooks, reveal: ensureCaretVisible, toggleSelect });
  const stop = () => { clearTimeout(timer); timer = 0; };
  root.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-caret]');
    if (!b) return;
    e.preventDefault();
    stop();
    const dir = b.dataset.caret;
    step(dir);
    const rep = () => { step(dir); timer = setTimeout(rep, REPEAT_MS); };
    timer = setTimeout(rep, HOLD_MS);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerout']) root.addEventListener(t, stop);
  root.addEventListener('contextmenu', e => { if (e.target.closest('[data-caret]')) e.preventDefault(); });
}

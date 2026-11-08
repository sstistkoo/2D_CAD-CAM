// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC kód v pravém panelu (#cncOutput): úpravy jako     ║
// ║  v CNC editorech (uživatel 8. 11. 2026)                        ║
// ╚══════════════════════════════════════════════════════════════╝
//  – Enter s kurzorem v poznámce ji nerozdělí (nový řádek až za ní),
//  – klepnutí pod poslední řádek = kurzor na konec + nový řádek,
//  – jemný podklad pod řádkem s kurzorem (i když na řádek skočí výběr
//    objektu na plátně – cncJump.js).
// Pole je obyčejná textarea bez podkladové vrstvy, proto se podklad kreslí
// jako background s `background-attachment: local` (roluje s textem).

import { wireCommentEnter } from './calculators/cncCommentTools.js';
import { wireTapBelow } from './calculators/cncTapBelow.js';

/** Vloží nový řádek na kurzor (s nativním Zpět, kde to prohlížeč umí). */
function insertNewline(ta) {
  ta.focus({ preventScroll: true });
  let ok = false;
  try { ok = document.execCommand('insertText', false, '\n'); } catch { /* starý prohlížeč */ }
  if (!ok) {
    ta.setRangeText('\n', ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Podklad pod řádkem s kurzorem; vrací funkci pro okamžité přepočítání. */
export function wireOutputCurLine(ta) {
  let raf = 0;
  const update = () => {
    raf = 0;
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 16;
    if (!ta.value) { ta.style.backgroundImage = ''; return; }
    let idx = 0;
    const v = ta.value, pos = ta.selectionStart;
    for (let i = 0; i < pos && i < v.length; i++) if (v.charCodeAt(i) === 10) idx++;
    const top = (parseFloat(cs.paddingTop) || 0) + idx * lh;
    ta.style.backgroundImage = 'linear-gradient(var(--ctp-peach), var(--ctp-peach)), linear-gradient(var(--cnc-curline-bg), var(--cnc-curline-bg))';
    ta.style.backgroundSize = `2px ${lh}px, 100% ${lh}px`;
    ta.style.backgroundPosition = `0 ${top}px, 0 ${top}px`;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  ['input', 'click', 'keyup', 'select', 'focus', 'touchend', 'selectionchange'].forEach(ev => ta.addEventListener(ev, schedule));
  document.addEventListener('selectionchange', () => { if (document.activeElement === ta) schedule(); });
  // Kód se přepisuje i z programu (vygenerování z výkresu, skok na řádek objektu).
  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  if (desc?.set) Object.defineProperty(ta, 'value', { configurable: true, get() { return desc.get.call(this); }, set(x) { desc.set.call(this, x); schedule(); } });
  schedule();
  return update;
}

/** Zapojí úpravy na pole CNC kódu (volá se jednou při startu). */
export function initCncOutputTools(ta = document.getElementById('cncOutput')) {
  if (!ta || ta.dataset.cncTools) return;
  ta.dataset.cncTools = '1';
  wireCommentEnter(ta, ta, () => insertNewline(ta));
  wireTapBelow(ta, () => insertNewline(ta));
  wireOutputCurLine(ta);
}

initCncOutputTools();

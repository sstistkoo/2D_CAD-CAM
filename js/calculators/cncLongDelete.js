/**
 * Podržení tlačítka ⌫ v liště editoru G-kódu = smazat celý řádek s kurzorem.
 * Krátké klepnutí dál maže jeden znak (původní akce `backspace`); po podržení
 * se následný click zahodí, aby po smazání řádku neubyl ještě znak.
 * Zároveň se u tlačítka potlačí systémové menu / výběr textu (Android).
 */
const HOLD_MS = 500;
const SEL = '[data-act="backspace"]';

/**
 * Smaže řádek, na kterém je pozice `pos`, včetně jeho zalomení.
 * Kurzor skončí na začátku následujícího řádku (u posledního na konci předchozího).
 * Je-li řádek s kurzorem prázdný, smaže se řádek nad ním.
 * @param {string} v
 * @param {number} pos
 * @returns {{value: string, caret: number}}
 */
export function deleteLineAt(v, pos) {
  const ls = v.lastIndexOf('\n', pos - 1) + 1;
  const nl = v.indexOf('\n', pos);
  // Prázdný řádek (typicky po Enter) → smaže se řádek NAD ním, kurzor zůstane na prázdném.
  if (ls > 0 && !v.slice(ls, nl < 0 ? v.length : nl).trim()) {
    const pls = v.lastIndexOf('\n', ls - 2) + 1;
    return { value: v.slice(0, pls) + v.slice(ls), caret: pls + (pos - ls) };
  }
  if (nl >= 0) return { value: v.slice(0, ls) + v.slice(nl + 1), caret: ls };
  if (ls === 0) return { value: '', caret: 0 };
  return { value: v.slice(0, ls - 1), caret: ls - 1 };   // poslední řádek: pryč i zalomení před ním
}

/**
 * @param {HTMLElement} root  kořen editoru (lišta s ⌫ je uvnitř)
 * @param {HTMLTextAreaElement} editor
 * @param {{snapshot: (label: string, detail?: string) => void, after: () => void, reveal?: (ta: HTMLTextAreaElement) => void}} hooks
 *        snapshot = uložení pro Ctrl+Z před změnou, after = přepočet editoru (onInput),
 *        reveal = posun, aby byl kurzor vidět (ensureCaretVisible)
 */
export function wireLongDelete(root, editor, { snapshot, after, reveal }) {
  let timer = 0, fired = false;
  const cancel = (e) => { if (timer) clearTimeout(timer); timer = 0; };

  root.addEventListener('pointerdown', e => {
    if (!e.target.closest(SEL)) return;
    fired = false;
   
    cancel();
    timer = setTimeout(() => {
      timer = 0; fired = true;
      const { scrollTop, scrollLeft } = editor;
      const r = deleteLineAt(editor.value, editor.selectionStart ?? 0);
      if (r.value === editor.value) return;
      snapshot('Smazat řádek', '⌫');
      editor.readOnly = false;
      editor.value = r.value;
      editor.selectionStart = editor.selectionEnd = r.caret;
      editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
      editor.focus({ preventScroll: true });
      reveal?.(editor);
      try { navigator.vibrate?.(30); } catch { /* bez vibrace */ }
      after();
    }, HOLD_MS);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(t, cancel);
  // Po podržení nesmí proběhnout i běžné smazání znaku.
  root.addEventListener('click', e => {
    if (!fired || !e.target.closest(SEL)) return;
    fired = false;
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);
  root.addEventListener('contextmenu', e => { if (e.target.closest(SEL)) e.preventDefault(); });
}

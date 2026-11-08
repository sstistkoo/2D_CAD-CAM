/**
 * Poznámky za středníkem v CNC editoru:
 *  – Enter (klávesnice i tlačítko ↵) s kurzorem v poznámce ji nerozdělí –
 *    nový řádek se založí až za koncem řádku, poznámka zůstane za kódem.
 *  – Tlačítko [data-hidecom] poznámky skryje / zobrazí (jen zobrazení,
 *    text kódu se nemění; stav se pamatuje).
 */

/** Index středníku komentáře v řádku (středník v uvozovkách MSG("a;b") se nepočítá), jinak -1. */
function commentIndex(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    else if (line[i] === ';' && !q) return i;
  }
  return -1;
}

/**
 * Kam má jít Enter: je-li kurzor v poznámce (nebo mezi kódem a středníkem),
 * vrátí konec řádku, jinak null (běžné zalomení). Na začátku řádku tvořeného
 * jen poznámkou nechá běžné chování – Enter tam vloží prázdný řádek nad ni.
 */
export function newlinePos(v, pos) {
  const ls = v.lastIndexOf('\n', pos - 1) + 1;
  let le = v.indexOf('\n', pos); if (le < 0) le = v.length;
  const line = v.slice(ls, le);
  const ci = commentIndex(line);
  if (ci < 0) return null;
  const codeEnd = ls + line.slice(0, ci).replace(/\s+$/, '').length;
  return pos > ls && pos >= codeEnd && pos < le ? le : null;
}

const KEY = 'cne_hideComments';

/** Značka začátku / konce kontury či polotovaru – musí zůstat vždy vidět i v kódu. */
export const MARKER_RE = /\b(KONTURA|STOCK)_(START|END)\b/i;
/** CSS třída poznámky: značka kontury/polotovaru se nikdy neskrývá (tlačítko ;👁). */
export const commentClass = text => MARKER_RE.test(text) ? 'hl-comment hl-mark' : 'hl-comment';

/** Enter (klávesnice i tlačítko ↵ uvnitř `root`) s kurzorem v poznámce → nový řádek až za koncem řádku. */
export function wireCommentEnter(editor, root, insertNewline) {
  const toEnd = () => {
    if (editor.selectionStart !== editor.selectionEnd) return false;
    const p = newlinePos(editor.value, editor.selectionStart);
    if (p == null) return false;
    editor.selectionStart = editor.selectionEnd = p;
    return true;
  };
  // Klávesnice: kurzor jen přesuneme, nový řádek vloží prohlížeč sám (zachová doplnění G0/G1).
  editor.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) toEnd();
  });
  // Klávesnice telefonu bez keydown „Enter" (Android) → vložit ručně na konec řádku.
  editor.addEventListener('beforeinput', e => {
    if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && toEnd()) {
      e.preventDefault();
      insertNewline();
    }
  });
  // Tlačítko ↵ v liště – zachytit dřív, než ho zpracuje editor (capture fáze).
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ins]');
    if (b && b.dataset.ins === '\\n') toEnd();
  }, true);
}

export function wireCommentTools(editor, root, insertNewline) {
  wireCommentEnter(editor, root, insertNewline);

  // Skrytí poznámek
  let hidden = false;
  try { hidden = localStorage.getItem(KEY) === '1'; } catch { /* bez úložiště */ }
  const apply = () => {
    root.classList.toggle('cne-hide-com', hidden);
    root.querySelectorAll('[data-hidecom]').forEach(b => {
      b.classList.toggle('active', hidden);
      b.title = hidden ? 'Zobrazit poznámky za středníkem' : 'Skrýt poznámky za středníkem (jen zobrazení, kód se nemění)';
    });
  };
  apply();
  root.addEventListener('mousedown', e => { if (e.target.closest('[data-hidecom]')) e.preventDefault(); });
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-hidecom]')) return;
    hidden = !hidden;
    try { localStorage.setItem(KEY, hidden ? '1' : '0'); } catch { /* bez úložiště */ }
    apply();
  });
}

/**
 * Klepnutí do prázdného místa POD posledním řádkem kódu → kurzor na konec
 * a nový prázdný řádek (pokud poslední řádek už prázdný není). Uživatel tak
 * nemusí hledat konec dlouhé poznámky, aby mohl psát další řádek.
 * Textarea nezalamuje (white-space: pre), takže řádek = jedna textová řádka.
 */
export function wireTapBelow(editor, insertNewline) {
  editor.addEventListener('click', e => {
    if (editor.selectionStart !== editor.selectionEnd) return;   // výběr textu – nesahat
    const cs = getComputedStyle(editor);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20;
    const y = e.clientY - editor.getBoundingClientRect().top + editor.scrollTop - (parseFloat(cs.paddingTop) || 0);
    const v = editor.value;
    const lines = v.split('\n');
    if (y <= lines.length * lh) return;                          // klik na text – běžné chování
    editor.selectionStart = editor.selectionEnd = v.length;
    if (lines[lines.length - 1].trim() !== '') insertNewline();
  });
}

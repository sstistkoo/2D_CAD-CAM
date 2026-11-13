/**
 * Hledání v kódu CNC editoru (lišta 🔍) a klávesové zkratky editoru.
 * Vyčleněno z cncEditor.js 13. 11. 2026 beze změny chování (strop velikosti
 * souboru, viz tests/file-size-budget.test.js).
 */

/**
 * @param {{editor: HTMLTextAreaElement, searchBar: HTMLElement, searchInput: HTMLInputElement,
 *   searchCountEl: HTMLElement, lineH: () => number, syncScroll: () => void,
 *   undo: () => void, redo: () => void}} o
 * @returns {{openSearch: () => void, closeSearch: () => void, doSearch: (dir: number) => void}}
 */
export function wireSearch({ editor, searchBar, searchInput, searchCountEl, lineH, syncScroll, undo, redo }) {
  let searchMatches = [];
  let searchIdx = -1;
  function openSearch() {
    searchBar.classList.add('open');
    searchInput.focus();
    searchInput.select();
  }
  function closeSearch() {
    searchBar.classList.remove('open');
    editor.focus();
  }
  function doSearch(dir) {
    const q = searchInput.value;
    if (!q) { searchCountEl.textContent = ''; searchMatches = []; searchIdx = -1; return; }
    searchMatches = [];
    let i = -1;
    const lower = editor.value.toLowerCase();
    const ql = q.toLowerCase();
    while ((i = lower.indexOf(ql, i + 1)) !== -1) searchMatches.push(i);
    if (!searchMatches.length) { searchCountEl.textContent = '0 / 0'; searchIdx = -1; return; }
    searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
    searchCountEl.textContent = (searchIdx + 1) + ' / ' + searchMatches.length;
    // Zvýraznění nálezu bez odebrání fokusu z vyhledávacího pole
    // (setSelectionRange funguje i bez focus() — jinak by focus() na
    // editoru "ukradl" fokus z inputu při psaní dalšího znaku).
    const pos = searchMatches[searchIdx];
    editor.setSelectionRange(pos, pos + q.length);
    const lineIdx = editor.value.slice(0, pos).split('\n').length - 1;
    editor.scrollTop = Math.max(0, lineIdx * lineH() - editor.clientHeight / 2);
    syncScroll();
  }
  searchInput.addEventListener('input', () => { searchIdx = -1; doSearch(1); });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  });
  editor.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openSearch(); }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
  });
  return { openSearch, closeSearch, doSearch };
}

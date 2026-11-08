/**
 * Systémová klávesnice telefonu v editoru G-kódu: na dotykovém zařízení se
 * sama NEotvírá (klepnutí do textu jen posune kurzor), zapíná/vypíná ji ⌨.
 * Stejné chování jako kreslicí CNC editor (CAM editor dřív používal readOnly).
 */
export function wireKeyboardMode(editor, root) {
  const touchUI = window.matchMedia('(max-width: 600px), (pointer: coarse)').matches;
  let kbOn = !touchUI;
  const apply = () => {
    if (!touchUI) return;
    editor.setAttribute('inputmode', kbOn ? 'text' : 'none');
    root.querySelectorAll('[data-act="keyboard"]').forEach(b => b.classList.toggle('on', kbOn));
  };
  apply();
  return function toggleKeyboard() {
    if (!touchUI) { editor.focus(); return; }
    kbOn = !kbOn;
    apply();
    editor.blur();                                   // nový inputmode platí až při dalším fokusu
    editor.focus({ preventScroll: true });
  };
}

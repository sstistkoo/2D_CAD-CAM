/**
 * Na mobilu nesmí klepnutí na tlačítka editoru (lišta, horní pruh, okna)
 * přesunout fokus – jinak telefon může vysunout klávesnici (uživatel
 * 8. 11. 2026: „dám oko co schovává poznámky a vyjede klávesnice").
 * preventDefault na pointerdown zachová fokus i kurzor v editoru, klik
 * (a tím akce tlačítka) proběhne normálně. Pole pro psaní (input, textarea,
 * select) se nechávají být – tam klávesnice vyjet má.
 */
const TAP = 'button, [data-act], [data-ins], [data-inp], [data-nk], [data-hidecom], [data-numpadtog], [data-hv], [data-file], [data-hist], [data-ln], [data-isect]';

export function wireNoKeyboard(root, editor) {
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;                     // na PC fokus nevadí
    const t = e.target;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (t.closest(TAP)) e.preventDefault();
  });
  // Pole jen pro čtení (displej číselníku) klávesnici nikdy neotevírá.
  root.querySelectorAll('input[readonly]').forEach(i => i.setAttribute('inputmode', 'none'));
  return editor;
}

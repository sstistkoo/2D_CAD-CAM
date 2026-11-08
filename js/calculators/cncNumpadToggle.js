/**
 * Přepínač číselníku v horní liště CNC editoru (tlačítko 123 vedle ◀ ▶).
 * VYP (výchozí): písmeno osy (X, Z, G, M, sražení…) se vloží rovnou do kódu.
 * ZAP: po klepnutí na písmeno vyskočí okno s čísly (číselník), OK vloží „X50 ".
 * Stav se pamatuje v localStorage (uživatel 8. 11. 2026).
 */
const KEY = 'cne_numpadOn';
let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch { /* bez úložiště */ }

/** Má se k písmenu osy otevírat číselník? */
export function numpadOn() { return on; }

export function wireNumpadToggle(root) {
  const apply = () => root.querySelectorAll('[data-numpadtog]').forEach(b => {
    b.classList.toggle('active', on);
    b.title = on ? 'Číselník ZAP – k písmenu osy vyskočí okno s čísly (klik vypne)' : 'Číselník VYP – písmeno osy se vloží rovnou (klik zapne okno s čísly)';
  });
  apply();
  root.addEventListener('mousedown', e => { if (e.target.closest('[data-numpadtog]')) e.preventDefault(); });
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-numpadtog]')) return;
    on = !on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* bez úložiště */ }
    apply();
  });
}

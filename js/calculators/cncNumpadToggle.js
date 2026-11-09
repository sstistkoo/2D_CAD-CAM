/**
 * Přepínač číselníku v horní liště editoru G-kódu (tlačítko 123 vedle ◀ ▶).
 * VYP: písmeno osy (X, Z, G, M, sražení…) se vloží rovnou do kódu.
 * ZAP: po klepnutí na písmeno vyskočí okno s čísly (číselník), OK vloží „X50 ".
 * Každý editor má vlastní stav (localStorage): kreslicí CNC editor má číslice
 * přímo v liště, proto výchozí VYP; CAM editor číslice v liště nemá, výchozí ZAP.
 * ZAP v kreslicím editoru navíc skryje boční číselník vpravo (třída .cne-numpad-on).
 */
const state = new Map();
function load(key, def) {
  if (!state.has(key)) {
    let on = def;
    try { const v = localStorage.getItem(key); if (v === '1' || v === '0') on = v === '1'; } catch { /* bez úložiště */ }
    state.set(key, on);
  }
  return state.get(key);
}

/** Má se k písmenu osy otevírat číselník? (výchozí klíč = kreslicí CNC editor) */
export function numpadOn(key = 'cne_numpadOn', def = false) { return load(key, def); }

export function wireNumpadToggle(root, key = 'cne_numpadOn', def = false) {
  load(key, def);
  const apply = () => root.querySelectorAll('[data-numpadtog]').forEach(b => {
    const on = state.get(key);
    root.classList.toggle('cne-numpad-on', on);   // ZAP: boční číselník se schová, kód má celou šířku
    b.classList.toggle('active', on);
    b.title = on ? 'Číselník ZAP – k písmenu osy vyskočí okno s čísly (klik vypne)' : 'Číselník VYP – písmeno osy se vloží rovnou (klik zapne okno s čísly)';
  });
  apply();
  root.addEventListener('mousedown', e => { if (e.target.closest('[data-numpadtog]')) e.preventDefault(); });
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-numpadtog]')) return;
    const on = !state.get(key);
    state.set(key, on);
    try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* bez úložiště */ }
    apply();
  });
  return () => state.get(key);
}

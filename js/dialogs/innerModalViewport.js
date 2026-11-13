// Okna se drží ve SKUTEČNĚ viditelné ploše displeje: vnitřní okna kreslicího
// editoru (oblouk, úhel, sražení…), dialogy CAD (.input-overlay) i kalkulačky
// (.calc-overlay) – css/cnc-compact.css a css/modal-fit.css. Na mobilu softwarová klávesnice (a lišty prohlížeče)
// překryjí spodek layout viewportu, takže okno vycentrované na celou výšku mělo
// spodní tlačítka (Zrušit / Vložit) pod klávesnicí nebo pod okrajem displeje.
// `visualViewport` zná viditelnou plochu – její vršek a výšku dáváme do CSS
// proměnných --vv-top / --vv-h (css/cnc-compact.css je použije).

const vv = typeof window !== 'undefined' ? window.visualViewport : null;

function syncViewportVars() {
  if (!vv) return;
  const root = document.documentElement.style;
  root.setProperty('--vv-top', `${Math.max(0, vv.offsetTop)}px`);
  root.setProperty('--vv-h', `${vv.height}px`);
}

/**
 * Pole s kurzorem ve vnitřním okně posune do středu viditelné části okna (nad
 * přilepenou lištu Zrušit / Vložit). Klávesnice okno zmenší a pole dole (R, úhel
 * rozevření) by jinak zůstalo schované – nebylo vidět, co se píše.
 */
function revealFocused() {
  const el = document.activeElement;
  // Jen pole a výběry – textarea CNC editoru se roluje sama v sobě.
  if (!el || !/^(INPUT|SELECT)$/.test(el.tagName) || /^(checkbox|radio|button|range)$/.test(el.type)) return;
  // Odspodu nahoru přes všechny rolovací úrovně (tabulka v těle kalkulačky v okně…).
  for (const box of scrollParents(el)) {
    const actions = box.querySelector(':scope > .cne-im-actions, :scope > .btn-row');
    const sticky = actions && getComputedStyle(actions).position === 'sticky' ? actions.offsetHeight : 0;
    const cr = box.getBoundingClientRect(), er = el.getBoundingClientRect();
    const top = cr.top + box.clientTop, visible = box.clientHeight - sticky;
    if (er.top >= top + 4 && er.bottom <= top + visible - 4) continue;   // je vidět → neposkakovat
    box.scrollTop += (er.top - top) - Math.max(0, (visible - er.height) / 2);
  }
}
const MODALS = '.cne-inner-modal, .input-overlay, .calc-overlay';
/** Rolovatelní předci pole uvnitř okna, od nejbližšího (tabulka, tělo kalkulačky, karta…). */
function scrollParents(el) {
  const stop = el.closest(MODALS), out = [];
  for (let n = el.parentElement; n && stop && n !== stop; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) out.push(n);
  }
  return out;
}
let revealTimer = 0;
function scheduleReveal() {
  clearTimeout(revealTimer);
  revealFocused();
  revealTimer = setTimeout(revealFocused, 350);   // až se klávesnice vysune a okno zmenší
}

if (vv) {
  vv.addEventListener('resize', () => { syncViewportVars(); scheduleReveal(); });
  vv.addEventListener('scroll', syncViewportVars);
  syncViewportVars();
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('focusin', (e) => { if (e.target?.closest?.(MODALS)) scheduleReveal(); });
}

export { syncViewportVars, revealFocused };

// Vnitřní okna kreslicího editoru (oblouk, úhel, sražení…) se drží ve SKUTEČNĚ
// viditelné ploše displeje. Na mobilu softwarová klávesnice (a lišty prohlížeče)
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
  if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
  const card = el.closest('.cne-inner-modal > *');
  if (!card || card.scrollHeight <= card.clientHeight) return;
  const actions = card.querySelector(':scope > .cne-im-actions');
  const cr = card.getBoundingClientRect(), er = el.getBoundingClientRect();
  const visible = card.clientHeight - (actions ? actions.offsetHeight : 0);
  card.scrollTop += (er.top - cr.top) - Math.max(0, (visible - er.height) / 2);
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
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => { if (e.target?.closest?.('.cne-inner-modal')) scheduleReveal(); });
}

export { syncViewportVars, revealFocused };

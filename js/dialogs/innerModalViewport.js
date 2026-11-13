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

if (vv) {
  vv.addEventListener('resize', syncViewportVars);
  vv.addEventListener('scroll', syncViewportVars);
  syncViewportVars();
}

export { syncViewportVars };

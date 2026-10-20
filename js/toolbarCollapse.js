// SKICA – lišta nástrojů na mobilu (na výšku): sbalení řádků nad „Více"
// ─────────────────────────────────────────────────────────────────────
// Tlačítko ▴ v řádku s Kr.pole a Dírou (index.html, #btnToolbarCollapse)
// skryje hlavní řádky nástrojů — zůstane hlavička lišty (Výběr, Kóta, ✕)
// a sekce Více, ať se v ní dá vybírat bez dalších tlačítek okolo (uživatel
// 20. 10. 2026). ▾ je zase rozbalí. Jen mobil na výšku: naležato a na
// desktopu je tlačítko skryté a sbalení nepůsobí (po otočení telefonu by
// jinak nebylo čím rozbalit). Řádky „Více" na výšku po čtyřech drží zlomy
// .toolbar-row-break-p v index.html; tlačítka řádku se dělí o šířku.

const CSS = `
.toolbar-collapse-btn { display: none; }
@media (max-width: 900px) and (orientation: portrait) {
  .toolbar-more > .tool-btn { flex: 1 1 0; min-width: 0; overflow: hidden; }
  .toolbar-more > .toolbar-collapse-btn {
    display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 32px; padding: 5px 0; font-size: 14px;
    background: var(--ctp-surface1); border: 1px dashed var(--ctp-overlay0); color: var(--ctp-subtext0);
  }
  #topbar.more-only > :not(.toolbar-header):not(#toolbarMore) { display: none !important; }
  #topbar.more-only > #toolbarMore > .sep:first-child { display: none; }
}`;

const ARROW_OPEN = '▴', ARROW_CLOSED = '▾';

/** Sbalit / rozbalit řádky nad Více; vrací nový stav (true = sbaleno). */
export function setToolbarCollapsed(topbar, btn, collapsed) {
  topbar.classList.toggle('more-only', collapsed);
  const arrow = btn.querySelector('.toolbar-toggle-arrow');
  if (arrow) arrow.textContent = collapsed ? ARROW_CLOSED : ARROW_OPEN;
  btn.title = collapsed ? 'Rozbalit řádky nad Více' : 'Sbalit řádky nad Více – zůstanou jen tyto nástroje';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-expanded', String(!collapsed));
  return collapsed;
}

function init() {
  const topbar = document.getElementById('topbar');
  const btn = document.getElementById('btnToolbarCollapse');
  if (!topbar || !btn) return;
  if (!document.getElementById('toolbar-collapse-css')) {
    const st = document.createElement('style');
    st.id = 'toolbar-collapse-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    setToolbarCollapsed(topbar, btn, !topbar.classList.contains('more-only'));
  });
}

if (typeof document !== 'undefined' && document.getElementById) init();

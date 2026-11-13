/**
 * Chyby validace přímo u řádku v kódu (uživatel 13. 11. 2026): řádek s chybou
 * má v podkladu (backdrop) červený pruh vlevo a podbarvení, hláška se ukáže
 * v nápovědě k řádku s kurzorem a „Údaje a nápověda" zčervená.
 * Pruhy leží v podkladu jako zvýraznění řádku s kurzorem (cncCurLine.js) –
 * textarea nezalamuje, řádek = jedna řádka výšky line-height.
 * Validace běží se zpožděním; než doběhne, změní-li se počet řádků, pruhy se
 * schovají (seděly by o řádek vedle).
 */

/** Mapa řádek → první hláška; `errs` = [{ lineIndex, msg }]. */
export function errorsByLine(errs) {
  const m = new Map();
  for (const e of errs || []) {
    if (Number.isInteger(e?.lineIndex) && e.lineIndex >= 0 && !m.has(e.lineIndex)) m.set(e.lineIndex, String(e.msg ?? ''));
  }
  return m;
}

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {HTMLTextAreaElement} editor
 * @param {HTMLElement} backdrop
 * @param {HTMLElement} root  kořen editoru (kvůli „Údaje a nápověda")
 */
export function createErrMarks(editor, backdrop, root) {
  const layer = document.createElement('div');
  layer.className = 'cne-errmarks';
  backdrop.insertBefore(layer, backdrop.firstChild);
  let errs = new Map(), lines = -1, raf = 0;
  const lineCount = () => editor.value.split('\n').length;
  const valid = () => errs.size > 0 && lines === lineCount();

  function render() {
    raf = 0;
    if (!editor.isConnected) { unwire(); return; }
    if (!valid()) { layer.innerHTML = ''; return; }
    const cs = getComputedStyle(editor);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20;
    const top0 = parseFloat(cs.paddingTop) || 0;
    const w = backdrop.clientWidth, left = backdrop.scrollLeft;
    layer.innerHTML = [...errs.keys()].map(i =>
      `<div class="cne-errmark" style="top:${top0 + i * lh}px;height:${lh}px;left:${left}px;width:${w}px"></div>`).join('');
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  const hl = backdrop.querySelector('[data-el="highlights"]') || backdrop;
  const mo = new MutationObserver(schedule);
  mo.observe(hl, { childList: true });
  editor.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  function unwire() { mo.disconnect(); window.removeEventListener('resize', schedule); }

  return {
    /** Nové výsledky validace (po každém jejím doběhnutí). */
    set(list) { errs = errorsByLine(list); lines = lineCount(); schedule(); },
    /** Hláška k řádku `ln` jako HTML (nebo ''); zároveň obarví „Údaje a nápověda". */
    msgHTML(ln) {
      const m = valid() ? errs.get(ln) : undefined;
      root?.querySelector('[data-el="infoToggle"]')?.classList.toggle('err', m !== undefined);
      return m === undefined ? '' : `<span class="err">⚠ ${esc(m)}</span>`;
    },
  };
}

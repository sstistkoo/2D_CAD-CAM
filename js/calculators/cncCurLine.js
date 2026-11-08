/**
 * Jemný podklad pod řádkem s kurzorem v CNC editoru (uživatel 8. 11. 2026) –
 * hned je vidět, kam se píše, hlavně u dlouhých programů.
 * Pruh leží v podkladu (backdrop) pod textem; textarea nezalamuje, takže
 * řádek kódu = jedna řádka výšky line-height. Posouvá se se scrollem kódu.
 */
export function wireCurrentLine(editor, backdrop) {
  const bar = document.createElement('div');
  bar.className = 'cne-curline';
  backdrop.insertBefore(bar, backdrop.firstChild);
  let raf = 0;
  const update = () => {
    raf = 0;
    const cs = getComputedStyle(editor);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20;
    const v = editor.value, pos = editor.selectionStart;
    let idx = 0;
    for (let i = 0; i < pos && i < v.length; i++) if (v.charCodeAt(i) === 10) idx++;
    bar.style.top = ((parseFloat(cs.paddingTop) || 0) + idx * lh) + 'px';
    bar.style.height = lh + 'px';
    bar.style.left = backdrop.scrollLeft + 'px';
    bar.style.width = backdrop.clientWidth + 'px';
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  ['input', 'click', 'keyup', 'select', 'focus', 'scroll', 'touchend'].forEach(ev => editor.addEventListener(ev, schedule));
  document.addEventListener('selectionchange', schedule);
  window.addEventListener('resize', schedule);
  // Vložení tlačítky lišty přepíše zvýraznění kódu → přepočítat i tehdy.
  new MutationObserver(schedule).observe(backdrop, { childList: true, subtree: true });
  schedule();
  return update;
}

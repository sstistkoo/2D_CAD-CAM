// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog Factory (sdílené vytváření overlayů)       ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * Vytvoří calc-overlay se standardním layoutem (titlebar + close + body).
 * Pokud overlay daného typu již existuje, vrátí null.
 */
function escHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function makeOverlay(type, title, bodyHTML, windowClass) {
  if (document.querySelector(`.calc-overlay[data-type="${CSS.escape(type)}"]`)) return null;
  const overlay = document.createElement("div");
  overlay.className = "calc-overlay";
  overlay.dataset.type = type;
  overlay.innerHTML =
    '<div class="calc-window ' + (windowClass || "cnc-window") + '">' +
      '<div class="calc-titlebar"><h3>' + escHTML(title) + '</h3><button class="calc-close-btn">\u2715</button></div>' +
      '<div class="calc-body">' + bodyHTML + '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector(".calc-close-btn").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  const _escHandler = (e) => { if (e.key === 'Escape') overlay.remove(); };
  document.addEventListener('keydown', _escHandler);
  new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) { document.removeEventListener('keydown', _escHandler); obs.disconnect(); }
  }).observe(document.body, { childList: true });
  return overlay;
}

/**
 * Umožní táhnout okno za danou lištu (myš i dotyk). Posouvá přes transform,
 * takže nekoliduje s centrováním overlaye. Klik na tlačítko v liště se ignoruje.
 * @param {HTMLElement} win - element okna (.calc-window)
 * @param {HTMLElement} handle - úchyt (.calc-titlebar)
 */
export function makeDraggable(win, handle) {
  if (!win || !handle) return;
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  const pt = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  const onMove = (e) => {
    if (!dragging) return;
    const p = pt(e);
    win.style.transform = `translate(${ox + (p.clientX - sx)}px, ${oy + (p.clientY - sy)}px)`;
    if (e.cancelable) e.preventDefault();
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    const p = pt(e);
    ox += p.clientX - sx;
    oy += p.clientY - sy;
    handle.style.cursor = 'move';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  };
  const onDown = (e) => {
    if (e.target.closest('button')) return; // zavírací tlačítko nech být
    dragging = true;
    const p = pt(e);
    sx = p.clientX; sy = p.clientY;
    handle.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    if (e.cancelable) e.preventDefault();
  };
  handle.style.cursor = 'move';
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
}

/**
 * Vytvoří input-overlay s daným innerHTML, připojí do body
 * a přidá dismiss kliknutím na pozadí.
 */
export function makeInputOverlay(innerHTML) {
  const overlay = document.createElement('div');
  overlay.className = 'input-overlay';
  overlay.innerHTML = innerHTML;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  const _escHandler = (e) => { if (e.key === 'Escape') overlay.remove(); };
  document.addEventListener('keydown', _escHandler);
  new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) { document.removeEventListener('keydown', _escHandler); obs.disconnect(); }
  }).observe(document.body, { childList: true });
  return overlay;
}

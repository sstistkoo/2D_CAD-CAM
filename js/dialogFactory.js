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

/**
 * @param {string} type   kl\u00ed\u010d overlaye (data-type) \u2013 z\u00e1rove\u0148 pojistka proti duplicit\u011b
 * @param {string} title  titulek do li\u0161ty
 * @param {string} bodyHTML
 * @param {string} [windowClass]
 * @param {{float?:boolean, closeOnEsc?:boolean, closeOnBackdrop?:boolean}} [opts]
 *   `float` = plovouc\u00ed okno bez tmav\u00e9ho pozad\u00ed, nech\u00e1v\u00e1 pl\u00e1tno pod sebou
 *   klikateln\u00e9 (t\u0159\u00edda `calc-overlay-float` se P\u0158ID\u00c1V\u00c1 k `calc-overlay`,
 *   nikdy ji nenahrazuje \u2013 jinak p\u0159estane fungovat pojistka proti duplicit\u011b
 *   i skr\u00fdv\u00e1n\u00ed plovouc\u00edch oken v camSimulator.js).
 *   U plovouc\u00edch oken, kter\u00e1 maj\u00ed koexistovat s kreslen\u00edm na pl\u00e1tn\u011b, d\u00e1v\u00e1
 *   smysl `closeOnEsc: false` \u2013 ESC tam pat\u0159\u00ed n\u00e1stroji, ne dialogu.
 */
export function makeOverlay(type, title, bodyHTML, windowClass, opts = {}) {
  const { float = false, closeOnEsc = true, closeOnBackdrop = true } = opts;
  if (document.querySelector(`.calc-overlay[data-type="${CSS.escape(type)}"]`)) return null;
  const overlay = document.createElement("div");
  overlay.className = float ? "calc-overlay calc-overlay-float" : "calc-overlay";
  overlay.dataset.type = type;
  overlay.innerHTML =
    '<div class="calc-window ' + (windowClass || "cnc-window") + '">' +
      '<div class="calc-titlebar"><h3>' + escHTML(title) + '</h3><button class="calc-close-btn">\u2715</button></div>' +
      '<div class="calc-body">' + bodyHTML + '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector(".calc-close-btn").addEventListener("click", () => overlay.remove());
  if (closeOnBackdrop) {
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  }
  if (closeOnEsc) {
    const _escHandler = (e) => { if (e.key === 'Escape') overlay.remove(); };
    document.addEventListener('keydown', _escHandler);
    onOverlayRemoved(overlay, () => document.removeEventListener('keydown', _escHandler));
  } else {
    // Nestačí jen nevěšet handler tady – events.js má vlastní globální ESC,
    // který zavírá nejvyšší otevřený overlay. Tenhle příznak ho vyřadí,
    // takže ESC zůstane nástroji (zrušit rozkreslený prvek).
    overlay.dataset.keepOnEsc = '1';
  }
  return overlay;
}

/**
 * Zavol\u00e1 `cleanup()`, jakmile overlay zmiz\u00ed z DOM. Slou\u017e\u00ed k odhla\u0161ov\u00e1n\u00ed
 * glob\u00e1ln\u00edch listener\u016f (document/window), kter\u00e9 by jinak dr\u017eely referenci
 * na zav\u0159en\u00e9 okno a hromadily se p\u0159i ka\u017ed\u00e9m dal\u0161\u00edm otev\u0159en\u00ed.
 * @param {HTMLElement} overlay
 * @param {() => void} cleanup
 */
export function onOverlayRemoved(overlay, cleanup) {
  new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) { cleanup(); obs.disconnect(); }
  }).observe(document.body, { childList: true });
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
  onOverlayRemoved(overlay, () => document.removeEventListener('keydown', _escHandler));
  return overlay;
}

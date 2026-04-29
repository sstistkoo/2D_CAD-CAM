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

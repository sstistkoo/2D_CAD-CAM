// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro booleovské operace                    ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeInputOverlay } from '../dialogFactory.js';

/**
 * Zobrazí dialog pro výběr booleovské operace.
 * @param {function('union'|'subtract'|'intersect'): void} callback
 */
export function showBooleanDialog(callback) {
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>🔵 Booleovské operace</h3>
      <p style="margin:0 0 12px;opacity:.7;font-size:13px;">Vyberte typ operace pro dvě uzavřené kontury:</p>
      <div class="btn-row" style="flex-direction:column;gap:8px;">
        <button class="btn-ok boolean-op-btn" data-op="union" style="width:100%;justify-content:flex-start;gap:8px;">
          <svg viewBox="0 0 24 24" width="22" height="22" style="flex-shrink:0;">
            <circle cx="9" cy="12" r="5" fill="rgba(166,227,161,.25)" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="15" cy="12" r="5" fill="rgba(166,227,161,.25)" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          ∪ Sjednocení <span style="opacity:.5;font-size:12px;margin-left:auto;">sloučí obě kontury</span>
        </button>
        <button class="btn-ok boolean-op-btn" data-op="subtract" style="width:100%;justify-content:flex-start;gap:8px;">
          <svg viewBox="0 0 24 24" width="22" height="22" style="flex-shrink:0;">
            <circle cx="9" cy="12" r="5" fill="rgba(243,138,168,.25)" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="15" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
          </svg>
          − Odečtení <span style="opacity:.5;font-size:12px;margin-left:auto;">odečte druhou od první</span>
        </button>
        <button class="btn-ok boolean-op-btn" data-op="intersect" style="width:100%;justify-content:flex-start;gap:8px;">
          <svg viewBox="0 0 24 24" width="22" height="22" style="flex-shrink:0;">
            <circle cx="9" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="15" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12 8.1a5 5 0 0 1 0 7.8a5 5 0 0 1 0-7.8z" fill="rgba(137,180,250,.3)" stroke="none"/>
          </svg>
          ∩ Průnik <span style="opacity:.5;font-size:12px;margin-left:auto;">ponechá jen společnou část</span>
        </button>
      </div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);

  overlay.querySelectorAll('.boolean-op-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.op;
      overlay.remove();
      callback(op);
    });
  });
}

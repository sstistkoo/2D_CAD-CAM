// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro oválnou drážku (Slot)                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';

/**
 * Otevře dialog pro zadání parametrů oválné drážky.
 * @param {(params: {length:number, width:number, angle:number}|null) => void} onConfirm
 */
export function showSlotDialog(onConfirm) {
  const body = `
    <div class="cnc-fields">
      <label class="cnc-field" title="Vzdálenost středů oblouků na koncích drážky">
        <span>Délka (osa) [mm]</span>
        <input data-id="length" type="number" value="40" min="0.1" step="1">
      </label>
      <label class="cnc-field" title="Celková šířka drážky (= 2× poloměr)">
        <span>Šířka [mm]</span>
        <input data-id="width" type="number" value="10" min="0.1" step="1">
      </label>
      <label class="cnc-field" title="Úhel rotace okolo středu">
        <span>Úhel [°]</span>
        <input data-id="angle" type="number" value="0" step="5">
      </label>
      <div class="cnc-actions" style="margin-top:10px">
        <button class="slot-btn-draw" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">
          ✏️ Nakreslit
        </button>
        <button class="slot-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer">
          Zrušit
        </button>
      </div>
    </div>
  `;

  const overlay = makeOverlay('slot', '🕳️ Oválná drážka (Slot)', body, 'cnc-window');
  if (!overlay) return;

  overlay.querySelector('.slot-btn-draw').addEventListener('click', () => {
    const length = parseFloat(overlay.querySelector('[data-id="length"]').value);
    const width = parseFloat(overlay.querySelector('[data-id="width"]').value);
    const angle = parseFloat(overlay.querySelector('[data-id="angle"]').value) || 0;
    if (!length || length <= 0 || !width || width <= 0) {
      alert('Délka i šířka musí být > 0');
      return;
    }
    overlay.remove();
    onConfirm({ length, width, angle });
  });
  overlay.querySelector('.slot-btn-cancel').addEventListener('click', () => {
    overlay.remove();
    onConfirm(null);
  });
}

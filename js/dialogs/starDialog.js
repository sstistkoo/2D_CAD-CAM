// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro hvězdu                                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';

/**
 * @param {(params:{points:number, outerRadius:number, innerRadius:number}|null)=>void} onConfirm
 */
export function showStarDialog(onConfirm) {
  const body = `
    <div class="cnc-fields">
      <label class="cnc-field" title="Počet cípů hvězdy">
        <span>Počet cípů</span>
        <input data-id="points" type="number" value="5" min="3" max="32" step="1">
      </label>
      <label class="cnc-field" title="Vzdálenost špiček cípů od středu">
        <span>Vnější poloměr [mm]</span>
        <input data-id="outerR" type="number" value="20" min="0.1" step="1">
      </label>
      <label class="cnc-field" title="Vzdálenost zářezů mezi cípy od středu">
        <span>Vnitřní poloměr [mm]</span>
        <input data-id="innerR" type="number" value="8" min="0.1" step="1">
      </label>
      <div class="cnc-actions" style="margin-top:10px">
        <button class="star-btn-draw" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">✏️ Nakreslit</button>
        <button class="star-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer">Zrušit</button>
      </div>
    </div>
  `;

  const overlay = makeOverlay('star', '⭐ Hvězda', body, 'cnc-window');
  if (!overlay) return;

  overlay.querySelector('.star-btn-draw').addEventListener('click', () => {
    const points = parseInt(overlay.querySelector('[data-id="points"]').value, 10);
    const outerRadius = parseFloat(overlay.querySelector('[data-id="outerR"]').value);
    const innerRadius = parseFloat(overlay.querySelector('[data-id="innerR"]').value);
    if (!points || points < 3 || !outerRadius || outerRadius <= 0 || !innerRadius || innerRadius <= 0) {
      alert('Cípy ≥ 3 a oba poloměry > 0');
      return;
    }
    if (innerRadius >= outerRadius) {
      alert('Vnitřní poloměr musí být menší než vnější');
      return;
    }
    overlay.remove();
    onConfirm({ points, outerRadius, innerRadius });
  });
  overlay.querySelector('.star-btn-cancel').addEventListener('click', () => {
    overlay.remove();
    onConfirm(null);
  });
}

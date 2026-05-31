// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro pravidelný polygon (matice, šestihran) ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';

/**
 * @param {(params:{sides:number, radius:number, firstAngle:number, circumscribed:boolean}|null)=>void} onConfirm
 */
export function showPolygonDialog(onConfirm) {
  const body = `
    <div class="cnc-fields">
      <label class="cnc-field" title="Počet stran (3 = trojúhelník, 6 = šestihran/matice)">
        <span>Počet stran</span>
        <input data-id="sides" type="number" value="6" min="3" max="64" step="1">
      </label>
      <label class="cnc-field" title="Poloměr opsané kružnice (od středu k rohu)">
        <span>Poloměr [mm]</span>
        <input data-id="radius" type="number" value="10" min="0.1" step="1">
      </label>
      <label class="cnc-field" title="Úhel prvního rohu od osy +X (0° = první roh vpravo)">
        <span>Úhel prvního rohu [°]</span>
        <input data-id="firstAngle" type="number" value="0" step="5">
      </label>
      <label class="cnc-field" style="flex-direction:row;align-items:center;gap:6px;cursor:pointer" title="Vepsaný = poloměr je vzdálenost k středu strany (rozměr přes ploché plochy). Opsaný = k rohu.">
        <input data-id="circumscribed" type="checkbox">
        <span>Poloměr = vzdálenost k středu strany (across-flat)</span>
      </label>
      <div class="cnc-actions" style="margin-top:10px">
        <button class="poly-btn-draw" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">✏️ Nakreslit</button>
        <button class="poly-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer">Zrušit</button>
      </div>
    </div>
  `;

  const overlay = makeOverlay('polygon', '⬡ Pravidelný polygon', body, 'cnc-window');
  if (!overlay) return;

  overlay.querySelector('.poly-btn-draw').addEventListener('click', () => {
    const sides = parseInt(overlay.querySelector('[data-id="sides"]').value, 10);
    const radius = parseFloat(overlay.querySelector('[data-id="radius"]').value);
    const firstAngle = parseFloat(overlay.querySelector('[data-id="firstAngle"]').value) || 0;
    const circumscribed = overlay.querySelector('[data-id="circumscribed"]').checked;
    if (!sides || sides < 3 || !radius || radius <= 0) {
      alert('Strany ≥ 3 a poloměr > 0');
      return;
    }
    overlay.remove();
    onConfirm({ sides, radius, firstAngle, circumscribed });
  });
  overlay.querySelector('.poly-btn-cancel').addEventListener('click', () => {
    overlay.remove();
    onConfirm(null);
  });
}

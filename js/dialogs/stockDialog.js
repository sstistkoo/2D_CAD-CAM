// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro výběr způsobu kreslení polotovaru        ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeInputOverlay } from '../dialogFactory.js';

/**
 * Modal pro tlačítko „Polotovar". Tři volby:
 *   1) Auto přídavek na plochu (offset kontury) — pole pro přídavek, sražení, R
 *   2) Ruční kreslení (toggle drawStockMode — stávající chování tlačítka)
 *   3) Polotovar tvaru válce — pole pro přídavek X a Z, vytvoří obdélník
 *      kolem ohraničení kontury
 *
 * @param {(result: null | {mode:'draw'} | {mode:'auto', allowance:number, chamfer:number, fillet:number} | {mode:'cylinder', allowanceX:number, allowanceZ:number}) => void} callback
 * @param {{allowance?:number, chamfer?:number, fillet?:number, allowanceX?:number, allowanceZ?:number}} [defaults]
 */
export function showStockDialog(callback, defaults = {}) {
  const dAllow = defaults.allowance ?? 5;
  const dCham  = defaults.chamfer   ?? 0;
  const dFil   = defaults.fillet    ?? 0;
  const dAddX  = defaults.allowanceX ?? 5;
  const dAddZ  = defaults.allowanceZ ?? 5;

  const overlay = makeInputOverlay(`
    <div class="input-dialog stock-dialog" style="min-width:340px;max-width:420px;">
      <h3>📐 Polotovar</h3>
      <p style="margin:0 0 12px;opacity:.7;font-size:13px;">Vyberte způsob vytvoření polotovaru:</p>

      <details class="stock-section" open>
        <summary style="cursor:pointer;font-weight:600;padding:6px 0;">📏 Přídavek na plochu (offset kontury)</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0;">
          <label class="cnc-field"><span>Přídavek (mm/pl)</span><input data-id="allowance" type="number" step="0.5" min="0" value="${dAllow}"></label>
          <label class="cnc-field"><span>Sražení</span><input data-id="chamfer" type="number" step="0.5" min="0" value="${dCham}"></label>
          <label class="cnc-field"><span>R</span><input data-id="fillet" type="number" step="0.5" min="0" value="${dFil}"></label>
        </div>
        <button class="btn-ok stock-btn-auto" style="width:100%;">✨ Vygenerovat polotovar</button>
      </details>

      <details class="stock-section">
        <summary style="cursor:pointer;font-weight:600;padding:6px 0;">🛢️ Polotovar tvaru válce (obdélník kolem kontury)</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0;">
          <label class="cnc-field"><span>Přídavek X (mm)</span><input data-id="addX" type="number" step="0.5" min="0" value="${dAddX}"></label>
          <label class="cnc-field"><span>Přídavek Z (mm)</span><input data-id="addZ" type="number" step="0.5" min="0" value="${dAddZ}"></label>
        </div>
        <button class="btn-ok stock-btn-cyl" style="width:100%;">🛢️ Vygenerovat válec</button>
      </details>

      <details class="stock-section">
        <summary style="cursor:pointer;font-weight:600;padding:6px 0;">✏️ Ruční kreslení (jako dosud)</summary>
        <p style="margin:6px 0;opacity:.7;font-size:12px;">Přepne režim kreslení — nové objekty budou označeny jako polotovar (jiná barva).</p>
        <button class="btn-ok stock-btn-draw" style="width:100%;">✏️ Zapnout/vypnout režim kreslení</button>
      </details>

      <div class="btn-row" style="margin-top:12px;">
        <button class="btn-cancel btn-cancel-overlay" style="width:100%;">Zrušit</button>
      </div>
    </div>`);

  const getNum = (id, fallback) => {
    const v = parseFloat(overlay.querySelector(`[data-id="${id}"]`).value);
    return Number.isFinite(v) ? v : fallback;
  };

  overlay.querySelector('.stock-btn-auto').addEventListener('click', () => {
    const allowance = getNum('allowance', 0);
    if (allowance <= 0) { alert('Přídavek musí být > 0'); return; }
    const chamfer = getNum('chamfer', 0);
    const fillet  = getNum('fillet', 0);
    overlay.remove();
    callback({ mode: 'auto', allowance, chamfer, fillet });
  });
  overlay.querySelector('.stock-btn-cyl').addEventListener('click', () => {
    const allowanceX = getNum('addX', 0);
    const allowanceZ = getNum('addZ', 0);
    if (allowanceX < 0 || allowanceZ < 0) { alert('Přídavky musí být ≥ 0'); return; }
    overlay.remove();
    callback({ mode: 'cylinder', allowanceX, allowanceZ });
  });
  overlay.querySelector('.stock-btn-draw').addEventListener('click', () => {
    overlay.remove();
    callback({ mode: 'draw' });
  });
  overlay.querySelector('.btn-cancel-overlay').addEventListener('click', () => {
    overlay.remove();
    callback(null);
  });
}

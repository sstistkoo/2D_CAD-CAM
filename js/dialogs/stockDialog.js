// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro přídavek na plochu (offset / válec)      ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeInputOverlay } from '../dialogFactory.js';

/**
 * Modal pro tlačítko „př/pl" (přídavek na plochu). Dvě generační metody:
 *   1) Offset kontury — pole pro přídavek, sražení, R
 *   2) Polotovar tvaru válce — pole pro přídavek X a Z, vytvoří obdélník
 *      kolem ohraničení kontury
 *
 * Cíl výsledných objektů (jak označit nakreslené segmenty):
 *   • 'stock'  — polotovar (isStock=true, jiná barva). Pro materiál PO peci
 *                s přídavkem, který se obrobí.
 *   • 'contour' — kontura (normální vrstva). Pro obrobek PŘED peci — přídavek
 *                je součástí budoucího tvaru, obrobí se po tepelném zpracování.
 *
 * @param {(result: null
 *   | {mode:'auto', target:'stock'|'contour', allowance:number, chamfer:number, fillet:number}
 *   | {mode:'cylinder', target:'stock'|'contour', allowanceX:number, allowanceZ:number}) => void} callback
 * @param {{allowance?:number, chamfer?:number, fillet?:number, allowanceX?:number, allowanceZ?:number, target?:'stock'|'contour'}} [defaults]
 */
export function showStockDialog(callback, defaults = {}) {
  const dAllow  = defaults.allowance  ?? 5;
  const dCham   = defaults.chamfer    ?? 0;
  const dFil    = defaults.fillet     ?? 0;
  const dAddX   = defaults.allowanceX ?? 5;
  const dAddZ   = defaults.allowanceZ ?? 5;
  const dTarget = defaults.target     ?? 'stock';

  const overlay = makeInputOverlay(`
    <div class="input-dialog stock-dialog" style="min-width:340px;max-width:440px;">
      <h3>📏 Přídavek na plochu</h3>

      <div style="margin:0 0 12px;padding:8px;border:1px solid var(--ctp-surface1, #45475a);border-radius:4px;background:rgba(0,0,0,0.15);">
        <div style="font-size:12px;opacity:.85;margin-bottom:6px;font-weight:600;">Nakreslit jako:</div>
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px;">
          <input type="radio" name="stock-target" value="stock" ${dTarget === 'stock' ? 'checked' : ''}>
          <span><strong>Polotovar</strong> <span style="opacity:.6;font-size:11px;">— po peci, jiná barva (isStock)</span></span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px;">
          <input type="radio" name="stock-target" value="contour" ${dTarget === 'contour' ? 'checked' : ''}>
          <span><strong>Kontura</strong> <span style="opacity:.6;font-size:11px;">— před peci, normální vrstva</span></span>
        </label>
      </div>

      <details class="stock-section" open>
        <summary style="cursor:pointer;font-weight:600;padding:6px 0;">📐 Offset kontury (přídavek/sražení/R)</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0;">
          <label class="cnc-field"><span>Přídavek (mm/pl)</span><input data-id="allowance" type="number" step="0.5" min="0" value="${dAllow}"></label>
          <label class="cnc-field"><span>Sražení</span><input data-id="chamfer" type="number" step="0.5" min="0" value="${dCham}"></label>
          <label class="cnc-field"><span>R</span><input data-id="fillet" type="number" step="0.5" min="0" value="${dFil}"></label>
        </div>
        <button class="btn-ok stock-btn-auto" style="width:100%;">✨ Vygenerovat offset</button>
      </details>

      <details class="stock-section">
        <summary style="cursor:pointer;font-weight:600;padding:6px 0;">🛢️ Polotovar tvaru válce (obdélník kolem kontury)</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0;">
          <label class="cnc-field"><span>Přídavek X (mm)</span><input data-id="addX" type="number" step="0.5" min="0" value="${dAddX}"></label>
          <label class="cnc-field"><span>Přídavek Z (mm)</span><input data-id="addZ" type="number" step="0.5" min="0" value="${dAddZ}"></label>
        </div>
        <button class="btn-ok stock-btn-cyl" style="width:100%;">🛢️ Vygenerovat válec</button>
      </details>

      <div class="btn-row" style="margin-top:12px;">
        <button class="btn-cancel btn-cancel-overlay" style="width:100%;">Zrušit</button>
      </div>
    </div>`);

  const getNum = (id, fallback) => {
    const v = parseFloat(overlay.querySelector(`[data-id="${id}"]`).value);
    return Number.isFinite(v) ? v : fallback;
  };
  const getTarget = () => {
    const el = overlay.querySelector('input[name="stock-target"]:checked');
    return el ? el.value : 'stock';
  };

  overlay.querySelector('.stock-btn-auto').addEventListener('click', () => {
    const allowance = getNum('allowance', 0);
    if (allowance <= 0) { alert('Přídavek musí být > 0'); return; }
    const chamfer = getNum('chamfer', 0);
    const fillet  = getNum('fillet', 0);
    overlay.remove();
    callback({ mode: 'auto', target: getTarget(), allowance, chamfer, fillet });
  });
  overlay.querySelector('.stock-btn-cyl').addEventListener('click', () => {
    const allowanceX = getNum('addX', 0);
    const allowanceZ = getNum('addZ', 0);
    if (allowanceX < 0 || allowanceZ < 0) { alert('Přídavky musí být ≥ 0'); return; }
    overlay.remove();
    callback({ mode: 'cylinder', target: getTarget(), allowanceX, allowanceZ });
  });
  overlay.querySelector('.btn-cancel-overlay').addEventListener('click', () => {
    overlay.remove();
    callback(null);
  });
}

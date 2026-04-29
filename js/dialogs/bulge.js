// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Bulge (oblouk segmentu kontury)        ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { showToast, axisLabels } from '../state.js';
import { safeEvalMath, radiusToBulge } from '../utils.js';

// ── Dialog pro nastavení bulge (oblouk segmentu kontury) ──
/**
 * @param {import('../types.js').Point2D} p1
 * @param {import('../types.js').Point2D} p2
 * @param {number} currentBulge
 * @param {function(number): void} onAccept
 */
export function showBulgeDialog(p1, p2, currentBulge, onAccept) {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const minRadius = d / 2;
  // Compute current radius from bulge
  let currentRadius = '';
  let currentCW = false;
  if (currentBulge !== 0) {
    const theta = 4 * Math.atan(Math.abs(currentBulge));
    currentRadius = (d / (2 * Math.sin(theta / 2))).toFixed(3);
    currentCW = currentBulge < 0;
  }

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:360px">
      <h3>⌒ Oblouk segmentu</h3>
      <table style="width:100%;font-family:Consolas;font-size:12px;margin-bottom:8px">
        <tr><td style="color:${COLORS.label}">Bod 1:</td><td style="color:${COLORS.primary}">${axisLabels()[0]}${p1.x.toFixed(3)} ${axisLabels()[1]}${p1.y.toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Bod 2:</td><td style="color:${COLORS.primary}">${axisLabels()[0]}${p2.x.toFixed(3)} ${axisLabels()[1]}${p2.y.toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Tětiva:</td><td style="color:${COLORS.selected}">${d.toFixed(3)} mm</td></tr>
        <tr><td style="color:${COLORS.label}">Min. R:</td><td style="color:${COLORS.preview}">${minRadius.toFixed(3)} mm</td></tr>
      </table>
      <label>Poloměr oblouku (mm):</label>
      <input type="text" id="dlgBulgeR" value="${currentRadius || (minRadius * 2).toFixed(3)}" inputmode="decimal" autofocus>
      <label style="margin-top:8px">Směr:</label>
      <select id="dlgBulgeDir">
        <option value="ccw" ${!currentCW ? 'selected' : ''}>CCW (proti směru hodinových ručiček)</option>
        <option value="cw" ${currentCW ? 'selected' : ''}>CW (po směru hodinových ručiček)</option>
      </select>
      <div id="dlgBulgeInfo" style="font-size:11px;color:${COLORS.textSecondary};margin-top:8px;font-family:Consolas"></div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn-cancel" id="dlgBulgeRemove" style="background:${COLORS.delete};border-color:${COLORS.delete}">Rovný seg.</button>
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="dlgBulgeOk">OK</button>
      </div>
    </div>`);

  const rInput = overlay.querySelector('#dlgBulgeR');
  const dirSelect = overlay.querySelector('#dlgBulgeDir');
  const infoDiv = overlay.querySelector('#dlgBulgeInfo');

  function updateInfo() {
    const r = safeEvalMath(rInput.value);
    if (!isFinite(r) || r < minRadius - 0.001) {
      infoDiv.textContent = 'Poloměr příliš malý';
      return;
    }
    const cw = dirSelect.value === 'cw';
    const b = radiusToBulge(p1, p2, r, cw);
    const theta = 4 * Math.atan(Math.abs(b));
    infoDiv.textContent = `Bulge: ${b.toFixed(4)} | Úhel: ${(theta * 180 / Math.PI).toFixed(1)}° | ${cw ? 'CW' : 'CCW'}`;
  }
  rInput.addEventListener('input', updateInfo);
  dirSelect.addEventListener('change', updateInfo);
  updateInfo();

  rInput.focus();
  rInput.select();

  const accept = () => {
    const r = safeEvalMath(rInput.value);
    if (!isFinite(r) || r < minRadius - 0.001) {
      showToast('Poloměr příliš malý (min: ' + minRadius.toFixed(3) + ')');
      return;
    }
    const cw = dirSelect.value === 'cw';
    const b = radiusToBulge(p1, p2, r, cw);
    onAccept(b);
    overlay.remove();
  };

  overlay.querySelector('#dlgBulgeOk').addEventListener('click', accept);
  overlay.querySelector('#dlgBulgeRemove').addEventListener('click', () => {
    onAccept(0);
    overlay.remove();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') accept();
    if (e.key === 'Escape') overlay.remove();
  });
}

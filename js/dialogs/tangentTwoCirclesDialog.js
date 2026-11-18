// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog: tečna ke dvěma kružnicím                   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Zaškrtávací seznam tečných úseček (vnější předvybrané) + alternativy:
// přesunout kružnici 1 tečně ke kružnici 2, případně (v režimu klikání)
// vzít 2. kružnici jako vazbu a pokračovat dalším segmentem.

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';

/**
 * @param {{label:string, kind:'outer'|'inner'}[]} tangents
 * @param {{onLines:(indices:number[])=>void, onMove:()=>void, onContinue?:()=>void}} actions
 * @returns {HTMLElement} overlay
 */
export function showTwoCircleTangentDialog(tangents, actions) {
  const rows = tangents.map((t, i) =>
    `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-i="${i}"${t.kind === 'outer' ? ' checked' : ''}><span>${t.label}</span></label>`
  ).join('');
  const linesPart = tangents.length > 0
    ? `<label>Tečné úsečky (lze vybrat víc):</label>
      <div style="display:flex;flex-direction:column;gap:4px;margin:4px 0 8px">${rows}</div>
      <div class="btn-row"><button class="btn-ok" id="t2c-lines" style="width:100%">✓ Vytvořit vybrané tečny</button></div>`
    : `<label>Tečné úsečky neexistují (jedna kružnice leží uvnitř druhé).</label>`;
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Tečna ke dvěma kružnicím</h3>
      ${linesPart}
      <div class="btn-row" style="flex-direction:column;gap:6px">
        <button class="btn-ok" id="t2c-move" style="width:100%;background:${COLORS.dimension};color:${COLORS.bgDark}">Místo toho přesunout kružnici 1 tečně ke kružnici 2</button>
        ${actions.onContinue ? '<button class="btn-ok" id="t2c-cont" style="width:100%">Kružnici 2 použít jako vazbu (další segment)…</button>' : ''}
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);

  const linesBtn = overlay.querySelector('#t2c-lines');
  if (linesBtn) {
    const boxes = [...overlay.querySelectorAll('input[type=checkbox]')];
    const sync = () => { linesBtn.disabled = !boxes.some(b => b.checked); };
    boxes.forEach(b => b.addEventListener('change', sync));
    sync();
    linesBtn.addEventListener('click', () => {
      const idx = boxes.filter(b => b.checked).map(b => +b.dataset.i);
      if (idx.length === 0) return;
      overlay.remove();
      actions.onLines(idx);
    });
  }
  overlay.querySelector('#t2c-move').addEventListener('click', () => { overlay.remove(); actions.onMove(); });
  overlay.querySelector('#t2c-cont')?.addEventListener('click', () => { overlay.remove(); actions.onContinue(); });
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();
  return overlay;
}

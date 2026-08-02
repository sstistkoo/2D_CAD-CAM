// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog výběru typu čáry (ČSN EN ISO 128)           ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeInputOverlay } from '../dialogFactory.js';
import { RAINBOW_PRESETS } from '../constants.js';
import { state, showToast } from '../state.js';
import { LINE_STYLES, getLineStyle, saveLineStylePref, refreshLineStyleBtn } from '../lineStyles.js';

/** Náhled vzoru čáry v dialogu (SVG šířky 96 px). */
function previewSvg(st) {
  const dash = st.dash.length ? ` stroke-dasharray="${st.dash.join(' ')}"` : '';
  const w = st.width >= 2 ? 3 : 1.2;
  return `<svg class="line-style-preview" viewBox="0 0 96 12" aria-hidden="true">
    <line x1="2" y1="6" x2="94" y2="6" stroke="currentColor" stroke-width="${w}"${dash} />
  </svg>`;
}

/**
 * Otevře dialog výběru typu čáry a barvy pro nástroj „Typ čáry".
 * Po potvrzení se volba uloží do `state.lineStyle` (+ localStorage) a
 * zavolá se `onApply()`; volba pak platí pro všechny další nakreslené čáry.
 *
 * @param {{active?:boolean, onApply:()=>void, onDeactivate?:()=>void}} opts
 *        `active` – nástroj už kreslí (dialog nabídne i „Vypnout")
 */
export function openLineStyleDialog({ active = false, onApply, onDeactivate } = {}) {
  // Pracovní kopie – při „Zrušit" se nic nemění
  let key = getLineStyle(state.lineStyle.key).key;
  let color = state.lineStyle.color;
  let aux = state.lineStyle.aux;

  const rows = LINE_STYLES.map(st => `
    <label class="line-style-row${st.key === key ? ' active' : ''}" data-key="${st.key}">
      <input type="radio" name="lsType" value="${st.key}"${st.key === key ? ' checked' : ''}>
      <span class="line-style-info">
        <span class="line-style-name">${st.label}</span>
        <span class="line-style-use">${st.use}</span>
      </span>
      ${previewSvg(st)}
    </label>`).join('');

  const swatches = RAINBOW_PRESETS.map(c => `
    <button type="button" class="color-swatch-btn" data-color="${c}" title="${c}"
            style="background:${c}"></button>`).join('');

  const overlay = makeInputOverlay(`
    <div class="input-dialog line-style-dialog">
      <div class="line-style-header">
        <h3>Typ čáry</h3>
        <button type="button" class="line-style-stock-toggle${state.drawStockMode ? ' active' : ''}" id="lsStockToggle" title="Přepnout kreslení polotovaru/kontury">
          <span class="stock-toggle-label">${state.drawStockMode ? 'Polotovar' : 'Kontura'}</span>
        </button>
      </div>
      <div class="line-style-list">${rows}</div>
      <label class="line-style-section-label">Barva</label>
      <div class="color-swatch-row line-style-swatches">
        <button type="button" class="color-swatch-btn line-style-swatch-auto" data-color=""
                title="Podle vrstvy">A</button>
        ${swatches}
      </div>
      <div class="line-style-custom">
        <label for="lsCustom">Vlastní:</label>
        <input type="color" id="lsCustom" value="${color || '#89b4fa'}">
      </div>
      <label class="line-style-aux">
        <input type="checkbox" id="lsAux"${aux ? ' checked' : ''}>
        <span>Pomocná čára – mimo konturu a CAM</span>
      </label>
      <div class="line-style-note" id="lsNote"></div>
      <div class="btn-row line-style-btns">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        ${active ? '<button class="btn-cancel" id="lsOff" title="Ukončit kreslení a přepnout na Výběr">Vypnout</button>' : ''}
        <button class="btn-ok" id="lsOk">Kreslit</button>
      </div>
    </div>`);

  const auxInp = /** @type {HTMLInputElement} */ (overlay.querySelector('#lsAux'));
  const customInp = /** @type {HTMLInputElement} */ (overlay.querySelector('#lsCustom'));
  const note = overlay.querySelector('#lsNote');
  const swatchBtns = /** @type {HTMLButtonElement[]} */ ([...overlay.querySelectorAll('.color-swatch-btn')]);

  function syncNote() {
    const st = getLineStyle(key);
    note.textContent = aux
      ? (st.infinite
        ? 'Nekonečná pomocná čára – slouží jen jako reference, do G-kódu nevstupuje.'
        : 'Uloží se jako pomocná čára (vrstva Konstrukce) – do kontury ani do G-kódu nevstupuje.')
      : 'Uloží se jako běžná úsečka – vstupuje do kontury i do CAM.';
  }

  function syncSwatches() {
    swatchBtns.forEach(b => b.classList.toggle('active', (b.dataset.color || '') === (color || '')));
  }

  // Výběr typu čáry – přepne i výchozí příznak „pomocná čára"
  overlay.querySelectorAll('.line-style-row').forEach(row => {
    row.addEventListener('change', () => {
      key = row.dataset.key;
      aux = getLineStyle(key).aux;
      auxInp.checked = aux;
      overlay.querySelectorAll('.line-style-row').forEach(r => r.classList.toggle('active', r === row));
      syncNote();
    });
  });

  swatchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      color = btn.dataset.color || null;
      if (color) customInp.value = color;
      syncSwatches();
    });
  });

  customInp.addEventListener('input', () => {
    color = customInp.value;
    syncSwatches();
  });

  auxInp.addEventListener('change', () => {
    aux = auxInp.checked;
    syncNote();
  });

  // Přepínač polotovar/kontura
  const stockToggle = overlay.querySelector('#lsStockToggle');
  const stockLabel = overlay.querySelector('.stock-toggle-label');
  stockToggle.addEventListener('click', () => {
    state.drawStockMode = !state.drawStockMode;
    stockLabel.textContent = state.drawStockMode ? 'Polotovar' : 'Kontura';
    stockToggle.classList.toggle('active', state.drawStockMode);
    // Aktualizovat i původní tlačítko v toolbaru
    const toolbarBtn = document.getElementById('btnDrawStock');
    if (toolbarBtn) toolbarBtn.classList.toggle('active', state.drawStockMode);
    // Aktualizovat popisek tlačítka Typ čáry
    refreshLineStyleBtn();
  });

  function accept() {
    state.lineStyle.key = key;
    state.lineStyle.color = color;
    state.lineStyle.aux = aux;
    saveLineStylePref();
    refreshLineStyleBtn();
    overlay.remove();
    if (onApply) onApply();
    showToast(`Typ čáry: ${getLineStyle(key).label}`);
  }

  overlay.querySelector('#lsOk').addEventListener('click', accept);
  overlay.querySelector('#lsOff')?.addEventListener('click', () => {
    overlay.remove();
    if (onDeactivate) onDeactivate();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); accept(); }
    if (e.key === 'Escape') overlay.remove();
    e.stopPropagation();
  });

  syncSwatches();
  syncNote();
}

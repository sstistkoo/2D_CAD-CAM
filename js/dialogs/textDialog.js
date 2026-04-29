// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro textovou anotaci                       ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import { state } from '../state.js';

/** Escape HTML pro bezpečné vložení uživatelského textu */
function escHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const FONT_FAMILIES = [
  { value: 'Consolas, monospace', label: 'Consolas (mono)' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Courier New, monospace', label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Georgia, serif', label: 'Georgia' },
];

const ALIGN_OPTIONS = [
  { value: 'left', label: '⬅ Vlevo', icon: '⬅' },
  { value: 'center', label: '⬛ Střed', icon: '⬛' },
  { value: 'right', label: '➡ Vpravo', icon: '➡' },
];

const PATH_MODES = [
  { value: 'none', label: '— Bez cesty' },
  { value: 'line', label: '📏 Podél úsečky' },
  { value: 'arc', label: '⌒ Podél oblouku' },
  { value: 'circle', label: '⭕ Podél kružnice' },
];

/**
 * Otevře dialog pro zadání/editaci textu.
 * @param {object} opts - Počáteční hodnoty
 * @param {string} [opts.text] - Text k editaci
 * @param {number} [opts.fontSize] - Velikost písma
 * @param {string} [opts.fontFamily] - Font
 * @param {number} [opts.rotation] - Rotace v rad
 * @param {string} [opts.textAlign] - Zarovnání
 * @param {boolean} [opts.bold] - Tučné
 * @param {boolean} [opts.italic] - Kurzíva
 * @param {string} [opts.pathMode] - Režim cesty ('none'|'line'|'arc')
 * @param {number} [opts.pathObjectId] - ID objektu pro cestu
 * @param {number} [opts.letterSpacing] - Mezera mezi znaky
 * @param {boolean} [opts.editMode] - Editace existujícího textu
 * @param {(result: object) => void} onConfirm - Callback
 */
export function showTextDialog(opts, onConfirm) {
  const defaults = {
    text: '',
    fontSize: 14,
    fontFamily: 'Consolas, monospace',
    rotation: 0,
    textAlign: 'left',
    bold: false,
    italic: false,
    pathMode: 'none',
    pathObjectId: null,
    pathOffset: 2,
    letterSpacing: 0,
    ...opts,
  };

  // Najdi dostupné úsečky a oblouky pro text podél cesty
  const availableLines = state.objects
    .map((o, i) => ({ obj: o, idx: i }))
    .filter(({ obj }) => obj && (obj.type === 'line' || obj.type === 'constr'));
  const availableArcs = state.objects
    .map((o, i) => ({ obj: o, idx: i }))
    .filter(({ obj }) => obj && obj.type === 'arc');
  const availableCircles = state.objects
    .map((o, i) => ({ obj: o, idx: i }))
    .filter(({ obj }) => obj && obj.type === 'circle');

  const lineOptions = availableLines.map(({ obj, idx }) =>
    `<option value="${idx}" ${defaults.pathObjectId === idx ? 'selected' : ''}>${escHTML(obj.name || 'Úsečka #' + (idx + 1))}</option>`
  ).join('');

  const arcOptions = availableArcs.map(({ obj, idx }) =>
    `<option value="${idx}" ${defaults.pathObjectId === idx ? 'selected' : ''}>${escHTML(obj.name || 'Oblouk #' + (idx + 1))}</option>`
  ).join('');

  const circleOptions = availableCircles.map(({ obj, idx }) =>
    `<option value="${idx}" ${defaults.pathObjectId === idx ? 'selected' : ''}>${escHTML(obj.name || 'Kružnice #' + (idx + 1))}</option>`
  ).join('');

  const fontOptions = FONT_FAMILIES.map(f =>
    `<option value="${f.value}" ${defaults.fontFamily === f.value ? 'selected' : ''}>${f.label}</option>`
  ).join('');

  const body = `
    <div class="text-dialog">
      <label class="cnc-field cnc-field-full">
        <span>Text</span>
        <textarea data-id="txt-content" rows="3" style="resize:vertical;font-family:${defaults.fontFamily};font-size:14px;min-height:40px"
          placeholder="Zadejte text...">${escHTML(defaults.text)}</textarea>
      </label>

      <div class="cnc-fields" style="grid-template-columns:1fr 1fr 1fr">
        <label class="cnc-field">
          <span>Velikost [mm]</span>
          <input data-id="txt-size" type="number" value="${defaults.fontSize}" min="1" max="500" step="1">
        </label>
        <label class="cnc-field">
          <span>Rotace [°]</span>
          <input data-id="txt-rotation" type="number" value="${(defaults.rotation * 180 / Math.PI).toFixed(1)}" step="5">
        </label>
        <label class="cnc-field">
          <span>Rozpal [mm]</span>
          <input data-id="txt-spacing" type="number" value="${defaults.letterSpacing}" min="-10" max="50" step="0.5" title="Mezera mezi znaky">
        </label>
      </div>

      <div class="cnc-fields">
        <label class="cnc-field">
          <span>Písmo</span>
          <select data-id="txt-font">${fontOptions}</select>
        </label>
        <div class="cnc-field">
          <span>Zarovnání</span>
          <div class="text-align-btns" data-id="txt-align">
            ${ALIGN_OPTIONS.map(a => `<button type="button" data-val="${a.value}" class="text-align-btn${defaults.textAlign === a.value ? ' active' : ''}" title="${a.label}">${a.value === 'left' ? '⫷' : a.value === 'center' ? '☰' : '⫸'}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="cnc-fields">
        <label class="cnc-field" style="flex-direction:row;align-items:center;gap:8px">
          <input data-id="txt-bold" type="checkbox" ${defaults.bold ? 'checked' : ''}>
          <span style="font-weight:bold">B Tučné</span>
        </label>
        <label class="cnc-field" style="flex-direction:row;align-items:center;gap:8px">
          <input data-id="txt-italic" type="checkbox" ${defaults.italic ? 'checked' : ''}>
          <span style="font-style:italic">I Kurzíva</span>
        </label>
      </div>

      <hr style="border-color:var(--ctp-surface1);margin:8px 0">

      <label class="cnc-field cnc-field-full">
        <span>📐 Text podél cesty</span>
        <select data-id="txt-pathmode">
          ${PATH_MODES.map(m => `<option value="${m.value}" ${defaults.pathMode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </label>

      <div data-id="txt-pathobj-wrap" class="cnc-field cnc-field-full" style="display:${defaults.pathMode !== 'none' ? 'flex' : 'none'};flex-direction:column;gap:3px;margin-top:4px">
        <span>Cílový objekt</span>
        <select data-id="txt-pathobj">
          ${defaults.pathMode === 'arc' ? arcOptions : defaults.pathMode === 'circle' ? circleOptions : lineOptions}
        </select>
      </div>

      <div data-id="txt-pathoffset-wrap" class="cnc-field cnc-field-full" style="display:${defaults.pathMode !== 'none' ? 'flex' : 'none'};flex-direction:column;gap:3px;margin-top:4px">
        <span>Odsazení od objektu [mm]</span>
        <input data-id="txt-pathoffset" type="number" value="${defaults.pathOffset}" step="0.5" title="Vzdálenost textu od cesty (kladná = nad, záporná = pod)">
      </div>

      <div class="text-preview-box" data-id="txt-preview-box" style="margin-top:10px">
        <span style="font-size:11px;color:var(--ctp-subtext0)">Náhled:</span>
        <div data-id="txt-preview" class="text-preview"></div>
      </div>

      <div class="cnc-actions" style="margin-top:10px">
        <button class="text-btn-ok" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">
          ${defaults.editMode ? '💾 Uložit' : '✏️ Umístit'}
        </button>
        <button class="text-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer;font-size:13px">
          Zrušit
        </button>
      </div>
    </div>
  `;

  const overlay = makeOverlay('textDialog', '📝 Textová anotace', body, 'cnc-window');
  if (!overlay) return;

  const elText = overlay.querySelector('[data-id="txt-content"]');
  const elSize = overlay.querySelector('[data-id="txt-size"]');
  const elRotation = overlay.querySelector('[data-id="txt-rotation"]');
  const elSpacing = overlay.querySelector('[data-id="txt-spacing"]');
  const elFont = overlay.querySelector('[data-id="txt-font"]');
  const elAlignWrap = overlay.querySelector('[data-id="txt-align"]');
  const elBold = overlay.querySelector('[data-id="txt-bold"]');
  const elItalic = overlay.querySelector('[data-id="txt-italic"]');
  const elPathMode = overlay.querySelector('[data-id="txt-pathmode"]');
  const elPathObjWrap = overlay.querySelector('[data-id="txt-pathobj-wrap"]');
  const elPathObj = overlay.querySelector('[data-id="txt-pathobj"]');
  const elPathOffset = overlay.querySelector('[data-id="txt-pathoffset"]');
  const elPathOffsetWrap = overlay.querySelector('[data-id="txt-pathoffset-wrap"]');
  const elPreview = overlay.querySelector('[data-id="txt-preview"]');

  let currentAlign = defaults.textAlign;

  // Focus text input
  setTimeout(() => elText.focus(), 100);

  // Alignment buttons
  elAlignWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.text-align-btn');
    if (!btn) return;
    currentAlign = btn.dataset.val;
    elAlignWrap.querySelectorAll('.text-align-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updatePreview();
  });

  // Path mode change
  elPathMode.addEventListener('change', () => {
    const mode = elPathMode.value;
    if (mode === 'none') {
      elPathObjWrap.style.display = 'none';
      elPathOffsetWrap.style.display = 'none';
    } else {
      elPathObjWrap.style.display = 'flex';
      elPathOffsetWrap.style.display = 'flex';
      // Přepni seznam objektů
      elPathObj.innerHTML = mode === 'arc' ? arcOptions : mode === 'circle' ? circleOptions : lineOptions;
    }
    updatePreview();
  });

  // Preview update
  function updatePreview() {
    const text = elText.value || 'Ukázkový text';
    const size = Math.min(24, Math.max(10, parseFloat(elSize.value) || 14));
    const font = elFont.value;
    const bold = elBold.checked ? 'bold' : 'normal';
    const italic = elItalic.checked ? 'italic' : 'normal';
    const spacing = parseFloat(elSpacing.value) || 0;
    elPreview.style.fontFamily = font;
    elPreview.style.fontSize = size + 'px';
    elPreview.style.fontWeight = bold;
    elPreview.style.fontStyle = italic;
    elPreview.style.letterSpacing = spacing + 'px';
    elPreview.style.textAlign = currentAlign;
    elPreview.textContent = text;

    // Aktualizuj font v textarea
    elText.style.fontFamily = font;
    elText.style.fontWeight = bold;
    elText.style.fontStyle = italic;
  }

  // Wire live preview
  [elText, elSize, elSpacing].forEach(el => el.addEventListener('input', updatePreview));
  [elFont, elBold, elItalic].forEach(el => el.addEventListener('change', updatePreview));
  updatePreview();

  // Confirm
  overlay.querySelector('.text-btn-ok').addEventListener('click', () => {
    const text = elText.value.trim();
    if (!text) {
      elText.focus();
      elText.style.borderColor = 'var(--ctp-red)';
      return;
    }
    const result = {
      text,
      fontSize: parseFloat(elSize.value) || 14,
      fontFamily: elFont.value,
      rotation: (parseFloat(elRotation.value) || 0) * Math.PI / 180,
      textAlign: currentAlign,
      bold: elBold.checked,
      italic: elItalic.checked,
      letterSpacing: parseFloat(elSpacing.value) || 0,
      pathMode: elPathMode.value,
      pathObjectId: elPathMode.value !== 'none' && elPathObj.value ? parseInt(elPathObj.value, 10) : null,
      pathOffset: parseFloat(elPathOffset.value) || 0,
    };
    overlay.remove();
    onConfirm(result);
  });

  // Cancel
  overlay.querySelector('.text-btn-cancel').addEventListener('click', () => overlay.remove());

  // Enter in textarea: allow newlines with Shift+Enter, confirm with Enter
  elText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      overlay.querySelector('.text-btn-ok').click();
    }
    e.stopPropagation();
  });

  // Stop keyboard shortcuts from propagating
  overlay.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el.blur();
      e.stopPropagation();
    });
  });
}

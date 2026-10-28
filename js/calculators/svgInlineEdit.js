// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Zadávání hodnot kliknutím do náčrtu kalkulačky      ║
// ╚══════════════════════════════════════════════════════════════╝
// Malé plovoucí okénko u místa kliknutí: popisek, pole, OK / ✕ a volitelná
// tlačítka (např. strana měření). Enter = OK, Esc = zavřít (jen okénko,
// ne celý dialog). Styly .svg-pop* v css/style.css.

import { safeEvalMath } from '../utils.js';

let current = null;

export function closeInlineEdit() {
  if (current) { current.remove(); current = null; }
}

/**
 * @param {{clientX:number, clientY:number}} at  kde se okénko otevře
 * @param {object} o
 * @param {string} o.label
 * @param {string} [o.value]
 * @param {string} [o.unit]
 * @param {string} [o.hint]
 * @param {{value:string, text:string}[]} [o.choices]  přepínač (jedna volba aktivní)
 * @param {string} [o.choice]   výchozí volba
 * @param {(val:number|null, choice?:string, raw?:string) => void} o.onCommit  null = prázdné (smazat)
 * @param {() => void} [o.onDelete]  zobrazí tlačítko 🗑
 * @param {boolean} [o.text]  nepočítat výraz, předat text (např. „H7")
 */
export function openInlineEdit(at, o) {
  closeInlineEdit();
  const pop = document.createElement('div');
  pop.className = 'svg-pop';
  pop.innerHTML =
    '<div class="svg-pop-label">' + o.label + (o.unit ? ' <small>' + o.unit + '</small>' : '') + '</div>' +
    (o.hint ? '<div class="svg-pop-hint">' + o.hint + '</div>' : '') +
    (o.choices ? '<div class="svg-pop-choices">' + o.choices.map(c =>
      '<button type="button" data-v="' + c.value + '"' + (c.value === o.choice ? ' class="on"' : '') + '>' + c.text + '</button>').join('') + '</div>' : '') +
    '<div class="svg-pop-row"><input type="text" ' + (o.text ? '' : 'inputmode="decimal" ') + 'autocomplete="off">' +
    '<button type="button" class="svg-pop-ok">OK</button>' +
    (o.onDelete ? '<button type="button" class="svg-pop-del" title="Odebrat">🗑</button>' : '') +
    '<button type="button" class="svg-pop-x" title="Zavřít">✕</button></div>';
  document.body.appendChild(pop);
  current = pop;

  const inp = pop.querySelector('input');
  inp.value = o.value ?? '';
  let choice = o.choice;
  pop.querySelectorAll('.svg-pop-choices button').forEach(b => b.addEventListener('click', () => {
    choice = b.dataset.v;
    pop.querySelectorAll('.svg-pop-choices button').forEach(x => x.classList.toggle('on', x === b));
    inp.focus();
  }));

  // Umístit u kliknutí, ale celé na obrazovce
  const r = pop.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = at.clientX - r.width / 2, y = at.clientY + 14;
  if (y + r.height > vh - 8) y = at.clientY - r.height - 14;
  pop.style.left = Math.max(8, Math.min(x, vw - r.width - 8)) + 'px';
  pop.style.top = Math.max(8, y) + 'px';

  const commit = () => {
    const raw = inp.value.trim();
    let val = null;
    if (raw !== '') {
      if (o.text) val = raw;
      else {
        val = safeEvalMath(raw);
        if (!Number.isFinite(val)) { inp.classList.add('svg-pop-bad'); inp.focus(); return; }
      }
    }
    closeInlineEdit();
    o.onCommit(val, choice, raw);
  };
  pop.querySelector('.svg-pop-ok').addEventListener('click', commit);
  pop.querySelector('.svg-pop-x').addEventListener('click', closeInlineEdit);
  pop.querySelector('.svg-pop-del')?.addEventListener('click', () => { closeInlineEdit(); o.onDelete(); });
  inp.addEventListener('input', () => inp.classList.remove('svg-pop-bad'));
  pop.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeInlineEdit(); }
  });
  // Klik mimo okénko ho zavře (až po aktuálním kliku)
  setTimeout(() => {
    const away = e => {
      if (!current || current !== pop) { document.removeEventListener('pointerdown', away, true); return; }
      if (!pop.contains(e.target) && !e.target.closest?.('[data-edit]')) {
        closeInlineEdit(); document.removeEventListener('pointerdown', away, true);
      }
    };
    document.addEventListener('pointerdown', away, true);
  }, 0);
  inp.focus();
  inp.select();
}

/**
 * Napojí klikání na prvky s atributem data-edit uvnitř SVG.
 * handler(key, event, element) – rozhodne, co otevřít.
 * onBackground(event, svgPoint) – klik mimo editovatelné prvky (volitelné).
 */
export function wireSvgEditing(svg, handler, onBackground) {
  svg.addEventListener('click', e => {
    const el = e.target.closest('[data-edit]');
    if (el && svg.contains(el)) { handler(el.dataset.edit, e, el); return; }
    if (onBackground) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const m = svg.getScreenCTM();
      if (m) onBackground(e, pt.matrixTransform(m.inverse()));
    }
  });
}

/** Zapíše hodnotu do pole formuláře a pošle `input` (spustí přepočet). */
export function setField(input, value) {
  input.value = value === null || value === undefined ? '' : String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

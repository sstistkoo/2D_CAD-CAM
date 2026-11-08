/**
 * Číselník CNC editoru (okno „Zadejte X…") s jednoduchou kalkulačkou
 * (uživatel 8. 11. 2026): zvlášť + a −, × ÷, závorky, C (vše smazat) a ⌫.
 * Zadaný výraz se při OK spočítá a do kódu jde výsledné číslo
 * („X" + 100/2+5 → „X55 "), takže to přečte každý řídicí systém.
 */
import { safeEvalMath } from '../utils.js';

const KEYS = [
  ['C', 'cnp-clr', 'Smazat vše'], ['(', 'cnp-op'], [')', 'cnp-op'], ['⌫', 'cnp-back', 'Smazat poslední znak'],
  ['7'], ['8'], ['9'], ['÷', 'cnp-op', 'Děleno'],
  ['4'], ['5'], ['6'], ['×', 'cnp-op', 'Krát'],
  ['1'], ['2'], ['3'], ['−', 'cnp-op', 'Mínus'],
  ['0', 'cnp-zero'], ['.'], ['+', 'cnp-op', 'Plus'],
];

/** Obsah okna číselníku (data-el názvy čte cncEditor.js). */
export function numpadHTML() {
  const keys = KEYS.map(([k, cls = '', t = '']) =>
    `<button type="button" class="cnp-key ${cls}" data-nk="${k}"${t ? ` title="${t}"` : ''}>${k}</button>`).join('');
  return `<div class="cne-im-card cnp-card">
      <div class="cne-im-title"><span data-el="numTitle">Vstup</span><button class="cne-im-close" data-act="numCancel" title="Zavřít">✕</button></div>
      <div class="cnp-display"><input class="cnp-input" data-el="numInput" type="text" readonly placeholder="0"><div class="cnp-preview" data-el="numPreview"></div></div>
      <div class="cne-im-helpers" data-el="numHelpers"></div>
      <div class="cnp-grid">${keys}</div>
      <button type="button" class="cnp-ok" data-act="numOk">OK</button>
    </div>`;
}

const norm = s => String(s).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').trim();
const PLAIN = /^-?(?:\d+\.?\d*|\.\d+)$/;
const fmt = n => { const r = Number(n.toFixed(4)); return String(Object.is(r, -0) ? 0 : r); };

/**
 * Text, který se vloží za písmeno osy: '' = nic, číslo beze změny,
 * výraz → spočítaný výsledek (max. 4 desetinná místa), null = neplatný výraz.
 */
export function numpadResult(text) {
  const s = norm(text);
  if (!s) return '';
  if (PLAIN.test(s)) return s;
  const n = safeEvalMath(s);
  return Number.isFinite(n) ? fmt(n) : null;
}

/** Nový obsah pole po stisku klávesy číselníku. */
export function numpadKey(v, k) {
  if (k === 'C') return '';
  if (k === '⌫') return v.slice(0, -1);
  return v + k;
}

/** Klávesy číselníku + živý náhled výsledku („= 55") pod polem. */
export function wireNumpadCalc(modal, input) {
  const prev = modal.querySelector('[data-el="numPreview"]');
  const refresh = () => {
    const s = norm(input.value);
    const r = PLAIN.test(s) || !s ? '' : numpadResult(s);
    prev.textContent = r === '' ? '' : r === null ? 'neúplný výraz' : '= ' + r;
    prev.classList.toggle('bad', r === null);
  };
  modal.addEventListener('click', e => {
    const b = e.target.closest('[data-nk]');
    if (!b) return;
    e.stopPropagation();
    input.value = numpadKey(input.value, b.dataset.nk);
    refresh();
  });
  // Otevření okna (nový titulek, prázdné pole) i výběr G/M z nápovědy → náhled znovu.
  new MutationObserver(refresh).observe(modal, { attributes: true, attributeFilter: ['style'] });
  modal.addEventListener('click', () => setTimeout(refresh));
  input.addEventListener('keydown', () => setTimeout(refresh));
}

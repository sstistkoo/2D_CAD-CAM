// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Lišta + − × ÷ ( ) = nad číselnou klávesnicí (dotyk)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Číselná pole mají na mobilu inputmode="decimal" (nebo type="number"), takže
// systémová klávesnice ukáže jen číslice, tečku a mínus – výraz typu 50/2 nebo
// 120-2*3 do pole nešlo napsat, i když ho aplikace umí spočítat (safeEvalMath).
//
// Tady se jednou pro celou aplikaci:
//  • nad klávesnicí ukáže lišta + − × ÷ ( ) = pro pole s inputmode="decimal"
//    a type="number" (dotykové displeje),
//  • pole type="number" se na dobu psaní přepne na text (číselné pole by znak
//    + nebo / smazalo) a po opuštění se vrátí,
//  • výraz se při potvrzení (change / Enter) přepočítá na číslo – i v polích,
//    která čtou jen parseFloat (z „50/2" by jinak bylo tiše 50).
// Pole s data-no-math lišta i přepočet vynechá.

import { safeEvalMath } from '../utils.js';
import { typeInto } from './numPadBar.js';
import { setViewportBottomReserve } from './innerModalViewport.js';

const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Obyčejné číslo (i s čárkou) – nic se nepřepočítává. */
const PLAIN = /^\s*[-+]?(\d+[.,]?\d*|[.,]\d+)?\s*$/;

/**
 * Je to číselné pole, kam patří výraz?
 * @param {any} el
 */
export function isMathField(el) {
  if (!el || el.tagName !== 'INPUT' || el.disabled || el.readOnly) return false;
  if (el.dataset?.noMath != null) return false;
  if (el.type === 'number') return true;
  return el.type === 'text' && el.getAttribute('inputmode') === 'decimal';
}

/**
 * Přepočítá výraz v poli na číslo. Obyčejné číslo nechá být.
 * @param {HTMLInputElement} el
 * @returns {boolean} true = hodnota se změnila
 */
export function evalMathField(el) {
  const raw = el.value;
  if (PLAIN.test(raw)) return false;
  const n = safeEvalMath(raw);
  if (!Number.isFinite(n)) return false;
  const v = String(+n.toFixed(6));
  if (v === raw) return false;
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// ── type="number" ↔ text po dobu psaní (jen dotyk) ──
function numberToText(el) {
  if (el.type !== 'number' || !isTouch()) return;
  el.dataset.mkbNum = el.getAttribute('inputmode') ?? '';
  el.type = 'text';
  el.setAttribute('inputmode', 'decimal');
}
function textToNumber(el) {
  if (el.dataset?.mkbNum == null) return;
  evalMathField(el);
  const im = el.dataset.mkbNum;
  delete el.dataset.mkbNum;
  el.type = 'number';
  if (im) el.setAttribute('inputmode', im); else el.removeAttribute('inputmode');
}

// ── Lišta ──
const KEYS = [
  { k: '+', t: 'Plus' }, { k: '-', l: '−', t: 'Mínus' }, { k: '*', l: '×', t: 'Krát' }, { k: '/', l: '÷', t: 'Děleno' },
  { k: '(', t: 'Závorka' }, { k: ')', t: 'Závorka' }, { k: '=', t: 'Spočítat výraz' },
];
let bar = null, target = null;

function ensureBar() {
  if (bar) { if (!bar.isConnected) document.body.appendChild(bar); return bar; }
  bar = document.createElement('div');
  bar.className = 'math-key-bar';
  bar.hidden = true;
  bar.innerHTML = KEYS.map(o =>
    `<button type="button" class="math-key${o.k === '=' ? ' math-key-eq' : ''}" data-mk="${o.k}" title="${o.t}">${o.l || o.k}</button>`).join('');
  // Klávesy nesmí vzít poli fokus (zavřela by se klávesnice a výraz by se přepočítal).
  const keep = (e) => { if (e.target.closest('button')) e.preventDefault(); };
  bar.addEventListener('pointerdown', keep);
  bar.addEventListener('mousedown', keep);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mk]');
    if (!b || !target || !target.isConnected) return;
    if (document.activeElement !== target) target.focus();
    numberToText(target);   // po Enter (change) už mohlo být zase číselné
    if (b.dataset.mk === '=') { evalMathField(target); return; }
    // Celé pole označené (po fokusu / volbě ✛) – znaménko číslo nepřepíše,
    // připíše se za něj (90 → 90+). Jen „(" výběr nahradí (začátek nového výrazu).
    const t = target, len = t.value.length;
    if (len && t.selectionStart === 0 && t.selectionEnd === len && b.dataset.mk !== '(') {
      t.setSelectionRange(len, len);
    }
    typeInto(t, b.dataset.mk);
  });
  document.body.appendChild(bar);
  return bar;
}

function place() {
  if (!bar || bar.hidden) return;
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop + vv.height - bar.offsetHeight : window.innerHeight - bar.offsetHeight;
  bar.style.top = `${Math.max(0, top)}px`;
}

function show(el) {
  target = el;
  ensureBar().hidden = false;
  place();
  setViewportBottomReserve(bar.offsetHeight);
}

function hide() {
  target = null;
  if (!bar || bar.hidden) return;
  bar.hidden = true;
  setViewportBottomReserve(0);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  // Přepnout číselné pole na text ještě před fokusem – klávesnice se pak
  // rovnou otevře s tečkou a lišta může psát znaménka.
  document.addEventListener('pointerdown', (e) => {
    const el = e.target;
    if (el?.tagName === 'INPUT' && el.type === 'number' && isMathField(el)) numberToText(el);
  }, true);

  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!isMathField(el)) return;
    numberToText(el);
    if (isTouch()) show(el);
  });

  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el?.dataset?.mkbNum != null) textToNumber(el);
    setTimeout(() => { if (!isMathField(document.activeElement)) hide(); }, 0);
  });

  // Potvrzení hodnoty: přepočítat výraz DŘÍV, než ho přečte obsluha dialogu
  // (capture na dokumentu běží před posluchači na poli).
  // Převedené type="number" se vrací už tady: obsluha change smí počítat
  // s inp.type === 'number' (např. parametry simulátoru CAM).
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!isMathField(el)) return;
    if (el.dataset.mkbNum != null) textToNumber(el); else evalMathField(el);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isMathField(e.target)) evalMathField(e.target);
  }, true);

  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) { vv.addEventListener('resize', place); vv.addEventListener('scroll', place); }
}

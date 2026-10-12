// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Trigonometrie: přepínač pravoúhlý / obecný trojúhelník ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Okno „Trigonometrie" (pravý trojúhelník) žije v ui.js. Tady se do již otevřeného
// okna doplní záložky: stávající obsah zůstane beze změny v záložce „Pravoúhlý"
// (přesunuté uzly si drží své posluchače) a přibude „Obecný" – SSS, SAS, ASA/AAS,
// SSA (až dvě řešení), obsah, obvod, výšky, poloměry kružnic.
// Napojení: ui.js po otevření okna zavolá bridge.extendTrigCalc().

import { bridge } from '../bridge.js';
import { onOverlayRemoved } from '../dialogFactory.js';
import { showToast } from '../state.js';
import { solveTriangle } from '../triangleSolver.js';
import { fmt, numVal, tabsHtml, wireTabs, outRow, svgEl, svgClear, fitView, svgPoints } from './calcKit.js';

const STORE_KEY = 'skica.trigMode';
const TITLES = { right: '📐 Trigonometrie – pravý trojúhelník', general: '📐 Trigonometrie – obecný trojúhelník' };
const KEYS = ['a', 'b', 'c', 'alpha', 'beta', 'gamma'];
const SYM = { a: 'a', b: 'b', c: 'c', alpha: 'α', beta: 'β', gamma: 'γ' };

const field = (k, cls, hint, unit) =>
  '<div class="trig-field"><label class="' + cls + '">' + SYM[k] + '</label>' +
  '<input type="text" data-k="' + k + '" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="' + hint + '">' +
  '<span class="trig-unit">' + unit + '</span></div>';

const GENERAL_HTML =
  '<div class="trig-svg-wrap"><svg class="calc-svg" viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" data-gen="svg" role="img" aria-label="Náčrt trojúhelníku"></svg></div>' +
  '<div class="trig-fields">' +
    '<div class="trig-col"><h4>Strany</h4>' +
      field('a', 'label-a', 'proti α', 'mm') + field('b', 'label-b', 'proti β', 'mm') + field('c', 'label-c', 'proti γ', 'mm') +
    '</div>' +
    '<div class="trig-col"><h4>Úhly</h4>' +
      field('alpha', 'label-alpha', 'u vrcholu A', '°') + field('beta', 'label-beta', 'u vrcholu B', '°') + field('gamma', 'label-gamma', 'u vrcholu C', '°') +
    '</div>' +
  '</div>' +
  '<div class="trig-actions">' +
    '<button class="trig-btn-solve" data-gen="solve">✅ Vypočítat</button>' +
    '<button class="trig-btn-clear" data-gen="clear">🗑 Vymazat</button>' +
    '<button class="trig-btn-copy" data-gen="copy">📋 Kopírovat</button>' +
    '<button class="trig-btn-kbd" data-gen="kbd" title="Přepnout klávesnici (čísla / písmena pro funkce sqrt, sin…)">⌨ abc</button>' +
  '</div>' +
  '<div class="calc-tabs" data-gen="sols" style="display:none; margin-top:8px"></div>' +
  '<div class="trig-info"><span class="trig-status" data-gen="status"></span><br>' +
    '<small>Zadejte 3 hodnoty (aspoň jedna strana). α je proti straně a, β proti b, γ proti c.</small></div>' +
  '<div class="calc-out" data-gen="out"></div>';

function buildGeneral(root) {
  root.innerHTML = GENERAL_HTML;
  const g = (n) => root.querySelector('[data-gen="' + n + '"]');
  const inp = Object.fromEntries(KEYS.map(k => [k, root.querySelector('[data-k="' + k + '"]')]));
  const svg = g('svg'), statusEl = g('status'), outEl = g('out'), solsEl = g('sols');
  let solutions = [], cur = 0, timer = null;

  const status = (msg, err) => { statusEl.textContent = msg || 'Zadejte 3 hodnoty – výpočet proběhne automaticky'; statusEl.classList.toggle('trig-status-error', !!err); };

  function draw(t) {
    svgClear(svg);
    const T = t || { a: 6, b: 7, c: 10, alpha: 40, beta: 60, gamma: 80 };
    const al = T.alpha * Math.PI / 180;
    const A = [0, 0], B = [T.c, 0], C = [T.b * Math.cos(al), T.b * Math.sin(al)];
    const map = fitView([A, B, C], 300, 200, 34);
    const P = (p) => map(p[0], p[1]);
    svg.appendChild(svgEl('polygon', { points: svgPoints(map, [A, B, C]), fill: 'none', class: t ? 'cs-contour' : 'cs-thin' }));
    const txt = (p, dx, dy, s) => { const [x, y] = P(p); svg.appendChild(svgEl('text', { x: x + dx, y: y + dy, class: 'cs-txt', 'text-anchor': 'middle' }, s)); };
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const gt = (v, d = 2) => (t ? ' ' + fmt(v, d) : '');
    txt(mid(A, B), 0, 16, 'c' + gt(T.c));
    txt(mid(B, C), 14, 4, 'a' + gt(T.a));
    txt(mid(A, C), -14, 4, 'b' + gt(T.b));
    txt(A, 16, -6, 'α' + (t ? ' ' + fmt(T.alpha, 1) + '°' : ''));
    txt(B, -22, -6, 'β' + (t ? ' ' + fmt(T.beta, 1) + '°' : ''));
    txt(C, 0, -8, 'γ' + (t ? ' ' + fmt(T.gamma, 1) + '°' : ''));
  }

  function showSolution() {
    const t = solutions[cur];
    KEYS.forEach(k => {
      if (inp[k].classList.contains('computed') || inp[k].value.trim() === '') {
        inp[k].value = String(parseFloat(t[k].toFixed(4)));
        inp[k].classList.add('computed');
      }
    });
    outEl.innerHTML =
      outRow('Obsah', fmt(t.area, 4) + ' mm²') + outRow('Obvod', fmt(t.perimeter, 4) + ' mm') +
      outRow('Výšky h<sub>a</sub> / h<sub>b</sub> / h<sub>c</sub>', fmt(t.ha, 3) + ' / ' + fmt(t.hb, 3) + ' / ' + fmt(t.hc, 3) + ' mm') +
      outRow('Poloměr kružnice opsané / vepsané', fmt(t.circumR, 3) + ' / ' + fmt(t.inR, 3) + ' mm');
    draw(t);
  }

  function solve(auto = false) {
    const known = {};
    for (const k of KEYS) {
      if (inp[k].classList.contains('computed')) { inp[k].value = ''; inp[k].classList.remove('computed'); }
      const v = numVal(inp[k]);
      if (Number.isNaN(v)) { if (!auto) status('Neplatný výraz v poli ' + SYM[k], true); else status(); return false; }
      known[k] = v;
    }
    solsEl.style.display = 'none'; solutions = []; cur = 0; outEl.innerHTML = '';
    const filled = KEYS.filter(k => known[k] !== null).length;
    if (filled === 0) { status(); draw(null); return false; }
    const r = solveTriangle(known);
    if (!r.ok) { status(r.error, filled >= 3 || !auto); draw(null); return false; }
    solutions = r.solutions;
    if (solutions.length > 1) {
      solsEl.style.display = '';
      solsEl.innerHTML = solutions.map((_, i) => '<button type="button" class="calc-tab' + (i === 0 ? ' calc-tab-active' : '') + '" data-sol="' + i + '">Řešení ' + (i + 1) + '</button>').join('');
      status('✓ Dvě řešení (strana proti úhlu je kratší než druhá) – přepínejte nahoře');
    } else status('✓ Vypočteno');
    showSolution();
    return true;
  }

  solsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sol]');
    if (!b || !solutions.length) return;
    cur = Number(b.dataset.sol);
    solsEl.querySelectorAll('.calc-tab').forEach(x => x.classList.toggle('calc-tab-active', x === b));
    KEYS.forEach(k => { if (inp[k].classList.contains('computed')) inp[k].value = ''; });
    showSolution();
  });

  KEYS.forEach(k => {
    inp[k].addEventListener('input', () => { inp[k].classList.remove('computed'); clearTimeout(timer); timer = setTimeout(() => solve(true), 400); });
    inp[k].addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); solve(); } });
  });
  g('solve').addEventListener('click', () => { clearTimeout(timer); solve(); });
  g('clear').addEventListener('click', () => {
    clearTimeout(timer);
    KEYS.forEach(k => { inp[k].value = ''; inp[k].classList.remove('computed'); });
    solsEl.style.display = 'none'; solutions = []; outEl.innerHTML = ''; status(); draw(null);
  });
  g('copy').addEventListener('click', () => {
    const t = solutions[cur];
    if (!t) { showToast('Zadejte trojúhelník'); return; }
    const text = 'a=' + fmt(t.a, 4) + '  b=' + fmt(t.b, 4) + '  c=' + fmt(t.c, 4) + '  α=' + fmt(t.alpha, 4) + '°  β=' + fmt(t.beta, 4) + '°  γ=' + fmt(t.gamma, 4) +
      '°  S=' + fmt(t.area, 4) + '  o=' + fmt(t.perimeter, 4);
    navigator.clipboard?.writeText(text).then(() => showToast('Zkopírováno'), () => showToast('Kopírování se nepovedlo'));
  });
  const kbd = g('kbd');
  kbd.addEventListener('mousedown', (e) => e.preventDefault());
  kbd.addEventListener('click', () => {
    const toText = inp.a.inputMode !== 'text';
    KEYS.forEach(k => { inp[k].inputMode = toText ? 'text' : 'decimal'; });
    kbd.textContent = toText ? '⌨ 123' : '⌨ abc';
    const act = document.activeElement;
    if (act && KEYS.some(k => inp[k] === act)) { act.blur(); act.focus(); }
  });
  status(); draw(null);
  return () => clearTimeout(timer);
}

/** Doplní do otevřeného okna Trigonometrie záložky Pravoúhlý / Obecný. */
export function extendTrigCalc() {
  const overlay = document.querySelector('.calc-overlay[data-type="trig"]');
  if (!overlay || overlay.dataset.trigTabs) return;
  overlay.dataset.trigTabs = '1';
  const body = overlay.querySelector('.calc-body');
  const title = overlay.querySelector('.calc-titlebar h3');

  const right = document.createElement('div');
  right.dataset.trigMode = 'right';
  while (body.firstChild) right.appendChild(body.firstChild);       // původní obsah beze změny
  const general = document.createElement('div');
  general.dataset.trigMode = 'general';
  general.style.display = 'none';
  const bar = document.createElement('div');
  bar.innerHTML = tabsHtml([['right', 'Pravoúhlý'], ['general', 'Obecný']]);
  body.append(bar, right, general);
  onOverlayRemoved(overlay, buildGeneral(general));

  const show = (mode) => {
    right.style.display = mode === 'right' ? '' : 'none';
    general.style.display = mode === 'general' ? '' : 'none';
    title.textContent = TITLES[mode];
    try { localStorage.setItem(STORE_KEY, mode); } catch { /* bez uložení */ }
  };
  wireTabs(bar, show);
  let saved = 'right';
  try { saved = localStorage.getItem(STORE_KEY) === 'general' ? 'general' : 'right'; } catch { /* výchozí */ }
  if (saved === 'general') {
    bar.querySelectorAll('.calc-tab').forEach(b => b.classList.toggle('calc-tab-active', b.dataset.tab === 'general'));
    show('general');
  }
}

bridge.extendTrigCalc = extendTrigCalc;

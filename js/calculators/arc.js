// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: oblouk (tětiva/výška, 3 body, S+E+R)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vstup i výstup ve strojních souřadnicích Z a Ø X. G2/G3 se volí stejně jako
// v CNC exportu výkresu (arcCode z corner.js): typ stroje a zrcadlení os.
// I, K jsou přírůstky středu od ZAČÁTKU oblouku, I (osa X) v POLOMĚRU.

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { arcFromTwo, arcLargeVariant, arcFrom3Points, arcFromEndsRadius } from './arcMath.js';
import { arcCode } from './corner.js';
import {
  fmt, numVal as val, numField, selectField, tabsHtml, wireTabs,
  outRow, outWarn, outHint, outMain, outFormula, copyText, svgEl, svgClear, fitView, svgPoints,
} from './calcKit.js';

const pt = (zId, xId, label, hint) =>
  '<div class="calc-section-title">' + label + (hint ? ' <small>' + hint + '</small>' : '') + '</div>' +
  '<div class="cnc-fields">' + numField(zId, 'Z', 'mm', 'Z') + numField(xId, 'Ø X', 'mm', 'X') + '</div>';

export function openArcCalc() {
  const body =
    tabsHtml([['chord', 'Tětiva + výška'], ['pts', 'Tři body'], ['ends', 'Start + konec + R']]) +
    '<div data-tab-body="chord">' +
      '<div class="calc-note">Zadej libovolné dvě veličiny, třetí se dopočítá.</div>' +
      '<div class="cnc-fields">' +
        numField('c', 'Tětiva c', 'mm', 'délka tětivy') +
        numField('h', 'Výška h', 'mm', 'výška oblouku') +
        numField('R', 'Rádius R', 'mm', 'rádius') +
      '</div>' +
    '</div>' +
    '<div data-tab-body="pts" style="display:none">' +
      pt('z1', 'x1', 'Začátek P1') + pt('z2', 'x2', 'Bod uprostřed P2', '(oblouk jím prochází)') + pt('z3', 'x3', 'Konec P3') +
    '</div>' +
    '<div data-tab-body="ends" style="display:none">' +
      pt('zs', 'xs', 'Začátek S') + pt('ze', 'xe', 'Konec E') +
      '<div class="cnc-fields">' +
        numField('Re', 'Rádius R', 'mm', 'rádius') +
        selectField('dir', 'Smysl', [['G03', 'G03 (↺ proti hod.)'], ['G02', 'G02 (↻ po hod.)']]) +
        selectField('size', 'Oblouk', [['small', 'do 180°'], ['large', 'přes 180°']]) +
      '</div>' +
    '</div>' +
    '<svg class="calc-svg" viewBox="0 0 340 200" id="arcSvg" role="img" aria-label="Náčrt oblouku"></svg>' +
    '<div class="calc-out" id="arcResult"></div>' +
    '<div id="arcCode"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">🗑 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="calc-note">Souřadnice jako v programu: Z a průměr X (uvnitř se počítá poloměr). ' +
      'I, K = střed od začátku oblouku, I v poloměru. Směr G02/G03 podle nastavení stroje jako CNC export. ' +
      'Záporné R v G-kódu = oblouk přes 180°.</div>';

  const overlay = makeOverlay('arc', '⌒ Oblouk', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = {};
  ['c', 'h', 'R', 'z1', 'x1', 'z2', 'x2', 'z3', 'x3', 'zs', 'xs', 'ze', 'xe', 'Re'].forEach(k => { inp[k] = q(k); });
  const sel = { dir: q('dir'), size: q('size') };
  const svg = overlay.querySelector('#arcSvg');
  const resultEl = overlay.querySelector('#arcResult');
  const codeEl = overlay.querySelector('#arcCode');
  let tab = 'chord';
  let copyLines = [];

  const num = (k) => val(inp[k]);
  const P = (zk, xk) => {                                  // bod Z, Ø X → {z, x = poloměr}
    const z = num(zk), d = num(xk);
    if (z === null || d === null) return null;
    return Number.isFinite(z) && Number.isFinite(d) ? { z, x: d / 2 } : NaN;
  };
  const prog = (p) => 'X' + fmt(2 * p.x) + ' Z' + fmt(p.z);

  function reset() { resultEl.innerHTML = ''; codeEl.innerHTML = ''; svgClear(svg); copyLines = []; }

  function solve() {
    reset();
    if (tab === 'chord') return solveChord();
    if (tab === 'pts') return solvePts();
    return solveEnds();
  }

  function common(r) {
    return outRow('Středový úhel', fmt(r.angle ?? r.sweep, 3) + '°') + outRow('Délka oblouku', fmt(r.length) + ' mm');
  }

  function solveChord() {
    const c = num('c'), h = num('h'), R = num('R');
    if ([c, h, R].some(v => v !== null && !(v > 0))) { resultEl.innerHTML = outWarn('Zadané hodnoty musí být kladná čísla.'); return; }
    const given = [c, h, R].filter(v => v !== null).length;
    if (given < 2) { resultEl.innerHTML = outHint('Zadej dvě ze tří veličin: tětiva, výška, rádius.'); return; }
    const useTwo = given === 3 ? { c, h } : { c, h, R };    // při třech platí c + h, R se jen porovná
    const r = arcFromTwo(useTwo);
    if (!r) { resultEl.innerHTML = outWarn('Takový oblouk neexistuje (tětiva je delší než průměr, nebo výška je větší než 2R).'); return; }
    let html = outMain('R = ' + fmt(r.R), 'tětiva ' + fmt(r.c) + ' mm, výška ' + fmt(r.h) + ' mm') + common(r);
    if (given === 3 && Math.abs(r.R - R) > 1e-3 * Math.max(R, 1)) html += outWarn('Zadané R (' + fmt(R) + ') nesedí s c a h – R vychází ' + fmt(r.R) + '.');
    if (given === 2 && R !== null && c !== null) {
      const big = arcLargeVariant(r);
      html += outHint('Pro stejné c a R existuje i oblouk přes půlkruh: h = ' + fmt(big.h) + ' mm, úhel ' + fmt(big.angle, 3) + '°, délka ' + fmt(big.length) + ' mm.');
    }
    html += outFormula('R = (c²/4 + h²) / (2h)');
    resultEl.innerHTML = html;
    copyLines = ['Oblouk: tětiva ' + fmt(r.c) + ', výška ' + fmt(r.h) + ', R ' + fmt(r.R) + ', úhel ' + fmt(r.angle, 3) + '°, délka ' + fmt(r.length)];
    const O = { z: 0, x: r.h - r.R };
    drawArc({ S: { z: -r.c / 2, x: 0 }, E: { z: r.c / 2, x: 0 }, O, R: r.R, ccw: false, sweep: r.angle, labels: ['', ''], plain: true });
  }

  function solvePts() {
    const p1 = P('z1', 'x1'), p2 = P('z2', 'x2'), p3 = P('z3', 'x3');
    if ([p1, p2, p3].some(p => Number.isNaN(p))) { resultEl.innerHTML = outWarn('Neplatná hodnota v souřadnicích.'); return; }
    if (!p1 || !p2 || !p3) { resultEl.innerHTML = outHint('Zadej tři body oblouku (Z a Ø X).'); return; }
    const r = arcFrom3Points(p1, p2, p3);
    if (!r) { resultEl.innerHTML = outWarn('Body leží na jedné přímce (nebo splývají) – oblouk nejde určit.'); return; }
    const code = arcCode(r.ccw);
    resultEl.innerHTML = outMain('R = ' + fmt(r.R), 'střed Z' + fmt(r.O.z) + ' Ø X' + fmt(2 * r.O.x)) +
      outRow('Smysl', code + ' (' + (r.ccw ? 'proti' : 'po') + ' směru hodin v rovině Z–X)') + common(r) +
      outFormula('střed = průsečík os tětiv P1P2 a P2P3');
    const large = r.sweep > 180 + 1e-9;
    const lines = codeLines(p1, p3, r, code, large);
    codeEl.innerHTML = '<pre class="calc-code">' + lines + '</pre>';
    copyLines = ['Oblouk přes 3 body: R ' + fmt(r.R) + ', střed Z' + fmt(r.O.z) + ' X' + fmt(2 * r.O.x) + ', ' + fmt(r.sweep, 3) + '°', lines];
    drawArc({ S: p1, E: p3, O: r.O, R: r.R, ccw: r.ccw, sweep: r.sweep, mid: p2, labels: ['P1', 'P3'] });
  }

  function solveEnds() {
    const S = P('zs', 'xs'), E = P('ze', 'xe'), R = num('Re');
    if (Number.isNaN(S) || Number.isNaN(E) || Number.isNaN(R)) { resultEl.innerHTML = outWarn('Neplatná hodnota.'); return; }
    if (!S || !E || R === null) { resultEl.innerHTML = outHint('Zadej začátek, konec a rádius.'); return; }
    if (!(R > 0)) { resultEl.innerHTML = outWarn('Rádius musí být kladný.'); return; }
    const code = sel.dir.value;
    const ccw = arcCode(true) === code;                    // arcCode(ccw) je vzájemně jednoznačné
    const large = sel.size.value === 'large';
    const r = arcFromEndsRadius(S, E, R, ccw, large);
    if (!r) {
      const half = Math.hypot(E.z - S.z, E.x - S.x) / 2;
      resultEl.innerHTML = half < 1e-9 ? outWarn('Začátek a konec splývají.')
        : outWarn('Rádius je příliš malý – tětiva je ' + fmt(2 * half) + ' mm, R musí být alespoň ' + fmt(half) + ' mm.');
      return;
    }
    resultEl.innerHTML = outMain('střed Z' + fmt(r.O.z) + ' Ø X' + fmt(2 * r.O.x), 'I ' + fmt(r.I) + ' (poloměr), K ' + fmt(r.K)) +
      outRow('Tětiva', fmt(r.chord) + ' mm') + common(r);
    const lines = codeLines(S, E, { ...r, R }, code, large);
    codeEl.innerHTML = '<pre class="calc-code">' + lines + '</pre>';
    copyLines = ['Oblouk ' + prog(S) + ' → ' + prog(E) + ', R ' + fmt(R) + ': střed Z' + fmt(r.O.z) + ' X' + fmt(2 * r.O.x) + ', I' + fmt(r.I) + ' K' + fmt(r.K), lines];
    drawArc({ S, E, O: r.O, R, ccw, sweep: r.sweep, labels: ['S', 'E'] });
  }

  /** Řádky G-kódu: s R (záporné = přes 180°) a s I/K. */
  function codeLines(S, E, r, code, large) {
    const I = fmt(r.O.x - S.x), K = fmt(r.O.z - S.z);
    const out = [];
    out.push('G01 ' + prog(S));
    out.push(code + ' ' + prog(E) + ' R' + (large ? '-' : '') + fmt(r.R));
    out.push('; nebo: ' + code + ' ' + prog(E) + ' I' + I + ' K' + K);
    return out.join('\n');
  }

  // ── Náčrt: Z vodorovně, X (poloměr) nahoru ──
  function drawArc({ S, E, O, R, ccw, sweep, mid, labels, plain }) {
    const a1 = Math.atan2(S.x - O.x, S.z - O.z);
    const step = (ccw ? 1 : -1) * sweep * Math.PI / 180 / 48;
    const arc = [];
    for (let i = 0; i <= 48; i++) { const a = a1 + step * i; arc.push([O.z + R * Math.cos(a), O.x + R * Math.sin(a)]); }
    const map = fitView([...arc, [S.z, S.x], [E.z, E.x], [O.z, O.x]], 340, 200, 26);
    const line = (a, b, cls) => svg.appendChild(svgEl('polyline', { points: svgPoints(map, [[a.z, a.x], [b.z, b.x]]), class: cls }));
    const dot = (p, label, cls = 'cs-tip') => {
      const [x, y] = map(p.z, p.x);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 3, class: cls }));
      if (label) svg.appendChild(svgEl('text', { x: x + 5, y: y - 5, class: 'cs-txt-s' }, label));
    };
    line(O, S, 'cs-thin'); line(O, E, 'cs-thin'); line(S, E, 'cs-thin');
    svg.appendChild(svgEl('polyline', { points: svgPoints(map, arc), class: 'cs-contour' }));
    dot(S, labels[0]); dot(E, labels[1]); dot(O, 'O', 'cs-hole-first');
    if (mid) dot(mid, 'P2', 'cs-hole');
    svg.appendChild(svgEl('text', { x: 6, y: 194, class: 'cs-txt-s' }, plain ? 'schematicky – tětiva vodorovně' : 'Z → · X ↑ (poloměr) · O = střed'));
  }

  // ── Události ──
  wireTabs(overlay, (id) => {
    tab = id;
    overlay.querySelectorAll('[data-tab-body]').forEach(e => { e.style.display = e.dataset.tabBody === id ? '' : 'none'; });
    solve();
  });
  Object.values(inp).forEach(i => i.addEventListener('input', solve));
  Object.values(sel).forEach(s => s.addEventListener('change', solve));
  overlay.querySelector('.cnc-btn-clear').addEventListener('click', () => {
    Object.values(inp).forEach(i => { i.value = ''; });
    solve();
  });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!copyLines.length) { showToast('Zadej hodnoty oblouku'); return; }
    copyText(copyLines.join('\n'));
  });
  solve();
}

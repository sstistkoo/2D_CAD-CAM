// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: zaoblení / sražení obecného rohu        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vstup i výstup ve strojních souřadnicích Z a Ø X. G2/G3 se volí stejně
// jako v CNC exportu výkresu (fileIO.js): proti směru hodin ve výkresu = G03,
// karusel má osy prohozené (obrací smysl), zrcadlení jedné osy G2↔G3 prohodí.

import { showToast, state } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { cornerFillet, cornerChamfer, cornerDirections, pointAtAngle } from './cornerMath.js';
import {
  fmt, numVal as val, numField, selectField, outRow, outWarn, outHint, outMain, outFormula,
  copyText, svgEl, svgClear, fitView, svgPoints,
} from './calcKit.js';

const DIRS = [['0', '+Z'], ['90', '+X'], ['180', '−Z'], ['270', '−X']];
const dirButtons = (target) => '<div class="rough-radius-row">' + DIRS.map(([v, t]) =>
  '<button type="button" class="rough-r-btn tol-g-btn" data-dir-for="' + target + '" data-v="' + v + '">' + t + ' ' + v + '°</button>').join('') + '</div>';

/** G-kód oblouku podle nastavení stroje (stejně jako CNC export výkresu). */
function arcCode(ccwZX) {
  const ccwWorld = state.machineType === 'karusel' ? !ccwZX : ccwZX;   // karusel: X vodorovně, Z svisle
  const code = ccwWorld ? 'G03' : 'G02';
  return state.flipX !== state.flipZ ? (code === 'G02' ? 'G03' : 'G02') : code;
}

export function openCornerCalc() {
  const body =
    '<div class="cnc-fields">' +
      selectField('kind', 'Úprava rohu', [['R', 'Zaoblení R'], ['C', 'Sražení C']]) +
      numField('v', 'R', 'mm', 'Rádius') +
      '<span class="cnc-field-full">' + selectField('mode', 'Zadání', [['pts', 'Tři body (předchozí, roh, další)'], ['ang', 'Roh + směry úseků']]) + '</span>' +
    '</div>' +
    '<div data-mode="pts">' +
      '<div class="calc-section-title">Předchozí bod P1 <small>(kde začíná 1. úsek)</small></div>' +
      '<div class="cnc-fields">' + numField('z1', 'Z', 'mm', 'Z1') + numField('x1', 'Ø X', 'mm', 'X1') + '</div>' +
    '</div>' +
    '<div class="calc-section-title">Roh</div>' +
    '<div class="cnc-fields">' + numField('zc', 'Z', 'mm', 'Z rohu') + numField('xc', 'Ø X', 'mm', 'X rohu') + '</div>' +
    '<div data-mode="pts">' +
      '<div class="calc-section-title">Další bod P2 <small>(kde končí 2. úsek)</small></div>' +
      '<div class="cnc-fields">' + numField('z2', 'Z', 'mm', 'Z2') + numField('x2', 'Ø X', 'mm', 'X2') + '</div>' +
    '</div>' +
    '<div data-mode="ang">' +
      '<div class="cnc-fields">' + numField('a1', 'φ1', '° směr do rohu', '0 = +Z, 90 = +X') + '</div>' + dirButtons('a1') +
      '<div class="cnc-fields">' + numField('a2', 'φ2', '° směr z rohu', '0 = +Z, 90 = +X') + '</div>' + dirButtons('a2') +
    '</div>' +
    '<svg class="calc-svg" viewBox="0 0 340 200" id="crSvg" role="img" aria-label="Náčrt rohu se zaoblením nebo sražením"></svg>' +
    '<div class="calc-out" id="crResult"></div>' +
    '<div id="crPts"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">🗑 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="calc-note">Souřadnice Z a Ø X (průměr), úhly a rádius skutečné. Směr φ: 0° = +Z, 90° = +X, 180° = −Z. ' +
      'G2/G3 podle nastavení stroje stejně jako CNC export výkresu. Sinumerik umí roh zapsat i přímo: RND=R (zaoblení), ' +
      'CHR=C (sražení) na řádek rohu.</div>';

  const overlay = makeOverlay('corner', '⌐ Zaoblení / sražení rohu', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = {};
  ['v', 'z1', 'x1', 'zc', 'xc', 'z2', 'x2', 'a1', 'a2'].forEach(id => { inp[id] = q(id); });
  const sel = { kind: q('kind'), mode: q('mode') };
  const svg = overlay.querySelector('#crSvg');
  const resultEl = overlay.querySelector('#crResult');
  const ptsEl = overlay.querySelector('#crPts');
  let copyLines = [];

  function showMode() {
    overlay.querySelectorAll('[data-mode]').forEach(e => { e.style.display = e.dataset.mode === sel.mode.value ? '' : 'none'; });
    inp.v.closest('label').querySelector('span').innerHTML = (sel.kind.value === 'R' ? 'R' : 'C') + ' <small>mm</small>';
    inp.v.placeholder = sel.kind.value === 'R' ? 'Rádius' : 'Odvěsna sražení';
    overlay.querySelectorAll('[data-dir-for]').forEach(b => {
      b.classList.toggle('tol-g-active', inp[b.dataset.dirFor].value.trim() === b.dataset.v);
    });
  }

  const P = (z, X) => ({ z, x: X / 2 });                // Ø → poloměr
  const out = (p) => ({ z: p.z, d: 2 * p.x });          // poloměr → Ø
  const fmtPt = (p) => 'X' + fmt(2 * p.x) + ' Z' + fmt(p.z);

  function readPoints() {
    const zc = val(inp.zc), xc = val(inp.xc);
    if (zc === null || xc === null) return { hint: 'Zadej souřadnice rohu (Z, Ø X).' };
    if (!Number.isFinite(zc) || !Number.isFinite(xc)) return { warn: 'Neplatné souřadnice rohu.' };
    const C = P(zc, xc);
    if (sel.mode.value === 'pts') {
      const z1 = val(inp.z1), x1 = val(inp.x1), z2 = val(inp.z2), x2 = val(inp.x2);
      if ([z1, x1, z2, x2].some(v => v === null)) return { hint: 'Zadej předchozí bod P1 a další bod P2.' };
      if (![z1, x1, z2, x2].every(Number.isFinite)) return { warn: 'Neplatné souřadnice bodu P1 nebo P2.' };
      return { P1: P(z1, x1), C, P2: P(z2, x2), real: true };
    }
    const a1 = val(inp.a1), a2 = val(inp.a2);
    if (a1 === null || a2 === null) return { hint: 'Zadej směry obou úseků φ1 (do rohu) a φ2 (z rohu).' };
    if (!Number.isFinite(a1) || !Number.isFinite(a2)) return { warn: 'Neplatný úhel.' };
    const L = 1;                                        // délka jen pro směr – úseky nejsou omezené
    return { P1: pointAtAngle(C, a1 + 180, L), C, P2: pointAtAngle(C, a2, L), real: false };
  }

  function solve() {
    showMode();
    svgClear(svg);
    ptsEl.innerHTML = '';
    copyLines = [];
    const isR = sel.kind.value === 'R';
    const v = val(inp.v);
    const g = readPoints();
    if (g.hint || g.warn) { resultEl.innerHTML = g.hint ? outHint(g.hint) : outWarn(g.warn); return; }
    if (!cornerDirections(g.P1, g.C, g.P2)) { resultEl.innerHTML = outWarn('Úseky leží v přímce (nebo se vrací zpět) – není co zaoblit.'); return; }
    if (v === null) { resultEl.innerHTML = outHint('Zadej ' + (isR ? 'rádius R.' : 'odvěsnu sražení C.')); drawCorner(g, null); return; }
    if (!(v > 0)) { resultEl.innerHTML = outWarn(isR ? 'Rádius musí být kladný.' : 'Sražení musí být kladné.'); return; }

    if (isR) {
      const r = cornerFillet(g.P1, g.C, g.P2, v);
      drawCorner(g, { r, R: v });
      const code = arcCode(r.ccw);
      let html = outMain('t = ' + fmt(r.t) + ' mm', 'vzdálenost tečných bodů od rohu') +
        outRow('Vnitřní úhel rohu', fmt(r.inner, 3) + '°') +
        outRow('Oblouk', code + ' (' + (r.ccw ? 'proti směru hodin' : 'po směru hodin') + ' v rovině Z–X)');
      if (g.real && (!r.fits1 || !r.fits2)) html += outWarn('Rádius se nevejde do ' + (!r.fits1 ? '1.' : '2.') + ' úseku – tečný bod leží za jeho koncem.');
      html += outFormula('t = R·tan(δ/2), δ = 180° − vnitřní úhel');
      resultEl.innerHTML = html;
      const lines = 'G01 ' + fmtPt(r.T1) + '\n' + code + ' ' + fmtPt(r.T2) + ' R' + fmt(v);
      ptsEl.innerHTML = table([['Tečný bod T1 (konec 1. úseku)', out(r.T1)], ['Tečný bod T2 (začátek 2. úseku)', out(r.T2)], ['Střed oblouku', out(r.O)]]) +
        '<pre class="calc-code">' + lines + '</pre>';
      copyLines.push('Zaoblení R' + fmt(v) + ' rohu X' + fmt(2 * g.C.x) + ' Z' + fmt(g.C.z) + ': T1 ' + fmtPt(r.T1) + ', T2 ' + fmtPt(r.T2) + ', střed ' + fmtPt(r.O), lines);
      return;
    }
    const r = cornerChamfer(g.P1, g.C, g.P2, v);
    drawCorner(g, { c: r });
    let html = outMain('délka sražení ' + fmt(r.width) + ' mm', 'odvěsny ' + fmt(v) + ' mm po obou úsecích') +
      outRow('Vnitřní úhel rohu', fmt(r.inner, 3) + '°');
    if (g.real && (!r.fits1 || !r.fits2)) html += outWarn('Sražení se nevejde do ' + (!r.fits1 ? '1.' : '2.') + ' úseku.');
    resultEl.innerHTML = html;
    const lines = 'G01 ' + fmtPt(r.A) + '\nG01 ' + fmtPt(r.B);
    ptsEl.innerHTML = table([['Začátek sražení A (na 1. úseku)', out(r.A)], ['Konec sražení B (na 2. úseku)', out(r.B)]]) +
      '<pre class="calc-code">' + lines + '</pre>';
    copyLines.push('Sražení C' + fmt(v) + ' rohu X' + fmt(2 * g.C.x) + ' Z' + fmt(g.C.z) + ': A ' + fmtPt(r.A) + ', B ' + fmtPt(r.B), lines);
  }

  function table(rows) {
    return '<table class="calc-pts"><thead><tr><th>Bod</th><th>Z</th><th>Ø X</th></tr></thead><tbody>' +
      rows.map(([n, p]) => '<tr class="calc-pts-prog"><td>' + n + '</td><td>' + fmt(p.z) + '</td><td>' + fmt(p.d) + '</td></tr>').join('') +
      '</tbody></table>';
  }

  // ── Náčrt v rovině Z (vodorovně) – X poloměr (nahoru), přiblížený na roh ──
  function drawCorner(g, res) {
    const { C } = g;
    const k = cornerDirections(g.P1, C, g.P2);
    let P1 = g.P1, P2 = g.P2;
    if (!g.real) {                                     // zadání úhly: úseky vybíhají ze záběru
      const L = 40 * (res?.r ? Math.max(res.R, res.r.t) : res?.c ? res.c.width : 1);
      P1 = { z: C.z - k.d1.z * L, x: C.x - k.d1.x * L };
      P2 = { z: C.z + k.d2.z * L, x: C.x + k.d2.x * L };
    }
    let view;
    if (res?.r) {
      const { T1, T2, O } = res.r, R = res.R;
      view = [[C.z, C.x], [T1.z, T1.x], [T2.z, T2.x], [O.z - R, O.x - R], [O.z + R, O.x + R]];
    } else if (res?.c) {
      const { A, B } = res.c, w = res.c.width * 0.6;
      view = [[C.z - w, C.x - w], [C.z + w, C.x + w], [A.z, A.x], [B.z, B.x]];
    } else {
      view = g.real ? [[P1.z, P1.x], [C.z, C.x], [P2.z, P2.x]] : [[C.z - 1, C.x - 1], [C.z + 1, C.x + 1]];
    }
    const map = fitView(view, 340, 200, 26);
    const line = (a, b, cls) => svg.appendChild(svgEl('polyline', { points: svgPoints(map, [[a.z, a.x], [b.z, b.x]]), class: cls }));
    const dot = (p, label, cls = 'cs-tip') => {
      const [x, y] = map(p.z, p.x);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 3, class: cls }));
      if (label) svg.appendChild(svgEl('text', { x: x + 5, y: y - 5, class: 'cs-txt-s' }, label));
    };
    if (!res) { line(P1, C, 'cs-contour'); line(C, P2, 'cs-contour'); dot(C, 'roh'); }
    else {
      line(P1, C, 'cs-thin'); line(C, P2, 'cs-thin');
      if (res.r) {
        const { T1, T2, O } = res.r;
        let a1 = Math.atan2(T1.x - O.x, T1.z - O.z), a2 = Math.atan2(T2.x - O.x, T2.z - O.z);
        if (res.r.ccw && a2 < a1) a2 += 2 * Math.PI;
        if (!res.r.ccw && a2 > a1) a2 -= 2 * Math.PI;
        const arc = [];
        for (let i = 0; i <= 32; i++) { const a = a1 + (a2 - a1) * i / 32; arc.push([O.z + res.R * Math.cos(a), O.x + res.R * Math.sin(a)]); }
        svg.appendChild(svgEl('polyline', { points: svgPoints(map, [[P1.z, P1.x], ...arc, [P2.z, P2.x]]), class: 'cs-contour' }));
        line(O, T1, 'cs-prog'); line(O, T2, 'cs-prog');
        dot(T1, 'T1'); dot(T2, 'T2'); dot(O, 'S', 'cs-hole-first');
      } else {
        const { A, B } = res.c;
        svg.appendChild(svgEl('polyline', { points: svgPoints(map, [[P1.z, P1.x], [A.z, A.x], [B.z, B.x], [P2.z, P2.x]]), class: 'cs-contour' }));
        dot(A, 'A'); dot(B, 'B');
      }
      dot(C, '', 'cs-hole');
    }
    svg.appendChild(svgEl('text', { x: 6, y: 194, class: 'cs-txt-s' }, 'Z → · X ↑ (poloměr) · tenká čára = původní roh'));
  }

  // ── Události ──
  Object.values(inp).forEach(i => i.addEventListener('input', solve));
  Object.values(sel).forEach(s => s.addEventListener('change', solve));
  overlay.querySelectorAll('[data-dir-for]').forEach(b => b.addEventListener('click', () => {
    const t = inp[b.dataset.dirFor];
    t.value = b.dataset.v;
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }));
  overlay.querySelector('.cnc-btn-clear').addEventListener('click', () => {
    Object.values(inp).forEach(i => { i.value = ''; });
    solve();
  });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!copyLines.length) { showToast('Zadej roh a velikost úpravy'); return; }
    copyText(copyLines.join('\n'));
  });

  solve();
}

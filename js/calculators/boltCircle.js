// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: díry na roztečné kružnici               ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { boltCircle } from './boltCircleMath.js';
import {
  fmt, numVal as val, numField, selectField, outRow, outWarn, outHint, outMain,
  copyText, svgEl, svgClear, fitView,
} from './calcKit.js';

export function openBoltCircleCalc() {
  const body =
    '<div class="cnc-fields">' +
      numField('n', 'Počet děr', '', 'n', ' value="6"') +
      numField('pcd', 'Ø rozteč', 'mm', 'Roztečný průměr') +
      numField('a0', 'θ₀', '° první díra', '0', ' value="0"') +
      numField('d', 'Ø díry', 'mm', 'volitelně') +
      selectField('mode', 'Rozložení', [['full', 'Celý kruh'], ['pitch', 'Zadaná rozteč']]) +
      '<span data-show="pitch">' + numField('step', 'Δθ', '° mezi dírami', 'Úhlová rozteč') + '</span>' +
      selectField('dir', 'Směr', [['ccw', 'Proti hodinám (+)'], ['cw', 'Po směru hodin (−)']]) +
      numField('cx', 'Střed X', 'mm', '0', ' value="0"') +
      numField('cy', 'Střed Y', 'mm', '0', ' value="0"') +
    '</div>' +
    '<svg class="calc-svg" viewBox="0 0 340 240" id="bcSvg" role="img" aria-label="Náčrt děr na roztečné kružnici"></svg>' +
    '<div class="calc-out" id="bcResult"></div>' +
    '<div class="cnc-table-wrap cnc-table-tall" id="bcTableWrap"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">🗑 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="calc-note">Úhel 0° = kladná osa X, kladný směr proti hodinám. Soustruh s osou C (vrtání do čela): ' +
      'X = roztečný průměr, C = úhel. Frézka / karusel s hlavou: X, Y.</div>';

  const overlay = makeOverlay('boltCircle', '◎ Díry na roztečné kružnici', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { n: q('n'), pcd: q('pcd'), a0: q('a0'), d: q('d'), step: q('step'), cx: q('cx'), cy: q('cy') };
  const sel = { mode: q('mode'), dir: q('dir') };
  const svg = overlay.querySelector('#bcSvg');
  const resultEl = overlay.querySelector('#bcResult');
  const tableWrap = overlay.querySelector('#bcTableWrap');
  let last = null;

  function showMode() {
    overlay.querySelectorAll('[data-show]').forEach(e => { e.style.display = e.dataset.show === sel.mode.value ? '' : 'none'; });
  }

  function solve() {
    last = null;
    tableWrap.innerHTML = '';
    svgClear(svg);
    const n = val(inp.n), pcd = val(inp.pcd), a0 = val(inp.a0) ?? 0, d = val(inp.d);
    const cx = val(inp.cx) ?? 0, cy = val(inp.cy) ?? 0;
    const partial = sel.mode.value === 'pitch';
    const step = partial ? val(inp.step) : null;
    const bad = [];
    if (n === null || !Number.isInteger(n) || n < 1 || n > 720) bad.push('počet děr (celé číslo 1–720)');
    if (pcd !== null && !(pcd > 0)) bad.push('Ø rozteč');
    if (!Number.isFinite(a0)) bad.push('θ₀');
    if (d !== null && !(d > 0)) bad.push('Ø díry');
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) bad.push('střed');
    if (partial && step !== null && !(step > 0)) bad.push('Δθ');
    if (bad.length) { resultEl.innerHTML = outWarn('Neplatné: ' + bad.join(', ') + '.'); return; }
    if (pcd === null) { resultEl.innerHTML = outHint('Zadej roztečný průměr.'); return; }
    if (partial && step === null) { resultEl.innerHTML = outHint('Zadej úhlovou rozteč Δθ.'); return; }

    const r = boltCircle({ count: n, pcd, start: a0, pitch: step, cx, cy, cw: sel.dir.value === 'cw' });
    if (!r) { resultEl.innerHTML = outWarn('Nelze spočítat – zkontroluj vstupy.'); return; }
    draw(r, pcd, d, cx, cy);

    let html = outMain(n + ' děr po ' + fmt(r.pitch, 4) + '°', 'na Ø ' + fmt(pcd) + (cx || cy ? ', střed X' + fmt(cx) + ' Y' + fmt(cy) : ''));
    if (n > 1) html += outRow('Vzdálenost středů sousedních děr', fmt(r.chord) + ' mm');
    if (d !== null && n > 1) {
      const bridge = r.chord - d;
      html += bridge > 0 ? outRow('Můstek mezi dírami', fmt(bridge) + ' mm') : outWarn('Díry Ø ' + fmt(d) + ' se překrývají (vzdálenost středů ' + fmt(r.chord) + ' mm).');
    }
    if (partial && r.span >= 360 - 1e-9) html += outWarn('Rozteč × (počet − 1) = ' + fmt(r.span, 2) + '° – díry obejdou celý kruh a mohou se krýt.');
    resultEl.innerHTML = html;

    tableWrap.innerHTML = '<table class="calc-pts"><thead><tr><th>#</th><th>C (úhel)</th><th>X</th><th>Y</th></tr></thead><tbody>' +
      r.holes.map(h => '<tr><td>' + h.i + '</td><td>' + fmt(h.c, 4) + '°</td><td>' + fmt(h.x) + '</td><td>' + fmt(h.y) + '</td></tr>').join('') +
      '</tbody></table>';
    last = { r, pcd };
  }

  function draw(r, pcd, d, cx, cy) {
    const R = pcd / 2;
    const hr = d !== null ? d / 2 : 0;
    const m = R + hr + R * 0.22;                      // místo na čísla děr
    const map = fitView([[cx - m, cy - m], [cx + m, cy + m]], 340, 240, 10);
    const [ox, oy] = map(cx, cy);
    const Rpx = R * map.scale;
    svg.appendChild(svgEl('line', { x1: ox - Rpx - 12, y1: oy, x2: ox + Rpx + 12, y2: oy, class: 'cs-axis' }));
    svg.appendChild(svgEl('line', { x1: ox, y1: oy - Rpx - 12, x2: ox, y2: oy + Rpx + 12, class: 'cs-axis' }));
    svg.appendChild(svgEl('circle', { cx: ox, cy: oy, r: Rpx, class: 'cs-thin' }));
    const first = r.holes[0];
    const [fx, fy] = map(first.x, first.y);
    svg.appendChild(svgEl('line', { x1: ox, y1: oy, x2: fx, y2: fy, class: 'cs-thin' }));
    const hpx = hr > 0 ? Math.max(hr * map.scale, 1.5) : Math.max(2, Math.min(6, Rpx * Math.sin(Math.PI / Math.max(r.holes.length, 2)) * 0.6));
    const every = Math.ceil(r.holes.length / 36);       // u mnoha děr číslovat jen každou k-tou
    r.holes.forEach((h, k) => {
      const [x, y] = map(h.x, h.y);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: hpx, class: 'cs-hole' + (k === 0 ? ' cs-hole-first' : '') }));
      if (k % every === 0) {
        const t = h.angle * Math.PI / 180, lr = Rpx + hpx + 9;
        svg.appendChild(svgEl('text', { x: ox + lr * Math.cos(t), y: oy - lr * Math.sin(t) + 3.5, class: 'cs-txt-s', 'text-anchor': 'middle' }, String(h.i)));
      }
    });
  }

  Object.values(inp).forEach(i => i.addEventListener('input', solve));
  Object.values(sel).forEach(s => s.addEventListener('change', () => { showMode(); solve(); }));

  overlay.querySelector('.cnc-btn-clear').addEventListener('click', () => {
    inp.pcd.value = ''; inp.d.value = ''; inp.step.value = '';
    inp.a0.value = '0'; inp.cx.value = '0'; inp.cy.value = '0';
    solve();
  });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!last) { showToast('Zadej počet děr a roztečný průměr'); return; }
    const lines = ['Roztečná kružnice Ø' + fmt(last.pcd) + ', ' + last.r.holes.length + ' děr po ' + fmt(last.r.pitch, 4) + '°'];
    last.r.holes.forEach(h => lines.push(h.i + ': X' + fmt(h.x) + ' Y' + fmt(h.y) + '  C' + fmt(h.c, 4)));
    copyText(lines.join('\n'));
  });

  showMode();
  solve();
}

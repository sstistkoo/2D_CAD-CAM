// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Rozmístění děr: panely Řada a Mřížka                ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Panely se vkládají do okna kalkulačky (boltCircle.js) vedle záložky Kružnice.
// Výpočet: holePatternMath.js. Pole mají prefix `row_` / `grid_` (data-id), aby se
// nepletla s poli kružnice.

import { showToast } from '../state.js';
import { bridge } from '../bridge.js';
import { rowHoles, gridHoles } from './holePatternMath.js';
import {
  fmt, numVal as val, numField, selectField, outRow, outWarn, outHint, outMain,
  copyText, svgEl, svgClear, fitView,
} from './calcKit.js';

/** „◎ Do čela" → bridge.drawHolesToFace (faceView/facePattern.js); i v záložce Kružnice. */
export const FACE_BTN = '<button class="cnc-btn" data-face-draw style="background:var(--ctp-surface1);color:var(--ctp-peach)" '
  + 'title="Nakreslit díry do aktuálního čela bokorysu — X0 Y0 = osa vřetena">◎ Do čela</button>';

const COMMON_TAIL =
  '<svg class="calc-svg" viewBox="0 0 340 200" data-pat="svg" role="img" aria-label="Náčrt rozmístění děr"></svg>' +
  '<div class="calc-out" data-pat="result"></div>' +
  '<div class="cnc-table-wrap cnc-table-tall" data-pat="table"></div>' +
  '<div class="cnc-actions">' +
    '<button class="cnc-btn" data-pat="clear">🗑 Vymazat</button>' +
    '<button class="cnc-btn" data-pat="copy">📋 Kopírovat</button>' +
    FACE_BTN +
  '</div>';

/** Společná část panelu: události, vykreslení výsledku, náčrtu a tabulky, kopírování. */
function setup(root, compute) {
  const ui = {
    q: (id) => root.querySelector('[data-id="' + id + '"]'),
    svg: root.querySelector('[data-pat="svg"]'),
    result: root.querySelector('[data-pat="result"]'),
    table: root.querySelector('[data-pat="table"]'),
  };
  let last = null, lastHoles = null;

  function render(holes, summaryHtml, d, heading) {
    lastHoles = { holes, d };
    ui.result.innerHTML = summaryHtml;
    ui.table.innerHTML = '<table class="calc-pts"><thead><tr><th>#</th><th>X</th><th>Y</th></tr></thead><tbody>' +
      holes.map(h => '<tr><td>' + h.i + '</td><td>' + fmt(h.x) + '</td><td>' + fmt(h.y) + '</td></tr>').join('') + '</tbody></table>';
    draw(ui.svg, holes, d);
    last = heading + '\n' + holes.map(h => h.i + ': X' + fmt(h.x) + ' Y' + fmt(h.y)).join('\n');
  }
  function run() {
    last = null; lastHoles = null;
    ui.table.innerHTML = '';
    svgClear(ui.svg);
    compute(ui, render);
  }
  root.querySelectorAll('input').forEach(i => i.addEventListener('input', run));
  root.querySelectorAll('select').forEach(s => s.addEventListener('change', run));
  root.querySelector('[data-pat="clear"]').addEventListener('click', () => {
    root.querySelectorAll('input').forEach(i => { i.value = i.dataset.def ?? ''; });
    run();
  });
  root.querySelector('[data-pat="copy"]').addEventListener('click', () => {
    if (!last) { showToast('Zadej rozmístění děr'); return; }
    copyText(last);
  });
  root.querySelector('[data-face-draw]').addEventListener('click', () => {
    if (!lastHoles) { showToast('Zadej rozmístění děr'); return; }
    if (lastHoles.d === null) { showToast('Zadej Ø díry — kružnice v čele je díra'); return; }
    const n = bridge.drawHolesToFace && bridge.drawHolesToFace(lastHoles);
    const ov = n ? root.closest('.calc-overlay') : null;
    if (ov) ov.remove();
  });
  return run;
}

/** Náčrt: díry v pořadí vrtání (tenká čára), číslování nejvýš u ~40 děr. */
function draw(svg, holes, d) {
  const hr = d ? d / 2 : 0;
  const xs = holes.map(h => h.x), ys = holes.map(h => h.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const pad = Math.max(hr, 0.04 * span);
  const map = fitView([[Math.min(...xs) - pad, Math.min(...ys) - pad], [Math.max(...xs) + pad, Math.max(...ys) + pad]], 340, 200, 18);
  if (holes.length > 1) {
    svg.appendChild(svgEl('polyline', { points: holes.map(h => map(h.x, h.y).map(n => n.toFixed(2)).join(',')).join(' '), class: 'cs-thin' }));
  }
  const dist = holes.length > 1 ? Math.hypot(holes[1].x - holes[0].x, holes[1].y - holes[0].y) : span;
  const rpx = hr > 0 ? Math.max(hr * map.scale, 1.5) : Math.max(2, Math.min(6, dist * map.scale * 0.3));
  const every = Math.ceil(holes.length / 40);
  holes.forEach((h, k) => {
    const [x, y] = map(h.x, h.y);
    svg.appendChild(svgEl('circle', { cx: x, cy: y, r: rpx, class: 'cs-hole' + (k === 0 ? ' cs-hole-first' : '') }));
    if (k % every === 0 && rpx >= 3) svg.appendChild(svgEl('text', { x, y: y - rpx - 3, class: 'cs-txt-s', 'text-anchor': 'middle' }, String(h.i)));
  });
}

/** Řádek můstku (rozteč − Ø díry) nebo varování o překrytí. */
function bridgeRow(label, pitch, d) {
  if (d === null) return '';
  return pitch > d ? outRow(label, fmt(pitch - d) + ' mm')
    : outWarn('Díry Ø ' + fmt(d) + ' se překrývají (rozteč ' + fmt(pitch) + ' mm).');
}

/** Panel „Řada": díry na přímce. */
export function mountRowPanel(root) {
  root.innerHTML =
    '<div class="cnc-fields">' +
      numField('row_n', 'Počet děr', '', 'n', ' value="5" data-def="5"') +
      numField('row_d', 'Ø díry', 'mm', 'volitelně') +
      numField('row_x0', 'Začátek X', 'mm', '0', ' value="0" data-def="0"') +
      numField('row_y0', 'Začátek Y', 'mm', '0', ' value="0" data-def="0"') +
      '<span class="cnc-field-full">' + selectField('row_mode', 'Zadání', [['pitch', 'Rozteč a úhel'], ['end', 'Koncový bod (rozteč se dopočte)']]) + '</span>' +
      '<span data-showmode="pitch">' + numField('row_pitch', 'Rozteč', 'mm', 'mezi dírami') + '</span>' +
      '<span data-showmode="pitch">' + numField('row_ang', 'Úhel', '°', '0', ' value="0" data-def="0"') + '</span>' +
      '<span data-showmode="end">' + numField('row_x1', 'Konec X', 'mm', 'X') + '</span>' +
      '<span data-showmode="end">' + numField('row_y1', 'Konec Y', 'mm', 'Y') + '</span>' +
    '</div>' + COMMON_TAIL +
    '<div class="calc-note">Úhel 0° = kladná osa X, kladný směr proti hodinám. S koncovým bodem jsou díry rozloženy rovnoměrně mezi začátkem a koncem (včetně obou).</div>';

  const run = setup(root, (ui, render) => {
    const q = ui.q;
    const mode = q('row_mode').value;
    root.querySelectorAll('[data-showmode]').forEach(e => { e.style.display = e.dataset.showmode === mode ? '' : 'none'; });
    const n = val(q('row_n')), d = val(q('row_d')), x0 = val(q('row_x0')) ?? 0, y0 = val(q('row_y0')) ?? 0;
    const pitch = val(q('row_pitch')), ang = val(q('row_ang')) ?? 0, x1 = val(q('row_x1')), y1 = val(q('row_y1'));
    const bad = [];
    if (n === null || !Number.isInteger(n) || n < 1 || n > 2000) bad.push('počet děr (celé číslo 1–2000)');
    if (d !== null && !(d > 0)) bad.push('Ø díry');
    if ([x0, y0, ang].some(v => !Number.isFinite(v))) bad.push('začátek / úhel');
    if (mode === 'pitch' && pitch !== null && !(pitch > 0)) bad.push('rozteč');
    if (mode === 'end' && ((x1 !== null && !Number.isFinite(x1)) || (y1 !== null && !Number.isFinite(y1)))) bad.push('koncový bod');
    if (bad.length) { ui.result.innerHTML = outWarn('Neplatné: ' + bad.join(', ') + '.'); return; }
    if (mode === 'pitch' ? pitch === null : (x1 === null || y1 === null)) {
      ui.result.innerHTML = outHint(mode === 'pitch' ? 'Zadej rozteč mezi dírami.' : 'Zadej koncový bod řady.');
      return;
    }
    const r = rowHoles(mode === 'pitch' ? { count: n, x0, y0, pitch, angle: ang } : { count: n, x0, y0, x1, y1 });
    if (!r) {
      ui.result.innerHTML = outWarn(mode === 'end' ? 'Koncový bod potřebuje aspoň 2 díry a musí se lišit od začátku.' : 'Nelze spočítat – zkontroluj vstupy.');
      return;
    }
    const sum = outMain(n + ' děr po ' + fmt(r.pitch, 4) + ' mm', 'úhel řady ' + fmt(r.angle, 4) + '°') +
      (n > 1 ? outRow('Délka řady (první – poslední díra)', fmt(r.length) + ' mm') + bridgeRow('Můstek mezi dírami', r.pitch, d) : '');
    render(r.holes, sum, d, 'Řada ' + n + ' děr, rozteč ' + fmt(r.pitch, 4) + ', úhel ' + fmt(r.angle, 4) + '°');
  });
  run();
}

/** Panel „Mřížka": nx × ny děr, natočení, pořadí vrtání. */
export function mountGridPanel(root) {
  root.innerHTML =
    '<div class="cnc-fields">' +
      numField('grid_nx', 'Děr v řadě (X)', '', 'nx', ' value="3" data-def="3"') +
      numField('grid_ny', 'Řad (Y)', '', 'ny', ' value="2" data-def="2"') +
      numField('grid_px', 'Rozteč X', 'mm', 'px') +
      numField('grid_py', 'Rozteč Y', 'mm', 'py') +
      numField('grid_x0', 'Začátek X', 'mm', '0', ' value="0" data-def="0"') +
      numField('grid_y0', 'Začátek Y', 'mm', '0', ' value="0" data-def="0"') +
      numField('grid_ang', 'Natočení', '°', '0', ' value="0" data-def="0"') +
      numField('grid_d', 'Ø díry', 'mm', 'volitelně') +
      '<span class="cnc-field-full">' + selectField('grid_order', 'Pořadí vrtání', [['rows', 'Po řádcích (vždy zleva)'], ['meander', 'Meandr (klikatě, kratší pojezdy)']]) + '</span>' +
    '</div>' + COMMON_TAIL +
    '<div class="calc-note">Mřížka se otáčí kolem bodu „Začátek" (první díra). Rozteč v druhém směru je kolmá k první; u jediné řady nebo sloupce druhou rozteč nezadáváš.</div>';

  const run = setup(root, (ui, render) => {
    const q = ui.q;
    const nx = val(q('grid_nx')), ny = val(q('grid_ny')), px = val(q('grid_px')), py = val(q('grid_py'));
    const x0 = val(q('grid_x0')) ?? 0, y0 = val(q('grid_y0')) ?? 0, ang = val(q('grid_ang')) ?? 0, d = val(q('grid_d'));
    const bad = [];
    for (const [v, name] of [[nx, 'počet v řadě'], [ny, 'počet řad']]) {
      if (v === null || !Number.isInteger(v) || v < 1) bad.push(name + ' (celé číslo ≥ 1)');
    }
    if (nx !== null && ny !== null && nx * ny > 5000) bad.push('počet děr (nejvýš 5000)');
    for (const [v, name] of [[px, 'rozteč X'], [py, 'rozteč Y'], [d, 'Ø díry']]) if (v !== null && !(v > 0)) bad.push(name);
    if ([x0, y0, ang].some(v => !Number.isFinite(v))) bad.push('začátek / natočení');
    if (bad.length) { ui.result.innerHTML = outWarn('Neplatné: ' + bad.join(', ') + '.'); return; }
    if ((nx > 1 && px === null) || (ny > 1 && py === null)) {
      ui.result.innerHTML = outHint('Zadej ' + (nx > 1 && px === null ? 'rozteč X' : 'rozteč Y') + '.');
      return;
    }
    const meander = q('grid_order').value === 'meander';
    const g = gridHoles({ nx, ny, px: px ?? 0, py: py ?? 0, x0, y0, angle: ang, meander });
    if (!g) { ui.result.innerHTML = outWarn('Nelze spočítat – zkontroluj vstupy.'); return; }
    let sum = outMain(nx * ny + ' děr (' + nx + ' × ' + ny + ')',
      'mřížka ' + fmt(g.width) + ' × ' + fmt(g.height) + ' mm mezi krajními dírami' + (ang ? ', natočená ' + fmt(ang, 4) + '°' : ''));
    if (nx > 1) sum += bridgeRow('Můstek v řadě', px, d);
    if (ny > 1) sum += bridgeRow('Můstek mezi řadami', py, d);
    render(g.holes, sum, d, 'Mřížka ' + nx + ' × ' + ny + ', rozteč ' + fmt(px ?? 0) + ' × ' + fmt(py ?? 0) + (meander ? ', meandr' : ''));
  });
  run();
}

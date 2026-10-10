import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';
import { deviations, SHAFT_LETTERS, HOLE_LETTERS } from './iso286.js';

export function openToleranceCalc() {
  // ── ISO 2768-1 : volné míry ──
  // [maxDim, f, m, c, v]  (±mm)
  var freeRows = [
    [3,    0.05, 0.1,  0.2,  null],
    [6,    0.05, 0.1,  0.3,  0.5],
    [30,   0.1,  0.2,  0.5,  1.0],
    [120,  0.15, 0.3,  0.8,  1.5],
    [400,  0.2,  0.5,  1.2,  2.5],
    [1000, 0.3,  0.8,  2.0,  4.0],
    [2000, 0.5,  1.2,  3.0,  6.0],
    [4000, null, 2.0,  4.0,  8.0],
  ];
  // Sloupec m (střední třída) je zvýrazněný rámečkem – běžná výchozí třída výkresů
  var freeHTML = '<table class="cnc-table"><thead><tr>' +
    '<th>Rozměr (mm)</th><th>f</th><th class="tol-m tol-m-top">m</th><th>c</th><th>v</th></tr></thead><tbody>';
  var prevMax = 0.5;
  for (var fi = 0; fi < freeRows.length; fi++) {
    var r = freeRows[fi];
    freeHTML += '<tr><td>' + prevMax + ' – ' + r[0] + '</td>';
    for (var ci = 1; ci <= 4; ci++) {
      var mCls = ci === 2 ? ' class="tol-m' + (fi === freeRows.length - 1 ? ' tol-m-bot' : '') + '"' : '';
      freeHTML += '<td' + mCls + '>' + (r[ci] !== null ? '±' + r[ci] : '—') + '</td>';
    }
    freeHTML += '</tr>';
    prevMax = r[0];
  }
  freeHTML += '</tbody></table>';

  // ── ISO 286: data a pravidla v iso286.js (hodnoty z tabulek ISO 286-2) ──
  var holeLetters = HOLE_LETTERS;
  var shaftLetters = SHAFT_LETTERS;

  // Build grid buttons instead of selects
  var shaftBtns = '', holeBtns = '';
  for (var si = 0; si < shaftLetters.length; si++) {
    var act = shaftLetters[si] === 'h' ? ' tol-g-active' : '';
    shaftBtns += '<button class="tol-g-btn' + act + '" data-val="' + shaftLetters[si] + '">' + shaftLetters[si] + '</button>';
  }
  for (var hi2 = 0; hi2 < holeLetters.length; hi2++) {
    var act2 = holeLetters[hi2] === 'H' ? ' tol-g-active' : '';
    holeBtns += '<button class="tol-g-btn' + act2 + '" data-val="' + holeLetters[hi2] + '">' + holeLetters[hi2] + '</button>';
  }

  var itBtns = '';
  for (var it = 1; it <= 18; it++) {
    var act3 = (it === 7) ? ' tol-g-active' : '';
    itBtns += '<button class="tol-g-btn' + act3 + '" data-val="' + it + '">' + it + '</button>';
  }

  var body =
    '<div class="cnc-table-label">Volné míry – ČSN EN ISO 2768-1 <small>(■ m = střední třída)</small></div>' +
    '<div class="cnc-table-wrap">' + freeHTML + '</div>' +
    '<div class="cnc-table-label" style="margin-top:12px">Tolerované rozměry – ČSN EN ISO 286-1</div>' +
    '<div class="tol-main-row">' +
      '<button class="tol-toggle tol-active" data-mode="hole">Díra</button>' +
      '<label class="tol-dim" aria-label="Jmenovitý rozměr v mm">' +
        '<input type="text" inputmode="decimal" data-id="tolDim" placeholder="Rozměr mm"></label>' +
      '<button class="tol-toggle" data-mode="shaft">Hřídel</button>' +
    '</div>' +
    '<div class="cnc-field cnc-field-full"><span>Třída</span>' +
      '<div class="tol-grid tol-class-grid" data-id="tolClass">' + holeBtns + '</div></div>' +
    '<div class="cnc-field cnc-field-full"><span>Stupeň</span>' +
      '<div class="tol-grid tol-it-grid" data-id="tolIT">' + itBtns + '</div></div>' +
    '<div class="cnc-result tol-res" id="tolResult">Zadejte rozměr…</div>' +
    '<div class="cnc-actions"><button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button></div>';

  var overlay = makeOverlay("tolerance", "📏 Tolerance", body);
  if (!overlay) return;

  var inpDim = overlay.querySelector('[data-id="tolDim"]');
  var gridClass = overlay.querySelector('[data-id="tolClass"]');
  var gridIT = overlay.querySelector('[data-id="tolIT"]');
  var resultEl = overlay.querySelector("#tolResult");
  var btnHole = overlay.querySelector('[data-mode="hole"]');
  var btnShaft = overlay.querySelector('[data-mode="shaft"]');
  var isHole = true;
  var copyText = ""; // prostý text posledního platného výsledku pro Kopírovat

  function getGridVal(grid) {
    var a = grid.querySelector('.tol-g-active');
    return a ? a.dataset.val : null;
  }

  function initGrid(grid, onChange) {
    grid.addEventListener('click', function(e) {
      var btn = e.target.closest('.tol-g-btn');
      if (!btn) return;
      var prev = grid.querySelector('.tol-g-active');
      if (prev) prev.classList.remove('tol-g-active');
      btn.classList.add('tol-g-active');
      if (onChange) onChange();
    });
  }

  initGrid(gridClass, calc);
  initGrid(gridIT, calc);

  function setMode(hole) {
    isHole = hole;
    btnHole.classList.toggle("tol-active", hole);
    btnShaft.classList.toggle("tol-active", !hole);
    gridClass.innerHTML = hole ? holeBtns : shaftBtns;
    calc();
  }
  btnHole.addEventListener("click", function() { setMode(true); });
  btnShaft.addEventListener("click", function() { setMode(false); });

  // Úchylky s desetinnou částí (js/JS u lichého IT) bez zbytečných nul
  function sign(v) { var r = Math.round(v * 10) / 10; return r > 0 ? "+" + r : "" + r; }
  function mm(v) { return String(parseFloat(v.toFixed(4))); }

  function calc() {
    copyText = "";
    var dim = inpDim.value !== "" ? safeEvalMath(inpDim.value) : null;
    if (dim === null || !(dim > 0 && dim <= 500)) {
      resultEl.textContent = dim !== null ? "Rozměr mimo rozsah (0–500 mm)" : "Zadejte rozměr…";
      return;
    }
    var itGrade = parseInt(getGridVal(gridIT), 10); // 1..18
    var letter = getGridVal(gridClass);
    var r = deviations(letter, itGrade, dim);
    if (r.error) { resultEl.textContent = r.error; return; }

    var dimMax = dim + r.upper / 1000;
    var dimMin = dim + r.lower / 1000;
    var kind = isHole ? "Díra" : "Hřídel";
    var tolLabel = "Ø" + dim + " " + letter + itGrade;
    var tolMm = (r.tol / 1000).toFixed(4).replace(/0$/, '');

    copyText = kind + " " + tolLabel + " │ " + sign(r.upper) + " / " + sign(r.lower) + " µm │ max " +
      mm(dimMax) + " / min " + mm(dimMin) + " mm │ tolerance " + r.tol + " µm";

    resultEl.innerHTML =
      '<div class="tol-res-head"><span class="tol-res-kind ' + (isHole ? 'tol-kind-hole' : 'tol-kind-shaft') + '">' +
        kind + '</span> <strong>' + tolLabel + '</strong></div>' +
      '<div class="tol-res-cols">' +
        '<div class="tol-res-col">' +
          '<div><span>Horní úchylka</span><b>' + sign(r.upper) + ' µm</b></div>' +
          '<div><span>Dolní úchylka</span><b>' + sign(r.lower) + ' µm</b></div>' +
        '</div>' +
        '<div class="tol-res-col">' +
          '<div><span>Ø max</span><b>' + mm(dimMax) + ' mm</b></div>' +
          '<div><span>Ø min</span><b>' + mm(dimMin) + ' mm</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="tol-res-tol">Tolerance: <b>' + r.tol + ' µm</b> (' + tolMm + ' mm)</div>' +
      (r.note ? '<div class="tol-res-note">' + r.note + '</div>' : '');
  }

  inpDim.addEventListener("input", calc);

  overlay.querySelector(".cnc-btn-copy").addEventListener("click", function() {
    if (copyText) {
      navigator.clipboard.writeText(copyText).then(function() { showToast("Zkopírováno"); });
    }
  });
}
